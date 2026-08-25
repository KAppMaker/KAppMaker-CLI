import path from 'node:path';
import fs from 'fs-extra';
import { execa } from 'execa';
import { logger } from '../utils/logger.js';
import { promptInput } from '../utils/prompt.js';
import { loadConfig } from '../utils/config.js';
import { ensureFalKey } from '../utils/api-keys.js';
import { loadSpec } from '../utils/spec-file.js';
import * as fal from '../services/fal.service.js';
import * as mascot from '../services/mascot.service.js';
import type { MascotAnimateOptions } from '../types/index.js';

// Rough $/second, for the pre-spend estimate only (fal pricing, mid-2026).
const COST_PER_SECOND: Record<string, number> = { ltx: 0.04, seedance: 0.24 };

export async function mascotAnimate(options: MascotAnimateOptions): Promise<void> {
  const config = await loadConfig();
  await ensureFalKey(config);

  const model = options.model ?? 'ltx';
  if (!COST_PER_SECOND[model]) {
    logger.fatal(`Unknown model: ${model}. Available: ltx (cheap default), seedance (premium).`);
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

  const duration = mascot.clampAnimationDuration(model, options.duration ?? (model === 'seedance' ? 4 : 6));
  const resolution = options.resolution ?? (model === 'seedance' ? '720p' : '1080p');

  // Videos are costly — always show the estimate, confirm unless --yes
  const estimate = (COST_PER_SECOND[model] * duration).toFixed(2);
  logger.info(`Model: ${model} | ${duration}s @ ${resolution} | estimated cost ~$${estimate}`);
  if (!options.yes) {
    const answer = (await promptInput('Proceed? (Y/n): ')).trim().toLowerCase();
    if (answer === 'n' || answer === 'no') {
      logger.info('Cancelled — nothing was generated.');
      return;
    }
  }

  logger.step(1, 2, `Animating mascot (${motion})`);
  const queue = await fal.submitVideoGeneration(config.falApiKey, model, {
    prompt,
    imageDataUri: await fal.imageToDataUri(sourcePath),
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

  // Optional looping-WebP conversion when ffmpeg is available
  logger.step(2, 2, 'Converting to looping WebP');
  await convertToWebpLoop(outputPath);
  logger.done();
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
