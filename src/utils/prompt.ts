import readline from 'node:readline';

/**
 * Whether someone can answer a prompt. False under a headless agent, a
 * Telegram worker, CI, or when KAPPMAKER_NONINTERACTIVE=1 — callers then
 * fail with one line naming the non-interactive command instead of hanging.
 */
export function isInteractive(
  env: NodeJS.ProcessEnv = process.env,
  stdinIsTTY: boolean | undefined = process.stdin.isTTY,
): boolean {
  if (env.KAPPMAKER_NONINTERACTIVE === '1' || env.CI === 'true' || env.CI === '1') return false;
  return Boolean(stdinIsTTY);
}

export const CONFIG_INIT_HINT =
  'kappmaker config init --yes [--bundle-prefix com.yourcompany] [--organization "Your Co"]';

/**
 * Thrown instead of prompting when nobody can answer (KAPPMAKER_NONINTERACTIVE=1,
 * e.g. under `kappmaker mcp`). The message starts with a fixed marker so the MCP
 * server can turn it into a plain-language "do this instead" reply.
 */
export class NeedsAnswerError extends Error {
  constructor(question: string) {
    super(`kappmaker: needs an answer: "${question.trim()}"`);
    this.name = 'NeedsAnswerError';
  }
}

function explicitlyHeadless(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.KAPPMAKER_NONINTERACTIVE === '1';
}

export interface ConfirmOptions {
  /**
   * The question only re-asks something the caller already agreed to (e.g.
   * "Continue with these settings?" after an MCP `confirm: true`). With
   * KAPPMAKER_ASSUME_YES=1 such a confirm answers yes by itself. Leave unset for
   * questions that would delete data or that nobody has answered yet.
   */
  assumable?: boolean;
  /**
   * The question deletes or clears data. `--yes` does NOT answer it: the
   * command needs its own explicit flag (e.g. --allow-empty, --recreate-stuck).
   */
  destructive?: boolean;
  /**
   * What `--yes` answers (default true). Set false for questions where "yes"
   * would start something nobody asked for: an interactive login, a software
   * install, extra privacy declarations, a submission to review.
   */
  yesAnswer?: boolean;
}

/**
 * `--yes` on the command line (KAPPMAKER_YES=1): every confirmation that is not
 * destructive answers yes. Also turned on by `--config <file>` on the setup
 * commands, because the file already holds the answers.
 */
export function assumeYes(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.KAPPMAKER_YES === '1';
}

export function setAssumeYes(on = true): void {
  if (on) process.env.KAPPMAKER_YES = '1';
}

export async function confirm(message: string, opts: ConfirmOptions = {}): Promise<boolean> {
  if (opts.assumable && process.env.KAPPMAKER_ASSUME_YES === '1') {
    console.log(`${message.trim()} yes (confirmed beforehand)`);
    return true;
  }
  // Under KAPPMAKER_NONINTERACTIVE (the MCP server's children) --yes/--config do
  // not answer: only KAPPMAKER_ASSUME_YES on an assumable re-ask does, so a
  // first-time or destructive question still comes back as NeedsAnswerError.
  if (!opts.destructive && assumeYes() && !explicitlyHeadless()) {
    const answer = opts.yesAnswer !== false;
    console.log(`${message.trim()} ${answer ? 'yes' : 'no'} (--yes)`);
    return answer;
  }
  if (explicitlyHeadless()) throw new NeedsAnswerError(message);
  return ask(`${message} (y/n) `).then((answer) => /^y(es)?$/i.test(answer));
}

export interface PromptInputOptions {
  /** Used when --yes is on, instead of asking. */
  defaultValue?: string;
}

export async function promptInput(message: string, opts: PromptInputOptions = {}): Promise<string> {
  if (opts.defaultValue !== undefined && assumeYes() && !explicitlyHeadless()) {
    console.log(`${message.trim()} ${opts.defaultValue} (--yes default)`);
    return opts.defaultValue;
  }
  if (explicitlyHeadless()) throw new NeedsAnswerError(message);
  return ask(message);
}

// ── Answer source ────────────────────────────────────────────────────
//
// A terminal gets one readline question per prompt. Piped stdin is different:
// the first readline interface used to swallow the whole buffered chunk
// ("y\ny\n"), answer one question and close, so every later prompt saw EOF
// and `printf 'y\ny\n' | kappmaker ...` answered "no". Piped input is now read
// by ONE line reader for the whole process and handed out line by line, in
// order. EOF (or no more lines) counts as an empty answer.

let piped: { lines: string[]; waiters: Array<(line: string) => void>; ended: boolean; rl: readline.Interface } | null = null;

function pipedReader() {
  if (piped) return piped;
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  const state = { lines: [] as string[], waiters: [] as Array<(line: string) => void>, ended: false, rl };
  rl.on('line', (line) => {
    const waiter = state.waiters.shift();
    if (waiter) waiter(line.trim());
    else state.lines.push(line.trim());
    if (state.waiters.length === 0) rl.pause();
  });
  rl.on('close', () => {
    state.ended = true;
    for (const w of state.waiters.splice(0)) w('');
  });
  piped = state;
  return state;
}

function askPiped(question: string): Promise<string> {
  process.stdout.write(question);
  const r = pipedReader();
  const take = (line: string) => {
    process.stdout.write(`${line}\n`);
    return line;
  };
  if (r.lines.length > 0) return Promise.resolve(take(r.lines.shift() as string));
  if (r.ended) return Promise.resolve(take(''));
  return new Promise((resolve) => {
    r.waiters.push((line) => resolve(take(line)));
    r.rl.resume();
  });
}

/** One question. stdin closing before an answer (no terminal, EOF) counts as an empty answer. */
function ask(question: string): Promise<string> {
  if (!process.stdin.isTTY) return askPiped(question);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    let answered = false;
    rl.question(question, (answer) => {
      answered = true;
      rl.close();
      resolve(answer.trim());
    });
    rl.on('close', () => {
      if (!answered) resolve('');
    });
  });
}
