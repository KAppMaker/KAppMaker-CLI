import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { local, type LocalCtx, type ToolDef } from '../define.js';
import { workerShellCommand } from '../army/scripts.js';
import { shq, userCommand, type Conn } from '../army/ssh.js';
import { conn, connShape, fail, isConn, type Failure, type ToolOut } from '../army/common.js';
import { askSecret, FIELDS, takeHeld } from '../army/secrets.js';
import { kit } from '../army/kit.js';

/**
 * Connects the user's own Telegram bot to a worker. The token never goes through the AI: it comes from a one-time
 * page on this computer (URL-mode elicitation), from a file the user saved, or from the user's own terminal. It
 * reaches the server only inside the SSH stdin script, and the kit reads it from stdin (`--token-stdin`).
 */
const TOKEN = /^\d{5,12}:[A-Za-z0-9_-]{30,64}$/;
const worker = z.string().regex(/^[a-z0-9-]{1,32}$/).describe('Worker name, e.g. main');

function readTokenFile(file: string): { token: string } | Failure {
  const p = path.resolve(file.replace(/^~(?=$|\/)/, os.homedir()));
  let raw: string;
  try { raw = fs.readFileSync(p, 'utf8'); } catch { return fail(`No file at ${p}.`); }
  const token = (raw.match(/^\s*(?:TELEGRAM_BOT_TOKEN=)?["']?([^\s"']+)/) ?? [])[1] ?? '';
  return TOKEN.test(token) ? { token } : fail(`${p} does not hold a bot token (one line like 123456789:AA… from @BotFather).`);
}

/** Saves the token for the worker on the server. `--token-stdin` on kits that have it, a 600 temp file otherwise. */
export async function connectBot(ctx: LocalCtx, c: Conn, name: string, token: string): Promise<ToolOut> {
  ctx.secrets.push(token);
  const n = shq(name);
  const body = [
    `if kappmaker-army worker 2>&1 | grep -q -- --token-stdin; then`,
    `  printf '%s\\n' ${shq(token)} | kappmaker-army worker add ${n} --token-stdin`,
    'else',
    `  umask 077; t="$(mktemp)"; trap 'rm -f "$t"' EXIT; printf '%s\\n' ${shq(token)} > "$t"; kappmaker-army worker add ${n} --token-file "$t"`,
    'fi',
  ].join('\n');
  const r = await kit(ctx, c, body);
  return r.ok ? `Worker "${name}" is connected to your bot.\n${r.out}` : r.fail!;
}

/** The exact steps when neither a page nor a file is possible. */
export function tokenFallback(c: Conn, name: string): string {
  return 'This AI app cannot open a private page for the bot token. Either:\n' +
    '  1. Save the token from @BotFather in a text file on this computer (one line), and give me the file\'s path as bot_file; or\n' +
    `  2. Run this in your own terminal. It asks for the token hidden:\n     ${userCommand(c, workerShellCommand(c, `kappmaker-army worker add ${name}`))}\n` +
    `  Or on the server itself: save the token in a file only you can read (chmod 600), then run kappmaker-army worker add ${name} --token-file <that file>.`;
}

/** Token from bot_file, the setup page (held), or a page of its own. A string = what to tell the user. */
export async function botToken(ctx: LocalCtx, c: Conn, name: string, botFile?: string): Promise<{ token: string } | ToolOut> {
  if (botFile) return readTokenFile(botFile);
  const held = takeHeld(`bot:${c.host}`, ctx);
  if (held?.bot_token) return { token: held.bot_token };
  const got = await askSecret(ctx, `bot:${c.host}:${name}`, {
    title: 'Your Telegram bot token', message: 'Open this page and paste the token @BotFather gave you. It goes to your server only, not to the AI.',
    fields: [FIELDS.bot(false)],
  });
  if ('values' in got) return { token: got.values.bot_token };
  if ('waiting' in got) return `WAITING FOR YOU: make a Telegram bot with @BotFather (send /newbot) and paste its token on the page. ${got.waiting.replace(/^WAITING FOR YOU: /, '')}`;
  if ('declined' in got) return fail('No token given; nothing changed.');
  return tokenFallback(c, name);
}

export const addWorkerTool: ToolDef = local({
  name: 'army_add_worker',
  title: 'Connect a Telegram bot (add a worker)',
  description:
    'Adds an always-on worker with the user\'s own Telegram bot (or connects the bot to the worker the install made). ' +
    'The token goes in on a one-time private page on this computer, never through the chat; without page support it ' +
    'takes bot_file (a file the user saved) or gives the command for their own terminal. Next: army_pair_telegram.',
  kind: 'long',
  network: true,
  shape: {
    ...connShape, name: worker.default('main'),
    bot_file: z.string().optional().describe('Only when the app cannot open pages: path of a text file on THIS computer holding the bot token (the user saves it there). Never the token itself'),
  },
  run: async (i, ctx) => {
    const c = conn(i);
    if (!isConn(c)) return c;
    if (i.confirm !== true) {
      return `PLAN on ${c.host}: worker "${i.name}" with your own Telegram bot (make one with @BotFather: /newbot; it gives you a token). ` +
        `${ctx.canAskUrl ? 'You paste the token on a private page on this computer.' : 'This app cannot open a private page, so you give me a file path or run one command yourself.'} Run with confirm: true after the user's yes.`;
    }
    const t = await botToken(ctx, c, i.name, i.bot_file);
    if (typeof t === 'string' || 'isError' in t) return t as ToolOut;
    const out = await connectBot(ctx, c, i.name, t.token);
    return typeof out === 'string' ? `${out}\n\nNext: the user sends the bot one message on Telegram, then call army_pair_telegram.` : out;
  },
});
