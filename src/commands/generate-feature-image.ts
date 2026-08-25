import path from 'node:path';
import fs from 'fs-extra';
import sharp from 'sharp';
import ora from 'ora';
import { logger } from '../utils/logger.js';
import { loadConfig } from '../utils/config.js';
import { ensureOpenaiKey, ensureFalKey } from '../utils/api-keys.js';
import { loadSpec } from '../utils/spec-file.js';
import * as fal from '../services/fal.service.js';
import * as openai from '../services/openai.service.js';
import type { GenerateFeatureImageOptions } from '../types/index.js';

const TARGET_WIDTH = 1024;
const TARGET_HEIGHT = 500;
const MAX_REFERENCE_IMAGES = 10;
const HEX_COLOR_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export async function generateFeatureImage(
  options: GenerateFeatureImageOptions,
): Promise<void> {
  const config = await loadConfig();

  const prompt = options.prompt?.trim();
  const appName = options.appName?.trim();
  const primaryColor = options.primaryColor?.trim();
  const subtitle = options.subtitle?.trim() || undefined;
  const usesOpenai = !options.spec;

  // The OpenAI prompt-builder inputs are only required when there is no
  // pre-authored spec (--spec supplies the full banner specification itself).
  if (usesOpenai || options.printPrompt) {
    if (!prompt) {
      logger.fatal('--prompt is required (unless --spec is given).');
      process.exit(1);
    }
    if (!appName) {
      logger.fatal('--app-name is required (unless --spec is given).');
      process.exit(1);
    }
    if (!primaryColor || !HEX_COLOR_RE.test(primaryColor)) {
      logger.fatal(`--primary-color must be a hex color like #FF3B30 (got: ${primaryColor ?? 'empty'}).`);
      process.exit(1);
    }
  }

  const resolution = options.resolution ?? '2K';
  const locale = options.locale ?? 'en-US';
  const pollIntervalMs = (options.pollInterval ?? 10) * 1000;
  const totalSteps = 5;

  // Collect reference images: logo first, then any --reference paths
  const referencePaths: string[] = [];
  if (options.logo) {
    const logoPath = path.resolve(options.logo);
    if (!(await fs.pathExists(logoPath))) {
      logger.fatal(`Logo not found: ${logoPath}`);
      process.exit(1);
    }
    referencePaths.push(logoPath);
  }
  for (const ref of options.reference ?? []) {
    const refPath = path.resolve(ref);
    if (!(await fs.pathExists(refPath))) {
      logger.fatal(`Reference image not found: ${refPath}`);
      process.exit(1);
    }
    referencePaths.push(refPath);
  }

  if (referencePaths.length > MAX_REFERENCE_IMAGES) {
    logger.warn(
      `Using first ${MAX_REFERENCE_IMAGES} reference images only (got ${referencePaths.length})`,
    );
    referencePaths.length = MAX_REFERENCE_IMAGES;
  }

  const hasLogo = Boolean(options.logo);
  const screenshotCount = referencePaths.length - (hasLogo ? 1 : 0);

  // --print-prompt: emit the master prompt (schema + constraints) and exit so
  // any AI model can author the spec JSON passed back via --spec — no OpenAI.
  if (options.printPrompt) {
    console.log(openai.buildFeatureImagePrompt({
      appName: appName!,
      subtitle,
      prompt: prompt!,
      primaryColor: primaryColor!,
      hasLogo,
      screenshotCount,
    }));
    return;
  }

  // Step 1: Obtain the banner spec — from --spec file, or via OpenAI
  let refinedPrompt: string;
  if (options.spec) {
    logger.step(1, totalSteps, 'Loading feature image spec (skipping OpenAI)');
    refinedPrompt = await loadSpec(options.spec);
  } else {
    await ensureOpenaiKey(config);
    logger.step(1, totalSteps, 'Generating feature image prompt via OpenAI');
    const masterPrompt = openai.buildFeatureImagePrompt({
      appName: appName!,
      subtitle,
      prompt: prompt!,
      primaryColor: primaryColor!,
      hasLogo,
      screenshotCount,
    });

    const aiSpinner = ora({ text: 'Calling OpenAI GPT-4.1...', indent: 4 }).start();
    refinedPrompt = await openai.generateTextPrompt(config.openaiApiKey, masterPrompt);
    aiSpinner.succeed(`Feature image prompt generated (${refinedPrompt.length} chars)`);
  }

  await ensureFalKey(config);

  // Step 2: Upload reference images
  const imageUrls: string[] = [];
  if (referencePaths.length > 0) {
    logger.step(2, totalSteps, `Uploading ${referencePaths.length} reference image(s)`);

    let useImgbb = false;
    if (config.imgbbApiKey) {
      useImgbb = true;
    } else {
      logger.info('imgbbApiKey not set — using inline data URIs. Set it with `kappmaker config set imgbbApiKey <key>` for faster uploads.');
    }

    const upSpinner = ora({
      text: `Uploading... 0/${referencePaths.length} done`,
      indent: 4,
    }).start();
    let uploadedCount = 0;
    for (const refPath of referencePaths) {
      if (useImgbb) {
        imageUrls.push(await fal.uploadImageToImgbb(config.imgbbApiKey, refPath));
      } else {
        imageUrls.push(await fal.imageToDataUri(refPath));
      }
      uploadedCount++;
      upSpinner.text = `Uploading... ${uploadedCount}/${referencePaths.length} done`;
    }
    upSpinner.succeed(`Uploaded ${imageUrls.length} reference image(s)`);
  } else {
    logger.step(2, totalSteps, 'Skipping reference image upload (none provided)');
  }

  // Step 3: Submit to fal.ai
  logger.step(3, totalSteps, 'Submitting to fal.ai for feature image generation');

  let falPrompt = refinedPrompt;
  if (imageUrls.length > 0) {
    const intro: string[] = ['IMPORTANT: Reference images are provided as image_urls.'];
    if (hasLogo) {
      intro.push('Image #1 is the EXACT app logo — render it pixel-faithfully, do not redraw or recolor.');
    }
    if (screenshotCount > 0) {
      const startIdx = hasLogo ? 2 : 1;
      intro.push(`Image${screenshotCount > 1 ? 's' : ''} #${startIdx}${screenshotCount > 1 ? `..#${startIdx + screenshotCount - 1}` : ''} ${screenshotCount > 1 ? 'are' : 'is'} actual app screenshot${screenshotCount > 1 ? 's' : ''} — place ${screenshotCount > 1 ? 'them' : 'it'} inside realistic, modern phone device frames with a slight angle and soft shadow. Keep the app UI content intact.`);
    }
    falPrompt = `${intro.join(' ')}\n\n${refinedPrompt}`;
  }

  const queueResponse = await fal.submitFeatureImageGeneration(
    config.falApiKey,
    falPrompt,
    imageUrls.length > 0 ? imageUrls : undefined,
    resolution,
  );

  // Step 4: Poll + download
  logger.step(4, totalSteps, 'Generating feature image');
  await fal.pollUntilComplete(config.falApiKey, queueResponse.status_url, {
    label: 'Generating feature image',
    intervalMs: pollIntervalMs,
  });

  const resultUrl = await fal.fetchResult(config.falApiKey, queueResponse.response_url);
  const res = await fetch(resultUrl);
  if (!res.ok) {
    logger.fatal(`Failed to download result (${res.status})`);
    process.exit(1);
  }
  const rawBuffer = Buffer.from(await res.arrayBuffer());

  // Step 5: Resize to exact 1024×500 and save
  logger.step(5, totalSteps, `Resizing to ${TARGET_WIDTH}×${TARGET_HEIGHT} and saving`);

  const finalBuffer = await sharp(rawBuffer)
    .resize(TARGET_WIDTH, TARGET_HEIGHT, { fit: 'cover', position: 'center' })
    .png()
    .toBuffer();

  const outputPath = resolveOutputPath(options.output, locale);
  await fs.ensureDir(path.dirname(outputPath));
  await fs.writeFile(outputPath, finalBuffer);

  logger.success(`Feature image saved to: ${outputPath}`);
  logger.done();
}

function resolveOutputPath(output: string | undefined, locale: string): string {
  if (output) return path.resolve(output);

  // Fastlane Supply convention: MobileApp/distribution/android/playstore_metadata/<locale>/images/featureGraphic.png
  const candidates = [
    path.resolve(`MobileApp/distribution/android/playstore_metadata/${locale}/images/featureGraphic.png`),
    path.resolve(`../MobileApp/distribution/android/playstore_metadata/${locale}/images/featureGraphic.png`),
    path.resolve(`distribution/android/playstore_metadata/${locale}/images/featureGraphic.png`),
  ];

  for (const candidate of candidates) {
    if (fs.pathExistsSync(path.dirname(path.dirname(candidate)))) {
      return candidate;
    }
  }

  // Fallback: local Assets folder
  return path.resolve('Assets/playstore/featureGraphic.png');
}
