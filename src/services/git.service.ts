import { run, runStreaming } from '../utils/exec.js';

export async function cloneTemplate(templateRepo: string, targetDir: string): Promise<void> {
  await runStreaming('git', ['clone', templateRepo, targetDir], {
    label: `Cloning template into ${targetDir}`,
  });
}

export async function setTemplateAsUpstream(repoRoot: string): Promise<void> {
  await run('git', ['remote', 'rename', 'origin', 'upstream'], {
    cwd: repoRoot,
    label: 'Renaming origin to upstream (template becomes upstream remote)',
  });
}
