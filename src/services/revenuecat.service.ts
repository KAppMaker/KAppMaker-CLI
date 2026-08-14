import { logger } from '../utils/logger.js';
import { loadConfig } from '../utils/config.js';

/**
 * RevenueCat REST API v2 client. No external CLI — plain fetch, same pattern as
 * gpc.service. Auth is a v2 secret API key (sk_…) from the RevenueCat dashboard
 * (Project settings → API keys → V2), stored as `revenuecatApiKey` in the
 * kappmaker config. Project-configuration endpoints are limited to 60 req/min,
 * which this sequential setup flow stays far under.
 */

const BASE_URL = 'https://api.revenuecat.com/v2';

let cachedApiKey: string | null = null;

export async function requireApiKey(): Promise<string> {
  if (cachedApiKey) return cachedApiKey;
  const config = await loadConfig();
  const key = config.revenuecatApiKey;
  if (!key) {
    logger.fatal('RevenueCat API key not configured.');
    logger.info('Create a secret API v2 key in the RevenueCat dashboard (Project settings → API keys → V2),');
    logger.info('then run: kappmaker config set revenuecatApiKey sk_...');
    process.exit(1);
  }
  cachedApiKey = key;
  return key;
}

interface ListResponse<T> {
  items: T[];
  next_page?: string | null;
}

async function request<T>(
  method: 'GET' | 'POST',
  pathname: string,
  body?: unknown,
): Promise<T> {
  const key = await requireApiKey();
  const response = await fetch(`${BASE_URL}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `RevenueCat API ${method} ${pathname} failed (HTTP ${response.status}): ${text.slice(0, 500)}`,
    );
  }
  return (text ? JSON.parse(text) : {}) as T;
}

/** Follow `next_page` cursors until the whole collection is loaded. */
async function listAll<T>(pathname: string): Promise<T[]> {
  const items: T[] = [];
  let page: string | null = `${pathname}${pathname.includes('?') ? '&' : '?'}limit=100`;
  while (page) {
    const res: ListResponse<T> & { next_page?: string | null } = await request('GET', page);
    items.push(...(res.items ?? []));
    // next_page is an absolute API path including /v2 — strip the prefix.
    page = res.next_page ? res.next_page.replace(/^\/?v2/, '') : null;
  }
  return items;
}

// ------------------------------------------------------------------ projects

export interface RcProject {
  id: string;
  name: string;
}

export async function listProjects(): Promise<RcProject[]> {
  return listAll<RcProject>('/projects');
}

// ---------------------------------------------------------------------- apps

export interface RcApp {
  id: string;
  name: string;
  type: string;
  app_store?: { bundle_id?: string };
  play_store?: { package_name?: string };
}

export async function listApps(projectId: string): Promise<RcApp[]> {
  return listAll<RcApp>(`/projects/${projectId}/apps`);
}

export async function createAppStoreApp(
  projectId: string,
  name: string,
  bundleId: string,
): Promise<RcApp> {
  return request('POST', `/projects/${projectId}/apps`, {
    name,
    type: 'app_store',
    app_store: { bundle_id: bundleId },
  });
}

export async function createPlayStoreApp(
  projectId: string,
  name: string,
  packageName: string,
): Promise<RcApp> {
  return request('POST', `/projects/${projectId}/apps`, {
    name,
    type: 'play_store',
    play_store: { package_name: packageName },
  });
}

// -------------------------------------------------------------- entitlements

export interface RcEntitlement {
  id: string;
  lookup_key: string;
  display_name: string;
}

export async function listEntitlements(projectId: string): Promise<RcEntitlement[]> {
  return listAll<RcEntitlement>(`/projects/${projectId}/entitlements`);
}

export async function createEntitlement(
  projectId: string,
  lookupKey: string,
  displayName: string,
): Promise<RcEntitlement> {
  return request('POST', `/projects/${projectId}/entitlements`, {
    lookup_key: lookupKey,
    display_name: displayName,
  });
}

export async function attachProductsToEntitlement(
  projectId: string,
  entitlementId: string,
  productIds: string[],
): Promise<void> {
  if (productIds.length === 0) return;
  await request('POST', `/projects/${projectId}/entitlements/${entitlementId}/actions/attach_products`, {
    product_ids: productIds,
  });
}

// ------------------------------------------------------------------ products

export interface RcProduct {
  id: string;
  store_identifier: string;
  app_id: string;
  type: string;
  display_name?: string | null;
}

export async function listProducts(projectId: string): Promise<RcProduct[]> {
  return listAll<RcProduct>(`/projects/${projectId}/products`);
}

export type RcProductType = 'subscription' | 'one_time' | 'consumable';

export async function createProduct(
  projectId: string,
  appId: string,
  storeIdentifier: string,
  type: RcProductType,
  displayName: string,
): Promise<RcProduct> {
  return request('POST', `/projects/${projectId}/products`, {
    app_id: appId,
    store_identifier: storeIdentifier,
    type,
    display_name: displayName,
  });
}

// ----------------------------------------------------------------- offerings

export interface RcOffering {
  id: string;
  lookup_key: string;
  display_name: string;
}

export async function listOfferings(projectId: string): Promise<RcOffering[]> {
  return listAll<RcOffering>(`/projects/${projectId}/offerings`);
}

export async function createOffering(
  projectId: string,
  lookupKey: string,
  displayName: string,
): Promise<RcOffering> {
  return request('POST', `/projects/${projectId}/offerings`, {
    lookup_key: lookupKey,
    display_name: displayName,
  });
}

// ------------------------------------------------------------------ packages

export interface RcPackage {
  id: string;
  lookup_key: string;
  display_name: string;
}

export async function listPackages(projectId: string, offeringId: string): Promise<RcPackage[]> {
  return listAll<RcPackage>(`/projects/${projectId}/offerings/${offeringId}/packages`);
}

export async function createPackage(
  projectId: string,
  offeringId: string,
  lookupKey: string,
  displayName: string,
): Promise<RcPackage> {
  return request('POST', `/projects/${projectId}/offerings/${offeringId}/packages`, {
    lookup_key: lookupKey,
    display_name: displayName,
  });
}

export async function attachProductsToPackage(
  projectId: string,
  packageId: string,
  productIds: string[],
): Promise<void> {
  if (productIds.length === 0) return;
  // Unlike the entitlement attach, packages take per-product eligibility.
  // "all" = no platform gating; RevenueCat serves the right store product to
  // each platform automatically because products are app-scoped.
  await request('POST', `/projects/${projectId}/packages/${packageId}/actions/attach_products`, {
    products: productIds.map((id) => ({ product_id: id, eligibility_criteria: 'all' })),
  });
}
