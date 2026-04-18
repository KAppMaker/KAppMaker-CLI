import path from 'node:path';
import fs from 'fs-extra';
import { logger } from '../utils/logger.js';
import { promptInput } from '../utils/prompt.js';
import { loadConfig, saveConfig } from '../utils/config.js';
import * as fal from '../services/fal.service.js';
import type { GenerateImageOptions } from '../types/index.js';

const DEFAULT_OUTPUT_DIR = 'Assets';
const VALID_ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9', '9:21', 'auto'];
const VALID_RESOLUTIONS = ['1K', '2K', '4K'];
const VALID_FORMATS = ['png', 'jpg', 'jpeg', 'webp'];
const MAX_REFERENCE_IMAGES = 10;
const IMAGE_EXT_RE = /\.(png|jpe?g|webp)$/i;

export async function generateImage(options: GenerateImageOptions): Promise<void> {
  const config = await loadConfig();

  if (!config.falApiKey) {
    logger.warn('fal.ai API key is not configured.');
    logger.info('Get one at: https://fal.ai/dashboard/keys');
    const key = await promptInput('  Enter your fal.ai API key: ');
    if (!key.trim()) {
      logger.fatal('fal.ai API key is required for image generation.');
      process.exit(1);
    }
    config.falApiKey = key.trim();
    await saveConfig(config);
    logger.success('falApiKey saved to config.');
  }

  const prompt = options.prompt?.trim();
  if (!prompt) {
    logger.fatal('Prompt cannot be empty.');
    process.exit(1);
  }

  const aspectRatio = options.aspectRatio ?? '1:1';
  if (!VALID_ASPECT_RATIOS.includes(aspectRatio)) {
    logger.fatal(`Invalid aspect ratio: ${aspectRatio}. Valid: ${VALID_ASPECT_RATIOS.join(', ')}`);
    process.exit(1);
  }

  const resolution = options.resolution ?? '2K';
  if (!VALID_RESOLUTIONS.includes(resolution)) {
    logger.fatal(`Invalid resolution: ${resolution}. Valid: ${VALID_RESOLUTIONS.join(', ')}`);
    process.exit(1);
  }

  const outputFormat = (options.outputFormat ?? 'png').toLowerCase();
  if (!VALID_FORMATS.includes(outputFormat)) {
    logger.fatal(`Invalid output format: ${outputFormat}. Valid: ${VALID_FORMATS.join(', ')}`);
    process.exit(1);
  }

  const numImages = options.numImages ?? 1;
  if (numImages < 1 || numImages > 8) {
    logger.fatal(`num-images must be between 1 and 8 (got ${numImages}).`);
    process.exit(1);
  }

  // Resolve reference images (edit mode). Accepts HTTP(S) URLs, individual file
  // paths, or directories (auto-discovered). Uploads local files to imgbb when
  // the API key is configured — otherwise falls back to inline data URIs.
  const { urls: resolvedRefs, sources } = await resolveReferences(options.reference ?? []);
  const imageUrls: string[] = [];

  if (resolvedRefs.length > 0) {
    if (resolvedRefs.length > MAX_REFERENCE_IMAGES) {
      logger.warn(`Using first ${MAX_REFERENCE_IMAGES} reference images only (found ${resolvedRefs.length})`);
    }
    const refs = resolvedRefs.slice(0, MAX_REFERENCE_IMAGES);

    const localFiles = refs.filter((r) => !isHttpUrl(r));
    const remoteUrls = refs.filter((r) => isHttpUrl(r));

    let useImgbb = false;
    if (localFiles.length > 0 && config.imgbbApiKey) {
      useImgbb = true;
    }

    if (localFiles.length > 0 && !useImgbb) {
      logger.info('imgbbApiKey not set — using inline data URIs for reference images. Set it with `kappmaker config set imgbbApiKey <key>` for faster/more reliable uploads.');
    }

    for (const ref of refs) {
      if (isHttpUrl(ref)) {
        imageUrls.push(ref);
        continue;
      }
      if (useImgbb) {
        imageUrls.push(await fal.uploadImageToImgbb(config.imgbbApiKey, ref));
      } else {
        imageUrls.push(await fal.imageToDataUri(ref));
      }
    }

    logger.info(`Using ${imageUrls.length} reference image(s) → edit mode (sources: ${sources.join(', ')})`);
  }

  // Resolve output paths
  const outputPaths = resolveOutputPaths(options.output, numImages, outputFormat);
  await fs.ensureDir(path.dirname(outputPaths[0]));

  // Submit → poll → fetch → download
  logger.step(1, 3, 'Submitting image generation request');
  logger.info(`Prompt: ${prompt}`);
  logger.info(`Aspect ratio: ${aspectRatio} | Resolution: ${resolution} | Images: ${numImages}`);

  const queue = await fal.submitImageGeneration(config.falApiKey, {
    prompt,
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    numImages,
    resolution,
    aspectRatio,
    outputFormat,
  });

  logger.step(2, 3, 'Waiting for generation to complete');
  await fal.pollUntilComplete(config.falApiKey, queue.status_url, {
    label: 'Generating image(s) — this usually takes 1–2 minutes',
  });

  logger.step(3, 3, 'Downloading image(s)');
  const urls = await fal.fetchAllResults(config.falApiKey, queue.response_url);

  const results: string[] = [];
  for (let i = 0; i < urls.length; i++) {
    const outputPath = outputPaths[i] ?? outputPaths[0].replace(/(\.[^.]+)$/, `_${i + 1}$1`);
    await fal.downloadImage(urls[i], outputPath);
    results.push(outputPath);
    logger.info(`Saved: ${outputPath}`);
  }

  logger.success(`Generated ${results.length} image(s).`);
  logger.done();
}

function isHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(s);
}

/**
 * Expands `--reference` entries into a flat list of refs. Each entry may be:
 *   - an HTTP(S) URL — kept as-is
 *   - a file path   — resolved and kept as an absolute path
 *   - a directory   — scanned for png/jpg/jpeg/webp files (non-recursive, sorted)
 *
 * Returns the resolved refs plus a short description of each source for logging.
 */
async function resolveReferences(
  entries: string[],
): Promise<{ urls: string[]; sources: string[] }> {
  const urls: string[] = [];
  const sources: string[] = [];

  for (const entry of entries) {
    if (isHttpUrl(entry)) {
      urls.push(entry);
      sources.push('url');
      continue;
    }

    const resolved = path.resolve(entry);
    if (!(await fs.pathExists(resolved))) {
      logger.fatal(`Reference not found: ${resolved}`);
      process.exit(1);
    }

    const stat = await fs.stat(resolved);
    if (stat.isDirectory()) {
      const files = (await fs.readdir(resolved))
        .filter((f) => IMAGE_EXT_RE.test(f))
        .sort()
        .map((f) => path.join(resolved, f));
      if (files.length === 0) {
        logger.warn(`No image files found in directory: ${resolved}`);
        continue;
      }
      urls.push(...files);
      sources.push(`dir:${path.basename(resolved)}(${files.length})`);
    } else {
      if (!IMAGE_EXT_RE.test(resolved)) {
        logger.warn(`Reference is not a recognized image type (png/jpg/webp): ${resolved}`);
      }
      urls.push(resolved);
      sources.push('file');
    }
  }

  return { urls, sources };
}

function resolveOutputPaths(
  output: string | undefined,
  numImages: number,
  format: string,
): string[] {
  const ext = format === 'jpeg' ? 'jpg' : format;

  if (!output) {
    const dir = path.resolve(DEFAULT_OUTPUT_DIR);
    return Array.from({ length: numImages }, (_, i) =>
      path.join(dir, numImages === 1 ? `generated.${ext}` : `generated_${i + 1}.${ext}`),
    );
  }

  const resolved = path.resolve(output);
  const hasExt = path.extname(resolved).length > 0;

  // If output has no extension, treat as a directory
  if (!hasExt) {
    return Array.from({ length: numImages }, (_, i) =>
      path.join(resolved, numImages === 1 ? `generated.${ext}` : `generated_${i + 1}.${ext}`),
    );
  }

  // output is a file path
  if (numImages === 1) {
    return [resolved];
  }

  const dir = path.dirname(resolved);
  const base = path.basename(resolved, path.extname(resolved));
  const fileExt = path.extname(resolved);
  return Array.from({ length: numImages }, (_, i) =>
    path.join(dir, `${base}_${i + 1}${fileExt}`),
  );
}
