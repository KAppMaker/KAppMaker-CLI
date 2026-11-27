import chalk from 'chalk';
import { logger } from './logger.js';
import { errorMessage } from './errors.js';

export type StepStatus = 'ok' | 'failed' | 'skipped';

export interface StepRecord {
  name: string;
  status: StepStatus;
  detail?: string;
  required: boolean;
}

/**
 * Collects what each step of an orchestrator really did, so the run ends with
 * a summary that names every FAILED step and exits non-zero when a required
 * step failed. A step counts as ok only when its function returns without
 * throwing; functions are expected to read their result back and throw when it
 * does not match.
 */
export class StepReport {
  readonly records: StepRecord[] = [];

  constructor(readonly title: string) {}

  ok(name: string, detail?: string): void {
    this.records.push({ name, status: 'ok', detail, required: true });
  }

  skip(name: string, reason: string): void {
    this.records.push({ name, status: 'skipped', detail: reason, required: false });
  }

  fail(name: string, detail: string, required = true): void {
    this.records.push({ name, status: 'failed', detail, required });
    logger.error(`${name} FAILED: ${detail}`);
  }

  /**
   * Run one step. Returns the function's value, or undefined when it threw (the
   * step is then recorded as FAILED and the orchestrator carries on with the
   * steps that do not depend on it).
   */
  async run<T>(name: string, fn: () => Promise<T>, opts: { required?: boolean; detail?: (v: T) => string | undefined } = {}): Promise<T | undefined> {
    try {
      const value = await fn();
      this.records.push({ name, status: 'ok', detail: opts.detail?.(value), required: opts.required !== false });
      return value;
    } catch (error) {
      if (error instanceof Error && error.name === 'NeedsAnswerError') throw error;
      this.fail(name, errorMessage(error), opts.required !== false);
      return undefined;
    }
  }

  get failed(): StepRecord[] {
    return this.records.filter((r) => r.status === 'failed');
  }

  get requiredFailed(): StepRecord[] {
    return this.failed.filter((r) => r.required);
  }

  /** Print the summary. Sets process.exitCode = 1 when a required step failed. Returns true when none did. */
  print(): boolean {
    console.log('');
    console.log(chalk.bold(`  ${this.title}: summary`));
    for (const r of this.records) {
      const mark = r.status === 'ok' ? chalk.green('OK     ') : r.status === 'failed' ? chalk.red('FAILED ') : chalk.yellow('SKIPPED');
      const detail = r.detail ? chalk.gray(` (${firstLine(r.detail)})`) : '';
      console.log(`    ${mark} ${r.name}${detail}${r.status === 'failed' && !r.required ? chalk.gray(' [optional]') : ''}`);
    }
    const failed = this.requiredFailed;
    if (failed.length > 0) {
      console.log('');
      console.log(chalk.red.bold(`  ${failed.length} step(s) FAILED: ${failed.map((f) => f.name).join(', ')}`));
      console.log(chalk.gray('  Fix the cause shown above and run the command again (completed steps are idempotent).'));
      process.exitCode = 1;
      return false;
    }
    return true;
  }
}

function firstLine(text: string): string {
  const line = text.split('\n')[0];
  return line.length > 160 ? `${line.slice(0, 157)}...` : line;
}
