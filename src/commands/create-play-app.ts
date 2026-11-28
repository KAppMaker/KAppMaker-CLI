import path from 'node:path';
import fs from 'fs-extra';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { promptInput, confirm } from '../utils/prompt.js';
import { loadConfig, getGooglePlayTemplate } from '../utils/config.js';
import * as gpc from '../services/gpc.service.js';
import * as gpcMoney from '../services/gpc-monetization.service.js';
import { pushDataSafetyFromConfig } from '../services/gpc-data-safety-push.service.js';
import { pushListings } from '../services/gpc-listings.service.js';
import { resolveRegionsVersion, printCoverageReport, resetMonetizationReport, monetizationReport } from '../services/gpc-regions.js';
import { StepReport } from '../utils/step-report.js';
import { creditPackProductId } from '../services/credit-pack.defaults.js';
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
  for (const iap of config.in_app_products) {
    const priceLabel = `$${iap.default_price.price}`;
    console.log(`    ${chalk.gray('•')} ${iap.sku} (${priceLabel})`);
  }
  let dsSummary: string;
  if (config.data_safety_csv_path) dsSummary = `CSV file: ${config.data_safety_csv_path}`;
  else if (config.data_safety) dsSummary = `JSON (apply_defaults=${config.data_safety.apply_defaults !== false})`;
  else dsSummary = chalk.gray('(not set)');
  console.log(`  ${chalk.cyan('Data safety:')}  ${dsSummary}`);
  console.log('');
  console.log(chalk.gray('  Edit the config file to change any values before continuing.'));
  console.log('');

  const shouldContinue = await confirm('  Continue with these settings?', { assumable: true });
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

  const report = new StepReport('Google Play setup');
  report.ok('Verify app on Play Console', config.app.package_name);
  await resolveRegionsVersion(options.regionsVersion);
  resetMonetizationReport();

  // Steps 5-7: app details + listings inside one edit. Listings are merged with
  // what is live (an empty config field never blanks Play), diffed, read back,
  // and only then committed. Any failure drops the edit and is reported.
  logger.step(5, TOTAL_STEPS, 'Updating app details and store listings');
  await report.run('App details + store listings (edit committed)', async () => {
    const result = await gpc.withEdit(config.app.package_name, async (editId) => {
      logger.info(`Edit ID: ${editId}`);
      await gpc.updateAppDetails(config.app.package_name, editId, config.app.default_language, config.details);
      return pushListings(config.app.package_name, editId, config.listings, { allowEmpty: options.allowEmpty === true, fallbackTitle: config.app.name });
    });
    return result;
  }, { detail: (r) => (r.pushed.length ? `pushed ${r.pushed.join(', ')}` : 'already matched Play') });

  // Steps 8-9: monetization. Google rejects monetization writes until a build
  // (with BILLING) is on some track; that is a SKIP with the fix, not an OK.
  const noBuild = cachedAppState && !cachedAppState.hasUploadedBuild;
  logger.step(8, TOTAL_STEPS, 'Setting up subscriptions');
  if (noBuild) {
    report.skip('Subscriptions', 'no build on any track: kappmaker publish --platform android --track internal, then rerun');
  } else if (config.subscriptions.length === 0) {
    report.skip('Subscriptions', 'none in config');
  } else {
    await report.run('Subscriptions', async () => {
      const mark = markMonetization();
      await gpcMoney.setupSubscriptions(config.app.package_name, config.subscriptions, config.app.default_language);
      assertMonetization(mark);
    });
  }

  logger.step(9, TOTAL_STEPS, 'Setting up in-app products');
  if (noBuild) {
    report.skip('In-app products', 'no build on any track');
  } else if (config.in_app_products.length === 0) {
    report.skip('In-app products', 'none in config');
  } else {
    await report.run('In-app products', async () => {
      const mark = markMonetization();
      await gpcMoney.setupInAppProducts(config.app.package_name, config.in_app_products, { recreateStuck: options.recreateStuck === true });
      assertMonetization(mark);
    });
  }
  printCoverageReport();

  // Step 10: Data safety. Fails loudly on a non-2xx (it printed OK on a 400).
  logger.step(10, TOTAL_STEPS, 'Updating data safety declaration');
  await report.run('Data safety', async () => {
    const outcome = await pushDataSafetyFromConfig(config, { verify: true });
    if (outcome === 'not-configured') throw new Error('no data_safety block or data_safety_csv_path in the config');
  });

  // Step 11: Manual-only declarations. Google doesn't expose any of these
  // in the Publisher API v3 — verified against the discovery document
  // ($discovery/rest?version=v3). They must be completed in Play Console.
  logger.step(11, TOTAL_STEPS, 'Wrap-up: manual Play Console declarations');
  printManualDeclarationsChecklist(config.app.package_name);

  // Save updated config (currently unchanged, but mirrors ASC save-back behaviour)
  await fs.writeJson(configPath, config, { spaces: 2 });
  logger.info(`Config saved to ${configPath}`);

  if (report.print()) logger.done();
}

/** Throw when the last monetization batch left a product short or failed (the coverage report names it). */
function markMonetization(): { c: number; f: number } {
  const r = monetizationReport();
  return { c: r.coverage.length, f: r.failures.length };
}

function assertMonetization(since: { c: number; f: number }): void {
  const all = monetizationReport();
  const coverage = all.coverage.slice(since.c);
  const failures = all.failures.slice(since.f);
  const short = coverage.filter((r) => r.priced < r.billable);
  if (failures.length > 0 || short.length > 0) {
    const parts = [...failures.map((f) => f.product), ...short.map((r) => `${r.product} (${r.priced}/${r.billable})`)];
    throw new Error(`not complete: ${parts.join(', ')}`);
  }
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
    fillIapDefaults(config);
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
  fillIapDefaults(template);

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
    'App pricing tier (free or paid, set when the app is created)',
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

/**
 * Auto-fill in-app product SKUs for credit-pack-shaped entries.
 * An entry is considered a credit pack when it has a `credits` field set;
 * other custom IAPs are left alone. SKU format matches ASC + Adapty so the
 * same product ID works on all three platforms:
 *
 *   sku: credit_pack_{credits}_{priceDigits}_{appname}
 */
function fillIapDefaults(config: GooglePlayConfig): void {
  if (!config.in_app_products) return;
  const appName = config.app.name;
  const appNameLower = appName.toLowerCase().replace(/\s+/g, '');
  if (!appNameLower) return;

  for (const iap of config.in_app_products) {
    if (typeof iap.credits !== 'number') continue;
    const price = iap.default_price?.price ?? '0';
    if (!iap.sku) {
      iap.sku = creditPackProductId(iap.credits, price, appNameLower);
    }
  }
}
