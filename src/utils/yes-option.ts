import type { Command } from 'commander';

/** Commands that never prompt (or forward their flags elsewhere) do not get --yes. */
const SKIP = new Set(['army', 'mcp', 'doctor', 'help']);

/** Add `-y, --yes` to every leaf command that does not have it yet. */
export function applyYesOption(cmd: Command): void {
  for (const sub of cmd.commands) {
    if (SKIP.has(sub.name())) continue;
    if (sub.commands.length > 0) {
      applyYesOption(sub);
      continue;
    }
    const has = sub.options.some((o) => o.long === '--yes');
    if (!has) sub.option('-y, --yes', 'Answer yes to every confirmation that does not delete or clear data');
  }
}
