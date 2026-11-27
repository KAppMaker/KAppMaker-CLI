import type { z } from 'zod';

/**
 * How a tool is gated:
 *  - read:  looks only; runs straight away.
 *  - write: changes local files, quick, undoable with git; runs straight away.
 *  - long:  minutes of work, creates things on a store/cloud, or rewrites a project.
 *  - paid:  spends money on the buyer's own AI account (fal.ai, OpenAI).
 * long and paid return a PLAN first and run only when called again with `confirm: true`.
 */
export type ToolKind = 'read' | 'write' | 'long' | 'paid';

interface Base<S extends z.ZodRawShape> {
  name: string;
  title: string;
  /** What it does, when to use it, what it needs. Agents read this to pick the tool. */
  description: string;
  kind: ToolKind;
  /** Talks to a service on the internet (stores, Firebase, fal.ai, GitHub). */
  network?: boolean;
  shape: S;
}

/** A tool that runs one or more `kappmaker …` commands in a child process. */
export interface CliTool<S extends z.ZodRawShape = z.ZodRawShape> extends Base<S> {
  type: 'cli';
  /** Argument lists, run in order; the first failure stops the rest. */
  commands: (input: z.infer<z.ZodObject<S>>) => string[][];
  /** Extra line in the plan, e.g. what it costs or what it uploads. */
  planNote?: (input: z.infer<z.ZodObject<S>>) => string;
}

/** One field the user fills in a form their AI client shows (MCP elicitation). The value reaches this server only. */
export interface AskField {
  name: string;
  title: string;
  description: string;
  kind?: 'string' | 'boolean';
}

export interface LocalCtx {
  cwd: string;
  configDir?: string;
  /** True when the client can show the user a form (MCP elicitation). Forms are for yes/no only: never for secrets. */
  canAsk: boolean;
  /** Shows the form; undefined when the user declined or the client cannot. */
  ask: (message: string, fields: AskField[]) => Promise<Record<string, string | boolean> | undefined>;
  /** True when the client can open a page for the user (URL-mode elicitation): the only way secrets are asked for. */
  canAskUrl: boolean;
  /** Asks the client to open `url` (a one-time page of this process); true when the user agreed to open it. */
  askUrl: (message: string, url: string, id: string) => Promise<boolean>;
  /** Tells the client the page was filled in (notifications/elicitation/complete); best effort. */
  urlDone?: (id: string) => void;
  /** Values that must be masked if they ever show up in output (e.g. a token the user typed). */
  secrets: string[];
  progress: (message: string) => void;
  signal?: AbortSignal;
  army: ArmyDeps;
}

/** What the App Army tools reach outside this process; tests replace each one. */
export interface ArmyDeps {
  ssh: import('./army/ssh.js').SshRunner;
  fetch: import('./army/licence.js').HttpFetch;
  /** Runs a local command (the plugin install), e.g. `claude plugin install …`. */
  exec: (file: string, args: string[], env?: Record<string, string>) => Promise<{ exitCode: number; output: string }>;
}

/** A tool answered in-process (never prints to stdout, never prompts on a terminal). */
export interface LocalTool<S extends z.ZodRawShape = z.ZodRawShape> extends Base<S> {
  type: 'local';
  /** `confirm` is added by the server for long/paid tools. */
  run: (input: z.infer<z.ZodObject<S>> & { confirm?: boolean }, ctx: LocalCtx) => Promise<string | { text: string; isError: true }>;
}

export type ToolDef = CliTool<any> | LocalTool<any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const cli = <S extends z.ZodRawShape>(t: Omit<CliTool<S>, 'type'>): CliTool<S> => ({ ...t, type: 'cli' });
export const local = <S extends z.ZodRawShape>(t: Omit<LocalTool<S>, 'type'>): LocalTool<S> => ({ ...t, type: 'local' });

/** Appends `--flag value` only when the value is set; booleans become a bare `--flag`. */
export function flags(map: Record<string, string | number | boolean | string[] | undefined>): string[] {
  const out: string[] = [];
  for (const [flag, value] of Object.entries(map)) {
    if (value === undefined || value === false || value === '') continue;
    if (value === true) out.push(flag);
    else if (Array.isArray(value)) {
      if (value.length) out.push(flag, ...value);
    } else out.push(flag, String(value));
  }
  return out;
}

export const needsConfirm = (kind: ToolKind): boolean => kind === 'long' || kind === 'paid';

/** Quote one argv entry for display in a plan (never used to execute). */
export function shellQuote(arg: string): string {
  return /^[A-Za-z0-9_./:@%+=,-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, `'\\''`)}'`;
}
