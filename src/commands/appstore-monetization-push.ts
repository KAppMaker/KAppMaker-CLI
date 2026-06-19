import fs from 'fs-extra';
import path from 'node:path';
import { logger } from '../utils/logger.js';
import * as asc from '../services/asc.service.js';
import * as ascMoney from '../services/asc-monetization.service.js';
import type { AppStoreConfig } from '../types/appstore.js';

const DEFAULT_CONFIG = 'Assets/appstore-config.json';

export interface AppStoreMonetizationPushOptions {
  config?: string;
  subscriptionsOnly?: boolean;
  iapOnly?: boolean;
}

/**
 * Push subscriptions and/or IAPs from an appstore config JSON to App Store Connect.
 * Mirrors the monetization step inside create-appstore-app but as a standalone command.
 */
export async function appstoreMonetizationPush(options: AppStoreMonetizationPushOptions): Promise<void> {
  const configPath = path.resolve(options.config ?? DEFAULT_CONFIG);

  if (!await fs.pathExists(configPath)) {
    logger.error(`Config not found: ${configPath}`);
    logger.info('Run `kappmaker create-appstore-app` first to create the config, or pass --config <path>.');
    process.exit(1);
  }

  const config: AppStoreConfig = await fs.readJson(configPath);

  let appId: string | null = config.app?.id ?? null;
  if (!appId && config.app?.bundle_id) {
    logger.info(`Looking up app by bundle ID: ${config.app.bundle_id}`);
    appId = await asc.findAppByBundleId(config.app.bundle_id);
  }
  if (!appId) {
    logger.error('Could not resolve App Store app ID. Set app.id or app.bundle_id in the config.');
    process.exit(1);
  }

  const reviewOpts = { defaultReviewScreenshot: config.review_screenshot };
  const pushSubs = !options.iapOnly;
  const pushIaps = !options.subscriptionsOnly;

  // Set app-level pricing + territory availability before IAP setup.
  // In the full create-appstore-app flow this is done in step 10 via createPricing().
  // Skipping it here leaves IAPs unavailable outside the base territory (no setAppAvailability call)
  // and PPP prices silently set for territories where the IAP isn't actually listed.
  if (pushIaps && config.pricing) {
    await ascMoney.createPricing(appId, config.pricing);
  }

  // ── Subscriptions ────────────────────────────────────────────────────
  if (pushSubs) {
    const groups = config.subscriptions?.groups ?? [];
    if (groups.length > 0) {
      logger.info(`Pushing ${groups.length} subscription group(s) to App Store Connect…`);
      for (const group of groups) {
        await ascMoney.setupSubscriptions(appId, group, config.subscriptions?.availability, reviewOpts);
      }
    } else {
      logger.info('No subscription groups in config — skipping.');
    }
  }

  // ── In-App Purchases ─────────────────────────────────────────────────
  if (pushIaps) {
    const iaps = config.in_app_purchases ?? [];
    if (iaps.length > 0) {
      logger.info(`Pushing ${iaps.length} IAP(s) to App Store Connect…`);
      await ascMoney.setupInAppPurchases(appId, iaps, reviewOpts, config.pricing?.availability);
    } else {
      logger.info('No IAPs in config — skipping.');
    }
  }

  logger.success('App Store monetization push complete.');
}
