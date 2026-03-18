import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import type { KAppMakerConfig } from '../types/index.js';

const CONFIG_DIR = path.join(os.homedir(), '.config', 'kappmaker');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG: KAppMakerConfig = {
  templateRepo: 'git@github.com:KAppMaker/KAppMaker-MobileAppAndWeb.git',
  bundleIdPrefix: '',
  androidSdkPath: path.join(os.homedir(), 'Library', 'Android', 'sdk'),
  organization: '',
  falApiKey: '',
  openaiApiKey: '',
};

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
