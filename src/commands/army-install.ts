import fs from 'node:fs';
import chalk from 'chalk';
import {
  ChecksumMismatchError,
  DEFAULT_ORIGIN,
  DownloadError,
  downloadVerifiedInstaller,
  resolveOrigin,
  splitInstallArgs,
  type FetchLike,
} from '../services/army.service.js';

// `kappmaker army install` is often the first command a buyer ever runs, so
// every line says what is happening in plain words and every failure ends
// with the exact thing to do next.

export interface InstallDeps {
  env: NodeJS.ProcessEnv;
  out: (line: string) => void;
  err: (line: string) => void;
  run: (command: string, args: string[], env: NodeJS.ProcessEnv) => Promise<number>;
  fetchImpl?: FetchLike;
  platform?: NodeJS.Platform;
  uid?: number;
}

const RETRY = 'kappmaker army install';

/** Problems we can spot before downloading anything. Returns the lines to print, or null. */
export function preflight(args: string[], platform: NodeJS.Platform, uid: number | undefined): string[] | null {
  if (platform === 'win32') {
    return [
      'The App Army kit runs on macOS or Linux, not directly on Windows.',
      'What to do: install WSL (Ubuntu) from https://learn.microsoft.com/windows/wsl/install,',
      `then open the Ubuntu terminal, install Node.js and kappmaker there, and run: ${RETRY}`,
    ];
  }
  if (args.includes('--server')) {
    if (platform !== 'linux') {
      return [
        '--server is for a Linux server (for example an Ubuntu VPS), not for this computer.',
        `What to do: on this computer run ${chalk.cyan(RETRY)} (without --server).`,
        `For a server: connect to it with ssh, then run ${chalk.cyan(`${RETRY} --server`)} there.`,
      ];
    }
    if (uid !== undefined && uid !== 0) {
      return [
        'A server install needs administrator (root) rights.',
        'What to do: run it again with sudo, keeping your PATH so sudo can find kappmaker:',
        `  ${chalk.cyan('sudo env "PATH=$PATH" kappmaker army install --server')}`,
      ];
    }
  }
  return null;
}

function downloadFailure(e: unknown): string[] {
  if (e instanceof ChecksumMismatchError) {
    return [
      chalk.red('Stopped: the downloaded installer could not be verified, so it was NOT run.'),
      chalk.dim(`  (${e.message})`),
      'Nothing on your computer was changed.',
      `What to do: wait a few minutes and run ${chalk.cyan(RETRY)} again.`,
      'If it keeps happening, contact KAppMaker through https://kappmaker.com. Do not run an',
      'installer copied from anywhere else.',
    ];
  }
  if (e instanceof DownloadError && e.status === undefined) {
    return [
      chalk.red('Could not download the installer: no connection to kappmaker.com.'),
      chalk.dim(`  (${e.message})`),
      `What to do: check that you are online (open https://kappmaker.com in a browser), then run ${chalk.cyan(RETRY)} again.`,
    ];
  }
  if (e instanceof DownloadError && e.status !== undefined && e.status >= 500) {
    return [
      chalk.red(`Could not download the installer: kappmaker.com had a problem (HTTP ${e.status}).`),
      `What to do: this is on our side, not yours. Wait a few minutes and run ${chalk.cyan(RETRY)} again.`,
    ];
  }
  const detail = e instanceof Error ? e.message : String(e);
  return [
    chalk.red('Could not download the installer.'),
    chalk.dim(`  (${detail})`),
    `What to do: run ${chalk.cyan(RETRY)} again in a few minutes. If it keeps failing, update kappmaker`,
    `(${chalk.cyan('npm install -g kappmaker@latest')}) and try once more.`,
  ];
}

/** What to say after install.sh exits. */
export function afterInstall(code: number): string[] {
  if (code === 0) {
    return [
      '',
      chalk.green('The App Army kit is installed.'),
      'Next: open a NEW terminal window (so it picks up the new commands), then run:',
      `  ${chalk.cyan('kappmaker army doctor')}     checks that everything is ready`,
    ];
  }
  if (code === 130) return ['', 'Installation cancelled. Nothing more was changed.', `Run ${chalk.cyan(RETRY)} whenever you are ready.`];
  if (code === 127) {
    return [
      '',
      chalk.red('Could not start the installer: the "bash" program is missing.'),
      'What to do: on Ubuntu/Debian run  sudo apt-get install -y bash  and then try again.',
    ];
  }
  if (code === 2) {
    return [
      '',
      chalk.red('The installer did not recognise one of the options you gave it.'),
      `What to do: run ${chalk.cyan(`${RETRY} --help`)} to see the options, then try again.`,
    ];
  }
  return [
    '',
    chalk.red(`The installer stopped before finishing (exit code ${code}).`),
    'What to do: scroll up. The last step it printed says what went wrong and how to fix it.',
    `After fixing that, run ${chalk.cyan(RETRY)} again: it is safe to re-run and skips the steps already done.`,
  ];
}

export async function armyInstall(args: string[], deps: InstallDeps): Promise<number> {
  const { env, out, err, run } = deps;
  const { scriptArgs, key } = splitInstallArgs(args);

  const blocked = preflight(scriptArgs, deps.platform ?? process.platform, deps.uid ?? process.getuid?.());
  if (blocked) {
    for (const line of blocked) err(line);
    return 2;
  }

  let origin: string;
  try {
    origin = resolveOrigin(env.KAPPMAKER_API);
  } catch (e) {
    err(chalk.red((e as Error).message));
    err('What to do: unset KAPPMAKER_API (it should only be set for testing), then try again.');
    return 2;
  }

  out(chalk.bold('Step 1 of 2: downloading the KAppMaker installer and checking it is genuine…'));
  let downloaded: Awaited<ReturnType<typeof downloadVerifiedInstaller>>;
  try {
    downloaded = await downloadVerifiedInstaller(origin, deps.fetchImpl);
  } catch (e) {
    for (const line of downloadFailure(e)) err(line);
    return 1;
  }
  out(chalk.green('  Installer downloaded and verified.') + chalk.dim(` (sha256 ${downloaded.sha256.slice(0, 12)}…)`));
  out(chalk.bold('Step 2 of 2: running the installer.'));
  out(key || env.KAPPMAKER_LICENSE_KEY
    ? '  It will use the licence key you gave and set everything up; this can take a while.'
    : '  It will ask for your licence key (typing is hidden), then set everything up; this can take a while.');
  out('');

  // The key goes to install.sh through its environment only — never argv
  // (visible in `ps`) and never printed.
  const childEnv: NodeJS.ProcessEnv = { ...env };
  if (key) childEnv.KAPPMAKER_LICENSE_KEY = key;
  if (origin !== DEFAULT_ORIGIN) childEnv.KAPPMAKER_API = origin;

  let code: number;
  try {
    code = await run('bash', [downloaded.scriptPath, ...scriptArgs], childEnv);
  } finally {
    fs.rmSync(downloaded.dir, { recursive: true, force: true });
  }
  // `--help` / `--dry-run` exit 0 without installing anything: don't claim success.
  const informational = scriptArgs.some((a) => a === '--help' || a === '-h' || a === '--dry-run');
  if (!(informational && code === 0)) {
    for (const line of afterInstall(code)) (code === 0 ? out : err)(line);
  }
  return code;
}
