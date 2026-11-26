import { execa } from 'execa';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TOOLS, type ToolSpec } from './prereqs.tools.js';

export type { ToolSpec } from './prereqs.tools.js';
export { TOOLS } from './prereqs.tools.js';

export type Platform = 'macos' | 'linux';
export type CheckStatus = 'ok' | 'missing' | 'outdated' | 'unsupported';

export interface CheckResult {
  id: string;
  name: string;
  status: CheckStatus;
  version?: string;
  min?: string;
  hint?: string;
}

export function currentPlatform(platform: NodeJS.Platform = process.platform): Platform {
  return platform === 'darwin' ? 'macos' : 'linux';
}

/** First x.y[.z] in a version banner, e.g. `openjdk version "17.0.11"` → 17.0.11. */
export function parseVersion(output: string, pattern?: RegExp): string | null {
  const match = output.match(pattern ?? /(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!match) return null;
  return pattern ? match[1] : match[0];
}

/** `a >= b` on dotted numeric versions; missing parts count as 0. */
export function versionAtLeast(found: string, min: string): boolean {
  const a = found.split('.').map((n) => parseInt(n, 10) || 0);
  const b = min.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return true;
}

export function installHint(tool: ToolSpec, platform: Platform = currentPlatform()): string {
  return tool.install[platform];
}

export type Runner = (
  cmd: string,
  args: string[],
) => Promise<{ stdout: string; stderr: string; exitCode?: number } | null>;

const defaultRunner: Runner = async (cmd, args) => {
  try {
    const result = await execa(cmd, args, { reject: false, timeout: 20_000, stdin: 'ignore' });
    if (result.failed && result.exitCode === undefined) return null; // ENOENT etc.
    return { stdout: String(result.stdout ?? ''), stderr: String(result.stderr ?? ''), exitCode: result.exitCode };
  } catch {
    return null;
  }
};

/** Android SDK root: ANDROID_HOME → ANDROID_SDK_ROOT → the platform default. */
export function defaultAndroidSdkPath(
  env: NodeJS.ProcessEnv = process.env,
  platform: Platform = currentPlatform(),
  home: string = os.homedir(),
): string {
  if (env.ANDROID_HOME) return env.ANDROID_HOME;
  if (env.ANDROID_SDK_ROOT) return env.ANDROID_SDK_ROOT;
  return platform === 'macos' ? path.join(home, 'Library', 'Android', 'sdk') : path.join(home, 'Android', 'Sdk');
}

export async function checkTool(
  tool: ToolSpec,
  opts: { platform?: Platform; run?: Runner; androidSdkPath?: string } = {},
): Promise<CheckResult> {
  const platform = opts.platform ?? currentPlatform();
  const base = { id: tool.id, name: tool.name, min: tool.min };
  if (tool.platforms && !tool.platforms.includes(platform)) {
    return { ...base, status: 'unsupported', hint: installHint(tool, platform) };
  }

  if (tool.id === 'android-sdk') {
    const sdk = opts.androidSdkPath ?? defaultAndroidSdkPath();
    const ok = ['platform-tools', 'cmdline-tools', 'platforms'].some((d) => fs.existsSync(path.join(sdk, d)));
    return ok
      ? { ...base, status: 'ok', version: sdk }
      : { ...base, status: 'missing', hint: `${installHint(tool, platform)}  (looked in ${sdk})` };
  }

  const out = await (opts.run ?? defaultRunner)(tool.command, tool.versionArgs);
  if (!out) return { ...base, status: 'missing', hint: installHint(tool, platform) };
  const version = parseVersion(`${out.stdout}\n${out.stderr}`, tool.versionPattern);
  // A failing --version with no version in it is a shim, not the tool: the
  // macOS /usr/bin/java stub ("Unable to locate a Java Runtime") or
  // xcodebuild with only the Command Line Tools installed.
  if (!version) {
    return out.exitCode && out.exitCode !== 0
      ? { ...base, status: 'missing', hint: installHint(tool, platform) }
      : { ...base, status: 'ok' };
  }
  if (tool.min && !versionAtLeast(version, tool.min)) {
    return { ...base, status: 'outdated', version, hint: tool.upgrade?.[platform] ?? installHint(tool, platform) };
  }
  return { ...base, status: 'ok', version };
}

export function toolById(id: string): ToolSpec {
  const tool = TOOLS.find((t) => t.id === id);
  if (!tool) throw new Error(`unknown tool ${id}`);
  return tool;
}
