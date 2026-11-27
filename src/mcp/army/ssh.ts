import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execa } from 'execa';

/**
 * SSH from the buyer's own machine to the server THEY named, with THEIR key.
 * The key is used by path only: never read, copied or stored here. BatchMode
 * means ssh never asks for a password. Everything secret travels in the
 * script on ssh's stdin (encrypted, never on a command line either side).
 */

export interface Conn {
  host: string;
  user: string;
  keyPath: string;
  port: number;
}

export interface SshResult {
  exitCode: number;
  output: string;
}

/** (conn, remote command, script on stdin) → result. Tests replace it. */
export type SshRunner = (conn: Conn, remote: string, stdin: string, onOutput?: (s: string) => void, signal?: AbortSignal) => Promise<SshResult>;

const HOST = /^(?=.{1,253}$)(?!-)[A-Za-z0-9.-]+$|^\[?[0-9A-Fa-f:.]+\]?$/;
const USER = /^[a-z_][a-z0-9_-]{0,31}$/;

export class ConnError extends Error {}

/** Validates what the user gave. Nothing here can be turned into an ssh option. */
export function makeConn(i: { host: string; user?: string; ssh_key_path: string; port?: number }): Conn {
  const host = i.host.trim();
  if (!HOST.test(host) || host.startsWith('-')) throw new ConnError(`"${i.host}" is not a host name or IP address.`);
  const user = (i.user ?? 'root').trim();
  if (!USER.test(user)) throw new ConnError(`"${user}" is not a valid login name.`);
  const keyPath = path.resolve(i.ssh_key_path.replace(/^~(?=$|\/)/, os.homedir()));
  let st: fs.Stats;
  try {
    st = fs.statSync(keyPath);
  } catch {
    throw new ConnError(`No SSH key file at ${keyPath}. Give the path of the private key you log in to the server with (e.g. ~/.ssh/id_ed25519).`);
  }
  if (!st.isFile()) throw new ConnError(`${keyPath} is not a file.`);
  if (process.platform !== 'win32' && (st.mode & 0o077) !== 0) {
    throw new ConnError(`${keyPath} can be read by other users, so ssh will refuse it. Fix: chmod 600 ${keyPath}`);
  }
  const port = i.port ?? 22;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new ConnError(`Port ${port} is not valid.`);
  return { host, user, keyPath, port };
}

export function sshArgs(c: Conn): string[] {
  const args = [
    '-i', c.keyPath, '-p', String(c.port),
    '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-o', 'ConnectTimeout=15',
    '-o', 'StrictHostKeyChecking=accept-new', '-o', 'ServerAliveInterval=30',
  ];
  if (process.env.KAPPMAKER_SSH_KNOWN_HOSTS) args.push('-o', `UserKnownHostsFile=${process.env.KAPPMAKER_SSH_KNOWN_HOSTS}`);
  return [...args, '-l', c.user, c.host];
}

/** The command the user can run themselves (with a terminal, for hidden prompts). */
export function userCommand(c: Conn, remote: string): string {
  const port = c.port === 22 ? '' : ` -p ${c.port}`;
  return `ssh -t -i ${shq(c.keyPath)}${port} ${c.user}@${c.host} ${shq(remote)}`;
}

export const defaultSsh: SshRunner = async (conn, remote, stdin, onOutput, signal) => {
  const child = execa('ssh', [...sshArgs(conn), '--', remote], {
    input: stdin, all: true, reject: false, cancelSignal: signal,
  });
  if (onOutput) child.all?.on('data', (b: Buffer) => onOutput(b.toString()));
  const r = await child;
  return { exitCode: typeof r.exitCode === 'number' ? r.exitCode : 255, output: String(r.all ?? '') };
};

/** POSIX single-quote. */
export function shq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** A heredoc body that cannot end early: refuses values containing the terminator or a newline. */
export function heredoc(name: string, value: string): string {
  if (/[\r\n]/.test(value) || value.includes('KAPPMAKER_EOF')) throw new ConnError(`${name} contains characters it cannot have.`);
  return `<<'KAPPMAKER_EOF'\n${value}\nKAPPMAKER_EOF`;
}

/** What ssh's exit 255 usually means, in plain words. */
export function explainSsh(output: string, c: Conn): string | undefined {
  if (/Permission denied/i.test(output)) return `The server refused the key ${c.keyPath} for ${c.user}@${c.host}. Check the login name (root, ubuntu, …) and that this key was added when the server was created.`;
  if (/Could not resolve hostname/i.test(output)) return `${c.host} is not a known host name. Check it, or use the IP address from your provider.`;
  if (/(timed out|No route to host|Connection refused)/i.test(output)) return `Could not reach ${c.host}:${c.port}. Is the server running, and is SSH allowed on that port?`;
  if (/REMOTE HOST IDENTIFICATION HAS CHANGED/i.test(output)) return `The server's identity changed since you last connected (a rebuilt server, or someone in between). If you rebuilt it, run: ssh-keygen -R ${c.host}`;
  return undefined;
}
