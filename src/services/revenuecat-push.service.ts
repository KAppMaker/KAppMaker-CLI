import path from 'node:path';
import fs from 'fs-extra';
import { logger } from '../utils/logger.js';
import * as rc from './revenuecat.service.js';
import { loadConfig } from '../utils/config.js';
import type { RevenueCatConfig } from '../types/revenuecat.js';

/**
 * Quick-add push path: `subscription add` / `iap add` create ONE new product and
 * this mirrors it into RevenueCat — connect the store products, attach the
 * entitlement, and expose it as a package so a paywall can actually serve it.
 * Idempotent like the store pushes: existing records are found, not duplicated.
 */

const RC_CONFIG = 'Assets/revenuecat-config.json';

export interface RcPushContext {
  projectId: string;
  iosAppId?: string;
  androidAppId?: string;
}

export async function hasRevenueCatConfig(): Promise<boolean> {
  return fs.pathExists(path.resolve(RC_CONFIG));
}

/**
 * Resolve project + app IDs: prefer the saved config, fall back to the API.
 * Returns null (with a logged reason) when RevenueCat isn't usable — the
 * quick-add treats that as "skip", not "fail", matching the store pushes.
 */
export async function resolveContext(
  bundleId: string | undefined,
  packageName: string | undefined,
): Promise<RcPushContext | null> {
  // Keys are project-scoped, so resolve per app (env → per-app map by bundle
  // ID → global fallback) rather than demanding one global key.
  const apiKey = await rc.resolveApiKey(bundleId);
  if (!apiKey) {
    logger.warn('Skipping RevenueCat — no API key for this app.');
    logger.info('Run `kappmaker revenuecat setup --api-key sk_...` once (per-project key, saved for this app),');
    logger.info('or set a global fallback: kappmaker config set revenuecatApiKey sk_...');
    return null;
  }
  const userConfig = await loadConfig();

  const saved = (await hasRevenueCatConfig())
    ? ((await fs.readJson(path.resolve(RC_CONFIG))) as RevenueCatConfig)
    : null;

  let projectId = saved?.project_id || userConfig.revenuecatProjectId;
  if (!projectId) {
    const projects = await rc.listProjects();
    if (projects.length === 1) {
      projectId = projects[0].id;
    } else {
      logger.warn('Skipping RevenueCat — could not resolve a project.');
      logger.info('Run `kappmaker revenuecat setup` first, or set: kappmaker config set revenuecatProjectId proj...');
      return null;
    }
  }

  let iosAppId = saved?.app.ios_app_id;
  let androidAppId = saved?.app.android_app_id;
  if (!iosAppId || !androidAppId) {
    const apps = await rc.listApps(projectId);
    if (!iosAppId && bundleId) {
      iosAppId = apps.find((a) => a.type === 'app_store' && a.app_store?.bundle_id === bundleId)?.id;
    }
    if (!androidAppId && packageName) {
      androidAppId = apps.find((a) => a.type === 'play_store' && a.play_store?.package_name === packageName)?.id;
    }
  }
  if (!iosAppId && !androidAppId) {
    logger.warn('Skipping RevenueCat — no matching apps in the project.');
    logger.info('Run `kappmaker revenuecat setup` to create them.');
    return null;
  }

  return { projectId, iosAppId, androidAppId };
}

async function findOrCreateEntitlement(
  projectId: string,
  lookupKey: string,
  displayName: string,
): Promise<string> {
  const existing = await rc.listEntitlements(projectId);
  const found = existing.find((e) => e.lookup_key === lookupKey);
  if (found) return found.id;
  const created = await rc.createEntitlement(projectId, lookupKey, displayName);
  return created.id;
}

async function findOrCreateOffering(
  projectId: string,
  lookupKey: string,
  displayName: string,
): Promise<string> {
  const existing = await rc.listOfferings(projectId);
  const found = existing.find((o) => o.lookup_key === lookupKey);
  if (found) return found.id;
  const created = await rc.createOffering(projectId, lookupKey, displayName);
  return created.id;
}

async function connectProduct(
  projectId: string,
  appId: string | undefined,
  storeIdentifier: string,
  type: rc.RcProductType,
  displayName: string,
): Promise<string | null> {
  if (!appId || !storeIdentifier) return null;
  const existing = await rc.listProducts(projectId);
  const found = existing.find((p) => p.app_id === appId && p.store_identifier === storeIdentifier);
  if (found) {
    logger.info(`RevenueCat product "${storeIdentifier}" already connected.`);
    return found.id;
  }
  const created = await rc.createProduct(projectId, appId, storeIdentifier, type, displayName);
  return created.id;
}

async function attachToPackage(
  projectId: string,
  offeringId: string,
  packageLookupKey: string,
  packageDisplayName: string,
  productIds: string[],
): Promise<void> {
  const packages = await rc.listPackages(projectId, offeringId);
  let packageId = packages.find((p) => p.lookup_key === packageLookupKey)?.id;
  if (!packageId) {
    packageId = (await rc.createPackage(projectId, offeringId, packageLookupKey, packageDisplayName)).id;
  }
  try {
    await rc.attachProductsToPackage(projectId, packageId, productIds);
  } catch (error) {
    const message = (error as Error).message;
    if (!message.includes('already')) throw error;
  }
}

const PACKAGE_KEY_BY_PERIOD: Record<string, string> = {
  weekly: '$rc_weekly',
  monthly: '$rc_monthly',
  twomonths: '$rc_two_month',
  quarterly: '$rc_three_month',
  semiannual: '$rc_six_month',
  yearly: '$rc_annual',
};

export interface RcSubscriptionPush {
  period: string;
  displayName: string;
  ascProductId: string;
  playProductId: string;
  playBasePlanId: string;
}

export async function pushSubscription(
  ctx: RcPushContext,
  sub: RcSubscriptionPush,
): Promise<void> {
  const entitlementId = await findOrCreateEntitlement(ctx.projectId, 'premium', 'Premium');

  const productIds = (
    await Promise.all([
      connectProduct(ctx.projectId, ctx.iosAppId, sub.ascProductId, 'subscription', sub.displayName),
      connectProduct(
        ctx.projectId,
        ctx.androidAppId,
        // Play subscriptions are identified as productId:basePlanId in RevenueCat.
        sub.playBasePlanId ? `${sub.playProductId}:${sub.playBasePlanId}` : sub.playProductId,
        'subscription',
        sub.displayName,
      ),
    ])
  ).filter((id): id is string => !!id);

  if (productIds.length === 0) {
    logger.warn('RevenueCat: no products connected (no matching app for either platform).');
    return;
  }

  try {
    await rc.attachProductsToEntitlement(ctx.projectId, entitlementId, productIds);
  } catch (error) {
    if (!(error as Error).message.includes('already')) throw error;
  }

  const offeringId = await findOrCreateOffering(ctx.projectId, 'default', 'Default Offering');
  const packageKey = PACKAGE_KEY_BY_PERIOD[sub.period] ?? sub.period;
  await attachToPackage(ctx.projectId, offeringId, packageKey, sub.displayName, productIds);
  logger.success(`RevenueCat: "${sub.displayName}" live in offering "default" (package ${packageKey}).`);
}

export interface RcIapPush {
  credits: number;
  displayName: string;
  productId: string;
}

export async function pushIap(ctx: RcPushContext, iap: RcIapPush): Promise<void> {
  const entitlementId = await findOrCreateEntitlement(ctx.projectId, 'credit_pack_access', 'Credit Pack Access');

  const productIds = (
    await Promise.all([
      connectProduct(ctx.projectId, ctx.iosAppId, iap.productId, 'consumable', iap.displayName),
      connectProduct(ctx.projectId, ctx.androidAppId, iap.productId, 'one_time', iap.displayName),
    ])
  ).filter((id): id is string => !!id);

  if (productIds.length === 0) {
    logger.warn('RevenueCat: no products connected (no matching app for either platform).');
    return;
  }

  try {
    await rc.attachProductsToEntitlement(ctx.projectId, entitlementId, productIds);
  } catch (error) {
    if (!(error as Error).message.includes('already')) throw error;
  }

  const offeringId = await findOrCreateOffering(ctx.projectId, 'credits_pack', 'Credit Packs');
  await attachToPackage(ctx.projectId, offeringId, `credit_pack_${iap.credits}`, iap.displayName, productIds);
  logger.success(`RevenueCat: "${iap.displayName}" live in offering "credits_pack".`);
}
