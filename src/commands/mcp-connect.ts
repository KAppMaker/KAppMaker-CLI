import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { execa } from 'execa';

/**
 * `kappmaker mcp connect <agent>`: one line that registers `kappmaker mcp` with an AI app, through npx so nothing has
 * to be installed first. Writes only that app's own MCP config (one entry named kappmaker, everything else kept) and
 * sets the long tool timeout where the app has one (installs and builds take minutes). Sends nothing anywhere.
 */
export const AGENTS = ['claude-code', 'claude-desktop', 'codex', 'gemini'] as const;
export type Agent = (typeof AGENTS)[number];
export const NPX_ARGS = ['-y', 'kappmaker@latest', 'mcp'];
const TIMEOUT_S = 3600;

/** npx next to the running node: GUI apps (Claude desktop) do not see the shell PATH, so give them full paths. */
function npxBeside(): { command: string; binDir: string } {
  const binDir = path.dirname(process.execPath);
  const name = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const full = path.join(binDir, name);
  return { command: fs.existsSync(full) ? full : name, binDir };
}

export function desktopConfigPath(home = os.homedir()): string {
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  if (process.platform === 'win32') return path.join(process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json');
  return path.join(home, '.config', 'Claude', 'claude_desktop_config.json');
}

function readJson(file: string): Record<string, unknown> {
  if (!fs.existsSync(file)) return {};
  const text = fs.readFileSync(file, 'utf8').trim();
  if (!text) return {};
  try {
    const v = JSON.parse(text);
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch { /* fall through */ }
  throw new Error(`${file} is not valid JSON, so it was left alone. Fix it (or move it away) and run this again.`);
}

function writeJsonServer(file: string, entry: Record<string, unknown>): void {
  const cfg = readJson(file);
  const servers = (cfg.mcpServers && typeof cfg.mcpServers === 'object' ? cfg.mcpServers : {}) as Record<string, unknown>;
  servers.kappmaker = entry;
  cfg.mcpServers = servers;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`);
  fs.writeFileSync(file, `${JSON.stringify(cfg, null, 2)}\n`);
}

/** Replaces (or adds) the [mcp_servers.kappmaker] table in Codex's config.toml, leaving every other line as it was. */
export function upsertCodexToml(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let skipping = false;
  for (const line of lines) {
    const header = line.trim().match(/^\[([^\]]+)\]$/);
    if (header) skipping = header[1] === 'mcp_servers.kappmaker' || header[1].startsWith('mcp_servers.kappmaker.');
    if (!skipping) out.push(line);
  }
  const body = out.join('\n').replace(/\n+$/, '');
  const block = [
    '[mcp_servers.kappmaker]', 'command = "npx"', `args = [${NPX_ARGS.map((a) => JSON.stringify(a)).join(', ')}]`, `tool_timeout_sec = ${TIMEOUT_S}`,
  ].join('\n');
  return `${body ? `${body}\n\n` : ''}${block}\n`;
}

/** Does the registration; returns what to tell the user. */
export async function connectAgent(agent: string, home = os.homedir()): Promise<{ ok: boolean; message: string }> {
  const restart = 'Restart it (or open a new session), then say: "Set up App Army on my server at <ip>".';
  switch (agent as Agent) {
    case 'claude-code': {
      const args = ['mcp', 'add', '--scope', 'user', 'kappmaker', '--', 'npx', ...NPX_ARGS];
      const r = await execa('claude', args, { reject: false, all: true, stdin: 'ignore' }).catch(() => undefined);
      if (!r || r.exitCode !== 0) {
        if (r && /already exists/i.test(String(r.all))) return { ok: true, message: `Claude Code already has kappmaker. ${restart}` };
        return { ok: false, message: `Could not run Claude Code's own command. Run it yourself:\n  claude ${args.join(' ')}` };
      }
      return { ok: true, message: `Connected to Claude Code. ${restart}` };
    }
    case 'claude-desktop': {
      const { command, binDir } = npxBeside();
      const file = desktopConfigPath(home);
      const sep = process.platform === 'win32' ? ';' : ':';
      writeJsonServer(file, { command, args: NPX_ARGS, env: { PATH: [binDir, '/usr/local/bin', '/opt/homebrew/bin', '/usr/bin', '/bin'].join(sep) } });
      return { ok: true, message: `Connected to the Claude desktop app (${file}). Quit and reopen the app. Then say: "Set up App Army on my server at <ip>".` };
    }
    case 'codex': {
      const file = path.join(process.env.CODEX_HOME ?? path.join(home, '.codex'), 'config.toml');
      const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
      fs.mkdirSync(path.dirname(file), { recursive: true });
      if (before) fs.copyFileSync(file, `${file}.bak`);
      fs.writeFileSync(file, upsertCodexToml(before));
      return { ok: true, message: `Connected to Codex (${file}, tool timeout ${TIMEOUT_S} s). ${restart}` };
    }
    case 'gemini': {
      const file = path.join(home, '.gemini', 'settings.json');
      writeJsonServer(file, { command: 'npx', args: NPX_ARGS, timeout: TIMEOUT_S * 1000 });
      return { ok: true, message: `Connected to Gemini CLI (${file}). ${restart}` };
    }
    default:
      return { ok: false, message: `Which AI app? Use one of: ${AGENTS.join(', ')}. Example: npx -y kappmaker@latest mcp connect claude-desktop` };
  }
}
