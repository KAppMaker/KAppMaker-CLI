import { execa } from 'execa';
import { run, runStreaming } from '../utils/exec.js';
import { logger } from '../utils/logger.js';
import { confirm } from '../utils/prompt.js';
import type { AdaptyProduct } from '../types/adapty.js';

export async function validateAdaptyInstalled(): Promise<void> {
  try {
    await execa('adapty', ['--version']);
  } catch {
    logger.warn('adapty CLI is not installed.');
    console.log('');
    const shouldInstall = await confirm('  Would you like to install it? (npm install -g adapty)');
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
    const shouldLogin = await confirm('  Would you like to log in? (opens browser)');
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

  for (const productId of productIds) {
    if (productId) {
      args.push('--product-id', productId);
    }
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
