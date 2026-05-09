import path from 'node:path';
import fs from 'fs-extra';
import * as firebase from '../services/firebase.service.js';
import { logger } from '../utils/logger.js';
import type { FirebaseAppResult } from '../types/index.js';

export async function firebaseLoginCommand(): Promise<void> {
  await firebase.firebaseLogin();
}

export interface FirebaseProjectOptions {
  projectId?: string;
  displayName?: string;
  appName?: string;
}

export async function firebaseProjectCommand(opts: FirebaseProjectOptions): Promise<boolean> {
  const projectId = opts.projectId || (opts.appName ? opts.appName.toLowerCase() + '-app' : undefined);
  const displayName = opts.displayName || opts.appName || projectId;
  if (!projectId || !displayName) {
    logger.error('Provide --project-id (and --display-name) or --app-name to derive both.');
    process.exit(1);
  }
  return firebase.createProject(projectId, displayName);
}

export interface FirebaseAppsOptions {
  project: string;
  appName: string;
  packageName: string;
}

export async function firebaseAppsCommand(
  opts: FirebaseAppsOptions,
): Promise<{ android: FirebaseAppResult; ios: FirebaseAppResult }> {
  const android = await firebase.createAndroidApp(opts.project, opts.appName, opts.packageName);
  const ios = await firebase.createIosApp(opts.project, opts.appName, opts.packageName);
  return { android, ios };
}

export interface FirebaseAuthAnonymousOptions {
  project: string;
}

export async function firebaseAuthAnonymousCommand(
  opts: FirebaseAuthAnonymousOptions,
): Promise<void> {
  await firebase.enableAnonymousAuth(opts.project);
}

export interface FirebaseConfigsOptions {
  project: string;
  appName: string;
  packageName?: string;
  androidAppId?: string;
  iosAppId?: string;
  androidOutput?: string;
  iosOutput?: string;
  mobileDir?: string;
  assetsDir?: string;
}

export interface FirebaseConfigsResult {
  androidPath: string;
  iosPath: string;
}

export async function firebaseConfigsCommand(
  opts: FirebaseConfigsOptions,
): Promise<FirebaseConfigsResult> {
  const androidAppId = opts.androidAppId
    ?? await firebase.findExistingApp(opts.project, 'ANDROID', `${opts.appName} (Android App)`);
  const iosAppId = opts.iosAppId
    ?? await firebase.findExistingApp(opts.project, 'IOS', `${opts.appName} (iOS App)`);

  if (!androidAppId) {
    logger.error(`Could not find an Android app named "${opts.appName} (Android App)" in project ${opts.project}.`);
    process.exit(1);
  }
  if (!iosAppId) {
    logger.error(`Could not find an iOS app named "${opts.appName} (iOS App)" in project ${opts.project}.`);
    process.exit(1);
  }

  const { androidPath, iosPath } = resolveOutputPaths(opts);
  await fs.ensureDir(path.dirname(androidPath));
  await fs.ensureDir(path.dirname(iosPath));

  await firebase.downloadSdkConfig(androidAppId, 'ANDROID', androidPath);
  await firebase.downloadSdkConfig(iosAppId, 'IOS', iosPath);

  if (opts.packageName) {
    await verifyAndFixGoogleServicesPackage(androidPath, opts.packageName);
  }

  return { androidPath, iosPath };
}

function resolveOutputPaths(
  opts: FirebaseConfigsOptions,
): { androidPath: string; iosPath: string } {
  if (opts.androidOutput && opts.iosOutput) {
    return { androidPath: opts.androidOutput, iosPath: opts.iosOutput };
  }

  // Auto-detect from mobileDir (or assetsDir as fallback). Probe androidApp/, then composeApp/.
  const mobileDir = opts.mobileDir || resolveDefaultMobileDir();
  const assetsDir = opts.assetsDir || (mobileDir ? path.join(mobileDir, '..', 'Assets') : path.resolve('Assets'));

  const androidCandidates = mobileDir
    ? [
      path.join(mobileDir, 'androidApp', 'google-services.json'),
      path.join(mobileDir, 'composeApp', 'google-services.json'),
    ]
    : [];
  const androidPath = opts.androidOutput
    ?? androidCandidates.find((p) => fs.existsSync(path.dirname(p)))
    ?? path.join(assetsDir, 'google-services.json');

  const iosDefault = mobileDir ? path.join(mobileDir, 'iosApp', 'iosApp', 'GoogleService-Info.plist') : null;
  const iosPath = opts.iosOutput
    ?? (iosDefault && fs.existsSync(path.dirname(iosDefault)) ? iosDefault : path.join(assetsDir, 'GoogleService-Info.plist'));

  return { androidPath, iosPath };
}

function resolveDefaultMobileDir(): string | null {
  const cwdMobile = path.resolve('MobileApp');
  if (fs.existsSync(cwdMobile)) return cwdMobile;
  const cwd = path.resolve('.');
  if (fs.existsSync(path.join(cwd, 'androidApp')) || fs.existsSync(path.join(cwd, 'composeApp'))) {
    return cwd;
  }
  return null;
}

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
