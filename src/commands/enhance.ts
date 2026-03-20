import path from 'node:path';
import fs from 'fs-extra';
import sharp from 'sharp';
import { logger } from '../utils/logger.js';
import { loadConfig } from '../utils/config.js';
import * as fal from '../services/fal.service.js';
import type { EnhanceOptions } from '../types/index.js';

export async function enhance(source: string, options: EnhanceOptions): Promise<void> {
  const config = await loadConfig();

  if (!config.falApiKey) {
    logger.fatal('fal.ai API key is not configured.');
    logger.info('Set it with: kappmaker config set falApiKey <your-key>');
    process.exit(1);
  }

  const sourcePath = path.resolve(source);
  if (!(await fs.pathExists(sourcePath))) {
    logger.fatal(`Source image not found: ${sourcePath}`);
    process.exit(1);
  }

  // Read original dimensions to preserve them
  const meta = await sharp(sourcePath).metadata();
  if (!meta.width || !meta.height) {
    logger.fatal('Could not read image dimensions');
    process.exit(1);
  }
  const { width, height } = meta;

  // Submit → poll → fetch → download
  logger.step(1, 3, 'Submitting image for enhancement');
  const queue = await fal.submitEnhancement(config.falApiKey, sourcePath);

  await fal.pollUntilComplete(config.falApiKey, queue.status_url, {
    label: 'Enhancing image',
  });

  logger.step(2, 3, 'Downloading enhanced image');
  const imageUrl = await fal.fetchResult(config.falApiKey, queue.response_url);

  const outputPath = options.output
    ? path.resolve(options.output)
    : defaultOutputPath(sourcePath);
  await fs.ensureDir(path.dirname(outputPath));

  // Download to a temp file, then resize to original dimensions
  const tmpPath = outputPath + '.tmp.png';
  await fal.downloadImage(imageUrl, tmpPath);

  logger.step(3, 3, `Resizing to original dimensions (${width}×${height})`);
  await sharp(tmpPath)
    .resize(width, height)
    .toFile(outputPath);
  await fs.remove(tmpPath);

  logger.success(`Saved to ${outputPath}`);
  logger.done();
}

function defaultOutputPath(sourcePath: string): string {
  const dir = path.dirname(sourcePath);
  const ext = path.extname(sourcePath);
  const name = path.basename(sourcePath, ext);
  return path.join(dir, `${name}_enhanced.png`);
}
