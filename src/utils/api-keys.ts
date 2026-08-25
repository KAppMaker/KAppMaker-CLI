import { logger } from './logger.js';
import { promptInput } from './prompt.js';
import { saveConfig } from './config.js';
import type { KAppMakerConfig } from '../types/index.js';

// Interactive first-use prompts for API keys. Each ensures the key exists on
// the loaded config (prompting + saving when missing) or exits fatally.

export async function ensureOpenaiKey(config: KAppMakerConfig): Promise<void> {
  if (config.openaiApiKey) return;
  logger.warn('OpenAI API key is not configured.');
  logger.info('Get one at: https://platform.openai.com/api-keys');
  logger.info('Tip: pass --spec <file.json> with a pre-authored spec to skip OpenAI entirely.');
  const key = await promptInput('  Enter your OpenAI API key: ');
  if (!key.trim()) {
    logger.fatal('OpenAI API key is required (or use --spec to skip this step).');
    process.exit(1);
  }
  config.openaiApiKey = key.trim();
  await saveConfig(config);
  logger.success('openaiApiKey saved to config.');
}

export async function ensureFalKey(config: KAppMakerConfig): Promise<void> {
  if (config.falApiKey) return;
  logger.warn('fal.ai API key is not configured.');
  logger.info('Get one at: https://fal.ai/dashboard/keys');
  const key = await promptInput('  Enter your fal.ai API key: ');
  if (!key.trim()) {
    logger.fatal('fal.ai API key is required for image generation.');
    process.exit(1);
  }
  config.falApiKey = key.trim();
  await saveConfig(config);
  logger.success('falApiKey saved to config.');
}
