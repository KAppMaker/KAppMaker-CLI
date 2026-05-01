import path from 'path';
import fs from 'fs-extra';
import { logger } from '../utils/logger.js';

export const DEFAULT_OLD_APP_ID = 'com.measify.kappmaker';
export const DEFAULT_OLD_APP_NAME = 'KAppMakerAllModules';

const SOURCE_DIRS = [
  'src/commonMain/kotlin',
  'src/commonTest/kotlin',
  'src/androidMain/kotlin',
  'src/iosMain/kotlin',
  'src/jvmMain/kotlin',
  'src/nonMobileMain/kotlin',
  'src/mobileMain/kotlin',
  'src/webMain/kotlin',
  'src/nonWebMain/kotlin',
  'src/jsMain/kotlin',
  'src/wasmJsMain/kotlin',
  // AGP 9 split: :androidApp is a plain Android application module that uses
  // the standard `src/main/kotlin` layout (not KMP source sets).
  'src/main/kotlin',
];

const FILE_EXTENSIONS = ['kt', 'kts', 'gradle', 'xml', 'json'];

// All Gradle modules that may contain Kotlin sources needing refactoring.
// Each module gets its source directories renamed and imports updated.
//
// AGP 9 migration (Path C from the JetBrains kotlin-tooling-agp9-migration skill):
// each platform entry point now lives in its own module:
//   - androidApp  — Android Application (MainActivity, AndroidApp, AndroidManifest.xml,
//                   google-services.json, signing/buildTypes, applicationId)
//   - desktopApp  — JVM Desktop Application (main.kt, compose.desktop.application config)
//   - webApp      — Wasm/JS browser entry (main.kt, index.html, webpack/devServer config)
//   - shared      — Shared KMP library (com.android.kotlin.multiplatform.library) holding
//                   commonMain + per-platform actuals. Older KAppMaker templates called
//                   this `composeApp`; both names are walked so refactor works on either.
const REFACTOR_MODULES = [
  'shared',
  'composeApp',
  'androidApp',
  'desktopApp',
  'webApp',
  'designsystem',
  'libs/auth/auth-api',
  'libs/auth/auth-firebase',
  'libs/subscription/subscription-api',
  'libs/subscription/subscription-adapty',
  'libs/subscription/subscription-revenuecat',
];

async function replaceInFile(filePath: string, oldStr: string, newStr: string): Promise<boolean> {
  if (!(await fs.pathExists(filePath))) return false;
  const content = await fs.readFile(filePath, 'utf8');
  const updated = content.replaceAll(oldStr, newStr);
  if (content !== updated) {
    await fs.writeFile(filePath, updated, 'utf8');
    return true;
  }
  return false;
}

async function walkFiles(dir: string, extensions: string[]): Promise<string[]> {
  const results: string[] = [];
  if (!(await fs.pathExists(dir))) return results;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...await walkFiles(fullPath, extensions));
    } else if (extensions.some(ext => entry.name.endsWith('.' + ext))) {
      results.push(fullPath);
    }
  }
  return results;
}

async function updatePackageNamesInFiles(
  moduleDir: string, oldId: string, newId: string,
): Promise<void> {
  for (const dir of SOURCE_DIRS) {
    const rootDir = path.join(moduleDir, dir);
    const files = await walkFiles(rootDir, FILE_EXTENSIONS);
    for (const file of files) {
      if (await replaceInFile(file, oldId, newId)) {
        logger.info('Updated package in: ' + path.relative(moduleDir, file));
      }
    }
  }
}

async function movePackageDirectories(
  moduleDir: string, oldId: string, newId: string,
): Promise<void> {
  const oldPkgDir = oldId.replace(/\./g, '/');
  const newPkgDir = newId.replace(/\./g, '/');

  for (const dir of SOURCE_DIRS) {
    const sourceDir = path.join(moduleDir, dir);
    if (!(await fs.pathExists(sourceDir))) continue;

    const oldPath = path.join(sourceDir, oldPkgDir);
    const newPath = path.join(sourceDir, newPkgDir);

    if (!(await fs.pathExists(oldPath))) continue;
    if (await fs.pathExists(newPath)) {
      logger.warn('Target already exists: ' + newPath + ' -- skipping move');
      continue;
    }

    await fs.ensureDir(path.dirname(newPath));
    await fs.copy(oldPath, newPath);
    await fs.remove(oldPath);
    logger.info('Moved: ' + path.relative(moduleDir, oldPath) + ' -> ' + path.relative(moduleDir, newPath));
  }
}

async function updateGradleFiles(
  mobileDir: string, oldId: string, newId: string,
): Promise<void> {
  const files = [
    ...REFACTOR_MODULES.map((m) => m + '/build.gradle.kts'),
    'gradle/scripts/generateNewScreen.gradle.kts',
    'scripts/make_local.sh',
    'scripts/create_module.sh',
  ];
  for (const f of files) {
    if (await replaceInFile(path.join(mobileDir, f), oldId, newId)) {
      logger.info('Updated: ' + f);
    }
  }
}

async function updateApplicationIdOnly(
  mobileDir: string, newId: string,
): Promise<void> {
  // AGP 9 split: applicationId now lives in :androidApp/build.gradle.kts. Fall back to the
  // legacy :composeApp location for projects that haven't been migrated yet.
  const candidates = [
    path.join(mobileDir, 'androidApp', 'build.gradle.kts'),
    path.join(mobileDir, 'composeApp', 'build.gradle.kts'),
  ];
  for (const buildFile of candidates) {
    if (!(await fs.pathExists(buildFile))) continue;
    const content = await fs.readFile(buildFile, 'utf8');
    if (!/applicationId\s*=/.test(content)) continue;
    const updated = content.replace(
      /applicationId\s*=\s*["'][^"']+["']/,
      'applicationId = "' + newId + '"',
    );
    if (content !== updated) {
      await fs.writeFile(buildFile, updated, 'utf8');
      logger.info('Updated applicationId in ' + path.relative(mobileDir, buildFile));
    }
    return;
  }
}

async function updateFirebaseConfigs(
  mobileDir: string, oldId: string, newId: string,
): Promise<void> {
  // AGP 9 split moves google-services.json from :composeApp to :androidApp. Touch both so
  // newer projects (AGP 9) and legacy ones both refactor cleanly.
  const files = [
    'androidApp/google-services.json',
    'composeApp/google-services.json',
    'iosApp/iosApp/GoogleService-Info.plist',
  ];
  for (const f of files) {
    if (await replaceInFile(path.join(mobileDir, f), oldId, newId)) {
      logger.info('Updated: ' + f);
    }
  }
}

async function updateIosFiles(
  mobileDir: string, oldId: string, newId: string,
): Promise<void> {
  const files = [
    'iosApp/iosApp/Info.plist',
    'iosApp/iosApp.xcodeproj/project.pbxproj',
  ];
  for (const f of files) {
    if (await replaceInFile(path.join(mobileDir, f), oldId, newId)) {
      logger.info('Updated: ' + f);
    }
  }
}

async function updateGithubWorkflows(
  mobileDir: string, oldId: string, newId: string,
): Promise<void> {
  const files = [
    '.github/workflows/publish_android_playstore.yml',
    '.github/workflows/publish_ios_appstore.yml',
  ];
  for (const f of files) {
    if (await replaceInFile(path.join(mobileDir, f), oldId, newId)) {
      logger.info('Updated: ' + f);
    }
  }
}

async function cleanUpOldDirectories(
  moduleDir: string, oldId: string, newId: string,
): Promise<void> {
  const oldParent = oldId.replace(/\./g, '/').replace(/\/[^/]+$/, '');
  const newParent = newId.replace(/\./g, '/').replace(/\/[^/]+$/, '');
  if (oldParent === newParent) return;

  for (const dir of SOURCE_DIRS) {
    const sourceDir = path.join(moduleDir, dir);
    const oldPath = path.join(sourceDir, oldParent);
    if (await fs.pathExists(oldPath)) {
      await fs.remove(oldPath);
      logger.info('Cleaned up: ' + path.relative(moduleDir, oldPath));
    }
  }
}

async function updateAppName(
  mobileDir: string, oldName: string, newName: string,
): Promise<void> {
  // Path C of the JetBrains AGP 9 migration moved manifests/main.kt out of the shared library
  // (`shared/`, formerly `composeApp/`) into dedicated entry-point modules. Touch every old
  // and new location so the refactor stays idempotent across all three layouts:
  //   - latest:    shared/ + androidApp/ + desktopApp/ + webApp/
  //   - mid-AGP9:  composeApp/ + androidApp/ + desktopApp/ + webApp/
  //   - legacy:    composeApp/ alone (KMP + com.android.application in one module)
  const files = [
    // Latest Path C locations
    'androidApp/src/main/AndroidManifest.xml',
    'desktopApp/src/main/kotlin/com/measify/kappmaker/main.kt',
    'webApp/src/wasmJsMain/resources/index.html',
    'shared/src/jvmMain/kotlin/com/measify/kappmaker/util/AppUtilImpl.jvm.kt',
    // Pre-rename / legacy fallbacks
    'composeApp/src/androidMain/AndroidManifest.xml',
    'composeApp/src/webMain/resources/index.html',
    'composeApp/src/jvmMain/kotlin/com/measify/kappmaker/main.kt',
    'composeApp/src/jvmMain/kotlin/com/measify/kappmaker/util/AppUtilImpl.jvm.kt',
    'settings.gradle.kts',
    'iosApp/iosApp.xcodeproj/project.pbxproj',
    '.github/workflows/publish_ios_appstore.yml',
  ];
  for (const f of files) {
    if (await replaceInFile(path.join(mobileDir, f), oldName, newName)) {
      logger.info('Updated app name in: ' + f);
    }
  }
}

export async function refactor(
  mobileDir: string,
  newAppId: string,
  newAppName: string,
  skipPackageRename: boolean,
  oldAppId: string = DEFAULT_OLD_APP_ID,
  oldAppName: string = DEFAULT_OLD_APP_NAME,
): Promise<void> {
  logger.info('Refactoring from ' + oldAppId + ' -> ' + newAppId + ', ' + oldAppName + ' -> ' + newAppName);

  if (!skipPackageRename) {
    // Process every module that may contain Kotlin sources
    for (const mod of REFACTOR_MODULES) {
      const moduleDir = path.join(mobileDir, mod);
      if (!(await fs.pathExists(moduleDir))) continue;

      logger.info('Updating package names in ' + mod + '...');
      await updatePackageNamesInFiles(moduleDir, oldAppId, newAppId);

      logger.info('Moving package directories in ' + mod + '...');
      await movePackageDirectories(moduleDir, oldAppId, newAppId);

      await cleanUpOldDirectories(moduleDir, oldAppId, newAppId);
    }

    await updateGradleFiles(mobileDir, oldAppId, newAppId);
    await updateFirebaseConfigs(mobileDir, oldAppId, newAppId);
    await updateIosFiles(mobileDir, oldAppId, newAppId);
    await updateGithubWorkflows(mobileDir, oldAppId, newAppId);
    await updateAppName(mobileDir, oldAppName, newAppName);
  } else {
    logger.info('Skipping package rename -- updating IDs and app name only...');
    await updateApplicationIdOnly(mobileDir, newAppId);
    await updateFirebaseConfigs(mobileDir, oldAppId, newAppId);
    await updateIosFiles(mobileDir, oldAppId, newAppId);
    await updateGithubWorkflows(mobileDir, oldAppId, newAppId);
    await updateAppName(mobileDir, oldAppName, newAppName);
  }

  logger.success('Package refactoring completed.');
}
