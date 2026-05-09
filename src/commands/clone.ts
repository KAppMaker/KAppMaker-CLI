import path from 'node:path';
import fs from 'fs-extra';
import { logger } from '../utils/logger.js';
import { validateAppName } from '../utils/validator.js';
import { confirm } from '../utils/prompt.js';
import * as git from '../services/git.service.js';
import { loadConfig, getConfigPath } from '../utils/config.js';
import { configInit } from './config.js';

export interface CloneOptions {
  templateRepo?: string;
  targetDir?: string;
}

export async function cloneCommand(
  appName: string,
  options: CloneOptions = {},
): Promise<string> {
  validateAppName(appName);

  if (!(await fs.pathExists(getConfigPath()))) {
    logger.warn("No KAppMaker config found. Let's set it up first.");
    await configInit();
  }
  const userConfig = await loadConfig();

  const templateRepo = options.templateRepo || userConfig.templateRepo;
  const targetDir = options.targetDir || appName + '-All';
  const targetPath = path.resolve(targetDir);

  if (await fs.pathExists(targetPath)) {
    logger.warn(`Directory "${targetDir}" already exists.`);
    const shouldOverwrite = await confirm('Delete it and start fresh?');
    if (!shouldOverwrite) {
      logger.info('Aborted.');
      process.exit(0);
    }
    await fs.remove(targetPath);
    logger.info('Removed existing directory.');
  }

  await git.cloneTemplate(templateRepo, targetDir);
  logger.success(`Cloned to ${targetPath}`);
  return targetPath;
}
