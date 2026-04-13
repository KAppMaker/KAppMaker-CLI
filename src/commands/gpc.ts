import path from 'node:path';
import fs from 'fs-extra';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { loadConfig } from '../utils/config.js';
import * as gpc from '../services/gpc.service.js';
import * as gpcMoney from '../services/gpc-monetization.service.js';
import { buildDataSafetyCsv } from '../services/gpc-data-safety.service.js';
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

/** Push just the listings section (start edit → listings → commit). */
export async function gpcListingsPush(options: CreatePlayAppOptions): Promise<void> {
  await ensureAuth();
  const { config } = await loadPlayConfigStrict(options.config);
  if (config.listings.length === 0) {
    logger.warn('No listings in config, nothing to push.');
    return;
  }
  await gpc.withEdit(config.app.package_name, async (editId) => {
    // Details are required to set default language; push them alongside listings.
    await gpc.updateAppDetails(config.app.package_name, editId, config.app.default_language, config.details);
    for (const listing of config.listings) {
      await gpc.updateListing(config.app.package_name, editId, listing);
    }
  });
  logger.success(`Pushed ${config.listings.length} listing(s).`);
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
  logger.success(`Processed ${config.subscriptions.length} subscription(s).`);
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

  const state = await gpc.fetchAppState(config.app.package_name);
  if (state && !state.hasUploadedBuild) {
    logger.fatal('No build uploaded to any Play Console track.');
    logger.info('Google Play requires at least one build with the BILLING permission on a');
    logger.info('track (internal testing is enough) before in-app products can be created.');
    logger.info('Upload one with: kappmaker publish --platform android --track internal');
    process.exit(1);
  }

  await gpcMoney.setupInAppProducts(config.app.package_name, config.in_app_products);
  logger.success(`Processed ${config.in_app_products.length} in-app product(s).`);
}

/**
 * Push only the data safety declaration. Priority:
 *   1. `data_safety_csv_path` — uploaded verbatim (escape hatch).
 *   2. `data_safety` JSON block — converted via buildDataSafetyCsv().
 */
export async function gpcDataSafetyPush(options: CreatePlayAppOptions): Promise<void> {
  await ensureAuth();
  const { config } = await loadPlayConfigStrict(options.config);

  // (1) Raw CSV escape hatch
  if (config.data_safety_csv_path) {
    const csvPath = path.isAbsolute(config.data_safety_csv_path)
      ? config.data_safety_csv_path
      : path.resolve(config.data_safety_csv_path);
    if (!(await fs.pathExists(csvPath))) {
      logger.fatal(`data_safety_csv_path is set to ${csvPath} but the file does not exist.`);
      process.exit(1);
    }
    const csvContents = await fs.readFile(csvPath, 'utf8');
    if (!csvContents.trim()) {
      logger.fatal(`Data safety CSV at ${csvPath} is empty.`);
      process.exit(1);
    }
    await gpc.updateDataSafety(config.app.package_name, csvContents);
    logger.success(`Pushed data safety CSV from ${csvPath}`);
    return;
  }

  // (2) Structured JSON
  if (!config.data_safety) {
    logger.fatal('Config has no `data_safety` block or `data_safety_csv_path`.');
    logger.info('Add a `data_safety: { apply_defaults: true }` block to your config and rerun.');
    process.exit(1);
  }

  const csv = buildDataSafetyCsv(config.data_safety);
  await gpc.updateDataSafety(config.app.package_name, csv);
  logger.success('Pushed data safety declaration (built from data_safety JSON).');
}
