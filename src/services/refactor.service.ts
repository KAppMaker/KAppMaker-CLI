import path from 'path';
import fs from 'fs-extra';
import { logger } from '../utils/logger.js';

export const DEFAULT_OLD_APP_ID = 'com.measify.kappmaker';
export const DEFAULT_OLD_APP_NAME = 'KAppMakerAllModules';

const SOURCE_DIRS = [
  'src/commonMain/kotlin',
  'src/commonTest/kotlin',
  'src/androidMain/kotlin',
  'src/androidHostTest/kotlin',
  'src/iosMain/kotlin',
  'src/jvmMain/kotlin',
  'src/jvmTest/kotlin',
  'src/nonMobileMain/kotlin',
  'src/mobileMain/kotlin',
  'src/webMain/kotlin',
  'src/nonWebMain/kotlin',
  'src/jsMain/kotlin',
  'src/wasmJsMain/kotlin',
  'src/main/kotlin',
];

const FILE_EXTENSIONS = ['kt', 'kts', 'gradle', 'xml', 'json'];

// `composeApp` is the pre-AGP-9 module name; kept so the refactor works on legacy templates too.
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
  // .github/ lives at the repo root (one level above MobileApp/); legacy templates nested it inside.
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

// Roborazzi snapshot PNGs embed the FQCN in their filename, so `verifyRoborazziAndroidHostTest`
// fails as "missing golden" unless the files are renamed alongside the package move.
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
  // currentPkgId reflects the package id on disk: newAppId after a rename, oldAppId in skip-rename mode.
  const pkgPath = currentPkgId.replace(/\./g, '/');
  const mobileFiles = [
    'androidApp/src/main/AndroidManifest.xml',
    `desktopApp/src/main/kotlin/${pkgPath}/Main.kt`,
    'webApp/src/webMain/resources/index.html',
    `shared/src/jvmMain/kotlin/${pkgPath}/util/AppUtilImpl.jvm.kt`,
    `shared/src/webMain/kotlin/${pkgPath}/util/AppUtilImpl.web.kt`,
    // Legacy fallbacks (lowercase main.kt, wasmJsMain dir, composeApp module).
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

// Current package id = the android module `namespace` (tracks the Kotlin package even after a
// previous skip-package-rename, which only changes applicationId).
async function detectOldAppId(mobileDir: string): Promise<string> {
  for (const f of ['androidApp/build.gradle.kts', 'composeApp/build.gradle.kts']) {
    const file = path.join(mobileDir, f);
    if (!(await fs.pathExists(file))) continue;
    const m = (await fs.readFile(file, 'utf8')).match(/namespace\s*=\s*["']([^"']+)["']/);
    if (m) return m[1];
  }
  return DEFAULT_OLD_APP_ID;
}

// Current display/app name = settings.gradle.kts `rootProject.name`.
async function detectOldAppName(mobileDir: string): Promise<string> {
  const file = path.join(mobileDir, 'settings.gradle.kts');
  if (await fs.pathExists(file)) {
    const m = (await fs.readFile(file, 'utf8')).match(/rootProject\.name\s*=\s*["']([^"']+)["']/);
    if (m) return m[1];
  }
  return DEFAULT_OLD_APP_NAME;
}

export async function refactor(
  mobileDir: string,
  newAppId: string,
  newAppName: string,
  skipPackageRename: boolean,
  oldAppIdOverride?: string,
  oldAppNameOverride?: string,
): Promise<void> {
  // Auto-detect what's being replaced from the project (so re-refactoring an already-renamed
  // app works with no extra flags); the explicit override args win when provided.
  const oldAppId = oldAppIdOverride ?? await detectOldAppId(mobileDir);
  const oldAppName = oldAppNameOverride ?? await detectOldAppName(mobileDir);
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
    await updateAppName(mobileDir, oldAppName, newAppName, newAppId);
  } else {
    logger.info('Skipping package rename -- updating IDs and app name only...');
    await updateApplicationIdOnly(mobileDir, newAppId);
    await updateFirebaseConfigs(mobileDir, oldAppId, newAppId);
    await updateIosFiles(mobileDir, oldAppId, newAppId);
    await updateGithubWorkflows(mobileDir, oldAppId, newAppId);
    await updateAppName(mobileDir, oldAppName, newAppName, oldAppId);
  }

  logger.success('Package refactoring completed.');
}
