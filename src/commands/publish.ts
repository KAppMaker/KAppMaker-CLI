import path from 'path';
import fs from 'fs-extra';
import { logger } from '../utils/logger.js';
import { resolveMobileDir } from '../services/version.service.js';
import { loadConfig } from '../utils/config.js';
import { publishAndroid, publishIos } from '../services/publish.service.js';
import type { PublishOptions } from '../services/publish.service.js';

interface PublishCommandOptions {
  platform: string[];
  track: string;
  uploadMetadata: boolean;
  uploadScreenshots: boolean;
  uploadImages: boolean;
  submitForReview: string;
}

export async function publishCommand(options: PublishCommandOptions): Promise<void> {
  const mobileDir = resolveMobileDir();
  const config = await loadConfig();

  // Check Fastlane prerequisites
  const gemfilePath = path.join(mobileDir, 'Gemfile');
  const fastfilePath = path.join(mobileDir, 'fastlane', 'Fastfile');
  if (!(await fs.pathExists(gemfilePath))) {
    logger.error('Gemfile not found — Fastlane/Bundler is required for publishing.');
    process.exit(1);
  }
  if (!(await fs.pathExists(fastfilePath))) {
    logger.error('fastlane/Fastfile not found — required for publishing.');
    process.exit(1);
  }

  const platforms = options.platform.length > 0
    ? options.platform
    : ['android', 'ios'];

  const pubOptions: PublishOptions = {
    track: options.track,
    uploadMetadata: options.uploadMetadata,
    uploadScreenshots: options.uploadScreenshots,
    uploadImages: options.uploadImages,
    submitForReview: options.submitForReview !== 'false',
  };

  if (platforms.includes('android')) {
    await publishAndroid(mobileDir, pubOptions, config);
  }

  if (platforms.includes('ios')) {
    await publishIos(mobileDir, pubOptions, config);
  }
}
