import path from 'path';
import fs from 'fs-extra';
import { logger } from '../utils/logger.js';

export interface VersionResult {
  oldCode: number;
  newCode: number;
  oldName: string;
  newName: string;
}

export function resolveMobileDir(): string {
  // AGP 9: a project may now have :androidApp instead of (or alongside) :shared.
  // `composeApp` is the pre-rename name of the shared library; accept it as a fallback so
  // older KAppMaker projects still resolve.
  const markers = ['shared', 'composeApp', 'androidApp', 'iosApp'];
  const isMobileRoot = (dir: string): boolean =>
    markers.some((m) => fs.existsSync(path.join(dir, m)));

  const mobileApp = path.resolve('MobileApp');
  if (isMobileRoot(mobileApp)) return mobileApp;

  const cwd = path.resolve('.');
  if (isMobileRoot(cwd)) return cwd;

  logger.error('Could not find mobile app directory. Run from the project root or MobileApp/ folder.');
  process.exit(1);
}

export function incrementPatch(version: string): string {
  const parts = version.split('.').map(Number);
  parts[parts.length - 1] += 1;
  return parts.join('.');
}

export async function updateAndroidVersion(
  mobileDir: string,
  newVersionName?: string,
): Promise<VersionResult | null> {
  // AGP 9 split: versionCode/versionName live in :androidApp/build.gradle.kts.
  // Fall back to legacy :composeApp/build.gradle.kts for not-yet-migrated projects.
  const candidates = [
    path.join(mobileDir, 'androidApp', 'build.gradle.kts'),
    path.join(mobileDir, 'composeApp', 'build.gradle.kts'),
  ];
  const buildFile = candidates.find((p) => fs.existsSync(p));
  if (!buildFile) {
    logger.warn('Android build file not found — skipping Android version update');
    return null;
  }

  let content = await fs.readFile(buildFile, 'utf8');

  const codeMatch = content.match(/^\s*versionCode\s*=\s*(\d+)/m);
  const nameMatch = content.match(/^\s*versionName\s*=\s*"([^"]+)"/m);
  if (!codeMatch || !nameMatch) {
    logger.warn('Could not parse Android version — skipping');
    return null;
  }

  const oldCode = parseInt(codeMatch[1], 10);
  const oldName = nameMatch[1];
  const newCode = oldCode + 1;
  const newName = newVersionName ?? incrementPatch(oldName);

  content = content.replace(
    /^(\s*versionCode\s*=\s*)\d+/m,
    `$1${newCode}`,
  );
  content = content.replace(
    /^(\s*versionName\s*=\s*")[^"]+(")/m,
    `$1${newName}$2`,
  );

  await fs.writeFile(buildFile, content, 'utf8');
  return { oldCode, newCode, oldName, newName };
}

export async function updateIosVersion(
  mobileDir: string,
  newVersionName?: string,
): Promise<VersionResult | null> {
  const pbxproj = path.join(mobileDir, 'iosApp', 'iosApp.xcodeproj', 'project.pbxproj');
  const infoPlist = path.join(mobileDir, 'iosApp', 'iosApp', 'Info.plist');

  if (!fs.existsSync(pbxproj)) {
    logger.warn('iOS project.pbxproj not found — skipping iOS version update');
    return null;
  }

  let pbx = await fs.readFile(pbxproj, 'utf8');

  const codeMatch = pbx.match(/CURRENT_PROJECT_VERSION\s*=\s*(\d+);/);
  const nameMatch = pbx.match(/MARKETING_VERSION\s*=\s*([^;]+);/);
  if (!codeMatch || !nameMatch) {
    logger.warn('Could not parse iOS version — skipping');
    return null;
  }

  const oldCode = parseInt(codeMatch[1], 10);
  const oldName = nameMatch[1].trim();
  const newCode = oldCode + 1;
  const newName = newVersionName ?? incrementPatch(oldName);

  pbx = pbx.replace(
    /(CURRENT_PROJECT_VERSION\s*=\s*)\d+;/g,
    `$1${newCode};`,
  );
  pbx = pbx.replace(
    /(MARKETING_VERSION\s*=\s*)[^;]+;/g,
    `$1${newName};`,
  );
  await fs.writeFile(pbxproj, pbx, 'utf8');

  if (fs.existsSync(infoPlist)) {
    let plist = await fs.readFile(infoPlist, 'utf8');
    plist = plist.replace(
      /(<key>CFBundleVersion<\/key>\s*<string>)\d+(<\/string>)/,
      `$1${newCode}$2`,
    );
    plist = plist.replace(
      /(<key>CFBundleShortVersionString<\/key>\s*<string>)[^<]+(<\/string>)/,
      `$1${newName}$2`,
    );
    await fs.writeFile(infoPlist, plist, 'utf8');
  } else {
    logger.warn('Info.plist not found — updated project.pbxproj only');
  }

  return { oldCode, newCode, oldName, newName };
}
