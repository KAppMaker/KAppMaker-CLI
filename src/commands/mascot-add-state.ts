import path from 'node:path';
import fs from 'fs-extra';
import { logger } from '../utils/logger.js';
import { loadConfig } from '../utils/config.js';
import { ensureFalKey } from '../utils/api-keys.js';
import { loadSpec } from '../utils/spec-file.js';
import * as fal from '../services/fal.service.js';
import * as mascot from '../services/mascot.service.js';
import type { MascotAddStateOptions } from '../types/index.js';

const DEFAULT_MASCOT_CANDIDATES = [
  'Assets/mascot/mascot_no_bg.png',
  'Assets/mascot/mascot.png',
];

export async function mascotAddState(options: MascotAddStateOptions): Promise<void> {
  const config = await loadConfig();
  await ensureFalKey(config);

  const state = options.state?.trim();
  if (!state && !options.spec) {
    logger.fatal('--state <description> is required (or pass --spec).');
    process.exit(1);
  }

  // Resolve the mascot reference image
  let mascotPath: string | undefined = options.mascot
    ? path.resolve(options.mascot)
    : DEFAULT_MASCOT_CANDIDATES.map((c) => path.resolve(c)).find((c) => fs.pathExistsSync(c));
  if (!mascotPath || !(await fs.pathExists(mascotPath))) {
    logger.fatal(
      `Mascot image not found${options.mascot ? `: ${options.mascot}` : ' (looked in Assets/mascot/)'}. Run \`kappmaker create-mascot\` first or pass --mascot <path>.`,
    );
    process.exit(1);
  }
  logger.info(`Using mascot: ${mascotPath}`);

  const prompt = options.spec
    ? await loadSpec(options.spec)
    : mascot.buildSingleStatePrompt(state!);

  logger.step(1, 2, `Generating mascot state: ${state ?? '(from spec)'}`);
  const queue = await fal.submitImageGeneration(config.falApiKey, {
    prompt,
    imageUrls: [await fal.imageToDataUri(mascotPath)],
    resolution: options.resolution ?? '2K',
    aspectRatio: '1:1',
  });
  await fal.pollUntilComplete(config.falApiKey, queue.status_url, {
    label: 'Generating state — this usually takes about a minute',
  });
  const url = await fal.fetchResult(config.falApiKey, queue.response_url);

  const slug = mascot.stateSlug(state ?? 'state');
  const outputPath = options.output
    ? path.resolve(options.output)
    : path.join(path.dirname(mascotPath), 'states', `${slug}.png`);
  await fs.ensureDir(path.dirname(outputPath));
  await fal.downloadImage(url, outputPath);

  logger.step(2, 2, 'Removing background');
  if (!options.skipRemoveBg) {
    await mascot.removeBackgroundToFile(config.falApiKey, outputPath, outputPath, slug);
  } else {
    logger.info('Skipped (--skip-remove-bg).');
  }

  logger.success(`Mascot state saved to ${outputPath}`);
  logger.done();
}
