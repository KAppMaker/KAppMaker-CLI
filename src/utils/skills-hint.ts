import path from 'node:path';
import fs from 'fs-extra';
import chalk from 'chalk';

/**
 * The KAppMaker template ships its own agent skills (skills/ at the repo root,
 * auto-discovered by Claude Code & friends via the .claude/skills symlink).
 * Point the user at them after a clone/create — but only when the cloned
 * template actually contains them (custom --template-repo may not).
 */
export async function printBundledSkillsHint(projectPath: string): Promise<void> {
  const skillsIndex = path.join(projectPath, 'skills', 'README.md');
  if (!(await fs.pathExists(skillsIndex))) return;

  console.log(chalk.bold('  Next steps (agent skills bundled with your project):'));
  console.log('    Your project ships its own AI-agent skills in ' + chalk.cyan('skills/') + ' — auto-discovered');
  console.log('    by Claude Code (and readable by any agent, or by hand). Index: ' + chalk.cyan('skills/README.md'));
  console.log('    ' + chalk.cyan('*') + ' Starting from an idea? Run the ' + chalk.cyan('new-app') + ' skill first (interview -> PRD).');
  console.log('    ' + chalk.cyan('*') + ' Then follow the ' + chalk.cyan('getting-started') + ' guide: run the app locally + build your MVP.');
  console.log('');
}
