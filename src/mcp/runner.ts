import { execa } from 'execa';

/**
 * Runs one `kappmaker <args>` as a CHILD process. The MCP server never calls
 * command functions in-process: they print progress, spinners and prompts on
 * stdout, and stdout is the MCP stdio channel. A child also keeps one command's
 * `process.exit()` from killing the server.
 */

export interface RunRequest {
  args: string[];
  cwd: string;
  /** Answer "yes" to confirms the caller already agreed to (see ConfirmOptions.assumable). */
  assumeYes: boolean;
  /** Called with each chunk of output, for MCP progress notifications. */
  onOutput?: (chunk: string) => void;
  signal?: AbortSignal;
}

export interface RunResult {
  exitCode: number;
  /** stdout + stderr interleaved, ANSI stripped. Not yet redacted. */
  output: string;
}

export type CliRunner = (req: RunRequest) => Promise<RunResult>;

/** How to start this same CLI again: same node, same loader flags (tsx in dev), same entry script. */
export function selfCommand(): { file: string; prefix: string[] } {
  const override = process.env.KAPPMAKER_MCP_SELF; // tests / unusual installs: "node /path/to/index.js"
  if (override) {
    const [file, ...prefix] = override.split(' ').filter(Boolean);
    return { file, prefix };
  }
  return { file: process.execPath, prefix: [...process.execArgv, process.argv[1]] };
}

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07/g;

export function stripAnsi(text: string): string {
  // Spinners redraw with \r; keep only the last state of each line.
  return text
    .replace(ANSI, '')
    .split('\n')
    .map((line) => line.split('\r').filter(Boolean).pop() ?? '')
    .join('\n');
}

export const defaultRunner: CliRunner = async ({ args, cwd, assumeYes, onOutput, signal }) => {
  const self = selfCommand();
  const child = execa(self.file, [...self.prefix, ...args], {
    cwd,
    stdin: 'ignore',
    all: true,
    reject: false,
    cancelSignal: signal,
    env: {
      KAPPMAKER_NONINTERACTIVE: '1',
      KAPPMAKER_ASSUME_YES: assumeYes ? '1' : '0',
      NO_COLOR: '1',
      FORCE_COLOR: '0',
    },
  });
  if (onOutput) child.all?.on('data', (buf: Buffer) => onOutput(buf.toString()));
  const result = await child;
  return {
    exitCode: typeof result.exitCode === 'number' ? result.exitCode : 1,
    output: stripAnsi(String(result.all ?? '')),
  };
};
