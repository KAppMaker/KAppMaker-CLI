import path from 'node:path';
import fs from 'fs-extra';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { validateDependencies, validateAppName } from '../utils/validator.js';
import { confirm, promptInput } from '../utils/prompt.js';
import * as git from '../services/git.service.js';
import * as firebase from '../services/firebase.service.js';
import * as gradle from '../services/gradle.service.js';
import { refactor } from '../services/refactor.service.js';
import * as ios from '../services/ios.service.js';
import * as fastlane from '../services/fastlane.service.js';
import { configureFastlane } from '../services/fastlane-setup.service.js';
import { publishAndroid } from '../services/publish.service.js';
import { createLogo } from './create-logo.js';
import { removeBackground } from './remove-bg.js';
import { createAppStoreApp } from './create-appstore-app.js';
import { createPlayApp } from './create-play-app.js';
import { adaptySetup } from './adapty-setup.js';
import { configInit } from './config.js';
import { loadConfig, getConfigPath } from '../utils/config.js';
import { hasKeystore, generateKeystore } from '../services/keystore.service.js';
import type { CreateOptions, DerivedConfig, StepContext, KAppMakerConfig } from '../types/index.js';

const TOTAL_STEPS = 13;

function buildConfig(appName: string, options: CreateOptions, userConfig: KAppMakerConfig): DerivedConfig {
  const appIdLower = appName.toLowerCase();
  const prefix = userConfig.bundleIdPrefix || ('com.' + appIdLower);
  return {
    appName,
    appIdLower,
    packageName: prefix + '.' + appIdLower,
    firebaseProject: appIdLower + '-app',
    targetDir: appName + '-All',
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

  // If config file doesn't exist, run interactive setup first so API keys,
  // service account path, and preferences are in place before we need them.
  if (!(await fs.pathExists(getConfigPath()))) {
    logger.warn('No KAppMaker config found. Let\'s set it up first.');
    await configInit();
  }

  const userConfig = await loadConfig();
  const config = buildConfig(appName, options, userConfig);
  const ctx = buildContext(config);
  const org = options.organization || userConfig.organization || config.appName;

  logger.banner(config.appName);
  logger.info('Package/Bundle ID: ' + config.packageName);
  logger.info('Firebase project:  ' + config.firebaseProject);
  logger.info('Target directory:  ' + config.targetDir);

  // Step 1: Clone template
  logger.step(1, TOTAL_STEPS, 'Cloning template repository');

  const targetPath = path.resolve(config.targetDir);
  if (await fs.pathExists(targetPath)) {
    logger.warn('Directory "' + config.targetDir + '" already exists.');
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

    // Step 6: Download SDK configs.
    // AGP 9 split: google-services.json must live in the :androidApp module (where the
    // google-services plugin is applied). Fall back to the legacy :composeApp location
    // for projects that still combine KMP + com.android.application in one module.
    logger.step(6, TOTAL_STEPS, 'Downloading Firebase SDK configs');
    const androidAppDir = path.join(ctx.mobileDir, 'androidApp');
    const composeAppDir = path.join(ctx.mobileDir, 'composeApp');
    const androidConfigPath = (await fs.pathExists(androidAppDir))
      ? path.join(androidAppDir, 'google-services.json')
      : path.join(composeAppDir, 'google-services.json');
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
      logger.warn('KAppMaker directory structure not found -- saving Firebase configs to Assets/');
    }

    await firebase.downloadSdkConfig(androidApp.appId, 'ANDROID', finalAndroidPath);
    await firebase.downloadSdkConfig(iosApp.appId, 'IOS', finalIosPath);

    // Verify the downloaded google-services.json matches the expected package.
    await verifyAndFixGoogleServicesPackage(finalAndroidPath, config.packageName);
  } else {
    logger.warn('Skipping steps 4-6 (Firebase apps, auth, SDK configs) -- project not available.');
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

  // Step 8: Package refactor
  logger.step(8, TOTAL_STEPS, 'Configuring mobile app (package refactor)');
  console.log('');
  console.log(chalk.gray('  Update package name to match application ID?'));
  console.log(chalk.gray('  * Yes (default) -- package name will be same as application ID'));
  console.log(chalk.gray('  * No -- keeps the template package name for easier syncing with the base repo'));
  const shouldUpdatePackageName = await confirm('  Update package name?');
  await refactor(ctx.mobileDir, config.packageName, config.appName, !shouldUpdatePackageName);

  // Step 9: Build environment + keystore
  logger.step(9, TOTAL_STEPS, 'Setting up build environment');
  const gradlewPath = path.join(ctx.mobileDir, 'gradlew');
  if (await fs.pathExists(gradlewPath)) {
    await gradle.createLocalProperties(ctx.mobileDir, userConfig.androidSdkPath);
  } else {
    logger.warn('gradlew not found -- skipping local.properties creation.');
  }
  const podfilePath = path.join(ctx.mobileDir, 'iosApp', 'Podfile');
  if (await fs.pathExists(podfilePath)) {
    await ios.installPods(ctx.mobileDir);
  } else {
    logger.warn('Podfile not found -- skipping CocoaPods install.');
  }
  // Generate signing keystore if missing (fast, <1s). The actual AAB build
  // happens later in step 12 when publishing to Play's internal track.
  if (await fs.pathExists(gradlewPath) && !(await hasKeystore(ctx.mobileDir))) {
    logger.info('Generating Android signing keystore...');
    await generateKeystore(ctx.mobileDir, '', org);
  }

  // Step 10: Git remotes
  logger.step(10, TOTAL_STEPS, 'Setting up git remotes');
  const repoRoot = path.resolve(config.targetDir);
  await git.setTemplateAsUpstream(repoRoot);

  // ── Pre-store-setup reminder ──────────────────────────────────────
  console.log('');
  console.log(chalk.bold('  Before continuing, create your Google Play app:'));
  console.log('    ' + chalk.cyan('1.') + ' Open ' + chalk.cyan('https://play.google.com/console/u/0/developers'));
  console.log('    ' + chalk.cyan('2.') + ' Create a new app with package name: ' + chalk.bold(config.packageName));
  console.log('    ' + chalk.cyan('3.') + ' App Store Connect will be created automatically by the CLI');
  console.log('');
  await promptInput('  Press Enter when ready...');

  // Config files should live in the project's Assets dir, not CWD's Assets/.
  const projectAssetsDir = path.join(targetPath, 'Assets');
  const ascConfigPath = path.join(projectAssetsDir, 'appstore-config.json');
  const gpcConfigPath = path.join(projectAssetsDir, 'googleplay-config.json');
  const adaptyConfigPath = path.join(projectAssetsDir, 'adapty-config.json');

  // Step 11: App Store Connect setup (optional)
  logger.step(11, TOTAL_STEPS, 'App Store Connect setup');
  const wantsAppStore = await confirm('  Set up App Store Connect?');
  if (wantsAppStore) {
    await createAppStoreApp({ config: ascConfigPath });
  } else {
    logger.info('Skipping App Store Connect setup. Run "kappmaker create-appstore-app" later.');
  }

  // Step 12: Google Play Console setup (optional)
  // Publishes AAB to internal track first (Fastlane builds + uploads in one step),
  // so billing is enabled for subscription/IAP creation in gpc setup.
  logger.step(12, TOTAL_STEPS, 'Google Play Console setup');
  const wantsPlayStore = await confirm('  Set up Google Play Console? (builds + uploads AAB to internal track first)');
  if (wantsPlayStore) {
    // Ensure Fastlane is configured (Gemfile + Fastfile)
    const gemfilePath = path.join(ctx.mobileDir, 'Gemfile');
    if (!(await fs.pathExists(gemfilePath))) {
      logger.info('Configuring Fastlane (Gemfile + Fastfile + bundle install)...');
      await configureFastlane(ctx.mobileDir);
    }

    // Fastlane's upload_to_play_store checks for the metadata_path directory
    // even when skip_upload_metadata is true. Ensure it exists.
    const playMetadataDir = path.join(ctx.mobileDir, 'distribution', 'android', 'playstore_metadata');
    await fs.ensureDir(playMetadataDir);

    // Publish to internal track — Fastlane's playstore_release lane builds the
    // AAB and uploads it in one step, so no separate build step is needed.
    logger.info('Building and uploading AAB to Google Play internal track...');
    try {
      await publishAndroid(ctx.mobileDir, {
        track: 'internal',
        uploadMetadata: false,
        uploadScreenshots: false,
        uploadImages: false,
        submitForReview: false,
      }, userConfig);
      logger.success('AAB uploaded to internal track.');
    } catch {
      logger.warn('Failed to build/upload AAB to internal track.');
      logger.info('You can retry later: kappmaker publish --platform android --track internal');
      logger.info('Continuing with Google Play Console setup -- monetization steps may be skipped.');
    }

    await createPlayApp({ config: gpcConfigPath });
  } else {
    logger.info('Skipping Google Play Console setup. Run "kappmaker gpc setup" later.');
  }

  // Step 13: Adapty setup (optional)
  logger.step(13, TOTAL_STEPS, 'Adapty subscription setup');
  const wantsAdapty = await confirm('  Set up Adapty subscriptions?');
  if (wantsAdapty) {
    await adaptySetup({ config: adaptyConfigPath });
  } else {
    logger.info('Skipping Adapty setup. Run "kappmaker adapty setup" later.');
  }

  logger.done();
}

/**
 * Verify that the downloaded google-services.json contains the expected
 * package name. If not (e.g., Firebase app was from a previous run with a
 * different bundleIdPrefix), fix it in-place.
 */
async function verifyAndFixGoogleServicesPackage(
  jsonPath: string,
  expectedPackage: string,
): Promise<void> {
  if (!(await fs.pathExists(jsonPath))) return;
  try {
    const raw = await fs.readFile(jsonPath, 'utf8');
    const data = JSON.parse(raw);
    const clients: Array<{ client_info?: { android_client_info?: { package_name?: string } } }> = data?.client ?? [];
    const match = clients.some(
      (c) => c.client_info?.android_client_info?.package_name === expectedPackage,
    );
    if (!match && clients.length > 0) {
      const actual = clients[0]?.client_info?.android_client_info?.package_name ?? '(unknown)';
      logger.warn('google-services.json has package "' + actual + '" but expected "' + expectedPackage + '".');
      logger.info('Fixing package name in google-services.json...');
      const fixed = raw.replaceAll(actual, expectedPackage);
      await fs.writeFile(jsonPath, fixed, 'utf8');
      logger.success('google-services.json updated to ' + expectedPackage);
    }
  } catch {
    // Non-fatal
  }
}
