import path from 'node:path';
import { randomBytes } from 'node:crypto';
import fs from 'fs-extra';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { confirm } from '../utils/prompt.js';
import { loadConfig, setConfigValue, getIosCiWorkflowTemplate, getIosCiLaneTemplate } from '../utils/config.js';
import { resolveMobileDir } from '../services/version.service.js';
import * as gha from '../services/github-actions.service.js';
import type { IosCiConfig, IosCiInitOptions, IosCiBuildOptions } from '../types/ios-ci.js';

const CONFIG_FILENAME = 'Assets/ios-ci-config.json';
const WORKFLOW_PATH = `.github/workflows/${gha.WORKFLOW_FILE}`;
const LANE_MARKER = '<kappmaker-ci-lane>';
const INIT_STEPS = 7;

/** Secrets the workflow reads. Init is not finished until all of these exist. */
export const REQUIRED_SECRETS = [
  'APPSTORE_KEY_ID',
  'APPSTORE_ISSUER_ID',
  'APPSTORE_PRIVATE_KEY',
  'MATCH_PASSWORD',
  'MATCH_GIT_URL',
  'MATCH_GIT_BASIC_AUTHORIZATION',
] as const;

/**
 * Default store for signing material: ONE private repo per Apple Developer
 * account, not one per app.
 *
 * An iOS distribution certificate belongs to the account and Apple allows only
 * three. A per-app store would mint a fresh certificate for every app and fail
 * on the fourth, so the default is a single `<owner>/apple-certificates` shared
 * by everything that owner ships. Override with --certs-repo or the
 * `iosCertsRepo` config value when your apps span several owners or accounts.
 */
export function defaultCertsRepo(repo: string): string {
  const [owner] = repo.split('/');
  return `${owner}/apple-certificates`;
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

/**
 * Every `getRequiredProperty(key = "X")` in the Gradle build is a value the app
 * needs baked in at build time. They all declare a defaultValue, so a missing
 * one produces a GREEN build carrying "testValue" or "" — a broken app that
 * looks fine until a user hits sign-in or the paywall. CI therefore has to
 * recreate local.properties, and to do that it first has to know the key list.
 */
export function discoverBuildProperties(gradleSources: string[]): string[] {
  const keys = new Set<string>();
  for (const source of gradleSources) {
    for (const m of source.matchAll(/getRequiredProperty\s*\(\s*key\s*=\s*"([A-Z0-9_]+)"/g)) {
      keys.add(m[1]);
    }
  }
  return [...keys].sort();
}

/**
 * Same rule the workflow applies with sed: an uppercase KEY= line. Lowercase
 * entries like `sdk.dir` are machine paths, not secrets, and the runner writes
 * its own.
 */
export function parseExampleKeys(raw: string): string[] {
  const keys: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const m = /^([A-Z][A-Z0-9_]*)=/.exec(line);
    if (m) keys.push(m[1]);
  }
  return keys;
}

/**
 * local.properties.example is the single source of truth — the workflow reads
 * the same file at run time, so the CLI and CI can never disagree about which
 * keys matter. Older projects without that file fall back to scanning Gradle.
 */
export function discoverBuildPropertyKeys(mobileDir: string): string[] {
  try {
    return parseExampleKeys(fs.readFileSync(path.join(mobileDir, 'local.properties.example'), 'utf8'));
  } catch {
    return discoverBuildProperties(readGradleSources(mobileDir));
  }
}

function readGradleSources(mobileDir: string): string[] {
  const out: string[] = [];
  for (const module of ['shared', 'androidApp', 'composeApp']) {
    const file = path.join(mobileDir, module, 'build.gradle.kts');
    try {
      out.push(fs.readFileSync(file, 'utf8'));
    } catch {
      // Module not present in this project shape — fine.
    }
  }
  return out;
}

/** The workflow step that rebuilds local.properties from repo secrets. */
export function buildLocalPropertiesStep(keys: string[], mobileDir: string): string {
  if (keys.length === 0) return '';
  const lines = keys
    .map((key) => `            echo "${key}=\${{ secrets.${key} }}"`)
    .join('\n');
  return [
    '      - name: Write build secrets to local.properties',
    `        working-directory: ${mobileDir}`,
    '        run: |',
    '          {',
    lines,
    '          } >> local.properties',
    '',
  ].join('\n');
}

/** Values already present in the developer's local.properties, to seed secrets. */
export function parseLocalProperties(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z0-9_.]+)\s*=\s*(.*)$/.exec(line);
    if (m && m[2].trim() !== '') out[m[1]] = m[2].trim();
  }
  return out;
}

/**
 * Whether an existing workflow already does everything the shipped one does.
 *
 * Checked by capability rather than by a version stamp: the workflow belongs to
 * the boilerplate, which has no reason to carry a marker for this CLI. Each
 * marker below is a feature whose absence made real builds fail — a lane that
 * predates match, a certs repo that is not wired up, a bootstrap that cannot
 * turn readonly off, or per-secret lines instead of the key list.
 */
const WORKFLOW_MARKERS = ['ci_appstore_release', 'MATCH_GIT_URL', 'MATCH_READONLY', 'ALL_SECRETS'];

export function workflowIsCurrent(source: string): boolean {
  return WORKFLOW_MARKERS.every((marker) => source.includes(marker));
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

  // ---- shared certificate store
  logger.step(2, INIT_STEPS, 'Resolving the shared certificate store');
  const certsRepo = options.certsRepo || userConfig.iosCertsRepo || defaultCertsRepo(repo);
  logger.info(`Certs repo: ${certsRepo}${certsRepo === repo ? '' : ' (shared across your apps)'}`);
  if (certsRepo === repo) {
    logger.fatal('The certificate store must be a SEPARATE repo from the app.');
    logger.info('Sharing one store across apps is what keeps you under Apple\'s 3-certificate limit.');
    process.exit(1);
  }
  if (!options.dryRun) {
    if (await gha.repoExists(certsRepo)) {
      if (!(await gha.repoIsPrivate(certsRepo))) {
        logger.fatal(`${certsRepo} is PUBLIC and would expose your signing certificates.`);
        logger.info('Make it private in GitHub settings, then re-run.');
        process.exit(1);
      }
      logger.info('Using the existing store — this app will add only its own provisioning profile.');
    } else {
      await gha.createPrivateRepo(certsRepo, 'Apple signing certificates and provisioning profiles (fastlane match)');
      logger.success(`Created private repo ${certsRepo}`);
    }
    if (!userConfig.iosCertsRepo) {
      await setConfigValue('iosCertsRepo', certsRepo);
      logger.info('Saved as iosCertsRepo so your next app reuses this store.');
    }
  }

  // ---- the workflow ships with the boilerplate; only write it when missing
  logger.step(3, INIT_STEPS, 'Checking the release workflow');
  const workflowPath = path.join(root, WORKFLOW_PATH);
  const existing = (await fs.readFile(workflowPath, 'utf8').catch(() => '')) as string;
  const isCurrent = workflowIsCurrent(existing);
  if (isCurrent) {
    logger.info(`${WORKFLOW_PATH} is up to date — leaving it alone.`);
  } else if (existing) {
    logger.warn(`${WORKFLOW_PATH} is out of date — updating it.`);
  }

  // ---- match password
  logger.step(4, INIT_STEPS, 'Resolving the certificate password');
  const keyStore = await import('../utils/config.js');
  const stored = await keyStore.loadMatchPasswords();
  // Keyed by the STORE, not the app: every app sharing it needs the same
  // passphrase, and a per-app password would make the store unreadable.
  let matchPassword = options.matchPassword ?? stored[certsRepo];
  let generated = false;
  if (!matchPassword) {
    matchPassword = generateMatchPassword();
    generated = true;
  }
  if (!options.dryRun) {
    await keyStore.saveMatchPassword(certsRepo, matchPassword);
  }

  // ---- secrets
  logger.step(5, INIT_STEPS, 'Pushing secrets to GitHub');
  const privateKey = await fs.readFile(keyPath);
  const values: Record<string, string> = {
    APPSTORE_KEY_ID: userConfig.ascKeyId,
    APPSTORE_ISSUER_ID: userConfig.ascIssuerId,
    // base64 so the multi-line .p8 survives being an env var
    APPSTORE_PRIVATE_KEY: privateKey.toString('base64'),
    MATCH_PASSWORD: matchPassword,
    MATCH_GIT_URL: `https://github.com/${certsRepo}.git`,
  };

  // match clones the store over HTTPS from the runner. GITHUB_TOKEN is scoped to
  // the app repo, so reaching a second repo needs a PAT.
  const certsToken =
    userConfig.iosCertsRepoToken || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
  if (certsToken) {
    values.MATCH_GIT_BASIC_AUTHORIZATION = Buffer.from(`x-access-token:${certsToken}`).toString('base64');
    if (!userConfig.iosCertsRepoToken && !options.dryRun) {
      await setConfigValue('iosCertsRepoToken', certsToken);
      logger.info('Saved the token as iosCertsRepoToken for your next app.');
    }
  }

  // The workflow's Gradle setup wants this; generate one rather than leaving a
  // build to fail on a missing cache key.
  const presentSecrets = options.dryRun ? [] : await gha.listSecretNames(repo);
  if (!presentSecrets.includes('GRADLE_CACHE_ENCRYPTION_KEY')) {
    values.GRADLE_CACHE_ENCRYPTION_KEY = randomBytes(16).toString('hex');
  }

  // The app's own build-time keys come from local.properties.example (the same
  // list the workflow reads at run time) and are seeded from the developer's
  // local.properties where a value already exists.
  const buildKeyNames = discoverBuildPropertyKeys(mobileDir);
  const localProps = parseLocalProperties(
    (await fs.readFile(path.join(mobileDir, 'local.properties'), 'utf8').catch(() => '')) as string,
  );
  const seeded = buildKeyNames.filter((key: string) => localProps[key]);
  const unseeded = buildKeyNames.filter((key: string) => !localProps[key]);
  for (const key of seeded) values[key] = localProps[key];

  if (options.dryRun) {
    logger.info(`(dry run) would set: ${Object.keys(values).join(', ')}`);
  } else {
    for (const [name, value] of Object.entries(values)) {
      await gha.setSecret(repo, name, value);
      logger.success(`secret ${name}`);
    }
  }
  if (buildKeyNames.length > 0) {
    logger.info(`Build-time keys in local.properties.example: ${buildKeyNames.length} (${seeded.length} seeded from local.properties)`);
  }

  // ---- workflow + lane, only if this project predates them
  logger.step(6, INIT_STEPS, 'Ensuring the workflow and fastlane lane exist');
  if (isCurrent) {
    logger.info('Workflow already current — not rewriting.');
  } else {
    const appName = path.basename(root).replace(/-All$/, '');
    const workflow = getIosCiWorkflowTemplate()
      .replace(/__MOBILE_DIR__/g, relMobile)
      .replace(/__APP_NAME__/g, appName);
    await fs.ensureDir(path.dirname(workflowPath));
    await fs.writeFile(workflowPath, workflow);
    logger.success(WORKFLOW_PATH);
  }

  const fastfilePath = path.join(mobileDir, 'fastlane', 'Fastfile');
  const fastfile = (await fs.readFile(fastfilePath, 'utf8').catch(() => '')) as string;
  if (!fastfile) {
    logger.warn('No fastlane/Fastfile yet — run `kappmaker fastlane configure`, then re-run this.');
  } else if (fastfile.includes('ci_appstore_release')) {
    logger.info('CI lane already in the Fastfile.');
  } else {
    await fs.writeFile(fastfilePath, appendCiLane(fastfile, getIosCiLaneTemplate()));
    logger.success('Added the ci_appstore_release lane to fastlane/Fastfile');
  }

  const config: IosCiConfig = {
    provider: 'github',
    repo,
    mobile_dir: relMobile,
    bundle_id: bundleId,
    secrets_configured: !options.dryRun,
  };
  const configPath = path.resolve(CONFIG_FILENAME);
  await fs.ensureDir(path.dirname(configPath));
  await fs.writeJson(configPath, config, { spaces: 2 });
  logger.success(CONFIG_FILENAME);

  // ---- what the human still has to do
  logger.step(7, INIT_STEPS, 'Remaining manual steps');
  printInitChecklist({
    repo,
    // Don't hand out a password on a dry run: nothing was stored, and a fresh
    // one is minted on the real run — saving this one would mislead.
    matchPassword: generated && !options.dryRun ? matchPassword : null,
    workflowPath: WORKFLOW_PATH,
    dryRun: options.dryRun === true,
    unseededKeys: unseeded,
    certsRepo,
    needsToken: !values.MATCH_GIT_BASIC_AUTHORIZATION,
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
  matchPassword: string | null;
  workflowPath: string;
  dryRun: boolean;
  unseededKeys: string[];
  certsRepo: string;
  needsToken: boolean;
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
  console.log(`    ${chalk.gray('☐')} The App Store Connect app record must exist — ${chalk.cyan('kappmaker create-appstore-app')}`);
  if (info.needsToken) {
    console.log('');
    console.log(`    ${chalk.yellow('!')} ${chalk.bold('A token that can read')} ${chalk.cyan(info.certsRepo)} ${chalk.bold('is required.')}`);
    console.log(chalk.gray('      The signing store is a separate private repo, and GitHub\'s built-in token'));
    console.log(chalk.gray('      only reaches the repo it runs in. Create a PAT with repo read access, then:'));
    console.log(chalk.gray(`        kappmaker config set iosCertsRepoToken <token>   # reused by every app`));
    console.log(chalk.gray('      and re-run. Without it the build fails at the signing step with a clone error.'));
  }
  if (info.unseededKeys.length > 0) {
    console.log('');
    console.log(`    ${chalk.yellow('!')} ${chalk.bold('These build keys have no value yet')} — the build will still go GREEN,`);
    console.log(chalk.gray('      but ship with empty/placeholder values (broken sign-in, paywall, analytics):'));
    for (const key of info.unseededKeys) {
      console.log(chalk.gray(`        gh secret set ${key} --repo ${info.repo}`));
    }
  }
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

  // Apple rejects a build number it has already accepted, and CI builds exactly
  // what is committed — so the bump belongs in `kappmaker update-version` before
  // this, not as magic inside the pipeline.
  logger.info('Build number comes from the commit — run `kappmaker update-version` first if this is a re-release.');

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
