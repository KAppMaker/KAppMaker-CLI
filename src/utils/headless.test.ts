// Fresh-machine / headless behaviour: HTTPS template default, SSH → HTTPS
// fallback, `config init --yes`, and one-line failures instead of prompts
// when there is no terminal. Run: npm run test:headless
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { githubSshToHttps } from '../services/git.service.js';
import { isInteractive } from './prompt.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Runs the CLI from source with a throwaway HOME and stdin that is not a terminal. */
function cli(args: string[], env: Record<string, string> = {}) {
  const home = env.HOME ?? fs.mkdtempSync(path.join(os.tmpdir(), 'kappmaker-home-'));
  const r = spawnSync(path.join(root, 'node_modules', '.bin', 'tsx'), [path.join(root, 'src', 'index.ts'), ...args], {
    cwd: fs.mkdtempSync(path.join(os.tmpdir(), 'kappmaker-cwd-')),
    env: { PATH: process.env.PATH ?? '', HOME: home, ...env },
    input: '',
    encoding: 'utf8',
    timeout: 60_000,
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}`, home };
}

test('SSH GitHub URLs map to HTTPS; others are left alone', () => {
  assert.equal(githubSshToHttps('git@github.com:KAppMaker/KAppMaker-All.git'), 'https://github.com/KAppMaker/KAppMaker-All.git');
  assert.equal(githubSshToHttps('git@github.com:a/b'), 'https://github.com/a/b.git');
  assert.equal(githubSshToHttps('ssh://git@github.com/a/b.git'), 'https://github.com/a/b.git');
  assert.equal(githubSshToHttps('https://github.com/a/b.git'), null);
  assert.equal(githubSshToHttps('git@gitlab.com:a/b.git'), null);
});

test('isInteractive: TTY yes; no TTY, CI or KAPPMAKER_NONINTERACTIVE no', () => {
  assert.equal(isInteractive({}, true), true);
  assert.equal(isInteractive({}, false), false);
  assert.equal(isInteractive({ CI: 'true' }, true), false);
  assert.equal(isInteractive({ KAPPMAKER_NONINTERACTIVE: '1' }, true), false);
});

test('config init --yes writes a usable config with HTTPS template and no questions', () => {
  const r = cli(['config', 'init', '--yes', '--bundle-prefix', 'com.example', '--organization', 'Example Co'], {
    ANDROID_HOME: '/opt/android-sdk',
  });
  assert.equal(r.code, 0, r.out);
  const cfg = JSON.parse(fs.readFileSync(path.join(r.home, '.config', 'kappmaker', 'config.json'), 'utf8'));
  assert.equal(cfg.templateRepo, 'https://github.com/KAppMaker/KAppMaker-All.git');
  assert.equal(cfg.bundleIdPrefix, 'com.example');
  assert.equal(cfg.organization, 'Example Co');
  assert.equal(cfg.androidSdkPath, '/opt/android-sdk');
});

test('config init without a terminal fails with the --yes command instead of hanging', () => {
  const r = cli(['config', 'init']);
  assert.equal(r.code, 2);
  assert.match(r.out, /kappmaker config init --yes/);
});

test('clone with no config and no terminal: one line naming the command, exit 2', () => {
  const r = cli(['clone', 'MyApp']);
  assert.equal(r.code, 2);
  assert.match(r.out, /No KAppMaker config yet[\s\S]*kappmaker config init --yes/);
});

test('create without a terminal fails up front with the step-by-step way out', () => {
  const r = cli(['create', 'MyApp']);
  assert.equal(r.code, 2);
  assert.match(r.out, /needs a terminal[\s\S]*kappmaker clone MyApp/);
});

test('child processes (./gradlew included) inherit GRADLE_SLOT_HELD from the kit wrapper', async () => {
  const { run, runStreaming } = await import('./exec.js');
  process.env.GRADLE_SLOT_HELD = '1';
  try {
    const plain = await run('sh', ['-c', 'printf %s "$GRADLE_SLOT_HELD"'], { label: 'env check' });
    assert.equal(plain.stdout, '1');
    const withEnv = await run('sh', ['-c', 'printf %s "$GRADLE_SLOT_HELD"'], { label: 'env check', env: { X: 'y' } });
    assert.equal(withEnv.stdout, '1', 'extra env is merged, not replacing the inherited env');
    assert.equal(await runStreaming('sh', ['-c', 'test "$GRADLE_SLOT_HELD" = 1'], { env: { X: 'y' } }), 0);
  } finally {
    delete process.env.GRADLE_SLOT_HELD;
  }
});
