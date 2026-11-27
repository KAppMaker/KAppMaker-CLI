import { z } from 'zod';
import { cli, flags, type ToolDef } from '../define.js';

const appName = z.string().regex(/^[A-Z][A-Za-z0-9]*$/, 'PascalCase, letters and digits only, e.g. Remimi')
  .describe('App name in PascalCase, e.g. "Remimi"');
const packageName = z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/, 'reverse-DNS, e.g. com.example.myapp')
  .describe('Application ID / bundle ID, e.g. "com.example.myapp"');

export const projectTools: ToolDef[] = [
  cli({
    name: 'clone_template',
    title: 'Clone the app template',
    description:
      'Step 1 of a new app: clones the KAppMaker Kotlin Multiplatform template into "<AppName>-All" inside ' +
      'project_dir. Refuses to overwrite an existing folder. Next: firebase_* tools, then refactor_package.',
    kind: 'long',
    network: true,
    shape: {
      app_name: appName,
      template_repo: z.string().optional().describe('Git URL of a custom template (default: the saved templateRepo)'),
      target_dir: z.string().optional().describe('Folder to create (default: <AppName>-All)'),
    },
    commands: (i) => [['clone', i.app_name, ...flags({ '--template-repo': i.template_repo, '--target-dir': i.target_dir })]],
  }),
  cli({
    name: 'git_setup_upstream',
    title: 'Make the template the upstream remote',
    description: 'Renames the "origin" git remote to "upstream" in project_dir, so the buyer can add their own origin and still pull template updates.',
    kind: 'write',
    shape: {},
    commands: () => [['git', 'setup-upstream', '.']],
  }),
  cli({
    name: 'firebase_project',
    title: 'Create the Firebase project',
    description:
      'Creates a Firebase project (skips when it already exists). Needs the Firebase CLI logged in (`firebase login` in a terminal). ' +
      'Give app_name to derive the project id, or project_id explicitly.',
    kind: 'long',
    network: true,
    shape: {
      app_name: appName.optional(),
      project_id: z.string().optional().describe('Firebase project id, e.g. "myapp-app"'),
      display_name: z.string().optional(),
    },
    commands: (i) => [['firebase', 'project', ...flags({ '--app-name': i.app_name, '--project-id': i.project_id, '--display-name': i.display_name })]],
  }),
  cli({
    name: 'firebase_apps',
    title: 'Create the Firebase Android + iOS apps',
    description: 'Creates (or reuses) the Android and iOS apps inside a Firebase project.',
    kind: 'long',
    network: true,
    shape: { project: z.string().describe('Firebase project id'), app_name: appName, package_name: packageName },
    commands: (i) => [['firebase', 'apps', '--project', i.project, '--app-name', i.app_name, '--package-name', i.package_name]],
  }),
  cli({
    name: 'firebase_auth_anonymous',
    title: 'Enable anonymous sign-in',
    description: 'Turns on anonymous authentication for the Firebase project (the template signs users in anonymously).',
    kind: 'long',
    network: true,
    shape: { project: z.string().describe('Firebase project id') },
    commands: (i) => [['firebase', 'auth-anonymous', '--project', i.project]],
  }),
  cli({
    name: 'firebase_configs',
    title: 'Download the Firebase SDK config files',
    description: 'Downloads google-services.json and GoogleService-Info.plist into the app (run inside the "<AppName>-All" folder).',
    kind: 'write',
    network: true,
    shape: { project: z.string().describe('Firebase project id'), app_name: appName, package_name: packageName.optional() },
    commands: (i) => [['firebase', 'configs', '--project', i.project, '--app-name', i.app_name, ...flags({ '--package-name': i.package_name })]],
  }),
  cli({
    name: 'refactor_package',
    title: 'Rename package, app id and app name',
    description:
      'Rewrites the template\'s package name, Android applicationId, iOS bundle ID and display name across every module. ' +
      'Run inside the "<AppName>-All" folder, before the first commit of your own changes.',
    kind: 'long',
    shape: {
      app_id: packageName,
      app_name: z.string().describe('Display name, e.g. "MyApp"'),
      old_app_id: z.string().optional().describe('Current id to replace (default: the template\'s)'),
      old_app_name: z.string().optional(),
      skip_package_rename: z.boolean().optional().describe('Only change ids and name; keep Kotlin package folders'),
    },
    commands: (i) => [['refactor', '--app-id', i.app_id, '--app-name', i.app_name,
      ...flags({ '--old-app-id': i.old_app_id, '--old-app-name': i.old_app_name, '--skip-package-rename': i.skip_package_rename })]],
  }),
  cli({
    name: 'version_bump',
    title: 'Bump the app version',
    description: 'Raises the Android versionCode and iOS build number by one, and sets the version name when given (else bumps the patch).',
    kind: 'write',
    shape: { version: z.string().regex(/^\d+\.\d+\.\d+$/).optional().describe('Explicit version name, e.g. "2.0.0"') },
    commands: (i) => [['update-version', ...flags({ '--version': i.version })]],
  }),
];
