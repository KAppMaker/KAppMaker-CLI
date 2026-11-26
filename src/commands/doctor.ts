import chalk from 'chalk';
import { loadConfig } from '../utils/config.js';
import { TOOLS, checkTool, currentPlatform, type CheckResult } from '../utils/prereqs.js';

const MARK: Record<CheckResult['status'], string> = {
  ok: chalk.green('ok'),
  outdated: chalk.yellow('old'),
  missing: chalk.red('--'),
  unsupported: chalk.dim('n/a'),
};

/**
 * `kappmaker doctor` — which external tools are installed, at what version,
 * and the exact install line for each missing or outdated one. Read-only and
 * local: runs `<tool> --version`, contacts nothing.
 */
export async function doctor(options: { json?: boolean; strict?: boolean }): Promise<number> {
  const config = await loadConfig().catch(() => undefined);
  const results = await Promise.all(
    TOOLS.map((tool) => checkTool(tool, { androidSdkPath: config?.androidSdkPath })),
  );

  if (options.json) {
    console.log(JSON.stringify({ platform: currentPlatform(), node: process.versions.node, tools: results }, null, 2));
  } else {
    console.log(chalk.bold(`\n  kappmaker doctor (${currentPlatform()}, Node ${process.versions.node})\n`));
    for (const r of results) {
      const tool = TOOLS.find((t) => t.id === r.id)!;
      const version = r.version ? chalk.dim(` ${r.version}`) : '';
      const min = r.status === 'outdated' && r.min ? chalk.yellow(` (needs ${r.min}+)`) : '';
      console.log(`  ${MARK[r.status].padEnd(13)} ${r.name}${version}${min}  ${chalk.dim(`— ${tool.usedBy}`)}`);
      if (r.hint && r.status !== 'ok') console.log(`               ${chalk.cyan(r.hint)}`);
    }
    console.log('');
  }

  const bad = results.some(
    (r) => (r.status === 'missing' || r.status === 'outdated') && !TOOLS.find((t) => t.id === r.id)?.optional,
  );
  return options.strict && bad ? 1 : 0;
}
