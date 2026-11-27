import path from 'node:path';
import fs from 'fs-extra';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { needsConfirm, shellQuote, type ToolDef } from './define.js';
import { defaultRunner, type CliRunner } from './runner.js';
import { loadSecretValues, makeRedactor, type Redactor } from './redact.js';
import { explainFailure } from './errors.js';
import { allTools } from './tools/index.js';

export interface ServerOptions {
  version: string;
  runner?: CliRunner;
  /** Base folder for relative project_dir values (default: the server's cwd). */
  cwd?: string;
  /** kappmaker config dir (tests point this at a temp folder). */
  configDir?: string;
  /** Overrides the secret values read from config (tests). */
  secretValues?: string[];
  tools?: ToolDef[];
}

const MAX_OUTPUT = 12_000;
const PROGRESS_EVERY_MS = 5_000;

const INSTRUCTIONS =
  'KAppMaker builds and ships Kotlin Multiplatform apps (Android + iOS). Start with doctor and config_check; for a new app ' +
  'call create_app_plan. Tools marked long or paid return a plan first; show it to the user and call again with ' +
  'confirm: true only after they agree. Keys and accounts are set by the user in a terminal (`kappmaker config set …`); ' +
  'they are never passed through or shown by these tools. Every tool takes project_dir (the app folder).';

const text = (t: string, isError = false): CallToolResult => ({ content: [{ type: 'text', text: t }], ...(isError ? { isError } : {}) });

function tail(output: string): string {
  const trimmed = output.trim();
  return trimmed.length > MAX_OUTPUT ? `…(earlier output cut)\n${trimmed.slice(-MAX_OUTPUT)}` : trimmed;
}

export async function createMcpServer(opts: ServerOptions): Promise<McpServer> {
  const runner = opts.runner ?? defaultRunner;
  const base = opts.cwd ?? process.cwd();
  const redact: Redactor = makeRedactor(opts.secretValues ?? (await loadSecretValues(opts.configDir)));
  const server = new McpServer({ name: 'kappmaker', version: opts.version }, { instructions: INSTRUCTIONS });

  for (const tool of opts.tools ?? allTools) {
    const gated = needsConfirm(tool.kind);
    const shape: z.ZodRawShape = {
      ...tool.shape,
      project_dir: z.string().optional().describe('App folder to run in (absolute, or relative to where the server started)'),
      ...(gated ? { confirm: z.boolean().optional().describe('true = run it. Leave out first to get the plan, and show it to the user') } : {}),
    };
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: `${tool.description}${gated ? ` [${tool.kind}: returns a plan unless confirm is true]` : ''}`,
        inputSchema: shape,
        annotations: {
          title: tool.title,
          readOnlyHint: tool.kind === 'read',
          destructiveHint: tool.kind === 'long',
          openWorldHint: Boolean(tool.network),
        },
      },
      async (input: Record<string, unknown>, extra) => {
        const cwd = path.resolve(base, typeof input.project_dir === 'string' ? input.project_dir : '.');
        if (!(await fs.pathExists(cwd))) {
          return text(`project_dir does not exist: ${cwd}. Fix: pass the app folder (e.g. "MyApp-All"), or clone it first with clone_template.`, true);
        }
        if (tool.type === 'local') {
          return text(redact(await tool.run(input, { cwd, configDir: opts.configDir })));
        }

        const commands = tool.commands(input);
        const shown = commands.map((args) => `kappmaker ${args.map(shellQuote).join(' ')}`);
        if (gated && input.confirm !== true) {
          const note = tool.planNote?.(input);
          return text(redact([
            `PLAN (${tool.kind}, nothing has run yet)`,
            `In: ${cwd}`,
            ...shown.map((s) => `Runs: ${s}`),
            ...(note ? [note] : []),
            'Show this to the user. To run it, call the same tool again with the same arguments plus confirm: true.',
          ].join('\n')));
        }

        const progressToken = extra._meta?.progressToken;
        let last = 0;
        let ticks = 0;
        const onOutput = progressToken === undefined ? undefined : (chunk: string) => {
          const now = Date.now();
          if (now - last < PROGRESS_EVERY_MS) return;
          last = now;
          const line = chunk.trim().split('\n').pop()?.slice(0, 200) ?? '';
          void extra.sendNotification({
            method: 'notifications/progress',
            params: { progressToken, progress: ++ticks, message: redact(line) },
          }).catch(() => undefined);
        };

        const logs: string[] = [];
        for (let i = 0; i < commands.length; i++) {
          const res = await runner({ args: commands[i], cwd, assumeYes: gated, onOutput, signal: extra.signal });
          const out = redact(tail(res.output));
          if (res.exitCode !== 0) {
            const why = explainFailure(res.output);
            return text([
              `FAILED (exit ${res.exitCode}): ${shown[i]}`,
              ...(why ? [why] : []),
              ...logs,
              '--- output ---',
              out || '(no output)',
            ].join('\n'), true);
          }
          logs.push(`OK: ${shown[i]}`, out);
        }
        return text(logs.join('\n'));
      },
    );
  }
  return server;
}
