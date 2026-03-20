import path from 'node:path';
import fs from 'fs-extra';
import sharp from 'sharp';
import ora from 'ora';
import { logger } from '../utils/logger.js';
import { loadConfig } from '../utils/config.js';
import * as fal from '../services/fal.service.js';
import * as screenshot from '../services/screenshot.service.js';
import { confirm } from '../utils/prompt.js';
import type { TranslateScreenshotsOptions } from '../types/index.js';

export async function translateScreenshots(
  sourceDir: string,
  options: TranslateScreenshotsOptions,
): Promise<void> {
  const config = await loadConfig();

  if (!config.falApiKey) {
    logger.fatal('fal.ai API key is not configured.');
    logger.info('Set it with: kappmaker config set falApiKey <your-key>');
    process.exit(1);
  }

  if (!config.imgbbApiKey) {
    logger.fatal('imgbb API key is not configured (needed for image upload).');
    logger.info('Get a free key at https://api.imgbb.com/ and set it with: kappmaker config set imgbbApiKey <your-key>');
    process.exit(1);
  }

  const srcPath = path.resolve(sourceDir);
  if (!(await fs.pathExists(srcPath))) {
    logger.fatal(`Source directory not found: ${srcPath}`);
    process.exit(1);
  }

  // Collect images from source directory
  const files = (await fs.readdir(srcPath))
    .filter((f) => /\.(png|jpe?g)$/i.test(f))
    .sort();

  if (files.length === 0) {
    logger.fatal(`No PNG/JPG images found in: ${srcPath}`);
    process.exit(1);
  }

  const imagePaths = files.map((f) => path.join(srcPath, f));
  const rows = options.rows ?? 2;
  const cols = options.cols ?? 4;
  const resolution = options.resolution ?? '2K';
  const pollIntervalMs = (options.pollInterval ?? 10) * 1000;
  // Resolve user-provided locales (accept both Play Store and iOS codes)
  const sourceLocale = path.basename(srcPath);
  let allLocales: string[];
  if (!options.locales || (options.locales.length === 1 && options.locales[0] === 'all')) {
    allLocales = screenshot.DEFAULT_LOCALES;
  } else {
    allLocales = [];
    for (const input of options.locales) {
      const resolved = screenshot.resolveLocale(input);
      if (resolved) {
        allLocales.push(resolved);
      } else {
        logger.warn(`Unknown locale: ${input} (skipped)`);
      }
    }
  }

  // Exclude source locale from targets
  const locales = allLocales.filter((l) => {
    if (l === sourceLocale) return false;
    if (screenshot.LOCALE_MAPPING[l] === sourceLocale) return false;
    return true;
  });

  if (locales.length < allLocales.length) {
    logger.info(`Skipping source locale: ${sourceLocale}`);
  }

  if (locales.length === 0) {
    logger.fatal('No target locales remaining after excluding source locale.');
    process.exit(1);
  }
  const outputDir = path.resolve(options.output ?? detectDistributionDir(srcPath));

  // Check if output directory exists, prompt to create if not
  if (!(await fs.pathExists(outputDir))) {
    logger.info(`Output directory does not exist: ${outputDir}`);
    const ok = await confirm('Create it now?');
    if (!ok) {
      logger.info('Aborted.');
      process.exit(0);
    }
    await fs.ensureDir(outputDir);
  } else {
    logger.info(`Output directory: ${outputDir}`);
  }

  // Read original dimensions for split target
  const firstMeta = await sharp(imagePaths[0]).metadata();
  const targetW = firstMeta.width!;
  const targetH = firstMeta.height!;

  // Step 1: Combine into grid, resize for upload, and upload to imgbb
  logger.step(1, 4, `Combining ${files.length} screenshots into ${rows}x${cols} grid`);
  const { buffer: gridBuffer, count } = await screenshot.combineScreenshots(imagePaths, rows, cols);

  // Resize grid to fit under imgbb's 32MB limit while keeping aspect ratio
  const gridMeta = await sharp(gridBuffer).metadata();
  const MAX_UPLOAD_WIDTH = 4096;
  let uploadBuffer = gridBuffer;
  if (gridMeta.width && gridMeta.width > MAX_UPLOAD_WIDTH) {
    uploadBuffer = await sharp(gridBuffer)
      .resize({ width: MAX_UPLOAD_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
  } else {
    uploadBuffer = await sharp(gridBuffer).jpeg({ quality: 85 }).toBuffer();
  }

  const tmpGridPath = path.join(outputDir, '.tmp_grid.jpg');
  await fs.writeFile(tmpGridPath, uploadBuffer);

  logger.info('Uploading grid to imgbb...');
  const imageUrl = await fal.uploadImageToImgbb(config.imgbbApiKey, tmpGridPath);
  await fs.remove(tmpGridPath);
  logger.success('Grid uploaded');

  // Step 2: Submit all translations in parallel (tiny payloads — just a URL per request)
  logger.step(2, 4, `Submitting translations for ${locales.length} locales`);
  const pending = new Map<string, { statusUrl: string; responseUrl: string }>();
  const failedLocales: string[] = [];

  const submissions = await Promise.allSettled(
    locales.map((locale) => fal.submitTranslation(config.falApiKey, imageUrl, locale, resolution)),
  );

  for (let i = 0; i < locales.length; i++) {
    const result = submissions[i];
    if (result.status === 'fulfilled') {
      pending.set(locales[i], {
        statusUrl: result.value.status_url,
        responseUrl: result.value.response_url,
      });
    } else {
      logger.warn(`[${locales[i]}] Submit failed: ${result.reason}`);
      failedLocales.push(locales[i]);
    }
  }

  if (pending.size === 0) {
    logger.fatal('All submissions failed.');
    process.exit(1);
  }

  // Step 3: Poll all concurrently
  logger.step(3, 4, `Translating ${pending.size} locales`);
  let doneCount = 0;
  const total = pending.size;
  const spinner = ora({ text: `Translating... 0/${total} done`, indent: 4 }).start();

  const completedLocales: string[] = [];
  const pollResults = await Promise.allSettled(
    [...pending.entries()].map(async ([locale, info]) => {
      await fal.pollTranslation(config.falApiKey, info.statusUrl, pollIntervalMs);
      doneCount++;
      spinner.text = `Translating... ${doneCount}/${total} done`;
      return locale;
    }),
  );

  for (const result of pollResults) {
    if (result.status === 'fulfilled') {
      completedLocales.push(result.value);
    } else {
      logger.warn(`Translation failed: ${result.reason}`);
    }
  }
  spinner.succeed(`Translated ${completedLocales.length}/${total} locales`);

  if (completedLocales.length === 0) {
    logger.fatal('All translations failed.');
    process.exit(1);
  }

  // Step 4: Download, split, and save (parallel)
  logger.step(4, 4, `Saving ${completedLocales.length} translated screenshot sets`);
  let savedCount = 0;
  const saveSpinner = ora({ text: `Saving... 0/${completedLocales.length} done`, indent: 4 }).start();

  const saveResults = await Promise.allSettled(
    completedLocales.map(async (locale) => {
      const info = pending.get(locale)!;
      const imageUrl = await fal.fetchResult(config.falApiKey, info.responseUrl);
      const res = await fetch(imageUrl);
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const translatedBuffer = Buffer.from(await res.arrayBuffer());

      const tiles = await screenshot.splitTranslatedGrid(
        translatedBuffer, count, rows, cols, targetW, targetH,
      );
      await screenshot.saveToFastlane(tiles, locale, outputDir);
      savedCount++;
      saveSpinner.text = `Saving... ${savedCount}/${completedLocales.length} done`;
      return locale;
    }),
  );

  for (const result of saveResults) {
    if (result.status === 'rejected') {
      logger.warn(`Save failed: ${result.reason}`);
      failedLocales.push('unknown');
    }
  }
  saveSpinner.succeed(`Saved ${savedCount}/${completedLocales.length} locales`);

  // Summary
  if (failedLocales.length > 0) {
    const unique = [...new Set(failedLocales)];
    logger.warn(`Failed locales: ${unique.join(', ')}`);
  }

  logger.success(`Output: ${outputDir}`);
  logger.done();
}

/**
 * Try to detect the distribution root from the source path.
 * E.g. if source is `.../MobileApp/distribution/ios/appstore_metadata/screenshots/en-US`
 * we walk up and find the `distribution` ancestor.
 */
function detectDistributionDir(srcPath: string): string {
  const normalized = srcPath.replace(/\\/g, '/');

  // Known sub-paths inside distribution that screenshots live in
  const markers = [
    '/ios/appstore_metadata/screenshots/',
    '/android/playstore_metadata/',
  ];

  for (const marker of markers) {
    const idx = normalized.indexOf(marker);
    if (idx !== -1) {
      const detected = srcPath.slice(0, idx);
      logger.info(`Detected distribution root from source path: ${detected}`);
      return detected;
    }
  }

  // Fallback: check if any ancestor is named "distribution"
  let current = srcPath;
  while (current !== path.dirname(current)) {
    if (path.basename(current) === 'distribution') {
      logger.info(`Detected distribution root from source path: ${current}`);
      return current;
    }
    current = path.dirname(current);
  }

  // Default fallback: use KAppMaker path if it exists, otherwise parent of source
  const kappmakerDefault = './MobileApp/distribution';
  if (fs.pathExistsSync(kappmakerDefault)) {
    logger.info(`Using default distribution root: ${kappmakerDefault}`);
    return kappmakerDefault;
  }
  const fallback = path.dirname(srcPath);
  logger.info(`Could not detect distribution root — defaulting to parent: ${fallback}`);
  return fallback;
}
