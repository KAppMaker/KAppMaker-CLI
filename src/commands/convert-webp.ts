import path from 'node:path';
import fs from 'fs-extra';
import sharp from 'sharp';
import { logger } from '../utils/logger.js';

interface ConvertWebpOptions {
  quality: string;
  recursive: boolean;
  deleteOriginals: boolean;
  output?: string;
}

export async function convertWebp(source: string, options: ConvertWebpOptions): Promise<void> {
  const sourcePath = path.resolve(source);
  const quality = parseInt(options.quality, 10);

  if (!(await fs.pathExists(sourcePath))) {
    logger.fatal(`Source not found: ${sourcePath}`);
    process.exit(1);
  }

  const stat = await fs.stat(sourcePath);
  const files = stat.isDirectory()
    ? await collectImages(sourcePath, options.recursive)
    : [sourcePath];

  if (files.length === 0) {
    logger.warn('No image files found (png, jpg, jpeg, bmp, tiff, gif).');
    return;
  }

  logger.info(`Converting ${files.length} image(s) to WebP (quality: ${quality})…`);

  let totalSavedBytes = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const relName = stat.isDirectory() ? path.relative(sourcePath, file) : path.basename(file);
    logger.step(i + 1, files.length, relName);

    const outputPath = resolveOutput(file, sourcePath, stat.isDirectory(), options.output);
    await fs.ensureDir(path.dirname(outputPath));

    const originalSize = (await fs.stat(file)).size;
    await sharp(file).webp({ quality }).toFile(outputPath);
    const newSize = (await fs.stat(outputPath)).size;

    const saved = originalSize - newSize;
    totalSavedBytes += saved;
    const pct = originalSize > 0 ? ((saved / originalSize) * 100).toFixed(1) : '0';
    logger.success(`  ${formatBytes(originalSize)} → ${formatBytes(newSize)} (${pct}% smaller)`);

    if (options.deleteOriginals && outputPath !== file) {
      await fs.remove(file);
    }
  }

  logger.info(`Total saved: ${formatBytes(totalSavedBytes)}`);
  logger.done();
}

const IMAGE_EXT = /\.(png|jpe?g|bmp|tiff?|gif)$/i;

async function collectImages(dir: string, recursive: boolean): Promise<string[]> {
  const results: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && recursive) {
      results.push(...(await collectImages(full, true)));
    } else if (entry.isFile() && IMAGE_EXT.test(entry.name)) {
      results.push(full);
    }
  }
  return results.sort();
}

function resolveOutput(file: string, sourceRoot: string, isDir: boolean, outputDir?: string): string {
  const ext = path.extname(file);
  const name = path.basename(file, ext);
  if (!outputDir) {
    return path.join(path.dirname(file), `${name}.webp`);
  }
  if (isDir) {
    const rel = path.relative(sourceRoot, file);
    const relWebp = rel.replace(IMAGE_EXT, '.webp');
    return path.join(path.resolve(outputDir), relWebp);
  }
  return path.join(path.resolve(outputDir), `${name}.webp`);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}
