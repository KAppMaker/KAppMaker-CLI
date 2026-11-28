import path from 'node:path';
import fs from 'fs-extra';
import { logger } from '../utils/logger.js';
import { promptInput } from '../utils/prompt.js';
import { loadConfig, saveConfig } from '../utils/config.js';
import * as fal from '../services/fal.service.js';
import { buildLogoPrompt, extractLogo, openPreview } from '../services/logo.service.js';
import { loadSpec } from '../utils/spec-file.js';
import { askGridSelection, type GridSelectionResult } from '../utils/grid-select.js';
import type { CreateLogoOptions, ExtractOptions } from '../types/index.js';

const ASSETS_DIR = 'Assets';
const GRID_FILENAME = 'logo_variations.png';
const LOGO_FILENAME = 'app_logo.png';

export async function createLogo(options: CreateLogoOptions): Promise<void> {
  if (options.choose !== undefined) return pickFromExistingGrid(options);
  const config = await loadConfig();

  if (!config.falApiKey) {
    logger.warn('fal.ai API key is not configured.');
    logger.info('Get one at: https://fal.ai/dashboard/keys');
    const key = await promptInput('  Enter your fal.ai API key: ');
    if (!key.trim()) {
      logger.fatal('fal.ai API key is required for logo generation.');
      process.exit(1);
    }
    config.falApiKey = key.trim();
    await saveConfig(config);
    logger.success('falApiKey saved to config.');
  }

  // --spec: a pre-authored logo-grid spec JSON replaces the built-in prompt
  // (must still describe a 4×4 grid — the slicing below assumes it).
  let specPrompt: string | undefined;
  if (options.spec) {
    specPrompt = await loadSpec(options.spec);
  }

  const appIdea = specPrompt
    ? ''
    : options.prompt?.trim()
      ? options.prompt.trim()
      : (await promptInput('Describe your app idea (concept, audience, style preferences): ')).trim();
  if (!specPrompt && !appIdea) {
    logger.fatal('App idea cannot be empty.');
    process.exit(1);
  }

  // When called from `create` with --output pointing into the -All/Assets dir,
  // save the grid image alongside the final logo — not in CWD's ./Assets/.
  const assetsDir = options.output
    ? path.dirname(path.resolve(options.output))
    : path.resolve(ASSETS_DIR);
  await fs.ensureDir(assetsDir);

  const gridPath = path.join(assetsDir, GRID_FILENAME);
  let selection: GridSelectionResult | null = null;

  while (selection === null) {
    // Generate
    logger.step(1, 3, 'Generating logo grid');
    const prompt = specPrompt ?? buildLogoPrompt(appIdea);
    const queue = await fal.submitGeneration(config.falApiKey, prompt);
    await fal.pollUntilComplete(config.falApiKey, queue.status_url, {
      label: 'Generating logos (usually takes 1 to 2 minutes)',
    });
    const imageUrl = await fal.fetchResult(config.falApiKey, queue.response_url);

    logger.step(2, 3, 'Downloading grid image');
    await fal.downloadImage(imageUrl, gridPath);
    logger.info(`Grid saved to ${gridPath}`);

    if (options.gridOnly) {
      logger.success(`Logo grid saved to ${gridPath}`);
      logger.info('Pick one: kappmaker create-logo --choose <1-16> [--output <path>]');
      return;
    }

    // Preview
    await openPreview(gridPath);

    // Selection loop
    selection = await askGridSelection('logo');
  }

  // Extract and save
  logger.step(3, 3, 'Extracting chosen logo');
  const outputPath = options.output
    ? path.resolve(options.output)
    : path.join(assetsDir, LOGO_FILENAME);
  await fs.ensureDir(path.dirname(outputPath));

  const extractOpts: ExtractOptions = {};
  if (selection.zoom !== undefined) extractOpts.zoom = selection.zoom;
  if (selection.gap !== undefined) extractOpts.gap = selection.gap;

  await extractLogo(gridPath, selection.index, outputPath, extractOpts);

  logger.success(`Logo saved to ${outputPath}`);
  logger.info(`Grid variations kept at ${gridPath}`);
  logger.done();
}


/** `--choose N`: cut cell N out of a grid made earlier with `--grid-only`. No AI call, no cost. */
async function pickFromExistingGrid(options: CreateLogoOptions): Promise<void> {
  const assetsDir = options.output ? path.dirname(path.resolve(options.output)) : path.resolve(ASSETS_DIR);
  const gridPath = path.join(assetsDir, GRID_FILENAME);
  if (!(await fs.pathExists(gridPath))) {
    logger.fatal(`No logo grid at ${gridPath}. Make one first: kappmaker create-logo --grid-only --prompt "..."`);
    process.exit(1);
  }
  const index = options.choose!;
  if (!Number.isInteger(index) || index < 1 || index > 16) {
    logger.fatal('--choose must be a number between 1 and 16');
    process.exit(1);
  }
  const outputPath = options.output ? path.resolve(options.output) : path.join(assetsDir, LOGO_FILENAME);
  const extractOpts: ExtractOptions = {};
  if (options.zoom !== undefined) extractOpts.zoom = options.zoom;
  if (options.gap !== undefined) extractOpts.gap = options.gap;
  await extractLogo(gridPath, index, outputPath, extractOpts);
  logger.success(`Logo ${index} saved to ${outputPath}`);
}
