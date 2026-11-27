import { shq, type Conn } from './ssh.js';

/** Recommended server size (same numbers as kappmaker-army doctor and setup-vps.sh). */
export const RECOMMENDED = { cpus: 4, ramGb: 8, diskGb: 80 };
export const WORKER_USER = 'army';

/** Read-only probe: one `key=value` per line. Runs as whoever logs in. */
export const PROBE = `set +e
[ -r /etc/os-release ] && . /etc/os-release
echo "os=\${PRETTY_NAME:-$(uname -s)}"; echo "os_id=\${ID:-}"; echo "os_ver=\${VERSION_ID:-}"
echo "kernel=$(uname -s)"; echo "arch=$(uname -m)"; echo "cpus=$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 0)"
echo "ram_mb=$(awk '/^MemTotal/{print int($2/1024)}' /proc/meminfo 2>/dev/null)"
echo "swap_mb=$(awk '/^SwapTotal/{print int($2/1024)}' /proc/meminfo 2>/dev/null)"
echo "disk_total_gb=$(df -Pk / | awk 'NR==2{print int($2/1048576)}')"; echo "disk_free_gb=$(df -Pk / | awk 'NR==2{print int($4/1048576)}')"
echo "user=$(id -un)"
if [ "$(id -u)" = 0 ]; then echo sudo=root; elif sudo -n true 2>/dev/null; then echo sudo=nopasswd
elif id -nG 2>/dev/null | grep -qwE 'sudo|wheel|admin'; then echo sudo=password; else echo sudo=none; fi
echo "systemd=$([ -d /run/systemd/system ] && echo yes || echo no)"
R=""; [ "$(id -u)" = 0 ] || R="sudo -n"
if id ${WORKER_USER} >/dev/null 2>&1; then echo worker_user=yes
  $R test -f ~${WORKER_USER}/.army/army.conf 2>/dev/null && echo army=installed; fi
[ -f "$HOME/.army/army.conf" ] && echo army_here=installed
command -v tailscale >/dev/null 2>&1 && echo tailscale=yes
exit 0
`;

export type Probe = Record<string, string>;

export function parseProbe(out: string): Probe {
  const p: Probe = {};
  for (const line of out.split('\n')) {
    const m = line.match(/^([a-z_]+)=(.*)$/);
    if (m) p[m[1]] = m[2].trim();
  }
  return p;
}

/** Plain report + whether an install can go ahead from this login. */
export function judge(p: Probe, c: Conn): { lines: string[]; blockers: string[]; installed: boolean } {
  const lines: string[] = [];
  const blockers: string[] = [];
  const gb = (mb: string) => Math.round((Number(mb) || 0) / 1024);
  const supported = (p.os_id === 'ubuntu' && ['22.04', '24.04'].includes(p.os_ver)) || (p.os_id === 'debian' && p.os_ver === '12');
  lines.push(`System: ${p.os ?? 'unknown'} · ${p.arch ?? '?'}${supported ? '' : '  (not a tested system: Ubuntu 22.04/24.04 or Debian 12 are)'}`);
  if (p.kernel && p.kernel !== 'Linux') blockers.push('This is not a Linux server. On a Mac, install App Army on the laptop path instead.');
  if (p.arch === 'aarch64' || p.arch === 'arm64') lines.push('Note: ARM server. Android build tools run only on x86_64 Linux, so Android builds will not work here; iOS-from-CI and everything else does.');
  const cpus = Number(p.cpus) || 0, ram = gb(p.ram_mb), disk = Number(p.disk_total_gb) || 0;
  const size = `${cpus} vCPU · ${ram} GB RAM · ${disk} GB disk (${p.disk_free_gb ?? '?'} GB free) · swap ${gb(p.swap_mb)} GB`;
  const small = cpus < RECOMMENDED.cpus || ram < RECOMMENDED.ramGb || disk < RECOMMENDED.diskGb;
  lines.push(`Size: ${size}${small ? `  (below the recommended ${RECOMMENDED.cpus} vCPU / ${RECOMMENDED.ramGb} GB / ${RECOMMENDED.diskGb} GB: app builds will be slow or run out of memory)` : '  (meets the recommended size)'}`);
  if ((Number(p.disk_free_gb) || 0) < 20) blockers.push(`Only ${p.disk_free_gb} GB free on the disk; the install needs 20 GB or more.`);
  if (p.sudo === 'root') lines.push(`Login: ${c.user} is root: fine for the install.`);
  else if (p.sudo === 'nopasswd') lines.push(`Login: ${c.user} can use sudo without a password: fine for the install.`);
  else blockers.push(`Login: ${c.user} ${p.sudo === 'password' ? 'needs a password for sudo' : 'has no admin rights'}. Log in as root (or a user with passwordless sudo) for the install.`);
  if (p.systemd !== 'yes') lines.push('Note: no systemd here, so workers run without a service manager (fine for a test box).');
  const installed = p.army === 'installed' || p.army_here === 'installed';
  lines.push(installed ? 'App Army: already installed here (installing again is safe: it repairs and updates).' : 'App Army: not installed yet.');
  return { lines, blockers, installed };
}

/** The installer run: the verified install.sh and (optionally) the licence key go in on stdin, never as arguments. */
export function installScript(o: { script: string; key?: string; code?: string; api?: string; sudo: 'limited' | 'full'; worker: string; mentor: boolean; kitOnly?: boolean }): string {
  if (o.script.includes('KAPPMAKER_INSTALLER_EOF')) throw new Error('installer text contains the stream marker');
  const args = ['--server', '--yes', '--no-start', '--sudo', o.sudo, '--worker', o.worker];
  if (o.code) args.push('--code', o.code);
  if (o.kitOnly) args.push('--no-toolchain', '--no-voice', '--no-claude-mem');
  return [
    'set -u', 'umask 077', 'd="$(mktemp -d)"', `trap 'rm -rf "$d"' EXIT`,
    `cat > "$d/install.sh" <<'KAPPMAKER_INSTALLER_EOF'`, o.script.replace(/\n?$/, ''), 'KAPPMAKER_INSTALLER_EOF',
    ...(o.key ? [`KAPPMAKER_LICENSE_KEY=${shq(o.key)}; export KAPPMAKER_LICENSE_KEY`] : []),
    ...(o.api ? [`KAPPMAKER_API=${shq(o.api)}; export KAPPMAKER_API`] : []),
    `bash "$d/install.sh" ${args.map(shq).join(' ')}`, 'rc=$?', 'unset KAPPMAKER_LICENSE_KEY',
    ...(o.mentor ? [
      `if [ "$rc" = 0 ]; then echo "== mentor pack"; runuser -l ${WORKER_USER} -c 'export PATH="$HOME/.army/bin:$PATH"; kappmaker-army mentor install' || echo "mentor pack: not installed yet (run kappmaker-army mentor install on the server)"; fi`,
    ] : []),
    'exit $rc', '',
  ].join('\n');
}

/** Run `body` as the App Army worker user, whichever account we logged in with. */
export function asWorker(c: Conn, body: string): { remote: string; stdin: string } {
  const script = `export PATH="$HOME/.army/bin:$PATH"\ncd "$HOME" || exit 1\n${body}\n`;
  if (c.user === WORKER_USER) return { remote: 'bash -s', stdin: script };
  if (c.user === 'root') return { remote: `runuser -l ${WORKER_USER} -c 'bash -s'`, stdin: script };
  return { remote: `sudo -n -iu ${WORKER_USER} bash -s`, stdin: script };
}

/** How the user runs an interactive kit command on the box themselves (terminal attached). */
export function workerShellCommand(c: Conn, cmd: string): string {
  if (c.user === WORKER_USER) return `bash -lc ${shq(cmd)}`;
  if (c.user === 'root') return `runuser -l ${WORKER_USER} -c ${shq(cmd)}`;
  return `sudo -iu ${WORKER_USER} bash -lc ${shq(cmd)}`;
}
