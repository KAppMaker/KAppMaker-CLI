import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { local, type LocalCtx, type ToolDef } from '../define.js';
import { asWorker, workerShellCommand } from '../army/scripts.js';
import { shq, userCommand, type Conn } from '../army/ssh.js';
import { conn, connShape, destructiveShape, fail, isConn, remote, secondYes, tail, type Failure, type ToolOut } from '../army/common.js';
import { claudeLoginTool } from './army-login.js';
import { pairTool } from './army-pair.js';

const worker = z.string().regex(/^[a-z0-9-]{1,32}$/, 'a-z, 0-9 and -, up to 32 characters').describe('Worker name, e.g. main');
const TOKEN = /^\d{5,12}:[A-Za-z0-9_-]{30,64}$/;

/** Runs `kappmaker-army …` on the server as the worker user; plain failure with the output tail. */
async function kit(ctx: LocalCtx, c: Conn, body: string, stream = false): Promise<{ ok: boolean; out: string; fail?: ToolOut }> {
  const r = await remote(ctx, c, asWorker(c, body), stream);
  const out = tail(r.output);
  if (r.exitCode === 0) return { ok: true, out };
  if (/command not found|No such file/.test(r.output) && /kappmaker-army/.test(r.output)) {
    return { ok: false, out, fail: fail(`App Army is not installed on ${c.host} for the worker user yet. Run army_install_server first.`) };
  }
  return { ok: false, out, fail: fail(`${r.why ?? `It failed (exit ${r.exitCode}).`}\n${out}`) };
}

/** A tool that takes the server connection and does one kit command. */
function op(o: { name: string; title: string; description: string; kind: 'read' | 'write' | 'long'; shape?: z.ZodRawShape;
  plan?: (i: Record<string, unknown>) => string; destructive?: (i: Record<string, unknown>) => string;
  body: (i: Record<string, unknown>) => string }): ToolDef {
  return local({
    name: o.name, title: o.title, description: o.description, kind: o.kind, network: true,
    shape: { ...connShape, ...(o.shape ?? {}), ...(o.destructive ? destructiveShape : {}) },
    run: async (input, ctx) => {
      const i = input as Record<string, unknown> & { confirm?: boolean; confirm_destructive?: boolean; host: string; ssh_key_path: string };
      const c = conn(i);
      if (!isConn(c)) return c;
      if (o.kind === 'long' && i.confirm !== true) return `PLAN on ${c.host} (nothing has run yet): ${o.plan?.(i) ?? o.body(i)}\nShow this to the user; run it with confirm: true after their yes.`;
      if (o.destructive && !(await secondYes(i, ctx, o.destructive(i)))) {
        return fail(`Not done: ${o.destructive(i)} needs a second yes.${ctx.canAsk ? '' : ' After the user confirms this exact action again, call with confirm: true and confirm_destructive: true.'}`);
      }
      const r = await kit(ctx, c, o.body(i), o.kind === 'long');
      return r.ok ? r.out : r.fail!;
    },
  });
}


function readTokenFile(file: string): { token: string } | Failure {
  const p = path.resolve(file.replace(/^~(?=$|\/)/, os.homedir()));
  let raw: string;
  try { raw = fs.readFileSync(p, 'utf8'); } catch { return fail(`No file at ${p}.`); }
  const token = (raw.match(/^\s*(?:TELEGRAM_BOT_TOKEN=)?["']?([^\s"']+)/) ?? [])[1] ?? '';
  return TOKEN.test(token) ? { token } : fail(`${p} does not hold a bot token (one line like 123456789:AA… from @BotFather).`);
}

/** Exported so army_setup can run the same step. */
export const addWorkerTool: ToolDef = local({
    name: 'army_add_worker',
    title: 'Connect a Telegram bot (add a worker)',
    description:
      'Adds an always-on worker with the user\'s own Telegram bot (or connects the bot to the worker the install made). ' +
      'The bot token is typed into a private form the AI never sees; without one, this returns the command for the user to run in their own terminal.',
    kind: 'long',
    network: true,
    shape: {
      ...connShape, name: worker.default('main'),
      bot_file: z.string().optional().describe('Only when the app cannot show forms: path of a text file on THIS computer holding the bot token (the user saves it there). Never the token itself'),
    },
    run: async (i, ctx) => {
      const c = conn(i);
      if (!isConn(c)) return c;
      const fromFile = i.bot_file ? readTokenFile(String(i.bot_file)) : undefined;
      if (fromFile && 'isError' in fromFile) return fromFile;
      const manual = userCommand(c, workerShellCommand(c, `kappmaker-army worker add ${i.name} && kappmaker-army start --worker ${i.name}`));
      const pairing = 'Next: the user sends the bot one message on Telegram, then call army_pair_telegram (it asks them "is that you?" in a private form).';
      if (i.confirm !== true) {
        return `PLAN on ${c.host}: worker "${i.name}" with your own Telegram bot (make one with @BotFather → /newbot; it gives you a token). ` +
          `${ctx.canAsk ? 'You will type the token into a private form.' : 'This app cannot show a private form, so you run one command yourself.'} Run with confirm: true after the user's yes.`;
      }
      if (!ctx.canAsk && !fromFile) {
        return `This AI app cannot show a private form. Either save the bot token in a text file on this computer (one line) and give me its path as bot_file, or run this in your own terminal (it asks for the token hidden):\n  ${manual}`;
      }
      const got = fromFile ? { token: fromFile.token } : await ctx.ask(`Paste the Telegram bot token from @BotFather for worker "${i.name}". It goes to your server only, not to the AI.`, [
        { name: 'token', title: 'Bot token', description: '123456789:AA…' },
      ]);
      const tok = typeof got?.token === 'string' ? got.token.trim() : '';
      if (!tok) return fail('No token given; nothing changed.');
      if (!TOKEN.test(tok)) return fail('That does not look like a bot token (it looks like 123456789:AA… from @BotFather). Nothing changed.');
      ctx.secrets.push(tok);
      const body = `umask 077; t="$(mktemp)"; trap 'rm -f "$t"' EXIT\nprintf '%s\\n' ${shq(tok)} > "$t"\nkappmaker-army worker add ${shq(String(i.name))} --token-file "$t"`;
      const r = await kit(ctx, c, body);
      return r.ok ? `Worker "${i.name}" is connected to your bot.\n${r.out}\n\n${pairing}` : r.fail!;
    },
  });

export const armyOpsTools: ToolDef[] = [
  op({ name: 'army_doctor', title: 'App Army health check', kind: 'read',
    description: 'Read-only: kappmaker-army doctor on the server. Every line says OK, warn or FAIL, and what to do about it.',
    body: () => 'kappmaker-army doctor' }),
  op({ name: 'army_status', title: 'What App Army is doing', kind: 'read',
    description: 'Read-only: workers and their state, box load and memory, build queue, which worker holds which app.',
    body: () => 'kappmaker-army worker list; echo; kappmaker-army status' }),
  op({ name: 'army_logs', title: 'Recent worker log', kind: 'read', description: 'Read-only: the last lines of one worker\'s log.',
    shape: { worker: worker.default('main'), lines: z.number().int().min(10).max(500).default(80) },
    body: (i) => `kappmaker-army worker logs ${shq(String(i.worker))} ${Number(i.lines)}` }),
  op({ name: 'army_update', title: 'Update App Army', kind: 'long',
    description: 'Moves App Army to the newest release the licence gets. Keeps all data and the user\'s own edits, runs the health check, then restarts running workers fresh (each writes a handoff first).',
    plan: () => 'kappmaker-army update --yes (download the newest release, verify it, switch to it, re-run setup, health check). Run with confirm: true; or call army_update_check first to see what changes.',
    body: () => 'kappmaker-army update --yes' }),
  op({ name: 'army_update_check', title: 'What an update would change', kind: 'read',
    description: 'Read-only: which release is installed, which is available, and what changes (kappmaker-army update --check).',
    body: () => 'kappmaker-army update --check' }),
  op({ name: 'army_rollback', title: 'Go back to the previous release', kind: 'long',
    description: 'Switches the kit back to the release before the last update. Needs a second yes.',
    plan: () => 'kappmaker-army update --rollback (switch back to the previous release, then re-run setup)',
    destructive: () => 'Rolling App Army back to the previous release',
    body: () => 'kappmaker-army update --rollback --yes' }),
  op({ name: 'army_restart_worker', title: 'Restart a worker', kind: 'long',
    description: 'Restarts a worker in a fresh session (it writes a handoff first, so nothing is lost).',
    shape: { name: worker, resume: z.boolean().default(false).describe('Keep the same conversation instead of a fresh one') },
    body: (i) => `kappmaker-army worker restart ${shq(String(i.name))}${i.resume ? ' --resume' : ''}` }),
  op({ name: 'army_remove_worker', title: 'Remove a worker', kind: 'long',
    description: 'Stops and removes a worker. purge also deletes its saved Telegram state (the bot token). Needs a second yes.',
    shape: { name: worker, purge: z.boolean().default(false) },
    destructive: (i) => `Removing worker "${i.name}"${i.purge ? ' and deleting its saved bot token' : ''}`,
    body: (i) => `kappmaker-army worker remove ${shq(String(i.name))} --yes${i.purge ? ' --purge' : ''}` }),
  op({ name: 'army_new_app', title: 'Start a new app', kind: 'write',
    description: 'Saves the user\'s app idea on the server and says how to start it. With a connected Telegram bot the user sends the idea to the bot, which plans it, asks a few questions and builds (the app order). Uses Claude usage on the server\'s account only once the bot starts.',
    shape: { idea: z.string().min(8).max(600).describe("The user's app idea, in their own words"), worker: worker.default('main') },
    body: (i) => `kappmaker-army start --yes --no-launch --worker ${shq(String(i.worker))} --app ${shq(String(i.idea).replace(/\s+/g, ' '))}` }),
  addWorkerTool,
  pairTool,
  claudeLoginTool,
];
