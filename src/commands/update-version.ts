import { logger } from '../utils/logger.js';
import {
  resolveMobileDir,
  updateAndroidVersion,
  updateIosVersion,
} from '../services/version.service.js';

interface UpdateVersionOptions {
  version?: string;
}

export async function updateVersion(options: UpdateVersionOptions): Promise<void> {
  const mobileDir = resolveMobileDir();
  const newVersionName = options.version;

  const android = await updateAndroidVersion(mobileDir, newVersionName);
  if (android) {
    logger.success(
      `Android: versionCode ${android.oldCode} → ${android.newCode}, ` +
      `versionName "${android.oldName}" → "${android.newName}"`,
    );
  }

  const ios = await updateIosVersion(mobileDir, newVersionName);
  if (ios) {
    logger.success(
      `iOS: version ${ios.oldCode} → ${ios.newCode}, ` +
      `marketing "${ios.oldName}" → "${ios.newName}"`,
    );
  }

  if (!android && !ios) {
    logger.error('No platform files found — nothing was updated.');
    process.exit(1);
  }
}
