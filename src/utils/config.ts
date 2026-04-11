import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import type { KAppMakerConfig } from '../types/index.js';
import appStoreTemplate from '../templates/appstore-config.json' with { type: 'json' };
import adaptyTemplate from '../templates/adapty-config.json' with { type: 'json' };
import googlePlayTemplate from '../templates/googleplay-config.json' with { type: 'json' };

const CONFIG_DIR = path.join(os.homedir(), '.config', 'kappmaker');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const APPSTORE_DEFAULTS_FILE = path.join(CONFIG_DIR, 'appstore-defaults.json');
const ADAPTY_DEFAULTS_FILE = path.join(CONFIG_DIR, 'adapty-defaults.json');

const DEFAULT_CONFIG: KAppMakerConfig = {
  templateRepo: 'git@github.com:KAppMaker/KAppMaker-MobileAppAndWeb.git',
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
