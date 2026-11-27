import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { connectAgent, desktopConfigPath, upsertCodexToml } from './mcp-connect.js';

const home = () => fs.mkdtempSync(path.join(os.tmpdir(), 'km-connect-'));

test('codex: adds one kappmaker table with a long timeout and keeps every other line, also on a re-run', () => {
  const before = 'model = "o4"\n\n[mcp_servers.other]\ncommand = "x"\n\n[mcp_servers.kappmaker]\ncommand = "kappmaker"\nargs = ["mcp"]\n\n[mcp_servers.kappmaker.env]\nA = "1"\n\n[profiles.fast]\nmodel = "y"\n';
  const once = upsertCodexToml(before);
  assert.equal(upsertCodexToml(once), once, 'idempotent');
  assert.equal((once.match(/\[mcp_servers\.kappmaker\]/g) ?? []).length, 1);
  assert.doesNotMatch(once, /kappmaker\.env|command = "kappmaker"/);
  assert.match(once, /model = "o4"[\s\S]*\[mcp_servers\.other\][\s\S]*\[profiles\.fast\]/);
  assert.match(once, /args = \["-y", "kappmaker@latest", "mcp"\]\ntool_timeout_sec = 3600/);
});

test('gemini and claude desktop: JSON merged, other servers kept, a bad file is left alone', async () => {
  const h = home();
  const g = path.join(h, '.gemini', 'settings.json');
  fs.mkdirSync(path.dirname(g), { recursive: true });
  fs.writeFileSync(g, JSON.stringify({ theme: 'x', mcpServers: { other: { command: 'o' } } }));
  assert.equal((await connectAgent('gemini', h)).ok, true);
  const gj = JSON.parse(fs.readFileSync(g, 'utf8'));
  assert.equal(gj.theme, 'x');
  assert.deepEqual(gj.mcpServers.other, { command: 'o' });
  assert.deepEqual(gj.mcpServers.kappmaker, { command: 'npx', args: ['-y', 'kappmaker@latest', 'mcp'], timeout: 3_600_000 });

  const d = desktopConfigPath(h);
  assert.equal((await connectAgent('claude-desktop', h)).ok, true);
  const dj = JSON.parse(fs.readFileSync(d, 'utf8'));
  assert.ok(path.isAbsolute(dj.mcpServers.kappmaker.command) || dj.mcpServers.kappmaker.command === 'npx');
  assert.ok(dj.mcpServers.kappmaker.env.PATH.includes(path.dirname(process.execPath)), 'GUI app can find node');

  fs.writeFileSync(d, '{ not json');
  await assert.rejects(connectAgent('claude-desktop', h), /not valid JSON/);
  assert.equal(fs.readFileSync(d, 'utf8'), '{ not json');
  assert.equal((await connectAgent('nope', h)).ok, false);
});
