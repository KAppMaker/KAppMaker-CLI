import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveOrigin } from '../../services/army.service.js';

/** fetch, narrowed to what this file and the installer download use (tests pass a fake). */
export type HttpFetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{
  ok: boolean;
  status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

/**
 * What the buyer bought, from their own licence, via the read-only
 * POST /api/license/check (activates nothing, never returns the key). The
 * server-side activation in install.sh stays the real gate.
 */

export type Product = 'plugin' | 'app-army' | 'app-army-mentor' | 'build-with-me';

export interface Entitlement {
  product: Product | 'unknown';
  /** Why we could not tell, in plain words (only when product is unknown or the check failed). */
  note?: string;
  valid: boolean;
  activationsUsed?: number;
  activationsMax?: number;
}

export interface LicenceInput {
  install_code?: string;
  licence_key_file?: string;
}

const KEY = /^[A-Za-z0-9-]{8,64}$/;
const CODE = /^[A-Za-z0-9-]{4,32}$/;

export class LicenceError extends Error {}

/** Reads the key from the buyer's own file. Never returned, logged or put in an argument. */
export function readKeyFile(file: string): string {
  const p = path.resolve(file.replace(/^~(?=$|\/)/, os.homedir()));
  let key: string;
  try {
    key = fs.readFileSync(p, 'utf8').trim();
  } catch {
    throw new LicenceError(`No licence key file at ${p}.`);
  }
  if (!KEY.test(key)) throw new LicenceError(`${p} does not hold a licence key (one line, like KAM-XXXXX-XXXXX-XXXXX-XXXXX).`);
  return key;
}

export function validCode(code: string): string {
  const c = code.trim();
  if (!CODE.test(c)) throw new LicenceError('That install code does not look right. Copy it from "My purchase" on kappmaker.com (it looks like ABCD-EFGH-JKLM).');
  return c;
}

const REASONS: Record<string, string> = {
  invalid_key: 'That licence key is not known. Check you copied it whole from "My purchase".',
  revoked: 'This licence was refunded or revoked, so it cannot install anything.',
  invalid_code: 'That install code is not known. Open "My purchase" for a fresh one.',
  code_expired: 'That install code has expired (they last 30 minutes). Open "My purchase" for a fresh one.',
  activation_limit: 'This licence is already installed on its maximum number of machines. Remove an old one on "My purchase".',
};

export async function checkEntitlement(
  input: { key?: string; code?: string },
  fetchImpl: HttpFetch = fetch as unknown as HttpFetch,
  origin = resolveOrigin(),
): Promise<Entitlement> {
  if (!input.key && !input.code) return { product: 'plugin', valid: true };
  let res: Awaited<ReturnType<HttpFetch>>;
  try {
    res = await fetchImpl(`${origin}/api/license/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'kappmaker-cli' },
      body: JSON.stringify(input.code ? { code: input.code } : { key: input.key }),
    });
  } catch {
    return { product: 'unknown', valid: true, note: `Could not reach ${new URL(origin).host} to read your purchase; the installer checks it when it starts.` };
  }
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(Buffer.from(await res.arrayBuffer()).toString('utf8'));
  } catch { /* not JSON */ }
  if (res.status === 404 || res.status === 405) {
    return { product: 'unknown', valid: true, note: 'Your purchase could not be read ahead of time; the installer checks it when it starts.' };
  }
  if (!res.ok || body.valid !== true) {
    const reason = String(body.reason ?? '');
    return { product: 'unknown', valid: false, note: REASONS[reason] ?? `The licence check failed (HTTP ${res.status}).` };
  }
  const tier = String(body.tier ?? '');
  const product: Product = tier === 'app-army-mentor' || tier === 'build-with-me' || tier === 'app-army' ? tier : 'plugin';
  return {
    product, valid: true,
    activationsUsed: Number(body.activations_used ?? NaN), activationsMax: Number(body.activations_max ?? NaN),
  };
}

/** Plain name of what they bought (only ever their own product). */
export function productName(p: Entitlement['product']): string {
  return {
    plugin: 'App Army for Claude Code (the plugin)', 'app-army': 'App Army', 'app-army-mentor': 'App Army with Mentor',
    'build-with-me': 'App Army with Build With Me', unknown: 'your App Army purchase',
  }[p];
}

export const isKit = (p: Entitlement['product']): boolean => p !== 'plugin';
export const hasMentorPack = (p: Entitlement['product']): boolean => p === 'app-army-mentor' || p === 'build-with-me';
