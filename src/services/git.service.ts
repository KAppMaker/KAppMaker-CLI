import fs from 'fs-extra';
import { run, runStreaming } from '../utils/exec.js';
import { logger } from '../utils/logger.js';

/** git@github.com:owner/repo(.git) or ssh://git@github.com/owner/repo → https://github.com/owner/repo.git; else null. */
export function githubSshToHttps(url: string): string | null {
  const m = url.match(/^(?:ssh:\/\/)?git@github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/);
  return m ? `https://github.com/${m[1]}/${m[2]}.git` : null;
}

export async function cloneTemplate(templateRepo: string, targetDir: string): Promise<void> {
  const https = githubSshToHttps(templateRepo);
  const code = await runStreaming('git', ['clone', templateRepo, targetDir], {
    label: `Cloning template into ${targetDir}`,
    allowFailure: https !== null,
  });
  if (code === 0 || !https) return;
  // Older configs saved the SSH URL; a machine without a GitHub SSH key
  // cannot use it, but the public template clones fine over HTTPS.
  logger.warn(`SSH clone failed (no GitHub SSH key on this machine?): retrying over HTTPS: ${https}`);
  await fs.remove(targetDir);
  await runStreaming('git', ['clone', https, targetDir], { label: `Cloning template into ${targetDir}` });
  logger.info(`To skip the SSH attempt next time: kappmaker config set templateRepo ${https}`);
}

export async function setTemplateAsUpstream(repoRoot: string): Promise<void> {
  await run('git', ['remote', 'rename', 'origin', 'upstream'], {
    cwd: repoRoot,
    label: 'Renaming origin to upstream (template becomes upstream remote)',
  });
}
