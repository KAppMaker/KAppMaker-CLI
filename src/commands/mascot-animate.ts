import path from 'node:path';
import fs from 'fs-extra';
import { execa } from 'execa';
import sharp from 'sharp';
import { logger } from '../utils/logger.js';
import { promptInput } from '../utils/prompt.js';
import { loadConfig } from '../utils/config.js';
import { ensureFalKey } from '../utils/api-keys.js';
import { loadSpec } from '../utils/spec-file.js';
import * as fal from '../services/fal.service.js';
import * as mascot from '../services/mascot.service.js';
import type { MascotAnimateOptions } from '../types/index.js';

// Rough $/second, for the pre-spend estimate only (fal pricing, mid-2026).
const COST_PER_SECOND: Record<string, number> = { 'seedance-mini': 0.0721, ltx: 0.04, seedance: 0.24 };
const DEFAULT_RESOLUTION: Record<string, string> = { 'seedance-mini': '480p', ltx: '1080p', seedance: '720p' };

export async function mascotAnimate(options: MascotAnimateOptions): Promise<void> {
  const config = await loadConfig();
  await ensureFalKey(config);

  const model = options.model ?? 'seedance-mini';
  if (!COST_PER_SECOND[model]) {
    logger.fatal(`Unknown model: ${model}. Available: seedance-mini (cheap default), ltx (cheapest 1080p, outage-prone), seedance (premium).`);
    process.exit(1);
  }

  // Source image: --image wins, else the named state's PNG from Assets/mascot/states
  const slug = options.state ? mascot.stateSlug(options.state) : undefined;
  const sourcePath = options.image
    ? path.resolve(options.image)
    : slug
      ? ['Assets/mascot/states', '../Assets/mascot/states']
          .map((d) => path.resolve(d, `${slug}.png`))
          .find((p) => fs.pathExistsSync(p))
      : undefined;
  if (!sourcePath || !(await fs.pathExists(sourcePath))) {
    logger.fatal(
      options.state
        ? `No image found for state "${options.state}" (looked for states/${slug}.png). Generate it first with \`kappmaker mascot-add-state\`, or pass --image <path>.`
        : 'Pass --state <name> (an existing state under Assets/mascot/states) or --image <path>.',
    );
    process.exit(1);
  }
  logger.info(`Source image: ${sourcePath}`);

  // Motion: --motion > per-state default > generic idle
  const motion =
    options.motion?.trim() ||
    (slug && mascot.DEFAULT_STATE_MOTIONS[slug]) ||
    mascot.DEFAULT_STATE_MOTIONS.idle;
  const prompt = options.spec ? await loadSpec(options.spec) : mascot.buildMascotAnimationPrompt(motion);

  const duration = mascot.clampAnimationDuration(model, options.duration ?? (model === 'ltx' ? 6 : 4));
  const resolution = options.resolution ?? DEFAULT_RESOLUTION[model];

  // Videos are costly — always show the estimate, confirm unless --yes
  // (seedance-mini picks its own duration; estimate assumes ~5s)
  const estimateSeconds = model === 'seedance-mini' ? 5 : duration;
  const estimate = (COST_PER_SECOND[model] * estimateSeconds).toFixed(2);
  logger.info(`Model: ${model} | ${model === 'seedance-mini' ? 'auto duration (~5s)' : `${duration}s`} @ ${resolution} | estimated cost ~$${estimate}`);
  if (!options.yes) {
    const answer = (await promptInput('Proceed? (Y/n): ')).trim().toLowerCase();
    if (answer === 'n' || answer === 'no') {
      logger.info('Cancelled — nothing was generated.');
      return;
    }
  }

  logger.step(1, 2, `Animating mascot (${motion})`);
  // Prefer a public imgbb URL over an inline data URI — smaller payloads and
  // fewer model-side edge cases. Transparent sources are flattened onto white
  // first (video models have no alpha; transparency renders as black).
  const uploadPath = await flattenIfTransparent(sourcePath);
  const imageUrl = config.imgbbApiKey
    ? await fal.uploadImageToImgbb(config.imgbbApiKey, uploadPath)
    : await fal.imageToDataUri(uploadPath);
  const queue = await fal.submitVideoGeneration(config.falApiKey, model, {
    prompt,
    imageUrl,
    durationSeconds: duration,
    resolution,
  });
  await fal.pollUntilComplete(config.falApiKey, queue.status_url, {
    label: 'Generating animation — this can take a few minutes',
    intervalMs: 10_000,
  });
  const videoUrl = await fal.fetchVideoResult(config.falApiKey, queue.response_url);

  const outputPath = options.output
    ? path.resolve(options.output)
    : path.join(path.dirname(path.dirname(sourcePath)), 'animations', `${slug ?? path.parse(sourcePath).name}.mp4`);
  await fs.ensureDir(path.dirname(outputPath));
  await fal.downloadImage(videoUrl, outputPath);
  logger.success(`Animation saved to ${outputPath}`);

  // Optional looping WebP/GIF conversion when ffmpeg is available
  logger.step(2, 2, `Converting to looping WebP${options.gif ? ' + GIF' : ''}`);
  await convertToWebpLoop(outputPath);
  if (options.gif) await convertToGifLoop(outputPath);
  logger.done();
}

// Video models have no alpha channel — a transparent PNG source renders as
// black. Flatten onto white into a sibling temp file when alpha is present.
async function flattenIfTransparent(sourcePath: string): Promise<string> {
  const meta = await sharp(sourcePath).metadata();
  if (!meta.hasAlpha) return sourcePath;
  const flatPath = sourcePath.replace(/(\.[^.]+)$/, '_flat$1');
  await sharp(sourcePath).flatten({ background: '#FFFFFF' }).png().toFile(flatPath);
  logger.info('Source has transparency — flattened onto white for the video model.');
  return flatPath;
}

async function convertToWebpLoop(mp4Path: string): Promise<void> {
  const webpPath = mp4Path.replace(/\.mp4$/, '.webp');
  try {
    await execa('ffmpeg', [
      '-y', '-i', mp4Path,
      '-vf', 'fps=15,scale=512:-2',
      '-loop', '0', '-an',
      webpPath,
    ]);
    logger.success(`Looping WebP saved to ${webpPath}`);
  } catch {
    logger.info('ffmpeg not found — kept MP4 only. Install ffmpeg (`brew install ffmpeg`) to also get a looping WebP.');
  }
}

// Two-pass palette conversion — single-pass GIF banding looks bad on flat
// mascot colors. ~480px/12fps keeps README/chat-friendly file sizes.
async function convertToGifLoop(mp4Path: string): Promise<void> {
  const gifPath = mp4Path.replace(/\.mp4$/, '.gif');
  try {
    await execa('ffmpeg', [
      '-y', '-i', mp4Path,
      '-vf', 'fps=12,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse',
      '-loop', '0',
      gifPath,
    ]);
    logger.success(`Looping GIF saved to ${gifPath}`);
  } catch {
    logger.info('ffmpeg not found — skipped GIF. Install ffmpeg (`brew install ffmpeg`).');
  }
}
