import path from 'path';
import fs from 'fs-extra';
import { logger } from '../utils/logger.js';

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

// Custom Gradle tasks are grouped under the package's last segment (e.g. group = "kappmaker").
// Rename that label to the new last segment. Only the exact `group = "<old-last>"` assignment is
// touched — the bare segment is too generic (also the brand name) to replace globally.
async function updateTaskGroup(
  mobileDir: string, oldId: string, newId: string,
): Promise<void> {
  const oldLast = oldId.split('.').pop() ?? '';
  const newLast = newId.split('.').pop() ?? '';
  if (!oldLast || oldLast === newLast) return;
  const escaped = oldLast.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(group\\s*=\\s*)"${escaped}"`, 'g');
  for (const mod of REFACTOR_MODULES) {
    const file = path.join(mobileDir, mod, 'build.gradle.kts');
    if (!(await fs.pathExists(file))) continue;
    const content = await fs.readFile(file, 'utf8');
    const updated = content.replace(re, `$1"${newLast}"`);
    if (content !== updated) {
      await fs.writeFile(file, updated, 'utf8');
      logger.info(`Updated task group in ${mod}/build.gradle.kts ("${oldLast}" -> "${newLast}")`);
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

/**
 * Gradle-safe project name: letters, digits, "_" and "-" only. "Lab Rat" made
 * `rootProject.name = "Lab Rat"` and Gradle refused to configure the build;
 * the display name keeps its spaces everywhere users see it.
 */
export function gradleSafeName(name: string): string {
  const safe = name.normalize('NFKD').replace(/[^A-Za-z0-9_-]/g, '');
  return safe || 'App';
}

/** A pbxproj value: bare when it is a plain token, quoted otherwise. */
export function pbxValue(value: string): string {
  return /^[A-Za-z0-9_./-]+$/.test(value) ? value : `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

async function rewrite(file: string, fn: (s: string) => string): Promise<boolean> {
  if (!(await fs.pathExists(file))) return false;
  const before = await fs.readFile(file, 'utf8');
  const after = fn(before);
  if (after === before) return false;
  await fs.writeFile(file, after, 'utf8');
  return true;
}

/** The app's current display name: the literal android:label, else rootProject.name. */
async function detectDisplayName(mobileDir: string, fallback: string): Promise<string> {
  for (const f of ['androidApp/src/main/AndroidManifest.xml', 'composeApp/src/androidMain/AndroidManifest.xml']) {
    const file = path.join(mobileDir, f);
    if (!(await fs.pathExists(file))) continue;
    const m = (await fs.readFile(file, 'utf8')).match(/android:label="([^"@][^"]*)"/);
    if (m) return m[1].replace(/&amp;/g, '&');
  }
  return fallback;
}

async function updateAppName(
  mobileDir: string, oldName: string, newName: string, currentPkgId: string,
): Promise<void> {
  // oldName comes from rootProject.name (already Gradle-safe). The display name
  // may differ ("Lab Rat" vs "LabRat"), so detect it separately.
  const oldSafe = oldName;
  const oldDisplay = await detectDisplayName(mobileDir, oldName);
  const newSafe = gradleSafeName(newName);
  const newDisplay = newName.trim();
  if (newSafe !== newDisplay) logger.info(`Project/product name "${newSafe}" (Gradle and Xcode need it without spaces); display name "${newDisplay}".`);

  // currentPkgId reflects the package id on disk: newAppId after a rename, oldAppId in skip-rename mode.
  const pkgPath = currentPkgId.replace(/\./g, '/');
  const displayFiles = [
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
  ];
  const xmlDisplay = newDisplay.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  for (const f of displayFiles) {
    const changed = await rewrite(path.join(mobileDir, f), (c) =>
      f.endsWith('.xml')
        ? c.replace(/android:label="[^"@][^"]*"/, `android:label="${xmlDisplay}"`)
        : c.replaceAll(oldDisplay, newDisplay));
    if (changed) logger.info('Updated app name in: ' + f);
  }

  // settings.gradle.kts: the Gradle-safe name, whatever it was before.
  if (await rewrite(path.join(mobileDir, 'settings.gradle.kts'), (c) =>
    c.replace(/(rootProject\.name\s*=\s*)["'][^"']*["']/, `$1"${newSafe}"`))) {
    logger.info(`Updated rootProject.name to "${newSafe}"`);
  }

  // pbxproj: display name (quoted when it has spaces) + product name (safe).
  if (await rewrite(path.join(mobileDir, 'iosApp/iosApp.xcodeproj/project.pbxproj'), (c) =>
    c
      .replace(/(INFOPLIST_KEY_CFBundleDisplayName\s*=\s*)(?:"[^"]*"|[^;]*);/g, `$1${pbxValue(newDisplay)};`)
      .replace(/(PRODUCT_NAME\s*=\s*)(?:"[^"]*"|[^;$]*);/g, `$1${pbxValue(newSafe)};`)
      .replaceAll(`${oldSafe}.app`, `${newSafe}.app`))) {
    logger.info('Updated app name in: iosApp/iosApp.xcodeproj/project.pbxproj');
  }

  // iOS publish workflow: app_name names the .ipa (= Xcode PRODUCT_NAME). It was
  // only string-replaced, so a template value that did not match the detected
  // old name ("Koko") stayed behind in every app.
  const repoRoot = path.dirname(mobileDir);
  for (const root of [repoRoot, mobileDir]) {
    const wf = path.join(root, '.github/workflows/publish_ios_appstore.yml');
    if (await rewrite(wf, (c) => c.replace(/^(\s*app_name:\s*).*$/m, `$1${newSafe}`))) {
      logger.info(`Updated app_name to "${newSafe}" in: ${path.relative(repoRoot, wf)}`);
    }
  }
}

// Current package id = the android module `namespace` (tracks the Kotlin package even after a
// previous skip-package-rename, which only changes applicationId).
async function detectOldAppId(mobileDir: string): Promise<string | null> {
  for (const f of ['androidApp/build.gradle.kts', 'composeApp/build.gradle.kts']) {
    const file = path.join(mobileDir, f);
    if (!(await fs.pathExists(file))) continue;
    const m = (await fs.readFile(file, 'utf8')).match(/namespace\s*=\s*["']([^"']+)["']/);
    if (m) return m[1];
  }
  return null; // not found — caller errors out rather than guessing
}

// Current display/app name = settings.gradle.kts `rootProject.name`.
async function detectOldAppName(mobileDir: string): Promise<string | null> {
  const file = path.join(mobileDir, 'settings.gradle.kts');
  if (await fs.pathExists(file)) {
    const m = (await fs.readFile(file, 'utf8')).match(/rootProject\.name\s*=\s*["']([^"']+)["']/);
    if (m) return m[1];
  }
  return null; // not found — caller errors out rather than guessing
}

// Docs, agent guidelines, and script header comments reference the package both as a dotted id
// (`com.x.y`) and as a slashed path (`com/x/y`, e.g. example file locations). Source files only use
// the dotted form; these prose/comment files use both, so update both. Full-rename mode only.
async function updateDocReferences(
  mobileDir: string, oldId: string, newId: string,
): Promise<void> {
  const repoRoot = path.dirname(mobileDir);
  const oldPkgPath = oldId.replace(/\./g, '/');
  const newPkgPath = newId.replace(/\./g, '/');

  const files = [
    path.join(repoRoot, 'README.md'),
    path.join(repoRoot, 'AGENTS.md'),
    path.join(mobileDir, 'README.md'),
  ];
  for (const dir of [path.join(repoRoot, 'skills'), path.join(repoRoot, 'AiGuidelines')]) {
    files.push(...await walkFiles(dir, ['md']));
  }
  // Helper-script header comments — but never rewrite the refactor script's own examples.
  const scripts = await walkFiles(path.join(mobileDir, 'scripts'), ['sh']);
  files.push(...scripts.filter((f) => path.basename(f) !== 'refactor_package.sh'));

  for (const f of files) {
    const a = await replaceInFile(f, oldId, newId);
    const b = await replaceInFile(f, oldPkgPath, newPkgPath);
    if (a || b) logger.info('Updated package refs in: ' + path.relative(repoRoot, f));
  }
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
  // app works with no extra flags); the explicit override args win when provided. If detection
  // fails, error out instead of guessing a default that could rewrite the wrong string.
  const oldAppId = oldAppIdOverride ?? await detectOldAppId(mobileDir);
  const oldAppName = oldAppNameOverride ?? await detectOldAppName(mobileDir);
  if (!oldAppId) {
    throw new Error("Could not detect the current app id (no 'namespace' in androidApp/build.gradle.kts). Pass --old-app-id.");
  }
  if (!oldAppName) {
    throw new Error("Could not detect the current app name (no 'rootProject.name' in settings.gradle.kts). Pass --old-app-name.");
  }
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
    await updateTaskGroup(mobileDir, oldAppId, newAppId);
    await updateFirebaseConfigs(mobileDir, oldAppId, newAppId);
    await updateIosFiles(mobileDir, oldAppId, newAppId);
    await updateGithubWorkflows(mobileDir, oldAppId, newAppId);
    await updateAppName(mobileDir, oldAppName, newAppName, newAppId);
    await updateDocReferences(mobileDir, oldAppId, newAppId);
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
