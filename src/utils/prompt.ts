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
}

export async function confirm(message: string, opts: ConfirmOptions = {}): Promise<boolean> {
  if (opts.assumable && process.env.KAPPMAKER_ASSUME_YES === '1') {
    console.log(`${message.trim()} yes (confirmed beforehand)`);
    return true;
  }
  if (explicitlyHeadless()) throw new NeedsAnswerError(message);
  return ask(`${message} (y/n) `).then((answer) => answer.toLowerCase() === 'y');
}

export async function promptInput(message: string): Promise<string> {
  if (explicitlyHeadless()) throw new NeedsAnswerError(message);
  return ask(message);
}

/** One readline question. stdin closing before an answer (no terminal, EOF) counts as an empty answer. */
function ask(question: string): Promise<string> {
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
