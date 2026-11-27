import { logger } from '../utils/logger.js';
import { CliError } from '../utils/errors.js';
import {
  resolveMobileDir,
  updateAndroidVersion,
  updateIosVersion,
} from '../services/version.service.js';

export interface UpdateVersionOptions {
  /** --version-name: also set the version name on both platforms. */
  versionName?: string;
  /** -v/--version: older spelling of --version-name. */
  version?: string;
}

/**
 * Build-only by default: Android versionCode and iOS build number go up by
 * one, the version name stays. `--version-name X` also sets the name.
 */
export async function updateVersion(options: UpdateVersionOptions): Promise<void> {
  const mobileDir = resolveMobileDir();
  const newVersionName = options.versionName ?? options.version;
  if (newVersionName !== undefined && !/^\d+(\.\d+){0,3}$/.test(newVersionName)) {
    throw new CliError(`--version-name "${newVersionName}" is not a version (expected e.g. 1.2.0).`);
  }

  const android = await updateAndroidVersion(mobileDir, newVersionName);
  if (android) {
    const name = android.oldName === android.newName ? `versionName "${android.newName}" (unchanged)` : `versionName "${android.oldName}" -> "${android.newName}"`;
    logger.success(`Android: versionCode ${android.oldCode} -> ${android.newCode}, ${name}`);
  }

  const ios = await updateIosVersion(mobileDir, newVersionName);
  if (ios) {
    const name = ios.oldName === ios.newName ? `version "${ios.newName}" (unchanged)` : `version "${ios.oldName}" -> "${ios.newName}"`;
    logger.success(`iOS: build ${ios.oldCode} -> ${ios.newCode}, ${name}`);
  }

  if (!android && !ios) {
    throw new CliError('No platform files found: nothing was updated.');
  }
  if (newVersionName === undefined) logger.info('Build number only. To change the version name too, pass --version-name X.');
}
