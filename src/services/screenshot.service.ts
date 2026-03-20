import path from 'node:path';
import fs from 'fs-extra';
import sharp from 'sharp';

// ── Locale mapping (Play Store → App Store) ─────────────────────────

export const LOCALE_MAPPING: Record<string, string | null> = {
  'ar': 'ar-SA',
  'bg-BG': null,
  'bn-BD': null,
  'ca': 'ca',
  'cs-CZ': 'cs',
  'da-DK': 'da',
  'de-DE': 'de-DE',
  'el-GR': 'el',
  'en-AU': 'en-AU',
  'en-GB': 'en-GB',
  'es-ES': 'es-ES',
  'es-419': 'es-MX',
  'et-EE': null,
  'fi-FI': 'fi',
  'fil': null,
  'fr-FR': 'fr-FR',
  'fr-CA': 'fr-CA',
  'he-IL': 'he',
  'hi-IN': 'hi',
  'hr': 'hr',
  'hu-HU': 'hu',
  'id': 'id',
  'it-IT': 'it',
  'ja-JP': 'ja',
  'ko-KR': 'ko',
  'lt-LT': null,
  'lv-LV': null,
  'ms': 'ms',
  'nl-NL': 'nl-NL',
  'no-NO': 'no',
  'pl-PL': 'pl',
  'pt-BR': 'pt-BR',
  'pt-PT': 'pt-PT',
  'ro': 'ro',
  'ru-RU': 'ru',
  'sk': 'sk',
  'sl-SI': null,
  'sr': null,
  'sv-SE': 'sv',
  'sw': null,
  'ta-IN': null,
  'te-IN': null,
  'th': 'th',
  'tr-TR': 'tr',
  'uk': 'uk',
  'vi': 'vi',
  'zh-CN': 'zh-Hans',
  'zh-TW': 'zh-Hant',
};

export const DEFAULT_LOCALES = Object.keys(LOCALE_MAPPING);

// Reverse mapping: App Store locale → Play Store locale
const IOS_TO_PLAYSTORE: Record<string, string> = {};
for (const [ps, ios] of Object.entries(LOCALE_MAPPING)) {
  if (ios) IOS_TO_PLAYSTORE[ios] = ps;
}

/**
 * Resolve a locale code to its Play Store form.
 * Accepts either Play Store codes (tr-TR) or iOS codes (tr).
 * Returns the Play Store code, or null if unrecognized.
 */
export function resolveLocale(input: string): string | null {
  if (input in LOCALE_MAPPING) return input;
  if (input in IOS_TO_PLAYSTORE) return IOS_TO_PLAYSTORE[input];
  return null;
}

// ── Grid operations ─────────────────────────────────────────────────

export async function combineScreenshots(
  imagePaths: string[],
  rows: number,
  cols: number,
): Promise<{ buffer: Buffer; count: number }> {
  const firstMeta = await sharp(imagePaths[0]).metadata();
  const tileW = firstMeta.width!;
  const tileH = firstMeta.height!;
  const canvasW = cols * tileW;
  const canvasH = rows * tileH;

  const compositeInputs: sharp.OverlayOptions[] = [];
  const count = Math.min(imagePaths.length, rows * cols);

  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const resized = await sharp(imagePaths[i]).resize(tileW, tileH).toBuffer();
    compositeInputs.push({
      input: resized,
      left: col * tileW,
      top: row * tileH,
    });
  }

  const buffer = await sharp({
    create: { width: canvasW, height: canvasH, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .composite(compositeInputs)
    .png()
    .toBuffer();

  return { buffer, count };
}

export async function splitTranslatedGrid(
  gridBuffer: Buffer,
  count: number,
  rows: number,
  cols: number,
  targetWidth: number,
  targetHeight: number,
): Promise<Buffer[]> {
  const meta = await sharp(gridBuffer).metadata();
  const tileW = Math.floor(meta.width! / cols);
  const tileH = Math.floor(meta.height! / rows);

  const buffers: Buffer[] = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const tile = await sharp(gridBuffer)
      .extract({ left: col * tileW, top: row * tileH, width: tileW, height: tileH })
      .resize(targetWidth, targetHeight)
      .png()
      .toBuffer();
    buffers.push(tile);
  }
  return buffers;
}

// ── Fastlane directory output ───────────────────────────────────────

export async function saveToFastlane(
  tiles: Buffer[],
  locale: string,
  outputDir: string,
): Promise<void> {
  // Android
  const androidDir = path.join(
    outputDir, 'android', 'playstore_metadata', locale, 'images', 'phoneScreenshots',
  );
  await fs.ensureDir(androidDir);
  for (let i = 0; i < tiles.length; i++) {
    await fs.writeFile(path.join(androidDir, `${i + 1}_${locale}.png`), tiles[i]);
  }

  // iOS
  const iosLocale = LOCALE_MAPPING[locale];
  if (iosLocale) {
    const iosDir = path.join(
      outputDir, 'ios', 'appstore_metadata', 'screenshots', iosLocale,
    );
    await fs.ensureDir(iosDir);
    for (let i = 0; i < tiles.length; i++) {
      await fs.writeFile(path.join(iosDir, `${i}_APP_IPHONE_65_${i}.png`), tiles[i]);
    }
  }
}
