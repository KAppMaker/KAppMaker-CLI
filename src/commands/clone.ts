import path from 'node:path';
import fs from 'fs-extra';
import { logger } from '../utils/logger.js';
import { validateAppName } from '../utils/validator.js';
import { confirm, isInteractive, CONFIG_INIT_HINT } from '../utils/prompt.js';
import * as git from '../services/git.service.js';
import { loadConfig, getConfigPath } from '../utils/config.js';
import { printBundledSkillsHint } from '../utils/skills-hint.js';
import { configInit } from './config.js';

export interface CloneOptions {
  templateRepo?: string;
  targetDir?: string;
  /** Suppress the bundled-skills next-steps hint (used by `create`, which prints its own at the end). */
  skipSkillsHint?: boolean;
}

export async function cloneCommand(
  appName: string,
  options: CloneOptions = {},
): Promise<string> {
  validateAppName(appName);

  if (!(await fs.pathExists(getConfigPath()))) {
    if (!isInteractive()) {
      logger.fatal(`No KAppMaker config yet, and no terminal to ask in. Run first: ${CONFIG_INIT_HINT}`);
      process.exit(2);
    }
    logger.warn("No KAppMaker config found. Let's set it up first.");
    await configInit();
  }
  const userConfig = await loadConfig();

  const templateRepo = options.templateRepo || userConfig.templateRepo;
  const targetDir = options.targetDir || appName + '-All';
  const targetPath = path.resolve(targetDir);

  if (await fs.pathExists(targetPath)) {
    logger.warn(`Directory "${targetDir}" already exists.`);
    if (!isInteractive()) {
      logger.fatal(`"${targetDir}" already exists and there is no terminal to confirm deleting it. Remove it yourself or pass --target-dir <new-dir>.`);
      process.exit(2);
    }
    const shouldOverwrite = await confirm('Delete it and start fresh?', { destructive: true });
    if (!shouldOverwrite) {
      logger.info('Aborted.');
      process.exit(0);
    }
    await fs.remove(targetPath);
    logger.info('Removed existing directory.');
  }

  await git.cloneTemplate(templateRepo, targetDir);
  logger.success(`Cloned to ${targetPath}`);
  if (!options.skipSkillsHint) {
    await printBundledSkillsHint(targetPath);
  }
  return targetPath;
}
