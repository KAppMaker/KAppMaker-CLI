import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import sharp from 'sharp';
import { logger } from '../utils/logger.js';
import { confirm } from '../utils/prompt.js';

/**
 * Apple's App Review screenshot for subscriptions / IAPs accepts a wide range
 * of sizes (minimum 640 × 920 px per Apple's docs) but the recommended size
 * matches the current iPhone 6.7" Display App Store listing screenshot:
 * 1290 × 2796 px (portrait). Images at this size are guaranteed to satisfy
 * every iPhone display class Apple currently supports.
 */
export const REVIEW_SCREENSHOT_TARGET_WIDTH = 1290;
export const REVIEW_SCREENSHOT_TARGET_HEIGHT = 2796;

export interface PrepareReviewScreenshotOptions {
  /** When false (default), silently use the existing file without prompting. */
  promptOnSizeMismatch?: boolean;
}

/**
 * Validate a review-screenshot file's dimensions and offer to resize it to
 * Apple's recommended 1290 × 2796 (iPhone 6.7" Display) while keeping aspect
 * ratio. Returns the path to use for upload — either the original file or a
 * temp resized copy.
 *
 * Behaviour:
 *   - File missing or unreadable → returns null (caller logs + skips).
 *   - Already 1290 × 2796 → returns the original path (no prompt, no work).
 *   - Different size + `promptOnSizeMismatch: true` → prompts the user; if
 *     they accept, writes a resized copy to a tmp file and returns that path.
 *     Resize uses `fit: 'inside'` so aspect ratio is preserved (output may
 *     be e.g. 1290 × 2400 or 1080 × 2796 depending on the source aspect).
 *   - Different size + `promptOnSizeMismatch: false` → returns the original
 *     path without prompting (Apple will validate server-side).
 */
export async function prepareReviewScreenshot(
  filePath: string,
  opts: PrepareReviewScreenshotOptions = {},
): Promise<string | null> {
  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  try {
    await fs.access(abs);
  } catch {
    return null;
  }

  let meta;
  try {
    meta = await sharp(abs).metadata();
  } catch (err) {
    logger.warn(`Could not read image metadata for ${abs}: ${err instanceof Error ? err.message : String(err)}`);
    return abs; // fall back to as-is
  }
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;

  if (
    width === REVIEW_SCREENSHOT_TARGET_WIDTH &&
    height === REVIEW_SCREENSHOT_TARGET_HEIGHT
  ) {
    return abs;
  }

  if (!opts.promptOnSizeMismatch) {
    return abs;
  }

  logger.warn(`Review screenshot ${path.basename(abs)} is ${width}×${height}.`);
  logger.info(`Apple's App Store recommended size for review screenshots: ${REVIEW_SCREENSHOT_TARGET_WIDTH}×${REVIEW_SCREENSHOT_TARGET_HEIGHT} (iPhone 6.7" Display, portrait).`);
  const shouldResize = await confirm(
    `  Resize to ${REVIEW_SCREENSHOT_TARGET_WIDTH}×${REVIEW_SCREENSHOT_TARGET_HEIGHT} keeping aspect ratio? (Y/n)`,
  );
  if (!shouldResize) {
    return abs;
  }

  const tempPath = path.join(
    os.tmpdir(),
    `kappmaker-review-${Date.now()}-${path.basename(abs)}`,
  );
  await sharp(abs)
    .resize({
      width: REVIEW_SCREENSHOT_TARGET_WIDTH,
      height: REVIEW_SCREENSHOT_TARGET_HEIGHT,
      fit: 'inside',
      withoutEnlargement: false,
    })
    .toFile(tempPath);
  const newMeta = await sharp(tempPath).metadata();
  logger.success(`Resized to ${newMeta.width}×${newMeta.height} (saved to temp file).`);
  return tempPath;
}
