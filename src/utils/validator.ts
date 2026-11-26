import { execa } from 'execa';
import chalk from 'chalk';
import { logger } from './logger.js';
import { confirm } from './prompt.js';
import { checkTool, currentPlatform, installHint, toolById, type CheckResult } from './prereqs.js';

// Tools `kappmaker create` cannot run without. Only npm-installed ones are
// offered for automatic install: everything else needs sudo or a package
// manager the user should choose, so we print the exact line instead.
const REQUIRED_FOR_CREATE = ['git', 'firebase', 'bundler'] as const;
const AUTO_INSTALL = new Set(['firebase']);

async function tryInstall(id: string, result: CheckResult): Promise<boolean> {
  const tool = toolById(id);
  const command = installHint(tool, currentPlatform());
  console.log('');
  console.log(`    ${chalk.red('x')} ${chalk.bold(tool.name)} is not installed.`);

  if (!AUTO_INSTALL.has(id)) {
    console.log(`      Install it: ${chalk.cyan(command)}`);
    return false;
  }

  console.log(`      To install, this command will be run:`);
  console.log(`      ${chalk.cyan(command)}`);
  console.log('');
  if (!(await confirm(`      Install ${tool.name}?`))) {
    logger.warn(`Skipped installing ${tool.name}`);
    return false;
  }

  const [cmd, ...args] = command.split(' ');
  try {
    logger.info(`Running: ${command}`);
    await execa(cmd, args, { stdio: 'inherit' });
    const recheck = await checkTool(tool);
    if (recheck.status === 'missing') throw new Error('still not on PATH');
    logger.success(`${tool.name} installed successfully`);
    return true;
  } catch {
    logger.error(`Failed to install ${tool.name}${result.status === 'missing' ? '' : ` (${result.status})`}`);
    console.log(`      Try running manually: ${chalk.cyan(command)}`);
    return false;
  }
}

export async function validateDependencies(): Promise<void> {
  let hasFailure = false;

  for (const id of REQUIRED_FOR_CREATE) {
    const result = await checkTool(toolById(id));
    if (result.status === 'missing') {
      if (!(await tryInstall(id, result))) hasFailure = true;
    } else if (result.status === 'outdated') {
      logger.warn(`${result.name} ${result.version} is older than ${result.min}; some steps may fail.`);
      if (result.hint) console.log(`      Upgrade: ${chalk.cyan(result.hint)}`);
    }
  }

  if (hasFailure) {
    console.log('');
    logger.fatal('Some dependencies are missing. Please install them and try again (kappmaker doctor lists everything).');
    process.exit(1);
  }

  logger.success('All dependencies found');
}

export function validateAppName(name: string): void {
  if (!name || name.trim().length === 0) {
    logger.fatal('App name is required.');
    process.exit(1);
  }

  if (!/^[A-Z][a-zA-Z0-9]+$/.test(name)) {
    logger.fatal(
      'App name must start with an uppercase letter and contain only alphanumeric characters (e.g., "Remimi").',
    );
    process.exit(1);
  }
}
