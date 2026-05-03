import path from 'node:path';
import fs from 'fs-extra';
import sharp from 'sharp';
import ora from 'ora';
import { logger } from '../utils/logger.js';
import { promptInput } from '../utils/prompt.js';
import { loadConfig, saveConfig } from '../utils/config.js';
import * as fal from '../services/fal.service.js';
import * as openai from '../services/openai.service.js';
import * as screenshot from '../services/screenshot.service.js';
import type { GenerateScreenshotsOptions } from '../types/index.js';

const MAX_REFERENCE_IMAGES = 10;

export async function generateScreenshots(
  options: GenerateScreenshotsOptions,
): Promise<void> {
  const config = await loadConfig();

  if (!config.openaiApiKey) {
    logger.warn('OpenAI API key is not configured.');
    logger.info('Get one at: https://platform.openai.com/api-keys');
    const key = await promptInput('  Enter your OpenAI API key: ');
    if (!key.trim()) {
      logger.fatal('OpenAI API key is required for screenshot generation.');
      process.exit(1);
    }
    config.openaiApiKey = key.trim();
    await saveConfig(config);
    logger.success('openaiApiKey saved to config.');
  }

  if (!config.falApiKey) {
    logger.warn('fal.ai API key is not configured.');
    logger.info('Get one at: https://fal.ai/dashboard/keys');
    const key = await promptInput('  Enter your fal.ai API key: ');
    if (!key.trim()) {
      logger.fatal('fal.ai API key is required for screenshot generation.');
      process.exit(1);
    }
    config.falApiKey = key.trim();
    await saveConfig(config);
    logger.success('falApiKey saved to config.');
  }

  const rows = 2;
  const cols = 4;
  const resolution = options.resolution ?? '2K';
  const styleId = options.style ?? 1;
  const pollIntervalMs = (options.pollInterval ?? 10) * 1000;
  const totalSteps = 5;

  // Resolve input directory for reference images
  const inputDir = resolveInputDir(options.input);
  let imagePaths: string[] = [];
  let hasReferenceImages = false;

  if (inputDir && (await fs.pathExists(inputDir))) {
    const files = (await fs.readdir(inputDir))
      .filter((f) => /\.(png|jpe?g)$/i.test(f))
      .sort();
    if (files.length > 0) {
      imagePaths = files.slice(0, MAX_REFERENCE_IMAGES).map((f) => path.join(inputDir, f));
      hasReferenceImages = true;
      logger.info(`Found ${files.length} reference images in: ${inputDir}`);
      if (files.length > MAX_REFERENCE_IMAGES) {
        logger.warn(`Using first ${MAX_REFERENCE_IMAGES} images only (max ${MAX_REFERENCE_IMAGES})`);
      }
    }
  }

  if (!hasReferenceImages) {
    logger.info('No reference images found — generating screenshots from scratch');
  }

  // Step 1: Generate prompt via OpenAI
  logger.step(1, totalSteps, 'Generating screenshot prompt via OpenAI');
  const masterPrompt = openai.buildScreenshotPrompt(
    options.prompt, hasReferenceImages, styleId,
  );

  const spinner = ora({ text: 'Calling OpenAI GPT-4.1...', indent: 4 }).start();
  const generatedPrompt = await openai.generateTextPrompt(config.openaiApiKey, masterPrompt);
  spinner.succeed(`Screenshot prompt generated (${generatedPrompt.length} chars)`);

  // Step 2: Upload reference images individually (if any)
  const imageUrls: string[] = [];

  if (hasReferenceImages) {
    logger.step(2, totalSteps, `Uploading ${imagePaths.length} reference images to imgbb`);

    if (!config.imgbbApiKey) {
      logger.fatal('imgbb API key is not configured (needed for image upload).');
      logger.info('Get a free key at https://api.imgbb.com/ and set it with: kappmaker config set imgbbApiKey <your-key>');
      process.exit(1);
    }

    const uploadSpinner = ora({ text: `Uploading... 0/${imagePaths.length} done`, indent: 4 }).start();
    let uploadedCount = 0;

    for (const imgPath of imagePaths) {
      const url = await fal.uploadImageToImgbb(config.imgbbApiKey, imgPath);
      imageUrls.push(url);
      uploadedCount++;
      uploadSpinner.text = `Uploading... ${uploadedCount}/${imagePaths.length} done`;
    }

    uploadSpinner.succeed(`Uploaded ${imageUrls.length} reference images`);
  } else {
    logger.step(2, totalSteps, 'Skipping reference image upload (none provided)');
  }

  // Step 3: Submit to fal.ai (always nano-banana-2, with optional reference image URLs)
  logger.step(3, totalSteps, 'Submitting to fal.ai for screenshot generation');

  // Prepend reference image instruction to the fal.ai prompt so nano-banana-2 uses them
  let falPrompt = generatedPrompt;
  if (imageUrls.length > 0) {
    falPrompt =
      'IMPORTANT: Reference app screenshots are provided as image_urls. ' +
      'You MUST use these reference images as the actual app screens displayed inside the device frames in each screenshot. ' +
      'Keep the reference app UI content intact — only place them within marketing screenshot layouts with device frames, backgrounds, and marketing text.\n\n' +
      generatedPrompt;
  }

  const queueResponse = await fal.submitScreenshotGeneration(
    config.falApiKey,
    falPrompt,
    imageUrls.length > 0 ? imageUrls : undefined,
    resolution,
  );

  // Step 4: Poll and download
  logger.step(4, totalSteps, 'Generating screenshots');
  await fal.pollUntilComplete(config.falApiKey, queueResponse.status_url, {
    label: 'Generating screenshots',
    intervalMs: pollIntervalMs,
  });

  const resultUrl = await fal.fetchResult(config.falApiKey, queueResponse.response_url);
  const res = await fetch(resultUrl);
  if (!res.ok) {
    logger.fatal(`Failed to download result (${res.status})`);
    process.exit(1);
  }
  const resultBuffer = Buffer.from(await res.arrayBuffer());

  // Step 5: Split and save (same dimensions as translate-screenshots)
  logger.step(5, totalSteps, 'Splitting and saving screenshots');
  const expectedCount = rows * cols;

  // Standard App Store screenshot size (iPhone 6.5")
  const targetW = 1284;
  const targetH = 2778;

  const tiles = await screenshot.splitTranslatedGrid(
    resultBuffer, expectedCount, rows, cols, targetW, targetH,
  );

  const outputBase = resolveOutputBase(options.output);
  await saveScreenshots(tiles, outputBase);

  logger.success(`Screenshots saved to: ${outputBase}`);
  logger.done();
}

// ── Helpers ────────────────────────────────────────────────────────

function resolveInputDir(input?: string): string | undefined {
  if (input) return path.resolve(input);

  // Auto-detect Assets/screenshots from current dir or parent
  const candidates = [
    path.resolve('Assets/screenshots'),
    path.resolve('../Assets/screenshots'),
  ];

  for (const candidate of candidates) {
    if (fs.pathExistsSync(candidate)) return candidate;
  }

  return undefined;
}

function resolveOutputBase(output?: string): string {
  if (output) return path.resolve(output);
  // Default to Assets/screenshots, check parent if in MobileApp
  const candidates = [
    path.resolve('Assets/screenshots'),
    path.resolve('../Assets/screenshots'),
  ];
  for (const candidate of candidates) {
    if (fs.pathExistsSync(candidate)) return candidate;
  }
  return path.resolve('Assets/screenshots');
}

async function saveScreenshots(tiles: Buffer[], outputBase: string): Promise<void> {
  // Save to appstore subfolder
  const appstoreDir = path.join(outputBase, 'appstore');
  await fs.ensureDir(appstoreDir);
  for (let i = 0; i < tiles.length; i++) {
    await fs.writeFile(path.join(appstoreDir, `${i + 1}.png`), tiles[i]);
  }

  // Save to playstore subfolder
  const playstoreDir = path.join(outputBase, 'playstore');
  await fs.ensureDir(playstoreDir);
  for (let i = 0; i < tiles.length; i++) {
    await fs.writeFile(path.join(playstoreDir, `${i + 1}.png`), tiles[i]);
  }

  logger.info(`Saved ${tiles.length} screenshots to appstore/ and playstore/`);

  // Also save to MobileApp/distribution Fastlane dirs if they exist
  const distributionCandidates = [
    path.resolve('MobileApp/distribution'),
    path.resolve('../MobileApp/distribution'),
    path.resolve('distribution'),
  ];

  let distributionDir: string | undefined;
  for (const candidate of distributionCandidates) {
    if (await fs.pathExists(candidate)) {
      distributionDir = candidate;
      break;
    }
  }

  if (distributionDir) {
    await screenshot.saveToFastlane(tiles, 'en-US', distributionDir);
    logger.info(`Also saved to Fastlane distribution: ${distributionDir}`);
  }
}
