import { Command } from 'commander';
import { createApp } from './commands/create.js';
import { configList, configGet, configSet, configPath, configInit } from './commands/config.js';

export function createCli(): Command {
  const program = new Command();

  program
    .name('kappmaker')
    .description('CLI tool for bootstrapping KAppMaker mobile apps')
    .version('0.1.0');

  program
    .command('create')
    .description('Create a new KAppMaker app from template')
    .argument('<app-name>', 'Name of the app (PascalCase, e.g., Remimi)')
    .option('--template-repo <url>', 'Git URL of the template repository')
    .option('--organization <org>', 'Organization name for Fastlane signing')
    .action(async (appName: string, options) => {
      await createApp(appName, options);
    });

  const config = program
    .command('config')
    .description('Manage CLI configuration');

  config
    .command('list')
    .description('Show all config values')
    .action(async () => {
      await configList();
    });

  config
    .command('get')
    .description('Get a config value')
    .argument('<key>', 'Config key to read')
    .action(async (key: string) => {
      await configGet(key);
    });

  config
    .command('set')
    .description('Set a config value')
    .argument('<key>', 'Config key to set')
    .argument('<value>', 'Value to set')
    .action(async (key: string, value: string) => {
      await configSet(key, value);
    });

  config
    .command('path')
    .description('Show config file path')
    .action(async () => {
      await configPath();
    });

  config
    .command('init')
    .description('Interactively set up configuration')
    .action(async () => {
      await configInit();
    });

  return program;
}
