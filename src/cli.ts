import { Command } from 'commander';
import { createApp } from './commands/create.js';
import { createLogo } from './commands/create-logo.js';
import { split } from './commands/split.js';
import { removeBackground } from './commands/remove-bg.js';
import { enhance } from './commands/enhance.js';
import { translateScreenshots } from './commands/translate-screenshots.js';
import { configList, configGet, configSet, configPath, configInit, configAppStoreDefaults, configAdaptyDefaults } from './commands/config.js';
import { createAppStoreApp } from './commands/create-appstore-app.js';
import { generateScreenshots } from './commands/generate-screenshots.js';
import { adaptySetup } from './commands/adapty-setup.js';
import { updateVersion } from './commands/update-version.js';
import { refactorCommand } from './commands/refactor.js';
import { generateKeystoreCommand } from './commands/generate-keystore.js';
import { androidReleaseBuild } from './commands/android-release-build.js';
import { publishCommand } from './commands/publish.js';
import { fastlaneConfigure } from './commands/fastlane-configure.js';

export function createCli(): Command {
  const program = new Command();

  program
    .name('kappmaker')
    .description('CLI tool for bootstrapping KAppMaker mobile apps')
    .version('0.1.0');

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
    .command('create-logo')
    .description('Generate an app logo using AI (fal.ai)')
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
    .option('--rows <n>', 'Grid rows', '2')
    .option('--cols <n>', 'Grid columns', '4')
    .option('--poll-interval <seconds>', 'Seconds between status checks', '10')
    .action(async (options) => {
      await generateScreenshots({
        prompt: options.prompt,
        input: options.input,
        style: parseInt(options.style, 10),
        output: options.output,
        resolution: options.resolution,
        rows: parseInt(options.rows, 10),
        cols: parseInt(options.cols, 10),
        pollInterval: parseInt(options.pollInterval, 10),
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
    .option('--submit-for-review', 'Submit for review after upload', true)
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
    .action(async (options) => {
      await configAdaptyDefaults(options);
    });

  return program;
}
