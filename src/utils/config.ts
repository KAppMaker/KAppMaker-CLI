import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import fs from 'fs-extra';
import type { KAppMakerConfig } from '../types/index.js';
import appStoreTemplate from '../templates/appstore-config.json' with { type: 'json' };
import adaptyTemplate from '../templates/adapty-config.json' with { type: 'json' };
import googlePlayTemplate from '../templates/googleplay-config.json' with { type: 'json' };
import revenueCatTemplate from '../templates/revenuecat-config.json' with { type: 'json' };

const CONFIG_DIR = path.join(os.homedir(), '.config', 'kappmaker');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const APPSTORE_DEFAULTS_FILE = path.join(CONFIG_DIR, 'appstore-defaults.json');
const ADAPTY_DEFAULTS_FILE = path.join(CONFIG_DIR, 'adapty-defaults.json');

const DEFAULT_CONFIG: KAppMakerConfig = {
  templateRepo: 'git@github.com:KAppMaker/KAppMaker-All.git',
  bundleIdPrefix: '',
  androidSdkPath: path.join(os.homedir(), 'Library', 'Android', 'sdk'),
  organization: '',
  falApiKey: '',
  imgbbApiKey: '',
  openaiApiKey: '',
  ascAuthName: 'KAppMaker',
  ascKeyId: '',
  ascIssuerId: '',
  ascPrivateKeyPath: '',
  appleId: '',
  googleServiceAccountPath: path.join(os.homedir(), 'credentials', 'google-service-app-publisher.json'),
  revenuecatApiKey: '',
  revenuecatProjectId: '',
};

export function getConfigDir(): string {
  return CONFIG_DIR;
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

export function getDefaultConfig(): KAppMakerConfig {
  return { ...DEFAULT_CONFIG };
}

export async function loadConfig(): Promise<KAppMakerConfig> {
  try {
    if (await fs.pathExists(CONFIG_FILE)) {
      const raw = await fs.readJson(CONFIG_FILE);
      return { ...DEFAULT_CONFIG, ...raw };
    }
  } catch {
    // Corrupt or unreadable config — fall back to defaults
  }
  return { ...DEFAULT_CONFIG };
}

export async function saveConfig(config: KAppMakerConfig): Promise<void> {
  await fs.ensureDir(CONFIG_DIR);
  await fs.writeJson(CONFIG_FILE, config, { spaces: 2 });
}

export async function getConfigValue(key: keyof KAppMakerConfig): Promise<string> {
  const config = await loadConfig();
  return config[key];
}

export async function setConfigValue(
  key: keyof KAppMakerConfig,
  value: string,
): Promise<void> {
  const config = await loadConfig();
  config[key] = value;
  await saveConfig(config);
}

export function isValidConfigKey(key: string): key is keyof KAppMakerConfig {
  return key in DEFAULT_CONFIG;
}

export function getConfigKeys(): (keyof KAppMakerConfig)[] {
  return Object.keys(DEFAULT_CONFIG) as (keyof KAppMakerConfig)[];
}

export function getAppStoreDefaultsPath(): string {
  return APPSTORE_DEFAULTS_FILE;
}

export function getAppStoreTemplate(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(appStoreTemplate));
}

export function getGooglePlayTemplate(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(googlePlayTemplate));
}

export async function loadAppStoreDefaults(): Promise<Record<string, unknown> | null> {
  try {
    if (await fs.pathExists(APPSTORE_DEFAULTS_FILE)) {
      return await fs.readJson(APPSTORE_DEFAULTS_FILE);
    }
  } catch {
    // Corrupt or unreadable — return null
  }
  return null;
}

export async function saveAppStoreDefaults(defaults: Record<string, unknown>): Promise<void> {
  await fs.ensureDir(CONFIG_DIR);
  await fs.writeJson(APPSTORE_DEFAULTS_FILE, defaults, { spaces: 2 });
}

// ── Adapty defaults ───────────────────────────────────────────────────

export function getAdaptyDefaultsPath(): string {
  return ADAPTY_DEFAULTS_FILE;
}

export function getAdaptyTemplate(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(adaptyTemplate));
}

export function getRevenueCatTemplate(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(revenueCatTemplate));
}

/**
 * The iOS-CI templates are YAML and Ruby, so they ship as files next to the
 * compiled output (see the build script's copy step) rather than JSON imports.
 */
function templateFile(name: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return fs.readFileSync(path.join(here, '..', 'templates', name), 'utf8');
}

export function getIosCiWorkflowTemplate(): string {
  return templateFile('ios-ci-workflow.yml');
}

export function getIosCiLaneTemplate(): string {
  return templateFile('ios-ci-lane.rb');
}

/**
 * fastlane match's decryption password, per app repo. It lives beside the
 * RevenueCat keys — owner-only, never in the project tree, because committing it
 * next to the certs repo URL would defeat the encryption entirely.
 */
export function getMatchPasswordsPath(): string {
  return path.join(CONFIG_DIR, 'match-passwords.json');
}

export async function loadMatchPasswords(): Promise<Record<string, string>> {
  try {
    const file = getMatchPasswordsPath();
    if (await fs.pathExists(file)) {
      return (await fs.readJson(file)) as Record<string, string>;
    }
  } catch {
    // Unreadable store — treat as empty; init will mint a new password.
  }
  return {};
}

export async function saveMatchPassword(repo: string, password: string): Promise<void> {
  await fs.ensureDir(CONFIG_DIR);
  const all = await loadMatchPasswords();
  all[repo] = password;
  await fs.writeJson(getMatchPasswordsPath(), all, { spaces: 2, mode: 0o600 });
}

/**
 * RevenueCat v2 secret keys are PROJECT-scoped — each app (= its own RevenueCat
 * project) has its own key, so a single global `revenuecatApiKey` only works
 * for a one-app account. Multi-app users get a per-app key map, keyed by
 * bundle ID, stored next to the main config with owner-only permissions.
 */
export function getRevenueCatKeysPath(): string {
  return path.join(CONFIG_DIR, 'revenuecat-keys.json');
}

export async function loadRevenueCatKeys(): Promise<Record<string, string>> {
  try {
    const file = getRevenueCatKeysPath();
    if (await fs.pathExists(file)) {
      return (await fs.readJson(file)) as Record<string, string>;
    }
  } catch {
    // Corrupt key file — treat as empty rather than crashing every command.
  }
  return {};
}

export async function saveRevenueCatKey(bundleId: string, apiKey: string): Promise<void> {
  await fs.ensureDir(CONFIG_DIR);
  const keys = await loadRevenueCatKeys();
  keys[bundleId] = apiKey;
  await fs.writeJson(getRevenueCatKeysPath(), keys, { spaces: 2, mode: 0o600 });
}

export async function loadAdaptyDefaults(): Promise<Record<string, unknown> | null> {
  try {
    if (await fs.pathExists(ADAPTY_DEFAULTS_FILE)) {
      return await fs.readJson(ADAPTY_DEFAULTS_FILE);
    }
  } catch {
    // Corrupt or unreadable — return null
  }
  return null;
}

export async function saveAdaptyDefaults(defaults: Record<string, unknown>): Promise<void> {
  await fs.ensureDir(CONFIG_DIR);
  await fs.writeJson(ADAPTY_DEFAULTS_FILE, defaults, { spaces: 2 });
}
