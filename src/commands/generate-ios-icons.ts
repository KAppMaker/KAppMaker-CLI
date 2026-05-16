import path from 'node:path';
import fs from 'fs-extra';
import sharp from 'sharp';
import { logger } from '../utils/logger.js';
import { promptInput } from '../utils/prompt.js';

export interface GenerateIosIconsOptions {
  source?: string;
  output?: string;
  background?: string;
}

interface IconEntry {
  size: string;
  filename: string;
  idiom: 'iphone' | 'ios-marketing';
  scale: '1x' | '2x' | '3x';
  expectedSize: string;
}

// 12 entries → 11 unique PNG sizes (120.png is shared by 40pt@3x and 60pt@2x).
// Matches the schema produced by appicon.co for iPhone-only projects.
const ICON_ENTRIES: IconEntry[] = [
  { size: '20x20', expectedSize: '40',   filename: '40.png',   idiom: 'iphone',        scale: '2x' },
  { size: '20x20', expectedSize: '60',   filename: '60.png',   idiom: 'iphone',        scale: '3x' },
  { size: '29x29', expectedSize: '29',   filename: '29.png',   idiom: 'iphone',        scale: '1x' },
  { size: '29x29', expectedSize: '58',   filename: '58.png',   idiom: 'iphone',        scale: '2x' },
  { size: '29x29', expectedSize: '87',   filename: '87.png',   idiom: 'iphone',        scale: '3x' },
  { size: '40x40', expectedSize: '80',   filename: '80.png',   idiom: 'iphone',        scale: '2x' },
  { size: '40x40', expectedSize: '120',  filename: '120.png',  idiom: 'iphone',        scale: '3x' },
  { size: '57x57', expectedSize: '57',   filename: '57.png',   idiom: 'iphone',        scale: '1x' },
  { size: '57x57', expectedSize: '114',  filename: '114.png',  idiom: 'iphone',        scale: '2x' },
  { size: '60x60', expectedSize: '120',  filename: '120.png',  idiom: 'iphone',        scale: '2x' },
  { size: '60x60', expectedSize: '180',  filename: '180.png',  idiom: 'iphone',        scale: '3x' },
  { size: '1024x1024', expectedSize: '1024', filename: '1024.png', idiom: 'ios-marketing', scale: '1x' },
];

// Auto-detect candidates checked in order when --source is omitted. Each name
// is probed in `./Assets` and `../Assets` (so the command works both from the
// project root and from inside `MobileApp/`).
const SOURCE_CANDIDATES = [
  'logo.png',
  'logo_no_bg.png',
  'app_logo.png',
  'app_logo_no_bg.png',
  'icon.png',
];

const HEX_COLOR_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export async function generateIosIcons(options: GenerateIosIconsOptions): Promise<void> {
  const sourcePath = await resolveSource(options.source);
  const meta = await sharp(sourcePath).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;

  if (width < 1024 || height < 1024) {
    logger.warn(
      `Source image is ${width}×${height} — recommended minimum is 1024×1024. ` +
      `Sharp will upscale, which may produce blurry icons.`,
    );
  }
  if (width !== height) {
    logger.warn(
      `Source image is not square (${width}×${height}) — it will be center-cropped to a square before resizing.`,
    );
  }

  const background = options.background ?? '#FFFFFF';
  if (!HEX_COLOR_RE.test(background)) {
    logger.fatal(`--background must be a hex color like #FFFFFF (got: ${background}).`);
    process.exit(1);
  }

  const outputDir = await resolveOutputDir(options.output);
  await fs.ensureDir(outputDir);

  logger.info(`Source: ${sourcePath} (${width}×${height})`);
  logger.info(`Output: ${outputDir}`);

  // Square + flatten alpha once, then resize for each unique pixel size.
  // Flatten guarantees the 1024×1024 has no alpha (App Store requirement) and
  // keeps smaller icons predictable when the source is a transparent logo.
  const squareSize = Math.min(width, height);
  const basePipeline = sharp(sourcePath)
    .resize({ width: squareSize, height: squareSize, fit: 'cover', position: 'center' })
    .flatten({ background });
  const baseBuffer = await basePipeline.png().toBuffer();

  const uniqueSizes = Array.from(new Set(ICON_ENTRIES.map((e) => parseInt(e.expectedSize, 10))));
  for (const px of uniqueSizes) {
    const outPath = path.join(outputDir, `${px}.png`);
    await sharp(baseBuffer)
      .resize(px, px, { fit: 'cover', position: 'center', kernel: 'lanczos3' })
      .png()
      .toFile(outPath);
    logger.success(`Generated ${px}.png`);
  }

  // Write Contents.json matching the appicon.co schema.
  const contentsPath = path.join(outputDir, 'Contents.json');
  const contents = {
    images: ICON_ENTRIES.map((e) => ({
      size: e.size,
      'expected-size': e.expectedSize,
      filename: e.filename,
      folder: 'Assets.xcassets/AppIcon.appiconset/',
      idiom: e.idiom,
      scale: e.scale,
    })),
    info: { version: 1, author: 'xcode' },
  };
  await fs.writeJson(contentsPath, contents, { spaces: 2 });
  logger.success('Generated Contents.json');

  logger.success(`iOS app icons written to: ${outputDir}`);
  logger.done();
}

async function resolveSource(source?: string): Promise<string> {
  if (source) {
    const abs = path.resolve(source);
    if (!(await fs.pathExists(abs))) {
      logger.fatal(`Source image not found: ${abs}`);
      process.exit(1);
    }
    return abs;
  }

  const searchDirs = [path.resolve('Assets'), path.resolve('../Assets')];
  for (const dir of searchDirs) {
    for (const name of SOURCE_CANDIDATES) {
      const candidate = path.join(dir, name);
      if (await fs.pathExists(candidate)) {
        return candidate;
      }
    }
  }

  logger.warn('No logo found in Assets/ (looked for: ' + SOURCE_CANDIDATES.join(', ') + ').');
  const userPath = await promptInput('  Path to source logo image: ');
  const trimmed = userPath.trim();
  if (!trimmed) {
    logger.fatal('Source path is required.');
    process.exit(1);
  }
  const abs = path.resolve(trimmed);
  if (!(await fs.pathExists(abs))) {
    logger.fatal(`Source image not found: ${abs}`);
    process.exit(1);
  }
  return abs;
}

async function resolveOutputDir(output?: string): Promise<string> {
  if (output) return path.resolve(output);

  // Find the iOS app's AppIcon.appiconset directory. KAppMaker projects place
  // the iOS app under MobileApp/iosApp/<AppName>/Assets.xcassets/AppIcon.appiconset
  // but the <AppName> directory varies — list iosApp/ and pick the first
  // subdirectory that contains the expected path.
  const iosAppParents = [
    path.resolve('MobileApp/iosApp'),
    path.resolve('../MobileApp/iosApp'),
    path.resolve('iosApp'),
  ];

  for (const parent of iosAppParents) {
    if (!(await fs.pathExists(parent))) continue;
    let entries: string[];
    try {
      entries = await fs.readdir(parent);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const candidate = path.join(parent, entry, 'Assets.xcassets', 'AppIcon.appiconset');
      if (await fs.pathExists(candidate)) {
        return candidate;
      }
    }
  }

  return path.resolve('Assets/AppIcon.appiconset');
}
