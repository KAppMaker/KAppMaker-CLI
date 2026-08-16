import path from 'path';
import fs from 'fs-extra';
import { logger } from '../utils/logger.js';
import { resolveMobileDir } from '../services/version.service.js';
import { loadConfig } from '../utils/config.js';
import { publishAndroid, publishIos } from '../services/publish.service.js';
import { iosCiBuild } from './ios-ci.js';
import type { PublishOptions } from '../services/publish.service.js';

interface PublishCommandOptions {
  platform: string[];
  track: string;
  uploadMetadata: boolean;
  uploadScreenshots: boolean;
  uploadImages: boolean;
  submitForReview: string;
  /** Build iOS on a GitHub macOS runner instead of locally (no Mac needed). */
  remote?: boolean;
}

export async function publishCommand(options: PublishCommandOptions): Promise<void> {
  const mobileDir = resolveMobileDir();
  const config = await loadConfig();

  // A remote iOS build runs fastlane on the runner, where the Gemfile is
  // installed fresh — requiring it locally would block the no-Mac path.
  const remoteIosOnly =
    options.remote === true &&
    options.platform.length === 1 &&
    options.platform[0] === 'ios';

  // Check Fastlane prerequisites
  const gemfilePath = path.join(mobileDir, 'Gemfile');
  const fastfilePath = path.join(mobileDir, 'fastlane', 'Fastfile');
  if (!remoteIosOnly && !(await fs.pathExists(gemfilePath))) {
    logger.error('Gemfile not found — Fastlane/Bundler is required for publishing.');
    process.exit(1);
  }
  if (!remoteIosOnly && !(await fs.pathExists(fastfilePath))) {
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
    if (options.remote) {
      // Xcode is the only genuinely Mac-locked step, so hand it to a macOS runner.
      await iosCiBuild({
        track: options.track === 'production' ? 'appstore' : 'testflight',
        submitForReview: options.submitForReview !== 'false',
        uploadMetadata: options.uploadMetadata,
        uploadScreenshots: options.uploadScreenshots,
      });
    } else if (process.platform !== 'darwin') {
      logger.error('Building iOS locally needs macOS and Xcode.');
      logger.info('No Mac? Use `kappmaker publish --platform ios --remote` (or `kappmaker ios-ci build`)');
      logger.info('to build on a GitHub macOS runner. One-time setup: `kappmaker ios-ci init`.');
      process.exit(1);
    } else {
      await publishIos(mobileDir, pubOptions, config);
    }
  }
}
