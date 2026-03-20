import path from 'node:path';
import fs from 'fs-extra';
import { logger } from '../utils/logger.js';
import { loadConfig } from '../utils/config.js';
import * as fal from '../services/fal.service.js';
import type { RemoveBgOptions } from '../types/index.js';

export async function removeBackground(source: string, options: RemoveBgOptions): Promise<void> {
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

  // Determine output path
  const outputPath = options.output
    ? path.resolve(options.output)
    : defaultOutputPath(sourcePath);
  await fs.ensureDir(path.dirname(outputPath));

  // Submit → poll → fetch → download
  logger.step(1, 2, 'Submitting image for background removal');
  const queue = await fal.submitBackgroundRemoval(config.falApiKey, sourcePath);

  await fal.pollUntilComplete(config.falApiKey, queue.status_url, {
    label: 'Removing background',
  });

  logger.step(2, 2, 'Downloading result');
  const imageUrl = await fal.fetchResult(config.falApiKey, queue.response_url);
  await fal.downloadImage(imageUrl, outputPath);

  logger.success(`Saved to ${outputPath}`);
  logger.done();
}

function defaultOutputPath(sourcePath: string): string {
  const dir = path.dirname(sourcePath);
  const ext = path.extname(sourcePath);
  const name = path.basename(sourcePath, ext);
  return path.join(dir, `${name}_no_bg.png`);
}
