import { run, runStreaming } from '../utils/exec.js';
import type { DerivedConfig } from '../types/index.js';

export async function cloneTemplate(config: DerivedConfig): Promise<void> {
  await runStreaming('git', ['clone', config.templateRepo, config.targetDir], {
    label: `Cloning template into ${config.targetDir}`,
  });
}

export async function setTemplateAsUpstream(repoRoot: string): Promise<void> {
  await run('git', ['remote', 'rename', 'origin', 'upstream'], {
    cwd: repoRoot,
    label: 'Renaming origin to upstream (template becomes upstream remote)',
  });
}
