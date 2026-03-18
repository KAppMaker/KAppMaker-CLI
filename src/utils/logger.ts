import chalk from 'chalk';

export const logger = {
  step(number: number, total: number, message: string): void {
    console.log(chalk.blue(`\n[${number}/${total}]`) + ` ${message}`);
  },

  success(message: string): void {
    console.log(chalk.green('  OK ') + message);
  },

  info(message: string): void {
    console.log(chalk.gray('  -- ') + message);
  },

  warn(message: string): void {
    console.log(chalk.yellow('  WARN ') + message);
  },

  error(message: string): void {
    console.error(chalk.red('  ERROR ') + message);
  },

  fatal(message: string): void {
    console.error(chalk.bgRed.white(' FATAL ') + ' ' + message);
  },

  banner(appName: string): void {
    console.log(chalk.bold.cyan('\n  KAppMaker CLI'));
    console.log(chalk.gray(`  Creating app: ${appName}\n`));
  },

  done(): void {
    console.log(chalk.green.bold('\n  Done! Your app is ready.\n'));
  },
};
