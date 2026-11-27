import path from 'node:path';
import fs from 'fs-extra';
import { z } from 'zod';
import { cli, local, type ToolDef } from '../define.js';
import { getConfigDir } from '../../utils/config.js';
import { SECRET_CONFIG_KEYS } from '../redact.js';

/** Which saved settings each part of the flow needs. Reported as set / not set — never the value. */
const NEEDS: Record<string, string[]> = {
  'images (logo, screenshots, feature graphic)': ['falApiKey'],
  'screenshot translation': ['falApiKey', 'imgbbApiKey'],
  'specs written by OpenAI (optional: write the spec yourself instead)': ['openaiApiKey'],
  'App Store Connect': ['ascKeyId', 'ascIssuerId', 'ascPrivateKeyPath', 'appleId'],
  'Google Play': ['googleServiceAccountPath'],
  'RevenueCat (if used)': ['revenuecatApiKey'],
  'iOS builds without a Mac (if used)': ['iosCertsRepoToken'],
};

const FILE_KEYS = new Set(['ascPrivateKeyPath', 'googleServiceAccountPath']);

export async function configCheck(cwd: string, configDir = getConfigDir()): Promise<string> {
  const cfgPath = path.join(configDir, 'config.json');
  const cfg: Record<string, unknown> = await fs.readJson(cfgPath).catch(() => ({}));
  const lines: string[] = [];
  if (!(await fs.pathExists(cfgPath))) {
    lines.push('No kappmaker config yet. Fix: `kappmaker config init --yes --bundle-prefix com.yourcompany --organization "Your Co"`.');
  }
  const state = async (key: string): Promise<boolean> => {
    const v = cfg[key];
    if (typeof v !== 'string' || !v) return false;
    return FILE_KEYS.has(key) ? fs.pathExists(v) : true;
  };
  for (const [area, keys] of Object.entries(NEEDS)) {
    const missing: string[] = [];
    for (const k of keys) if (!(await state(k))) missing.push(k);
    lines.push(missing.length ? `missing  ${area}: ${missing.join(', ')}` : `ok       ${area}`);
  }
  const files = ['appstore-defaults.json', 'adapty-defaults.json', 'revenuecat-keys.json', 'match-passwords.json'];
  for (const f of files) {
    lines.push(`${(await fs.pathExists(path.join(configDir, f))) ? 'present' : 'absent '}  ${f}`);
  }
  const project = ['Assets/appstore-config.json', 'Assets/googleplay-config.json', 'Assets/adapty-config.json', 'Assets/revenuecat-config.json'];
  for (const f of project) {
    if (await fs.pathExists(path.join(cwd, f))) lines.push(`project  ${f}`);
  }
  lines.push(
    '',
    'Set a missing key yourself in a terminal: `kappmaker config set <key> <value>` (paths for *Path keys). ' +
      'Values are never shown here.',
    `Sensitive keys: ${SECRET_CONFIG_KEYS.join(', ')}.`,
  );
  return lines.join('\n');
}

export const healthTools: ToolDef[] = [
  cli({
    name: 'doctor',
    title: 'Check installed tools',
    description:
      'Read-only, local: which external tools (git, firebase, ruby/bundler, JDK, Android SDK, asc, adapty, gh, ffmpeg, Xcode) ' +
      'are installed, their versions, and the exact install line for each missing one. Start here when anything fails.',
    kind: 'read',
    shape: {},
    commands: () => [['doctor', '--json']],
  }),
  local({
    name: 'config_check',
    title: 'Check saved keys and accounts',
    description:
      'Read-only, local: which API keys and store accounts are saved in kappmaker config (set / not set, never the values), ' +
      'which defaults files exist, and which store configs the project in project_dir has.',
    kind: 'read',
    shape: {},
    run: async (_i, ctx) => configCheck(ctx.cwd, ctx.configDir),
  }),
  local({
    name: 'create_app_plan',
    title: 'Plan a new app end to end',
    description:
      'Read-only: the ordered list of tool calls that take a new app from template to stores (the `kappmaker create` flow, ' +
      'split into steps an agent can run one by one). Start a new app here.',
    kind: 'read',
    shape: {
      app_name: z.string().regex(/^[A-Z][A-Za-z0-9]*$/).describe('PascalCase app name'),
      package_name: z.string().optional().describe('Default: <bundlePrefix>.<appname>, or com.<appname>'),
    },
    run: async (i, ctx) => {
      const cfg: Record<string, string> = await fs.readJson(path.join(ctx.configDir ?? getConfigDir(), 'config.json')).catch(() => ({}));
      const lower = i.app_name.toLowerCase();
      const pkg = i.package_name ?? (cfg.bundleIdPrefix ? `${cfg.bundleIdPrefix}.${lower}` : `com.${lower}`);
      const fb = `${lower}-app`;
      const dir = `${i.app_name}-All`;
      return [
        `New app ${i.app_name} (${pkg}). Run in order; steps marked * need confirm: true and say what they create first.`,
        `0. doctor, config_check: fix anything missing first.`,
        `1. * clone_template {app_name: "${i.app_name}"}  → creates ${dir}/; use project_dir="${dir}" from here on`,
        `2. (terminal, once) firebase login`,
        `3. * firebase_project {app_name: "${i.app_name}"}  (project id ${fb})`,
        `4. * firebase_apps {project: "${fb}", app_name: "${i.app_name}", package_name: "${pkg}"}`,
        `5. * firebase_auth_anonymous {project: "${fb}"}`,
        `6. firebase_configs {project: "${fb}", app_name: "${i.app_name}", package_name: "${pkg}"}`,
        `7. * generate_logo {prompt: "…"} → look at Assets/logo_variations.png → pick_logo {choice} → generate_icons`,
        `8. * refactor_package {app_id: "${pkg}", app_name: "${i.app_name}"}`,
        `9. generate_keystore; git_setup_upstream`,
        `10. * appstore_setup  (App Store Connect app + products)`,
        `11. (Play Console UI, once) create the app; then * android_release_build + * publish {platforms:["android"], track:"internal"}; then * google_play_setup`,
        `12. * adapty_setup or * revenuecat_setup`,
      ].join('\n');
    },
  }),
];
