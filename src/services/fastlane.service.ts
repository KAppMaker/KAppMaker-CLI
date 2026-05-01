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

  // AGP 9: Android application moved from :composeApp to :androidApp. Pick whichever
  // module exists so the CLI works on both new and legacy layouts.
  const useAndroidApp = await fs.pathExists(path.join(mobileDir, 'androidApp', 'build.gradle.kts'));
  const appModule = useAndroidApp ? 'androidApp' : 'composeApp';

  // Build AAB
  await run('./gradlew', [`:${appModule}:bundleRelease`], {
    cwd: mobileDir,
    label: 'Building Android release AAB (this may take a few minutes)',
  });

  // Copy AAB to distribution
  const builtAab = path.join(
    mobileDir, appModule, 'build', 'outputs', 'bundle', 'release', `${appModule}-release.aab`,
  );
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
    // AGP 9 location (Path C: dedicated androidApp module — applies to both `:shared` and
    // legacy `:composeApp` library layouts since the AAB always lives in :androidApp)
    path.join(mobileDir, 'androidApp', 'build', 'outputs', 'bundle', 'release'),
    path.join(mobileDir, 'androidApp', 'build', 'outputs', 'bundle'),
    // Legacy pre-AGP-9 KMP-as-application location (composeApp combined library + app plugins)
    path.join(mobileDir, 'composeApp', 'build', 'outputs', 'bundle', 'release'),
    path.join(mobileDir, 'composeApp', 'build', 'outputs', 'bundle'),
    // Vanilla `app` Android Studio template
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
