import type { LocalCtx } from '../define.js';
import { asWorker } from './scripts.js';
import type { Conn } from './ssh.js';
import { fail, remote, tail, type ToolOut } from './common.js';

/** Runs `kappmaker-army …` on the server as the worker user; plain failure with the output tail. */
export async function kit(ctx: LocalCtx, c: Conn, body: string, stream = false): Promise<{ ok: boolean; out: string; fail?: ToolOut }> {
  const r = await remote(ctx, c, asWorker(c, body), stream);
  const out = tail(r.output);
  if (r.exitCode === 0) return { ok: true, out };
  if (/command not found|No such file/.test(r.output) && /kappmaker-army/.test(r.output)) {
    return { ok: false, out, fail: fail(`App Army is not installed on ${c.host} for the worker user yet. Run army_install_server first.`) };
  }
  return { ok: false, out, fail: fail(`${r.why ?? `It failed (exit ${r.exitCode}).`}\n${out}`) };
}
