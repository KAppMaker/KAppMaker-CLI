import path from 'node:path';
import fs from 'fs-extra';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { promptInput, confirm } from '../utils/prompt.js';
import { loadConfig, getAdaptyTemplate, loadAdaptyDefaults } from '../utils/config.js';
import * as adapty from '../services/adapty.service.js';
import { creditPackProductId } from '../services/credit-pack.defaults.js';
import type { AdaptyConfig, CreateAdaptyOptions } from '../types/adapty.js';

const CONFIG_FILENAME = 'Assets/adapty-config.json';
const TOTAL_STEPS = 8;

export async function adaptySetup(options: CreateAdaptyOptions): Promise<void> {
  // Step 1: Validate adapty CLI
  logger.step(1, TOTAL_STEPS, 'Validating adapty CLI');
  await adapty.validateAdaptyInstalled();

  // Step 2: Validate auth
  logger.step(2, TOTAL_STEPS, 'Checking Adapty authentication');
  await adapty.validateAdaptyAuth();

  // Step 3: Load config
  logger.step(3, TOTAL_STEPS, 'Loading Adapty config');
  const { config, configPath } = await loadAdaptyConfig(options.config);

  logger.info(`App: ${config.app.title} (${config.app.bundle_id})`);

  // Show summary and ask for confirmation
  console.log('');
  console.log(chalk.bold('  Review before proceeding:\n'));
  console.log(`  ${chalk.cyan('Config:')}       ${configPath}`);
  console.log(`  ${chalk.cyan('App:')}          ${config.app.title}`);
  console.log(`  ${chalk.cyan('Bundle ID:')}   ${config.app.bundle_id}`);
  console.log(`  ${chalk.cyan('Package ID:')}  ${config.app.package_id}`);
  console.log(`  ${chalk.cyan('Access Levels:')} ${config.access_levels.map((l) => l.sdk_id).join(', ')}`);
  console.log(`  ${chalk.cyan('Products:')}`);
  for (const product of config.products) {
    const accessLabel = product.access_level_sdk_id ?? config.access_levels[0]?.sdk_id ?? '?';
    console.log(`    ${chalk.gray('•')} ${product.title} (${product.period}, access=${accessLabel})`);
    console.log(`      iOS: ${product.ios_product_id || chalk.gray('(not set)')}`);
    console.log(`      Android: ${product.android_product_id || chalk.gray('(not set)')}`);
  }
  console.log(`  ${chalk.cyan('Paywalls:')}`);
  for (const paywall of config.paywalls) {
    console.log(`    ${chalk.gray('•')} ${paywall.title}`);
  }
  console.log(`  ${chalk.cyan('Placements:')}`);
  for (const placement of config.placements) {
    console.log(`    ${chalk.gray('•')} ${placement.title} (${placement.developer_id})`);
  }
  console.log('');
  console.log(chalk.gray('  Edit the config file to change any values before continuing.'));
  console.log('');

  const shouldContinue = await confirm('  Continue with these settings?');
  if (!shouldContinue) {
    logger.info(`Config saved at: ${configPath}`);
    logger.info('Edit the file and run the command again.');
    process.exit(0);
  }

  // Re-read config in case user edited it during confirmation
  const finalConfig: AdaptyConfig = await fs.readJson(configPath);
  Object.assign(config, finalConfig);

  // Step 4: Find or create app
  logger.step(4, TOTAL_STEPS, 'Finding or creating Adapty app');
  let appId = config.app.app_id;
  if (!appId) {
    const existing = await adapty.findAppByBundleId(config.app.bundle_id);
    if (existing) {
      appId = existing.id;
      logger.info(`Found existing app: ${appId}`);
    } else {
      const created = await adapty.createApp(
        config.app.title,
        config.app.bundle_id,
        config.app.package_id,
      );
      appId = created.app_id;
      if (created.sdk_key) {
        logger.info(`SDK Key (save this for your mobile app): ${chalk.bold(created.sdk_key)}`);
      }
    }
    config.app.app_id = appId;
  }
  logger.info(`App ID: ${appId}`);

  // Step 5: Find or create each access level (sdk_id → Adapty UUID)
  logger.step(5, TOTAL_STEPS, 'Setting up access levels');
  const accessLevelIdBySdkId = new Map<string, string>();
  let existingLevels = await adapty.listAccessLevels(appId);
  for (const level of config.access_levels) {
    let id = existingLevels.find((l) => l.sdk_id === level.sdk_id)?.id;
    if (id) {
      logger.info(`Access level "${level.sdk_id}" already exists.`);
    } else {
      id = await adapty.createAccessLevel(appId, level.sdk_id, level.title);
      if (!id) {
        // Re-list and try again — adapty CLI sometimes silently no-ops on duplicates without returning the ID.
        existingLevels = await adapty.listAccessLevels(appId);
        id = existingLevels.find((l) => l.sdk_id === level.sdk_id)?.id;
      }
    }
    if (id) accessLevelIdBySdkId.set(level.sdk_id, id);
    else logger.warn(`Could not determine access level ID for "${level.sdk_id}". Products on it may fail to create.`);
  }
  const defaultAccessLevelId = accessLevelIdBySdkId.get(config.access_levels[0]?.sdk_id ?? '') ?? '';

  // Step 6: Create products — each routed to its own access level
  // Pre-populate ID map from existing products so re-runs link paywalls to
  // already-created subscriptions/IAPs without recreating them.
  logger.step(6, TOTAL_STEPS, 'Creating products');
  const existingProducts = await adapty.listProducts(appId);
  const productIdByTitle = new Map<string, string>();
  for (const p of existingProducts) {
    if (p.id && p.title) productIdByTitle.set(p.title, p.id);
  }

  for (const product of config.products) {
    if (productIdByTitle.has(product.title)) {
      product.adapty_product_id = productIdByTitle.get(product.title)!;
      logger.info(`Product "${product.title}" already exists, skipping create.`);
      continue;
    }
    const sdkId = product.access_level_sdk_id ?? config.access_levels[0]?.sdk_id ?? '';
    const accessLevelId = accessLevelIdBySdkId.get(sdkId) ?? defaultAccessLevelId;
    if (!accessLevelId) {
      logger.warn(`No access level resolved for "${product.title}" (sdk_id=${sdkId}). Skipping.`);
      continue;
    }
    const productId = await adapty.createProduct(appId, product, accessLevelId);
    if (productId) {
      product.adapty_product_id = productId;
      productIdByTitle.set(product.title, productId);
    }
  }

  // Step 7: Create paywalls (idempotent — looks up existing by title before creating)
  logger.step(7, TOTAL_STEPS, 'Creating paywalls');
  const existingPaywalls = await adapty.listPaywalls(appId);
  const paywallIdByTitle = new Map<string, string>();
  for (const p of existingPaywalls) {
    if (p.id && p.title) paywallIdByTitle.set(p.title, p.id);
  }

  const paywallIds: string[] = [];
  for (const paywall of config.paywalls) {
    if (paywall.paywall_id) {
      paywallIds.push(paywall.paywall_id);
      continue;
    }
    if (paywallIdByTitle.has(paywall.title)) {
      const existingId = paywallIdByTitle.get(paywall.title)!;
      paywall.paywall_id = existingId;
      paywallIds.push(existingId);
      logger.info(`Paywall "${paywall.title}" already exists, skipping create.`);
      continue;
    }
    // Resolve product titles to IDs for this paywall
    const paywallProductIds = paywall.product_titles
      .map((t) => productIdByTitle.get(t))
      .filter((id): id is string => !!id);

    if (paywallProductIds.length === 0) {
      logger.warn(`No product IDs found for paywall "${paywall.title}". Skipping.`);
      continue;
    }
    const id = await adapty.createPaywall(appId, paywall.title, paywallProductIds);
    if (id) {
      paywall.paywall_id = id;
      paywallIds.push(id);
    }
  }

  // Step 8: Create placements (idempotent — skip if developer_id already exists)
  logger.step(8, TOTAL_STEPS, 'Creating placements');
  if (paywallIds.length > 0) {
    const existingPlacements = await adapty.listPlacements(appId);
    const existingDeveloperIds = new Set(existingPlacements.map((p) => p.developer_id));
    for (let i = 0; i < config.placements.length; i++) {
      const placement = config.placements[i];
      if (existingDeveloperIds.has(placement.developer_id)) {
        logger.info(`Placement "${placement.developer_id}" already exists, skipping.`);
        continue;
      }
      const paywallId = paywallIds[i] ?? paywallIds[0];
      await adapty.createPlacement(appId, placement.title, placement.developer_id, paywallId);
    }
  } else {
    logger.warn('No paywall IDs available. Skipping placement creation.');
  }

  // Save updated config with generated IDs
  await fs.writeJson(configPath, config, { spaces: 2 });
  logger.info(`Config saved to ${configPath}`);

  printPostSetupChecklist(appId);

  logger.done();
}

/**
 * Adapty's developer API does not accept developer-set prices on products
 * (verified via OPTIONS — "Strips response to plan-specified fields (id, title,
 * vendor_products)"). Prices are pulled live from App Store Connect / Google
 * Play once those integrations are connected in the Adapty dashboard. Print
 * a checklist so the user knows what to do for prices to appear.
 */
function printPostSetupChecklist(appId: string): void {
  console.log('');
  console.log(chalk.bold('  Prices not appearing in the Adapty dashboard?'));
  console.log('');
  console.log(chalk.gray('  Adapty does not accept developer-set prices via the API — it pulls them live from'));
  console.log(chalk.gray('  store integrations. Connect them in the Adapty dashboard (one-time, dashboard-only step):'));
  console.log('');
  console.log(`    ${chalk.gray('☐')} ${chalk.bold('App Store Connect')} — paste the same .p8 / Key ID / Issuer ID you use for ${chalk.cyan('kappmaker create-appstore-app')}`);
  console.log(`    ${chalk.gray('☐')} ${chalk.bold('Google Play')} — upload the same service-account JSON you use for ${chalk.cyan('kappmaker gpc setup')}`);
  console.log('');
  console.log(chalk.gray(`  Dashboard: https://app.adapty.io/${appId} → Settings → Integrations`));
  console.log(chalk.gray('  Even before connecting, the mobile Adapty SDK shows the right prices in-app —'));
  console.log(chalk.gray('  it fetches them directly from the native store APIs at runtime.'));
  console.log('');
}

async function loadAdaptyConfig(
  configPath?: string,
): Promise<{ config: AdaptyConfig; configPath: string }> {
  const savePath = configPath ?? path.resolve(CONFIG_FILENAME);

  // If config file exists, load it
  if (await fs.pathExists(savePath)) {
    logger.info(`Using config: ${savePath}`);
    const config: AdaptyConfig = await fs.readJson(savePath);
    migrateLegacyAccessLevel(config);
    fillProductDefaults(config);
    await fs.writeJson(savePath, config, { spaces: 2 });
    return { config, configPath: savePath };
  }

  // No config found — prompt for required fields and generate one
  logger.info("No config file found. Let's set up the basics.");
  const config = await loadDefaultTemplate();
  const userConfig = await loadConfig();

  config.app.title = await promptInput('  App name: ');

  const appNameLower = config.app.title.toLowerCase().replace(/\s+/g, '');
  const defaultBundleId = userConfig.bundleIdPrefix
    ? `${userConfig.bundleIdPrefix}.${appNameLower}`
    : `com.${appNameLower}`;

  config.app.bundle_id =
    (await promptInput(`  iOS Bundle ID (${defaultBundleId}): `)) || defaultBundleId;
  config.app.package_id =
    (await promptInput(`  Android Package ID (${config.app.bundle_id}): `)) ||
    config.app.bundle_id;

  migrateLegacyAccessLevel(config);
  fillProductDefaults(config);

  await fs.ensureDir(path.dirname(savePath));
  await fs.writeJson(savePath, config, { spaces: 2 });
  logger.success(`Config saved to ${savePath}`);

  return { config, configPath: savePath };
}

async function loadDefaultTemplate(): Promise<AdaptyConfig> {
  const template = getAdaptyTemplate();
  const globals = await loadAdaptyDefaults();
  if (!globals) return template as unknown as AdaptyConfig;
  return deepMerge(template, globals) as unknown as AdaptyConfig;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deepMerge(base: any, override: any): any {
  const result = { ...base };
  for (const key of Object.keys(override)) {
    const val = override[key];
    if (val === undefined || val === '') continue;
    if (Array.isArray(val)) {
      // Empty arrays in global defaults shouldn't wipe out template entries
      // (e.g. pre-1.4 saved defaults have empty paywalls/placements arrays).
      if (val.length === 0 && Array.isArray(base[key]) && base[key].length > 0) continue;
      result[key] = val;
    } else if (val && typeof val === 'object') {
      result[key] = deepMerge(base[key] ?? {}, val);
    } else {
      result[key] = val;
    }
  }
  return result;
}

/**
 * Auto-migrate the legacy single `access_level` field into the new `access_levels` array,
 * and ensure `credit_pack_access` exists when any product is shaped as a credit pack.
 * Idempotent — re-running on an up-to-date config is a no-op.
 */
function migrateLegacyAccessLevel(config: AdaptyConfig): void {
  if (!Array.isArray(config.access_levels)) config.access_levels = [];

  if (config.access_level && !config.access_levels.some((l) => l.sdk_id === config.access_level!.sdk_id)) {
    config.access_levels.unshift(config.access_level);
  }
  delete config.access_level;

  // Ensure the default Premium access level exists when products reference it.
  // sdk_id keeps the historical "Premium" capitalization to avoid creating a
  // case-only duplicate alongside existing access levels created by older runs.
  if (config.access_levels.length === 0) {
    config.access_levels.push({ sdk_id: 'Premium', title: 'Premium' });
  }

  const hasCreditPacks = (config.products ?? []).some((p) => typeof p.credits === 'number');
  if (hasCreditPacks && !config.access_levels.some((l) => l.sdk_id === 'credit_pack_access')) {
    config.access_levels.push({ sdk_id: 'credit_pack_access', title: 'Credit Pack Access' });
  }
}

function fillProductDefaults(config: AdaptyConfig): void {
  const appName = config.app.title;
  const appNameLower = appName.toLowerCase().replace(/\s+/g, '');
  if (!appNameLower) return;

  const periodSuffix: Record<string, string> = {
    weekly: 'weekly',
    monthly: 'monthly',
    two_months: 'twomonths',
    trimonthly: 'quarterly',
    semiannual: 'semiannual',
    annual: 'yearly',
    lifetime: 'lifetime',
    consumable: 'lifetime',
  };

  const subscriptionAccessLevel = config.access_levels[0]?.sdk_id ?? 'Premium';

  for (const product of config.products) {
    // Credit packs (one-time IAPs): same ID on iOS + Android, period=consumable, routed to credit_pack_access.
    if (typeof product.credits === 'number') {
      const id = creditPackProductId(product.credits, product.price || '0', appNameLower);
      if (!product.ios_product_id) product.ios_product_id = id;
      if (!product.android_product_id) product.android_product_id = id;
      // IAPs have no base plan; leave empty so the API/CLI doesn't try to attach one.
      product.android_base_plan_id = '';
      // Force "consumable" period (the CLI rejects this; the API accepts it). Migrate "lifetime" entries.
      if (product.period !== 'consumable') product.period = 'consumable';
      // Default credit packs to credit_pack_access — but respect a user override.
      if (!product.access_level_sdk_id) product.access_level_sdk_id = 'credit_pack_access';
      continue;
    }

    const suffix = periodSuffix[product.period] ?? product.period;
    const priceTag = (product.price || '0').replace('.', '');

    // iOS product ID matches App Store format: appname.premium.weekly.v1.699.v1
    if (!product.ios_product_id) {
      product.ios_product_id = `${appNameLower}.premium.${suffix}.v1.${priceTag}.v1`;
    }
    // Android product ID (matches what `create-play-app` creates on Play): appname.premium.weekly.v1
    if (!product.android_product_id) {
      product.android_product_id = `${appNameLower}.premium.${suffix}.v1`;
    }
    // Android base plan ID (matches what `create-play-app` creates on Play): autorenew-weekly-699-v1
    // Normalizes the legacy `autorenew-<period>-price-v1` form so old configs get upgraded automatically.
    if (!product.android_base_plan_id || product.android_base_plan_id === `autorenew-${suffix}-price-v1`) {
      product.android_base_plan_id = `autorenew-${suffix}-${priceTag}-v1`;
    }
    // Default subscriptions to the first access level (typically "premium").
    if (!product.access_level_sdk_id) product.access_level_sdk_id = subscriptionAccessLevel;
  }
}
