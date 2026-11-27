import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { execa } from 'execa';
import { run, runStreaming } from '../utils/exec.js';
import { logger } from '../utils/logger.js';
import { confirm } from '../utils/prompt.js';
import { checkTool, toolById, versionAtLeast } from '../utils/prereqs.js';
import type { AdaptyProduct } from '../types/adapty.js';

// Same hosts and precedence as the adapty CLI (0.2x+): ADAPTY_API_URL, else
// the account's region (ADAPTY_REGION, or `region` saved by
// `adapty auth login --region eu`), else US.
const ADAPTY_API_HOSTS: Record<string, string> = {
  us: 'https://api-admin.adapty.io/api/v1/developer',
  eu: 'https://api-eu-admin.adapty.io/api/v1/developer',
};

export function adaptyApiBase(env: NodeJS.ProcessEnv, storedRegion?: string): string {
  if (env.ADAPTY_API_URL) return env.ADAPTY_API_URL.replace(/\/$/, '');
  const region = (env.ADAPTY_REGION || storedRegion || 'us').toLowerCase();
  return ADAPTY_API_HOSTS[region] ?? ADAPTY_API_HOSTS.us;
}

// `paywalls create --products` replaced the deprecated `--product-id` in
// adapty 0.33; older CLIs only know --product-id.
const ADAPTY_PRODUCTS_FLAG_VERSION = '0.33.0';
let adaptyVersion: string | null | undefined;

async function installedAdaptyVersion(): Promise<string | null> {
  if (adaptyVersion !== undefined) return adaptyVersion;
  const result = await checkTool(toolById('adapty'));
  adaptyVersion = result.version ?? null;
  return adaptyVersion;
}

export async function validateAdaptyInstalled(): Promise<void> {
  const status = await checkTool(toolById('adapty'));
  if (status.status === 'outdated') {
    logger.warn(`adapty CLI ${status.version} is older than ${status.min}. Upgrade: ${status.hint}`);
  }
  try {
    await execa('adapty', ['--version']);
  } catch {
    logger.warn('adapty CLI is not installed.');
    console.log('');
    const shouldInstall = await confirm('  Would you like to install it? (npm install -g adapty)', { yesAnswer: false });
    if (shouldInstall) {
      await runStreaming('npm', ['install', '-g', 'adapty'], { label: 'Installing adapty CLI...' });
    } else {
      logger.fatal('adapty CLI is required. Install manually: npm install -g adapty');
      process.exit(1);
    }
  }
}

export async function validateAdaptyAuth(): Promise<void> {
  const result = await run('adapty', ['auth', 'whoami'], {
    label: 'Checking Adapty authentication',
    allowFailure: true,
  });

  if (result.exitCode !== 0) {
    logger.warn('adapty CLI is not authenticated.');
    console.log('');
    const shouldLogin = await confirm('  Would you like to log in? (opens browser)', { yesAnswer: false });
    if (shouldLogin) {
      await runStreaming('adapty', ['auth', 'login'], { label: 'Logging in to Adapty...' });
      const recheck = await run('adapty', ['auth', 'whoami'], {
        label: 'Re-checking authentication',
        allowFailure: true,
      });
      if (recheck.exitCode !== 0) {
        logger.fatal('Authentication failed. Please try again manually: adapty auth login');
        process.exit(1);
      }
    } else {
      logger.fatal('Authentication required. Run: adapty auth login');
      process.exit(1);
    }
  }
}

export async function listApps(): Promise<Array<{ id: string; title: string; apple_bundle_id?: string; google_package_id?: string }>> {
  const result = await run('adapty', ['apps', 'list', '--json'], {
    label: 'Listing Adapty apps',
    allowFailure: true,
  });

  if (result.exitCode === 0) {
    try {
      const data = JSON.parse(result.stdout);
      const apps = data?.data ?? data ?? [];
      return apps.map((app: Record<string, unknown>) => ({
        id: app.id ?? app.app_id ?? '',
        title: app.title ?? '',
        apple_bundle_id: app.apple_bundle_id ?? '',
        google_package_id: app.google_package_id ?? '',
      }));
    } catch {
      // Fall through
    }
  }

  return [];
}

export async function findAppByBundleId(bundleId: string): Promise<{ id: string; sdk_key?: string } | null> {
  const apps = await listApps();
  for (const app of apps) {
    if (app.apple_bundle_id === bundleId || app.google_package_id === bundleId) {
      return { id: app.id };
    }
  }
  return null;
}

export async function createApp(
  title: string,
  bundleId: string,
  packageId: string,
): Promise<{ app_id: string; sdk_key: string }> {
  const args = [
    'apps', 'create',
    '--title', title,
    '--platform', 'ios',
    '--platform', 'android',
    '--apple-bundle-id', bundleId,
    '--google-bundle-id', packageId,
    '--json',
  ];

  const result = await run('adapty', args, {
    label: `Creating Adapty app: ${title}`,
  });

  try {
    const data = JSON.parse(result.stdout);
    const appData = data?.data ?? data;
    return {
      app_id: appData.app_id ?? appData.id ?? '',
      sdk_key: appData.sdk_key ?? '',
    };
  } catch {
    logger.fatal('Failed to parse Adapty app creation response.');
    process.exit(1);
  }
}

export async function listProducts(appId: string): Promise<Array<{ id: string; title: string }>> {
  const result = await run('adapty', ['products', 'list', '--app', appId, '--json'], {
    label: 'Listing existing products',
    allowFailure: true,
  });
  if (result.exitCode !== 0) return [];
  try {
    const data = JSON.parse(result.stdout);
    const products = data?.data ?? data ?? [];
    return products.map((p: Record<string, unknown>) => ({
      id: (p.id ?? p.product_id ?? '') as string,
      title: (p.title ?? '') as string,
    }));
  } catch {
    return [];
  }
}

export async function listPaywalls(appId: string): Promise<Array<{ id: string; title: string }>> {
  const result = await run('adapty', ['paywalls', 'list', '--app', appId, '--json'], {
    label: 'Listing existing paywalls',
    allowFailure: true,
  });
  if (result.exitCode !== 0) return [];
  try {
    const data = JSON.parse(result.stdout);
    const paywalls = data?.data ?? data ?? [];
    return paywalls.map((p: Record<string, unknown>) => ({
      id: (p.id ?? p.paywall_id ?? '') as string,
      title: (p.title ?? '') as string,
    }));
  } catch {
    return [];
  }
}

export async function listPlacements(appId: string): Promise<Array<{ developer_id: string }>> {
  const result = await run('adapty', ['placements', 'list', '--app', appId, '--json'], {
    label: 'Listing existing placements',
    allowFailure: true,
  });
  if (result.exitCode !== 0) return [];
  try {
    const data = JSON.parse(result.stdout);
    const placements = data?.data ?? data ?? [];
    return placements.map((p: Record<string, unknown>) => ({
      developer_id: (p.developer_id ?? '') as string,
    }));
  } catch {
    return [];
  }
}

export async function listAccessLevels(appId: string): Promise<Array<{ id: string; sdk_id: string; title: string }>> {
  const result = await run('adapty', ['access-levels', 'list', '--app', appId, '--json'], {
    label: 'Listing access levels',
    allowFailure: true,
  });

  if (result.exitCode === 0) {
    try {
      const data = JSON.parse(result.stdout);
      const levels = data?.data ?? data ?? [];
      return levels.map((level: Record<string, unknown>) => ({
        id: level.id ?? '',
        sdk_id: level.sdk_id ?? '',
        title: level.title ?? '',
      }));
    } catch {
      // Fall through
    }
  }

  return [];
}

export async function createAccessLevel(
  appId: string,
  sdkId: string,
  title: string,
): Promise<string> {
  const result = await run('adapty', [
    'access-levels', 'create',
    '--app', appId,
    '--sdk-id', sdkId,
    '--title', title,
    '--json',
  ], {
    label: `Creating access level: ${title}`,
    allowFailure: true,
  });

  if (result.exitCode === 0) {
    try {
      const data = JSON.parse(result.stdout);
      const levelData = data?.data ?? data;
      return levelData.id ?? '';
    } catch {
      // Fall through
    }
  }

  logger.info(`Access level "${sdkId}" may already exist, continuing...`);
  return '';
}

export async function createProduct(
  appId: string,
  product: AdaptyProduct,
  accessLevelId: string,
): Promise<string> {
  // The Adapty CLI v0.1.5 hardcodes a period whitelist that excludes "consumable",
  // even though the underlying REST API accepts it. Route consumables through the
  // API directly so credit packs can be marked as such instead of "lifetime".
  if (product.period === 'consumable') {
    return createProductViaApi(appId, product, accessLevelId);
  }

  const args = [
    'products', 'create',
    '--app', appId,
    '--title', product.title,
    '--access-level-id', accessLevelId,
    '--period', product.period,
    '--json',
  ];

  if (product.ios_product_id) {
    args.push('--ios-product-id', product.ios_product_id);
  }
  if (product.android_product_id) {
    args.push('--android-product-id', product.android_product_id);
  }
  if (product.android_base_plan_id) {
    args.push('--android-base-plan-id', product.android_base_plan_id);
  }
  // adapty 0.33+ stores a USD price on the product (shown in the dashboard,
  // needed for `adapty products push`). Older CLIs have no such flag.
  const version = await installedAdaptyVersion();
  if (product.price && version && versionAtLeast(version, ADAPTY_PRODUCTS_FLAG_VERSION)) {
    args.push('--price-usd', product.price);
  }

  const result = await run('adapty', args, {
    label: `Creating product: ${product.title}`,
    allowFailure: true,
  });

  if (result.exitCode === 0) {
    try {
      const data = JSON.parse(result.stdout);
      const productData = data?.data ?? data;
      return productData.id ?? productData.product_id ?? '';
    } catch {
      // Fall through
    }
  }

  logger.info(`Product "${product.title}" may already exist, continuing...`);
  return '';
}

async function getAdaptyAuth(): Promise<{ token: string | null; apiBase: string }> {
  const configPath = path.join(os.homedir(), '.config', 'adapty', 'config.json');
  let cfg: { access_token?: string; region?: string } | null = null;
  try {
    cfg = await fs.readJson(configPath);
  } catch {
    // no stored session
  }
  return {
    token: process.env.ADAPTY_TOKEN ?? cfg?.access_token ?? null,
    apiBase: adaptyApiBase(process.env, cfg?.region),
  };
}

/** Direct REST-API path for periods the CLI doesn't accept (currently just "consumable"). */
async function createProductViaApi(
  appId: string,
  product: AdaptyProduct,
  accessLevelId: string,
): Promise<string> {
  const { token, apiBase } = await getAdaptyAuth();
  if (!token) {
    logger.warn(`Skipping "${product.title}" — could not read Adapty auth token. Run "adapty auth login" and retry.`);
    return '';
  }

  const body: Record<string, unknown> = {
    access_level_id: accessLevelId,
    period: product.period,
    title: product.title,
  };
  if (product.ios_product_id) body.ios_product_id = product.ios_product_id;
  if (product.android_product_id) body.android_product_id = product.android_product_id;
  if (product.android_base_plan_id) body.android_base_plan_id = product.android_base_plan_id;
  if (product.price) body.price_usd = product.price;

  const url = `${apiBase}/apps/${appId}/products/`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    logger.warn(`Could not create "${product.title}" via Adapty API: ${(err as Error).message}`);
    return '';
  }

  if (response.ok) {
    try {
      const data = await response.json() as { id?: string; product_id?: string };
      logger.info(`Creating product: ${product.title} (consumable, via API) — id ${data.id ?? data.product_id ?? '?'}`);
      return data.id ?? data.product_id ?? '';
    } catch {
      return '';
    }
  }

  const errText = await response.text().catch(() => '');
  if (errText.includes('already exists') || errText.includes('Duplicate')) {
    logger.info(`Product "${product.title}" already exists, skipping.`);
    return '';
  }
  logger.warn(`Adapty API rejected "${product.title}" (HTTP ${response.status}): ${errText.slice(0, 200)}`);
  return '';
}

export async function createPaywall(
  appId: string,
  title: string,
  productIds: string[],
): Promise<string> {
  const args = [
    'paywalls', 'create',
    '--app', appId,
    '--title', title,
  ];

  const ids = productIds.filter(Boolean);
  const version = await installedAdaptyVersion();
  if (version && versionAtLeast(version, ADAPTY_PRODUCTS_FLAG_VERSION)) {
    if (ids.length > 0) {
      args.push('--products', JSON.stringify(ids.map((product_id) => ({
        product_id,
        offer_id: null,
        fallback_offer_id: null,
        billing_plan_id: null,
        flow_product_id: null,
      }))));
    }
  } else {
    for (const productId of ids) args.push('--product-id', productId);
  }

  args.push('--json');

  const result = await run('adapty', args, {
    label: `Creating paywall: ${title}`,
    allowFailure: true,
  });

  if (result.exitCode === 0) {
    try {
      const data = JSON.parse(result.stdout);
      const paywallData = data?.data ?? data;
      return paywallData.id ?? paywallData.paywall_id ?? '';
    } catch {
      // Fall through
    }
  }

  logger.info(`Paywall "${title}" may already exist, continuing...`);
  return '';
}

export async function createPlacement(
  appId: string,
  title: string,
  developerId: string,
  paywallId: string,
): Promise<void> {
  const args = [
    'placements', 'create',
    '--app', appId,
    '--title', title,
    '--developer-id', developerId,
    '--json',
  ];

  if (paywallId) {
    args.push('--paywall-id', paywallId);
  }

  await run('adapty', args, {
    label: `Creating placement: ${title} (${developerId})`,
    allowFailure: true,
  });
}
