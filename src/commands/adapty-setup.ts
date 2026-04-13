import path from 'node:path';
import fs from 'fs-extra';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { promptInput, confirm } from '../utils/prompt.js';
import { loadConfig, getAdaptyTemplate, loadAdaptyDefaults } from '../utils/config.js';
import * as adapty from '../services/adapty.service.js';
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
  console.log(`  ${chalk.cyan('Access Level:')} ${config.access_level.sdk_id}`);
  console.log(`  ${chalk.cyan('Products:')}`);
  for (const product of config.products) {
    console.log(`    ${chalk.gray('•')} ${product.title} (${product.period})`);
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

  // Step 5: Find or create access level
  logger.step(5, TOTAL_STEPS, 'Setting up access level');
  const levels = await adapty.listAccessLevels(appId);
  let accessLevelId = '';
  const existing = levels.find((l) => l.sdk_id === config.access_level.sdk_id);
  if (existing) {
    accessLevelId = existing.id;
    logger.info(`Access level "${config.access_level.sdk_id}" already exists.`);
  } else {
    accessLevelId = await adapty.createAccessLevel(
      appId,
      config.access_level.sdk_id,
      config.access_level.title,
    );
  }

  // If we couldn't get the ID, try listing again
  if (!accessLevelId) {
    const refreshed = await adapty.listAccessLevels(appId);
    const found = refreshed.find((l) => l.sdk_id === config.access_level.sdk_id);
    if (found) accessLevelId = found.id;
  }

  if (!accessLevelId) {
    logger.warn('Could not determine access level ID. Products may fail to create.');
  }

  // Step 6: Create products
  logger.step(6, TOTAL_STEPS, 'Creating products');
  const productIds: string[] = [];
  for (const product of config.products) {
    const productId = await adapty.createProduct(appId, product, accessLevelId);
    if (productId) {
      product.adapty_product_id = productId;
      productIds.push(productId);
    }
  }

  // Step 7: Create paywalls
  logger.step(7, TOTAL_STEPS, 'Creating paywalls');
  // Build a map of product title → adapty product ID
  const productIdByTitle = new Map<string, string>();
  for (const product of config.products) {
    if (product.adapty_product_id) {
      productIdByTitle.set(product.title, product.adapty_product_id);
    }
  }

  const paywallIds: string[] = [];
  for (const paywall of config.paywalls) {
    if (paywall.paywall_id) {
      paywallIds.push(paywall.paywall_id);
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

  // Step 8: Create placements
  logger.step(8, TOTAL_STEPS, 'Creating placements');
  if (paywallIds.length > 0) {
    for (let i = 0; i < config.placements.length; i++) {
      const placement = config.placements[i];
      // Link each placement to the corresponding paywall (or the first one if fewer paywalls than placements)
      const paywallId = paywallIds[i] ?? paywallIds[0];
      await adapty.createPlacement(appId, placement.title, placement.developer_id, paywallId);
    }
  } else {
    logger.warn('No paywall IDs available. Skipping placement creation.');
  }

  // Save updated config with generated IDs
  await fs.writeJson(configPath, config, { spaces: 2 });
  logger.info(`Config saved to ${configPath}`);

  logger.done();
}

async function loadAdaptyConfig(
  configPath?: string,
): Promise<{ config: AdaptyConfig; configPath: string }> {
  const savePath = configPath ?? path.resolve(CONFIG_FILENAME);

  // If config file exists, load it
  if (await fs.pathExists(savePath)) {
    logger.info(`Using config: ${savePath}`);
    const config: AdaptyConfig = await fs.readJson(savePath);
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
      result[key] = val;
    } else if (val && typeof val === 'object') {
      result[key] = deepMerge(base[key] ?? {}, val);
    } else {
      result[key] = val;
    }
  }
  return result;
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
  };

  for (const product of config.products) {
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
  }
}
