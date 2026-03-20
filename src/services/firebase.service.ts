import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { run, runStreaming } from '../utils/exec.js';
import { logger } from '../utils/logger.js';
import type { DerivedConfig, FirebaseAppResult } from '../types/index.js';

export async function firebaseLogin(): Promise<void> {
  await runStreaming('firebase', ['login'], {
    label: 'Opening Firebase login...',
  });
}

export async function createProject(config: DerivedConfig): Promise<boolean> {
  // Check first if project already exists
  if (await projectExists(config.firebaseProject)) {
    logger.info(`Firebase project "${config.firebaseProject}" already exists, skipping creation.`);
    return true;
  }

  const exitCode = await runStreaming(
    'firebase',
    [
      'projects:create',
      config.firebaseProject,
      '--display-name',
      config.appName,
    ],
    {
      label: `Creating Firebase project: ${config.firebaseProject}`,
      allowFailure: true,
    },
  );

  if (exitCode === 0) {
    await waitForProject(config.firebaseProject);
    return true;
  }

  const exists = await projectExists(config.firebaseProject);
  if (exists) {
    logger.info('Firebase project already exists, continuing...');
    return true;
  }

  logger.warn(`Firebase project "${config.firebaseProject}" could not be created.`);
  logger.info('Check firebase-debug.log for details, or create it manually:');
  logger.info(`  firebase projects:create ${config.firebaseProject} --display-name ${config.appName}`);
  return false;
}

export async function createAndroidApp(
  config: DerivedConfig,
): Promise<FirebaseAppResult> {
  return createOrFindApp(config, 'ANDROID', '--package-name');
}

export async function createIosApp(
  config: DerivedConfig,
): Promise<FirebaseAppResult> {
  return createOrFindApp(config, 'IOS', '--bundle-id');
}

export async function downloadSdkConfig(
  appId: string,
  platform: 'ANDROID' | 'IOS',
  outputPath: string,
): Promise<void> {
  const result = await run(
    'firebase',
    ['apps:sdkconfig', platform, appId],
    { label: `Downloading ${platform} SDK config` },
  );
  await fs.writeFile(outputPath, result.stdout);
}

export async function enableAnonymousAuth(projectId: string): Promise<void> {
  const accessToken = await getFirebaseAccessToken();
  if (!accessToken) {
    logger.warn('Could not read Firebase access token. Enable anonymous auth manually in the Firebase console.');
    return;
  }

  const url = `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config?updateMask=signIn.anonymous.enabled`;

  try {
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        signIn: { anonymous: { enabled: true } },
      }),
    });

    if (response.ok) {
      logger.success('Anonymous authentication enabled.');
    } else {
      const errorText = await response.text();
      logger.warn(`Failed to enable anonymous auth (HTTP ${response.status}): ${errorText}`);
      logger.info('You can enable it manually in the Firebase console → Authentication → Sign-in method.');
    }
  } catch (error) {
    logger.warn(`Could not enable anonymous auth: ${error}`);
    logger.info('You can enable it manually in the Firebase console → Authentication → Sign-in method.');
  }
}

// ── Internal helpers ────────────────────────────────────────────────

async function getFirebaseAccessToken(): Promise<string | null> {
  const configPath = path.join(
    os.homedir(),
    '.config',
    'configstore',
    'firebase-tools.json',
  );

  try {
    const config = await fs.readJson(configPath);
    return config?.tokens?.access_token || null;
  } catch {
    return null;
  }
}

async function projectExists(projectId: string): Promise<boolean> {
  const result = await run(
    'firebase',
    ['projects:list'],
    { label: 'Checking existing projects', allowFailure: true },
  );
  return result.exitCode === 0 && result.stdout.includes(projectId);
}

async function waitForProject(projectId: string): Promise<void> {
  const maxAttempts = 12;
  const delayMs = 5_000;

  for (let i = 0; i < maxAttempts; i++) {
    if (await projectExists(projectId)) {
      logger.info('Firebase project is ready.');
      return;
    }

    if (i < maxAttempts - 1) {
      logger.info(`Waiting for project to be provisioned... (${i + 1}/${maxAttempts})`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  logger.fatal(`Firebase project "${projectId}" is not available after waiting ~60 s.`);
  logger.info('You can try again — the project may still be provisioning.');
  process.exit(1);
}

async function createOrFindApp(
  config: DerivedConfig,
  platform: 'ANDROID' | 'IOS',
  idFlag: string,
): Promise<FirebaseAppResult> {
  const platformLower = platform === 'ANDROID' ? 'android' : 'ios';
  const platformLabel = platform === 'ANDROID' ? 'Android' : 'iOS';
  const displayName = `${config.appName} (${platformLabel} App)`;

  // Check first if the app already exists
  const existingAppId = await findExistingApp(config.firebaseProject, platform, displayName);
  if (existingAppId) {
    logger.info(`${platformLabel} app already exists — App ID: ${existingAppId}`);
    return { appId: existingAppId, platform };
  }

  // App doesn't exist — create it
  const result = await run(
    'firebase',
    [
      'apps:create',
      platformLower,
      displayName,
      '--project',
      config.firebaseProject,
      idFlag,
      config.packageName,
    ],
    { label: `Creating Firebase ${platformLabel} app`, allowFailure: true },
  );

  if (result.exitCode === 0) {
    const appId = parseAppId(result.stdout);
    logger.info(`${platformLabel} App ID: ${appId}`);
    return { appId, platform };
  }

  const createError = (result.stderr || result.stdout).trim();
  logger.fatal(`Could not create ${platformLabel} app in project "${config.firebaseProject}"`);
  logger.error(createError);
  process.exit(1);
}

async function findExistingApp(
  project: string,
  platform: 'ANDROID' | 'IOS',
  displayName: string,
): Promise<string | null> {
  const result = await run(
    'firebase',
    ['apps:list', platform, '--project', project],
    { label: `Checking existing ${platform} apps`, allowFailure: true },
  );

  if (result.exitCode !== 0) {
    return null;
  }

  // Match by display name first
  // Table row: │ AppName (Android App) │ 1:123456:android:abc123 │ ANDROID │
  const appIdRegex = /\d+:\d+:\w+:\w+/;

  for (const line of result.stdout.split('\n')) {
    if (line.includes(displayName)) {
      const match = line.match(appIdRegex);
      if (match) return match[0];
    }
  }

  // Fallback: return first App ID found for this platform
  for (const line of result.stdout.split('\n')) {
    const match = line.match(appIdRegex);
    if (match) return match[0];
  }

  return null;
}

function parseAppId(output: string): string {
  const match = output.match(/App ID:\s*(\S+)/);
  if (!match?.[1]) {
    logger.fatal('Could not parse Firebase App ID from output');
    logger.error(output);
    process.exit(1);
  }
  return match[1];
}
