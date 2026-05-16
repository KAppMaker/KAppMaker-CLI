import path from 'node:path';
import fs from 'fs-extra';
import sharp from 'sharp';
import { logger } from '../utils/logger.js';
import { promptInput } from '../utils/prompt.js';

export interface GenerateAndroidIconsOptions {
  source?: string;
  output?: string;
  background?: string;
  foregroundPadding?: number;
}

interface DensityBucket {
  dir: string;
  legacy: number;
  foreground: number;
}

// Android's 5 standard density buckets. Legacy launcher sizes are 48dp at 1x/2x/3x/4x;
// adaptive foreground is 108dp at the same scales (legacy × 2.25).
const DENSITIES: DensityBucket[] = [
  { dir: 'mipmap-mdpi',    legacy: 48,  foreground: 108 },
  { dir: 'mipmap-hdpi',    legacy: 72,  foreground: 162 },
  { dir: 'mipmap-xhdpi',   legacy: 96,  foreground: 216 },
  { dir: 'mipmap-xxhdpi',  legacy: 144, foreground: 324 },
  { dir: 'mipmap-xxxhdpi', legacy: 192, foreground: 432 },
];

const SOURCE_CANDIDATES = [
  'logo.png',
  'logo_no_bg.png',
  'app_logo.png',
  'app_logo_no_bg.png',
  'icon.png',
];

const HEX_COLOR_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

const ADAPTIVE_XML = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>`;

export async function generateAndroidIcons(
  options: GenerateAndroidIconsOptions,
): Promise<void> {
  const sourcePath = await resolveSource(options.source);
  const meta = await sharp(sourcePath).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;

  if (width < 432 || height < 432) {
    logger.warn(
      `Source image is ${width}×${height} — recommended minimum is 432×432 (the xxxhdpi foreground size). ` +
      `Smaller sources are upscaled and may look blurry.`,
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

  const fgPadding = options.foregroundPadding ?? 0.25;
  if (fgPadding < 0 || fgPadding >= 0.5) {
    logger.fatal(`--foreground-padding must be in [0, 0.5) (got: ${fgPadding}).`);
    process.exit(1);
  }

  const resDir = await resolveResDir(options.output);
  logger.info(`Source: ${sourcePath} (${width}×${height})`);
  logger.info(`Output res dir: ${resDir}`);
  logger.info(`Adaptive background: ${background} | Foreground padding: ${(fgPadding * 100).toFixed(0)}% each side`);

  // Square-crop the source once to use as the canonical input for resizes.
  const squareSize = Math.min(width, height);
  const squareSrc = await sharp(sourcePath)
    .resize(squareSize, squareSize, { fit: 'cover', position: 'center' })
    .png()
    .toBuffer();

  // Generate the per-density PNG/webp files.
  for (const d of DENSITIES) {
    const dirPath = path.join(resDir, d.dir);
    await fs.ensureDir(dirPath);

    // Legacy launcher icons — full canvas, preserves source alpha (matches
    // Android Studio's modern behavior; legacy launchers without adaptive
    // support render whatever the file contains).
    const legacyBuf = await sharp(squareSrc)
      .resize(d.legacy, d.legacy, { fit: 'cover', position: 'center', kernel: 'lanczos3' })
      .webp({ quality: 90 })
      .toBuffer();
    await fs.writeFile(path.join(dirPath, 'ic_launcher.webp'), legacyBuf);
    await fs.writeFile(path.join(dirPath, 'ic_launcher_round.webp'), legacyBuf);

    // Adaptive foreground — logo in the inner safe-zone, transparent surround.
    const innerSize = Math.round(d.foreground * (1 - fgPadding * 2));
    const innerOffset = Math.round((d.foreground - innerSize) / 2);
    const innerBuf = await sharp(squareSrc)
      .resize(innerSize, innerSize, { fit: 'cover', position: 'center', kernel: 'lanczos3' })
      .png()
      .toBuffer();
    const fgBuf = await sharp({
      create: {
        width: d.foreground,
        height: d.foreground,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([{ input: innerBuf, left: innerOffset, top: innerOffset }])
      .webp({ quality: 90 })
      .toBuffer();
    await fs.writeFile(path.join(dirPath, 'ic_launcher_foreground.webp'), fgBuf);

    logger.success(`Wrote ${d.dir}/ (${d.legacy}px launcher + ${d.foreground}px foreground)`);
  }

  // Adaptive icon XML files (API 26+).
  const anyDpiDir = path.join(resDir, 'mipmap-anydpi-v26');
  await fs.ensureDir(anyDpiDir);
  await fs.writeFile(path.join(anyDpiDir, 'ic_launcher.xml'), ADAPTIVE_XML);
  await fs.writeFile(path.join(anyDpiDir, 'ic_launcher_round.xml'), ADAPTIVE_XML);
  logger.success('Wrote mipmap-anydpi-v26/ic_launcher.xml + ic_launcher_round.xml');

  // Insert/update the ic_launcher_background color reference in values/colors.xml.
  await upsertBackgroundColor(resDir, background);

  logger.success(`Android app icons written to: ${resDir}`);
  logger.info('AndroidManifest.xml should already reference @mipmap/ic_launcher and @mipmap/ic_launcher_round.');
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
      if (await fs.pathExists(candidate)) return candidate;
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

async function resolveResDir(output?: string): Promise<string> {
  if (output) return path.resolve(output);

  // KAppMaker convention: composeApp module. Fall back to legacy androidApp
  // module names and pure-Android `app/` for non-KMM projects.
  const candidates = [
    'MobileApp/composeApp/src/androidMain/res',
    '../MobileApp/composeApp/src/androidMain/res',
    'composeApp/src/androidMain/res',
    'MobileApp/androidApp/src/main/res',
    '../MobileApp/androidApp/src/main/res',
    'app/src/main/res',
  ];

  for (const rel of candidates) {
    const abs = path.resolve(rel);
    if (await fs.pathExists(abs)) return abs;
  }

  return path.resolve('Assets/android/res');
}

async function upsertBackgroundColor(resDir: string, hex: string): Promise<void> {
  const colorsDir = path.join(resDir, 'values');
  const colorsPath = path.join(colorsDir, 'colors.xml');
  const colorTag = `<color name="ic_launcher_background">${hex}</color>`;

  if (await fs.pathExists(colorsPath)) {
    let content = await fs.readFile(colorsPath, 'utf-8');
    if (/<color name="ic_launcher_background">[^<]*<\/color>/.test(content)) {
      content = content.replace(
        /<color name="ic_launcher_background">[^<]*<\/color>/,
        colorTag,
      );
      logger.success(`Updated ic_launcher_background → ${hex} in values/colors.xml`);
    } else {
      content = content.replace('</resources>', `    ${colorTag}\n</resources>`);
      logger.success(`Inserted ic_launcher_background (${hex}) into values/colors.xml`);
    }
    await fs.writeFile(colorsPath, content);
    return;
  }

  await fs.ensureDir(colorsDir);
  const newContent = `<resources>\n    ${colorTag}\n</resources>\n`;
  await fs.writeFile(colorsPath, newContent);
  logger.success(`Created values/colors.xml with ic_launcher_background (${hex})`);
}
