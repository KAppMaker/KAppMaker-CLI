import { Command } from 'commander';
import { createApp } from './commands/create.js';
import { createLogo } from './commands/create-logo.js';
import { split } from './commands/split.js';
import { removeBackground } from './commands/remove-bg.js';
import { enhance } from './commands/enhance.js';
import { translateScreenshots } from './commands/translate-screenshots.js';
import { configList, configGet, configSet, configPath, configInit, configAppStoreDefaults, configAdaptyDefaults } from './commands/config.js';
import { createAppStoreApp } from './commands/create-appstore-app.js';
import {
  updateSubscriptionReviewScreenshot,
  updateIapReviewScreenshot,
} from './commands/update-review-screenshot.js';
import { createPlayApp } from './commands/create-play-app.js';
import {
  gpcSetup,
  gpcAppCheck,
  gpcListingsPush,
  gpcSubscriptionsList,
  gpcSubscriptionsPush,
  gpcIapList,
  gpcIapPush,
  gpcDataSafetyPush,
} from './commands/gpc.js';
import { generateScreenshots } from './commands/generate-screenshots.js';
import { generateImage } from './commands/generate-image.js';
import { generateFeatureImage } from './commands/generate-feature-image.js';
import { generateIosIcons } from './commands/generate-ios-icons.js';
import { generateAndroidIcons } from './commands/generate-android-icons.js';
import { adaptySetup } from './commands/adapty-setup.js';
import { subscriptionAdd } from './commands/subscription-add.js';
import { iapAdd } from './commands/iap-add.js';
import { updateVersion } from './commands/update-version.js';
import { refactorCommand } from './commands/refactor.js';
import { generateKeystoreCommand } from './commands/generate-keystore.js';
import { androidReleaseBuild } from './commands/android-release-build.js';
import { publishCommand } from './commands/publish.js';
import { fastlaneConfigure } from './commands/fastlane-configure.js';
import { convertWebp } from './commands/convert-webp.js';
import { cloneCommand } from './commands/clone.js';
import { gitSetupUpstreamCommand } from './commands/git.js';
import {
  firebaseLoginCommand,
  firebaseProjectCommand,
  firebaseAppsCommand,
  firebaseAuthAnonymousCommand,
  firebaseConfigsCommand,
} from './commands/firebase.js';

export function createCli(): Command {
  const program = new Command();

  program
    .name('kappmaker')
    .description('CLI tool for bootstrapping KAppMaker mobile apps')
    .version('1.13.7');

  program
    .command('create')
    .description('Create a new KAppMaker app from template')
    .argument('<app-name>', 'Name of the app (PascalCase, e.g., Remimi)')
    .option('--template-repo <url>', 'Git URL of the template repository')
    .option('--organization <org>', 'Organization name for Fastlane signing')
    .action(async (appName: string, options) => {
      await createApp(appName, options);
    });

  program
    .command('clone')
    .description('Clone the KAppMaker template into <AppName>-All')
    .argument('<app-name>', 'Name of the app (PascalCase, e.g., Remimi)')
    .option('--template-repo <url>', 'Git URL of the template repository')
    .option('--target-dir <path>', 'Target directory (default: <AppName>-All)')
    .action(async (appName: string, options) => {
      await cloneCommand(appName, options);
    });

  const gitCmd = program
    .command('git')
    .description('Git helpers for KAppMaker projects');

  gitCmd
    .command('setup-upstream')
    .description('Rename origin remote to upstream (so the template becomes the upstream remote)')
    .argument('[path]', 'Path to the repo root (default: current directory)')
    .action(async (repoPath?: string) => {
      await gitSetupUpstreamCommand(repoPath);
    });

  // ── Firebase ───────────────────────────────────────────────────────

  const firebaseCmd = program
    .command('firebase')
    .description('Firebase setup steps (login, project, apps, auth, SDK configs)');

  firebaseCmd
    .command('login')
    .description('Run `firebase login` to authenticate the Firebase CLI')
    .action(async () => {
      await firebaseLoginCommand();
    });

  firebaseCmd
    .command('project')
    .description('Create a Firebase project (idempotent — skips if it already exists)')
    .option('--project-id <id>', 'Firebase project ID (e.g., myapp-app)')
    .option('--display-name <name>', 'Project display name (default: --project-id)')
    .option('--app-name <name>', 'PascalCase app name; derives project-id and display-name')
    .action(async (options) => {
      await firebaseProjectCommand(options);
    });

  firebaseCmd
    .command('apps')
    .description('Create Firebase Android + iOS apps (idempotent — reuses existing apps)')
    .requiredOption('--project <id>', 'Firebase project ID')
    .requiredOption('--app-name <name>', 'PascalCase app display name')
    .requiredOption('--package-name <pkg>', 'Application ID / bundle ID (e.g., com.example.myapp)')
    .action(async (options) => {
      await firebaseAppsCommand(options);
    });

  firebaseCmd
    .command('auth-anonymous')
    .description('Enable anonymous authentication for a Firebase project')
    .requiredOption('--project <id>', 'Firebase project ID')
    .action(async (options) => {
      await firebaseAuthAnonymousCommand(options);
    });

  firebaseCmd
    .command('configs')
    .description('Download google-services.json and GoogleService-Info.plist for the Android/iOS apps')
    .requiredOption('--project <id>', 'Firebase project ID')
    .requiredOption('--app-name <name>', 'PascalCase app display name (used to find the apps)')
    .option('--package-name <pkg>', 'Verify and fix the Android google-services.json package name')
    .option('--android-app-id <id>', 'Skip lookup and use this Android Firebase App ID')
    .option('--ios-app-id <id>', 'Skip lookup and use this iOS Firebase App ID')
    .option('--android-output <path>', 'Output path for google-services.json (default: auto-detect)')
    .option('--ios-output <path>', 'Output path for GoogleService-Info.plist (default: auto-detect)')
    .action(async (options) => {
      await firebaseConfigsCommand(options);
    });

  program
    .command('create-logo')
    .description('Generate an app logo using AI (fal.ai)')
    .option('--prompt <text>', 'App idea / concept (skips the interactive prompt)')
    .option('--output <path>', 'Custom output path for the logo')
    .action(async (options) => {
      await createLogo(options);
    });

  // ── Image tools ────────────────────────────────────────────────────

  program
    .command('image-split')
    .description('Split a grid image into individual tiles')
    .argument('<source>', 'Path to the grid image')
    .option('--rows <n>', 'Number of rows', '4')
    .option('--cols <n>', 'Number of columns', '4')
    .option('--zoom <factor>', 'Zoom factor to crop background edges', '1.07')
    .option('--gap <pixels>', 'Gap pixels to skip at each tile edge', '0')
    .option('--width <pixels>', 'Output tile width in pixels', '512')
    .option('--height <pixels>', 'Output tile height in pixels', '512')
    .option('--output-dir <path>', 'Directory to save tiles', '.')
    .option('--keep <indices>', 'Comma-separated tile indices to keep (e.g., 1,3,5). Others are deleted')
    .action(async (source: string, options) => {
      const keep = options.keep
        ? options.keep.split(',').map((s: string) => parseInt(s.trim(), 10))
        : undefined;
      await split(source, {
        rows: parseInt(options.rows, 10),
        cols: parseInt(options.cols, 10),
        zoom: parseFloat(options.zoom),
        gap: parseInt(options.gap, 10),
        width: parseInt(options.width, 10),
        height: parseInt(options.height, 10),
        outputDir: options.outputDir,
        keep,
      });
    });

  program
    .command('image-remove-bg')
    .description('Remove background from an image using AI (fal.ai)')
    .argument('<source>', 'Path to the image')
    .option('--output <path>', 'Custom output path')
    .action(async (source: string, options) => {
      await removeBackground(source, options);
    });

  program
    .command('image-enhance')
    .description('Enhance image quality using AI (fal.ai)')
    .argument('<source>', 'Path to the image')
    .option('--output <path>', 'Custom output path')
    .action(async (source: string, options) => {
      await enhance(source, options);
    });

  program
    .command('translate-screenshots')
    .description('Translate app screenshots into multiple locales using AI (fal.ai)')
    .argument('[source-dir]', 'Directory containing source screenshots (default: MobileApp/distribution/ios/appstore_metadata/screenshots/en-US)')
    .option('--output <path>', 'Distribution directory root (auto-detected from source path)')
    .option('--locales <codes...>', 'Target Play Store locale codes (space-separated)')
    .option('--rows <n>', 'Grid rows', '2')
    .option('--cols <n>', 'Grid columns', '4')
    .option('--resolution <res>', 'AI resolution (1K, 2K, 4K)', '2K')
    .option('--poll-interval <seconds>', 'Seconds between status checks', '10')
    .action(async (sourceDir: string | undefined, options) => {
      const resolvedDir = sourceDir ?? 'MobileApp/distribution/ios/appstore_metadata/screenshots/en-US';
      await translateScreenshots(resolvedDir, {
        output: options.output,
        locales: options.locales,
        rows: parseInt(options.rows, 10),
        cols: parseInt(options.cols, 10),
        resolution: options.resolution,
        pollInterval: parseInt(options.pollInterval, 10),
      });
    });

  program
    .command('generate-screenshots')
    .description('Generate App Store/Play Store marketing screenshots using AI (OpenAI + fal.ai)')
    .requiredOption('--prompt <text>', 'App description or PRD for screenshot generation')
    .option('--input <dir>', 'Directory with reference screenshots (default: auto-detect Assets/screenshots)')
    .option('--style <id>', 'Style preset ID', '1')
    .option('--output <dir>', 'Output base directory (default: Assets/screenshots)')
    .option('--resolution <res>', 'AI resolution (1K, 2K, 4K)', '2K')
    .option('--poll-interval <seconds>', 'Seconds between status checks', '10')
    .action(async (options) => {
      await generateScreenshots({
        prompt: options.prompt,
        input: options.input,
        style: parseInt(options.style, 10),
        output: options.output,
        resolution: options.resolution,
        pollInterval: parseInt(options.pollInterval, 10),
      });
    });

  program
    .command('generate-feature-image')
    .description('Generate a Google Play feature graphic (1024×500) using AI (OpenAI + fal.ai)')
    .requiredOption('--prompt <text>', 'App description / concept for the banner')
    .requiredOption('--app-name <name>', 'App name to render on the banner (e.g., "FitTrack")')
    .requiredOption('--primary-color <hex>', 'Primary brand color in hex (e.g., #FF3B30)')
    .option('--subtitle <text>', 'Subtitle / tagline shown under the app name')
    .option('--logo <path>', 'Path to the app logo PNG to render on the brand panel')
    .option('--reference <paths...>', 'App screenshot paths to place inside device frames (max 10)')
    .option('--output <path>', 'Custom output file path (default: Fastlane Supply path or Assets/playstore/featureGraphic.png)')
    .option('--resolution <res>', 'AI resolution (1K, 2K, 4K)', '2K')
    .option('--locale <code>', 'Play Store locale folder for the default output path', 'en-US')
    .option('--poll-interval <seconds>', 'Seconds between status checks', '10')
    .action(async (options) => {
      await generateFeatureImage({
        prompt: options.prompt,
        appName: options.appName,
        primaryColor: options.primaryColor,
        subtitle: options.subtitle,
        logo: options.logo,
        reference: options.reference,
        output: options.output,
        resolution: options.resolution,
        locale: options.locale,
        pollInterval: parseInt(options.pollInterval, 10),
      });
    });

  program
    .command('generate-image')
    .description('Generate an image using AI (fal.ai nano-banana-2)')
    .requiredOption('--prompt <text>', 'Text prompt describing the image to generate')
    .option('--output <path>', 'Output file or directory (default: Assets/generated.png)')
    .option('--num-images <n>', 'Number of images to generate (1-8)', '1')
    .option('--aspect-ratio <ratio>', 'Aspect ratio: 1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3, 21:9, 9:21, auto', '1:1')
    .option('--resolution <res>', 'Resolution: 1K, 2K, 4K', '2K')
    .option('--output-format <fmt>', 'Output format: png, jpg, webp', 'png')
    .option('--reference <paths...>', 'Reference images: file paths, directories, or HTTP URLs (switches to edit mode, max 10)')
    .action(async (options) => {
      await generateImage({
        prompt: options.prompt,
        output: options.output,
        numImages: parseInt(options.numImages, 10),
        aspectRatio: options.aspectRatio,
        resolution: options.resolution,
        outputFormat: options.outputFormat,
        reference: options.reference,
      });
    });

  program
    .command('generate-ios-icons')
    .description('Generate all iOS AppIcon.appiconset PNG sizes + Contents.json from a single source logo (no AI)')
    .option('--source <path>', 'Path to source logo PNG (default: auto-detect Assets/logo.png, Assets/logo_no_bg.png, etc.)')
    .option('--output <dir>', 'Output AppIcon.appiconset directory (default: auto-detect MobileApp/iosApp/*/Assets.xcassets/AppIcon.appiconset)')
    .option('--background <hex>', 'Background color used to flatten alpha (App Store rejects transparent icons)', '#FFFFFF')
    .action(async (options) => {
      await generateIosIcons({
        source: options.source,
        output: options.output,
        background: options.background,
      });
    });

  program
    .command('generate-android-icons')
    .description('Generate all Android launcher icons across 5 mipmap density buckets + adaptive icon XML + colors.xml entry (no AI)')
    .option('--source <path>', 'Path to source logo PNG (default: auto-detect Assets/logo.png, Assets/logo_no_bg.png, etc.)')
    .option('--output <dir>', 'Output Android res/ directory (default: auto-detect MobileApp/composeApp/src/androidMain/res)')
    .option('--background <hex>', 'Adaptive icon background color', '#FFFFFF')
    .option('--foreground-padding <ratio>', 'Padding each side of the adaptive foreground (0 = no padding, 0.25 = matches Android Asset Studio default)', '0.25')
    .action(async (options) => {
      await generateAndroidIcons({
        source: options.source,
        output: options.output,
        background: options.background,
        foregroundPadding: parseFloat(options.foregroundPadding),
      });
    });

  program
    .command('convert-webp')
    .description('Convert images (PNG, JPG, BMP, TIFF, GIF) to WebP format')
    .argument('<source>', 'Path to an image file or directory containing images')
    .option('--quality <n>', 'WebP quality (0-100, default 75)', '75')
    .option('--recursive', 'Search directories recursively', false)
    .option('--delete-originals', 'Delete original PNG files after conversion', false)
    .option('--output <dir>', 'Output directory (default: same directory as source)')
    .action(async (source: string, options) => {
      await convertWebp(source, {
        quality: options.quality,
        recursive: options.recursive,
        deleteOriginals: options.deleteOriginals,
        output: options.output,
      });
    });

  // ── App Store Connect ─────────────────────────────────────────────

  program
    .command('create-appstore-app')
    .description('Configure an existing app on App Store Connect (version, subscriptions, metadata, etc.)')
    .option('--config <path>', 'Path to App Store Connect JSON config file')
    .action(async (options) => {
      await createAppStoreApp(options);
    });

  program
    .command('appstore-update-subscription-review-screenshot')
    .description('Replace the App Review screenshot on App Store Connect subscriptions (delete + re-upload). Prompts to resize to 1290×2796 if dimensions differ.')
    .option('--file <path>', 'Screenshot path to apply to ALL matched subscriptions (overrides per-product review_screenshot in config)')
    .option('--config <path>', 'Path to App Store Connect JSON config file')
    .option('--product-id <id>', 'Target a single subscription by product_id or ref_name (default: all subscriptions in config)')
    .action(async (options) => {
      await updateSubscriptionReviewScreenshot(options);
    });

  program
    .command('appstore-update-iap-review-screenshot')
    .description('Replace the App Review image on App Store Connect IAPs (delete + re-upload). Prompts to resize to 1290×2796 if dimensions differ.')
    .option('--file <path>', 'Screenshot path to apply to ALL matched IAPs (overrides per-product review_screenshot in config)')
    .option('--config <path>', 'Path to App Store Connect JSON config file')
    .option('--product-id <id>', 'Target a single IAP by product_id or ref_name (default: all IAPs in config)')
    .action(async (options) => {
      await updateIapReviewScreenshot(options);
    });

  // ── Google Play Console ────────────────────────────────────────────

  program
    .command('create-play-app')
    .description('Alias for `kappmaker gpc setup` — configure an existing Google Play app end-to-end')
    .option('--config <path>', 'Path to Google Play JSON config file')
    .action(async (options) => {
      await createPlayApp(options);
    });

  const gpcCmd = program
    .command('gpc')
    .description('Google Play Console management (listings, subscriptions, IAPs, data safety)');

  gpcCmd
    .command('setup')
    .description('Full end-to-end Google Play Console setup (11 steps)')
    .option('--config <path>', 'Path to Google Play JSON config file')
    .action(async (options) => {
      await gpcSetup(options);
    });

  gpcCmd
    .command('app-check')
    .description('Check whether an app exists on Google Play Console')
    .requiredOption('--package <name>', 'Android package name (e.g. com.example.myapp)')
    .action(async (options) => {
      await gpcAppCheck(options);
    });

  const gpcListings = gpcCmd.command('listings').description('Manage store listings');
  gpcListings
    .command('push')
    .description('Push listings from the Google Play config file (title, short/full description, video)')
    .option('--config <path>', 'Path to Google Play JSON config file')
    .action(async (options) => {
      await gpcListingsPush(options);
    });

  const gpcSubs = gpcCmd.command('subscriptions').description('Manage subscriptions (new monetization API)');
  gpcSubs
    .command('list')
    .description('List existing subscriptions on Google Play Console')
    .option('--package <name>', 'Android package name (defaults to config app.package_name)')
    .option('--config <path>', 'Path to Google Play JSON config file')
    .action(async (options) => {
      await gpcSubscriptionsList(options);
    });
  gpcSubs
    .command('push')
    .description('Create/reuse subscriptions from the Google Play config file (idempotent)')
    .option('--config <path>', 'Path to Google Play JSON config file')
    .action(async (options) => {
      await gpcSubscriptionsPush(options);
    });

  const gpcIap = gpcCmd.command('iap').description('Manage one-time in-app products');
  gpcIap
    .command('list')
    .description('List existing one-time in-app products')
    .option('--package <name>', 'Android package name (defaults to config app.package_name)')
    .option('--config <path>', 'Path to Google Play JSON config file')
    .action(async (options) => {
      await gpcIapList(options);
    });
  gpcIap
    .command('push')
    .description('Create/reuse in-app products from the Google Play config file (idempotent)')
    .option('--config <path>', 'Path to Google Play JSON config file')
    .option('--recreate-stuck', 'Delete + recreate products whose existing regions are incompatible with regionsVersion 2022/02 (e.g. legacy products with MN stored)')
    .action(async (options) => {
      await gpcIapPush(options);
    });

  const gpcDataSafety = gpcCmd.command('data-safety').description('Manage the Play Store data safety declaration');
  gpcDataSafety
    .command('push')
    .description('Push data safety declaration from the Google Play config file')
    .option('--config <path>', 'Path to Google Play JSON config file')
    .action(async (options) => {
      await gpcDataSafetyPush(options);
    });

  // ── Adapty ──────────────────────────────────────────────────────────

  const adapty = program
    .command('adapty')
    .description('Adapty subscription management');

  adapty
    .command('setup')
    .description('Set up Adapty products, paywall, and placements')
    .option('--config <path>', 'Path to Adapty JSON config file')
    .action(async (options) => {
      await adaptySetup(options);
    });

  // ── Cross-platform Subscription / IAP add ─────────────────────────

  const subscriptionCmd = program
    .command('subscription')
    .description('Cross-platform subscription management (Google Play + App Store Connect)');

  subscriptionCmd
    .command('add')
    .description('Create a new subscription on Google Play and App Store Connect (auto-generates aligned product IDs)')
    .requiredOption('--period <slug>', 'weekly | monthly | twomonths | quarterly | semiannual | yearly')
    .requiredOption('--price <number>', 'USD price like 9.99')
    .option('--platform <target>', 'all | ios | android (default: all = Play + ASC). ios = ASC only, android = Play only.', 'all')
    .option('--product-version <n>', 'Product-family version (default: 1). Bumps every "v" marker in the IDs together, e.g. v1 → v2 produces myapp.premium.weekly.v2.999.v2 instead of v1.999.v1. Use to create a new product line alongside an existing v1.', '1')
    .option('--name <text>', 'ASC localization name (default: "<Period> Premium", e.g. "Weekly Premium"). Play listing title is automatically derived as "<AppName> <ASC name>" (e.g. "Mangit Weekly Premium") — ASC names are short (group context), Play titles include the app name (standalone).')
    .option('--description <text>', 'Localized description applied to BOTH ASC and Play (default: period-derived, e.g. "Full access for one week.")')
    .option('--review-screenshot <path>', 'App Review screenshot path applied to this subscription (default: top-level review_screenshot from appstore-config.json)')
    .option('--group <ref>', 'ASC subscription group reference name. If the group does not exist on App Store Connect, it is auto-created. (default: first group from appstore-config.json)')
    .option('--group-name <text>', 'Localized display name (en-US) for the group, applied when it is auto-created. Ignored if the group already exists. (default: inherits from matching group in appstore-config.json if any, else "Premium Access")')
    .option('--app-name <name>', 'App name override (default: read from existing configs)')
    .option('--bundle-id <id>', 'iOS bundle ID override, e.g. com.example.myapp. Use when Assets/appstore-config.json does not exist yet. (default: read from configs)')
    .option('--package-name <pkg>', 'Android package name override, e.g. com.example.myapp. Use when Assets/googleplay-config.json does not exist yet. (default: read from configs)')
    .action(async (options) => {
      await subscriptionAdd(options);
    });

  const iapCmd = program
    .command('iap')
    .description('Cross-platform one-time in-app product management (Play + ASC + Adapty)');

  iapCmd
    .command('add')
    .description('Create a new credit-pack IAP on Google Play, App Store Connect, and Adapty (auto-generates aligned product IDs)')
    .requiredOption('--credits <number>', 'Credit count (e.g. 50)')
    .requiredOption('--price <number>', 'USD price like 14.99')
    .option('--platform <target>', 'all | ios | android (default: all). ios/android push only that store; "all" also pushes to Adapty.', 'all')
    .option('--product-version <n>', 'Product-family version (default: 1). v1 keeps the existing credit_pack_{credits}_{priceDigits}_{appname} format unchanged; v2+ appends "_v{n}" to create a fresh product line.', '1')
    .option('--name <text>', 'Localized display name (default: "<Credits> Credit Pack")')
    .option('--description <text>', 'Localized description (default: "<Credits> credits to use in the app.")')
    .option('--review-screenshot <path>', 'App Review screenshot path applied to this IAP (default: top-level review_screenshot from appstore-config.json)')
    .option('--app-name <name>', 'App name override (default: read from existing configs)')
    .option('--bundle-id <id>', 'iOS bundle ID override (default: read from configs)')
    .option('--package-name <pkg>', 'Android package name override (default: read from configs)')
    .action(async (options) => {
      await iapAdd(options);
    });

  // ── Android Build ──────────────────────────────────────────────────

  program
    .command('generate-keystore')
    .description('Generate an Android signing keystore for Play Store releases')
    .option('--first-name <name>', 'Developer name for keystore')
    .option('--organization <name>', 'Organization name for keystore')
    .option('--output <dir>', 'Output directory for keystore files')
    .action(async (options) => {
      await generateKeystoreCommand(options);
    });

  program
    .command('android-release-build')
    .description('Build a signed Android release AAB (generates keystore if needed)')
    .option('--organization <name>', 'Organization name for keystore generation')
    .option('--first-name <name>', 'Developer name for keystore generation')
    .option('--output <dir>', 'Output directory for AAB (default: distribution/android)')
    .action(async (options) => {
      await androidReleaseBuild(options);
    });

  // ── Fastlane ───────────────────────────────────────────────────────

  const fastlaneCmd = program
    .command('fastlane')
    .description('Fastlane setup and management');

  fastlaneCmd
    .command('configure')
    .description('Set up Fastlane in the mobile app directory (Gemfile + Fastfile + bundle install)')
    .action(async () => {
      await fastlaneConfigure();
    });

  // ── Publish ────────────────────────────────────────────────────────

  function collect(value: string, previous: string[]) {
    return previous.concat([value]);
  }

  program
    .command('publish')
    .description('Build and upload app to Google Play and/or App Store via Fastlane')
    .option('--platform <name>', 'Platform to publish: android, ios (repeatable)', collect, [])
    .option('--track <name>', 'Android Play Store track (internal/alpha/beta/production)', 'production')
    .option('--upload-metadata', 'Upload metadata (title, description)', false)
    .option('--upload-screenshots', 'Upload screenshots', false)
    .option('--upload-images', 'Upload images — icon, feature graphic (Android only)', false)
    .option('--submit-for-review <bool>', 'Submit for review after upload (default: true)', 'true')
    .action(async (options) => {
      await publishCommand(options);
    });

  // ── Refactor ───────────────────────────────────────────────────────

  program
    .command('refactor')
    .description('Refactor package names, application ID, bundle ID, and app name')
    .requiredOption('--app-id <id>', 'New applicationId / bundleId (e.g., com.example.myapp)')
    .requiredOption('--app-name <name>', 'New display name (e.g., MyApp)')
    .option('--old-app-id <id>', 'Current applicationId to replace (default: com.measify.kappmaker)')
    .option('--old-app-name <name>', 'Current app name to replace (default: KAppMakerAllModules)')
    .option('--skip-package-rename', 'Only update applicationId/bundleId/app name, keep Kotlin package dirs intact')
    .action(async (options) => {
      await refactorCommand(options);
    });

  // ── Version ────────────────────────────────────────────────────────

  program
    .command('update-version')
    .description('Bump Android and iOS version codes and optionally set version name')
    .option('-v, --version <name>', 'Set explicit version name (e.g., "2.0.0")')
    .action(async (options) => {
      await updateVersion(options);
    });

  // ── Config ─────────────────────────────────────────────────────────

  const config = program
    .command('config')
    .description('Manage CLI configuration');

  config
    .command('list')
    .description('Show all config values')
    .action(async () => {
      await configList();
    });

  config
    .command('get')
    .description('Get a config value')
    .argument('<key>', 'Config key to read')
    .action(async (key: string) => {
      await configGet(key);
    });

  config
    .command('set')
    .description('Set a config value')
    .argument('<key>', 'Config key to set')
    .argument('<value>', 'Value to set')
    .action(async (key: string, value: string) => {
      await configSet(key, value);
    });

  config
    .command('path')
    .description('Show config file path')
    .action(async () => {
      await configPath();
    });

  config
    .command('init')
    .description('Interactively set up configuration')
    .action(async () => {
      await configInit();
    });

  config
    .command('appstore-defaults')
    .description('Save or view global App Store Connect defaults (reused across all apps)')
    .option('--save <path>', 'Save a JSON file as global appstore defaults')
    .option('--init', 'Interactively set up App Store defaults')
    .action(async (options) => {
      await configAppStoreDefaults(options);
    });

  config
    .command('adapty-defaults')
    .description('Save or view global Adapty defaults (reused across all apps)')
    .option('--save <path>', 'Save a JSON file as global Adapty defaults')
    .option('--init', 'Initialize Adapty defaults from the template (subs + credit packs + Credits Paywall + credits_pack placement). Backfills missing entries on re-run.')
    .action(async (options) => {
      await configAdaptyDefaults(options);
    });

  return program;
}
