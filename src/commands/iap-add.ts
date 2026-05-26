import path from 'node:path';
import fs from 'fs-extra';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { loadConfig } from '../utils/config.js';
import * as asc from '../services/asc.service.js';
import * as ascMoney from '../services/asc-monetization.service.js';
import * as gpc from '../services/gpc.service.js';
import * as gpcMoney from '../services/gpc-monetization.service.js';
import * as adapty from '../services/adapty.service.js';
import { creditPackProductId } from '../services/credit-pack.defaults.js';
import { normalizeAppName } from '../services/product-id.builder.js';
import type {
  AppStoreConfig,
  AppStoreInAppPurchase,
} from '../types/appstore.js';
import type {
  GooglePlayConfig,
  GooglePlayInAppProduct,
} from '../types/googleplay.js';
import type { AdaptyConfig, AdaptyProduct } from '../types/adapty.js';
import type { AddPlatform } from './subscription-add.js';

const GPC_CONFIG = 'Assets/googleplay-config.json';
const ASC_CONFIG = 'Assets/appstore-config.json';
const ADAPTY_CONFIG = 'Assets/adapty-config.json';

export interface IapAddOptions {
  credits?: string;
  price?: string;
  platform?: AddPlatform;
  name?: string;
  description?: string;
  reviewScreenshot?: string;
  appName?: string;
  bundleId?: string;
  packageName?: string;
  productVersion?: string;
}

interface AppContext {
  appName: string;
  bundleId?: string;
  packageName?: string;
  defaultLocale: string;
  ascAppId?: string;
  ascReviewScreenshot?: string;
  adaptyAppId?: string;
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

async function detectContext(opts: IapAddOptions): Promise<AppContext> {
  const [gpcCfg, ascCfg, adaptyCfg] = await Promise.all([
    readIfExists<GooglePlayConfig>(GPC_CONFIG),
    readIfExists<AppStoreConfig>(ASC_CONFIG),
    readIfExists<AdaptyConfig>(ADAPTY_CONFIG),
  ]);

  const appName =
    opts.appName ?? ascCfg?.app.name ?? gpcCfg?.app.name ?? adaptyCfg?.app.title;

  if (!appName) {
    logger.fatal('Could not determine app name.');
    logger.info(
      'Pass --app-name <name> or run `kappmaker create-appstore-app` / `gpc setup` / `adapty setup` first to create a config.',
    );
    process.exit(1);
  }

  return {
    appName,
    bundleId: opts.bundleId ?? ascCfg?.app.bundle_id ?? adaptyCfg?.app.bundle_id,
    packageName: opts.packageName ?? gpcCfg?.app.package_name ?? adaptyCfg?.app.package_id,
    defaultLocale:
      ascCfg?.app.primary_locale ?? gpcCfg?.app.default_language ?? 'en-US',
    ascAppId: ascCfg?.app.id,
    ascReviewScreenshot: ascCfg?.review_screenshot,
    adaptyAppId: adaptyCfg?.app.app_id,
  };
}

interface IapIds {
  productId: string;
  ascRefName: string;
  displayName: string;
  description: string;
}

function buildIapIds(
  credits: number,
  price: string,
  appName: string,
  userName: string | undefined,
  userDescription: string | undefined,
  version: number,
): IapIds {
  const appNameLower = normalizeAppName(appName);
  const localizedName = userName ?? `${credits} Credit Pack`;
  const baseId = creditPackProductId(credits, price, appNameLower);
  // v1 stays unsuffixed for back-compat with the existing template defaults.
  const productId = version > 1 ? `${baseId}_v${version}` : baseId;
  return {
    productId,
    ascRefName: `${appName} ${localizedName} v${version} (${price})`,
    displayName: localizedName,
    description: userDescription ?? `${credits} credits to use in the app.`,
  };
}

export async function iapAdd(options: IapAddOptions): Promise<void> {
  const creditsRaw = options.credits;
  const credits = creditsRaw ? Number.parseInt(creditsRaw, 10) : NaN;
  if (!Number.isFinite(credits) || credits <= 0) {
    logger.fatal('--credits must be a positive integer (e.g. 50)');
    process.exit(1);
  }

  const price = options.price;
  if (!price || !/^\d+(\.\d+)?$/.test(price)) {
    logger.fatal('--price must be a positive number like 14.99');
    process.exit(1);
  }

  const platform: AddPlatform = options.platform ?? 'all';
  if (!['all', 'ios', 'android'].includes(platform)) {
    logger.fatal('--platform must be one of: all, ios, android');
    process.exit(1);
  }

  const version = options.productVersion ? Number.parseInt(options.productVersion, 10) : 1;
  if (!Number.isFinite(version) || version < 1) {
    logger.fatal('--product-version must be a positive integer (e.g. 1, 2, 3)');
    process.exit(1);
  }

  const ctx = await detectContext(options);
  const ids = buildIapIds(credits, price, ctx.appName, options.name, options.description, version);
  const reviewScreenshot = await resolveReviewScreenshot(
    options.reviewScreenshot ?? ctx.ascReviewScreenshot,
  );

  console.log('');
  console.log(chalk.bold('  Creating credit-pack IAP:'));
  console.log(`    ${chalk.cyan('App:')}        ${ctx.appName}`);
  console.log(`    ${chalk.cyan('Credits:')}    ${credits}`);
  console.log(`    ${chalk.cyan('Price:')}      $${price}`);
  console.log(`    ${chalk.cyan('Version:')}    v${version}`);
  console.log(`    ${chalk.cyan('Platform:')}   ${platform}`);
  console.log(`    ${chalk.cyan('Product ID:')} ${ids.productId}`);
  console.log(`    ${chalk.cyan('Display:')}    ${ids.displayName}`);
  console.log(`    ${chalk.cyan('Description:')} ${ids.description}`);
  if (reviewScreenshot) {
    console.log(`    ${chalk.cyan('Review img:')} ${reviewScreenshot}`);
  }
  console.log('');

  let pushed = 0;

  if (platform === 'all' || platform === 'android') {
    if (await pushToPlay(ctx, ids, credits, price)) pushed++;
  }
  if (platform === 'all' || platform === 'ios') {
    if (await pushToAsc(ctx, ids, price, reviewScreenshot)) pushed++;
  }
  if (platform === 'all') {
    if (await pushToAdapty(ctx, ids, credits, price)) pushed++;
  }

  console.log('');
  if (pushed === 0) {
    logger.fatal('No IAPs were pushed (all platforms skipped).');
    process.exit(1);
  }
  logger.success(`Pushed IAP to ${pushed} platform${pushed === 1 ? '' : 's'}.`);
}

async function pushToPlay(
  ctx: AppContext,
  ids: IapIds,
  credits: number,
  price: string,
): Promise<boolean> {
  if (!ctx.packageName) {
    logger.warn('Skipping Google Play — no package name.');
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

  const iap: GooglePlayInAppProduct = {
    sku: ids.productId,
    purchase_type: 'managed',
    default_language: ctx.defaultLocale,
    listings: [{
      locale: ctx.defaultLocale,
      title: ids.displayName,
      description: ids.description,
    }],
    default_price: { region_code: 'US', price, currency_code: 'USD' },
    credits,
  };

  await gpcMoney.setupInAppProducts(ctx.packageName, [iap], { recreateStuck: false });
  return true;
}

async function pushToAsc(
  ctx: AppContext,
  ids: IapIds,
  price: string,
  reviewScreenshot: string | undefined,
): Promise<boolean> {
  if (!ctx.bundleId) {
    logger.warn('Skipping App Store — no bundle ID.');
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

  const iap: AppStoreInAppPurchase = {
    type: 'CONSUMABLE',
    ref_name: ids.ascRefName,
    product_id: ids.productId,
    family_sharable: false,
    prices: [{ territory: 'USA', price }],
    localizations: [{
      locale: ctx.defaultLocale,
      name: ids.displayName,
      description: ids.description,
    }],
    review_screenshot: reviewScreenshot,
  };

  await ascMoney.setupInAppPurchases(appId, [iap], {
    defaultReviewScreenshot: reviewScreenshot,
  });
  return true;
}

async function pushToAdapty(
  ctx: AppContext,
  ids: IapIds,
  credits: number,
  price: string,
): Promise<boolean> {
  if (!ctx.bundleId || !ctx.packageName) {
    logger.warn('Skipping Adapty — needs both bundle ID and package name.');
    return false;
  }

  logger.step(1, 1, 'Pushing to Adapty');
  await adapty.validateAdaptyInstalled();
  await adapty.validateAdaptyAuth();

  let appId = ctx.adaptyAppId;
  if (!appId) {
    const existing = await adapty.findAppByBundleId(ctx.bundleId);
    if (existing) appId = existing.id;
  }
  if (!appId) {
    logger.warn(`Skipping Adapty — could not find app for bundle ID ${ctx.bundleId}.`);
    logger.info('Run `kappmaker adapty setup` first.');
    return false;
  }

  // Credit packs default to "credit_pack_access" — fall back to first level if not present.
  const levels = await adapty.listAccessLevels(appId);
  const accessLevelId =
    levels.find((l) => l.sdk_id === 'credit_pack_access')?.id ?? levels[0]?.id;
  if (!accessLevelId) {
    logger.warn('Skipping Adapty — no access level found.');
    logger.info('Run `kappmaker adapty setup` to create one (default: "credit_pack_access").');
    return false;
  }

  const title = ids.ascRefName;
  const existingProducts = await adapty.listProducts(appId);
  if (existingProducts.some((p) => p.title === title)) {
    logger.info(`Adapty product "${title}" already exists, skipping.`);
    return true;
  }

  const product: AdaptyProduct = {
    title,
    period: 'consumable',
    price,
    ios_product_id: ids.productId,
    android_product_id: ids.productId,
    android_base_plan_id: '',
    credits,
  };

  await adapty.createProduct(appId, product, accessLevelId);
  return true;
}

/** Verify the review screenshot exists upfront so missing files surface as a
 * loud warning before we start pushing to the stores. See subscription-add.ts
 * for the rationale. */
async function resolveReviewScreenshot(filePath: string | undefined): Promise<string | undefined> {
  if (!filePath) return undefined;
  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  if (!(await fs.pathExists(abs))) {
    logger.warn(`Review screenshot not found at: ${abs}`);
    logger.info('App Store IAPs without a review screenshot stay in MISSING_METADATA state.');
    logger.info('Pass --review-screenshot <path> or set top-level "review_screenshot" in Assets/appstore-config.json.');
    return undefined;
  }
  return abs;
}
