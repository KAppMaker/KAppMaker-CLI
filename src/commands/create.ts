import path from 'node:path';
import fs from 'fs-extra';
import { logger } from '../utils/logger.js';
import { validateDependencies, validateAppName } from '../utils/validator.js';
import { confirm } from '../utils/prompt.js';
import * as git from '../services/git.service.js';
import * as firebase from '../services/firebase.service.js';
import * as gradle from '../services/gradle.service.js';
import * as ios from '../services/ios.service.js';
import * as fastlane from '../services/fastlane.service.js';
import { loadConfig } from '../utils/config.js';
import type { CreateOptions, DerivedConfig, StepContext, KAppMakerConfig } from '../types/index.js';

const TOTAL_STEPS = 8;

function buildConfig(appName: string, options: CreateOptions, userConfig: KAppMakerConfig): DerivedConfig {
  const appIdLower = appName.toLowerCase();
  const prefix = userConfig.bundleIdPrefix || `com.${appIdLower}`;
  return {
    appName,
    appIdLower,
    packageName: `${prefix}.${appIdLower}`,
    firebaseProject: `${appIdLower}-app`,
    targetDir: `${appName}-All`,
    templateRepo: options.templateRepo || userConfig.templateRepo,
  };
}

function buildContext(config: DerivedConfig): StepContext {
  const base = path.resolve(config.targetDir);
  return {
    config,
    mobileDir: path.join(base, 'MobileApp'),
  };
}

export async function createApp(
  appName: string,
  options: CreateOptions,
): Promise<void> {
  validateAppName(appName);
  await validateDependencies();

  const userConfig = await loadConfig();
  const config = buildConfig(appName, options, userConfig);
  const ctx = buildContext(config);
  const org = options.organization || userConfig.organization || config.appName;

  logger.banner(config.appName);
  logger.info(`Package/Bundle ID: ${config.packageName}`);
  logger.info(`Firebase project:  ${config.firebaseProject}`);
  logger.info(`Target directory:  ${config.targetDir}`);

  // Step 1: Clone template
  logger.step(1, TOTAL_STEPS, 'Cloning template repository');

  const targetPath = path.resolve(config.targetDir);
  if (await fs.pathExists(targetPath)) {
    logger.warn(`Directory "${config.targetDir}" already exists.`);
    const shouldOverwrite = await confirm('Delete it and start fresh?');
    if (!shouldOverwrite) {
      logger.info('Aborted.');
      process.exit(0);
    }
    await fs.remove(targetPath);
    logger.info('Removed existing directory.');
  }

  await git.cloneTemplate(config);

  // Step 2: Firebase login
  logger.step(2, TOTAL_STEPS, 'Firebase authentication');
  await firebase.firebaseLogin();

  // Step 3: Create Firebase project
  logger.step(3, TOTAL_STEPS, 'Creating Firebase project');
  await firebase.createProject(config);

  // Step 4: Create Firebase apps + download SDK configs
  logger.step(4, TOTAL_STEPS, 'Creating Firebase apps and downloading configs');

  const androidApp = await firebase.createAndroidApp(config);
  const androidConfigPath = path.join(
    ctx.mobileDir, 'composeApp', 'google-services.json',
  );
  await firebase.downloadSdkConfig(androidApp.appId, 'ANDROID', androidConfigPath);

  const iosApp = await firebase.createIosApp(config);
  const iosConfigPath = path.join(
    ctx.mobileDir, 'iosApp', 'iosApp', 'GoogleService-Info.plist',
  );
  await firebase.downloadSdkConfig(iosApp.appId, 'IOS', iosConfigPath);

  // Step 5: Gradle refactor
  logger.step(5, TOTAL_STEPS, 'Configuring mobile app (Gradle refactor)');
  await gradle.refactorPackage(config, ctx.mobileDir);

  // Step 6: Setup build environment
  logger.step(6, TOTAL_STEPS, 'Setting up build environment');
  await gradle.createLocalProperties(ctx.mobileDir, userConfig.androidSdkPath);
  await ios.installPods(ctx.mobileDir);
  await gradle.cleanAndBuild(ctx.mobileDir);

  // Step 7: Fastlane first-time build
  logger.step(7, TOTAL_STEPS, 'Running Fastlane first-time build');
  await fastlane.firstTimeBuild(ctx.mobileDir, org);

  // Step 8: Set template as upstream
  logger.step(8, TOTAL_STEPS, 'Setting up git remotes');
  const repoRoot = path.resolve(config.targetDir);
  await git.setTemplateAsUpstream(repoRoot);

  logger.done();
}
