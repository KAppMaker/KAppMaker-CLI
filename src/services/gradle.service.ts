import path from 'node:path';
import fs from 'fs-extra';
import { run } from '../utils/exec.js';
import { logger } from '../utils/logger.js';

export async function createLocalProperties(mobileDir: string, androidSdkPath: string): Promise<void> {
  const propsPath = path.join(mobileDir, 'local.properties');
  await fs.writeFile(propsPath, `sdk.dir=${androidSdkPath}\n`);
  logger.success('Created local.properties');
}

export async function cleanAndBuild(mobileDir: string): Promise<void> {
  await run('./gradlew', ['--no-daemon', 'clean'], {
    cwd: mobileDir,
    label: 'Running Gradle clean',
  });

  await run('./gradlew', ['--no-daemon', 'assembleDebug'], {
    cwd: mobileDir,
    label: 'Running Gradle assembleDebug (this may take a few minutes)',
  });
}
