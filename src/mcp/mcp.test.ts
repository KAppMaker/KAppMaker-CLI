/**
 * `kappmaker mcp` tests: the official MCP SDK client talks to the server.
 * External services are never reached — the CLI runner is replaced by a fake
 * that records argv and replays canned output. One test starts the real
 * server over stdio and runs a local-only command end to end.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createMcpServer } from './server.js';
import type { RunRequest, RunResult } from './runner.js';
import { makeRedactor } from './redact.js';
import { NeedsAnswerError, confirm, promptInput } from '../utils/prompt.js';

type Call = { name: string; args?: Record<string, unknown> };
const SECRET = 'fal-0123456789abcdef-SECRET';

async function connect(reply: (req: RunRequest) => RunResult = () => ({ exitCode: 0, output: 'done' }), configDir?: string) {
  const calls: RunRequest[] = [];
  const server = await createMcpServer({
    version: 'test',
    runner: async (req) => { calls.push(req); return reply(req); },
    secretValues: [SECRET],
    configDir,
    cwd: os.tmpdir(),
  });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0' });
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = async (c: Call) => {
    const res = await client.callTool({ name: c.name, arguments: c.args ?? {} });
    const body = (res.content as { type: string; text: string }[]).map((x) => x.text).join('\n');
    return { body, isError: Boolean(res.isError) };
  };
  return { client, calls, call };
}

test('lists the whole capability set with descriptions and typed inputs', async () => {
  const { client } = await connect();
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name);
  for (const n of ['doctor', 'config_check', 'create_app_plan', 'clone_template', 'refactor_package', 'appstore_setup',
    'google_play_setup', 'subscription_add', 'iap_add', 'adapty_setup', 'revenuecat_setup', 'generate_logo', 'pick_logo',
    'generate_icons', 'generate_screenshots', 'generate_feature_graphic', 'version_bump', 'publish', 'ios_ci_init',
    'ios_ci_build', 'ios_ci_status']) {
    assert.ok(names.includes(n), `missing tool ${n}`);
  }
  for (const t of tools) {
    assert.ok((t.description ?? '').length > 40, `${t.name} needs a real description`);
    assert.equal(t.inputSchema.type, 'object');
    assert.ok(t.inputSchema.properties && 'project_dir' in t.inputSchema.properties, `${t.name} takes project_dir`);
  }
  const sub = tools.find((t) => t.name === 'subscription_add')!;
  assert.deepEqual(sub.inputSchema.required?.sort(), ['period', 'price']);
  assert.ok('confirm' in sub.inputSchema.properties!);
  assert.ok(!('confirm' in tools.find((t) => t.name === 'doctor')!.inputSchema.properties!));
  assert.ok(!names.some((n) => /api_key|token|password/i.test(n)));
  for (const t of tools) {
    assert.ok(!Object.keys(t.inputSchema.properties ?? {}).some((p) => /api_key|token|password|secret/i.test(p)), `${t.name} must not accept secrets`);
  }
});

test('paid and long tools return a plan and run nothing without confirm: true', async () => {
  const { calls, call } = await connect();
  const plan = await call({ name: 'generate_logo', args: { prompt: 'a cozy plant app' } });
  assert.equal(calls.length, 0);
  assert.match(plan.body, /^PLAN \(paid/);
  assert.match(plan.body, /kappmaker create-logo --grid-only --prompt 'a cozy plant app'/);
  assert.match(plan.body, /fal\.ai account/);
  assert.match(plan.body, /confirm: true/);

  const pub = await call({ name: 'publish', args: { platforms: ['android'] } });
  assert.equal(calls.length, 0);
  assert.match(pub.body, /--track internal/);
  assert.match(pub.body, /without submitting for review/);
});

test('confirm: true runs the exact command, non-interactive, with pre-agreed confirms', async () => {
  const { calls, call } = await connect();
  const res = await call({ name: 'subscription_add', args: { period: 'weekly', price: '9.99', confirm: true } });
  assert.equal(res.isError, false);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, ['subscription', 'add', '--period', 'weekly', '--price', '9.99', '--platform', 'all',
    '--product-version', '1', '--provider', 'auto']);
  assert.equal(calls[0].assumeYes, true);
  assert.equal(calls[0].cwd, os.tmpdir());
});

test('read and write tools run straight away; multi-step tools run every command', async () => {
  const { calls, call } = await connect();
  await call({ name: 'doctor' });
  assert.deepEqual(calls[0].args, ['doctor', '--json']);
  assert.equal(calls[0].assumeYes, false);
  await call({ name: 'generate_icons', args: { platform: 'both', background: '#112233' } });
  assert.deepEqual(calls.slice(1).map((c) => c.args[0]), ['generate-ios-icons', 'generate-android-icons']);
  await call({ name: 'version_bump', args: { version: '2.0.0' } });
  assert.deepEqual(calls[3].args, ['update-version', '--version-name', '2.0.0']);
});

test('new 2.2.0 inputs turn into the right flags', async () => {
  const { calls, call } = await connect();
  await call({ name: 'google_play_push', args: { section: 'listings', allow_empty: true, verify: true, regions_version: '2026/01', confirm: true } });
  assert.deepEqual(calls[0].args, ['gpc', 'listings', 'push', '--allow-empty']);
  await call({ name: 'google_play_push', args: { section: 'data-safety', verify: true, allow_empty: true, confirm: true } });
  assert.deepEqual(calls[1].args, ['gpc', 'data-safety', 'push', '--verify']);
  await call({ name: 'google_play_push', args: { section: 'monetization', regions_version: '2026/01', confirm: true } });
  assert.deepEqual(calls[2].args, ['gpc', 'monetization', 'push', '--regions-version', '2026/01']);
  await call({ name: 'google_play_setup', args: { regions_version: '2025/03', confirm: true } });
  assert.deepEqual(calls[3].args, ['gpc', 'setup', '--regions-version', '2025/03']);
  await call({ name: 'generate_icons', args: { platform: 'ios', splash_background: '#112233', splash_background_dark: '#000000' } });
  assert.deepEqual(calls[4].args, ['generate-ios-icons', '--splash-background', '#112233', '--splash-background-dark', '#000000']);
  await call({ name: 'generate_icons', args: { platform: 'android', no_splash: true } });
  assert.deepEqual(calls[5].args, ['generate-android-icons', '--no-splash']);
  const bad = await call({ name: 'google_play_push', args: { section: 'iap', regions_version: '2026-01', confirm: true } });
  assert.equal(bad.isError, true);
  assert.equal(calls.length, 6);
});

test('Play HTTP errors, asc failures and FAILED step summaries come back in plain words', async () => {
  const { explainFailure } = await import('./errors.js');
  const play = explainFailure('  ERROR Updating data safety declaration: HTTP 400\n{\n  "error": {\n    "code": 400,\n    "message": "Row 12: invalid response value"\n  }\n}');
  assert.match(play ?? '', /Google Play rejected "Updating data safety declaration" \(HTTP 400\): Row 12: invalid response value\. Fix:/);
  const asc = explainFailure('  ERROR Setting review details: asc exited 1\nHTTP 409 conflict');
  assert.match(asc ?? '', /asc\) failed at "Setting review details": HTTP 409 conflict\. Fix:/);
  const sum = explainFailure('  2 step(s) FAILED: Age rating, App Review detail\n');
  assert.match(sum ?? '', /2 step\(s\) failed: Age rating, App Review detail\./);
  assert.match(explainFailure('asc 1.4.1 is too old: kappmaker needs') ?? '', /brew upgrade asc/);
});

test('invalid input is rejected before anything runs', async () => {
  const { calls, call } = await connect();
  const bad = await call({ name: 'subscription_add', args: { period: 'daily', price: '9', confirm: true } });
  assert.equal(bad.isError, true);
  assert.equal(calls.length, 0);
  const missing = await call({ name: 'doctor', args: { project_dir: '/nonexistent/app' } });
  assert.equal(missing.isError, true);
  assert.match(missing.body, /project_dir does not exist.*Fix:/);
});

test('secrets never appear in tool output', async () => {
  const leak = `using key ${SECRET}\nRevenueCat sk_abcdefghijklmnopqrstuvwx\nstorePassword=hunter2hunter2\n` +
    '-----BEGIN PRIVATE KEY-----\nMIIEv\n-----END PRIVATE KEY-----\nAuthorization: Bearer abcdefghijklmnop1234';
  const { call } = await connect(() => ({ exitCode: 1, output: leak }));
  const res = await call({ name: 'ios_ci_status' });
  assert.equal(res.isError, true);
  for (const s of [SECRET, 'sk_abcdefghijklmnopqrstuvwx', 'hunter2hunter2', 'MIIEv', 'abcdefghijklmnop1234']) {
    assert.ok(!res.body.includes(s), `leaked ${s}`);
  }
  assert.match(res.body, /storePassword=\[redacted\]/);
});

test('failures come back in plain language with the exact fix', async () => {
  const { call } = await connect(() => ({ exitCode: 2, output: 'kappmaker: needs an answer: "Enter your fal.ai API key:"' }));
  const res = await call({ name: 'generate_image', args: { prompt: 'x', confirm: true } });
  assert.equal(res.isError, true);
  assert.match(res.body, /FAILED \(exit 2\)/);
  assert.match(res.body, /kappmaker config set falApiKey/);
});

test('config_check reports set / not set and never the values', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kmcfg-'));
  await fs.writeJson(path.join(dir, 'config.json'), { falApiKey: SECRET, appleId: 'someone@example.com' });
  const { call } = await connect(undefined, dir);
  const res = await call({ name: 'config_check' });
  assert.match(res.body, /ok\s+images/);
  assert.match(res.body, /missing\s+App Store Connect: ascKeyId, ascIssuerId, ascPrivateKeyPath/);
  assert.ok(!res.body.includes(SECRET) && !res.body.includes('someone@example.com'));
  const plan = await call({ name: 'create_app_plan', args: { app_name: 'Remimi' } });
  assert.match(plan.body, /com\.remimi/);
  assert.match(plan.body, /firebase_apps \{project: "remimi-app"/);
  await fs.remove(dir);
});

test('redactor masks config values and known secret shapes', () => {
  const r = makeRedactor(['abcdef123456']);
  assert.equal(r('k=abcdef123456 ghp_aaaaaaaaaaaaaaaaaaaaaaaa'), 'k=[redacted] [redacted]');
  assert.equal(r('task_abcdefghijklmnopqrstu stays'), 'task_abcdefghijklmnopqrstu stays');
});

test('prompts refuse instead of hanging when KAPPMAKER_NONINTERACTIVE=1', async () => {
  const prev = { ...process.env };
  process.env.KAPPMAKER_NONINTERACTIVE = '1';
  try {
    await assert.rejects(promptInput('Enter key: '), NeedsAnswerError);
    await assert.rejects(confirm('Delete it?'), /needs an answer: "Delete it\?"/);
    process.env.KAPPMAKER_ASSUME_YES = '1';
    assert.equal(await confirm('Continue?', { assumable: true }), true);
    await assert.rejects(confirm('Delete it?'), NeedsAnswerError); // not assumable: still refuses
  } finally {
    process.env = prev;
  }
});

test('real server over stdio: clean protocol channel, local command end to end', async () => {
  const repo = path.resolve(import.meta.dirname, '../..');
  const transport = new StdioClientTransport({
    command: path.join(repo, 'node_modules/.bin/tsx'),
    args: [path.join(repo, 'src/index.ts'), 'mcp'],
    cwd: os.tmpdir(),
    stderr: 'pipe',
  });
  const client = new Client({ name: 'stdio-test', version: '0' });
  await client.connect(transport);
  try {
    const { tools } = await client.listTools();
    assert.ok(tools.length >= 30);
    const res = await client.callTool({ name: 'spec_template', arguments: {} });
    const body = (res.content as { text: string }[])[0].text;
    assert.equal(res.isError, undefined);
    assert.match(body, /screenshots/);
    assert.match(body, /OK: kappmaker spec-template --list/);
  } finally {
    await client.close();
  }
});
