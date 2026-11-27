import type { LocalCtx } from '../define.js';
import { openSecretPage, type SecretField, type SecretPage } from './secret-page.js';

/**
 * Secrets from the user without the AI: a one-time page on this computer, opened through URL-mode elicitation.
 * A page that is not sent yet survives across tool calls (the user may take minutes in BotFather), so the next call
 * picks the answer up. Values asked for early (the bot token on the install page) are held in memory until the step
 * that needs them, at most a few hours, and never leave this process except into the SSH stdin of the user's server.
 */

const pending = new Map<string, { page: SecretPage; values?: Record<string, string> }>();
const held = new Map<string, { values: Record<string, string>; until: number }>();
const HOLD_MS = 6 * 60 * 60_000;

export type SecretAnswer =
  | { values: Record<string, string> }
  | { waiting: string }
  | { declined: true }
  | { unavailable: true };

export function hold(key: string, values: Record<string, string>): void {
  if (Object.keys(values).length) held.set(key, { values, until: Date.now() + HOLD_MS });
}

export function takeHeld(key: string, ctx: LocalCtx): Record<string, string> | undefined {
  const h = held.get(key);
  if (!h || h.until < Date.now()) { held.delete(key); return undefined; }
  held.delete(key);
  ctx.secrets.push(...Object.values(h.values));
  return h.values;
}

export const hasHeld = (key: string): boolean => (held.get(key)?.until ?? 0) > Date.now();

async function wait(entry: { page: SecretPage; values?: Record<string, string> }, ms: number): Promise<void> {
  if (entry.values || entry.page.finished()) return;
  let timer: NodeJS.Timeout | undefined;
  await Promise.race([entry.page.result, new Promise((r) => { timer = setTimeout(r, ms); })]);
  clearTimeout(timer);
}

/** Asks for `fields` on a one-time page. Waits up to `waitMs` for the answer, then reports WAITING (call again). */
export async function askSecret(ctx: LocalCtx, key: string, o: { title: string; message: string; fields: SecretField[] }, waitMs = 90_000): Promise<SecretAnswer> {
  let entry = pending.get(key);
  if (!entry) {
    if (!ctx.canAskUrl) return { unavailable: true };
    const page = await openSecretPage({ title: o.title, fields: o.fields });
    const e: { page: SecretPage; values?: Record<string, string> } = { page };
    void page.result.then((v) => { e.values = v; });
    entry = e;
    pending.set(key, entry);
    const opened = await ctx.askUrl(o.message, page.url, page.id).catch(() => false);
    if (!opened) {
      page.close();
      pending.delete(key);
      return { declined: true };
    }
  }
  await wait(entry, waitMs);
  if (entry.values) {
    pending.delete(key);
    ctx.secrets.push(...Object.values(entry.values));
    ctx.urlDone?.(entry.page.id);
    return { values: entry.values };
  }
  if (entry.page.finished()) { pending.delete(key); return { declined: true }; }
  return { waiting: `WAITING FOR YOU: fill in the page that opened in your browser (${o.title}). If it did not open, open ${entry.page.url} on this computer. Then call this again.` };
}

/** Field rules shared by the tools. */
export const FIELDS = {
  code: {
    name: 'code_or_key', label: 'Install code or licence key',
    hint: 'From "My purchase" on kappmaker.com. An install code looks like ABCD-EFGH-JKLM; a licence key starts with KAM-.',
    pattern: /^(KAM-[A-Za-z0-9-]{4,60}|[A-Za-z0-9-]{4,32})$/, invalid: 'Copy it again from "My purchase": it has letters, numbers and dashes only.',
  },
  bot: (optional: boolean): SecretField => ({
    name: 'bot_token', label: 'Telegram bot token', optional,
    hint: 'In Telegram, open @BotFather, send /newbot, pick a name and a username that ends in "bot". It replies with a token like 123456789:AA... Paste it here.',
    pattern: /^\d{5,12}:[A-Za-z0-9_-]{30,64}$/, invalid: 'That is not a bot token. It looks like 123456789:AA... and comes from @BotFather.',
  }),
  signinCode: {
    name: 'code', label: 'Sign-in code', hint: 'The code the Claude sign-in page showed you after you signed in.',
    pattern: /^[A-Za-z0-9#_.~-]{6,300}$/, invalid: 'That code has characters a sign-in code does not have. Copy it again.',
  },
} satisfies Record<string, SecretField | ((o: boolean) => SecretField)>;
