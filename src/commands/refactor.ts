import { logger } from '../utils/logger.js';
import { resolveMobileDir } from '../services/version.service.js';
import { refactor } from '../services/refactor.service.js';

interface RefactorOptions {
  appId: string;
  appName: string;
  oldAppId?: string;
  oldAppName?: string;
  skipPackageRename?: boolean;
}

export async function refactorCommand(options: RefactorOptions): Promise<void> {
  const mobileDir = resolveMobileDir();
  logger.info(`Mobile app directory: ${mobileDir}`);
  await refactor(
    mobileDir,
    options.appId,
    options.appName,
    options.skipPackageRename ?? false,
    options.oldAppId,
    options.oldAppName,
  );
}
