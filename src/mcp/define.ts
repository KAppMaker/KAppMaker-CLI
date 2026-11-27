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

/** A tool answered in-process from local files (never prints, never prompts). */
export interface LocalTool<S extends z.ZodRawShape = z.ZodRawShape> extends Base<S> {
  type: 'local';
  run: (input: z.infer<z.ZodObject<S>>, ctx: { cwd: string; configDir?: string }) => Promise<string>;
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
