import path from 'node:path';
import fs from 'fs-extra';
import { logger } from '../utils/logger.js';
import { promptInput } from '../utils/prompt.js';
import { loadConfig } from '../utils/config.js';
import { ensureFalKey } from '../utils/api-keys.js';
import { loadSpec } from '../utils/spec-file.js';
import { askGridSelection, type GridSelectionResult } from '../utils/grid-select.js';
import * as fal from '../services/fal.service.js';
import * as mascot from '../services/mascot.service.js';
import { extractLogo, splitGrid, openPreview } from '../services/logo.service.js';
import type { CreateMascotOptions } from '../types/index.js';

const DEFAULT_OUTPUT_DIR = 'Assets/mascot';
const STATE_TILE_SIZE = 512;

export async function createMascot(options: CreateMascotOptions): Promise<void> {
  const config = await loadConfig();
  await ensureFalKey(config);

  const appIdea = options.prompt?.trim()
    ? options.prompt.trim()
    : options.spec && options.statesSpec
      ? ''
      : (await promptInput('Describe your app idea (concept, audience, vibe): ')).trim();
  if (!appIdea && !(options.spec && options.statesSpec)) {
    logger.fatal('App idea cannot be empty (or pass both --spec and --states-spec).');
    process.exit(1);
  }

  const outDir = path.resolve(options.output ?? DEFAULT_OUTPUT_DIR);
  await fs.ensureDir(outDir);
  const gridPath = path.join(outDir, 'mascot_variations.png');
  const mascotPath = path.join(outDir, 'mascot.png');

  // ── Stage 1: variation grid → user picks one mascot ──────────────
  const variationPrompt = options.spec
    ? await loadSpec(options.spec)
    : mascot.buildMascotVariationPrompt(appIdea, options.tone?.trim() || undefined);

  let selection: GridSelectionResult | null = null;
  while (selection === null) {
    logger.step(1, 4, 'Generating mascot concept grid (16 variations)');
    const queue = await fal.submitGeneration(config.falApiKey, variationPrompt);
    await fal.pollUntilComplete(config.falApiKey, queue.status_url, {
      label: 'Generating mascots — this usually takes 1–2 minutes',
    });
    const imageUrl = await fal.fetchResult(config.falApiKey, queue.response_url);
    await fal.downloadImage(imageUrl, gridPath);
    logger.info(`Grid saved to ${gridPath}`);

    await openPreview(gridPath);
    selection = await askGridSelection('mascot');
  }

  logger.step(2, 4, 'Extracting chosen mascot');
  await extractLogo(gridPath, selection.index, mascotPath, {
    ...(selection.zoom !== undefined && { zoom: selection.zoom }),
    ...(selection.gap !== undefined && { gap: selection.gap }),
  });
  logger.success(`Mascot saved to ${mascotPath}`);

  if (!options.skipRemoveBg) {
    await mascot.removeBackgroundToFile(
      config.falApiKey, mascotPath, path.join(outDir, 'mascot_no_bg.png'), 'mascot',
    );
    logger.success(`Transparent mascot saved to ${path.join(outDir, 'mascot_no_bg.png')}`);
  }

  // ── Stage 2: 16 emotional states from the chosen mascot ──────────
  if (options.skipStates) {
    logger.info('Skipping emotional states (--skip-states). Generate later with the same command or `mascot-add-state`.');
    logger.done();
    return;
  }

  const proceed = (await promptInput('Generate 16 emotional states for this mascot now? (Y/n): ')).trim().toLowerCase();
  if (proceed === 'n' || proceed === 'no') {
    logger.info('Skipped. Generate states later with `kappmaker mascot-add-state` or by re-running.');
    logger.done();
    return;
  }

  let states = mascot.normalizeStates(options.states);
  let statesPrompt: string;
  if (options.statesSpec) {
    statesPrompt = await loadSpec(options.statesSpec);
    // File naming follows the spec's own `states` list when it defines one
    const specStates = (JSON.parse(statesPrompt) as { states?: unknown }).states;
    if (Array.isArray(specStates) && specStates.every((s) => typeof s === 'string')) {
      states = mascot.normalizeStates(specStates as string[]);
    }
  } else {
    statesPrompt = mascot.buildMascotStatesPrompt(appIdea, states);
  }

  logger.step(3, 4, 'Generating 16 emotional states (using chosen mascot as reference)');
  logger.info(`States: ${states.join(', ')}`);
  const mascotRef = await fal.imageToDataUri(mascotPath);
  const statesQueue = await fal.submitImageGeneration(config.falApiKey, {
    prompt: statesPrompt,
    imageUrls: [mascotRef],
    resolution: options.resolution ?? '2K',
    aspectRatio: '1:1',
  });
  await fal.pollUntilComplete(config.falApiKey, statesQueue.status_url, {
    label: 'Generating states — this usually takes 1–2 minutes',
  });
  const statesUrl = await fal.fetchResult(config.falApiKey, statesQueue.response_url);
  const statesGridPath = path.join(outDir, 'mascot_states_grid.png');
  await fal.downloadImage(statesUrl, statesGridPath);

  // Split grid into 16 tiles, then rename tiles to their state slugs
  logger.step(4, 4, 'Splitting states and removing backgrounds');
  const statesDir = path.join(outDir, 'states');
  await fs.ensureDir(statesDir);
  await splitGrid(statesGridPath, statesDir, {
    rows: mascot.MASCOT_GRID.rows, cols: mascot.MASCOT_GRID.cols,
    zoom: 1.0, gap: 0, width: STATE_TILE_SIZE, height: STATE_TILE_SIZE,
  });

  for (let i = 0; i < states.length; i++) {
    const from = path.join(statesDir, `image_${i + 1}.png`);
    const to = path.join(statesDir, `${mascot.stateSlug(states[i])}.png`);
    if (await fs.pathExists(from)) await fs.move(from, to, { overwrite: true });
    if (!options.skipRemoveBg && (await fs.pathExists(to))) {
      await mascot.removeBackgroundToFile(config.falApiKey, to, to, mascot.stateSlug(states[i]));
    }
  }

  logger.success(`16 mascot states saved to ${statesDir}`);
  logger.info('Add more states any time: kappmaker mascot-add-state --state "<description>"');
  logger.done();
}
