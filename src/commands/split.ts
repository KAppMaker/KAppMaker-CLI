import path from 'node:path';
import fs from 'fs-extra';
import { logger } from '../utils/logger.js';
import { splitGrid } from '../services/logo.service.js';
import type { SplitOptions } from '../types/index.js';

export async function split(source: string, options: SplitOptions): Promise<void> {
  const sourcePath = path.resolve(source);

  if (!(await fs.pathExists(sourcePath))) {
    logger.fatal(`Image not found: ${sourcePath}`);
    process.exit(1);
  }

  const outputDir = path.resolve(options.outputDir ?? '.');
  await fs.ensureDir(outputDir);

  const rows = options.rows ?? 4;
  const cols = options.cols ?? 4;
  const zoom = options.zoom ?? 1.07;
  const gap = options.gap ?? 0;
  const width = options.width ?? 512;
  const height = options.height ?? 512;

  const keep = options.keep;

  logger.info(`Splitting ${source} into ${rows}x${cols} grid`);
  logger.info(`Zoom: ${zoom}, Gap: ${gap}, Output size: ${width}x${height}`);
  if (keep) {
    logger.info(`Keeping only tiles: ${keep.join(', ')}`);
  }

  await splitGrid(sourcePath, outputDir, { rows, cols, zoom, gap, width, height });

  if (keep && keep.length > 0) {
    const total = rows * cols;
    for (let i = 1; i <= total; i++) {
      if (!keep.includes(i)) {
        const tilePath = path.join(outputDir, `image_${i}.png`);
        await fs.remove(tilePath);
      }
    }
  }

  logger.done();
}
