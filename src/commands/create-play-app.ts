import path from 'node:path';
import fs from 'fs-extra';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { promptInput, confirm } from '../utils/prompt.js';
import { loadConfig, getGooglePlayTemplate } from '../utils/config.js';
import * as gpc from '../services/gpc.service.js';
import * as gpcMoney from '../services/gpc-monetization.service.js';
import { buildDataSafetyCsv } from '../services/gpc-data-safety.service.js';
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
  let dsSummary: string;
  if (config.data_safety_csv_path) dsSummary = `CSV file: ${config.data_safety_csv_path}`;
  else if (config.data_safety) dsSummary = `JSON (apply_defaults=${config.data_safety.apply_defaults !== false})`;
  else dsSummary = chalk.gray('(not set)');
  console.log(`  ${chalk.cyan('Data safety:')}  ${dsSummary}`);
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

  // Step 4: Verify app exists on Play Console. Default language was already
  // detected during config load (loadPlayConfig → detectAndApplyDefaultLanguage)
  // and written into config.app.default_language.
  logger.step(4, TOTAL_STEPS, 'Verifying app on Google Play Console');
  const exists = await gpc.checkAppExists(config.app.package_name);
  if (!exists) {
    logger.fatal(`App "${config.app.package_name}" not found on Google Play Console.`);
    logger.info(`Create it manually at: ${gpc.PLAY_CONSOLE_URL}, then rerun.`);
    process.exit(1);
  }

  const defaultListing = config.listings.find((l) => l.locale === config.app.default_language);
  const hasUsableDefaultListing = !!(defaultListing?.title && defaultListing.title.trim().length > 0);

  if (!hasUsableDefaultListing) {
    logger.warn(`Default-language listing (${config.app.default_language}) has no title.`);
    logger.info('Fill in listings[].title/short_description/full_description in the config and re-run.');
    logger.info('Skipping steps 5-7 (app details + listings + commit) for this run.');
  } else {
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

    // Step 6: Update store listings per locale (skipping any that are still blank)
    logger.step(6, TOTAL_STEPS, 'Updating store listings');
    for (const listing of config.listings) {
      if (!listing.title || listing.title.trim().length === 0) {
        logger.warn(`Skipping ${listing.locale} listing — title is empty.`);
        continue;
      }
      await gpc.updateListing(config.app.package_name, editId, listing);
    }

    // Step 7: Commit edit
    logger.step(7, TOTAL_STEPS, 'Committing Play Console edit');
    await gpc.commitEdit(config.app.package_name, editId);
  }

  // Step 8: Create / reuse subscriptions (monetization API, outside edit).
  // Subscriptions must contain a listing in the app's default language —
  // `setupSubscriptions` auto-clones the first entry with that locale if missing.
  //
  // Pre-flight: Google Play rejects monetization writes unless the app has at
  // least one build (with the BILLING permission) uploaded to some track —
  // internal testing is enough. Skip step 8 & 9 loudly if that's not the case.
  logger.step(8, TOTAL_STEPS, 'Setting up subscriptions');
  if (cachedAppState && !cachedAppState.hasUploadedBuild) {
    logger.warn('Skipping subscriptions — no build uploaded to any Play Console track.');
    logger.info('Google Play requires at least one build (with BILLING permission) uploaded');
    logger.info('to a track before subscriptions/IAPs can be created via the API.');
    logger.info('Upload one with: kappmaker publish --platform android --track internal');
    logger.info('Then rerun: kappmaker gpc setup');
  } else {
    await gpcMoney.setupSubscriptions(config.app.package_name, config.subscriptions, config.app.default_language);
  }

  // Step 9: Create / reuse one-time in-app products
  logger.step(9, TOTAL_STEPS, 'Setting up in-app products');
  if (cachedAppState && !cachedAppState.hasUploadedBuild) {
    logger.warn('Skipping in-app products — no build uploaded to any Play Console track.');
  } else {
    await gpcMoney.setupInAppProducts(config.app.package_name, config.in_app_products);
  }

  // Step 10: Data safety declaration (standalone endpoint, CSV upload).
  // POST /applications/{pkg}/dataSafety expects `{ safetyLabels: <csv-string> }`
  // where the CSV is an app-specific export from Play Console → Policy →
  // App content → Data safety → "Export to CSV". We don't ship a default
  // because the question set differs per app.
  logger.step(10, TOTAL_STEPS, 'Updating data safety declaration');
  await pushDataSafetyFromConfig(config);

  // Step 11: Manual-only declarations. Google doesn't expose any of these
  // in the Publisher API v3 — verified against the discovery document
  // ($discovery/rest?version=v3). They must be completed in Play Console.
  logger.step(11, TOTAL_STEPS, 'Wrap-up — manual Play Console declarations');
  printManualDeclarationsChecklist(config.app.package_name);

  // Save updated config (currently unchanged, but mirrors ASC save-back behaviour)
  await fs.writeJson(configPath, config, { spaces: 2 });
  logger.info(`Config saved to ${configPath}`);

  logger.done();
}

/**
 * Tracks the Play Console state fetched once during loadPlayConfig so step 8
 * can reuse it without a second probe. Populated as a side-effect of
 * `detectAndApplyDefaultLanguage`.
 */
let cachedAppState: import('../services/gpc.service.js').PlayAppState | null = null;

async function loadPlayConfig(configPath?: string): Promise<{ config: GooglePlayConfig; configPath: string }> {
  const savePath = configPath ?? path.resolve(CONFIG_FILENAME);

  if (await fs.pathExists(savePath)) {
    logger.info(`Using config: ${savePath}`);
    const config = await fs.readJson(savePath) as GooglePlayConfig;
    migrateLegacyConfig(config);
    await detectAndApplyDefaultLanguage(config);
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

  // Detect Play's actual default language so the template's en-US placeholder
  // gets rewritten to whatever Play Console reports for the real app.
  await detectAndApplyDefaultLanguage(template);
  fillSubscriptionDefaults(template);

  await fs.ensureDir(path.dirname(savePath));
  await fs.writeJson(savePath, template, { spaces: 2 });
  logger.success(`Config saved to ${savePath}`);

  return { config: template, configPath: savePath };
}

/**
 * Probe Play Console for the app's current default language and rewrite the
 * config in place to match. Used to auto-heal configs whose `default_language`
 * was set to the template's fallback ("en-US") but the real app uses something
 * else (e.g. "en-GB"). The store-listing whose locale equals the stale default
 * is also renamed to the detected locale, provided no listing already exists
 * for the new locale.
 *
 * Graceful: if the probe fails (no network, restricted service account, app
 * not found), leaves `config.app.default_language` untouched and moves on.
 */
async function detectAndApplyDefaultLanguage(config: GooglePlayConfig): Promise<void> {
  if (!config.app.package_name) return;

  const state = await gpc.fetchAppState(config.app.package_name);
  cachedAppState = state;
  if (!state) return;

  const detected = state.defaultLanguage;
  if (!detected) return;

  if (config.app.default_language === detected) {
    logger.info(`Play Console default language: ${detected} (matches config).`);
  } else {
    const stale = config.app.default_language;
    logger.warn(`Play Console default language is ${detected}, but config had ${stale}.`);
    logger.info(`Auto-updating config to use "${detected}".`);
    config.app.default_language = detected;

    // Rename the stale-locale store listing so it doesn't get abandoned.
    const staleListing = config.listings.find((l) => l.locale === stale);
    const hasDetectedListing = config.listings.some((l) => l.locale === detected);
    if (staleListing && !hasDetectedListing) {
      staleListing.locale = detected;
      logger.info(`Renamed listing locale "${stale}" → "${detected}".`);
    }
  }

  if (state.hasUploadedBuild) {
    logger.info(`Play Console tracks with uploaded builds: ${state.tracksWithReleases.join(', ')}`);
  } else {
    logger.warn('No uploaded build found on any Play Console track.');
  }
}

/**
 * Print a checklist of policy declarations that Google's Play Publisher API
 * does NOT expose. All of these must be completed in Play Console before
 * publishing — verified against the v3 discovery document.
 */
function printManualDeclarationsChecklist(packageName: string): void {
  const appContentUrl = `https://play.google.com/console/u/0/developers/-/app/-/app-content`;
  console.log('');
  console.log(chalk.bold('  The following App content policy items are not in the Play Publisher API.'));
  console.log(chalk.bold('  Complete them manually in Play Console before publishing:'));
  console.log('');
  const items = [
    'Content rating (IARC questionnaire)',
    'Target audience and content (age groups, child-directed)',
    'Ads declaration (does your app contain ads?)',
    'App access declaration (demo credentials for review if login-walled)',
    'Government apps declaration',
    'Financial features declaration',
    'Health apps declaration (SaMD, health data, health research)',
    'News apps declaration',
    'Gambling declaration',
    'COVID-19 contact tracing declaration (if applicable)',
    'Advertising ID usage declaration',
    'Families policy compliance (if targeting children)',
    'App pricing tier (free vs paid — set at app creation)',
  ];
  for (const item of items) {
    console.log(`    ${chalk.gray('☐')} ${item}`);
  }
  console.log('');
  console.log(chalk.gray('  Open the App content page at:'));
  console.log(`    ${chalk.cyan(appContentUrl)}`);
  console.log(chalk.gray(`    (select your "${packageName}" app from the list)`));
  console.log('');
}

/**
 * Push data safety declaration. Priority:
 *   1. `data_safety_csv_path` file (if set and exists) — uploaded verbatim,
 *      the escape hatch for users who exported a CSV from Play Console.
 *   2. `data_safety` JSON block — converted to CSV via buildDataSafetyCsv()
 *      using kappmaker defaults + user overrides.
 *   3. Skip with a helpful message.
 */
async function pushDataSafetyFromConfig(config: GooglePlayConfig): Promise<void> {
  // (1) Raw CSV escape hatch takes priority when explicitly set.
  if (config.data_safety_csv_path) {
    const csvPath = path.isAbsolute(config.data_safety_csv_path)
      ? config.data_safety_csv_path
      : path.resolve(config.data_safety_csv_path);
    if (!(await fs.pathExists(csvPath))) {
      logger.warn(`data_safety_csv_path is set to ${csvPath} but the file does not exist.`);
      logger.info('Skipping data safety push.');
      return;
    }
    const csvContents = await fs.readFile(csvPath, 'utf8');
    if (!csvContents.trim()) {
      logger.warn(`Data safety CSV at ${csvPath} is empty — skipping.`);
      return;
    }
    await gpc.updateDataSafety(config.app.package_name, csvContents);
    logger.info(`Pushed data safety CSV from ${csvPath}`);
    return;
  }

  // (2) Structured JSON (primary path).
  if (config.data_safety !== undefined) {
    const csv = buildDataSafetyCsv(config.data_safety);
    await gpc.updateDataSafety(config.app.package_name, csv);
    logger.info('Pushed data safety declaration (built from data_safety JSON).');
    return;
  }

  // (3) Nothing configured — skip cleanly.
  logger.info('No data_safety in config, skipping.');
  logger.info('To enable: add a `data_safety: { apply_defaults: true }` block to the config');
  logger.info('or set `data_safety_csv_path` to a Play-Console-exported CSV file.');
}

/**
 * Clean up known-legacy fields in an existing config so subsequent runs don't
 * trip over outdated values. Mutates `config` in place.
 *
 *  - Older KAppMaker templates had `data_safety: { dataTypes, securityPractices }`
 *    which does NOT match Google's API (POST /dataSafety takes a CSV wrapped in
 *    a `safetyLabels` string). Replace any legacy object with the new
 *    `data_safety_csv_path` field pointing at `Assets/data-safety.csv`.
 *  - `subscriptions[].product_id` values ending in `.v1.<digits>.v1` are the
 *    iOS-style format that included the price suffix. Strip the suffix so
 *    `fillSubscriptionDefaults` can regenerate the canonical Play product ID.
 */
function migrateLegacyConfig(config: GooglePlayConfig): void {
  // Legacy data_safety object → CSV path.
  // The field is `any`-shaped via a cast so we can safely detect and drop it
  // without declaring it on the current type.
  const legacy = config as unknown as { data_safety?: unknown };
  if (legacy.data_safety !== undefined) {
    delete legacy.data_safety;
    if (config.data_safety_csv_path === undefined) {
      config.data_safety_csv_path = '';
    }
  }

  const legacyProductIdRegex = /^(.+\.premium\.[A-Za-z]+\.v1)\.\d+\.v1$/;
  for (const sub of config.subscriptions ?? []) {
    if (sub.product_id) {
      const match = legacyProductIdRegex.exec(sub.product_id);
      if (match) {
        sub.product_id = match[1];
      }
    }
  }
}

/**
 * Auto-generate Google Play subscription product IDs, base plan IDs, and
 * localized listing titles, aligned with the Adapty / App Store naming:
 *
 *   product_id:  {appname}.premium.{period}.v1                 (no price)
 *   base_plan_id: autorenew-{period}-{priceDigits}-v1           (e.g. autorenew-weekly-699-v1)
 *   listing title: {AppName} Premium {PeriodLabel}              (e.g. "Mangit Premium Weekly")
 *
 * The period is derived from the ISO 8601 billing_period (P1W→weekly, P1M→monthly,
 * P3M→quarterly, P6M→semiannual, P1Y→yearly). priceDigits is the first regional
 * config's price with the decimal removed (e.g. "6.99" → "699").
 *
 * Existing non-legacy IDs are preserved. Legacy base_plan_id values (the raw
 * period word like "weekly") are normalized to the new format.
 */
function fillSubscriptionDefaults(config: GooglePlayConfig): void {
  const appName = config.app.name;
  const appNameLower = appName.toLowerCase().replace(/\s+/g, '');
  if (!appNameLower) return;

  const billingPeriodToSlug: Record<string, string> = {
    P1W: 'weekly',
    P1M: 'monthly',
    P2M: 'twomonths',
    P3M: 'quarterly',
    P6M: 'semiannual',
    P1Y: 'yearly',
  };

  const periodLabel: Record<string, string> = {
    weekly: 'Weekly',
    monthly: 'Monthly',
    twomonths: 'Two Months',
    quarterly: 'Quarterly',
    semiannual: 'Semi Annual',
    yearly: 'Yearly',
  };

  const LEGACY_BASE_PLAN_IDS = new Set([
    'weekly', 'monthly', 'twomonths', 'quarterly', 'semiannual', 'yearly',
  ]);

  for (const sub of config.subscriptions) {
    const basePlan = sub.base_plans[0];
    if (!basePlan) continue;

    const period = billingPeriodToSlug[basePlan.billing_period] ?? basePlan.base_plan_id;
    const label = periodLabel[period] ?? period;
    const price = basePlan.regional_configs[0]?.price ?? '0';
    const priceTag = price.replace('.', '');

    // Product ID: appname.premium.weekly.v1
    if (!sub.product_id) {
      sub.product_id = `${appNameLower}.premium.${period}.v1`;
    }

    // Base plan ID: autorenew-weekly-699-v1 (normalize legacy "weekly"/"yearly"/etc.)
    if (!basePlan.base_plan_id || LEGACY_BASE_PLAN_IDS.has(basePlan.base_plan_id)) {
      basePlan.base_plan_id = `autorenew-${period}-${priceTag}-v1`;
    }

    // Subscription listing title: "Mangit Premium Weekly" (only if empty or legacy)
    for (const listing of sub.listings) {
      const LEGACY_TITLES = new Set(['Weekly Premium', 'Monthly Premium', 'Yearly Premium', 'Quarterly Premium', 'Semi Annual Premium']);
      if (!listing.title || LEGACY_TITLES.has(listing.title)) {
        listing.title = `${appName} Premium ${label}`;
      }
    }
  }
}
