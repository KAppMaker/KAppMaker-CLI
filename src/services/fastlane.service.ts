import path from 'node:path';
import fs from 'fs-extra';
import { run } from '../utils/exec.js';
import { logger } from '../utils/logger.js';
import { hasKeystore, generateKeystore } from './keystore.service.js';

export async function firstTimeBuild(
  mobileDir: string,
  organization: string,
): Promise<void> {
  // Ensure keystore exists
  if (!(await hasKeystore(mobileDir))) {
    logger.info('Keystore not found — generating a new one...');
    await generateKeystore(mobileDir, '', organization);
  }

  // Build AAB
  await run('./gradlew', [':composeApp:bundleRelease'], {
    cwd: mobileDir,
    label: 'Building Android release AAB (this may take a few minutes)',
  });

  // Copy AAB to distribution
  const builtAab = path.join(mobileDir, 'composeApp', 'build', 'outputs', 'bundle', 'release', 'composeApp-release.aab');
  if (await fs.pathExists(builtAab)) {
    const outputDir = path.join(mobileDir, 'distribution', 'android');
    await fs.ensureDir(outputDir);
    const outputPath = path.join(outputDir, 'app-release.aab');
    await fs.copy(builtAab, outputPath, { overwrite: true });
    logger.success(`AAB copied to ${outputPath}`);
  }
}

export async function findAabPath(mobileDir: string): Promise<string | null> {
  const searchDirs = [
    path.join(mobileDir, 'distribution', 'android'),
    path.join(mobileDir, 'composeApp', 'build', 'outputs', 'bundle', 'release'),
    path.join(mobileDir, 'composeApp', 'build', 'outputs', 'bundle'),
    path.join(mobileDir, 'app', 'build', 'outputs', 'bundle', 'release'),
  ];

  for (const dir of searchDirs) {
    if (await fs.pathExists(dir)) {
      const files = await fs.readdir(dir);
      const aab = files.find((f) => f.endsWith('.aab'));
      if (aab) return path.join(dir, aab);
    }
  }
  return null;
}
