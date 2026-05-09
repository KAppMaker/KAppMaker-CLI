import path from 'node:path';
import fs from 'fs-extra';
import * as git from '../services/git.service.js';
import { logger } from '../utils/logger.js';

export async function gitSetupUpstreamCommand(repoPath?: string): Promise<void> {
  const root = path.resolve(repoPath ?? '.');
  if (!(await fs.pathExists(path.join(root, '.git')))) {
    logger.error(`Not a git repository: ${root}`);
    process.exit(1);
  }
  await git.setTemplateAsUpstream(root);
  logger.success('origin renamed to upstream');
}
