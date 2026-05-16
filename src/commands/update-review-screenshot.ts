import path from 'node:path';
import fs from 'fs-extra';
import { logger } from '../utils/logger.js';
import * as asc from '../services/asc.service.js';
import {
  uploadSubscriptionReviewScreenshot,
  uploadIapReviewScreenshot,
} from '../services/asc-monetization.service.js';
import type { AppStoreConfig } from '../types/appstore.js';

const CONFIG_FILENAME = 'Assets/appstore-config.json';

export interface UpdateReviewScreenshotOptions {
  /** Path to a single screenshot to apply to all matching products. Overrides per-product `review_screenshot` in the config. */
  file?: string;
  /** Override default config path (./Assets/appstore-config.json). */
  config?: string;
  /** Target a single product by product_id (or ref_name) instead of every entry in the config. */
  productId?: string;
}

/**
 * Update the App Review screenshot on every subscription in the config (or
 * just one when `--product-id` is given). Replaces existing screenshots via
 * `asc subscriptions review screenshots update`; falls back to `create` when
 * none is attached yet.
 */
export async function updateSubscriptionReviewScreenshot(
  options: UpdateReviewScreenshotOptions,
): Promise<void> {
  await asc.validateAscInstalled();
  await asc.validateAscAuth();

  const { config, appId } = await loadConfigAndAppId(options.config);
  if (config.subscriptions.groups.length === 0) {
    logger.warn('No subscriptions configured. Nothing to update.');
    return;
  }

  const subs = config.subscriptions.groups.flatMap((g) => g.subscriptions);
  const targets = options.productId
    ? subs.filter((s) => s.product_id === options.productId || s.ref_name === options.productId)
    : subs;
  if (targets.length === 0) {
    logger.warn(options.productId
      ? `No subscription matching "${options.productId}" found in the config.`
      : 'No subscriptions matched.');
    return;
  }

  for (const sub of targets) {
    const filePath = options.file ?? sub.review_screenshot ?? config.review_screenshot;
    if (!filePath) {
      logger.info(`No screenshot path configured for "${sub.ref_name}" — skipping.`);
      continue;
    }
    await uploadSubscriptionReviewScreenshot(appId, sub.product_id, sub.ref_name, filePath, {
      force: true,
      promptOnSizeMismatch: true,
    });
  }
}

/**
 * Update the App Review screenshot on every IAP in the config (or one via
 * `--product-id`). Replaces existing screenshots via `asc iap review-screenshots`
 * (NOT `asc iap images` — that's a different category for promotional images).
 */
export async function updateIapReviewScreenshot(
  options: UpdateReviewScreenshotOptions,
): Promise<void> {
  await asc.validateAscInstalled();
  await asc.validateAscAuth();

  const { config, appId } = await loadConfigAndAppId(options.config);
  const iaps = config.in_app_purchases ?? [];
  if (iaps.length === 0) {
    logger.warn('No in-app purchases configured. Nothing to update.');
    return;
  }

  const targets = options.productId
    ? iaps.filter((i) => i.product_id === options.productId || i.ref_name === options.productId)
    : iaps;
  if (targets.length === 0) {
    logger.warn(options.productId
      ? `No IAP matching "${options.productId}" found in the config.`
      : 'No IAPs matched.');
    return;
  }

  for (const iap of targets) {
    const filePath = options.file ?? iap.review_screenshot ?? config.review_screenshot;
    if (!filePath) {
      logger.info(`No screenshot path configured for "${iap.ref_name}" — skipping.`);
      continue;
    }
    await uploadIapReviewScreenshot(appId, iap.product_id, iap.ref_name, filePath, {
      force: true,
      promptOnSizeMismatch: true,
    });
  }
}

async function loadConfigAndAppId(
  configPath?: string,
): Promise<{ config: AppStoreConfig; appId: string }> {
  const resolved = configPath ?? path.resolve(CONFIG_FILENAME);
  if (!(await fs.pathExists(resolved))) {
    logger.fatal(`Config not found at ${resolved}. Run \`kappmaker create-appstore-app\` first or pass --config <path>.`);
    process.exit(1);
  }
  const config: AppStoreConfig = await fs.readJson(resolved);

  let appId = config.app.id;
  if (!appId) {
    appId = (await asc.findAppByBundleId(config.app.bundle_id)) ?? '';
  }
  if (!appId) {
    logger.fatal(`Could not resolve app ID for bundle ${config.app.bundle_id}. Make sure the app exists on App Store Connect.`);
    process.exit(1);
  }
  return { config, appId };
}
