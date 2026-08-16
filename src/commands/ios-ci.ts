import path from 'node:path';
import { randomBytes } from 'node:crypto';
import fs from 'fs-extra';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { confirm } from '../utils/prompt.js';
import { loadConfig, getIosCiWorkflowTemplate, getIosCiLaneTemplate } from '../utils/config.js';
import { resolveMobileDir } from '../services/version.service.js';
import * as gha from '../services/github-actions.service.js';
import type { IosCiConfig, IosCiInitOptions, IosCiBuildOptions } from '../types/ios-ci.js';

const CONFIG_FILENAME = 'Assets/ios-ci-config.json';
const WORKFLOW_PATH = `.github/workflows/${gha.WORKFLOW_FILE}`;
const LANE_MARKER = '<kappmaker-ci-lane>';
const INIT_STEPS = 6;

/** Secrets the workflow reads. Init is not finished until all of these exist. */
export const REQUIRED_SECRETS = [
  'ASC_KEY_ID',
  'ASC_ISSUER_ID',
  'ASC_PRIVATE_KEY',
  'MATCH_PASSWORD',
  'MATCH_GIT_URL',
  'MATCH_GIT_BASIC_AUTHORIZATION',
] as const;

/** `<owner>/<app>-certs` from the app repo — certs live beside the app, privately. */
export function defaultCertsRepo(repo: string): string {
  const [owner, name] = repo.split('/');
  return `${owner}/${name}-certs`;
}

/** Repo path relative to the git root, with forward slashes for the YAML. */
export function relativeMobileDir(repoRoot: string, mobileDir: string): string {
  const rel = path.relative(repoRoot, mobileDir).split(path.sep).join('/');
  return rel === '' ? '.' : rel;
}

/**
 * `match` decrypts the certs repo with this password. It is generated once and
 * kept in GitHub secrets + the local per-app store — losing it means the stored
 * certificates can never be decrypted again and the repo has to be reset.
 */
export function generateMatchPassword(): string {
  return randomBytes(24).toString('base64url');
}

function readBundleIdFromPbxproj(mobileDir: string): string | null {
  const pbx = path.join(mobileDir, 'iosApp', 'iosApp.xcodeproj', 'project.pbxproj');
  try {
    const raw = fs.readFileSync(pbx, 'utf8');
    const match = /PRODUCT_BUNDLE_IDENTIFIER\s*=\s*([A-Za-z0-9._-]+);/.exec(raw);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

async function gitRoot(cwd: string): Promise<string> {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const run = promisify(execFile);
  try {
    const { stdout } = await run('git', ['rev-parse', '--show-toplevel'], { cwd });
    return stdout.trim();
  } catch {
    return cwd;
  }
}

// ---------------------------------------------------------------------- init

export async function iosCiInit(options: IosCiInitOptions): Promise<void> {
  logger.step(1, INIT_STEPS, 'Checking prerequisites');
  // A dry run only writes files locally, so it must work without gh auth —
  // that is the whole point of being able to preview the pipeline first.
  if (!options.dryRun) {
    await gha.validateGhInstalled();
    await gha.validateGhAuth();
  }

  const mobileDir = options.mobileDir ? path.resolve(options.mobileDir) : resolveMobileDir();
  const root = await gitRoot(mobileDir);
  const relMobile = relativeMobileDir(root, mobileDir);

  const repo = options.repo ?? (options.dryRun ? null : await gha.currentRepo(root));
  if (!repo) {
    if (options.dryRun) {
      logger.fatal('A dry run needs --repo <owner/name> (it does not query GitHub).');
      process.exit(1);
    }
    logger.fatal('No GitHub repository found for this project.');
    logger.info('Create or connect one first (e.g. `gh repo create`), or pass --repo <owner/name>.');
    process.exit(1);
  }

  const bundleId = readBundleIdFromPbxproj(mobileDir);
  if (!bundleId) {
    logger.fatal('Could not read PRODUCT_BUNDLE_IDENTIFIER from the Xcode project.');
    logger.info(`Looked in ${path.join(relMobile, 'iosApp/iosApp.xcodeproj/project.pbxproj')}.`);
    process.exit(1);
  }

  const userConfig = await loadConfig();
  const missing = (['ascKeyId', 'ascIssuerId', 'ascPrivateKeyPath'] as const).filter(
    (key) => !userConfig[key],
  );
  if (missing.length > 0) {
    logger.fatal(`App Store Connect credentials missing: ${missing.join(', ')}`);
    logger.info('Set them with `kappmaker config set <key> <value>` — the same key you use for');
    logger.info('`kappmaker create-appstore-app`. Get one at App Store Connect → Users and Access →');
    logger.info('Integrations → App Store Connect API.');
    process.exit(1);
  }

  const keyPath = userConfig.ascPrivateKeyPath;
  if (!(await fs.pathExists(keyPath))) {
    logger.fatal(`App Store Connect private key not found at ${keyPath}`);
    process.exit(1);
  }

  logger.info(`Repo:       ${repo}`);
  logger.info(`App dir:    ${relMobile}`);
  logger.info(`Bundle ID:  ${bundleId}`);

  if (!options.dryRun && !(await gha.repoIsPrivate(repo))) {
    logger.warn(`${repo} is PUBLIC. Secrets stay private, but anyone can read your source and build logs.`);
  }

  // ---- certificates repo
  logger.step(2, INIT_STEPS, 'Setting up the signing-certificate repo');
  const certsRepo = options.certsRepo ?? defaultCertsRepo(repo);
  if (options.dryRun) {
    logger.info(`(dry run) would ensure ${certsRepo} exists and is private`);
  } else if (await gha.repoExists(certsRepo)) {
    logger.info(`Using existing ${certsRepo}`);
    if (!(await gha.repoIsPrivate(certsRepo))) {
      logger.fatal(`${certsRepo} is PUBLIC. It holds your signing certificates — refusing to continue.`);
      logger.info('Make it private in GitHub settings, then re-run.');
      process.exit(1);
    }
  } else {
    await gha.createPrivateRepo(certsRepo, `Signing certificates for ${repo} (managed by fastlane match)`);
    logger.success(`Created private repo ${certsRepo}`);
  }

  // ---- match password
  logger.step(3, INIT_STEPS, 'Resolving the certificate password');
  const keyStore = await import('../utils/config.js');
  const stored = await keyStore.loadMatchPasswords();
  let matchPassword = options.matchPassword ?? stored[repo];
  let generated = false;
  if (!matchPassword) {
    matchPassword = generateMatchPassword();
    generated = true;
  }
  if (!options.dryRun) {
    await keyStore.saveMatchPassword(repo, matchPassword);
  }

  // ---- secrets
  logger.step(4, INIT_STEPS, 'Pushing secrets to GitHub');
  const privateKey = await fs.readFile(keyPath);
  const ghToken = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? '';
  const values: Record<string, string> = {
    ASC_KEY_ID: userConfig.ascKeyId,
    ASC_ISSUER_ID: userConfig.ascIssuerId,
    // base64 so the multi-line .p8 survives being an env var
    ASC_PRIVATE_KEY: privateKey.toString('base64'),
    MATCH_PASSWORD: matchPassword,
    MATCH_GIT_URL: `https://github.com/${certsRepo}.git`,
    MATCH_GIT_BASIC_AUTHORIZATION: '',
  };

  // match clones the certs repo over HTTPS on the runner, so it needs a token
  // that can read it. GITHUB_TOKEN is scoped to the app repo only, so a PAT is
  // required — ask rather than silently producing a workflow that 404s.
  if (ghToken) {
    values.MATCH_GIT_BASIC_AUTHORIZATION = Buffer.from(`x-access-token:${ghToken}`).toString('base64');
  } else {
    delete values.MATCH_GIT_BASIC_AUTHORIZATION;
  }

  if (options.dryRun) {
    logger.info(`(dry run) would set: ${Object.keys(values).join(', ')}`);
  } else {
    for (const [name, value] of Object.entries(values)) {
      await gha.setSecret(repo, name, value);
      logger.success(`secret ${name}`);
    }
  }

  // ---- workflow + lane
  logger.step(5, INIT_STEPS, 'Writing the workflow and fastlane lane');
  const workflow = getIosCiWorkflowTemplate().replace(/__MOBILE_DIR__/g, relMobile);
  const workflowPath = path.join(root, WORKFLOW_PATH);
  await fs.ensureDir(path.dirname(workflowPath));
  await fs.writeFile(workflowPath, workflow);
  logger.success(WORKFLOW_PATH);

  const fastfilePath = path.join(mobileDir, 'fastlane', 'Fastfile');
  if (!(await fs.pathExists(fastfilePath))) {
    logger.warn('No fastlane/Fastfile yet — run `kappmaker fastlane configure` first, then re-run this.');
  } else {
    const fastfile = await fs.readFile(fastfilePath, 'utf8');
    if (fastfile.includes(LANE_MARKER)) {
      logger.info('CI lane already present in the Fastfile.');
    } else {
      await fs.writeFile(fastfilePath, appendCiLane(fastfile, getIosCiLaneTemplate()));
      logger.success('Added the ci_appstore_release lane to fastlane/Fastfile');
    }
  }

  const config: IosCiConfig = {
    provider: 'github',
    repo,
    certs_repo: certsRepo,
    mobile_dir: relMobile,
    bundle_id: bundleId,
    secrets_configured: !options.dryRun && !!values.MATCH_GIT_BASIC_AUTHORIZATION,
  };
  const configPath = path.resolve(CONFIG_FILENAME);
  await fs.ensureDir(path.dirname(configPath));
  await fs.writeJson(configPath, config, { spaces: 2 });
  logger.success(CONFIG_FILENAME);

  // ---- what the human still has to do
  logger.step(6, INIT_STEPS, 'Remaining manual steps');
  printInitChecklist({
    repo,
    certsRepo,
    // Don't hand out a password on a dry run: nothing was stored, and a fresh
    // one is minted on the real run — saving this one would mislead.
    matchPassword: generated && !options.dryRun ? matchPassword : null,
    needsToken: !values.MATCH_GIT_BASIC_AUTHORIZATION,
    workflowPath: WORKFLOW_PATH,
    dryRun: options.dryRun === true,
  });
  logger.done();
}

/**
 * Insert the CI lane at the end of the `platform :ios do` block. Falls back to
 * appending at EOF when that block can't be found, which still parses — fastlane
 * just treats it as a top-level lane.
 */
export function appendCiLane(fastfile: string, lane: string): string {
  const platformIndex = fastfile.indexOf('platform :ios do');
  if (platformIndex === -1) return `${fastfile.trimEnd()}\n\n${lane}\n`;

  // Find the `end` that closes the ios platform block: the last line that is
  // exactly "end" at column 0 after the platform declaration.
  const after = fastfile.slice(platformIndex);
  const match = /\nend\s*$/.exec(after) ?? /\nend\n/.exec(after);
  if (!match) return `${fastfile.trimEnd()}\n\n${lane}\n`;

  const insertAt = platformIndex + match.index + 1;
  return `${fastfile.slice(0, insertAt)}\n${lane}\n${fastfile.slice(insertAt)}`;
}

function printInitChecklist(info: {
  repo: string;
  certsRepo: string;
  matchPassword: string | null;
  needsToken: boolean;
  workflowPath: string;
  dryRun: boolean;
}): void {
  console.log('');
  if (info.dryRun) {
    console.log(chalk.yellow('  Dry run — nothing was created on GitHub and no secrets were set.'));
    console.log(chalk.gray('  Re-run without --dry-run to apply.'));
    console.log('');
  }
  if (info.matchPassword) {
    console.log(chalk.bold('  Save this certificate password somewhere safe:'));
    console.log(`    ${chalk.cyan(info.matchPassword)}`);
    console.log(chalk.gray('    It decrypts your signing certificates. Lose it and the certs repo must be reset.'));
    console.log(chalk.gray('    (Already stored in your GitHub secrets and this machine.)'));
    console.log('');
  }
  console.log(chalk.bold('  Before the first build:'));
  console.log('');
  console.log(`    ${chalk.gray('☐')} Commit and push ${chalk.cyan(info.workflowPath)} — GitHub only runs workflows that are on the default branch.`);
  if (info.needsToken) {
    console.log(`    ${chalk.gray('☐')} ${chalk.bold('Add a token that can read')} ${chalk.cyan(info.certsRepo)}:`);
    console.log(chalk.gray('        GitHub → Settings → Developer settings → Personal access tokens'));
    console.log(chalk.gray('        Scope: repo (read). Then re-run with GITHUB_TOKEN set, or add it by hand:'));
    console.log(chalk.gray(`        gh secret set MATCH_GIT_BASIC_AUTHORIZATION --repo ${info.repo}`));
    console.log(chalk.gray('        (value: base64 of "x-access-token:<your-token>")'));
    console.log(chalk.gray('        The built-in GITHUB_TOKEN cannot be used — it only reaches this repo, not the certs repo.'));
  }
  console.log(`    ${chalk.gray('☐')} The App Store Connect app record must exist — ${chalk.cyan('kappmaker create-appstore-app')}`);
  console.log('');
  console.log(chalk.bold('  Then ship:'));
  console.log(`    ${chalk.cyan('kappmaker ios-ci build')}                 ${chalk.gray('# → TestFlight')}`);
  console.log(`    ${chalk.cyan('kappmaker ios-ci build --track appstore')} ${chalk.gray('# → App Store')}`);
  console.log('');
}

// --------------------------------------------------------------------- build

async function loadIosCiConfig(): Promise<IosCiConfig> {
  const configPath = path.resolve(CONFIG_FILENAME);
  if (!(await fs.pathExists(configPath))) {
    logger.fatal(`No ${CONFIG_FILENAME} found.`);
    logger.info('Run `kappmaker ios-ci init` first (from the project root).');
    process.exit(1);
  }
  return (await fs.readJson(configPath)) as IosCiConfig;
}

export async function iosCiBuild(options: IosCiBuildOptions): Promise<void> {
  await gha.validateGhInstalled();
  await gha.validateGhAuth();
  const config = await loadIosCiConfig();

  const track = (options.track ?? 'testflight').toLowerCase();
  if (!['testflight', 'appstore'].includes(track)) {
    logger.fatal('--track must be testflight or appstore');
    process.exit(1);
  }

  const present = await gha.listSecretNames(config.repo);
  const missing = REQUIRED_SECRETS.filter((name) => !present.includes(name));
  if (missing.length > 0) {
    logger.fatal(`Missing GitHub secrets: ${missing.join(', ')}`);
    logger.info('Re-run `kappmaker ios-ci init` (and see its checklist for the token step).');
    process.exit(1);
  }

  const submit = options.submitForReview === true;
  if (track === 'appstore' && submit) {
    const ok = await confirm('  Submit to App Store REVIEW after upload?');
    if (!ok) {
      logger.info('Cancelled.');
      return;
    }
  }

  logger.step(1, 2, `Starting the build on GitHub (${track})`);
  const before = await gha.latestRuns(config.repo, 1);
  const beforeId = before[0]?.databaseId;

  const uploadMetadata = options.uploadMetadata === true;
  const uploadScreenshots = options.uploadScreenshots === true;
  if (track === 'testflight' && (uploadMetadata || uploadScreenshots)) {
    logger.warn('--upload-metadata / --upload-screenshots apply to the App Store listing;');
    logger.info('TestFlight takes only the build. Use --track appstore for listing updates.');
  }

  await gha.triggerWorkflow(
    config.repo,
    {
      track,
      submit_for_review: String(submit),
      upload_metadata: String(uploadMetadata),
      upload_screenshots: String(uploadScreenshots),
      bump_build: String(options.bumpBuild !== false),
    },
    options.ref,
  );
  logger.success('Build queued.');

  if (options.noWait) {
    logger.info(`Watch it: https://github.com/${config.repo}/actions/workflows/${gha.WORKFLOW_FILE}`);
    return;
  }

  logger.step(2, 2, 'Waiting for the runner (macOS builds take ~15-25 minutes)');
  const run = await waitForNewRun(config.repo, beforeId);
  if (!run) {
    logger.warn('Could not find the new run — check GitHub directly.');
    logger.info(`https://github.com/${config.repo}/actions/workflows/${gha.WORKFLOW_FILE}`);
    return;
  }
  logger.info(run.url);
  await pollRun(config.repo, run.databaseId, track);
}

async function waitForNewRun(
  repo: string,
  beforeId: number | undefined,
  attempts = 12,
): Promise<gha.WorkflowRun | null> {
  for (let i = 0; i < attempts; i++) {
    await sleep(5000);
    const runs = await gha.latestRuns(repo, 1);
    const run = runs[0];
    if (run && run.databaseId !== beforeId) return run;
  }
  return null;
}

async function pollRun(repo: string, runId: number, track: string): Promise<void> {
  let lastStatus = '';
  // macOS builds run long; poll gently rather than hammering the API.
  for (;;) {
    const runs = await gha.latestRuns(repo, 10);
    const run = runs.find((entry) => entry.databaseId === runId);
    if (!run) {
      logger.warn('Run disappeared from the list — check GitHub.');
      return;
    }
    if (run.status !== lastStatus) {
      logger.info(`status: ${run.status}`);
      lastStatus = run.status;
    }
    if (run.status === 'completed') {
      if (run.conclusion === 'success') {
        logger.success(
          track === 'appstore'
            ? 'Uploaded to App Store Connect.'
            : 'Uploaded to TestFlight — it appears once Apple finishes processing (usually 5-15 min).',
        );
      } else {
        const step = await gha.failedStep(repo, runId);
        logger.error(`Build ${run.conclusion}${step ? ` at step: ${step}` : ''}`);
        logger.info(`Logs: ${run.url}`);
        process.exitCode = 1;
      }
      return;
    }
    await sleep(20000);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// -------------------------------------------------------------------- status

export async function iosCiStatus(): Promise<void> {
  await gha.validateGhInstalled();
  await gha.validateGhAuth();
  const config = await loadIosCiConfig();

  const runs = await gha.latestRuns(config.repo, 5);
  if (runs.length === 0) {
    logger.info('No iOS builds yet. Start one with `kappmaker ios-ci build`.');
    return;
  }

  console.log('');
  console.log(chalk.bold(`  Recent iOS builds — ${config.repo}`));
  console.log('');
  for (const run of runs) {
    const state = run.status === 'completed' ? (run.conclusion ?? 'unknown') : run.status;
    const paint =
      state === 'success' ? chalk.green : state === 'failure' ? chalk.red : chalk.yellow;
    console.log(`    ${paint(state.padEnd(12))} ${run.createdAt}  ${run.url}`);
  }
  console.log('');

  const latest = runs[0];
  if (latest.status === 'completed' && latest.conclusion === 'failure') {
    const step = await gha.failedStep(config.repo, latest.databaseId);
    if (step) logger.info(`Last failure was at step: ${step}`);
  }
}
