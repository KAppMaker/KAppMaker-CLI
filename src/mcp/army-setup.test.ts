/**
 * army_setup, the golden path in one tool, driven by the MCP SDK client against a fake server that changes state the
 * way a real one does: install runs detached, then Claude sign-in, the bot token (private form), the first message,
 * "is that you?", READY. Secrets are checked in every answer and in what would have left this machine.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createMcpServer } from './server.js';

const CODE = 'ABCD-EFGH-JKLM';
const TOKEN = '123456789:AAbbCCddEEffGGhhIIjjKKllMMnnOOppQQ';
const INSTALLER = '#!/usr/bin/env bash\necho installing\n';
const PROBE_OK = 'os=Ubuntu 24.04 LTS\nos_id=ubuntu\nos_ver=24.04\nkernel=Linux\narch=x86_64\ncpus=4\nram_mb=8192\nswap_mb=0\ndisk_total_gb=80\ndisk_free_gb=70\nuser=root\nsudo=root\nsystemd=yes\n';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'km-setup-'));
const sshKey = path.join(dir, 'id_test');
fs.writeFileSync(sshKey, 'not a real key', { mode: 0o600 });
const box = { host: '203.0.113.7', ssh_key_path: sshKey };

/** A server that moves on as the steps happen. `sudoFull` = root login is refused once the install is done. */
function fakeServer(o: { sudoFull?: boolean; oldKit?: boolean; failInstall?: boolean } = {}) {
  const s = { install: 'none' as 'none' | 'running' | 'done' | 'failed', polls: 0, claude: false, login: false, token: false, pending: false, paired: false, greeted: false };
  const sent: { user: string; remote: string; stdin: string }[] = [];
  const ssh = async (conn: { user: string }, remote: string, stdin: string) => {
    sent.push({ user: conn.user, remote, stdin });
    if (o.sudoFull && s.install === 'done' && conn.user === 'root') return { exitCode: 255, output: 'root@203.0.113.7: Permission denied (publickey).' };
    if (stdin.includes('os_id=')) return { exitCode: 0, output: PROBE_OK };
    if (stdin.includes('KAPPMAKER_SETUP_EOF')) { s.install = 'running'; return { exitCode: 0, output: 'STARTED' }; }
    if (stdin.includes('tail -n 40')) return { exitCode: 0, output: 'E: apt failed' };
    if (stdin.includes('install_step=')) {
      if (s.install === 'running' && ++s.polls >= 2) s.install = o.failInstall ? 'failed' : 'done';
      const kv = [];
      if (s.install === 'running') kv.push('install=running', 'install_step=Server setup (toolchain)', 'install_started=1000', 'now=1600');
      if (s.install === 'failed') kv.push('install_rc=1', 'install_step=Server setup (toolchain)');
      if (s.install === 'done') {
        kv.push('install_rc=0', 'army=installed', `claude=${s.claude ? 'yes' : 'no'}`, `token=${s.token ? 'present' : 'missing'}`, `paired=${s.paired ? 'yes' : 'no'}`);
        if (s.login) kv.push('login_session=yes');
        if (s.token) kv.push('bot=acme_bot');
      }
      return { exitCode: 0, output: kv.join('\n') };
    }
    if (stdin.includes('claude auth status')) return { exitCode: 0, output: s.claude ? 'LOGGED_IN=yes' : 'LOGGED_IN=no' };
    if (stdin.includes('claude auth login')) { s.login = true; return { exitCode: 0, output: 'Open https://claude.ai/oauth/authorize?code=xyz to sign in' }; }
    if (stdin.includes('capture-pane')) { s.claude = true; return { exitCode: 0, output: 'Login successful' }; }
    if (stdin.includes('worker add')) { s.token = true; return { exitCode: 0, output: 'token: saved for @acme_bot' }; }
    if (stdin.includes('worker pair')) {
      if (o.oldKit) return { exitCode: 2, output: 'kappmaker-army worker add <name> ...' };
      if (stdin.includes('--approve')) { s.paired = true; s.greeted = true; return { exitCode: 0, output: 'bot=acme_bot\nstate=paired\ngreeted=yes' }; }
      if (s.paired) return { exitCode: 0, output: 'bot=acme_bot\nstate=paired' };
      if (!s.pending) { s.pending = true; return { exitCode: 0, output: 'bot=acme_bot\nstate=none' }; }
      return { exitCode: 0, output: 'bot=acme_bot\nstate=pending\ncode=abc123\nsender=4242\nwho=Ada (@ada)' };
    }
    return { exitCode: 0, output: 'ok' };
  };
  return { s, sent, ssh };
}

async function connect(server: ReturnType<typeof fakeServer>, elicit?: (msg: string) => Record<string, unknown> | undefined) {
  const posts: string[] = [];
  const mcp = await createMcpServer({
    version: 'test', secretValues: [], cwd: dir,
    army: {
      ssh: server.ssh as never,
      fetch: async (url, init) => {
        const body = (t: string, status = 200) => ({ ok: status < 300, status, arrayBuffer: async () => new TextEncoder().encode(t).buffer as ArrayBuffer });
        if (url.endsWith('/install.sh')) return body(INSTALLER);
        if (url.endsWith('/install.sh.sha256')) return body(`${createHash('sha256').update(INSTALLER).digest('hex')}  install.sh`);
        posts.push(String(init?.body));
        return body(JSON.stringify({ valid: true, tier: 'app-army', activations_used: 0, activations_max: 3 }));
      },
      exec: async () => ({ exitCode: 0, output: 'ok' }),
    },
  });
  const client = new Client({ name: 't', version: '0' }, elicit ? { capabilities: { elicitation: {} } } : {});
  if (elicit) {
    client.setRequestHandler(ElicitRequestSchema, async (req) => {
      const c = elicit((req.params as { message: string }).message);
      return c ? { action: 'accept', content: c as never } : { action: 'decline' };
    });
  }
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([mcp.connect(a), client.connect(b)]);
  return async (args: Record<string, unknown> = {}) => {
    const r = await client.callTool({ name: 'army_setup', arguments: { ...box, ...args } });
    return { body: (r.content as { text: string }[]).map((c) => c.text).join('\n'), isError: Boolean(r.isError) };
  };
}

test('one sentence: plan, install, sign-in link, token form, "is that you?", READY', async () => {
  const srv = fakeServer();
  const asked: string[] = [];
  const call = await connect(srv, (msg) => {
    asked.push(msg);
    if (/install code/i.test(msg)) return { code_or_key: CODE };
    if (/bot token/i.test(msg)) return { token: TOKEN };
    if (/Is that you\?/.test(msg)) return { me: true };
    return undefined;
  });
  const plan = await call();
  assert.match(plan.body, /^PLAN: set up App Army on 203\.0\.113\.7/);
  assert.match(plan.body, /Your App Army is ready\. Tell me your app idea\./);
  assert.ok(!srv.sent.some((x) => x.stdin.includes('KAPPMAKER_SETUP_EOF')), 'nothing installed before the yes');

  const started = await call({ confirm: true });
  assert.match(started.body, /^INSTALLING .*started/);
  const inst = srv.sent.find((x) => x.stdin.includes('KAPPMAKER_SETUP_EOF'))!;
  assert.match(inst.stdin, /nohup \$SETSID bash/, 'install runs detached');
  assert.match(inst.stdin, /'--code' 'ABCD-EFGH-JKLM'/);
  assert.doesNotMatch(inst.remote, /ABCD|install/, 'nothing secret on the ssh command line');

  const busy = await call();
  assert.match(busy.body, /^INSTALLING on 203\.0\.113\.7 \(10 min so far\): Server setup/);
  const login = await call();
  assert.match(login.body, /^WAITING FOR YOU: .*https:\/\/claude\.ai\/oauth/s);
  const signedIn = await call();
  assert.match(signedIn.body, /signed in/);
  const bot = await call();
  assert.match(bot.body, /WAITING FOR YOU: open your new bot/);
  const tokenRun = srv.sent.find((x) => x.stdin.includes('worker add'))!;
  assert.ok(tokenRun.stdin.includes(TOKEN) && !tokenRun.remote.includes(TOKEN), 'token only on ssh stdin');
  const wait = await call();
  assert.match(wait.body, /^WAITING FOR YOU: on your phone, open https:\/\/t\.me\/acme_bot/);
  const ready = await call();
  assert.match(ready.body, /^READY\. .*It just wrote to you on Telegram: "Your App Army is ready\. Tell me your app idea\."/s);
  assert.ok(asked.some((m) => /Ada \(@ada\) \(Telegram id 4242\)\. Is that you\?/.test(m)));
  assert.ok(srv.s.greeted);
  const again = await call();
  assert.match(again.body, /^READY\. .*@acme_bot answers only you/s);
  for (const r of [plan, started, busy, login, signedIn, bot, wait, ready, again]) {
    assert.ok(!r.body.includes(TOKEN) && !r.body.includes(CODE), 'no secret in any answer');
  }
});

test('no forms: pairing waits for the user\'s yes in chat and the sender they confirmed', async () => {
  const srv = fakeServer();
  Object.assign(srv.s, { install: 'done', claude: true, token: true });
  const call = await connect(srv);
  assert.match((await call()).body, /WAITING FOR YOU/);
  const ask = await call();
  assert.match(ask.body, /^ASK THE USER: someone just messaged @acme_bot: Ada/);
  assert.equal(srv.s.paired, false, 'never approved without the user');
  const wrong = await call({ approve_sender: '999' });
  assert.equal(wrong.isError, true);
  assert.equal(srv.s.paired, false);
  assert.match((await call({ approve_sender: '4242' })).body, /^READY\./);
});

test('failed install reports the log; --sudo full falls back to the worker login; old kits get a terminal line', async () => {
  const bad = fakeServer({ failInstall: true });
  const callBad = await connect(bad, (m) => (/install code/i.test(m) ? { code_or_key: CODE } : undefined));
  await call2(callBad);
  const failed = await callBad();
  assert.equal(failed.isError, true);
  assert.match(failed.body, /The install stopped \(exit 1\).*E: apt failed/s);

  const full = fakeServer({ sudoFull: true });
  Object.assign(full.s, { install: 'done', claude: true });
  const callFull = await connect(full, () => ({ token: TOKEN }));
  await callFull();
  assert.ok(full.sent.some((x) => x.user === 'army'), 'retried as the worker user');

  const old = fakeServer({ oldKit: true });
  Object.assign(old.s, { install: 'done', claude: true, token: true });
  const callOld = await connect(old);
  const r = await callOld();
  assert.match(r.body, /run this in your own terminal.*kappmaker-army start --worker main/s);
});

async function call2(call: (a?: Record<string, unknown>) => Promise<unknown>) {
  await call({ confirm: true });
  await call();
}

test('no forms: the bot token can come from a file the user saved; the default SSH key is used when none is named', async () => {
  const srv = fakeServer();
  Object.assign(srv.s, { install: 'done', claude: true });
  const call = await connect(srv);
  const ask = await call();
  assert.match(ask.body, /WAITING FOR YOU: make a Telegram bot .*bot_file/s);
  assert.equal(srv.s.token, false);
  const f = path.join(dir, 'bot.txt');
  fs.writeFileSync(f, `${TOKEN}\n`);
  const done = await call({ bot_file: f });
  assert.match(done.body, /Your bot is connected/);
  assert.ok(!done.body.includes(TOKEN));
  assert.ok(srv.sent.find((x) => x.stdin.includes('worker add'))!.stdin.includes(TOKEN));
});
