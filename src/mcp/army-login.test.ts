/**
 * army_claude_login against a fake server that answers like the real one did in the W11 end-to-end test:
 * Claude prints the sign-in link as an OSC-8 hyperlink, and the login pane is 50 rows with the paste prompt near
 * the top. Run: npx tsx --test src/mcp/army-login.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createMcpServer } from './server.js';
import { fillPage } from './pages.test.helper.js';
import { firstLink, plainTerminal } from './army/common.js';

const LINK = 'https://claude.ai/oauth/authorize?z-kYpN7wrhnmN7o9hDzxNqZ1kdVAcq4vV_v-A2gRxfTgo';
const ESC = '\x1b';
// What `claude auth login` printed: the link inside an OSC-8 escape, then the same link as text, no space between.
const HYPERLINK = `${ESC}]8;;${LINK}${ESC}\\${LINK}${ESC}]8;;${ESC}\\`;
const LOGIN_SCREEN = ['Opening browser to sign in…', "If the browser didn't open, visit:", HYPERLINK, 'Paste code here if prompted >'];
const PANE_50_ROWS = [...LOGIN_SCREEN, ...Array(46).fill('')].join('\n');
const CODE = 'abcDEF123_sign-in-code#state';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'km-login-'));
const sshKey = path.join(dir, 'id_test');
fs.writeFileSync(sshKey, 'not a real key', { mode: 0o600 });
const box = { host: '203.0.113.7', ssh_key_path: sshKey };

async function setup() {
  const sent: string[] = [];
  let loggedIn = false;
  const server = await createMcpServer({
    version: 'test', secretValues: [], cwd: dir,
    army: {
      ssh: async (_conn, _remote, stdin) => {
        sent.push(stdin);
        if (stdin.includes('tmux load-buffer')) { loggedIn = stdin.includes(CODE); return { exitCode: 0, output: '' }; }
        if (stdin.includes('claude auth status')) return { exitCode: 0, output: loggedIn ? 'LOGGED_IN=yes' : 'LOGGED_IN=no' };
        if (stdin.includes('tmux new-session')) return { exitCode: 0, output: `${PANE_50_ROWS}\n\n${LOGIN_SCREEN.join('\n')}` };
        if (stdin.includes('capture-pane')) {
          // Run the tool's real script in bash, with a stand-in tmux that prints the 50-row pane and the login log
          // where the real one is, so whatever filtering the tool does is exercised as on the server.
          const { execFileSync } = await import('node:child_process');
          const home = fs.mkdtempSync(path.join(dir, 'home-'));
          fs.mkdirSync(path.join(home, '.army', 'state'), { recursive: true });
          fs.writeFileSync(path.join(home, '.army', 'state', 'claude-login.log'), `${LOGIN_SCREEN.join('\n')}\n`);
          fs.writeFileSync(path.join(home, 'pane'), `${PANE_50_ROWS}\n`);
          const fakeTmux = 'tmux() { [ "$1" = capture-pane ] && cat "$HOME/pane"; return 0; }\n';
          return { exitCode: 0, output: execFileSync('bash', ['-s'], { input: fakeTmux + stdin, env: { ...process.env, HOME: home } }).toString() };
        }
        return { exitCode: 0, output: '' };
      },
      fetch: async () => { throw new Error('no network in this test'); },
      exec: async () => ({ exitCode: 0, output: '' }),
    },
  });
  const client = new Client({ name: 't', version: '0' }, { capabilities: { elicitation: { form: {}, url: {} } } });
  client.setRequestHandler(ElicitRequestSchema, async (req) => {
    const p = req.params as { mode?: string; url?: string };
    if (p.mode !== 'url') return { action: 'decline' };
    setTimeout(() => void fillPage(p.url!, { code: CODE }), 20);
    return { action: 'accept' };
  });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = async (args: Record<string, unknown>) => {
    const r = await client.callTool({ name: 'army_claude_login', arguments: { ...box, ...args } });
    return { body: (r.content as { text: string }[]).map((c) => c.text).join('\n'), isError: Boolean(r.isError) };
  };
  return { call, sent };
}

test('plainTerminal / firstLink: one clean link out of an OSC-8 hyperlink printed twice', () => {
  assert.equal(firstLink(`${HYPERLINK}\n${HYPERLINK}`), LINK);
  assert.doesNotMatch(plainTerminal(HYPERLINK), /\x1b/);
});

test('start hands back the sign-in link once, with no escape codes', async () => {
  const { call } = await setup();
  const r = await call({ action: 'start' });
  assert.equal(r.isError, false, r.body);
  assert.equal(r.body.split(LINK).length - 1, 1, `the link exactly once:\n${JSON.stringify(r.body)}`);
  assert.doesNotMatch(r.body, /\x1b|\]8;;/);
});

test('finish sees the paste prompt in a 50-row pane and takes the code on the private page, not over ssh', async () => {
  const { call, sent } = await setup();
  const deadline = Date.now() + 5000;
  let r = await call({ action: 'finish' });
  while (/WAITING|private page/i.test(r.body) && !/signed in on/.test(r.body) && Date.now() < deadline) {
    await new Promise((res) => setTimeout(res, 100));
    r = await call({ action: 'finish' });
  }
  assert.match(r.body, /Claude Code is signed in on 203\.0\.113\.7/, r.body);
  assert.doesNotMatch(r.body, /tmux attach/, 'no "ssh in and paste it yourself" fallback');
  const paste = sent.find((s) => s.includes('tmux load-buffer'))!;
  assert.ok(paste, 'the code was sent to the login session');
  assert.ok(!paste.split('\n').some((l) => /^\S*claude\b.*\bauth\b.*\blogin\b/.test(l) && l.includes(CODE)), 'code not on a command line');
});
