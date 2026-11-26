// Tests for the prerequisite checks: version parsing on real banners,
// minimum versions, shims, Android SDK lookup and per-platform install lines.
// Run: npm run test:prereqs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  TOOLS,
  checkTool,
  defaultAndroidSdkPath,
  parseVersion,
  toolById,
  versionAtLeast,
  type Runner,
} from './prereqs.js';

const says = (stdout: string, stderr = '', exitCode = 0): Runner => async () => ({ stdout, stderr, exitCode });
const absent: Runner = async () => null;

// Real `--version` banners, one per tool.
const BANNERS: Record<string, { out: string; err?: string; version: string }> = {
  git: { out: 'git version 2.46.0', version: '2.46.0' },
  firebase: { out: '14.2.2', version: '14.2.2' },
  ruby: { out: 'ruby 3.3.4 (2024-07-09 revision be1089c8ec) [arm64-darwin23]', version: '3.3.4' },
  bundler: { out: 'Bundler version 2.5.16', version: '2.5.16' },
  java: { out: '', err: 'openjdk version "17.0.11" 2024-04-16\nOpenJDK Runtime Environment Temurin-17.0.11+9', version: '17.0.11' },
  asc: { out: '5.17.1 (commit: unknown, date: unknown)', version: '5.17.1' },
  adapty: { out: 'adapty/0.1.5 darwin-arm64 node-v22.22.0', version: '0.1.5' },
  gh: { out: 'gh version 2.54.0 (2024-07-31)\nhttps://github.com/cli/cli/releases/tag/v2.54.0', version: '2.54.0' },
  ffmpeg: { out: 'ffmpeg version 7.1.1 Copyright (c) 2000-2025 the FFmpeg developers', version: '7.1.1' },
  xcode: { out: 'Xcode 26.5\nBuild version 17F42', version: '26.5' },
};

for (const [id, b] of Object.entries(BANNERS)) {
  test(`${id}: version parsed from a real banner`, async () => {
    const r = await checkTool(toolById(id), { platform: 'macos', run: says(b.out, b.err ?? '') });
    assert.equal(r.version, b.version);
    assert.equal(r.status, 'ok');
  });
}

test('Java 8 style banner ("1.8.0_392") is outdated, JDK 11 is outdated, 21 is fine', async () => {
  const java = toolById('java');
  const v8 = await checkTool(java, { platform: 'linux', run: says('', 'openjdk version "1.8.0_392"') });
  assert.equal(v8.status, 'outdated');
  const v11 = await checkTool(java, { platform: 'linux', run: says('', 'openjdk version "11.0.21" 2023-10-17') });
  assert.equal(v11.status, 'outdated');
  assert.equal(v11.hint, 'sudo apt-get install -y openjdk-17-jdk');
  const v21 = await checkTool(java, { platform: 'linux', run: says('', 'openjdk version "21.0.4" 2024-07-16') });
  assert.equal(v21.status, 'ok');
});

test('macOS java stub ("Unable to locate a Java Runtime", exit 1) counts as missing', async () => {
  const r = await checkTool(toolById('java'), {
    platform: 'macos',
    run: says('', 'The operation couldn’t be completed. Unable to locate a Java Runtime.', 1),
  });
  assert.equal(r.status, 'missing');
  assert.equal(r.hint, 'brew install --cask temurin@17');
});

test('an old asc is reported as outdated with the upgrade line', async () => {
  const r = await checkTool(toolById('asc'), { platform: 'macos', run: says('1.2.1') });
  assert.equal(r.status, 'outdated');
  assert.equal(r.hint, 'brew update && brew upgrade asc');
});

test('missing tools get the platform-specific install line', async () => {
  for (const tool of TOOLS.filter((t) => t.command)) {
    const mac = await checkTool(tool, { platform: 'macos', run: absent });
    assert.equal(mac.status, 'missing', tool.id);
    assert.equal(mac.hint, tool.install.macos);
    const linux = await checkTool(tool, { platform: 'linux', run: absent });
    if (tool.platforms && !tool.platforms.includes('linux')) {
      assert.equal(linux.status, 'unsupported', tool.id);
      assert.match(linux.hint ?? '', /ios-ci/);
    } else {
      assert.equal(linux.status, 'missing', tool.id);
      assert.equal(linux.hint, tool.install.linux);
      assert.doesNotMatch(linux.hint ?? '', /\bbrew\b/, `${tool.id}: no Homebrew on Linux`);
    }
  }
});

test('every tool has a non-empty install line for both platforms', () => {
  for (const tool of TOOLS) {
    assert.ok(tool.install.macos.trim(), `${tool.id} macos`);
    assert.ok(tool.install.linux.trim(), `${tool.id} linux`);
  }
});

test('Android SDK: env vars first, then the platform default; detected by its subdirs', async () => {
  assert.equal(defaultAndroidSdkPath({ ANDROID_HOME: '/a' }, 'linux', '/h'), '/a');
  assert.equal(defaultAndroidSdkPath({ ANDROID_SDK_ROOT: '/b' }, 'linux', '/h'), '/b');
  assert.equal(defaultAndroidSdkPath({}, 'linux', '/h'), path.join('/h', 'Android', 'Sdk'));
  assert.equal(defaultAndroidSdkPath({}, 'macos', '/h'), path.join('/h', 'Library', 'Android', 'sdk'));

  const sdk = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-'));
  const tool = toolById('android-sdk');
  assert.equal((await checkTool(tool, { androidSdkPath: sdk })).status, 'missing');
  fs.mkdirSync(path.join(sdk, 'platform-tools'));
  assert.equal((await checkTool(tool, { androidSdkPath: sdk })).status, 'ok');
});

test('versionAtLeast / parseVersion', () => {
  assert.equal(versionAtLeast('17.0.11', '17'), true);
  assert.equal(versionAtLeast('2.9', '2.30.0'), false);
  assert.equal(versionAtLeast('5.17.1', '1.4.0'), true);
  assert.equal(parseVersion('no digits here'), null);
});
