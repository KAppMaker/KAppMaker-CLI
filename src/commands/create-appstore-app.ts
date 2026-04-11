import path from 'node:path';
import fs from 'fs-extra';
import { logger } from '../utils/logger.js';
import { promptInput, confirm } from '../utils/prompt.js';
import chalk from 'chalk';
import { loadConfig, getAppStoreTemplate, loadAppStoreDefaults } from '../utils/config.js';
import * as asc from '../services/asc.service.js';
import * as ascMoney from '../services/asc-monetization.service.js';
import type { AppStoreConfig, CreateAppStoreOptions } from '../types/appstore.js';

const CONFIG_FILENAME = 'Assets/appstore-config.json';
const TOTAL_STEPS = 13;

export async function createAppStoreApp(options: CreateAppStoreOptions): Promise<void> {
  // Step 1: Validate asc CLI
  logger.step(1, TOTAL_STEPS, 'Validating asc CLI');
  await asc.validateAscInstalled();
  await asc.validateAscAuth();

  // `asc web apps create` (v1.0+) requires --apple-id, so surface the missing
  // value now rather than deep inside step 4 after config parsing and confirms.
  const userConfig = await loadConfig();
  if (!userConfig.appleId) {
    logger.fatal('Apple ID is required for App Store Connect app creation and privacy setup.');
    logger.info('Set it with: kappmaker config appstore-defaults --init');
    process.exit(1);
  }

  // Step 2: Load config
  logger.step(2, TOTAL_STEPS, 'Loading App Store Connect config');
  const { config, configPath } = await loadAppStoreConfig(options.config);

  logger.info(`App: ${config.app.name} (${config.app.bundle_id})`);
  logger.info(`Version: ${config.version.version_string}`);

  // Show summary and ask for confirmation
  console.log('');
  console.log(chalk.bold('  Review before proceeding:\n'));
  console.log(`  ${chalk.cyan('Config:')}     ${configPath}`);
  console.log(`  ${chalk.cyan('App:')}        ${config.app.name}`);
  console.log(`  ${chalk.cyan('Bundle ID:')} ${config.app.bundle_id}`);
  console.log(`  ${chalk.cyan('SKU:')}        ${config.app.sku}`);
  console.log(`  ${chalk.cyan('Version:')}    ${config.version.version_string} (${config.version.release_type})`);
  console.log(`  ${chalk.cyan('Category:')}   ${config.categories.primary}`);
  console.log(`  ${chalk.cyan('Copyright:')}  ${config.version.copyright || chalk.gray('(not set)')}`);
  if (config.subscriptions.groups.length > 0) {
    const group = config.subscriptions.groups[0];
    console.log(`  ${chalk.cyan('Sub group:')} ${group.reference_name}`);
    for (const sub of group.subscriptions) {
      const price = sub.prices[0]?.price ?? '?';
      console.log(`    ${chalk.gray('•')} ${sub.ref_name} → ${sub.product_id} ($${price})`);
    }
  }
  console.log(`  ${chalk.cyan('Review:')}     ${config.review_info.contact_email || chalk.gray('(not set)')}`);
  console.log('');
  console.log(chalk.gray(`  Edit the config file to change any values before continuing.`));
  console.log('');

  const shouldContinue = await confirm('  Continue with these settings?');
  if (!shouldContinue) {
    logger.info(`Config saved at: ${configPath}`);
    logger.info('Edit the file and run the command again.');
    process.exit(0);
  }

  // Re-read config from file in case user edited it during confirmation
  const finalConfig: AppStoreConfig = await fs.readJson(configPath);
  Object.assign(config, finalConfig);

  // Step 3: Register Bundle ID
  logger.step(3, TOTAL_STEPS, 'Registering Bundle ID');
  await asc.createBundleId(config.app.bundle_id, config.app.name, config.app.platform);

  // Step 4: Find or create app
  logger.step(4, TOTAL_STEPS, 'Looking up app on App Store Connect');
  let appId: string | null = config.app.id || null;
  if (!appId) {
    appId = await asc.findAppByBundleId(config.app.bundle_id);
  }
  if (!appId) {
    appId = await asc.createApp(config.app);
  }
  config.app.id = appId;
  logger.info(`App ID: ${appId}`);

  // Step 5: Update Content Rights
  logger.step(5, TOTAL_STEPS, 'Updating content rights');
  await asc.updateContentRights(appId, config.app.content_rights);

  // Step 6: Create Version
  logger.step(6, TOTAL_STEPS, 'Creating app version');
  const versionId = await asc.createVersion(appId, config.version, config.app.platform);
  logger.info(`Version ID: ${versionId}`);

  // Step 7: Set Categories
  logger.step(7, TOTAL_STEPS, 'Setting categories');
  if (config.categories.primary) {
    await asc.setCategories(appId, config.categories);
  } else {
    logger.info('No categories configured, skipping.');
  }

  // Step 8: Set Age Rating
  logger.step(8, TOTAL_STEPS, 'Setting age rating');
  await asc.setAgeRating(appId, config.age_rating);

  // Step 9: Update Localizations
  logger.step(9, TOTAL_STEPS, 'Updating localizations');
  for (const loc of config.localizations) {
    await asc.updateLocalization(versionId, appId, loc);
  }

  // Step 10: Set Pricing & Subscriptions
  logger.step(10, TOTAL_STEPS, 'Setting pricing and subscriptions');
  await ascMoney.createPricing(appId, config.pricing);
  if (config.subscriptions.groups.length > 0) {
    for (const group of config.subscriptions.groups) {
      await ascMoney.setupSubscriptions(appId, group, config.subscriptions.availability);
    }
  } else {
    logger.info('No subscriptions configured, skipping.');
  }

  // Step 11: Set Privacy
  logger.step(11, TOTAL_STEPS, 'Setting privacy data usages');
  if (config.privacy?.enabled && config.privacy?.data_usages?.length > 0) {
    // asc web privacy expects { schemaVersion: 1, dataUsages: [...] }
    const privacyFile = path.resolve('.kappmaker-privacy-temp.json');
    await fs.writeJson(privacyFile, {
      schemaVersion: 1,
      dataUsages: config.privacy.data_usages,
    }, { spaces: 2 });
    try {
      await asc.setPrivacy(appId, privacyFile);
    } catch {
      logger.warn('Privacy setup failed. You may need to set this manually in App Store Connect.');
      logger.info('Privacy uses "asc web privacy" which requires Apple ID authentication.');
    }
    await fs.remove(privacyFile).catch(() => {});
  } else {
    logger.info('No privacy data usages configured, skipping.');
  }

  // Step 12: Set Encryption
  logger.step(12, TOTAL_STEPS, 'Setting encryption declarations');
  await asc.setEncryption(appId, config.encryption);

  // Step 13: Set Review Details
  logger.step(13, TOTAL_STEPS, 'Setting review details');
  if (config.review_info.contact_email) {
    await asc.setReviewDetails(versionId, config.review_info);
  } else {
    logger.info('No review contact info configured, skipping.');
  }

  // Save updated config with app.id
  await fs.writeJson(configPath, config, { spaces: 2 });
  logger.info(`Config saved to ${configPath}`);

  logger.done();
}

async function loadAppStoreConfig(configPath?: string): Promise<{ config: AppStoreConfig; configPath: string }> {
  const savePath = configPath ?? path.resolve(CONFIG_FILENAME);

  // If config file exists, load it
  if (await fs.pathExists(savePath)) {
    logger.info(`Using config: ${savePath}`);
    const config: AppStoreConfig = await fs.readJson(savePath);
    fillSubscriptionDefaults(config);
    // Re-save with filled defaults
    await fs.writeJson(savePath, config, { spaces: 2 });
    return { config, configPath: savePath };
  }

  // No config found — prompt for required fields and generate one
  logger.info('No config file found. Let\'s set up the basics.');
  const config = await loadDefaultTemplate();
  const userConfig = await loadConfig();

  config.app.name = await promptInput('  App name: ');
  const appNameLower = config.app.name.toLowerCase().replace(/\s+/g, '');

  const defaultBundleId = userConfig.bundleIdPrefix
    ? `${userConfig.bundleIdPrefix}.${appNameLower}`
    : `com.${appNameLower}`;

  config.app.bundle_id = await promptInput(`  Bundle ID (${defaultBundleId}): `) || defaultBundleId;
  config.app.sku = await promptInput(`  SKU (${config.app.bundle_id}): `) || config.app.bundle_id;

  // Only prompt for fields not already filled from global defaults
  if (!config.version.copyright) {
    config.version.copyright = await promptInput('  Copyright (e.g., "2026 Your Company"): ');
  }
  if (!config.review_info.contact_email) {
    config.review_info.contact_first_name = await promptInput('  Review contact first name: ');
    config.review_info.contact_last_name = await promptInput('  Review contact last name: ');
    config.review_info.contact_email = await promptInput('  Review contact email: ');
    config.review_info.contact_phone = await promptInput('  Review contact phone: ');
  }

  // Ask about user content access (AI image/video wrapper apps)
  const accessesUserContent = await confirm('  Does this app access user content like photos/videos (e.g., AI image/video wrapper)?');
  if (accessesUserContent) {
    const contentUsages = [
      {
        category: 'PHOTOS_OR_VIDEOS',
        purposes: ['APP_FUNCTIONALITY'],
        dataProtections: ['DATA_NOT_LINKED_TO_YOU'],
      },
      {
        category: 'OTHER_USER_CONTENT',
        purposes: ['APP_FUNCTIONALITY'],
        dataProtections: ['DATA_NOT_LINKED_TO_YOU'],
      },
    ];
    config.privacy.data_usages.push(...contentUsages);
  }

  // Auto-fill subscription defaults
  fillSubscriptionDefaults(config);

  await fs.ensureDir(path.dirname(savePath));
  await fs.writeJson(savePath, config, { spaces: 2 });
  logger.success(`Config saved to ${savePath}`);

  return { config, configPath: savePath };
}

async function loadDefaultTemplate(): Promise<AppStoreConfig> {
  const template = getAppStoreTemplate();
  const globals = await loadAppStoreDefaults();
  if (!globals) return template as unknown as AppStoreConfig;
  return deepMerge(template, globals) as unknown as AppStoreConfig;
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

function fillSubscriptionDefaults(config: AppStoreConfig): void {
  const appName = config.app.name;
  const appNameLower = appName.toLowerCase().replace(/\s+/g, '');
  if (!appNameLower) return;

  const periodSuffix: Record<string, string> = {
    ONE_WEEK: 'weekly',
    ONE_MONTH: 'monthly',
    TWO_MONTHS: 'twomonths',
    THREE_MONTHS: 'quarterly',
    SIX_MONTHS: 'semiannual',
    ONE_YEAR: 'yearly',
  };

  const periodLabel: Record<string, string> = {
    ONE_WEEK: 'Weekly',
    ONE_MONTH: 'Monthly',
    TWO_MONTHS: 'Two Months',
    THREE_MONTHS: 'Quarterly',
    SIX_MONTHS: 'Semi Annual',
    ONE_YEAR: 'Yearly',
  };

  for (const group of config.subscriptions.groups) {
    // Group reference name: appname.premium.v1
    if (!group.reference_name) {
      group.reference_name = `${appNameLower}.premium.v1`;
    }

    for (const sub of group.subscriptions) {
      const suffix = periodSuffix[sub.subscription_period] ?? sub.subscription_period.toLowerCase();
      const label = periodLabel[sub.subscription_period] ?? suffix;
      const price = sub.prices[0]?.price ?? '0';
      const priceTag = price.replace('.', '');

      // Reference name: AppName Premium Weekly v1 (6.99)
      if (!sub.ref_name) {
        sub.ref_name = `${appName} Premium ${label} v1 (${price})`;
      }

      // Product ID: appname.premium.weekly.v1.699.v1
      if (!sub.product_id) {
        sub.product_id = `${appNameLower}.premium.${suffix}.v1.${priceTag}.v1`;
      }
    }
  }
}
