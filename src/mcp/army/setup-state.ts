import { shq } from './ssh.js';
import { WORKER_USER } from './scripts.js';

/**
 * Where the one-shot setup (army_setup) keeps its own state on the server. The install runs DETACHED there, so an
 * AI client with a short tool timeout never waits 25 minutes on one call, and the SSH hardening step restarting
 * sshd cannot cut the install off. Root-only folder (700); the licence key, when one is used, sits in it for the
 * few seconds before the installer reads and deletes it.
 */
export const SETUP_DIR = '/var/lib/kappmaker-setup';

/** One read-only look at the whole setup: install, Claude sign-in, Telegram bot, pairing. `key=value` lines. */
export function stateScript(worker: string): string {
  const w = shq(worker);
  const asW = (cmd: string) => `$R runuser -l ${WORKER_USER} -c ${shq(`export PATH="$HOME/.army/bin:$PATH"; ${cmd}`)}`;
  return `set +e
R=""; [ "$(id -u)" = 0 ] || R="sudo -n"
S=${SETUP_DIR}
if $R test -f $S/pid && $R kill -0 "$($R cat $S/pid 2>/dev/null)" 2>/dev/null; then echo install=running
elif $R test -f $S/rc; then echo "install_rc=$($R cat $S/rc)"; fi
if $R test -f $S/log; then
  echo "install_step=$($R grep '^== ' $S/log | tail -n 1 | cut -c4- | cut -c1-120)"
  echo "install_started=$($R cat $S/started 2>/dev/null)"; echo "now=$(date +%s)"
fi
if id ${WORKER_USER} >/dev/null 2>&1 && $R test -f ~${WORKER_USER}/.army/army.conf; then
  echo army=installed
  ${asW(`TELEGRAM_STATE_DIR="$HOME/.claude/channels/telegram-headless" claude auth status 2>/dev/null | grep -q '"loggedIn" *: *true' && echo claude=yes || echo claude=no`)}
  ${asW('tmux has-session -t kappmaker-login 2>/dev/null && echo login_session=yes')}
  ${asW(`kappmaker-army worker status ${w} 2>/dev/null | sed -n 's/^  token: *\\([a-z]*\\).*/token=\\1/p; s/^  paired: *\\([a-z]*\\).*/paired=\\1/p'`)}
  ${asW(`cat "$HOME/.army/bots/"${w} 2>/dev/null | sed 's/^/bot=/'`)}
fi
exit 0
`;
}

export interface SetupState {
  installing: boolean;
  installRc?: number;
  installStep?: string;
  minutes?: number;
  installed: boolean;
  claude: boolean;
  loginWaiting: boolean;
  token: boolean;
  paired: boolean;
  bot?: string;
}

export function parseState(out: string): SetupState {
  const kv: Record<string, string> = {};
  for (const line of out.split('\n')) {
    const m = line.match(/^([a-z_]+)=(.*)$/);
    if (m) kv[m[1]] = m[2].trim();
  }
  const started = Number(kv.install_started), now = Number(kv.now);
  return {
    installing: kv.install === 'running',
    installRc: kv.install_rc !== undefined && kv.install_rc !== '' ? Number(kv.install_rc) : undefined,
    installStep: kv.install_step || undefined,
    minutes: started && now ? Math.max(0, Math.round((now - started) / 60)) : undefined,
    installed: kv.army === 'installed',
    claude: kv.claude === 'yes',
    loginWaiting: kv.login_session === 'yes',
    token: kv.token === 'present',
    paired: kv.paired === 'yes',
    bot: kv.bot || undefined,
  };
}

/**
 * Starts `install` (the text from installScript) detached under ${SETUP_DIR}; returns at once. The key, if any, is
 * written to a 600 file there and read (then deleted) by the install script: never an argument on either side.
 */
export function detachedInstall(install: string, key?: string): string {
  if (install.includes('KAPPMAKER_SETUP_EOF')) throw new Error('installer text contains the stream marker');
  return [
    'set -u', 'umask 077', `S=${SETUP_DIR}`, 'mkdir -p "$S" && chmod 700 "$S" || exit 1',
    'if [ -f "$S/pid" ] && kill -0 "$(cat "$S/pid")" 2>/dev/null; then echo ALREADY_RUNNING; exit 0; fi',
    'rm -f "$S/rc" "$S/log"', 'date +%s > "$S/started"',
    ...(key ? [`printf '%s' ${shq(key)} > "$S/key"`] : []),
    `cat > "$S/run.sh" <<'KAPPMAKER_SETUP_EOF'`, install.replace(/\n?$/, ''), 'KAPPMAKER_SETUP_EOF',
    'SETSID="$(command -v setsid || true)"',
    `nohup $SETSID bash -c 'bash "$0/run.sh" > "$0/log" 2>&1; echo $? > "$0/rc"; rm -f "$0/run.sh" "$0/key" "$0/pid"' "$S" </dev/null >/dev/null 2>&1 &`,
    'echo $! > "$S/pid"', 'echo STARTED', '',
  ].join('\n');
}

/** Last lines of the detached install's log (for a failure report). */
export const installLogTail = `R=""; [ "$(id -u)" = 0 ] || R="sudo -n"; $R tail -n 40 ${SETUP_DIR}/log 2>/dev/null`;
