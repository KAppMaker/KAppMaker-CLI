import chalk from 'chalk';
import { KIT_BINARY, findKit, runInherited, type FetchLike } from '../services/army.service.js';
import { armyInstall } from './army-install.js';

export interface ArmyDeps {
  envPath?: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: FetchLike;
  run?: (command: string, args: string[], env: NodeJS.ProcessEnv) => Promise<number>;
  out?: (line: string) => void;
  err?: (line: string) => void;
  platform?: NodeJS.Platform;
  uid?: number;
}

export function installHint(): string[] {
  return [
    `This command needs the App Army kit, which is not installed on this computer yet.`,
    '',
    'To install it on this computer (macOS or Linux), run:',
    `  ${chalk.cyan('kappmaker army install')}`,
    'To install it on a Linux server instead, connect to the server and run (as root):',
    `  ${chalk.cyan('kappmaker army install --server')}`,
    '',
    'Have your licence key ready — the installer asks for it (what you type stays hidden).',
    `Just installed it? Open a new terminal window and try again (the new ${KIT_BINARY} command`,
    'is only visible to terminals opened after the install).',
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
  if (cmd === 'install') return armyInstall(rest, { ...deps, env, out, err, run });

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
