// Tests for `kappmaker army`: forwarding, exit-code passthrough, the
// checksum gate on install.sh, missing-kit messages and key handling.
// Run: npm run test:army
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { army } from './army.js';
import {
  findKit,
  parseChecksum,
  resolveOrigin,
  runInherited,
  sha256Hex,
  splitInstallArgs,
  type FetchLike,
} from '../services/army.service.js';

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kappmaker-army-test-'));
}

/** A fake kit binary that records its argv and exits with `code`. */
function fakeKit(code: number): { dir: string; log: string } {
  const dir = tmp();
  const log = path.join(dir, 'argv.log');
  const bin = path.join(dir, 'kappmaker-army');
  fs.writeFileSync(bin, `#!/bin/sh\nprintf '%s\\n' "$@" > "${log}"\nexit ${code}\n`, { mode: 0o755 });
  return { dir, log };
}

function quiet() {
  const lines: string[] = [];
  return { lines, out: (l: string) => lines.push(l), err: (l: string) => lines.push(l) };
}

const emptyHome = { HOME: tmp() };

test('forwards args to kappmaker-army and passes its exit code through', async () => {
  const kit = fakeKit(7);
  const q = quiet();
  const code = await army(['worker', 'add', 'app2', '--yes'], { envPath: kit.dir, env: { ...emptyHome, PATH: kit.dir }, ...q });
  assert.equal(code, 7);
  assert.deepEqual(fs.readFileSync(kit.log, 'utf8').trim().split('\n'), ['worker', 'add', 'app2', '--yes']);
});

test('forwards --help and --version to the kit instead of answering itself', async () => {
  const kit = fakeKit(0);
  const code = await army(['doctor', '--help'], { envPath: kit.dir, env: { ...emptyHome, PATH: kit.dir }, ...quiet() });
  assert.equal(code, 0);
  assert.deepEqual(fs.readFileSync(kit.log, 'utf8').trim().split('\n'), ['doctor', '--help']);
});

test('finds the kit under ~/.army/kit/cli when it is not on PATH yet', () => {
  const home = tmp();
  const cli = path.join(home, '.army', 'kit', 'cli');
  fs.mkdirSync(cli, { recursive: true });
  fs.writeFileSync(path.join(cli, 'kappmaker-army'), '#!/bin/sh\n', { mode: 0o755 });
  assert.equal(findKit('/nonexistent', { HOME: home }), path.join(cli, 'kappmaker-army'));
  assert.equal(findKit('/nonexistent', { HOME: tmp() }), null);
});

test('a non-executable file on PATH is not the kit', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'kappmaker-army'), 'not a program', { mode: 0o644 });
  assert.equal(findKit(dir, emptyHome), null);
});

for (const cmd of ['doctor', 'update', 'worker']) {
  test(`'${cmd}' without the kit prints how to install and exits 1`, async () => {
    const q = quiet();
    const code = await army([cmd], { envPath: '/nonexistent', env: emptyHome, ...q });
    assert.equal(code, 1);
    const text = q.lines.join('\n');
    assert.match(text, /not installed/);
    assert.match(text, /kappmaker army install/);
    assert.match(text, /curl -fsSL https:\/\/kappmaker\.com\/install\.sh \| bash/);
    assert.match(text, /--server/);
  });
}

test('passes a signal death through as 128+n', async () => {
  const code = await runInherited('sh', ['-c', 'kill -TERM $$']);
  assert.equal(code, 128 + os.constants.signals.SIGTERM);
});

// ---------------------------------------------------------------- install

const SCRIPT = '#!/usr/bin/env bash\necho installer\n';

function fakeFetch(files: Record<string, string | number>): { fetchImpl: FetchLike; urls: string[]; agents: string[] } {
  const urls: string[] = [];
  const agents: string[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    urls.push(url);
    agents.push(init?.headers?.['User-Agent'] ?? '');
    const name = url.split('/').pop()!;
    const body = files[name];
    if (typeof body === 'number' || body === undefined) {
      return { ok: false, status: typeof body === 'number' ? body : 404, arrayBuffer: async () => new ArrayBuffer(0) };
    }
    const buf = Buffer.from(body);
    return { ok: true, status: 200, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) };
  };
  return { fetchImpl, urls, agents };
}

test('install refuses to run install.sh when the checksum does not match', async () => {
  const { fetchImpl } = fakeFetch({ 'install.sh': SCRIPT, 'install.sh.sha256': `${'0'.repeat(64)}  install.sh\n` });
  let ran = false;
  const q = quiet();
  const code = await army(['install'], {
    env: { ...emptyHome },
    fetchImpl,
    run: async () => { ran = true; return 0; },
    ...q,
  });
  assert.equal(code, 1);
  assert.equal(ran, false, 'install.sh must not run on a checksum mismatch');
  assert.match(q.lines.join('\n'), /Checksum mismatch/);
  assert.match(q.lines.join('\n'), /NOT run/);
});

test('install refuses when the checksum file is missing or malformed', async () => {
  for (const sum of [404, 'not a hash\n'] as const) {
    const { fetchImpl } = fakeFetch({ 'install.sh': SCRIPT, 'install.sh.sha256': sum });
    let ran = false;
    const code = await army(['install'], { env: { ...emptyHome }, fetchImpl, run: async () => { ran = true; return 0; }, ...quiet() });
    assert.equal(code, 1);
    assert.equal(ran, false);
  }
});

test('install runs a verified install.sh with the args, key only in env, and cleans up', async () => {
  const { fetchImpl, urls, agents } = fakeFetch({ 'install.sh': SCRIPT, 'install.sh.sha256': `${sha256Hex(SCRIPT)}  install.sh\n` });
  let seen: { command: string; args: string[]; env: NodeJS.ProcessEnv; script: string } | undefined;
  const q = quiet();
  const key = 'KAM-ABCDE-FGHJK-MNPQR-STVWX';
  const code = await army(['install', '--server', '--key', key, '--dry-run', '--sudo', 'limited'], {
    env: { ...emptyHome },
    fetchImpl,
    run: async (command, args, env) => {
      seen = { command, args, env, script: fs.readFileSync(args[0], 'utf8') };
      return 3;
    },
    ...q,
  });
  assert.equal(code, 3, 'install.sh exit code is passed through');
  assert.deepEqual(urls, ['https://kappmaker.com/install.sh', 'https://kappmaker.com/install.sh.sha256']);
  assert.ok(agents.every((a) => a === 'kappmaker-cli'), 'fixed User-Agent with no OS/version details');
  assert.ok(seen);
  assert.equal(seen.command, 'bash');
  assert.equal(seen.script, SCRIPT);
  assert.deepEqual(seen.args.slice(1), ['--server', '--dry-run', '--sudo', 'limited']);
  assert.equal(seen.env.KAPPMAKER_LICENSE_KEY, key);
  assert.ok(!seen.args.some((a) => a.includes(key)), 'key never on argv');
  assert.ok(!q.lines.some((l) => l.includes(key)), 'key never printed');
  assert.equal(fs.existsSync(seen.args[0]), false, 'temp installer removed afterwards');
});

test('install runs the installer even when the kit is already installed (repair / update)', async () => {
  const kit = fakeKit(0);
  const { fetchImpl } = fakeFetch({ 'install.sh': SCRIPT, 'install.sh.sha256': sha256Hex(SCRIPT) });
  let ranBash = false;
  await army(['install'], {
    envPath: kit.dir,
    env: { ...emptyHome, PATH: kit.dir },
    fetchImpl,
    run: async (command) => { ranBash = command === 'bash'; return 0; },
    ...quiet(),
  });
  assert.equal(ranBash, true);
  assert.equal(fs.existsSync(kit.log), false, 'kappmaker-army was not called');
});

test('install over a real HTTP server on loopback, end to end', async () => {
  const body = '#!/usr/bin/env bash\nprintf "%s|" "$@"; printf "key=%s" "${KAPPMAKER_LICENSE_KEY:-none}"; exit 5\n';
  const server = http.createServer((req, res) => {
    if (req.url === '/install.sh') return res.end(body);
    if (req.url === '/install.sh.sha256') return res.end(`${sha256Hex(body)}  install.sh\n`);
    res.statusCode = 404;
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as { port: number }).port;
  try {
    let output = '';
    const code = await army(['install', '--dry-run'], {
      env: { ...emptyHome, PATH: process.env.PATH, KAPPMAKER_API: `http://127.0.0.1:${port}` },
      run: async (command, args, env) => {
        const { execFileSync } = await import('node:child_process');
        try {
          output = execFileSync(command, args, { env, encoding: 'utf8' });
          return 0;
        } catch (e) {
          output = (e as { stdout: string }).stdout;
          return (e as { status: number }).status;
        }
      },
      ...quiet(),
    });
    assert.equal(code, 5);
    assert.equal(output, '--dry-run|key=none');
  } finally {
    server.close();
  }
});

test('origin must be https except on loopback', () => {
  assert.equal(resolveOrigin(undefined), 'https://kappmaker.com');
  assert.equal(resolveOrigin('https://staging.kappmaker.com/'), 'https://staging.kappmaker.com');
  assert.equal(resolveOrigin('http://127.0.0.1:8091'), 'http://127.0.0.1:8091');
  assert.throws(() => resolveOrigin('http://kappmaker.com'), /https only/);
  assert.throws(() => resolveOrigin('not a url'), /not a URL/);
});

test('checksum parsing and --key splitting', () => {
  const h = 'a'.repeat(64);
  assert.equal(parseChecksum(h), h);
  assert.equal(parseChecksum(`${h.toUpperCase()}  install.sh\n`), h);
  assert.equal(parseChecksum(`${h} *install.sh`), h);
  assert.equal(parseChecksum('abc'), null);
  assert.deepEqual(splitInstallArgs(['--key=K1', '--server']), { scriptArgs: ['--server'], key: 'K1' });
  assert.deepEqual(splitInstallArgs(['--server']), { scriptArgs: ['--server'], key: undefined });
});
