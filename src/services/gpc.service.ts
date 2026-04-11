import fs from 'fs-extra';
import path from 'node:path';
import { createSign } from 'node:crypto';
import ora from 'ora';
import { logger } from '../utils/logger.js';
import { loadConfig } from '../utils/config.js';
import type {
  GooglePlayAppDetails,
  GooglePlayListing,
  GooglePlayDataSafetyForm,
} from '../types/googleplay.js';

// ── Constants ────────────────────────────────────────────────────────

const API_BASE = 'https://androidpublisher.googleapis.com/androidpublisher/v3';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

export const PLAY_CONSOLE_URL = 'https://play.google.com/console/u/0/developers';

// ── Service account + JWT + access token ────────────────────────────

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id?: string;
  token_uri?: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function loadServiceAccount(): Promise<ServiceAccount> {
  const config = await loadConfig();
  const resolved = path.resolve(
    config.googleServiceAccountPath.startsWith('~')
      ? config.googleServiceAccountPath.replace(/^~/, process.env.HOME ?? '')
      : config.googleServiceAccountPath,
  );
  if (!(await fs.pathExists(resolved))) {
    logger.fatal(`Google service account file not found: ${resolved}`);
    logger.info('Set it with: kappmaker config set googleServiceAccountPath <path-to-json>');
    logger.info('Create one at: https://console.cloud.google.com/iam-admin/serviceaccounts');
    process.exit(1);
  }
  const sa = await fs.readJson(resolved) as Partial<ServiceAccount>;
  if (!sa.client_email || !sa.private_key) {
    logger.fatal(`Invalid service account JSON at ${resolved}: missing client_email or private_key`);
    process.exit(1);
  }
  return sa as ServiceAccount;
}

function base64Url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

function buildJwt(sa: ServiceAccount): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: sa.client_email,
    scope: SCOPE,
    aud: sa.token_uri ?? TOKEN_URL,
    exp: now + 3600,
    iat: now,
  };
  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claim))}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  const signature = signer.sign(sa.private_key).toString('base64url');
  return `${unsigned}.${signature}`;
}

export async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }
  const sa = await loadServiceAccount();
  const jwt = buildJwt(sa);
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    logger.fatal(`Failed to obtain Google access token: ${response.status} ${body}`);
    process.exit(1);
  }
  const data = await response.json() as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

// ── HTTP helper ──────────────────────────────────────────────────────

export interface ApiRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  query?: Record<string, string | undefined>;
  body?: unknown;
  /** Swallow non-2xx responses and return null instead of exiting. */
  allowFailure?: boolean;
  label?: string;
}

export interface ApiResponse<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
}

export async function apiRequest<T = unknown>(options: ApiRequestOptions): Promise<ApiResponse<T>> {
  const token = await getAccessToken();
  const label = options.label ?? `${options.method} ${options.path}`;
  const spinner = ora({ text: label, indent: 4 }).start();

  const url = new URL(`${API_BASE}${options.path}`);
  if (options.query) {
    for (const [k, v] of Object.entries(options.query)) {
      if (v !== undefined) url.searchParams.set(k, v);
    }
  }

  try {
    const response = await fetch(url.toString(), {
      method: options.method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    const text = await response.text();
    let data: T | null = null;
    if (text) {
      try {
        data = JSON.parse(text) as T;
      } catch {
        data = null;
      }
    }

    if (!response.ok) {
      spinner.fail(label);
      const message = (data as { error?: { message?: string } } | null)?.error?.message ?? text ?? response.statusText;
      if (options.allowFailure) {
        logger.warn(`${label}: ${response.status} ${message}`);
        return { ok: false, status: response.status, data, error: message };
      }
      logger.error(`${label}: ${response.status} ${message}`);
      process.exit(1);
    }

    spinner.succeed(label);
    return { ok: true, status: response.status, data };
  } catch (error) {
    spinner.fail(label);
    const message = error instanceof Error ? error.message : String(error);
    if (options.allowFailure) {
      logger.warn(`${label}: ${message}`);
      return { ok: false, status: 0, data: null, error: message };
    }
    logger.error(message);
    process.exit(1);
  }
}

// ── App existence probe (side-effect-free) ──────────────────────────

/**
 * Probe whether an app exists on Play Console WITHOUT starting an edit.
 * Uses GET /inappproducts which requires the app to exist but doesn't mutate
 * state. Returns true on 200, false on 404, exits fatal on any other error.
 */
export async function checkAppExists(packageName: string): Promise<boolean> {
  const result = await apiRequest({
    method: 'GET',
    path: `/applications/${encodeURIComponent(packageName)}/inappproducts`,
    label: `Checking ${packageName} on Play Console`,
    allowFailure: true,
  });
  if (result.ok) return true;
  if (result.status === 404) return false;
  logger.fatal(`Play Console probe failed: ${result.status} ${result.error ?? ''}`);
  process.exit(1);
}

// ── Validation ───────────────────────────────────────────────────────

export async function validateServiceAccount(): Promise<void> {
  await loadServiceAccount(); // throws fatal if missing/invalid
  try {
    await getAccessToken();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.fatal(`Unable to authenticate with Google Play: ${message}`);
    process.exit(1);
  }
}

// ── Edit transaction helpers ─────────────────────────────────────────

export interface AppEdit {
  id: string;
  expiryTimeSeconds?: string;
}

export async function insertEdit(packageName: string): Promise<string> {
  const result = await apiRequest<AppEdit>({
    method: 'POST',
    path: `/applications/${encodeURIComponent(packageName)}/edits`,
    body: {},
    label: `Starting Play Console edit for ${packageName}`,
    allowFailure: true,
  });

  if (!result.ok) {
    if (result.status === 404) {
      logger.fatal(`App "${packageName}" not found on Google Play Console.`);
      logger.info('Apps must be created manually in Play Console before configuring them.');
      logger.info(`Create it at: ${PLAY_CONSOLE_URL}`);
      logger.info('Then rerun this command.');
      process.exit(1);
    }
    logger.fatal(`Failed to start Play Console edit: ${result.error ?? 'unknown error'}`);
    process.exit(1);
  }

  if (!result.data?.id) {
    logger.fatal('Play Console edit created but no id returned.');
    process.exit(1);
  }
  return result.data.id;
}

export async function commitEdit(packageName: string, editId: string): Promise<void> {
  await apiRequest({
    method: 'POST',
    path: `/applications/${encodeURIComponent(packageName)}/edits/${editId}:commit`,
    label: 'Committing Play Console edit',
    allowFailure: true,
  });
}

export async function withEdit<T>(
  packageName: string,
  fn: (editId: string) => Promise<T>,
): Promise<T> {
  const editId = await insertEdit(packageName);
  const result = await fn(editId);
  await commitEdit(packageName, editId);
  return result;
}

// ── App details ──────────────────────────────────────────────────────

export async function updateAppDetails(
  packageName: string,
  editId: string,
  defaultLanguage: string,
  details: GooglePlayAppDetails,
): Promise<void> {
  const body: Record<string, unknown> = { defaultLanguage };
  if (details.contact_website) body.contactWebsite = details.contact_website;
  if (details.contact_email) body.contactEmail = details.contact_email;
  if (details.contact_phone) body.contactPhone = details.contact_phone;

  await apiRequest({
    method: 'PUT',
    path: `/applications/${encodeURIComponent(packageName)}/edits/${editId}/details`,
    body,
    label: 'Updating app details (default language + contact)',
    allowFailure: true,
  });
}

// ── Store listings ───────────────────────────────────────────────────

export async function updateListing(
  packageName: string,
  editId: string,
  listing: GooglePlayListing,
): Promise<void> {
  const body: Record<string, unknown> = { language: listing.locale };
  if (listing.title) body.title = listing.title;
  if (listing.short_description) body.shortDescription = listing.short_description;
  if (listing.full_description) body.fullDescription = listing.full_description;
  if (listing.video) body.video = listing.video;

  await apiRequest({
    method: 'PUT',
    path: `/applications/${encodeURIComponent(packageName)}/edits/${editId}/listings/${encodeURIComponent(listing.locale)}`,
    body,
    label: `Updating listing (${listing.locale})`,
    allowFailure: true,
  });
}

// ── Data safety (standalone, not inside edit) ────────────────────────

export async function updateDataSafety(
  packageName: string,
  safetyLabels: GooglePlayDataSafetyForm,
): Promise<void> {
  await apiRequest({
    method: 'POST',
    path: `/applications/${encodeURIComponent(packageName)}/dataSafety`,
    body: safetyLabels,
    label: 'Updating data safety declaration',
    allowFailure: true,
  });
}
