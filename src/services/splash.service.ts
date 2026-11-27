import path from 'node:path';
import fs from 'fs-extra';
import sharp from 'sharp';
import { logger } from '../utils/logger.js';
import { CliError } from '../utils/errors.js';

/**
 * Splash screens. The icon commands replaced the launcher icons but left the
 * template's splash (the Kotlin logo) in place: iOS shows
 * `Assets.xcassets/ic_logo.imageset` on `SplashBackground` (Info.plist
 * UILaunchScreen), Android 12+ shows `windowSplashScreenAnimatedIcon` from
 * `Theme.App.Starting` in res/values/styles.xml. An app shipped with the Kotlin
 * splash. These helpers write both, plus the Android themed (monochrome) icon,
 * and read the files back.
 */

const HEX_RE = /^#([0-9a-f]{6})$/i;

export function hexToColorsetComponents(hex: string): { red: string; green: string; blue: string; alpha: string } {
  const m = HEX_RE.exec(hex);
  if (!m) throw new CliError(`Splash background must be a 6-digit hex color like #F9F7FF (got: ${hex}).`);
  const h = m[1].toUpperCase();
  return { red: `0x${h.slice(0, 2)}`, green: `0x${h.slice(2, 4)}`, blue: `0x${h.slice(4, 6)}`, alpha: '1.000' };
}

/** The Assets.xcassets folder that holds AppIcon.appiconset (the icon output dir's parent). */
export function xcassetsDirFor(appIconDir: string): string | null {
  const parent = path.dirname(appIconDir);
  return path.basename(parent) === 'Assets.xcassets' ? parent : null;
}

// iOS shows the launch image at its point size: the template's ic_logo is 180pt.
const IOS_SPLASH_POINTS = 180;

export async function writeIosSplash(
  xcassetsDir: string,
  logo: Buffer,
  opts: { background?: string; backgroundDark?: string } = {},
): Promise<string[]> {
  const written: string[] = [];
  const imageset = path.join(xcassetsDir, 'ic_logo.imageset');
  await fs.ensureDir(imageset);
  // Replace whatever was there (the template ships a single ic_logo.png).
  for (const f of await fs.readdir(imageset)) {
    if (/\.(png|pdf|jpe?g)$/i.test(f)) await fs.remove(path.join(imageset, f));
  }
  const images: Array<Record<string, string>> = [];
  for (const scale of [1, 2, 3]) {
    const name = scale === 1 ? 'ic_logo.png' : `ic_logo@${scale}x.png`;
    const px = IOS_SPLASH_POINTS * scale;
    await sharp(logo).resize(px, px, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(path.join(imageset, name));
    images.push({ filename: name, idiom: 'universal', scale: `${scale}x` });
    written.push(path.join(imageset, name));
  }
  await fs.writeJson(path.join(imageset, 'Contents.json'), { images, info: { author: 'xcode', version: 1 } }, { spaces: 2 });

  if (opts.background || opts.backgroundDark) {
    const colorset = path.join(xcassetsDir, 'SplashBackground.colorset');
    const file = path.join(colorset, 'Contents.json');
    const current = (await fs.pathExists(file)) ? await fs.readJson(file) : { colors: [], info: { author: 'xcode', version: 1 } };
    const colors: Array<Record<string, unknown>> = Array.isArray(current.colors) ? current.colors : [];
    const isDark = (c: Record<string, unknown>) => JSON.stringify(c.appearances ?? '').includes('dark');
    const entry = (hex: string, dark: boolean) => ({
      ...(dark ? { appearances: [{ appearance: 'luminosity', value: 'dark' }] } : {}),
      color: { 'color-space': 'srgb', components: hexToColorsetComponents(hex) },
      idiom: 'universal',
    });
    const light = opts.background ? entry(opts.background, false) : colors.find((c) => !isDark(c));
    const dark = opts.backgroundDark ? entry(opts.backgroundDark, true) : colors.find(isDark);
    await fs.ensureDir(colorset);
    await fs.writeJson(file, { colors: [light, dark].filter(Boolean), info: { author: 'xcode', version: 1 } }, { spaces: 2 });
    written.push(file);
  }

  // Read back: every image is there at its size.
  for (const scale of [1, 2, 3]) {
    const f = path.join(imageset, scale === 1 ? 'ic_logo.png' : `ic_logo@${scale}x.png`);
    const meta = await sharp(f).metadata();
    if (meta.width !== IOS_SPLASH_POINTS * scale) throw new CliError(`iOS splash read-back: ${f} is ${meta.width}px, expected ${IOS_SPLASH_POINTS * scale}px.`);
  }
  logger.success(`iOS splash: ic_logo.imageset (1x/2x/3x)${opts.background || opts.backgroundDark ? ' + SplashBackground' : ''}`);
  return written;
}

/** White silhouette with the logo's alpha: Android 13 themed (monochrome) icon. Null if the logo has no transparency. */
export async function monochromeFrom(logo: Buffer): Promise<Buffer | null> {
  const { channels, hasAlpha } = await sharp(logo).metadata();
  if (!hasAlpha || channels !== 4) return null;
  const alpha = await sharp(logo).extractChannel('alpha').toBuffer();
  const stats = await sharp(alpha).stats();
  if (stats.channels[0].min === 255) return null; // fully opaque: no shape to keep
  const { width, height } = await sharp(logo).metadata();
  return sharp({ create: { width: width ?? 0, height: height ?? 0, channels: 3, background: '#FFFFFF' } })
    .joinChannel(alpha)
    .png()
    .toBuffer();
}

/**
 * Point the Android 12+ splash at the new launcher foreground (padded for the
 * splash circle) and optionally set the splash background color. Read back.
 */
export async function writeAndroidSplash(resDir: string, opts: { background?: string; backgroundDark?: string } = {}): Promise<void> {
  const stylesPath = path.join(resDir, 'values', 'styles.xml');
  if (await fs.pathExists(stylesPath)) {
    let styles = await fs.readFile(stylesPath, 'utf8');
    const icon = '<item name="windowSplashScreenAnimatedIcon">@mipmap/ic_launcher_foreground</item>';
    if (/<item name="windowSplashScreenAnimatedIcon">[^<]*<\/item>/.test(styles)) {
      styles = styles.replace(/<item name="windowSplashScreenAnimatedIcon">[^<]*<\/item>/, icon);
    } else if (/<style name="Theme\.App\.Starting"[^>]*>/.test(styles)) {
      styles = styles.replace(/(<style name="Theme\.App\.Starting"[^>]*>)/, `$1\n        ${icon}`);
    }
    await fs.writeFile(stylesPath, styles);
    if (!(await fs.readFile(stylesPath, 'utf8')).includes(icon) && styles.includes('Theme.App.Starting')) {
      throw new CliError(`Android splash read-back: ${stylesPath} does not point windowSplashScreenAnimatedIcon at the new icon.`);
    }
    logger.success('Android splash: windowSplashScreenAnimatedIcon -> @mipmap/ic_launcher_foreground');
  } else {
    logger.warn(`No ${path.relative(process.cwd(), stylesPath)}: Android splash theme not found, only launcher icons written.`);
  }
  if (opts.background) await upsertColor(path.join(resDir, 'values', 'colors.xml'), 'windowBackgroundColor', opts.background);
  if (opts.backgroundDark) await upsertColor(path.join(resDir, 'values-night', 'colors.xml'), 'windowBackgroundColor', opts.backgroundDark);
}

export async function upsertColor(colorsPath: string, name: string, hex: string): Promise<void> {
  const tag = `<color name="${name}">${hex}</color>`;
  const re = new RegExp(`<color name="${name}">[^<]*</color>`);
  let content = (await fs.pathExists(colorsPath)) ? await fs.readFile(colorsPath, 'utf8') : '<resources>\n</resources>\n';
  content = re.test(content) ? content.replace(re, tag) : content.replace('</resources>', `    ${tag}\n</resources>`);
  await fs.ensureDir(path.dirname(colorsPath));
  await fs.writeFile(colorsPath, content);
  logger.success(`${name} -> ${hex} in ${path.basename(path.dirname(colorsPath))}/colors.xml`);
}
