import path from 'node:path';
import fs from 'fs-extra';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { validateDependencies, validateAppName } from '../utils/validator.js';
import { confirm } from '../utils/prompt.js';
import * as git from '../services/git.service.js';
import * as firebase from '../services/firebase.service.js';
import * as gradle from '../services/gradle.service.js';
import { refactor } from '../services/refactor.service.js';
import * as ios from '../services/ios.service.js';
import * as fastlane from '../services/fastlane.service.js';
import { createLogo } from './create-logo.js';
import { removeBackground } from './remove-bg.js';
import { createAppStoreApp } from './create-appstore-app.js';
import { adaptySetup } from './adapty-setup.js';
import { loadConfig } from '../utils/config.js';
import type { CreateOptions, DerivedConfig, StepContext, KAppMakerConfig } from '../types/index.js';

const TOTAL_STEPS = 13;

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
  const firebaseReady = await firebase.createProject(config);

  if (firebaseReady) {
    // Step 4: Create Firebase apps
    logger.step(4, TOTAL_STEPS, 'Creating Firebase apps');
    const androidApp = await firebase.createAndroidApp(config);
    const iosApp = await firebase.createIosApp(config);

    // Step 5: Enable anonymous authentication
    logger.step(5, TOTAL_STEPS, 'Enabling anonymous authentication');
    await firebase.enableAnonymousAuth(config.firebaseProject);

    // Step 6: Download SDK configs
    logger.step(6, TOTAL_STEPS, 'Downloading Firebase SDK configs');
    const androidConfigPath = path.join(
      ctx.mobileDir, 'composeApp', 'google-services.json',
    );
    const iosConfigPath = path.join(
      ctx.mobileDir, 'iosApp', 'iosApp', 'GoogleService-Info.plist',
    );

    const assetsDir = path.join(targetPath, 'Assets');
    const androidConfigDirExists = await fs.pathExists(path.dirname(androidConfigPath));
    const iosConfigDirExists = await fs.pathExists(path.dirname(iosConfigPath));

    const finalAndroidPath = androidConfigDirExists
      ? androidConfigPath
      : path.join(assetsDir, 'google-services.json');
    const finalIosPath = iosConfigDirExists
      ? iosConfigPath
      : path.join(assetsDir, 'GoogleService-Info.plist');

    if (!androidConfigDirExists || !iosConfigDirExists) {
      await fs.ensureDir(assetsDir);
      logger.warn('KAppMaker directory structure not found — saving Firebase configs to Assets/');
    }

    await firebase.downloadSdkConfig(androidApp.appId, 'ANDROID', finalAndroidPath);
    await firebase.downloadSdkConfig(iosApp.appId, 'IOS', finalIosPath);
  } else {
    logger.warn('Skipping steps 4–6 (Firebase apps, auth, SDK configs) — project not available.');
    logger.info('You can set up Firebase manually later and re-run these steps.');
  }

  // Step 7: Logo generation (optional)
  logger.step(7, TOTAL_STEPS, 'App logo generation');
  const wantsLogo = await confirm('  Would you like to generate an app logo?');
  if (wantsLogo) {
    const logoOutput = path.join(targetPath, 'Assets', 'app_logo.png');
    await createLogo({ output: logoOutput });

    // Automatically remove background from the generated logo
    if (await fs.pathExists(logoOutput)) {
      logger.info('Removing background from logo...');
      await removeBackground(logoOutput, { output: logoOutput });
    }
  } else {
    logger.info('Skipping logo generation.');
  }

  // Step 8: App Store Connect setup (optional)
  logger.step(8, TOTAL_STEPS, 'App Store Connect setup');
  const wantsAppStore = await confirm('  Set up App Store Connect?');
  if (wantsAppStore) {
    await createAppStoreApp({});
  } else {
    logger.info('Skipping App Store Connect setup. Run "kappmaker create-appstore-app" later.');
  }

  // Step 9: Adapty setup (optional)
  logger.step(9, TOTAL_STEPS, 'Adapty subscription setup');
  const wantsAdapty = await confirm('  Set up Adapty subscriptions?');
  if (wantsAdapty) {
    await adaptySetup({});
  } else {
    logger.info('Skipping Adapty setup. Run "kappmaker adapty setup" later.');
  }

  // Step 10: Refactor package names, application ID, and app name
  logger.step(10, TOTAL_STEPS, 'Configuring mobile app (package refactor)');
  console.log('');
  console.log(chalk.gray('  Update package name to match application ID?'));
  console.log(chalk.gray('  • Yes (default) — package name will be same as application ID (e.g., com.measify.myapp)'));
  console.log(chalk.gray('  • No — keeps the template package name for easier syncing with the base repo'));
  const shouldUpdatePackageName = await confirm('  Update package name?');
  await refactor(ctx.mobileDir, config.packageName, config.appName, !shouldUpdatePackageName);

  // Step 11: Setup build environment
  logger.step(11, TOTAL_STEPS, 'Setting up build environment');
  const gradlewPath = path.join(ctx.mobileDir, 'gradlew');
  if (await fs.pathExists(gradlewPath)) {
    await gradle.createLocalProperties(ctx.mobileDir, userConfig.androidSdkPath);
  } else {
    logger.warn('gradlew not found — skipping local.properties creation.');
  }
  const podfilePath = path.join(ctx.mobileDir, 'iosApp', 'Podfile');
  if (await fs.pathExists(podfilePath)) {
    await ios.installPods(ctx.mobileDir);
  } else {
    logger.warn('Podfile not found — skipping CocoaPods install.');
  }

  // Step 12: Set template as upstream
  logger.step(12, TOTAL_STEPS, 'Setting up git remotes');
  const repoRoot = path.resolve(config.targetDir);
  await git.setTemplateAsUpstream(repoRoot);

  // Step 13: Android release build
  logger.step(13, TOTAL_STEPS, 'Building Android release');
  const gradlewExists = await fs.pathExists(path.join(ctx.mobileDir, 'gradlew'));
  if (gradlewExists) {
    await fastlane.firstTimeBuild(ctx.mobileDir, org);
  } else {
    logger.warn('gradlew not found — skipping Android release build.');
  }

  const aabPath = await fastlane.findAabPath(ctx.mobileDir);
  if (aabPath) {
    console.log('');
    console.log(chalk.green.bold('  Android App Bundle (AAB) ready!'));
    console.log(chalk.cyan(`  ${aabPath}`));
    console.log(chalk.gray('  Upload this file to Google Play Console to publish your app.'));
    console.log('');
  }

  logger.done();
}
