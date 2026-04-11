import path from 'node:path';
import fs from 'fs-extra';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { promptInput, confirm } from '../utils/prompt.js';
import { loadConfig, getGooglePlayTemplate } from '../utils/config.js';
import * as gpc from '../services/gpc.service.js';
import * as gpcMoney from '../services/gpc-monetization.service.js';
import type { GooglePlayConfig, CreatePlayAppOptions } from '../types/googleplay.js';

const CONFIG_FILENAME = 'Assets/googleplay-config.json';
const TOTAL_STEPS = 11;

export async function createPlayApp(options: CreatePlayAppOptions): Promise<void> {
  // Step 1: Validate service account and obtain access token
  logger.step(1, TOTAL_STEPS, 'Validating Google Play service account');
  const userConfig = await loadConfig();
  if (!userConfig.googleServiceAccountPath) {
    logger.fatal('Google service account path is not set.');
    logger.info('Set it with: kappmaker config set googleServiceAccountPath <path-to-json>');
    process.exit(1);
  }
  await gpc.validateServiceAccount();

  // Step 2: Load config
  logger.step(2, TOTAL_STEPS, 'Loading Google Play config');
  const { config, configPath } = await loadPlayConfig(options.config);

  logger.info(`App: ${config.app.name} (${config.app.package_name})`);
  logger.info(`Default language: ${config.app.default_language}`);

  // Step 3: Review summary
  console.log('');
  console.log(chalk.bold('  Review before proceeding:\n'));
  console.log(`  ${chalk.cyan('Config:')}       ${configPath}`);
  console.log(`  ${chalk.cyan('App:')}          ${config.app.name}`);
  console.log(`  ${chalk.cyan('Package:')}      ${config.app.package_name}`);
  console.log(`  ${chalk.cyan('Language:')}     ${config.app.default_language}`);
  console.log(`  ${chalk.cyan('Listings:')}     ${config.listings.length} locale(s)`);
  console.log(`  ${chalk.cyan('Subscriptions:')} ${config.subscriptions.length}`);
  if (config.subscriptions.length > 0) {
    for (const sub of config.subscriptions) {
      const firstBp = sub.base_plans[0];
      const price = firstBp?.regional_configs[0];
      const priceLabel = price ? `$${price.price} ${firstBp.base_plan_id}` : '?';
      console.log(`    ${chalk.gray('•')} ${sub.product_id} (${priceLabel})`);
    }
  }
  console.log(`  ${chalk.cyan('IAPs:')}         ${config.in_app_products.length}`);
  console.log(`  ${chalk.cyan('Data safety:')}  ${config.data_safety ? 'yes' : 'no'}`);
  console.log('');
  console.log(chalk.gray('  Edit the config file to change any values before continuing.'));
  console.log('');

  const shouldContinue = await confirm('  Continue with these settings?');
  if (!shouldContinue) {
    logger.info(`Config saved at: ${configPath}`);
    logger.info('Edit the file and run the command again.');
    process.exit(0);
  }

  // Re-read in case the user edited during confirmation
  const finalConfig: GooglePlayConfig = await fs.readJson(configPath);
  Object.assign(config, finalConfig);

  // Step 4: Verify app exists on Play Console (fails fast via insertEdit's 404 path)
  logger.step(4, TOTAL_STEPS, 'Verifying app on Google Play Console');
  const editId = await gpc.insertEdit(config.app.package_name);
  logger.info(`Edit ID: ${editId}`);

  // Step 5: Update app details (default language + contact)
  logger.step(5, TOTAL_STEPS, 'Updating app details');
  await gpc.updateAppDetails(
    config.app.package_name,
    editId,
    config.app.default_language,
    config.details,
  );

  // Step 6: Update store listings per locale
  logger.step(6, TOTAL_STEPS, 'Updating store listings');
  if (config.listings.length === 0) {
    logger.info('No listings configured, skipping.');
  } else {
    for (const listing of config.listings) {
      await gpc.updateListing(config.app.package_name, editId, listing);
    }
  }

  // Step 7: Commit edit
  logger.step(7, TOTAL_STEPS, 'Committing Play Console edit');
  await gpc.commitEdit(config.app.package_name, editId);

  // Step 8: Create / reuse subscriptions (monetization API, outside edit)
  logger.step(8, TOTAL_STEPS, 'Setting up subscriptions');
  await gpcMoney.setupSubscriptions(config.app.package_name, config.subscriptions);

  // Step 9: Create / reuse one-time in-app products
  logger.step(9, TOTAL_STEPS, 'Setting up in-app products');
  await gpcMoney.setupInAppProducts(config.app.package_name, config.in_app_products);

  // Step 10: Data safety declaration (standalone endpoint)
  logger.step(10, TOTAL_STEPS, 'Updating data safety declaration');
  if (config.data_safety && Object.keys(config.data_safety).length > 0) {
    await gpc.updateDataSafety(config.app.package_name, config.data_safety);
  } else {
    logger.info('No data_safety in config, skipping.');
  }

  // Step 11: Warnings for things the API doesn't expose
  logger.step(11, TOTAL_STEPS, 'Wrap-up (manual Play Console items)');
  logger.warn('Content rating (IARC) is not in the Play Publisher API.');
  logger.info(`  Complete it manually at: ${gpc.PLAY_CONSOLE_URL}`);
  logger.warn('App pricing (free/paid tier) is set at app creation in Play Console.');

  // Save updated config (currently unchanged, but mirrors ASC save-back behaviour)
  await fs.writeJson(configPath, config, { spaces: 2 });
  logger.info(`Config saved to ${configPath}`);

  logger.done();
}

async function loadPlayConfig(configPath?: string): Promise<{ config: GooglePlayConfig; configPath: string }> {
  const savePath = configPath ?? path.resolve(CONFIG_FILENAME);

  if (await fs.pathExists(savePath)) {
    logger.info(`Using config: ${savePath}`);
    const config = await fs.readJson(savePath) as GooglePlayConfig;
    fillSubscriptionDefaults(config);
    await fs.writeJson(savePath, config, { spaces: 2 });
    return { config, configPath: savePath };
  }

  // No config found — prompt for required fields and generate one
  logger.info('No Google Play config file found. Let\'s set up the basics.');
  const template = getGooglePlayTemplate() as unknown as GooglePlayConfig;
  const userConfig = await loadConfig();

  template.app.name = await promptInput('  App name: ');
  const appNameLower = template.app.name.toLowerCase().replace(/\s+/g, '');

  const defaultPackage = userConfig.bundleIdPrefix
    ? `${userConfig.bundleIdPrefix}.${appNameLower}`
    : `com.${appNameLower}`;

  template.app.package_name = await promptInput(`  Package name (${defaultPackage}): `) || defaultPackage;

  if (!template.details.contact_email) {
    template.details.contact_email = await promptInput('  Contact email: ');
  }

  fillSubscriptionDefaults(template);

  await fs.ensureDir(path.dirname(savePath));
  await fs.writeJson(savePath, template, { spaces: 2 });
  logger.success(`Config saved to ${savePath}`);

  return { config: template, configPath: savePath };
}

/**
 * Auto-generate subscription product IDs matching the ASC / Adapty format:
 *   {appname}.premium.{period}.v1.{price}.v1
 * where period is derived from the base plan ID (weekly/monthly/yearly) and
 * price is the first regional config's price with the decimal removed.
 */
function fillSubscriptionDefaults(config: GooglePlayConfig): void {
  const appName = config.app.name;
  const appNameLower = appName.toLowerCase().replace(/\s+/g, '');
  if (!appNameLower) return;

  for (const sub of config.subscriptions) {
    const basePlan = sub.base_plans[0];
    if (!basePlan) continue;
    const period = basePlan.base_plan_id;
    const price = basePlan.regional_configs[0]?.price ?? '0';
    const priceTag = price.replace('.', '');
    if (!sub.product_id) {
      sub.product_id = `${appNameLower}.premium.${period}.v1.${priceTag}.v1`;
    }
  }
}
