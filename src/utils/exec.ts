import { execa } from 'execa';
import ora from 'ora';
import { logger } from './logger.js';

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function wasSignaled(result: { signal?: string; killed?: boolean }): boolean {
  return result.signal === 'SIGINT' || result.signal === 'SIGTERM' || result.killed === true;
}

export async function run(
  command: string,
  args: string[],
  options?: {
    cwd?: string;
    label?: string;
    allowFailure?: boolean;
    timeout?: number;
    env?: Record<string, string>;
  },
): Promise<ExecResult> {
  const label = options?.label ?? `${command} ${args.join(' ')}`;
  const spinner = ora({ text: label, indent: 4 }).start();

  try {
    const result = await execa(command, args, {
      cwd: options?.cwd,
      reject: false,
      timeout: options?.timeout ?? 10 * 60_000,
      env: options?.env ? { ...process.env, ...options.env } : undefined,
    });

    if (wasSignaled(result)) {
      spinner.stop();
      process.exit(130);
    }

    if (result.exitCode !== 0 && !options?.allowFailure) {
      spinner.fail(label);
      if (result.stderr) logger.error(result.stderr);
      if (result.stdout) logger.error(result.stdout);
      process.exit(1);
    }

    spinner.succeed(label);
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode ?? 0,
    };
  } catch (error) {
    spinner.fail(label);
    const message = error instanceof Error ? error.message : String(error);
    logger.error(message);
    process.exit(1);
  }
}

export async function runStreaming(
  command: string,
  args: string[],
  options?: { cwd?: string; label?: string; allowFailure?: boolean },
): Promise<number> {
  if (options?.label) {
    logger.info(options.label);
  }

  const result = await execa(command, args, {
    cwd: options?.cwd,
    stdio: 'inherit',
    reject: false,
  });

  if (wasSignaled(result)) {
    process.exit(130);
  }

  const exitCode = result.exitCode ?? 1;

  if (exitCode !== 0 && !options?.allowFailure) {
    logger.error(`Command failed: ${command} ${args.join(' ')}`);
    process.exit(1);
  }

  return exitCode;
}
