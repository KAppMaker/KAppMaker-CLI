import path from 'node:path';
import fs from 'fs-extra';
import { logger } from '../utils/logger.js';
import { promptInput } from '../utils/prompt.js';
import { loadConfig, saveConfig } from '../utils/config.js';
import * as fal from '../services/fal.service.js';
import { buildLogoPrompt, extractLogo, openPreview } from '../services/logo.service.js';
import type { CreateLogoOptions, ExtractOptions } from '../types/index.js';

const ASSETS_DIR = 'Assets';
const GRID_FILENAME = 'logo_variations.png';
const LOGO_FILENAME = 'app_logo.png';

export async function createLogo(options: CreateLogoOptions): Promise<void> {
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

  const appIdea = options.prompt?.trim()
    ? options.prompt.trim()
    : (await promptInput('Describe your app idea (concept, audience, style preferences): ')).trim();
  if (!appIdea) {
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
  let selection: SelectionResult | null = null;

  while (selection === null) {
    // Generate
    logger.step(1, 3, 'Generating logo grid');
    const prompt = buildLogoPrompt(appIdea);
    const queue = await fal.submitGeneration(config.falApiKey, prompt);
    await fal.pollUntilComplete(config.falApiKey, queue.status_url, {
      label: 'Generating logos — this usually takes 1–2 minutes',
    });
    const imageUrl = await fal.fetchResult(config.falApiKey, queue.response_url);

    logger.step(2, 3, 'Downloading grid image');
    await fal.downloadImage(imageUrl, gridPath);
    logger.info(`Grid saved to ${gridPath}`);

    // Preview
    await openPreview(gridPath);

    // Selection loop
    selection = await askSelection();
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

interface SelectionResult {
  index: number;
  zoom?: number;
  gap?: number;
}

async function askSelection(): Promise<SelectionResult | null> {
  while (true) {
    const answer = await promptInput(
      'Choose a logo (1-16) or R to regenerate. Optional: "5 --zoom 1.1 --gap 3": ',
    );
    const trimmed = answer.trim().toLowerCase();

    if (trimmed === 'r') {
      return null; // signals regeneration
    }

    const parsed = parseSelection(trimmed);
    if (parsed) return parsed;

    logger.warn('Please enter a number 1-16, optionally with --zoom and --gap, or R to regenerate.');
  }
}

function parseSelection(input: string): SelectionResult | null {
  const tokens = input.split(/\s+/);
  const num = parseInt(tokens[0], 10);
  if (isNaN(num) || num < 1 || num > 16) return null;

  const result: SelectionResult = { index: num };

  for (let i = 1; i < tokens.length - 1; i++) {
    if (tokens[i] === '--zoom') {
      const val = parseFloat(tokens[i + 1]);
      if (!isNaN(val) && val > 0) result.zoom = val;
    }
    if (tokens[i] === '--gap') {
      const val = parseInt(tokens[i + 1], 10);
      if (!isNaN(val) && val >= 0) result.gap = val;
    }
  }

  return result;
}
