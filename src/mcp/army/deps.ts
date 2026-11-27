import { execa } from 'execa';
import type { ArmyDeps } from '../define.js';
import type { HttpFetch } from './licence.js';
import { defaultSsh } from './ssh.js';

/** The real outside world: the buyer's own ssh, fetch to kappmaker.com, and local commands. */
export function defaultArmyDeps(): ArmyDeps {
  return {
    ssh: defaultSsh,
    fetch: fetch as unknown as HttpFetch,
    exec: async (file, args, env) => {
      const r = await execa(file, args, { env, stdin: 'ignore', all: true, reject: false });
      return { exitCode: typeof r.exitCode === 'number' ? r.exitCode : 1, output: String(r.all ?? '') };
    },
  };
}
