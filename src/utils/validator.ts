import { execa } from 'execa';
import chalk from 'chalk';
import { logger } from './logger.js';
import { confirm } from './prompt.js';

interface Dependency {
  command: string;
  versionArg: string;
  name: string;
  installCommand: string;
  canAutoInstall: boolean;
}

const REQUIRED_DEPS: Dependency[] = [
  {
    command: 'git',
    versionArg: '--version',
    name: 'Git',
    installCommand: 'xcode-select --install',
    canAutoInstall: false,
  },
  {
    command: 'firebase',
    versionArg: '--version',
    name: 'Firebase CLI',
    installCommand: 'npm install -g firebase-tools',
    canAutoInstall: true,
  },
  {
    command: 'pod',
    versionArg: '--version',
    name: 'CocoaPods',
    installCommand: 'sudo gem install cocoapods',
    canAutoInstall: true,
  },
  {
    command: 'bundle',
    versionArg: '--version',
    name: 'Bundler (for Fastlane)',
    installCommand: 'gem install bundler',
    canAutoInstall: true,
  },
];

async function tryInstall(dep: Dependency): Promise<boolean> {
  console.log('');
  console.log(`    ${chalk.red('x')} ${chalk.bold(dep.name)} is not installed.`);

  if (!dep.canAutoInstall) {
    console.log(`      Please install it manually: ${chalk.cyan(dep.installCommand)}`);
    return false;
  }

  console.log(`      To install, this command will be run:`);
  console.log(`      ${chalk.cyan(dep.installCommand)}`);
  console.log('');

  const shouldInstall = await confirm(`      Install ${dep.name}?`);
  if (!shouldInstall) {
    logger.warn(`Skipped installing ${dep.name}`);
    return false;
  }

  const [cmd, ...args] = dep.installCommand.split(' ');
  try {
    logger.info(`Running: ${dep.installCommand}`);
    await execa(cmd, args, { stdio: 'inherit' });
    logger.success(`${dep.name} installed successfully`);
    return true;
  } catch {
    logger.error(`Failed to install ${dep.name}`);
    console.log(`      Try running manually: ${chalk.cyan(dep.installCommand)}`);
    return false;
  }
}

export async function validateDependencies(): Promise<void> {
  let hasFailure = false;

  for (const dep of REQUIRED_DEPS) {
    try {
      await execa(dep.command, [dep.versionArg]);
    } catch {
      const installed = await tryInstall(dep);
      if (!installed) {
        hasFailure = true;
      }
    }
  }

  if (hasFailure) {
    console.log('');
    logger.fatal('Some dependencies are missing. Please install them and try again.');
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
