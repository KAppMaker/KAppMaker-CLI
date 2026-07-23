import path from 'node:path';
import fs from 'fs-extra';
import { logger } from './logger.js';

/**
 * PROGRESS_SETUP.md — a committed checklist of the 13 `kappmaker create` steps,
 * written to the project's git repo root and ticked off as each step completes.
 *
 * Mirrors the PROGRESS_P1…P5 files the template's bundled skills use: any later
 * session (human or agent) reads the file, finds the first unchecked item, and
 * resumes with the standalone command listed next to it. Optional steps the
 * user declined are checked with a "(skipped …)" note so resume logic doesn't
 * nag about a deliberate choice.
 *
 * Every function here is fail-safe: progress tracking must never break setup.
 */

const FILE_NAME = 'PROGRESS_SETUP.md';

interface SetupStepDef {
  id: number;
  label: string;
  /** Standalone command that re-runs just this step. */
  redo: (v: SetupVars) => string;
  optional?: boolean;
}

export interface SetupVars {
  appName: string;
  packageName: string;
  firebaseProject: string;
}

const STEPS: SetupStepDef[] = [
  { id: 1, label: 'Clone template repository', redo: v => `kappmaker clone ${v.appName}` },
  { id: 2, label: 'Firebase authentication', redo: () => 'kappmaker firebase login' },
  { id: 3, label: 'Create Firebase project', redo: v => `kappmaker firebase project --app-name ${v.appName}` },
  { id: 4, label: 'Create Firebase apps (Android + iOS)', redo: v => `kappmaker firebase apps --project ${v.firebaseProject} --app-name ${v.appName} --package-name ${v.packageName}` },
  { id: 5, label: 'Enable anonymous authentication', redo: v => `kappmaker firebase auth-anonymous --project ${v.firebaseProject}` },
  { id: 6, label: 'Download Firebase SDK configs', redo: v => `kappmaker firebase configs --project ${v.firebaseProject} --app-name ${v.appName} --package-name ${v.packageName}` },
  { id: 7, label: 'App logo generation', redo: () => 'kappmaker create-logo', optional: true },
  { id: 8, label: 'Package refactor (rename package / app id)', redo: v => `kappmaker refactor --app-id ${v.packageName} --app-name ${v.appName}` },
  { id: 9, label: 'Build environment + signing keystore', redo: () => 'kappmaker generate-keystore' },
  { id: 10, label: 'Git remotes (template as upstream)', redo: () => 'kappmaker git setup-upstream' },
  { id: 11, label: 'App Store Connect setup', redo: () => 'kappmaker create-appstore-app', optional: true },
  { id: 12, label: 'Google Play Console setup', redo: () => 'kappmaker gpc setup', optional: true },
  { id: 13, label: 'Adapty subscription setup', redo: () => 'kappmaker adapty setup', optional: true },
];

function stepLine(step: SetupStepDef, vars: SetupVars): string {
  const opt = step.optional ? ' *(optional)*' : '';
  return `- [ ] **Step ${step.id} — ${step.label}**${opt} · standalone: \`${step.redo(vars)}\``;
}

function fileContent(vars: SetupVars): string {
  const lines = STEPS.map(s => stepLine(s, vars)).join('\n');
  return `# Setup Progress — \`kappmaker create ${vars.appName}\`

> [!NOTE]
> Auto-managed by the KAppMaker CLI: each step is ticked as \`kappmaker create\` completes it.
> If setup was interrupted, resume from the **first unchecked item** using the standalone
> command listed next to it — every step is independently re-runnable and idempotent.
> Steps marked "(skipped)" were deliberately declined; run their command later when ready.
>
> Feature/phase progress for the app itself lives in \`PROGRESS_FEATURES.md\` /
> \`PROGRESS_P1…P5*.md\` (see \`skills/README.md\`), not here.

${lines}
`;
}

function progressPath(projectPath: string): string {
  return path.join(projectPath, FILE_NAME);
}

/** Create PROGRESS_SETUP.md (no-op if it already exists — re-runs keep earlier state). */
export async function initSetupProgress(projectPath: string, vars: SetupVars): Promise<void> {
  try {
    const file = progressPath(projectPath);
    if (await fs.pathExists(file)) return;
    await fs.writeFile(file, fileContent(vars), 'utf8');
  } catch {
    logger.warn(`Could not write ${FILE_NAME} -- continuing without progress tracking.`);
  }
}

/** Tick a step off. status 'skipped' checks it with a "(skipped — run later)" note. */
export async function markSetupStep(
  projectPath: string,
  stepId: number,
  status: 'done' | 'skipped' = 'done',
): Promise<void> {
  try {
    const file = progressPath(projectPath);
    if (!(await fs.pathExists(file))) return;
    const content = await fs.readFile(file, 'utf8');
    const pattern = new RegExp(`^- \\[[ x]\\] (\\*\\*Step ${stepId} — .*)$`, 'm');
    const match = content.match(pattern);
    if (!match) return;
    const base = match[1].replace(/ \*\(skipped[^)]*\)\*$/, '');
    const suffix = status === 'skipped' ? ' *(skipped — run the standalone command when ready)*' : '';
    await fs.writeFile(file, content.replace(pattern, `- [x] ${base}${suffix}`), 'utf8');
  } catch {
    // Never let progress bookkeeping fail the actual setup.
  }
}
