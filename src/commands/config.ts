import chalk from 'chalk';
import os from 'node:os';
import { logger } from '../utils/logger.js';
import fs from 'fs-extra';
import path from 'node:path';
import {
  loadConfig,
  saveConfig,
  getConfigPath,
  getConfigDir,
  getConfigValue,
  setConfigValue,
  isValidConfigKey,
  getConfigKeys,
  getDefaultConfig,
  getAppStoreDefaultsPath,
  getAppStoreTemplate,
  loadAppStoreDefaults,
  saveAppStoreDefaults,
  getAdaptyDefaultsPath,
  loadAdaptyDefaults,
  saveAdaptyDefaults,
} from '../utils/config.js';
import { promptInput, confirm } from '../utils/prompt.js';
import type { AppStoreConfig } from '../types/appstore.js';

export async function configList(): Promise<void> {
  const config = await loadConfig();
  console.log(chalk.bold('\n  KAppMaker Config\n'));
  console.log(`  ${chalk.gray('Path:')} ${getConfigPath()}\n`);
  for (const [key, value] of Object.entries(config)) {
    const display = value || chalk.gray('(not set)');
    console.log(`  ${chalk.cyan(key)}: ${display}`);
  }
  console.log('');
}

export async function configGet(key: string): Promise<void> {
  if (!isValidConfigKey(key)) {
    logger.error(`Unknown config key: ${key}`);
    logger.info(`Valid keys: ${getConfigKeys().join(', ')}`);
    process.exit(1);
  }
  const value = await getConfigValue(key);
  console.log(value || '');
}

export async function configSet(key: string, value: string): Promise<void> {
  if (!isValidConfigKey(key)) {
    logger.error(`Unknown config key: ${key}`);
    logger.info(`Valid keys: ${getConfigKeys().join(', ')}`);
    process.exit(1);
  }
  await setConfigValue(key, value);
  logger.success(`${key} = ${value}`);
}

export async function configPath(): Promise<void> {
  console.log(getConfigPath());
}

// Keys prompted during `config init` (ASC keys are handled by `config appstore-key`)
const INIT_KEYS = ['templateRepo', 'bundleIdPrefix', 'androidSdkPath', 'organization', 'falApiKey', 'openaiApiKey'] as const;

const PROMPTS: Record<string, string> = {
  templateRepo: 'Template repository URL',
  bundleIdPrefix: 'Bundle/App ID prefix (e.g., com.measify — leave empty to use com.<appname>)',
  androidSdkPath: 'Android SDK path',
  organization: 'Organization (leave empty to use app name for keystore)',
  falApiKey: 'fal.ai API key (optional, for logo generation)',
  openaiApiKey: 'OpenAI API key (optional, for screenshot generation & ASO metadata)',
  ascKeyId: 'App Store Connect API Key ID',
  ascIssuerId: 'App Store Connect Issuer ID',
  ascPrivateKeyPath: 'Path to .p8 private key file',
};

export async function configInit(): Promise<void> {
  console.log(chalk.bold('\n  KAppMaker Config Setup\n'));
  console.log(chalk.gray('  Press Enter to keep the default value.\n'));

  const config = await loadConfig();
  const defaults = getDefaultConfig();

  for (const key of INIT_KEYS) {
    const current = config[key] || defaults[key];
    const label = PROMPTS[key] ?? key;
    const hint = current ? ` (${chalk.gray(current)})` : '';
    const answer = await promptInput(`  ${label}${hint}: `);
    config[key] = answer || current;
  }

  await saveConfig(config);
  console.log('');
  logger.success(`Config saved to ${getConfigPath()}`);

  // Offer to initialize App Store defaults if not already set
  const defaultsPath = getAppStoreDefaultsPath();
  const existingDefaults = await loadAppStoreDefaults();
  if (!existingDefaults) {
    console.log('');
    const setupAppStore = await confirm('  Initialize global App Store defaults? (review contact, privacy, encryption, etc.)');
    if (setupAppStore) {
      await initAppStoreDefaults();
    }
  } else {
    console.log(chalk.gray(`\n  App Store defaults already exist at ${defaultsPath}`));
    console.log(chalk.gray('  Edit directly or re-save with: kappmaker config appstore-defaults --save <file>\n'));
  }
}

async function initAppStoreDefaults(): Promise<void> {
  const existing = await loadAppStoreDefaults() as unknown as AppStoreConfig | null;
  const template: AppStoreConfig = existing ?? getAppStoreTemplate() as unknown as AppStoreConfig;
  const config = await loadConfig();

  console.log(chalk.bold('\n  App Store Defaults Setup\n'));
  console.log(chalk.gray('  Press Enter to keep the current value.\n'));

  // ── API Key ──────────────────────────────────────────────────────
  console.log(chalk.bold('  App Store Connect API Key\n'));

  const curAuthName = config.ascAuthName || 'KAppMaker';
  const authNameHint = ` (${chalk.gray(curAuthName)})`;
  const authName = await promptInput(`  Auth name (stored in keychain)${authNameHint}: `);
  if (authName) config.ascAuthName = authName;

  const curKeyId = config.ascKeyId || '';
  const keyIdHint = curKeyId ? ` (${chalk.gray(curKeyId)})` : '';
  const keyId = await promptInput(`  Key ID${keyIdHint}: `);
  if (keyId) config.ascKeyId = keyId;

  const curIssuerId = config.ascIssuerId || '';
  const issuerIdHint = curIssuerId ? ` (${chalk.gray(curIssuerId)})` : '';
  const issuerId = await promptInput(`  Issuer ID${issuerIdHint}: `);
  if (issuerId) config.ascIssuerId = issuerId;

  const curKeyPath = config.ascPrivateKeyPath || '';
  const keyPathHint = curKeyPath ? ` (${chalk.gray(curKeyPath)})` : '';
  const keyPath = await promptInput(`  Path to .p8 file${keyPathHint}: `);
  if (keyPath) {
    config.ascPrivateKeyPath = await copyKeyToConfigDir(keyPath);
  }

  const curAppleId = config.appleId || '';
  const appleIdHint = curAppleId ? ` (${chalk.gray(curAppleId)})` : '';
  const appleId = await promptInput(`  Apple ID email (for app creation & privacy)${appleIdHint}: `);
  if (appleId) config.appleId = appleId;

  await saveConfig(config);

  // ── Copyright ────────────────────────────────────────────────────
  console.log(chalk.bold('\n  App Defaults\n'));

  const curCopyright = template.version?.copyright || '';
  const copyrightHint = curCopyright ? ` (${chalk.gray(curCopyright)})` : '';
  const copyright = await promptInput(`  Copyright (e.g., 2026 YourCompany)${copyrightHint}: `);
  if (copyright) template.version.copyright = copyright;

  // ── Review Contact ───────────────────────────────────────────────
  console.log(chalk.bold('\n  App Review Contact\n'));

  const curFirst = template.review_info?.contact_first_name || '';
  const firstHint = curFirst ? ` (${chalk.gray(curFirst)})` : '';
  const firstName = await promptInput(`  First name${firstHint}: `);
  if (firstName) template.review_info.contact_first_name = firstName;

  const curLast = template.review_info?.contact_last_name || '';
  const lastHint = curLast ? ` (${chalk.gray(curLast)})` : '';
  const lastName = await promptInput(`  Last name${lastHint}: `);
  if (lastName) template.review_info.contact_last_name = lastName;

  const curEmail = template.review_info?.contact_email || '';
  const emailHint = curEmail ? ` (${chalk.gray(curEmail)})` : '';
  const email = await promptInput(`  Email${emailHint}: `);
  if (email) template.review_info.contact_email = email;

  const curPhone = template.review_info?.contact_phone || '';
  const phoneHint = curPhone ? ` (${chalk.gray(curPhone)})` : '';
  const phone = await promptInput(`  Phone${phoneHint}: `);
  if (phone) template.review_info.contact_phone = phone;

  await saveAppStoreDefaults(template as unknown as Record<string, unknown>);
  const defaultsPath = getAppStoreDefaultsPath();
  console.log('');
  logger.success(`App Store defaults saved to ${defaultsPath}`);
  if (config.ascKeyId) {
    logger.success(`API key configured (Key ID: ${config.ascKeyId})`);
  }
  console.log(chalk.gray('  Edit the defaults file directly to customize privacy, age rating, subscriptions, etc.\n'));
}

export async function configAppStoreDefaults(options: { save?: string; init?: boolean }): Promise<void> {
  const defaultsPath = getAppStoreDefaultsPath();

  if (options.init) {
    await initAppStoreDefaults();
    return;
  }

  if (options.save) {
    const sourcePath = options.save;
    if (!(await fs.pathExists(sourcePath))) {
      logger.error(`File not found: ${sourcePath}`);
      process.exit(1);
    }
    const json = await fs.readJson(sourcePath);
    await saveAppStoreDefaults(json);
    logger.success(`App Store defaults saved to ${defaultsPath}`);
    return;
  }

  // Show current defaults
  const defaults = await loadAppStoreDefaults();
  if (!defaults) {
    console.log(chalk.bold('\n  No global App Store defaults found.\n'));
    console.log(chalk.gray('  Save defaults from an existing config file:'));
    console.log(`  ${chalk.cyan('kappmaker config appstore-defaults --save ./appstore-config.json')}\n`);
    console.log(chalk.gray('  Or the built-in template is used as the starting point.'));
    console.log(chalk.gray(`  Defaults path: ${defaultsPath}\n`));
    return;
  }

  console.log(chalk.bold('\n  Global App Store Defaults\n'));
  console.log(`  ${chalk.gray('Path:')} ${defaultsPath}\n`);
  console.log(JSON.stringify(defaults, null, 2));
  console.log('');
}

export async function configAdaptyDefaults(options: { save?: string }): Promise<void> {
  const defaultsPath = getAdaptyDefaultsPath();

  if (options.save) {
    const sourcePath = options.save;
    if (!(await fs.pathExists(sourcePath))) {
      logger.error(`File not found: ${sourcePath}`);
      process.exit(1);
    }
    const json = await fs.readJson(sourcePath);
    await saveAdaptyDefaults(json);
    logger.success(`Adapty defaults saved to ${defaultsPath}`);
    return;
  }

  // Show current defaults
  const defaults = await loadAdaptyDefaults();
  if (!defaults) {
    console.log(chalk.bold('\n  No global Adapty defaults found.\n'));
    console.log(chalk.gray('  Save defaults from an existing config file:'));
    console.log(`  ${chalk.cyan('kappmaker config adapty-defaults --save ./adapty-config.json')}\n`);
    console.log(chalk.gray(`  Defaults path: ${defaultsPath}\n`));
    return;
  }

  console.log(chalk.bold('\n  Global Adapty Defaults\n'));
  console.log(`  ${chalk.gray('Path:')} ${defaultsPath}\n`);
  console.log(JSON.stringify(defaults, null, 2));
  console.log('');
}

async function copyKeyToConfigDir(sourcePath: string): Promise<string> {
  const expanded = sourcePath.startsWith('~') ? path.join(os.homedir(), sourcePath.slice(1)) : sourcePath;
  const resolvedSource = path.resolve(expanded);
  if (!(await fs.pathExists(resolvedSource))) {
    logger.fatal(`File not found: ${resolvedSource}`);
    process.exit(1);
  }

  const configDir = getConfigDir();
  const fileName = path.basename(resolvedSource);
  const destPath = path.join(configDir, fileName);

  await fs.ensureDir(configDir);
  await fs.copy(resolvedSource, destPath);
  await fs.chmod(destPath, 0o600);
  logger.info(`Copied ${fileName} to ${configDir}`);
  return destPath;
}
