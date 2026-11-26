import fs from 'node:fs';
import chalk from 'chalk';
import {
  KIT_BINARY,
  ChecksumMismatchError,
  downloadVerifiedInstaller,
  findKit,
  resolveOrigin,
  runInherited,
  splitInstallArgs,
  type FetchLike,
} from '../services/army.service.js';

export interface ArmyDeps {
  envPath?: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: FetchLike;
  run?: (command: string, args: string[], env: NodeJS.ProcessEnv) => Promise<number>;
  out?: (line: string) => void;
  err?: (line: string) => void;
}

export function installHint(): string[] {
  return [
    `The App Army kit (${KIT_BINARY}) is not installed on this machine.`,
    '',
    'Install it on this laptop:',
    `  ${chalk.cyan('kappmaker army install')}`,
    `  ${chalk.dim('or: curl -fsSL https://kappmaker.com/install.sh | bash')}`,
    'Install it on a server (Linux, as root):',
    `  ${chalk.cyan('kappmaker army install --server')}`,
    `  ${chalk.dim('or: curl -fsSL https://kappmaker.com/install.sh | bash -s -- --server')}`,
    '',
    'Have your licence key ready (it is asked with hidden input; KAPPMAKER_LICENSE_KEY also works).',
    `Already installed? Open a new shell so PATH picks up ${KIT_BINARY}, then try again.`,
  ];
}

function usage(): string[] {
  return [
    'Usage: kappmaker army <command> [args]',
    '',
    `Forwards to ${KIT_BINARY} (the App Army kit) when it is installed, e.g.:`,
    '  kappmaker army doctor        kappmaker army update        kappmaker army worker add <name>',
    '',
    'Install the kit:',
    '  kappmaker army install [--server] [--key K] [--dry-run] [other install.sh options]',
    '  Downloads https://kappmaker.com/install.sh, verifies it against install.sh.sha256 and runs it.',
  ];
}

/** `kappmaker army …`. Returns the exit code; the caller exits with it. */
export async function army(args: string[], deps: ArmyDeps = {}): Promise<number> {
  const env = deps.env ?? process.env;
  const out = deps.out ?? ((line: string) => console.log(line));
  const err = deps.err ?? ((line: string) => console.error(line));
  const run = deps.run ?? runInherited;
  const [cmd, ...rest] = args;

  // `install` always runs the installer: the kit has no install subcommand,
  // and install.sh is safe to re-run (repair / --update / --version).
  if (cmd === 'install') return install(rest, { ...deps, env, out, err, run });

  const kit = findKit(deps.envPath ?? env.PATH, env);
  if (kit) return run(kit, args, env);

  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    for (const line of usage()) out(line);
    out('');
    for (const line of installHint()) out(line);
    return cmd ? 0 : 1;
  }
  for (const line of installHint()) err(line);
  return 1;
}

async function install(args: string[], deps: Required<Pick<ArmyDeps, 'env' | 'out' | 'err' | 'run'>> & ArmyDeps): Promise<number> {
  const { env, out, err, run } = deps;
  const { scriptArgs, key } = splitInstallArgs(args);

  let origin: string;
  try {
    origin = resolveOrigin(env.KAPPMAKER_API);
  } catch (e) {
    err(chalk.red((e as Error).message));
    return 2;
  }

  out(`Downloading ${origin}/install.sh and checking it against install.sh.sha256 …`);
  let downloaded: Awaited<ReturnType<typeof downloadVerifiedInstaller>>;
  try {
    downloaded = await downloadVerifiedInstaller(origin, deps.fetchImpl);
  } catch (e) {
    const message = (e as Error).message;
    err(chalk.red(e instanceof ChecksumMismatchError ? `Checksum mismatch: ${message}` : `Download failed: ${message}`));
    if (e instanceof ChecksumMismatchError) {
      err('The installer was NOT run. Try again later; if it keeps happening, report it via https://kappmaker.com.');
    }
    return 1;
  }
  out(chalk.green(`install.sh verified (sha256 ${downloaded.sha256.slice(0, 12)}…)`));

  // The key goes to install.sh through its environment only — never argv
  // (visible in `ps`) and never printed.
  const childEnv: NodeJS.ProcessEnv = { ...env };
  if (key) childEnv.KAPPMAKER_LICENSE_KEY = key;
  if (origin !== 'https://kappmaker.com') childEnv.KAPPMAKER_API = origin;

  try {
    return await run('bash', [downloaded.scriptPath, ...scriptArgs], childEnv);
  } finally {
    fs.rmSync(downloaded.dir, { recursive: true, force: true });
  }
}
