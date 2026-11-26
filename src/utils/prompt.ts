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

export async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/n) `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

export async function promptInput(message: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(message, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}
