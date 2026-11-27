import { z } from 'zod';
import { local, type LocalCtx, type ToolDef } from '../define.js';
import { asWorker, workerShellCommand } from '../army/scripts.js';
import { shq, userCommand, type Conn } from '../army/ssh.js';
import { conn, connShape, fail, isConn, remote, type ToolOut } from '../army/common.js';

/**
 * Connects the owner's Telegram account to their bot, from the AI: they message the bot once, this notices it on the
 * server (kappmaker-army worker pair), and approves only after THEY confirm "that is me" in a private form the
 * model cannot fill (or, with no form, after they said so in chat and the call names the sender they confirmed).
 * On approval the kit's bot writes first: "Your App Army is ready. Tell me your app idea."
 */

export const READY_TEXT = 'Your App Army is ready. Tell me your app idea.';
const WAIT_SECONDS = 40; // one call stays under the 60 s default tool timeout of Codex

type PairKv = Record<string, string>;
const kvOf = (out: string): PairKv => Object.fromEntries(out.split('\n').map((l) => l.match(/^([a-z]+)=(.*)$/)).filter(Boolean).map((m) => [m![1], m![2].trim()]));

export interface PairResult { done: boolean; out: ToolOut }

export async function pairStep(ctx: LocalCtx, c: Conn, worker: string, i: { approve_sender?: string; wait?: boolean }): Promise<PairResult> {
  const run = (body: string) => remote(ctx, c, asWorker(c, body));
  const manual = userCommand(c, workerShellCommand(c, `kappmaker-army start --worker ${worker}`));
  const look = await run(`kappmaker-army worker pair ${shq(worker)} --wait ${i.wait === false ? 0 : WAIT_SECONDS}`);
  const kv = kvOf(look.output);
  if (!kv.state) {
    if (look.why) return { done: false, out: fail(look.why) };
    // A kit older than v1.2.1 has no `worker pair`: the owner confirms in their own terminal instead.
    return { done: false, out: fail(`This App Army version cannot finish the Telegram connection from here. Message your bot once, then run this in your own terminal (it asks "Is that you?"):\n  ${manual}\nOr update App Army first (army_update).`) };
  }
  const bot = kv.bot ? `@${kv.bot}` : 'your bot';
  const link = kv.bot ? `https://t.me/${kv.bot}` : 'your bot in Telegram';
  if (kv.state === 'no-token') return { done: false, out: fail(`Worker "${worker}" has no Telegram bot yet. Connect one first (army_add_worker).`) };
  if (kv.state === 'paired') return { done: true, out: `Your Telegram account is connected: ${bot} answers only you.` };
  if (kv.state === 'none') {
    return { done: false, out: `WAITING FOR YOU: on your phone, open ${link} and send it any message, like: hi\nThen call this again (I notice the message by myself; nothing to copy).` };
  }
  // pending: someone messaged the bot. Never approve without the owner's yes.
  const who = kv.who ? `${kv.who} (Telegram id ${kv.sender})` : `Telegram id ${kv.sender}`;
  let yes: boolean;
  if (ctx.canAsk) {
    const r = await ctx.ask(`Someone just messaged ${bot}: ${who}. Is that you? Only say yes if it is: that person gets full control of your App Army.`, [
      { name: 'me', title: 'Yes, that is me', description: who, kind: 'boolean' },
    ]);
    yes = r?.me === true;
  } else {
    if (!i.approve_sender) {
      return { done: false, out: `ASK THE USER: someone just messaged ${bot}: ${who}. Is that them? If they say yes, call this again with approve_sender: "${kv.sender}". If not, ask them to send the bot a message from their own Telegram.` };
    }
    yes = i.approve_sender === kv.sender;
    if (!yes) return { done: false, out: fail(`The newest message is from ${who}, not the one the user confirmed. Ask them again.`) };
  }
  if (!yes) {
    await run(`kappmaker-army worker pair ${shq(worker)} --deny ${shq(kv.code)}`);
    return { done: false, out: `Ignored that message. WAITING FOR YOU: send ${bot} a message from your own Telegram, then call this again.` };
  }
  const ok = kvOf((await run(`kappmaker-army worker pair ${shq(worker)} --approve ${shq(kv.code)}`)).output);
  if (ok.state !== 'paired') return { done: false, out: fail(`That request ${ok.state === 'expired' ? 'expired' : 'could not be approved'}. Send ${bot} another message, then call this again.`) };
  return {
    done: true,
    out: `Connected: ${bot} now answers only you.${ok.greeted === 'yes' ? ` It just wrote to you on Telegram: "${READY_TEXT}"` : ` Say hi to it on Telegram: it is ready for your app idea.`}`,
  };
}

export const pairTool: ToolDef = local({
  name: 'army_pair_telegram',
  title: 'Connect your Telegram account to your bot',
  description:
    'After army_add_worker: the user sends their new bot one message; this notices it on the server and asks them, in a ' +
    'private form, "is that you?". On yes the bot answers only them and writes first: "' + READY_TEXT + '". ' +
    'Waits up to 40 seconds per call; call again while it says WAITING FOR YOU.',
  kind: 'write',
  network: true,
  shape: {
    ...connShape,
    worker: z.string().regex(/^[a-z0-9-]{1,32}$/).default('main').describe('Worker name, e.g. main'),
    approve_sender: z.string().regex(/^\d{1,20}$/).optional().describe('Only when the app cannot show forms: the Telegram id the user confirmed is theirs'),
  },
  run: async (i, ctx) => {
    const c = conn(i);
    if (!isConn(c)) return c;
    return (await pairStep(ctx, c, i.worker, i)).out;
  },
});
