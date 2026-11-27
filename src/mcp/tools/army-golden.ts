import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { local, type LocalCtx, type LocalTool, type ToolDef } from '../define.js';
import { downloadVerifiedInstaller, resolveOrigin, DEFAULT_ORIGIN } from '../../services/army.service.js';
import { checkEntitlement, hasMentorPack, isKit, productName } from '../army/licence.js';
import { PROBE, installScript, judge, parseProbe, WORKER_USER } from '../army/scripts.js';
import { connShape, conn, fail, isConn, licenceFrom, licenceShape, licenceValue, remote, tail, type ToolOut } from '../army/common.js';
import { askSecret, FIELDS, hold } from '../army/secrets.js';
import type { Conn } from '../army/ssh.js';
import { SETUP_DIR, detachedInstall, installLogTail, parseState, stateScript, type SetupState } from '../army/setup-state.js';
import { claudeLoginTool } from './army-login.js';
import { addWorkerTool } from './army-bot.js';
import { pairStep, READY_TEXT } from './army-pair.js';

/**
 * The golden path in one tool: "Set up App Army on my server at 1.2.3.4". Each call looks at the server and moves
 * the setup one step on: install (detached, so no call waits 25 minutes), Claude sign-in (a link), the Telegram bot
 * (install code and token on a one-time private page), pairing (by itself on current kits), and stops at READY when the bot has written first. The AI
 * calls it again, with the same arguments, until the answer starts with READY. Only the install needs confirm: true.
 */
const WORKER = 'main';
const defaultKey = () => ['id_ed25519', 'id_ecdsa', 'id_rsa'].map((n) => path.join(os.homedir(), '.ssh', n)).find((f) => fs.existsSync(f)) ?? '~/.ssh/id_ed25519';
const again = 'Call army_setup again with the same arguments';

async function look(ctx: LocalCtx, c: Conn): Promise<{ c: Conn; st?: SetupState; error?: string }> {
  let r = await remote(ctx, c, { remote: 'bash -s', stdin: stateScript(WORKER) });
  // --sudo full turns root's SSH login off after the install: the worker user got the same key.
  if (r.exitCode === 255 && c.user === 'root' && /Permission denied/i.test(r.output)) {
    const army = { ...c, user: WORKER_USER };
    const r2 = await remote(ctx, army, { remote: 'bash -s', stdin: stateScript(WORKER) });
    if (r2.exitCode === 0) return { c: army, st: parseState(r2.output) };
  }
  if (r.exitCode !== 0) return { c, error: r.why ?? `Could not look at ${c.host} (exit ${r.exitCode}).\n${tail(r.output, 8)}` };
  return { c, st: parseState(r.output) };
}

/** Licence (and, on the same page, the bot token for later) for the install. */
async function licenceAndBot(i: Record<string, unknown>, ctx: LocalCtx, c: Conn): Promise<{ key?: string; code?: string } | ToolOut> {
  if (i.install_code || i.licence_key_file || !ctx.canAskUrl) {
    const l = await licenceFrom(i as never, ctx);
    return 'waiting' in l ? l.waiting : l;
  }
  const got = await askSecret(ctx, `setup:${c.host}`, {
    title: 'Set up App Army', message: 'Open this page and paste your install code and your Telegram bot token. They go straight to your server, not to the AI.',
    fields: [FIELDS.code, FIELDS.bot(true)],
  });
  if ('waiting' in got) return got.waiting;
  if (!('values' in got)) return fail('No install code was given, so nothing was installed.');
  if (got.values.bot_token) hold(`bot:${c.host}`, { bot_token: got.values.bot_token });
  return licenceValue(got.values.code_or_key);
}

/** Installer flags that answer its questions up front, passed only when this install.sh knows them (older ones refuse unknown flags). */
export function promptFlags(script: string): string[] {
  const out: string[] = [];
  if (script.includes('--routines)')) out.push('--routines', 'off');
  if (script.includes('--prompt-timeout)')) out.push('--prompt-timeout', '60');
  return out;
}

async function startInstall(i: Record<string, unknown> & { confirm?: boolean }, ctx: LocalCtx, c: Conn): Promise<ToolOut> {
  const probe = await remote(ctx, c, { remote: 'bash -s', stdin: PROBE });
  if (probe.exitCode !== 0) return fail(probe.why ?? `Could not check ${c.host} (exit ${probe.exitCode}).`);
  const rep = judge(parseProbe(probe.output), c);
  if (rep.blockers.length) return fail(`Not installing yet:\n  ${rep.blockers.join('\n  ')}`);
  if (i.confirm !== true) {
    return [
      `PLAN: set up App Army on ${c.host} (nothing has run yet)`, ...rep.lines.map((l) => `  ${l}`),
      'What happens, start to finish:',
      '  1. A private page opens on your computer: paste your install code from "My purchase" and your Telegram bot token (from @BotFather: /newbot). Your AI never sees them.',
      '  2. The official installer runs on the server (10 to 25 minutes): security baseline (SSH keys only, firewall, automatic security updates), a worker user with limited rights, the tools, the kit, your mentor pack if you bought it, and an always-on worker.',
      '  3. You sign Claude in: open the link I give you.',
      '  4. You send your new bot one message. It connects to you by itself.',
      `  5. Your bot writes to you: "${READY_TEXT}"`,
      'Show this to the user. After their yes, call army_setup again with confirm: true.',
    ].join('\n');
  }
  const lic = await licenceAndBot(i, ctx, c);
  if (typeof lic === 'string' || 'isError' in lic) return lic as ToolOut;
  const ent = await checkEntitlement(lic, ctx.army.fetch);
  if (!ent.valid) return fail(`Nothing installed. ${ent.note}`);
  if (!isKit(ent.product)) return fail('Your purchase is App Army for Claude Code (the plugin): it runs inside Claude Code on your own computer, not on a server. Use army_install_plugin.');
  const mentor = hasMentorPack(ent.product);
  let script: string;
  try {
    const origin = resolveOrigin();
    const dl = await downloadVerifiedInstaller(origin, ctx.army.fetch);
    script = detachedInstall(installScript({
      script: fs.readFileSync(dl.scriptPath, 'utf8'), keyFile: lic.key ? `${SETUP_DIR}/key` : undefined, code: lic.code,
      api: origin === DEFAULT_ORIGIN ? undefined : origin, sudo: 'limited', worker: WORKER, mentor,
      kitOnly: i.kit_only === true, extra: promptFlags(fs.readFileSync(dl.scriptPath, 'utf8')),
    }), lic.key);
    fs.rmSync(dl.dir, { recursive: true, force: true });
  } catch (e) {
    return fail(`Nothing installed: ${(e as Error).message}`);
  }
  if (lic.key) ctx.secrets.push(lic.key);
  const r = await remote(ctx, c, { remote: c.user === 'root' ? 'bash -s' : 'sudo -n bash -s', stdin: script });
  if (r.exitCode !== 0 || !/STARTED|ALREADY_RUNNING/.test(r.output)) return fail(`The install did not start (exit ${r.exitCode}). ${r.why ?? ''}\n${tail(r.output, 10)}`);
  return `INSTALLING ${productName(ent.product)} on ${c.host}: started. It takes 10 to 25 minutes and keeps going even if this chat closes. ${again} every few minutes to see how far it is.`;
}

export const setupTool: ToolDef = local({
  name: 'army_setup',
  title: 'Set up App Army on a server, start to finish',
  description:
    'Use this when the user says "set up App Army on my server at <ip>". One tool for the whole setup: each call looks ' +
    'at the server and does the next step (install, Claude sign-in link, bot token, first message to the bot). Call it ' +
    'again with the same arguments until the answer starts with READY. Lines starting with WAITING FOR YOU say what the ' +
    'user must do. Install code and bot token go in on a private page on this computer, never through the chat. ' +
    'Starting the install needs confirm: true. When the user\'s own message already asks for the setup ("Set up App ' +
    'Army on my server at 1.2.3.4"), that is their yes: pass confirm: true on the first call.',
  kind: 'long',
  network: true,
  shape: {
    ...connShape, ...licenceShape,
    ssh_key_path: z.string().optional().describe("Path to the user's private SSH key on THIS machine. Leave out to use ~/.ssh/id_ed25519 (or id_ecdsa, id_rsa)"),
    bot_file: z.string().optional().describe('Only when the app cannot open private pages: path of a text file on THIS computer holding the bot token'),
    kit_only: z.boolean().default(false).describe('Test boxes only: skip the developer tools'),
    approve_sender: z.string().regex(/^\d{1,20}$/).optional().describe('Only when the app cannot show forms: the Telegram id the user confirmed is theirs'),
  },
  run: async (i, ctx) => {
    const first = conn({ ...i, ssh_key_path: i.ssh_key_path ?? defaultKey() });
    if (!isConn(first)) return first;
    const seen = await look(ctx, first);
    if (seen.error || !seen.st) return fail(seen.error ?? 'Could not look at the server.');
    const { c, st } = seen;
    const conns = { host: c.host, user: c.user, ssh_key_path: c.keyPath, port: c.port };
    if (st.installing) {
      return `INSTALLING on ${c.host}${st.minutes !== undefined ? ` (${st.minutes} min so far)` : ''}: ${st.installStep ?? 'starting'}. Nothing to do yet. ${again} in a few minutes.`;
    }
    if (!st.installed) {
      if (st.installRc !== undefined && st.installRc !== 0 && i.confirm !== true) {
        const log = await remote(ctx, c, { remote: 'bash -s', stdin: installLogTail });
        return fail(`The install stopped (exit ${st.installRc}) at: ${st.installStep ?? 'the start'}.\n--- last output ---\n${tail(log.output, 30)}\nOnce the cause is fixed, call army_setup with confirm: true to run it again (it is safe to repeat). An install code works once: use a fresh one from "My purchase".`);
      }
      return startInstall(i, ctx, c);
    }
    const sub = (t: ToolDef, args: Record<string, unknown>) => (t as LocalTool).run({ ...conns, ...args }, ctx);
    if (!st.claude) {
      const out = await sub(claudeLoginTool, { action: st.loginWaiting ? 'finish' : 'start' });
      const body = typeof out === 'string' ? out : out.text;
      if (/is signed in/.test(body)) return `${body.replace(/ Next: army_add_worker\./, '')}\n${again} for the next step.`;
      if (/^WAITING FOR YOU/.test(body)) return body.replace(/Then call army_claude_login with action finish again\./, `Then ${again.toLowerCase()}.`);
      return `WAITING FOR YOU: ${body.replace(/Then call army_claude_login with action finish\./, `When you have signed in, tell me (I then call army_setup again).`)}`;
    }
    if (!st.token) {
      const out = await sub(addWorkerTool, { name: WORKER, confirm: true, bot_file: i.bot_file });
      if (typeof out !== 'string') return out;
      if (/^WAITING FOR YOU/.test(out)) return out.replace(/Then call this again\./, `Then ${again.toLowerCase()}.`);
      if (/cannot open a private page/.test(out)) return `WAITING FOR YOU: make a Telegram bot with @BotFather (send /newbot). ${out}\nThen ${again.toLowerCase()}.`;
      const p = await pairStep(ctx, c, WORKER, { approve_sender: i.approve_sender as string | undefined });
      if (p.done) return `READY. App Army is set up on ${c.host}. ${typeof p.out === 'string' ? p.out : ''}\nTell the user: reply to your bot with your app idea and it starts building.`;
      return `Your bot is connected to the server. ${typeof p.out === 'string' ? p.out : p.out.text}`;
    }
    if (!st.paired) {
      const p = await pairStep(ctx, c, WORKER, { approve_sender: i.approve_sender as string | undefined });
      if (!p.done) return p.out;
      return `READY. App Army is set up on ${c.host}. ${typeof p.out === 'string' ? p.out : ''}\nTell the user: reply to your bot with your app idea and it starts building.`;
    }
    return `READY. App Army is set up on ${c.host}: Claude is signed in and ${st.bot ? `@${st.bot}` : 'your bot'} answers only you. Tell the user to send their app idea to the bot on Telegram. (army_doctor checks health; army_status shows what it is doing.)`;
  },
});
