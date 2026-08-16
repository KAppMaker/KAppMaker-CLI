import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { logger } from '../utils/logger.js';

const run = promisify(execFile);

/**
 * Thin wrapper over the `gh` CLI. Everything here runs against the repo in the
 * current working directory and uses the user's own `gh` auth — kappmaker never
 * holds a GitHub token of its own.
 */

export const WORKFLOW_FILE = 'ios-release.yml';

async function gh(args: string[], cwd?: string): Promise<string> {
  const { stdout } = await run('gh', args, { cwd, maxBuffer: 10 * 1024 * 1024 });
  return stdout.trim();
}

export async function validateGhInstalled(): Promise<void> {
  try {
    await run('gh', ['--version']);
  } catch {
    logger.fatal('GitHub CLI (`gh`) is not installed.');
    logger.info('Install it: https://cli.github.com  (macOS: brew install gh, Linux: see docs)');
    process.exit(1);
  }
}

export async function validateGhAuth(): Promise<void> {
  try {
    await run('gh', ['auth', 'status']);
  } catch {
    logger.fatal('GitHub CLI is not logged in.');
    logger.info('Run: gh auth login');
    process.exit(1);
  }
}

/** "owner/repo" for the repo in `cwd`, or null when there is no GitHub remote. */
export async function currentRepo(cwd?: string): Promise<string | null> {
  try {
    return await gh(['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'], cwd);
  } catch {
    return null;
  }
}

export async function repoIsPrivate(repo: string): Promise<boolean> {
  try {
    return (await gh(['repo', 'view', repo, '--json', 'isPrivate', '-q', '.isPrivate'])) === 'true';
  } catch {
    return false;
  }
}

export async function repoExists(repo: string): Promise<boolean> {
  try {
    await gh(['repo', 'view', repo, '--json', 'name']);
    return true;
  } catch {
    return false;
  }
}

/** Create a PRIVATE repo. Signing certificates live here — never public. */
export async function createPrivateRepo(repo: string, description: string): Promise<void> {
  await gh(['repo', 'create', repo, '--private', '--description', description]);
}

/**
 * Set a repo secret. The value goes in on stdin rather than argv so it never
 * lands in the process list or a shell history.
 *
 * `gh secret set` reads stdin when `--body` is omitted — there is NO --body-file
 * flag (it exists on `gh release`/`gh pr`, not here), and passing one makes gh
 * exit with "unknown flag" before writing anything.
 */
export async function setSecret(repo: string, name: string, value: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = execFile(
      'gh',
      ['secret', 'set', name, '--repo', repo],
      (error, _stdout, stderr) => (error ? reject(new Error(`${error.message}${stderr ? `\n${stderr}` : ''}`)) : resolve()),
    );
    child.stdin?.end(value);
  });
}

export async function listSecretNames(repo: string): Promise<string[]> {
  try {
    const out = await gh(['secret', 'list', '--repo', repo, '--json', 'name', '-q', '.[].name']);
    return out ? out.split('\n').filter(Boolean) : [];
  } catch {
    return [];
  }
}

export async function triggerWorkflow(
  repo: string,
  inputs: Record<string, string>,
  ref?: string,
): Promise<void> {
  const args = ['workflow', 'run', WORKFLOW_FILE, '--repo', repo];
  if (ref) args.push('--ref', ref);
  for (const [key, value] of Object.entries(inputs)) args.push('-f', `${key}=${value}`);
  await gh(args);
}

export interface WorkflowRun {
  databaseId: number;
  status: string;
  conclusion: string | null;
  createdAt: string;
  url: string;
  displayTitle: string;
}

export async function latestRuns(repo: string, limit = 5): Promise<WorkflowRun[]> {
  try {
    const out = await gh([
      'run', 'list', '--repo', repo, '--workflow', WORKFLOW_FILE, '--limit', String(limit),
      '--json', 'databaseId,status,conclusion,createdAt,url,displayTitle',
    ]);
    return JSON.parse(out) as WorkflowRun[];
  } catch {
    return [];
  }
}

/** The step that failed, for a run that failed. Empty string when unavailable. */
export async function failedStep(repo: string, runId: number): Promise<string> {
  try {
    const out = await gh([
      'run', 'view', String(runId), '--repo', repo,
      '--json', 'jobs', '-q',
      '.jobs[].steps[] | select(.conclusion=="failure") | .name',
    ]);
    return out.split('\n').filter(Boolean)[0] ?? '';
  } catch {
    return '';
  }
}

export async function currentBranch(cwd?: string): Promise<string | null> {
  try {
    const { stdout } = await run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}
