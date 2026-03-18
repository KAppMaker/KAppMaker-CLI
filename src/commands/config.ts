import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import {
  loadConfig,
  saveConfig,
  getConfigPath,
  getConfigValue,
  setConfigValue,
  isValidConfigKey,
  getConfigKeys,
  getDefaultConfig,
} from '../utils/config.js';
import { promptInput } from '../utils/prompt.js';

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

const PROMPTS: Record<string, string> = {
  templateRepo: 'Template repository URL',
  bundleIdPrefix: 'Bundle/App ID prefix (e.g., com.measify — leave empty to use com.<appname>)',
  androidSdkPath: 'Android SDK path',
  organization: 'Organization (leave empty to use app name for keystore)',
  falApiKey: 'fal.ai API key (optional, for screenshot translation)',
  openaiApiKey: 'OpenAI API key (optional, for ASO metadata)',
};

export async function configInit(): Promise<void> {
  console.log(chalk.bold('\n  KAppMaker Config Setup\n'));
  console.log(chalk.gray('  Press Enter to keep the default value.\n'));

  const config = await loadConfig();
  const defaults = getDefaultConfig();

  for (const key of getConfigKeys()) {
    const current = config[key] || defaults[key];
    const label = PROMPTS[key] ?? key;
    const hint = current ? ` (${chalk.gray(current)})` : '';
    const answer = await promptInput(`  ${label}${hint}: `);
    config[key] = answer || current;
  }

  await saveConfig(config);
  console.log('');
  logger.success(`Config saved to ${getConfigPath()}`);
}
