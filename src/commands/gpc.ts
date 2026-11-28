import path from 'node:path';
import fs from 'fs-extra';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { loadConfig } from '../utils/config.js';
import * as gpc from '../services/gpc.service.js';
import * as gpcMoney from '../services/gpc-monetization.service.js';
import { pushDataSafetyFromConfig } from '../services/gpc-data-safety-push.service.js';
import { pushListings } from '../services/gpc-listings.service.js';
import { resolveRegionsVersion, printCoverageReport, resetMonetizationReport } from '../services/gpc-regions.js';
import { CliError } from '../utils/errors.js';
import { createPlayApp } from './create-play-app.js';
import type { GooglePlayConfig, CreatePlayAppOptions } from '../types/googleplay.js';

const CONFIG_FILENAME = 'Assets/googleplay-config.json';

// ── Shared helpers ──────────────────────────────────────────────────

async function loadPlayConfigStrict(configPath?: string): Promise<{ config: GooglePlayConfig; configPath: string }> {
  const resolved = configPath ?? path.resolve(CONFIG_FILENAME);
  if (!(await fs.pathExists(resolved))) {
    logger.fatal(`Google Play config not found: ${resolved}`);
    logger.info('Run "kappmaker gpc setup" first to create it interactively.');
    process.exit(1);
  }
  const config = await fs.readJson(resolved) as GooglePlayConfig;
  if (!config.app?.package_name) {
    logger.fatal(`Config at ${resolved} is missing app.package_name`);
    process.exit(1);
  }
  return { config, configPath: resolved };
}

async function ensureAuth(): Promise<void> {
  const userConfig = await loadConfig();
  if (!userConfig.googleServiceAccountPath) {
    logger.fatal('Google service account path is not set.');
    logger.info('Set it with: kappmaker config set googleServiceAccountPath <path-to-json>');
    process.exit(1);
  }
  await gpc.validateServiceAccount();
}

// ── Subcommands ──────────────────────────────────────────────────────

/** Full 11-step orchestrator (identical to the top-level create-play-app). */
export async function gpcSetup(options: CreatePlayAppOptions): Promise<void> {
  await createPlayApp(options);
}

/** Quick read-only probe: does this app exist on Play Console? */
export async function gpcAppCheck(options: { package: string }): Promise<void> {
  await ensureAuth();
  const exists = await gpc.checkAppExists(options.package);
  if (exists) {
    logger.success(`App "${options.package}" exists on Google Play Console.`);
  } else {
    logger.warn(`App "${options.package}" was not found.`);
    logger.info(`Create it manually at: ${gpc.PLAY_CONSOLE_URL}`);
    process.exit(2);
  }
}

/** Push just the listings section (start edit, merge + diff, read back, commit). */
export async function gpcListingsPush(options: CreatePlayAppOptions): Promise<void> {
  await ensureAuth();
  const { config } = await loadPlayConfigStrict(options.config);
  if (config.listings.length === 0) {
    logger.warn('No listings in config, nothing to push.');
    return;
  }
  const result = await gpc.withEdit(config.app.package_name, async (editId) => {
    // Details are required to set default language; push them alongside listings.
    await gpc.updateAppDetails(config.app.package_name, editId, config.app.default_language, config.details);
    return pushListings(config.app.package_name, editId, config.listings, { allowEmpty: options.allowEmpty === true, fallbackTitle: config.app.name });
  });
  if (result.pushed.length === 0) {
    logger.success('Listings already match Play: nothing to change.');
  } else {
    logger.success(`Pushed and verified ${result.pushed.length} listing(s): ${result.pushed.join(', ')}.`);
  }
}

/** List subscriptions currently on Play Console (package from --package or config). */
export async function gpcSubscriptionsList(options: { package?: string; config?: string }): Promise<void> {
  await ensureAuth();
  const packageName = options.package ?? (await loadPlayConfigStrict(options.config)).config.app.package_name;
  const existing = await gpcMoney.listSubscriptions(packageName);
  console.log('');
  console.log(chalk.bold(`  Subscriptions on ${packageName}:\n`));
  if (existing.size === 0) {
    console.log(chalk.gray('  (none)'));
  } else {
    for (const id of existing) {
      console.log(`  ${chalk.cyan('•')} ${id}`);
    }
  }
  console.log('');
}

/** Create/reuse subscriptions from config (idempotent). */
export async function gpcSubscriptionsPush(options: CreatePlayAppOptions): Promise<void> {
  await ensureAuth();
  const { config } = await loadPlayConfigStrict(options.config);
  await resolveRegionsVersion(options.regionsVersion);
  resetMonetizationReport();

  // One-shot probe: default language + whether the app has an uploaded build.
  // Google Play rejects monetization writes unless at least one build has been
  // published to some track.
  const state = await gpc.fetchAppState(config.app.package_name);
  if (state && !state.hasUploadedBuild) {
    logger.fatal('No build uploaded to any Play Console track.');
    logger.info('Google Play requires at least one build with the BILLING permission on a');
    logger.info('track (internal testing is enough) before subscriptions can be created.');
    logger.info('Upload one with: kappmaker publish --platform android --track internal');
    process.exit(1);
  }

  const playDefaultLanguage = state?.defaultLanguage ?? config.app.default_language;
  await gpcMoney.setupSubscriptions(config.app.package_name, config.subscriptions, playDefaultLanguage);
  finishMonetization(`${config.subscriptions.length} subscription(s)`);
}

/** List one-time in-app products currently on Play Console. */
export async function gpcIapList(options: { package?: string; config?: string }): Promise<void> {
  await ensureAuth();
  const packageName = options.package ?? (await loadPlayConfigStrict(options.config)).config.app.package_name;
  const existing = await gpcMoney.listInAppProducts(packageName);
  console.log('');
  console.log(chalk.bold(`  In-app products on ${packageName}:\n`));
  if (existing.size === 0) {
    console.log(chalk.gray('  (none)'));
  } else {
    for (const sku of existing) {
      console.log(`  ${chalk.cyan('•')} ${sku}`);
    }
  }
  console.log('');
}

/** Create/reuse one-time in-app products from config (idempotent). */
export async function gpcIapPush(options: CreatePlayAppOptions): Promise<void> {
  await ensureAuth();
  const { config } = await loadPlayConfigStrict(options.config);
  await resolveRegionsVersion(options.regionsVersion);
  resetMonetizationReport();

  const state = await gpc.fetchAppState(config.app.package_name);
  if (state && !state.hasUploadedBuild) {
    logger.fatal('No build uploaded to any Play Console track.');
    logger.info('Google Play requires at least one build with the BILLING permission on a');
    logger.info('track (internal testing is enough) before in-app products can be created.');
    logger.info('Upload one with: kappmaker publish --platform android --track internal');
    process.exit(1);
  }

  await gpcMoney.setupInAppProducts(config.app.package_name, config.in_app_products, {
    recreateStuck: options.recreateStuck === true,
  });
  finishMonetization(`${config.in_app_products.length} in-app product(s)`);
}

export interface GpcMonetizationPushOptions {
  config?: string;
  subscriptionsOnly?: boolean;
  iapOnly?: boolean;
  recreateStuck?: boolean;
  regionsVersion?: string;
}

/**
 * Coverage report + exit code for the monetization pushes. Every product must
 * be priced in every billable region; a product left short (BeMainStar went
 * live priced in 3 regions) or a failed write makes the command exit 1.
 */
function finishMonetization(what: string): void {
  if (!printCoverageReport()) {
    throw new CliError(`Google Play monetization push incomplete for ${what}: see the FAILED lines above.`);
  }
  logger.success(`Processed ${what}; every product is priced in every billable region.`);
}

/** Push subscriptions + IAPs from config in one shot (idempotent). */
export async function gpcMonetizationPush(options: GpcMonetizationPushOptions): Promise<void> {
  await ensureAuth();
  const { config } = await loadPlayConfigStrict(options.config);
  await resolveRegionsVersion(options.regionsVersion);
  resetMonetizationReport();

  const state = await gpc.fetchAppState(config.app.package_name);
  if (state && !state.hasUploadedBuild) {
    logger.fatal('No build uploaded to any Play Console track.');
    logger.info('Google Play requires at least one build (with BILLING permission) uploaded');
    logger.info('to a track before subscriptions/IAPs can be created via the API.');
    logger.info('Upload one with: kappmaker publish --platform android --track internal');
    process.exit(1);
  }

  const defaultLanguage = state?.defaultLanguage ?? config.app.default_language;
  const pushSubs = !options.iapOnly;
  const pushIaps = !options.subscriptionsOnly;

  if (pushSubs) {
    if (config.subscriptions.length > 0) {
      logger.info(`Pushing ${config.subscriptions.length} subscription(s) to Google Play…`);
      await gpcMoney.setupSubscriptions(config.app.package_name, config.subscriptions, defaultLanguage);
    } else {
      logger.info('No subscriptions in config: skipping.');
    }
  }

  if (pushIaps) {
    if (config.in_app_products.length > 0) {
      logger.info(`Pushing ${config.in_app_products.length} in-app product(s) to Google Play…`);
      await gpcMoney.setupInAppProducts(config.app.package_name, config.in_app_products, {
        recreateStuck: options.recreateStuck === true,
      });
    } else {
      logger.info('No in-app products in config: skipping.');
    }
  }

  finishMonetization('subscriptions and in-app products');
}

/**
 * Push only the data safety declaration. Exits non-zero with Play's error body
 * on any non-2xx (it used to print OK on an HTTP 400). `--verify` checks the
 * sent declaration answer by answer and prints what Play now holds.
 */
export async function gpcDataSafetyPush(options: CreatePlayAppOptions): Promise<void> {
  await ensureAuth();
  const { config } = await loadPlayConfigStrict(options.config);
  const outcome = await pushDataSafetyFromConfig(config, { verify: options.verify === true });
  if (outcome === 'not-configured') {
    throw new CliError('Config has no `data_safety` block or `data_safety_csv_path`. Add `"data_safety": { "apply_defaults": true }` to the config and rerun.');
  }
}
