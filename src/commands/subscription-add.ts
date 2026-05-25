import path from 'node:path';
import fs from 'fs-extra';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { loadConfig } from '../utils/config.js';
import * as asc from '../services/asc.service.js';
import * as ascMoney from '../services/asc-monetization.service.js';
import * as gpc from '../services/gpc.service.js';
import * as gpcMoney from '../services/gpc-monetization.service.js';
import {
  subscriptionIds,
  isSubscriptionPeriod,
  type SubscriptionIds,
} from '../services/product-id.builder.js';
import type {
  AppStoreConfig,
  AppStoreSubscription,
  AppStoreSubscriptionGroup,
  AppStoreAvailability,
} from '../types/appstore.js';
import type {
  GooglePlayConfig,
  GooglePlaySubscription,
} from '../types/googleplay.js';

const GPC_CONFIG = 'Assets/googleplay-config.json';
const ASC_CONFIG = 'Assets/appstore-config.json';

export type AddPlatform = 'all' | 'ios' | 'android';

export interface SubscriptionAddOptions {
  period?: string;
  price?: string;
  platform?: AddPlatform;
  name?: string;
  description?: string;
  reviewScreenshot?: string;
  group?: string;
  groupName?: string;
  appName?: string;
  version?: string;
}

interface AppContext {
  appName: string;
  bundleId?: string;
  packageName?: string;
  defaultLocale: string;
  ascAppId?: string;
  ascGroupReferenceName?: string;
  ascGroupLocalizationName?: string;
  ascAvailability?: AppStoreAvailability;
  ascReviewScreenshot?: string;
}

async function readIfExists<T>(relPath: string): Promise<T | null> {
  const abs = path.resolve(relPath);
  if (!(await fs.pathExists(abs))) return null;
  try {
    return (await fs.readJson(abs)) as T;
  } catch {
    return null;
  }
}

async function detectContext(opts: SubscriptionAddOptions): Promise<AppContext> {
  const [gpcCfg, ascCfg] = await Promise.all([
    readIfExists<GooglePlayConfig>(GPC_CONFIG),
    readIfExists<AppStoreConfig>(ASC_CONFIG),
  ]);

  const appName = opts.appName ?? ascCfg?.app.name ?? gpcCfg?.app.name;

  if (!appName) {
    logger.fatal('Could not determine app name.');
    logger.info(
      'Pass --app-name <name> or run `kappmaker create-appstore-app` / `gpc setup` first to create a config.',
    );
    process.exit(1);
  }

  const groupRef = opts.group ?? ascCfg?.subscriptions?.groups?.[0]?.reference_name;
  // If the chosen group reference matches a config-defined group, inherit its
  // localized name (used when auto-creating the group on ASC).
  const matchingGroup = ascCfg?.subscriptions?.groups?.find(
    (g) => g.reference_name === groupRef,
  );
  const inheritedGroupName = matchingGroup?.localizations?.[0]?.name;

  return {
    appName,
    bundleId: ascCfg?.app.bundle_id,
    packageName: gpcCfg?.app.package_name,
    defaultLocale:
      ascCfg?.app.primary_locale ?? gpcCfg?.app.default_language ?? 'en-US',
    ascAppId: ascCfg?.app.id,
    ascGroupReferenceName: groupRef,
    ascGroupLocalizationName: inheritedGroupName,
    ascAvailability: ascCfg?.subscriptions?.availability,
    ascReviewScreenshot: ascCfg?.review_screenshot,
  };
}

export async function subscriptionAdd(options: SubscriptionAddOptions): Promise<void> {
  const period = options.period?.toLowerCase();
  if (!period || !isSubscriptionPeriod(period)) {
    logger.fatal('--period must be one of: weekly, monthly, twomonths, quarterly, semiannual, yearly');
    process.exit(1);
  }

  const price = options.price;
  if (!price || !/^\d+(\.\d+)?$/.test(price)) {
    logger.fatal('--price must be a positive number like 9.99');
    process.exit(1);
  }

  const platform: AddPlatform = options.platform ?? 'all';
  if (!['all', 'ios', 'android'].includes(platform)) {
    logger.fatal('--platform must be one of: all, ios, android');
    process.exit(1);
  }

  const version = options.version ? Number.parseInt(options.version, 10) : 1;
  if (!Number.isFinite(version) || version < 1) {
    logger.fatal('--version must be a positive integer (e.g. 1, 2, 3)');
    process.exit(1);
  }

  const ctx = await detectContext(options);
  const ids = subscriptionIds(period, price, ctx.appName, version);
  const displayName = options.name ?? ids.playListingTitle;
  const description = options.description ?? ids.defaultDescription;
  const reviewScreenshot = options.reviewScreenshot ?? ctx.ascReviewScreenshot;

  console.log('');
  console.log(chalk.bold('  Creating subscription:'));
  console.log(`    ${chalk.cyan('App:')}        ${ctx.appName}`);
  console.log(`    ${chalk.cyan('Period:')}     ${period} (${ids.periodLabel})`);
  console.log(`    ${chalk.cyan('Price:')}      $${price}`);
  console.log(`    ${chalk.cyan('Version:')}    v${version}`);
  console.log(`    ${chalk.cyan('Platform:')}   ${platform}`);
  console.log(`    ${chalk.cyan('Display:')}    ${displayName}`);
  console.log(`    ${chalk.cyan('Description:')} ${description}`);
  if (platform !== 'android') {
    console.log(`    ${chalk.cyan('ASC ID:')}     ${ids.ascProductId}`);
    const resolvedGroup = ctx.ascGroupReferenceName ?? chalk.gray('(none — will skip)');
    const resolvedGroupName = options.groupName ?? ctx.ascGroupLocalizationName ?? 'Premium Access';
    console.log(`    ${chalk.cyan('ASC group:')}  ${resolvedGroup}  → name "${resolvedGroupName}" (created if missing)`);
  }
  if (platform !== 'ios') {
    console.log(`    ${chalk.cyan('Play ID:')}    ${ids.playProductId}  (base plan: ${ids.playBasePlanId})`);
  }
  if (reviewScreenshot) {
    console.log(`    ${chalk.cyan('Review img:')} ${reviewScreenshot}`);
  }
  console.log('');

  let pushed = 0;

  if (platform === 'all' || platform === 'android') {
    if (await pushToPlay(ctx, ids, price, displayName, description)) pushed++;
  }
  if (platform === 'all' || platform === 'ios') {
    const groupName = options.groupName ?? ctx.ascGroupLocalizationName ?? 'Premium Access';
    if (await pushToAsc(ctx, ids, price, displayName, description, reviewScreenshot, groupName)) pushed++;
  }

  console.log('');
  if (pushed === 0) {
    logger.fatal('No subscriptions were pushed (all platforms skipped).');
    process.exit(1);
  }
  logger.success(`Pushed subscription to ${pushed} platform${pushed === 1 ? '' : 's'}.`);
}

async function pushToPlay(
  ctx: AppContext,
  ids: SubscriptionIds,
  price: string,
  displayName: string,
  description: string,
): Promise<boolean> {
  if (!ctx.packageName) {
    logger.warn('Skipping Google Play — no package name (need Assets/googleplay-config.json).');
    return false;
  }
  const userConfig = await loadConfig();
  if (!userConfig.googleServiceAccountPath) {
    logger.warn('Skipping Google Play — googleServiceAccountPath not set.');
    logger.info('Set it with: kappmaker config set googleServiceAccountPath <path-to-json>');
    return false;
  }

  logger.step(1, 1, 'Pushing to Google Play');
  await gpc.validateServiceAccount();

  const state = await gpc.fetchAppState(ctx.packageName);
  if (state && !state.hasUploadedBuild) {
    logger.warn('Skipping Google Play — no build uploaded to any track.');
    logger.info('Run: kappmaker publish --platform android --track internal');
    return false;
  }
  const playLang = state?.defaultLanguage ?? ctx.defaultLocale;

  const sub: GooglePlaySubscription = {
    product_id: ids.playProductId,
    listings: [{ locale: playLang, title: displayName, description }],
    base_plans: [{
      base_plan_id: ids.playBasePlanId,
      billing_period: ids.playBillingPeriod,
      regional_configs: [{ region_code: 'US', price, currency_code: 'USD' }],
    }],
  };

  await gpcMoney.setupSubscriptions(ctx.packageName, [sub], playLang);
  return true;
}

async function pushToAsc(
  ctx: AppContext,
  ids: SubscriptionIds,
  price: string,
  displayName: string,
  description: string,
  reviewScreenshot: string | undefined,
  groupName: string,
): Promise<boolean> {
  if (!ctx.bundleId) {
    logger.warn('Skipping App Store — no bundle ID detected.');
    return false;
  }
  const userConfig = await loadConfig();
  if (!userConfig.appleId || !userConfig.ascKeyId) {
    logger.warn('Skipping App Store — asc auth not configured.');
    logger.info('Run: kappmaker config appstore-defaults --init');
    return false;
  }

  logger.step(1, 1, 'Pushing to App Store Connect');
  await asc.validateAscInstalled();
  await asc.validateAscAuth();

  let appId: string | null | undefined = ctx.ascAppId;
  if (!appId) {
    appId = await asc.findAppByBundleId(ctx.bundleId);
  }
  if (!appId) {
    logger.warn(`Skipping App Store — could not find app for bundle ID ${ctx.bundleId}.`);
    logger.info('Run `kappmaker create-appstore-app` first.');
    return false;
  }

  const groupRef = ctx.ascGroupReferenceName;
  if (!groupRef) {
    logger.warn('Skipping App Store — no subscription group found.');
    logger.info('Run `kappmaker create-appstore-app` first to create a group, or pass --group <ref>.');
    return false;
  }

  const sub: AppStoreSubscription = {
    ref_name: ids.ascRefName,
    product_id: ids.ascProductId,
    subscription_period: ids.ascSubscriptionPeriod,
    family_sharable: false,
    prices: [{ territory: 'USA', price }],
    localizations: [{
      locale: ctx.defaultLocale,
      name: displayName,
      description,
    }],
    review_screenshot: reviewScreenshot,
  };

  // Always include localizations so the group gets a proper App-Store-facing
  // name when asc auto-creates it. If the group already exists with a
  // localization for this locale, the duplicate-create call gracefully fails
  // (allowFailure: true in setupSubscriptions) — existing name stays intact.
  const group: AppStoreSubscriptionGroup = {
    reference_name: groupRef,
    localizations: [{
      locale: ctx.defaultLocale,
      name: groupName,
      custom_app_name: '',
    }],
    subscriptions: [sub],
  };

  await ascMoney.setupSubscriptions(appId, group, ctx.ascAvailability, {
    defaultReviewScreenshot: reviewScreenshot,
  });
  return true;
}
