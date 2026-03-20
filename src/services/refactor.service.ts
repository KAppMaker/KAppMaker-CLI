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
];

const FILE_EXTENSIONS = ['kt', 'kts', 'gradle', 'xml', 'json'];

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
    } else if (extensions.some(ext => entry.name.endsWith(`.${ext}`))) {
      results.push(fullPath);
    }
  }
  return results;
}

async function updatePackageNamesInFiles(
  composeDir: string, oldId: string, newId: string,
): Promise<void> {
  for (const dir of SOURCE_DIRS) {
    const rootDir = path.join(composeDir, dir);
    const files = await walkFiles(rootDir, FILE_EXTENSIONS);
    for (const file of files) {
      if (await replaceInFile(file, oldId, newId)) {
        logger.info(`Updated package in: ${path.relative(composeDir, file)}`);
      }
    }
  }
}

async function movePackageDirectories(
  composeDir: string, oldId: string, newId: string,
): Promise<void> {
  const oldPkgDir = oldId.replace(/\./g, '/');
  const newPkgDir = newId.replace(/\./g, '/');

  for (const dir of SOURCE_DIRS) {
    const sourceDir = path.join(composeDir, dir);
    if (!(await fs.pathExists(sourceDir))) continue;

    const oldPath = path.join(sourceDir, oldPkgDir);
    const newPath = path.join(sourceDir, newPkgDir);

    if (!(await fs.pathExists(oldPath))) continue;
    if (await fs.pathExists(newPath)) {
      logger.warn(`Target already exists: ${newPath} — skipping move`);
      continue;
    }

    await fs.ensureDir(path.dirname(newPath));
    await fs.copy(oldPath, newPath);
    await fs.remove(oldPath);
    logger.info(`Moved: ${path.relative(composeDir, oldPath)} → ${path.relative(composeDir, newPath)}`);
  }
}

async function updateGradleFiles(
  mobileDir: string, oldId: string, newId: string,
): Promise<void> {
  const files = [
    'composeApp/build.gradle.kts',
    'designsystem/build.gradle.kts',
    'gradle/scripts/generateNewScreen.gradle.kts',
    'scripts/make_local.sh',
    'scripts/create_module.sh',
  ];
  for (const f of files) {
    if (await replaceInFile(path.join(mobileDir, f), oldId, newId)) {
      logger.info(`Updated: ${f}`);
    }
  }
}

async function updateApplicationIdOnly(
  mobileDir: string, newId: string,
): Promise<void> {
  const buildFile = path.join(mobileDir, 'composeApp', 'build.gradle.kts');
  if (!(await fs.pathExists(buildFile))) return;
  const content = await fs.readFile(buildFile, 'utf8');
  const updated = content.replace(
    /applicationId\s*=\s*["'][^"']+["']/,
    `applicationId = "${newId}"`,
  );
  if (content !== updated) {
    await fs.writeFile(buildFile, updated, 'utf8');
    logger.info('Updated applicationId in build.gradle.kts');
  }
}

async function updateFirebaseConfigs(
  mobileDir: string, oldId: string, newId: string,
): Promise<void> {
  const files = [
    'composeApp/google-services.json',
    'iosApp/iosApp/GoogleService-Info.plist',
  ];
  for (const f of files) {
    if (await replaceInFile(path.join(mobileDir, f), oldId, newId)) {
      logger.info(`Updated: ${f}`);
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
      logger.info(`Updated: ${f}`);
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
      logger.info(`Updated: ${f}`);
    }
  }
}

async function cleanUpOldDirectories(
  composeDir: string, oldId: string, newId: string,
): Promise<void> {
  const oldParent = oldId.replace(/\./g, '/').replace(/\/[^/]+$/, '');
  const newParent = newId.replace(/\./g, '/').replace(/\/[^/]+$/, '');
  if (oldParent === newParent) return;

  for (const dir of SOURCE_DIRS) {
    const sourceDir = path.join(composeDir, dir);
    const oldPath = path.join(sourceDir, oldParent);
    if (await fs.pathExists(oldPath)) {
      await fs.remove(oldPath);
      logger.info(`Cleaned up: ${path.relative(composeDir, oldPath)}`);
    }
  }
}

async function updateAppName(
  mobileDir: string, oldName: string, newName: string,
): Promise<void> {
  const files = [
    'composeApp/src/androidMain/AndroidManifest.xml',
    'settings.gradle.kts',
    'iosApp/iosApp.xcodeproj/project.pbxproj',
    '.github/workflows/publish_ios_appstore.yml',
    'composeApp/src/webMain/resources/index.html',
    `composeApp/src/jvmMain/kotlin/com/measify/kappmaker/main.kt`,
    `composeApp/src/jvmMain/kotlin/com/measify/kappmaker/util/AppUtilImpl.jvm.kt`,
  ];
  for (const f of files) {
    if (await replaceInFile(path.join(mobileDir, f), oldName, newName)) {
      logger.info(`Updated app name in: ${f}`);
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
  const composeDir = path.join(mobileDir, 'composeApp');
  logger.info(`Refactoring from ${oldAppId} → ${newAppId}, ${oldAppName} → ${newAppName}`);

  if (!skipPackageRename) {
    logger.info('Updating package names in source files...');
    await updatePackageNamesInFiles(composeDir, oldAppId, newAppId);

    logger.info('Moving package directories...');
    await movePackageDirectories(composeDir, oldAppId, newAppId);

    await updateGradleFiles(mobileDir, oldAppId, newAppId);
    await updateFirebaseConfigs(mobileDir, oldAppId, newAppId);
    await updateIosFiles(mobileDir, oldAppId, newAppId);
    await updateGithubWorkflows(mobileDir, oldAppId, newAppId);
    await cleanUpOldDirectories(composeDir, oldAppId, newAppId);
    await updateAppName(mobileDir, oldAppName, newAppName);
  } else {
    logger.info('Skipping package rename — updating IDs and app name only...');
    await updateApplicationIdOnly(mobileDir, newAppId);
    await updateFirebaseConfigs(mobileDir, oldAppId, newAppId);
    await updateIosFiles(mobileDir, oldAppId, newAppId);
    await updateGithubWorkflows(mobileDir, oldAppId, newAppId);
    await updateAppName(mobileDir, oldAppName, newAppName);
  }

  logger.success('Package refactoring completed.');
}
