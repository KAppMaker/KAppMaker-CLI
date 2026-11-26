import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// `kappmaker army …` is a thin bridge to the App Army kit. It never phones
// home: the only requests are the two the user asked for (install.sh and its
// checksum), with a fixed User-Agent that carries no OS, version or hostname.

export const KIT_BINARY = 'kappmaker-army';
export const DEFAULT_ORIGIN = 'https://kappmaker.com';
const USER_AGENT = 'kappmaker-cli';

/** First executable `name` on PATH, or null. PATH is passed in so tests can control it. */
export function findOnPath(name: string, envPath: string | undefined = process.env.PATH): string | null {
  if (!envPath) return null;
  for (const dir of envPath.split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, name);
    try {
      const stat = fs.statSync(candidate);
      if (stat.isFile()) {
        fs.accessSync(candidate, fs.constants.X_OK);
        return candidate;
      }
    } catch {
      // not here, keep looking
    }
  }
  return null;
}

/**
 * The kit's CLI: PATH first, then the kit's own install locations, so a shell
 * opened before the installer updated PATH still finds it.
 */
export function findKit(envPath: string | undefined, env: NodeJS.ProcessEnv = process.env): string | null {
  const onPath = findOnPath(KIT_BINARY, envPath);
  if (onPath) return onPath;
  const home = env.HOME || os.homedir();
  const roots = [env.ARMY_KIT, path.join(home, '.army', 'kit'), path.join(home, '.army', 'kit', 'current')];
  for (const root of roots) {
    if (!root) continue;
    const found = findOnPath(KIT_BINARY, path.join(root, 'cli'));
    if (found) return found;
  }
  return null;
}

/**
 * Where install.sh is fetched from. Same variable install.sh itself honours,
 * so a test or staging origin is one env var. Plain http is accepted only for
 * a loopback host: anywhere else the checksum would come over the same
 * unauthenticated channel as the script and prove nothing.
 */
export function resolveOrigin(raw: string | undefined = process.env.KAPPMAKER_API): string {
  const value = (raw && raw.trim()) || DEFAULT_ORIGIN;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`KAPPMAKER_API is not a URL: ${value}`);
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error(`Refusing to download the installer over ${url.protocol}// from ${url.host} (https only).`);
  }
  return url.origin;
}

/** Accepts `<hex>`, `<hex>  install.sh` or `<hex> *install.sh` (sha256sum / shasum output). */
export function parseChecksum(text: string): string | null {
  const match = text.trim().match(/^([0-9a-fA-F]{64})(\s+\*?\S+)?\s*$/m);
  return match ? match[1].toLowerCase() : null;
}

export function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

export interface InstallArgs {
  /** Arguments for install.sh, with `--key` removed. */
  scriptArgs: string[];
  /** Licence key from `--key K` / `--key=K`, if given. Goes to install.sh via env only. */
  key?: string;
}

/** Pulls `--key` out of the argument list so the key never reaches a child's argv. */
export function splitInstallArgs(args: string[]): InstallArgs {
  const scriptArgs: string[] = [];
  let key: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--key') {
      key = args[i + 1];
      i++;
    } else if (arg.startsWith('--key=')) {
      key = arg.slice('--key='.length);
    } else {
      scriptArgs.push(arg);
    }
  }
  return { scriptArgs, key: key || undefined };
}

export type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

export class ChecksumMismatchError extends Error {}

/**
 * Downloads install.sh and install.sh.sha256 from `origin`, verifies one
 * against the other and writes the script to a private temp dir. Throws
 * (and writes nothing) on any failure, including a checksum mismatch.
 */
export async function downloadVerifiedInstaller(
  origin: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
): Promise<{ scriptPath: string; dir: string; sha256: string }> {
  const get = async (url: string): Promise<Buffer> => {
    const res = await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  };

  const [script, sumFile] = await Promise.all([
    get(`${origin}/install.sh`),
    get(`${origin}/install.sh.sha256`),
  ]);
  const expected = parseChecksum(sumFile.toString('utf8'));
  if (!expected) throw new ChecksumMismatchError(`${origin}/install.sh.sha256 does not contain a SHA-256 hash.`);
  const actual = sha256Hex(script);
  if (actual !== expected) {
    throw new ChecksumMismatchError(
      `install.sh does not match its published checksum (expected ${expected}, got ${actual}). Not running it.`,
    );
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kappmaker-army-'));
  fs.chmodSync(dir, 0o700);
  const scriptPath = path.join(dir, 'install.sh');
  fs.writeFileSync(scriptPath, script, { mode: 0o600 });
  return { scriptPath, dir, sha256: actual };
}

/** Runs a child with the terminal attached and resolves to its exit code (128+n for a signal). */
export function runInherited(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'inherit', env });
    // While the child owns the terminal, Ctrl-C reaches it directly. The
    // CLI's own SIGINT handler (exit 130) is parked meanwhile, or this process
    // would exit and leave the child running with the terminal.
    const parked = process.listeners('SIGINT');
    process.removeAllListeners('SIGINT');
    const ignore = () => {};
    process.on('SIGINT', ignore);
    const done = (code: number) => {
      process.off('SIGINT', ignore);
      for (const listener of parked) process.on('SIGINT', listener);
      resolve(code);
    };
    child.on('error', (err) => {
      console.error(`Could not start ${command}: ${err.message}`);
      done(127);
    });
    child.on('exit', (code, signal) => {
      if (code !== null) return done(code);
      const signo = signal ? os.constants.signals[signal] : undefined;
      done(signo ? 128 + signo : 1);
    });
  });
}
