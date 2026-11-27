import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { z } from 'zod';
import { local, type LocalCtx, type ToolDef } from '../define.js';
import { downloadVerifiedInstaller, resolveOrigin, DEFAULT_ORIGIN } from '../../services/army.service.js';
import { checkEntitlement, hasMentorPack, isKit, productName, type Entitlement } from '../army/licence.js';
import { PROBE, installScript, judge, parseProbe } from '../army/scripts.js';
import { connShape, conn, fail, isConn, licenceFrom, licenceShape, remote, tail } from '../army/common.js';
import type { Conn } from '../army/ssh.js';
import { planText } from '../army/plan.js';

async function probe(ctx: LocalCtx, c: Conn) {
  const r = await remote(ctx, c, { remote: 'bash -s', stdin: PROBE });
  if (r.exitCode !== 0) {
    const forced = r.output.match(/login as (\w+)/i);
    const why = forced ? `This server does not let ${c.user} log in; it says to log in as "${forced[1]}". Use user: "${forced[1]}".` : r.why;
    return { error: why ?? `Could not run the check on ${c.host} (exit ${r.exitCode}).` };
  }
  return { report: judge(parseProbe(r.output), c) };
}

const optionalConn = {
  host: connShape.host.optional(), user: connShape.user, ssh_key_path: connShape.ssh_key_path.optional(), port: connShape.port,
};

export const armySetupTools: ToolDef[] = [
  local({
    name: 'army_plan_setup',
    title: 'Plan the App Army setup',
    description:
      'Start here when the user wants App Army set up ("set up my VPS at <ip>", "install App Army"). Reads what they ' +
      'bought from their own licence (read-only: activates nothing, uses up nothing) and returns the exact steps for ' +
      'that purchase, in plain words. Give host + ssh_key_path to include a check of the server.',
    kind: 'read',
    network: true,
    shape: { ...licenceShape, ...optionalConn },
    run: async (i, ctx) => {
      let lic: { key?: string; code?: string } = {};
      if (i.install_code || i.licence_key_file) {
        const l = await licenceFrom(i, ctx);
        if ('isError' in l) return l;
        lic = l;
      }
      const ent = await checkEntitlement(lic, ctx.army.fetch);
      if (!ent.valid) return fail(ent.note ?? 'The licence check failed.');
      let server = '';
      if (i.host && i.ssh_key_path && isKit(ent.product)) {
        const c = conn({ host: i.host, user: i.user, ssh_key_path: i.ssh_key_path, port: i.port });
        if (!isConn(c)) return c;
        const p = await probe(ctx, c);
        server = p.error ? `\nServer check: ${p.error}` : `\nServer ${c.host}:\n  ${p.report!.lines.join('\n  ')}` +
          (p.report!.blockers.length ? `\n  Before installing: ${p.report!.blockers.join(' ')}` : '');
      }
      return planText(ent, Boolean(lic.key || lic.code), Boolean(i.host)) + server;
    },
  }),
  local({
    name: 'army_check_server',
    title: 'Check a server before installing',
    description: 'Read-only, over the user\'s own SSH key: reachable, OS, CPU/RAM/disk/swap against the recommended size, root or sudo login, App Army already there. Plain report.',
    kind: 'read',
    network: true,
    shape: connShape,
    run: async (i, ctx) => {
      const c = conn(i);
      if (!isConn(c)) return c;
      const p = await probe(ctx, c);
      if (p.error) return fail(p.error);
      const { lines, blockers } = p.report!;
      return [`Server ${c.host} (logged in as ${c.user}):`, ...lines.map((l) => `  ${l}`),
        blockers.length ? `Fix before installing:\n  ${blockers.join('\n  ')}` : 'Ready for the install (army_install_server).'].join('\n');
    },
  }),
  local({
    name: 'army_install_server',
    title: 'Install App Army on the server',
    description:
      'Installs what the user bought on their server with the official installer (install.sh --server, checked against its ' +
      'published checksum, nothing reimplemented): security baseline, the worker user with limited sudo, toolchain, the ' +
      'kit, the kappmaker plugin, the always-on worker, and the mentor pack when their purchase includes it. Ends with ' +
      'the health check. Safe to re-run. The licence goes in through a private form or a file, never through chat.',
    kind: 'long',
    network: true,
    shape: {
      ...connShape, ...licenceShape,
      sudo: z.enum(['limited', 'full']).default('limited').describe('limited (recommended): the worker may only manage its own services. full: passwordless sudo for everything'),
      worker: z.string().regex(/^[a-z0-9-]{1,32}$/).default('main').describe('Name of the always-on worker'),
      kit_only: z.boolean().default(false).describe('Skip the developer tools (Java, Android SDK, …): only for a quick test box that will not build apps'),
    },
    run: async (i, ctx) => {
      const c = conn(i);
      if (!isConn(c)) return c;
      const lic = await licenceFrom(i, ctx);
      if ('isError' in lic) return lic;
      const ent: Entitlement = await checkEntitlement(lic, ctx.army.fetch);
      if (!ent.valid) return fail(`Nothing installed. ${ent.note}`);
      if (!isKit(ent.product)) {
        return fail('Your purchase is App Army for Claude Code (the plugin). It runs inside Claude Code on your own computer and does not include a server install. Use army_install_plugin. Your purchase page has a credit code toward the full kit if you want the always-on server later.');
      }
      const p = await probe(ctx, c);
      if (p.error) return fail(p.error);
      if (p.report!.blockers.length) return fail(`Not installing yet:\n  ${p.report!.blockers.join('\n  ')}`);
      const steps = [
        `PLAN for ${productName(ent.product)} on ${c.host} (nothing has run yet)`,
        ...p.report!.lines.map((l) => `  ${l}`),
        'Runs the official installer as root (install.sh --server), which:',
        '  - turns on the security baseline: SSH with keys only, a firewall that lets only SSH in, fail2ban, automatic security updates, 4 GB swap if there is none',
        `  - creates the worker user "army" with ${i.sudo === 'limited' ? 'limited sudo (only its own services)' : 'FULL passwordless sudo'}`,
        i.kit_only ? '  - installs the kit and the kappmaker plugin only (no developer tools: this box will not build apps)' : '  - installs the toolchain (Java, the Android SDK, Node, GitHub CLI, Claude Code, kappmaker), the kit and the kappmaker plugin',
        `  - sets up the always-on worker "${i.worker}" (it waits for your Telegram bot, added next with army_add_worker)`,
        ...(hasMentorPack(ent.product) ? ['  - then lays your mentor pack (keyword bank, scored ideas, keyword tool) into the factory'] : []),
        '  - ends with kappmaker-army doctor',
        `Your licence ${lic.code ? 'install code is swapped for your licence on the server' : 'key goes to the installer on the server through the encrypted SSH connection'}; it is never put on a command line or shown here.`,
        'Takes 10-25 minutes. Show this to the user; run it with confirm: true after their yes.',
      ];
      if (i.confirm !== true) return steps.join('\n');

      let script: string;
      try {
        const origin = resolveOrigin();
        const dl = await downloadVerifiedInstaller(origin, ctx.army.fetch);
        script = installScript({
          script: fs.readFileSync(dl.scriptPath, 'utf8'), key: lic.key, code: lic.code,
          api: origin === DEFAULT_ORIGIN ? undefined : origin, sudo: i.sudo, worker: i.worker, mentor: hasMentorPack(ent.product), kitOnly: i.kit_only,
        });
        fs.rmSync(dl.dir, { recursive: true, force: true });
      } catch (e) {
        return fail(`Nothing installed: ${(e as Error).message}`);
      }
      if (lic.key) ctx.secrets.push(lic.key);
      const r = await remote(ctx, c, { remote: c.user === 'root' ? 'bash -s' : 'sudo -n bash -s', stdin: script }, true);
      const out = tail(r.output, 60);
      if (r.exitCode !== 0) return fail(`The install stopped (exit ${r.exitCode}). ${r.why ?? 'It is safe to run again once the cause below is fixed.'}\n--- last output ---\n${out}`);
      return `Installed on ${c.host}.\n--- last output ---\n${out}\n\nNext: army_claude_login (sign Claude in on the server), then army_add_worker "${i.worker}" (your Telegram bot), then army_pair_telegram. Or just call army_setup: it does the rest in order.`;
    },
  }),
  local({
    name: 'army_install_plugin',
    title: 'Install the App Army plugin into Claude Code',
    description:
      'For the plugin purchase: adds the private App Army marketplace and installs the plugin into Claude Code on THIS ' +
      'computer. Needs the GitHub invite accepted and git signed in to GitHub (gh auth login).',
    kind: 'long',
    network: true,
    shape: {},
    run: async (i, ctx) => {
      const plan = 'PLAN: on this computer, runs\n  claude plugin marketplace add KAppMaker/app-army-mod\n  claude plugin install kappmaker-app-army@app-army-mod\n' +
        'First accept the GitHub invite to KAppMaker/app-army-mod (sent to the GitHub account you gave at checkout), and make sure git can reach GitHub (gh auth login, then gh auth setup-git). Needs Claude Code 2.1.330 or later. Run with confirm: true after the user\'s yes.';
      if (i.confirm !== true) return plan;
      // Not a session: isolated channel state, so a live Telegram poller is never disturbed.
      const env = { TELEGRAM_STATE_DIR: path.join(os.homedir(), '.claude', 'channels', 'telegram-headless') };
      const add = await ctx.army.exec('claude', ['plugin', 'marketplace', 'add', 'KAppMaker/app-army-mod'], env);
      if (add.exitCode !== 0 && !/already/i.test(add.output)) {
        return fail(`Could not add the marketplace. ${/(not found|403|404|Authentication|could not read)/i.test(add.output) ? 'GitHub refused access: accept the invite to KAppMaker/app-army-mod, then run gh auth login and gh auth setup-git.' : ''}\n${tail(add.output, 10)}`);
      }
      const inst = await ctx.army.exec('claude', ['plugin', 'install', 'kappmaker-app-army@app-army-mod'], env);
      if (inst.exitCode !== 0) return fail(`The plugin did not install.\n${tail(inst.output, 10)}`);
      return 'Installed App Army for Claude Code. Restart Claude Code (or open a new session) to load it.';
    },
  }),
];
