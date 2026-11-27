import { z } from 'zod';
import { local, type ToolDef } from '../define.js';
import { asWorker, workerShellCommand } from '../army/scripts.js';
import { shq, userCommand } from '../army/ssh.js';
import { conn, connShape, fail, isConn, remote } from '../army/common.js';

/**
 * Claude Code sign-in on the server, for the worker user. `claude auth login` runs in a detached tmux session
 * (isolated Telegram state dir, so a live worker's poller is never touched); the tool returns the link for the user
 * to open in their own browser. If Claude then wants a code pasted back, the user types it into a private form.
 */
const SESSION = 'kappmaker-login';
const HEADLESS = 'TELEGRAM_STATE_DIR="$HOME/.claude/channels/telegram-headless"';
const LOG = '"$HOME/.army/state/claude-login.log"';
const STATUS = `${HEADLESS} claude auth status 2>/dev/null | grep -q '"loggedIn" *: *true' && echo LOGGED_IN=yes || echo LOGGED_IN=no`;

export const claudeLoginTool: ToolDef = local({
  name: 'army_claude_login',
  title: 'Sign Claude Code in on the server',
  description:
    'action start: begins the Claude Code sign-in on the server and returns the link for the user to open in their own ' +
    'browser. action finish: checks it worked; if Claude asks for a code, the user types it into a private form. ' +
    'action check: is the server signed in. No password ever goes through here.',
  kind: 'write',
  network: true,
  shape: { ...connShape, action: z.enum(['check', 'start', 'finish']).default('start') },
  run: async (i, ctx) => {
    const c = conn(i);
    if (!isConn(c)) return c;
    const run = (body: string) => remote(ctx, c, asWorker(c, body));
    const st = await run(STATUS);
    if (st.exitCode !== 0) return fail(st.why ?? `Could not check the sign-in (exit ${st.exitCode}). Is App Army installed? (army_install_server)\n${st.output.trim()}`);
    if (/LOGGED_IN=yes/.test(st.output)) return `Claude Code is signed in on ${c.host}.`;
    if (i.action === 'check') return `Claude Code is NOT signed in on ${c.host} yet. Use action start.`;

    if (i.action === 'start') {
      const r = await run([
        'mkdir -p "$HOME/.army/state"; : > ' + LOG,
        `tmux kill-session -t ${SESSION} 2>/dev/null`,
        `tmux new-session -d -s ${SESSION} -x 250 -y 50 "${HEADLESS.replace(/"/g, '\\"')} claude auth login 2>&1 | tee ${LOG.replace(/"/g, '\\"')}"`,
        'for n in $(seq 1 20); do grep -qE "https://[^ ]+" ' + LOG + ' && break; sleep 1; done',
        `tmux capture-pane -p -t ${SESSION} 2>/dev/null | tail -n 30; echo; cat ${LOG} 2>/dev/null | tail -n 30`,
      ].join('\n'));
      const url = (r.output.replace(/\s*\n\s*/g, '\n').match(/https:\/\/\S+/g) ?? []).sort((a, b) => b.length - a.length)[0];
      if (!url) {
        return fail(`The sign-in did not show a link. Sign in yourself instead (it prints a link to open):\n  ${userCommand(c, workerShellCommand(c, 'claude auth login'))}\n--- server said ---\n${r.output.trim().split('\n').slice(-12).join('\n')}`);
      }
      const code = r.output.match(/\b(?:code|Code)[:\s]+([A-Z0-9]{4,}(?:-[A-Z0-9]{4,})*)\b/)?.[1];
      return `Open this link in your browser and sign in with the Claude account the server should use:\n  ${url}\n${code ? `If it asks for a code, enter: ${code}\n` : ''}Then call army_claude_login with action finish.`;
    }

    // finish: maybe Claude waits for a code pasted back.
    const pane = await run(`tmux capture-pane -p -t ${SESSION} 2>/dev/null | tail -n 15`);
    if (/paste|enter.*code|code:/i.test(pane.output)) {
      const got = await ctx.ask('Paste the code the Claude sign-in page showed you. It goes to your server only.', [
        { name: 'code', title: 'Sign-in code', description: 'From the browser, after signing in' },
      ]);
      const code = typeof got?.code === 'string' ? got.code.trim() : '';
      if (!code) {
        return fail(ctx.canAsk ? 'No code given.' : `Finish it in your own terminal:\n  ${userCommand(c, workerShellCommand(c, `tmux attach -t ${SESSION}`))}\n(after the code is in: Ctrl-b d to leave)`);
      }
      if (!/^[A-Za-z0-9#_.~-]{6,300}$/.test(code)) return fail('That code has characters a sign-in code does not have. Copy it again.');
      ctx.secrets.push(code);
      // load-buffer from stdin: the code is never a command-line argument on the server.
      await run(`printf '%s' ${shq(code)} | tmux load-buffer -b kmcode - && tmux paste-buffer -d -b kmcode -t ${SESSION} && tmux send-keys -t ${SESSION} Enter; sleep 5`);
    }
    const again = await run(STATUS);
    if (/LOGGED_IN=yes/.test(again.output)) {
      await run(`tmux kill-session -t ${SESSION} 2>/dev/null; rm -f ${LOG}`);
      return `Claude Code is signed in on ${c.host}. Next: army_add_worker.`;
    }
    return fail(`Not signed in yet. If you have not opened the link, call action start again; or finish it yourself:\n  ${userCommand(c, workerShellCommand(c, `tmux attach -t ${SESSION}`))}`);
  },
});
