import path from 'path';
import fs from 'fs-extra';
import { logger } from '../utils/logger.js';

export const DEFAULT_OLD_APP_ID = 'com.measify.kappmaker';
export const DEFAULT_OLD_APP_NAME = 'KAppMakerAllModules';

const SOURCE_DIRS = [
  'src/commonMain/kotlin',
  'src/commonTest/kotlin',
  'src/androidMain/kotlin',
  // Roborazzi / ComposablePreviewScanner screenshot tests added with the AGP 9 testing
  // additions — must be walked so test files referencing `com.measify.kappmaker` get rewritten
  // and the `com/measify/kappmaker/...` directory is moved into the new package.
  'src/androidHostTest/kotlin',
  'src/iosMain/kotlin',
  'src/jvmMain/kotlin',
  // Compose UI tests via runComposeUiTest (sample at shared/src/jvmTest/.../SampleComposeUiTest.kt)
  'src/jvmTest/kotlin',
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
    'scripts/make_local.sh',
    'scripts/create_module.sh',
    'scripts/generate_screen.sh',
    'scripts/generate_store_screenshots.sh',
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
  // `.github/` lives at the cloned repo root (one level above MobileApp/) in the current
  // KAppMaker-All template. Probe both locations so legacy templates that nested it inside
  // MobileApp/ still get refactored.
  const roots = [path.dirname(mobileDir), mobileDir];
  const files = [
    '.github/workflows/publish_android_playstore.yml',
    '.github/workflows/publish_ios_appstore.yml',
  ];
  for (const root of roots) {
    for (const f of files) {
      if (await replaceInFile(path.join(root, f), oldId, newId)) {
        logger.info('Updated: ' + path.relative(mobileDir, path.join(root, f)));
      }
    }
  }
}

// Roborazzi snapshot PNGs embed the fully-qualified preview class in their filename
// (e.g. `com.measify.kappmaker.designsystem.components.ButtonKt_AppButtonPreviews.png`).
// Without renaming them, `verifyRoborazziAndroidHostTest` would look for
// `<newPackage>.<...>.png` but only find the old-named files, and every preview would
// fail as "missing golden". Mirrors `renameRoborazziSnapshots` in the boilerplate's
// gradle/scripts/refactorPackage.gradle.kts.
async function renameRoborazziSnapshots(
  moduleDir: string, oldId: string, newId: string,
): Promise<void> {
  const snapshotsDir = path.join(moduleDir, 'src/androidHostTest/snapshots');
  if (!(await fs.pathExists(snapshotsDir))) return;
  const entries = await fs.readdir(snapshotsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.includes(oldId)) continue;
    const oldPath = path.join(snapshotsDir, entry.name);
    const newPath = path.join(snapshotsDir, entry.name.replaceAll(oldId, newId));
    await fs.rename(oldPath, newPath);
    logger.info('Renamed snapshot: ' + entry.name + ' -> ' + path.basename(newPath));
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
  mobileDir: string, oldName: string, newName: string, currentPkgId: string,
): Promise<void> {
  // Path C of the JetBrains AGP 9 migration moved manifests / Main.kt out of the shared
  // library (`shared/`, formerly `composeApp/`) into dedicated entry-point modules. The
  // current template uses capital `Main.kt`, `webApp/src/webMain/resources/index.html`
  // (NOT `wasmJsMain`), and `KAppMakerAllModules` is also returned from
  // `AppUtilImpl.web.kt` (added with the AGP 9 testing/web work).
  //
  // `currentPkgId` is the package id *as it currently lives on disk* — when called after
  // a package rename it is the NEW id, so paths like `desktopApp/src/main/kotlin/<pkg>/Main.kt`
  // resolve to the moved location instead of the original `com/measify/kappmaker` path.
  const pkgPath = currentPkgId.replace(/\./g, '/');
  const mobileFiles = [
    // Latest Path C locations
    'androidApp/src/main/AndroidManifest.xml',
    `desktopApp/src/main/kotlin/${pkgPath}/Main.kt`,
    'webApp/src/webMain/resources/index.html',
    `shared/src/jvmMain/kotlin/${pkgPath}/util/AppUtilImpl.jvm.kt`,
    `shared/src/webMain/kotlin/${pkgPath}/util/AppUtilImpl.web.kt`,
    // Pre-rename / lowercase fallbacks
    `desktopApp/src/main/kotlin/${pkgPath}/main.kt`,
    'webApp/src/wasmJsMain/resources/index.html',
    'composeApp/src/androidMain/AndroidManifest.xml',
    'composeApp/src/webMain/resources/index.html',
    `composeApp/src/jvmMain/kotlin/${pkgPath}/Main.kt`,
    `composeApp/src/jvmMain/kotlin/${pkgPath}/main.kt`,
    `composeApp/src/jvmMain/kotlin/${pkgPath}/util/AppUtilImpl.jvm.kt`,
    'settings.gradle.kts',
    'iosApp/iosApp.xcodeproj/project.pbxproj',
  ];
  for (const f of mobileFiles) {
    if (await replaceInFile(path.join(mobileDir, f), oldName, newName)) {
      logger.info('Updated app name in: ' + f);
    }
  }

  // .github/ is at the repo root (one level above MobileApp/) in current templates.
  const repoRoot = path.dirname(mobileDir);
  const repoFiles = ['.github/workflows/publish_ios_appstore.yml'];
  for (const f of repoFiles) {
    for (const root of [repoRoot, mobileDir]) {
      if (await replaceInFile(path.join(root, f), oldName, newName)) {
        logger.info('Updated app name in: ' + path.relative(mobileDir, path.join(root, f)));
      }
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

      await renameRoborazziSnapshots(moduleDir, oldAppId, newAppId);
      await cleanUpOldDirectories(moduleDir, oldAppId, newAppId);
    }

    await updateGradleFiles(mobileDir, oldAppId, newAppId);
    await updateFirebaseConfigs(mobileDir, oldAppId, newAppId);
    await updateIosFiles(mobileDir, oldAppId, newAppId);
    await updateGithubWorkflows(mobileDir, oldAppId, newAppId);
    // After package rename, on-disk paths use newAppId — pass it so updateAppName
    // resolves entry points (Main.kt, AppUtilImpl.{jvm,web}.kt) to their new location.
    await updateAppName(mobileDir, oldAppName, newAppName, newAppId);
  } else {
    logger.info('Skipping package rename -- updating IDs and app name only...');
    await updateApplicationIdOnly(mobileDir, newAppId);
    await updateFirebaseConfigs(mobileDir, oldAppId, newAppId);
    await updateIosFiles(mobileDir, oldAppId, newAppId);
    await updateGithubWorkflows(mobileDir, oldAppId, newAppId);
    // Package paths are unchanged in this mode — files still live under oldAppId.
    await updateAppName(mobileDir, oldAppName, newAppName, oldAppId);
  }

  logger.success('Package refactoring completed.');
}
