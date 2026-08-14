import path from 'node:path';
import fs from 'fs-extra';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { promptInput, confirm } from '../utils/prompt.js';
import { loadConfig, getRevenueCatTemplate, saveRevenueCatKey } from '../utils/config.js';
import * as rc from '../services/revenuecat.service.js';
import { creditPackProductId } from '../services/credit-pack.defaults.js';
import type {
  RevenueCatConfig,
  RevenueCatProduct,
  CreateRevenueCatOptions,
} from '../types/revenuecat.js';

const CONFIG_FILENAME = 'Assets/revenuecat-config.json';
const TOTAL_STEPS = 7;

/**
 * RevenueCat store identifiers differ per store:
 * - App Store: the ASC product ID as-is.
 * - Play subscriptions: "productId:basePlanId" — RevenueCat requires the
 *   base-plan-qualified form; the bare subscription ID is rejected as ambiguous.
 * - Play one-time products: the SKU as-is.
 */
export function playStoreIdentifier(product: RevenueCatProduct): string {
  if (typeof product.credits === 'number' || !product.android_base_plan_id) {
    return product.android_product_id;
  }
  return `${product.android_product_id}:${product.android_base_plan_id}`;
}

/** Standard RevenueCat package lookup keys per period; credit packs get a custom key. */
export function packageLookupKey(product: RevenueCatProduct): string {
  if (typeof product.credits === 'number') return `credit_pack_${product.credits}`;
  const byPeriod: Record<string, string> = {
    weekly: '$rc_weekly',
    monthly: '$rc_monthly',
    twomonths: '$rc_two_month',
    quarterly: '$rc_three_month',
    semiannual: '$rc_six_month',
    yearly: '$rc_annual',
    annual: '$rc_annual',
    lifetime: '$rc_lifetime',
  };
  return byPeriod[product.period] ?? product.period;
}

export async function revenuecatSetup(options: CreateRevenueCatOptions): Promise<void> {
  // Step 1: Load config first — the bundle ID is what selects the per-app API key.
  logger.step(1, TOTAL_STEPS, 'Loading RevenueCat config');
  const { config, configPath } = await loadRevenueCatConfig(options.config);

  // Step 2: Resolve + validate the API key. v2 secret keys are PROJECT-scoped
  // (minted inside one project, can only see it), so the key both authenticates
  // and identifies the project.
  logger.step(2, TOTAL_STEPS, 'Validating RevenueCat API key');
  if (options.apiKey) rc.useApiKey(options.apiKey);
  await rc.requireApiKey(config.app.bundle_id);
  const projects = await rc.listProjects();
  if (projects.length === 0) {
    logger.fatal('This API key can see no RevenueCat project — it may be revoked or a v1 key.');
    process.exit(1);
  }

  let projectId = config.project_id;
  if (!projectId) {
    // A project-scoped key sees exactly its own project; >1 only happens with
    // rare account-wide keys, in which case ask.
    if (projects.length === 1) {
      projectId = projects[0].id;
      logger.info(`Using project: ${projects[0].name} (${projectId})`);
    } else {
      console.log('');
      console.log(chalk.bold('  This API key can see several projects:'));
      for (const p of projects) console.log(`    ${chalk.cyan(p.id)}  ${p.name}`);
      console.log('');
      projectId = await promptInput('  Project ID to use: ');
      if (!projects.some((p) => p.id === projectId)) {
        logger.fatal(`Project ${projectId} is not in the list above.`);
        process.exit(1);
      }
    }
    config.project_id = projectId;
  } else if (!projects.some((p) => p.id === projectId)) {
    logger.fatal(`This API key belongs to project ${projects[0].id}, not ${projectId} from the config.`);
    logger.info('RevenueCat keys are per-project — pass the key created inside this app\'s project.');
    process.exit(1);
  }

  // Remember an explicitly-passed key for this app, so every later command
  // (subscription add, iap add) resolves it without flags.
  if (options.apiKey && config.app.bundle_id) {
    await saveRevenueCatKey(config.app.bundle_id, options.apiKey);
    logger.info(`API key saved for ${config.app.bundle_id} (~/.config/kappmaker/revenuecat-keys.json).`);
  }

  logger.info(`App: ${config.app.title} (${config.app.bundle_id})`);

  console.log('');
  console.log(chalk.bold('  Review before proceeding:\n'));
  console.log(`  ${chalk.cyan('Config:')}       ${configPath}`);
  console.log(`  ${chalk.cyan('Project:')}      ${projectId}`);
  console.log(`  ${chalk.cyan('App:')}          ${config.app.title}`);
  console.log(`  ${chalk.cyan('Bundle ID:')}    ${config.app.bundle_id}`);
  console.log(`  ${chalk.cyan('Package ID:')}   ${config.app.package_id}`);
  console.log(`  ${chalk.cyan('Entitlements:')} ${config.entitlements.map((e) => e.lookup_key).join(', ')}`);
  console.log(`  ${chalk.cyan('Products:')}`);
  for (const product of config.products) {
    const ent = product.entitlement_lookup_key ?? config.entitlements[0]?.lookup_key ?? '?';
    console.log(`    ${chalk.gray('•')} ${product.title} (${product.period}, entitlement=${ent})`);
    console.log(`      iOS: ${product.ios_product_id || chalk.gray('(not set)')}`);
    console.log(`      Android: ${playStoreIdentifier(product) || chalk.gray('(not set)')}`);
  }
  console.log(`  ${chalk.cyan('Offerings:')}`);
  for (const offering of config.offerings) {
    console.log(`    ${chalk.gray('•')} ${offering.display_name} (${offering.identifier}) — ${offering.product_titles.length} package(s)`);
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

  // Re-read config in case the user edited it during confirmation.
  const finalConfig: RevenueCatConfig = await fs.readJson(configPath);
  Object.assign(config, finalConfig);
  config.project_id = projectId;

  // Step 3: Find or create the two store apps
  logger.step(3, TOTAL_STEPS, 'Finding or creating store apps');
  const apps = await rc.listApps(projectId);

  let iosAppId = config.app.ios_app_id;
  if (!iosAppId && config.app.bundle_id) {
    iosAppId = apps.find((a) => a.type === 'app_store' && a.app_store?.bundle_id === config.app.bundle_id)?.id;
    if (iosAppId) {
      logger.info(`Found existing App Store app: ${iosAppId}`);
    } else {
      const created = await rc.createAppStoreApp(projectId, `${config.app.title} (iOS)`, config.app.bundle_id);
      iosAppId = created.id;
      logger.info(`Created App Store app: ${iosAppId}`);
    }
    config.app.ios_app_id = iosAppId;
  }

  let androidAppId = config.app.android_app_id;
  if (!androidAppId && config.app.package_id) {
    androidAppId = apps.find((a) => a.type === 'play_store' && a.play_store?.package_name === config.app.package_id)?.id;
    if (androidAppId) {
      logger.info(`Found existing Play Store app: ${androidAppId}`);
    } else {
      const created = await rc.createPlayStoreApp(projectId, `${config.app.title} (Android)`, config.app.package_id);
      androidAppId = created.id;
      logger.info(`Created Play Store app: ${androidAppId}`);
    }
    config.app.android_app_id = androidAppId;
  }

  // Step 4: Entitlements (idempotent by lookup_key)
  logger.step(4, TOTAL_STEPS, 'Setting up entitlements');
  const existingEntitlements = await rc.listEntitlements(projectId);
  const entitlementIdByKey = new Map<string, string>();
  for (const e of existingEntitlements) entitlementIdByKey.set(e.lookup_key, e.id);

  for (const entitlement of config.entitlements) {
    if (entitlementIdByKey.has(entitlement.lookup_key)) {
      entitlement.entitlement_id = entitlementIdByKey.get(entitlement.lookup_key)!;
      logger.info(`Entitlement "${entitlement.lookup_key}" already exists.`);
      continue;
    }
    const created = await rc.createEntitlement(projectId, entitlement.lookup_key, entitlement.display_name);
    entitlement.entitlement_id = created.id;
    entitlementIdByKey.set(entitlement.lookup_key, created.id);
  }

  // Step 5: Products (idempotent by store_identifier + app)
  logger.step(5, TOTAL_STEPS, 'Connecting store products');
  const existingProducts = await rc.listProducts(projectId);
  const productIdByStoreIdentifier = new Map<string, string>();
  for (const p of existingProducts) {
    productIdByStoreIdentifier.set(`${p.app_id}|${p.store_identifier}`, p.id);
  }

  // Collect the RevenueCat product IDs per entitlement / per config-product title.
  const rcProductIdsByEntitlement = new Map<string, string[]>();
  const rcProductIdsByTitle = new Map<string, string[]>();

  const connect = async (
    appId: string | undefined,
    storeIdentifier: string,
    type: rc.RcProductType,
    product: RevenueCatProduct,
    side: 'ios' | 'android',
  ): Promise<void> => {
    if (!appId || !storeIdentifier) return;
    const cacheKey = `${appId}|${storeIdentifier}`;
    let rcId = productIdByStoreIdentifier.get(cacheKey);
    if (rcId) {
      logger.info(`Product "${storeIdentifier}" already connected.`);
    } else {
      const created = await rc.createProduct(projectId, appId, storeIdentifier, type, product.title);
      rcId = created.id;
      productIdByStoreIdentifier.set(cacheKey, rcId);
    }
    if (side === 'ios') product.rc_ios_product_id = rcId;
    else product.rc_android_product_id = rcId;

    const entKey = product.entitlement_lookup_key ?? config.entitlements[0]?.lookup_key ?? '';
    rcProductIdsByEntitlement.set(entKey, [...(rcProductIdsByEntitlement.get(entKey) ?? []), rcId]);
    rcProductIdsByTitle.set(product.title, [...(rcProductIdsByTitle.get(product.title) ?? []), rcId]);
  };

  for (const product of config.products) {
    fillProductIds(product, config.app.title);
    const isPack = typeof product.credits === 'number';
    await connect(iosAppId, product.ios_product_id, isPack ? 'consumable' : 'subscription', product, 'ios');
    await connect(androidAppId, playStoreIdentifier(product), isPack ? 'one_time' : 'subscription', product, 'android');
  }

  // Step 6: Attach products to their entitlements (idempotent server-side).
  logger.step(6, TOTAL_STEPS, 'Attaching products to entitlements');
  for (const [lookupKey, productIds] of rcProductIdsByEntitlement) {
    const entitlementId = entitlementIdByKey.get(lookupKey);
    if (!entitlementId) {
      logger.warn(`No entitlement "${lookupKey}" — skipping ${productIds.length} product attachment(s).`);
      continue;
    }
    try {
      await rc.attachProductsToEntitlement(projectId, entitlementId, productIds);
      logger.info(`Attached ${productIds.length} product(s) to "${lookupKey}".`);
    } catch (error) {
      // Attaching an already-attached product errors; that is a re-run, not a failure.
      logger.info(`Entitlement "${lookupKey}": ${(error as Error).message.includes('already') ? 'products already attached.' : (error as Error).message}`);
    }
  }

  // Step 7: Offerings + packages
  logger.step(7, TOTAL_STEPS, 'Creating offerings and packages');
  const existingOfferings = await rc.listOfferings(projectId);
  const offeringIdByKey = new Map<string, string>();
  for (const o of existingOfferings) offeringIdByKey.set(o.lookup_key, o.id);

  for (const offering of config.offerings) {
    let offeringId = offeringIdByKey.get(offering.identifier);
    if (offeringId) {
      logger.info(`Offering "${offering.identifier}" already exists.`);
    } else {
      const created = await rc.createOffering(projectId, offering.identifier, offering.display_name);
      offeringId = created.id;
    }
    offering.offering_id = offeringId;

    const existingPackages = await rc.listPackages(projectId, offeringId);
    const packageIdByKey = new Map(existingPackages.map((p) => [p.lookup_key, p.id]));

    for (const title of offering.product_titles) {
      const product = config.products.find((p) => p.title === title);
      if (!product) {
        logger.warn(`Offering "${offering.identifier}" references unknown product "${title}". Skipping.`);
        continue;
      }
      const lookupKey = packageLookupKey(product);
      let packageId = packageIdByKey.get(lookupKey);
      if (packageId) {
        logger.info(`Package "${lookupKey}" already exists in "${offering.identifier}".`);
      } else {
        const created = await rc.createPackage(projectId, offeringId, lookupKey, product.title);
        packageId = created.id;
      }
      const rcIds = rcProductIdsByTitle.get(title) ?? [];
      try {
        await rc.attachProductsToPackage(projectId, packageId, rcIds);
      } catch (error) {
        logger.info(`Package "${lookupKey}": ${(error as Error).message.includes('already') ? 'products already attached.' : (error as Error).message}`);
      }
    }
  }

  await fs.writeJson(configPath, config, { spaces: 2 });
  logger.info(`Config saved to ${configPath}`);

  printPostSetupChecklist(projectId);
  logger.done();
}

/**
 * RevenueCat needs store credentials to validate purchases — those are
 * dashboard-only uploads, and the SDK needs the per-platform public API keys.
 * Print the checklist so setup doesn't silently end 90% done.
 */
function printPostSetupChecklist(projectId: string): void {
  console.log('');
  console.log(chalk.bold('  Finish in the RevenueCat dashboard (one-time, dashboard-only):'));
  console.log('');
  console.log(`    ${chalk.gray('☐')} ${chalk.bold('App Store Connect API key')} — same .p8 / Key ID / Issuer ID as ${chalk.cyan('kappmaker create-appstore-app')} (App settings → App Store Connect API)`);
  console.log(`    ${chalk.gray('☐')} ${chalk.bold('Play service credentials')} — same service-account JSON as ${chalk.cyan('kappmaker gpc setup')} (App settings → Service credentials)`);
  console.log(`    ${chalk.gray('☐')} ${chalk.bold('SDK API keys')} — copy each app's public key (appl_… / goog_…) into the mobile app config`);
  console.log(`    ${chalk.gray('☐')} ${chalk.bold('Current offering')} — mark "default" as current if it isn't already`);
  console.log('');
  console.log(chalk.gray(`  Dashboard: https://app.revenuecat.com/projects/${projectId}`));
  console.log('');
}

async function loadRevenueCatConfig(
  configPath?: string,
): Promise<{ config: RevenueCatConfig; configPath: string }> {
  const savePath = configPath ?? path.resolve(CONFIG_FILENAME);

  if (await fs.pathExists(savePath)) {
    logger.info(`Using config: ${savePath}`);
    const config: RevenueCatConfig = await fs.readJson(savePath);
    for (const product of config.products) fillProductIds(product, config.app.title);
    await fs.writeJson(savePath, config, { spaces: 2 });
    return { config, configPath: savePath };
  }

  logger.info("No config file found. Let's set up the basics.");
  const config = getRevenueCatTemplate() as unknown as RevenueCatConfig;
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

  for (const product of config.products) fillProductIds(product, config.app.title);

  await fs.ensureDir(path.dirname(savePath));
  await fs.writeJson(savePath, config, { spaces: 2 });
  logger.success(`Config saved to ${savePath}`);

  return { config, configPath: savePath };
}

/** Same product-ID scheme as ASC / Play / Adapty, so all four systems align. */
function fillProductIds(product: RevenueCatProduct, appName: string): void {
  const appNameLower = appName.toLowerCase().replace(/\s+/g, '');
  if (!appNameLower) return;

  if (typeof product.credits === 'number') {
    const id = creditPackProductId(product.credits, product.price || '0', appNameLower);
    if (!product.ios_product_id) product.ios_product_id = id;
    if (!product.android_product_id) product.android_product_id = id;
    product.android_base_plan_id = '';
    return;
  }

  const periodSuffix: Record<string, string> = {
    weekly: 'weekly',
    monthly: 'monthly',
    twomonths: 'twomonths',
    quarterly: 'quarterly',
    semiannual: 'semiannual',
    yearly: 'yearly',
    annual: 'yearly',
  };
  const suffix = periodSuffix[product.period] ?? product.period;
  const priceTag = (product.price || '0').replace('.', '');

  if (!product.ios_product_id) {
    product.ios_product_id = `${appNameLower}.premium.${suffix}.v1.${priceTag}.v1`;
  }
  if (!product.android_product_id) {
    product.android_product_id = `${appNameLower}.premium.${suffix}.v1`;
  }
  if (!product.android_base_plan_id) {
    product.android_base_plan_id = `autorenew-${suffix}-${priceTag}-v1`;
  }
}
