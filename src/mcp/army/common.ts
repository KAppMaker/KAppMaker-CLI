import { z } from 'zod';
import type { LocalCtx } from '../define.js';
import { ConnError, explainSsh, makeConn, type Conn } from './ssh.js';
import { LicenceError, readKeyFile, validCode } from './licence.js';
import { askSecret, FIELDS } from './secrets.js';

/** Every server tool takes the host the user named, their login and their key PATH (never the key). */
export const connShape = {
  host: z.string().describe('Server IP or host name, exactly as the user gave it'),
  user: z.string().default('root').describe('Login name on the server (root, ubuntu, or the worker user "army" after hardening)'),
  ssh_key_path: z.string().describe("Path to the user's private SSH key on THIS machine, e.g. ~/.ssh/id_ed25519. Only the path is used"),
  port: z.number().int().min(1).max(65535).default(22),
};

export const licenceShape = {
  install_code: z.string().optional().describe('One-time install code from "My purchase" on kappmaker.com (e.g. ABCD-EFGH-JKLM)'),
  licence_key_file: z.string().optional().describe('Path to a file on THIS machine holding the licence key. Never paste the key itself into chat'),
};

export type Failure = { text: string; isError: true };
export type ToolOut = string | Failure;
export const fail = (text: string): Failure => ({ text, isError: true });

export function conn(i: { host: string; user?: string; ssh_key_path: string; port?: number }): Conn | Failure {
  try {
    return makeConn(i);
  } catch (e) {
    if (e instanceof ConnError) return fail(e.message);
    throw e;
  }
}
export const isConn = (c: Conn | Failure): c is Conn => 'host' in c;

/** Runs a remote script; ssh failures come back as one plain sentence. */
export async function remote(ctx: LocalCtx, c: Conn, cmd: { remote: string; stdin: string }, stream = false) {
  const r = await ctx.army.ssh(c, cmd.remote, cmd.stdin, stream ? (s) => ctx.progress(s.trim().split('\n').pop() ?? '') : undefined, ctx.signal);
  const why = r.exitCode === 255 ? explainSsh(r.output, c) : undefined;
  return { ...r, why };
}

export function tail(out: string, lines = 40): string {
  const all = out.trim().split('\n');
  return (all.length > lines ? ['…', ...all.slice(-lines)] : all).join('\n');
}

/** Turns what the user typed on the page into a key or a code. */
export function licenceValue(v: string): { key?: string; code?: string } | Failure {
  try {
    return /^KAM-/i.test(v) ? { key: v } : { code: validCode(v) };
  } catch (e) {
    return fail((e as Error).message);
  }
}

export const NO_PAGE_LICENCE = 'I need your install code, but this AI app cannot open a private page for it. Copy the install code from "My purchase" on kappmaker.com and give it as install_code (it works once and lasts 30 minutes), or save your licence key in a file and give its path as licence_key_file.';

/**
 * The licence for an install: install code or key file from the arguments, else a one-time page on this computer
 * (URL-mode elicitation: the value goes to this process only, never to the model). `waiting` = call again.
 */
export async function licenceFrom(i: { install_code?: string; licence_key_file?: string }, ctx: LocalCtx):
  Promise<{ key?: string; code?: string } | Failure | { waiting: string }> {
  try {
    if (i.install_code) return { code: validCode(i.install_code) };
    if (i.licence_key_file) return { key: readKeyFile(i.licence_key_file) };
  } catch (e) {
    if (e instanceof LicenceError) return fail(e.message);
    throw e;
  }
  const got = await askSecret(ctx, 'licence', {
    title: 'Your App Army install code', message: 'Open this page and paste your install code (or licence key) from "My purchase". It goes straight to the installer, not to the AI.',
    fields: [FIELDS.code],
  });
  if ('values' in got) return licenceValue(got.values.code_or_key);
  if ('waiting' in got) return got;
  return fail('declined' in got ? 'No install code was given, so nothing was installed.' : NO_PAGE_LICENCE);
}

/**
 * Second yes for actions that cannot be undone. With a form-capable client the user answers in a form the model
 * cannot fill; otherwise the call must carry confirm_destructive: true after the user typed yes in chat.
 */
export async function secondYes(i: { confirm_destructive?: boolean }, ctx: LocalCtx, what: string): Promise<boolean> {
  if (ctx.canAsk) {
    const r = await ctx.ask(`${what} This cannot be undone. Go ahead?`, [{ name: 'yes', title: 'Yes, go ahead', description: what, kind: 'boolean' }]);
    return r?.yes === true;
  }
  return i.confirm_destructive === true;
}

export const destructiveShape = {
  confirm_destructive: z.boolean().optional().describe('Second yes for an action that cannot be undone. Only after the user said yes to this exact action'),
};
