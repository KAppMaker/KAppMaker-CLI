import path from 'path';
import fs from 'fs-extra';
import { runStreaming } from '../utils/exec.js';
import { logger } from '../utils/logger.js';
import { getConfigDir } from '../utils/config.js';
import type { KAppMakerConfig } from '../types/index.js';

export interface PublishOptions {
  track: string;
  uploadMetadata: boolean;
  uploadScreenshots: boolean;
  uploadImages: boolean;
  submitForReview: boolean;
}

async function ensureAppStorePublisherJson(config: KAppMakerConfig): Promise<string> {
  if (!config.ascKeyId || !config.ascIssuerId || !config.ascPrivateKeyPath) {
    logger.error('iOS publishing requires ascKeyId, ascIssuerId, and ascPrivateKeyPath in config.');
    logger.info('Run: kappmaker config set ascKeyId <key-id>');
    logger.info('Run: kappmaker config set ascIssuerId <issuer-id>');
    logger.info('Run: kappmaker config set ascPrivateKeyPath /path/to/AuthKey.p8');
    process.exit(1);
  }

  const p8Path = path.resolve(config.ascPrivateKeyPath);
  if (!(await fs.pathExists(p8Path))) {
    logger.error(`Private key file not found: ${p8Path}`);
    process.exit(1);
  }

  const keyContent = await fs.readFile(p8Path, 'utf8');
  const publisherJson = {
    key_id: config.ascKeyId,
    issuer_id: config.ascIssuerId,
    key: keyContent.trim(),
  };

  const outputPath = path.join(getConfigDir(), 'appstore-publisher.json');
  await fs.writeJson(outputPath, publisherJson, { spaces: 2 });
  return outputPath;
}

export async function publishAndroid(
  mobileDir: string,
  options: PublishOptions,
  config: KAppMakerConfig,
): Promise<void> {
  const serviceAccountPath = path.resolve(config.googleServiceAccountPath);
  if (!(await fs.pathExists(serviceAccountPath))) {
    logger.error(`Google Play service account not found: ${serviceAccountPath}`);
    logger.info('Run: kappmaker config set googleServiceAccountPath /path/to/service-account.json');
    process.exit(1);
  }

  logger.info(`Publishing Android to ${options.track} track...`);

  await runStreaming(
    'bundle',
    [
      'exec', 'fastlane', 'android', 'playstore_release',
      `track:${options.track}`,
      `service_account:${serviceAccountPath}`,
      `upload_metadata:${options.uploadMetadata}`,
      `upload_screenshots:${options.uploadScreenshots}`,
      `upload_images:${options.uploadImages}`,
      `submit_for_review:${options.submitForReview}`,
    ],
    { cwd: mobileDir, label: 'Fastlane: Android Play Store release' },
  );

  logger.success('Android publish complete!');
}

export async function publishIos(
  mobileDir: string,
  options: PublishOptions,
  config: KAppMakerConfig,
): Promise<void> {
  const apiKeyPath = await ensureAppStorePublisherJson(config);

  logger.info('Publishing iOS to App Store...');

  await runStreaming(
    'bundle',
    [
      'exec', 'fastlane', 'ios', 'appstore_release',
      `upload_metadata:${options.uploadMetadata}`,
      `upload_screenshots:${options.uploadScreenshots}`,
      `submit_for_review:${options.submitForReview}`,
    ],
    { cwd: mobileDir, label: 'Fastlane: iOS App Store release' },
  );

  logger.success('iOS publish complete!');
}
