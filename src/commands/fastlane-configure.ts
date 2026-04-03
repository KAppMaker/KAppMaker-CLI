import { logger } from '../utils/logger.js';
import { resolveMobileDir } from '../services/version.service.js';
import { configureFastlane } from '../services/fastlane-setup.service.js';

export async function fastlaneConfigure(): Promise<void> {
  const mobileDir = resolveMobileDir();
  logger.info(`Mobile app directory: ${mobileDir}`);
  await configureFastlane(mobileDir);
}
