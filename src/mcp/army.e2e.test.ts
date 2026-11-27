/**
 * End to end over real SSH: a systemd Ubuntu container from the App Army installer tests plays the buyer's VPS,
 * the real `kappmaker mcp` server (stdio) is driven by the MCP SDK client, and a mock licence API runs inside the
 * container. Opt-in (Docker + the app-army checkout), never against a real server:
 *
 *   KAPPMAKER_MCP_E2E=1 ARMY_REPO=/path/to/app-army npm run test:mcp-e2e
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import net from 'node:net';
import { execFileSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const REPO = process.env.ARMY_REPO ?? '';
const ON = process.env.KAPPMAKER_MCP_E2E === '1' && fs.existsSync(path.join(REPO, 'kit/installer/tests/docker/Dockerfile'));
const IMAGE = process.env.KAPPMAKER_MCP_E2E_IMAGE ?? 'app-army-installer-test:u2204-root-noci';

const sh = (cmd: string, args: string[], input?: string) => execFileSync(cmd, args, { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'] });
const freePort = () => new Promise<number>((res) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = (s.address() as net.AddressInfo).port; s.close(() => res(p)); }); });

test('army tools against a real SSH server in Docker', { skip: !ON && 'set KAPPMAKER_MCP_E2E=1 and ARMY_REPO', timeout: 30 * 60_000 }, async () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'km-e2e-'));
  const tests = path.join(REPO, 'kit/installer/tests');
  const apiPort = await freePort();
  const name = `km-mcp-e2e-${process.pid}`;
  try { sh('docker', ['image', 'inspect', IMAGE]); } catch {
    sh('docker', ['build', '-q', '--build-arg', 'IMAGE=ubuntu:22.04', '--build-arg', 'LOGIN=root', '--build-arg', 'CLOUDINIT=0', '-t', IMAGE, path.join(tests, 'docker')]);
  }
  sh('docker', ['run', '-d', '--name', name, '--privileged', '--cgroupns=host', '-v', '/sys/fs/cgroup:/sys/fs/cgroup:rw', '--tmpfs', '/run', '--tmpfs', '/run/lock',
    '-p', '127.0.0.1::22', '-p', `127.0.0.1:${apiPort}:${apiPort}`, IMAGE]);
  try {
    for (let n = 0; n < 40; n++) {
      try { if (/running|degraded/.test(sh('docker', ['exec', name, 'systemctl', 'is-system-running']))) break; } catch (e) { if (/running|degraded/.test(String((e as { stdout?: string }).stdout))) break; }
      await new Promise((r) => setTimeout(r, 1000));
    }
    // Real releases are the exported tree (symlinks dereferenced); the raw kit has links the installer refuses.
    sh('bash', [path.join(REPO, 'tools/export.sh'), 'core']);
    sh('bash', [path.join(tests, 'make_test_release.sh'), path.join(REPO, 'dist'), path.join(work, 'rel'), '1.0.0-test']);
    fs.copyFileSync(path.join(REPO, 'kit/install.sh'), path.join(work, 'rel/install.sh'));
    sh('docker', ['exec', name, 'mkdir', '-p', '/opt/t']);
    sh('docker', ['cp', path.join(work, 'rel'), `${name}:/opt/t/rel`]);
    sh('docker', ['cp', path.join(tests, 'mock_license_server.py'), `${name}:/opt/t/mock.py`]);
    sh('docker', ['exec', '-d', name, 'python3', '/opt/t/mock.py', '--files', '/opt/t/rel', '--port', String(apiPort), '--bind', '0.0.0.0', '--log', '/opt/t/server.log']);
    sh('docker', ['cp', `${name}:/root/test_id`, path.join(work, 'id_test')]);
    fs.chmodSync(path.join(work, 'id_test'), 0o600);
    fs.writeFileSync(path.join(work, 'licence'), 'GOOD-KEY-0001\n', { mode: 0o600 });
    const sshPort = Number(sh('docker', ['port', name, '22/tcp']).trim().split(':').pop());
    await new Promise((r) => setTimeout(r, 1500));

    const repo = path.resolve(import.meta.dirname, '../..');
    // A client that can show forms: the install code is "typed" by the user into the form, never sent as an argument.
    const asked: string[] = [];
    const client = new Client({ name: 'e2e', version: '0' }, { capabilities: { elicitation: {} } });
    client.setRequestHandler(ElicitRequestSchema, async (req) => {
      asked.push(req.params.message);
      return { action: 'accept', content: { code_or_key: 'CODE-GOOD-1' } };
    });
    await client.connect(new StdioClientTransport({
      command: path.join(repo, 'node_modules/.bin/tsx'), args: [path.join(repo, 'src/index.ts'), 'mcp'], stderr: 'pipe',
      env: { ...process.env as Record<string, string>, KAPPMAKER_API: `http://127.0.0.1:${apiPort}`, KAPPMAKER_SSH_KNOWN_HOSTS: path.join(work, 'known_hosts') },
    }));
    const box = { host: '127.0.0.1', port: sshPort, user: 'root', ssh_key_path: path.join(work, 'id_test') };
    const call = async (n: string, a: Record<string, unknown>) => {
      const r = await client.callTool({ name: n, arguments: a }, undefined, { timeout: 25 * 60_000, resetTimeoutOnProgress: true });
      return { body: (r.content as { text: string }[]).map((c) => c.text).join('\n'), isError: Boolean(r.isError) };
    };
    try {
      const check = await call('army_check_server', box);
      assert.equal(check.isError, false, check.body);
      assert.match(check.body, /Ubuntu 22\.04/);
      assert.match(check.body, /not installed yet/);

      const plan = await call('army_plan_setup', { ...box, licence_key_file: path.join(work, 'licence') });
      assert.match(plan.body, /You bought App Army\./);

      const dry = await call('army_install_server', { ...box, licence_key_file: path.join(work, 'licence'), kit_only: true });
      assert.match(dry.body, /^PLAN for App Army/);

      const inst = await call('army_install_server', { ...box, licence_key_file: path.join(work, 'licence'), kit_only: true, confirm: true });
      assert.equal(inst.isError, false, inst.body);
      assert.ok(!inst.body.includes('GOOD-KEY-0001'), 'the key never shows');

      const status = await call('army_status', box);
      assert.equal(status.isError, false, status.body);
      const doctor = await call('army_doctor', box);
      assert.match(doctor.body, /doctor: \d+ OK/);
      // Re-run (safe to repeat), this time with the licence from the private form: one question, the code redeems.
      const rerun = await call('army_install_server', { ...box, kit_only: true, confirm: true });
      assert.equal(rerun.isError, false, rerun.body);
      assert.equal(asked.length, 1);
      assert.match(sh('docker', ['exec', name, 'cat', '/opt/t/server.log']), /check fields=code/); // the form's code reached the licence check; the installer reused the installed kit
      const again = await call('army_check_server', box);
      assert.match(again.body, /already installed/);
      assert.ok(!sh('docker', ['exec', name, 'cat', '/opt/t/server.log']).includes('GOOD-KEY-0001'), 'the licence API log never sees the full key');
    } finally {
      await client.close();
    }
  } finally {
    if (process.env.KAPPMAKER_MCP_E2E_KEEP !== '1') sh('docker', ['rm', '-f', name]);
    fs.rmSync(work, { recursive: true, force: true });
  }
});
