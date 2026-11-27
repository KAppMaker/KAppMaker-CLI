import path from 'node:path';
import fs from 'fs-extra';
import { logger } from '../utils/logger.js';
import { promptInput, confirm } from '../utils/prompt.js';
import chalk from 'chalk';
import { loadConfig, getAppStoreTemplate, loadAppStoreDefaults } from '../utils/config.js';
import { configAppStoreDefaults } from './config.js';
import * as asc from '../services/asc.service.js';
import * as ascMoney from '../services/asc-monetization.service.js';
import { creditPackProductId } from '../services/credit-pack.defaults.js';
import type { AppStoreConfig, CreateAppStoreOptions } from '../types/appstore.js';
import { StepReport } from '../utils/step-report.js';
import { CliError } from '../utils/errors.js';

const CONFIG_FILENAME = 'Assets/appstore-config.json';
const TOTAL_STEPS = 13;

export async function createAppStoreApp(options: CreateAppStoreOptions): Promise<void> {
  // Step 1: Validate asc CLI + config
  logger.step(1, TOTAL_STEPS, 'Validating asc CLI');
  await asc.validateAscInstalled();

  // Check if ASC config is complete. If key fields are missing, offer to run
  // the interactive setup inline so the user doesn't have to abort and come back.
  let userConfig = await loadConfig();
  if (!userConfig.appleId || !userConfig.ascKeyId || !userConfig.ascIssuerId || !userConfig.ascPrivateKeyPath) {
    logger.warn('App Store Connect configuration is incomplete.');
    const shouldSetup = await confirm('  Run interactive setup now? (API key, Apple ID, review contact)', { yesAnswer: false });
    if (shouldSetup) {
      await configAppStoreDefaults({ init: true });
      userConfig = await loadConfig();
    }
    if (!userConfig.appleId) {
      logger.fatal('Apple ID is still not set. Cannot continue.');
      logger.info('Set it with: kappmaker config appstore-defaults --init');
      process.exit(1);
    }
  }

  await asc.validateAscAuth();

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
  if (config.in_app_purchases && config.in_app_purchases.length > 0) {
    console.log(`  ${chalk.cyan('IAPs:')}      ${config.in_app_purchases.length}`);
    for (const iap of config.in_app_purchases) {
      const price = iap.prices[0]?.price ?? '?';
      console.log(`    ${chalk.gray('•')} ${iap.ref_name} → ${iap.product_id} ($${price})`);
    }
  }
  console.log(`  ${chalk.cyan('Review:')}     ${config.review_info.contact_email || chalk.gray('(not set)')}`);
  console.log('');
  console.log(chalk.gray(`  Edit the config file to change any values before continuing.`));
  console.log('');

  const shouldContinue = await confirm('  Continue with these settings?', { assumable: true });
  if (!shouldContinue) {
    logger.info(`Config saved at: ${configPath}`);
    logger.info('Edit the file and run the command again.');
    process.exit(0);
  }

  // Re-read config from file in case user edited it during confirmation
  const finalConfig: AppStoreConfig = await fs.readJson(configPath);
  Object.assign(config, finalConfig);
  applyRequiredDefaults(config, userConfig.organization);

  // Every step below reads its result back and throws when App Store Connect
  // does not hold what was sent. A failed step is listed in the summary and
  // the command exits 1; steps that need its output are skipped, the others run.
  const report = new StepReport('App Store Connect setup');

  // Step 3: Register Bundle ID
  logger.step(3, TOTAL_STEPS, 'Registering Bundle ID');
  await report.run('Bundle ID + capabilities', () => asc.createBundleId(config.app.bundle_id, config.app.name, config.app.platform));

  // Step 4: Find or create app (nothing else can run without it)
  logger.step(4, TOTAL_STEPS, 'Looking up app on App Store Connect');
  let appId: string | null = config.app.id || null;
  if (!appId) appId = await asc.findAppByBundleId(config.app.bundle_id);
  if (!appId) appId = await asc.createApp(config.app);
  config.app.id = appId;
  report.ok('App record', appId);
  logger.info(`App ID: ${appId}`);

  logger.step(5, TOTAL_STEPS, 'Updating content rights');
  await report.run('Content rights', () => asc.updateContentRights(appId, config.app.content_rights));

  logger.step(6, TOTAL_STEPS, 'Creating app version (with copyright)');
  const versionId = await report.run('Version + copyright', () => asc.createVersion(appId, config.version, config.app.platform), {
    detail: () => `${config.version.version_string}, copyright "${config.version.copyright}"`,
  });
  if (versionId) logger.info(`Version ID: ${versionId}`);

  logger.step(7, TOTAL_STEPS, 'Setting categories');
  if (!config.categories.primary) report.skip('Categories', 'no primary category in config');
  else if (!versionId) report.skip('Categories', 'needs the editable version (failed above)');
  else await report.run('Categories', () => asc.setCategories(appId, config.categories));

  logger.step(8, TOTAL_STEPS, 'Setting age rating (incl. social media, UGC, messaging answers)');
  await report.run('Age rating', () => asc.setAgeRating(appId, config.age_rating));

  logger.step(9, TOTAL_STEPS, 'Updating localizations');
  if (!versionId) report.skip('Localizations', 'needs the version (failed above)');
  else {
    await report.run('Localizations', async () => {
      for (const loc of config.localizations) await asc.updateLocalization(versionId, appId, loc);
    }, { detail: () => config.localizations.map((l) => l.locale).join(', ') });
  }

  logger.step(10, TOTAL_STEPS, 'Setting pricing, availability, subscriptions, and in-app purchases');
  await report.run('Price + availability (all territories)', () => ascMoney.createPricing(appId, config.pricing));
  const reviewOpts = { defaultReviewScreenshot: config.review_screenshot };
  if (config.subscriptions.groups.length > 0) {
    for (const group of config.subscriptions.groups) {
      await report.run(`Subscriptions: ${group.reference_name}`, () =>
        ascMoney.setupSubscriptions(appId, group, config.subscriptions.availability, reviewOpts));
    }
    await report.run('Subscriptions read-back (asc validate subscriptions)', () => ascMoney.validateSubscriptions(appId));
  } else {
    report.skip('Subscriptions', 'none in config');
  }
  if ((config.in_app_purchases ?? []).length > 0) {
    await report.run('In-app purchases', () =>
      ascMoney.setupInAppPurchases(appId, config.in_app_purchases ?? [], reviewOpts, config.pricing?.availability));
  } else {
    report.skip('In-app purchases', 'none in config');
  }

  logger.step(11, TOTAL_STEPS, 'Setting privacy data usages');
  if (config.privacy?.enabled && config.privacy?.data_usages?.length > 0) {
    // asc web privacy expects { schemaVersion: 1, dataUsages: [...] }
    const privacyFile = path.resolve('.kappmaker-privacy-temp.json');
    await fs.writeJson(privacyFile, { schemaVersion: 1, dataUsages: config.privacy.data_usages }, { spaces: 2 });
    await report.run('Privacy data usages (web session)', () => asc.setPrivacy(appId, privacyFile));
    await fs.remove(privacyFile).catch(() => {});
  } else {
    report.skip('Privacy data usages', 'none configured');
  }

  logger.step(12, TOTAL_STEPS, 'Setting encryption declarations');
  await report.run('Encryption declaration', () => asc.setEncryption(appId, config.encryption));

  logger.step(13, TOTAL_STEPS, 'Creating the App Review detail');
  if (!versionId) report.skip('App Review detail', 'needs the version (failed above)');
  else {
    await report.run('App Review detail', () => asc.setReviewDetails(versionId, config.review_info), {
      detail: () => `demoAccountRequired=${asc.demoAccountRequired(config.review_info)}`,
    });
  }

  // Save updated config with app.id
  await fs.writeJson(configPath, config, { spaces: 2 });
  logger.info(`Config saved to ${configPath}`);

  if (report.print()) logger.done();
}

/**
 * Fill the fields App Store Connect needs but configs often leave empty:
 * copyright ("<year> <company>") and the availability block (every
 * territory, new territories included). demoAccountRequired is derived in
 * asc.demoAccountRequired (false unless demo credentials are set).
 */
export function applyRequiredDefaults(config: AppStoreConfig, organization?: string): void {
  if (!config.version.copyright?.trim()) {
    config.version.copyright = asc.defaultCopyright(organization, config.app.name);
    logger.info(`Copyright not set in config: using "${config.version.copyright}".`);
  }
  config.pricing ??= { base_territory: 'USA', price_tier: '0', price: '0', availability: { include_all: true, territories: [], available_in_new_territories: true } };
  config.pricing.availability ??= { include_all: true, territories: [], available_in_new_territories: true };
  config.subscriptions.availability ??= { include_all: true, territories: [], available_in_new_territories: true };
  if (!config.app.name) throw new CliError('app.name is empty in the App Store config.');
}

async function loadAppStoreConfig(configPath?: string): Promise<{ config: AppStoreConfig; configPath: string }> {
  const savePath = configPath ?? path.resolve(CONFIG_FILENAME);

  // If config file exists, load it
  if (await fs.pathExists(savePath)) {
    logger.info(`Using config: ${savePath}`);
    const config: AppStoreConfig = await fs.readJson(savePath);
    fillSubscriptionDefaults(config);
    fillIapDefaults(config);
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
    const fallback = asc.defaultCopyright(userConfig.organization, config.app.name);
    config.version.copyright = (await promptInput(`  Copyright (${fallback}): `, { defaultValue: fallback })) || fallback;
  }
  if (!config.review_info.contact_email) {
    config.review_info.contact_first_name = await promptInput('  Review contact first name: ');
    config.review_info.contact_last_name = await promptInput('  Review contact last name: ');
    config.review_info.contact_email = await promptInput('  Review contact email: ');
    config.review_info.contact_phone = await promptInput('  Review contact phone: ');
  }

  // Ask about user content access (AI image/video wrapper apps)
  const accessesUserContent = await confirm('  Does this app access user content like photos/videos (e.g., AI image/video wrapper)?', { yesAnswer: false });
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

  // Auto-fill subscription + IAP defaults
  fillSubscriptionDefaults(config);
  fillIapDefaults(config);

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
      // Empty arrays in global defaults shouldn't wipe out template entries —
      // pre-1.4 defaults have `in_app_purchases: []` baked in but the template
      // now ships with the 3 credit packs. Preserve template content in that case.
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

/**
 * Auto-fill IAP product IDs and reference names for credit-pack-shaped entries.
 * An entry is considered a credit pack when it has a `credits` field set —
 * other custom IAPs are left alone (the user's product_id wins).
 *
 *   product_id: credit_pack_{credits}_{priceDigits}_{appname}
 *   ref_name:   {AppName} {Title} v1 ({price})    — e.g. "Mangit Basic Credit Pack v1 (4.99)"
 */
function fillIapDefaults(config: AppStoreConfig): void {
  if (!config.in_app_purchases) return;
  const appName = config.app.name;
  const appNameLower = appName.toLowerCase().replace(/\s+/g, '');
  if (!appNameLower) return;

  for (const iap of config.in_app_purchases) {
    if (typeof iap.credits !== 'number') continue;
    const price = iap.prices[0]?.price ?? '0';
    const localizedName = iap.localizations[0]?.name ?? `${iap.credits} Credits`;

    if (!iap.product_id) {
      iap.product_id = creditPackProductId(iap.credits, price, appNameLower);
    }
    if (!iap.ref_name) {
      iap.ref_name = `${appName} ${localizedName} v1 (${price})`;
    }
  }
}
