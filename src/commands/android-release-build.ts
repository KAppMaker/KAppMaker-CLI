import path from 'path';
import fs from 'fs-extra';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { resolveMobileDir } from '../services/version.service.js';
import { hasKeystore, generateKeystore } from '../services/keystore.service.js';
import { loadConfig } from '../utils/config.js';
import { run } from '../utils/exec.js';

interface AndroidReleaseBuildOptions {
  organization?: string;
  firstName?: string;
  output?: string;
}

export async function androidReleaseBuild(options: AndroidReleaseBuildOptions): Promise<void> {
  const mobileDir = resolveMobileDir();

  const gradlewPath = path.join(mobileDir, 'gradlew');
  if (!(await fs.pathExists(gradlewPath))) {
    logger.error('gradlew not found — cannot build Android release.');
    process.exit(1);
  }

  // Ensure keystore exists
  if (!(await hasKeystore(mobileDir))) {
    logger.info('Keystore not found — generating a new one...');
    const userConfig = await loadConfig();
    const organization = options.organization || userConfig.organization;
    const firstName = options.firstName ?? '';

    if (!organization && !firstName) {
      logger.error('No keystore found. Provide --organization or --first-name to generate one, or set "organization" in config.');
      process.exit(1);
    }

    await generateKeystore(mobileDir, firstName, organization || '', options.output);
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

  // Copy AAB to output directory
  const builtAab = path.join(
    mobileDir, appModule, 'build', 'outputs', 'bundle', 'release', `${appModule}-release.aab`,
  );
  if (!(await fs.pathExists(builtAab))) {
    logger.error(`AAB not found at expected path: ${builtAab}`);
    process.exit(1);
  }

  const outputDir = options.output
    ? path.resolve(options.output)
    : path.join(mobileDir, 'distribution', 'android');
  await fs.ensureDir(outputDir);
  const outputPath = path.join(outputDir, 'app-release.aab');
  await fs.copy(builtAab, outputPath, { overwrite: true });

  console.log('');
  console.log(chalk.green.bold('  Android App Bundle (AAB) ready!'));
  console.log(chalk.cyan(`  ${outputPath}`));
  console.log(chalk.gray('  Upload this file to Google Play Console to publish your app.'));
  console.log('');
}
