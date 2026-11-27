/**
 * App Army tools in `kappmaker mcp`: the MCP SDK client drives them; ssh, the licence API and local commands are
 * fakes that record what would have left this machine. One case per purchase; secrets checked at every exit.
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
import { fillPage } from './pages.test.helper.js';
import type { Conn } from './army/ssh.js';

const KEY = 'KAM-AAAAA-BBBBB-CCCCC-DDDDD';
const TOKEN = '123456789:AAbbCCddEEffGGhhIIjjKKllMMnnOOppQQ';
const INSTALLER = '#!/usr/bin/env bash\necho installing\n';
const TIERS: Record<string, string> = { 'KAM-MOD00-0': 'app-army-mod', [KEY]: 'app-army', 'KAM-MENTR-0': 'app-army-mentor', 'KAM-BWM00-0': 'build-with-me' };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'km-army-'));
const sshKey = path.join(dir, 'id_test');
fs.writeFileSync(sshKey, 'not a real key', { mode: 0o600 });
const keyFile = (k: string) => { const f = path.join(dir, `lic-${k}`); fs.writeFileSync(f, `${k}\n`, { mode: 0o600 }); return f; };
const PROBE_OK = 'os=Ubuntu 24.04 LTS\nos_id=ubuntu\nos_ver=24.04\nkernel=Linux\narch=x86_64\ncpus=4\nram_mb=8192\nswap_mb=0\ndisk_total_gb=80\ndisk_free_gb=70\nuser=root\nsudo=root\nsystemd=yes\n';

type Ssh = { conn: Conn; remote: string; stdin: string };

async function setup(o: { probe?: string; elicit?: (req: { message: string; requestedSchema: { properties: Record<string, unknown> } }) => Record<string, unknown> | undefined; page?: (msg: string) => Record<string, string> | undefined } = {}) {
  const ssh: Ssh[] = [];
  const posts: string[] = [];
  const execs: { file: string; args: string[]; env?: Record<string, string> }[] = [];
  const server = await createMcpServer({
    version: 'test', secretValues: [], cwd: dir,
    army: {
      ssh: async (conn, remote, stdin) => {
        ssh.push({ conn, remote, stdin });
        if (stdin.includes('os_id=')) return { exitCode: 0, output: o.probe ?? PROBE_OK };
        if (stdin.includes('install.sh')) return { exitCode: 0, output: 'installing\ndoctor: 40 OK · 0 warn · 0 FAIL' };
        return { exitCode: 0, output: 'ok' };
      },
      fetch: async (url, init) => {
        const body = (s: string, status = 200) => ({ ok: status < 300, status, arrayBuffer: async () => new TextEncoder().encode(s).buffer as ArrayBuffer });
        if (url.endsWith('/install.sh')) return body(INSTALLER);
        if (url.endsWith('/install.sh.sha256')) return body(`${createHash('sha256').update(INSTALLER).digest('hex')}  install.sh`);
        posts.push(String(init?.body));
        const b = JSON.parse(String(init?.body));
        const tier = b.code === 'ABCD-EFGH-JKLM' ? 'app-army' : TIERS[b.key];
        return tier ? body(JSON.stringify({ valid: true, tier, activations_used: 0, activations_max: 3 }))
          : body(JSON.stringify({ valid: false, reason: 'invalid_key' }), 403);
      },
      exec: async (file, args, env) => { execs.push({ file, args, env }); return { exitCode: 0, output: 'ok' }; },
    },
  });
  const caps = o.page ? { elicitation: { form: {}, url: {} } } : o.elicit ? { elicitation: {} } : undefined;
  const client = new Client({ name: 't', version: '0' }, caps ? { capabilities: caps } : {});
  if (o.elicit || o.page) {
    client.setRequestHandler(ElicitRequestSchema, async (req) => {
      const p = req.params as { mode?: string; url?: string; message: string };
      if (p.mode === 'url') {
        const v = o.page?.(p.message);
        if (!v) return { action: 'decline' };
        setTimeout(() => void fillPage(p.url!, v), 20);
        return { action: 'accept' };
      }
      if (!o.elicit) return { action: 'decline' };
      const content = o.elicit!(req.params as never);
      return content ? { action: 'accept', content: content as never } : { action: 'decline' };
    });
  }
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = await client.callTool({ name, arguments: args });
    return { body: (r.content as { text: string }[]).map((c) => c.text).join('\n'), isError: Boolean(r.isError) };
  };
  return { call, ssh, posts, execs };
}

const box = { host: '203.0.113.7', ssh_key_path: sshKey };

test('the plan is for exactly what was bought, in plain words', async () => {
  const { call, posts } = await setup();
  const none = await call('army_plan_setup');
  assert.match(none.body, /plugin/);
  assert.equal(posts.length, 0, 'no licence given: nothing sent anywhere');

  const mod = await call('army_plan_setup', { licence_key_file: keyFile('KAM-MOD00-0') });
  assert.match(mod.body, /army_install_plugin/);
  assert.match(mod.body, /GitHub invite/);
  assert.doesNotMatch(mod.body, /army_install_server/);

  const kit = await call('army_plan_setup', { licence_key_file: keyFile(KEY) });
  assert.match(kit.body, /You bought App Army\./);
  assert.match(kit.body, /army_install_server/);
  assert.doesNotMatch(kit.body, /Mentor|mentor|Build With Me|tier/);

  const mentor = await call('army_plan_setup', { licence_key_file: keyFile('KAM-MENTR-0') });
  assert.match(mentor.body, /mentor pack/);
  assert.doesNotMatch(mentor.body, /Build With Me/);

  const bwm = await call('army_plan_setup', { licence_key_file: keyFile('KAM-BWM00-0') });
  assert.match(bwm.body, /mentor pack/);
  assert.match(bwm.body, /book your sessions/);

  const code = await call('army_plan_setup', { install_code: 'ABCD-EFGH-JKLM' });
  assert.match(code.body, /You bought App Army\./);
  assert.ok(posts.every((p) => !p.includes('install_id')), 'the plan check never activates an install');
  for (const r of [mod, kit, mentor, bwm]) assert.ok(!r.body.includes('KAM-'), 'the key is never shown');
});

test('check_server reports size and login problems plainly, over the named host only', async () => {
  const small = PROBE_OK.replace('cpus=4', 'cpus=1').replace('ram_mb=8192', 'ram_mb=2048').replace('sudo=root', 'sudo=password').replace('user=root', 'user=ubuntu');
  const { call, ssh } = await setup({ probe: small });
  const r = await call('army_check_server', { ...box, user: 'ubuntu' });
  assert.match(r.body, /below the recommended 4 vCPU \/ 8 GB \/ 80 GB/);
  assert.match(r.body, /needs a password for sudo/);
  assert.equal(ssh.length, 1);
  assert.equal(ssh[0].conn.host, '203.0.113.7');
  assert.equal(ssh[0].remote, 'bash -s');
  const bad = await call('army_check_server', { ...box, host: '-oProxyCommand=evil' });
  assert.equal(bad.isError, true);
  assert.equal(ssh.length, 1, 'an option-looking host never reaches ssh');
});

test('install: plugin purchase refused, plan first, then the official installer with the key on stdin only', async () => {
  const { call, ssh } = await setup();
  const mod = await call('army_install_server', { ...box, licence_key_file: keyFile('KAM-MOD00-0'), confirm: true });
  assert.equal(mod.isError, true);
  assert.match(mod.body, /does not include a server install/);
  assert.equal(ssh.length, 0);

  const plan = await call('army_install_server', { ...box, licence_key_file: keyFile(KEY) });
  assert.match(plan.body, /^PLAN for App Army on 203\.0\.113\.7/);
  assert.ok(ssh.every((s) => !s.stdin.includes('install.sh')), 'the plan runs only the read-only check');

  const run = await call('army_install_server', { ...box, licence_key_file: keyFile(KEY), confirm: true });
  assert.equal(run.isError, false, run.body);
  const inst = ssh.find((s) => s.stdin.includes('install.sh'))!;
  assert.equal(inst.remote, 'bash -s');
  assert.ok(inst.stdin.includes(INSTALLER.trim()), 'the verified installer is what runs');
  assert.ok(inst.stdin.includes(`KAPPMAKER_LICENSE_KEY='${KEY}'`));
  assert.match(inst.stdin, /bash "\$d\/install.sh" '--server' '--yes' '--no-start' '--sudo' 'limited'/);
  assert.ok(!inst.remote.includes(KEY) && !run.body.includes(KEY));
  assert.doesNotMatch(inst.stdin, /mentor install/);

  await call('army_install_server', { ...box, licence_key_file: keyFile('KAM-MENTR-0'), confirm: true });
  assert.match(ssh.at(-1)!.stdin, /kappmaker-army mentor install/);
});

test('secrets go in on a one-time local page (URL elicitation), never a form or tool output', async () => {
  const asked: string[] = [];
  const formAsks: string[] = [];
  const { call, ssh } = await setup({
    elicit: (req) => { formAsks.push(req.message); return undefined; },
    page: (msg): Record<string, string> => { asked.push(msg); return /bot/i.test(msg) && !/install code/i.test(msg) ? { bot_token: TOKEN } : { code_or_key: 'ABCD-EFGH-JKLM' }; },
  });
  const inst = await call('army_install_server', { ...box, confirm: true });
  assert.equal(inst.isError, false, inst.body);
  assert.match(ssh.at(-1)!.stdin, /'--code' 'ABCD-EFGH-JKLM'/);

  const add = await call('army_add_worker', { ...box, name: 'main', confirm: true });
  assert.equal(add.isError, false, add.body);
  assert.equal(asked.length, 2);
  assert.deepEqual(formAsks, [], 'no secret is ever asked for in a form');
  const w = ssh.at(-1)!;
  assert.ok(w.stdin.includes(TOKEN) && !w.remote.includes(TOKEN), 'token only in the stdin script');
  assert.match(w.stdin, /--token-stdin/);
  assert.equal(w.remote, "runuser -l army -c 'bash -s'");
  assert.ok(!add.body.includes(TOKEN) && !inst.body.includes('ABCD-EFGH-JKLM'));
});

test('without elicitation: exact commands for the user instead of asking for secrets in chat', async () => {
  const { call, ssh } = await setup();
  const inst = await call('army_install_server', { ...box, confirm: true });
  assert.equal(inst.isError, true);
  assert.match(inst.body, /install_code|licence_key_file/);
  const add = await call('army_add_worker', { ...box, user: 'ubuntu', confirm: true });
  assert.match(add.body, /ssh -t -i .*ubuntu@203\.0\.113\.7 .*kappmaker-army worker add main/);
  assert.equal(ssh.length, 0);
});

test('destructive actions need a second yes; changes need confirm', async () => {
  const { call, ssh } = await setup();
  const plan = await call('army_rollback', box);
  assert.match(plan.body, /^PLAN/);
  const once = await call('army_rollback', { ...box, confirm: true });
  assert.equal(once.isError, true);
  assert.match(once.body, /second yes/);
  assert.equal(ssh.length, 0);
  await call('army_rollback', { ...box, confirm: true, confirm_destructive: true });
  assert.match(ssh[0].stdin, /kappmaker-army update --rollback --yes/);

  const yes = await setup({ elicit: () => ({ yes: true }) });
  await yes.call('army_remove_worker', { ...box, name: 'old', confirm: true });
  assert.match(yes.ssh[0].stdin, /worker remove 'old' --yes/);

  const app = await call('army_new_app', { ...box, idea: "a habit tracker for runners; it's fun", confirm: true });
  assert.equal(app.isError, false);
  assert.match(ssh.at(-1)!.stdin, /--app 'a habit tracker for runners; it'\\''s fun'/);
});

test('plugin install runs claude plugin commands locally, isolated from a live Telegram worker', async () => {
  const { call, execs } = await setup();
  assert.match((await call('army_install_plugin')).body, /^PLAN/);
  assert.equal(execs.length, 0);
  await call('army_install_plugin', { confirm: true });
  assert.deepEqual(execs.map((e) => e.args.join(' ')), ['plugin marketplace add KAppMaker/app-army-mod', 'plugin install kappmaker-app-army@app-army-mod']);
  assert.match(execs[0].env!.TELEGRAM_STATE_DIR, /telegram-headless$/);
});
