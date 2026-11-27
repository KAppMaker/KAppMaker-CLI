import { z } from 'zod';
import { cli, flags, type ToolDef } from '../define.js';

export const shipTools: ToolDef[] = [
  cli({
    name: 'fastlane_configure',
    title: 'Set up Fastlane',
    description: 'Adds the Gemfile and Fastfile to the mobile app and runs bundle install. Needed once before publish.',
    kind: 'long',
    network: true,
    shape: {},
    commands: () => [['fastlane', 'configure']],
  }),
  cli({
    name: 'generate_keystore',
    title: 'Create the Android signing keystore',
    description: 'Creates the Android upload keystore and its properties file (passwords stay in the file and are never shown). Keep a backup: losing it locks the Play listing.',
    kind: 'write',
    shape: { first_name: z.string().optional(), organization: z.string().optional(), output: z.string().optional() },
    commands: (i) => [['generate-keystore', ...flags({ '--first-name': i.first_name, '--organization': i.organization, '--output': i.output })]],
  }),
  cli({
    name: 'android_release_build',
    title: 'Build the signed Android AAB',
    description: 'Builds the signed release AAB with Gradle (creates the keystore first if missing). Takes several minutes.',
    kind: 'long',
    shape: { organization: z.string().optional(), first_name: z.string().optional(), output: z.string().optional() },
    commands: (i) => [['android-release-build', ...flags({ '--organization': i.organization, '--first-name': i.first_name, '--output': i.output })]],
  }),
  cli({
    name: 'publish',
    title: 'Build and upload to the stores',
    description:
      'Builds and uploads with Fastlane to Google Play and/or the App Store, optionally with listing text, screenshots and ' +
      'images, and (by default) submits for review. iOS needs a Mac with Xcode, or remote=true to build on GitHub Actions (set up with ios_ci_init).',
    kind: 'long',
    network: true,
    shape: {
      platforms: z.array(z.enum(['android', 'ios'])).min(1).describe('Which stores'),
      track: z.enum(['internal', 'alpha', 'beta', 'production']).default('internal').describe('Google Play track'),
      upload_metadata: z.boolean().default(false),
      upload_screenshots: z.boolean().default(false),
      upload_images: z.boolean().default(false).describe('Android icon + feature graphic'),
      remote: z.boolean().default(false).describe('iOS: build on a GitHub macOS runner'),
      submit_for_review: z.boolean().default(false).describe('Submit for store review after upload'),
    },
    commands: (i) => [['publish', ...i.platforms.flatMap((p: string) => ['--platform', p]), '--track', i.track,
      ...flags({ '--upload-metadata': i.upload_metadata, '--upload-screenshots': i.upload_screenshots,
        '--upload-images': i.upload_images, '--remote': i.remote }),
      '--submit-for-review', String(i.submit_for_review)]],
    planNote: (i) =>
      `Uploads a build to ${i.platforms.join(' + ')}${i.platforms.includes('android') ? ` (Play track: ${i.track})` : ''}` +
      `${i.submit_for_review ? ' and SUBMITS IT FOR REVIEW' : ', without submitting for review'}.`,
  }),
  cli({
    name: 'ios_ci_init',
    title: 'Set up iOS builds without a Mac',
    description:
      'One-time: creates the private certificates repo, sets the GitHub secrets, writes the macOS build workflow and the ' +
      'Fastlane CI lane. Needs `gh auth login`. The certificate password is generated and kept on this machine only. Use dry_run to preview files.',
    kind: 'long',
    network: true,
    shape: {
      repo: z.string().optional().describe('owner/name of the app repo (default: its GitHub remote)'),
      certs_repo: z.string().optional().describe('owner/name of the private certificates repo'),
      mobile_dir: z.string().optional(),
      dry_run: z.boolean().default(false),
    },
    commands: (i) => [['ios-ci', 'init', ...flags({ '--repo': i.repo, '--certs-repo': i.certs_repo, '--mobile-dir': i.mobile_dir, '--dry-run': i.dry_run })]],
  }),
  cli({
    name: 'ios_ci_build',
    title: 'Build iOS on GitHub Actions',
    description:
      'Starts a release build on a GitHub macOS runner and uploads it to TestFlight or the App Store. Returns once queued ' +
      '(check with ios_ci_status) unless wait=true. Uses GitHub Actions minutes on the buyer\'s account.',
    kind: 'long',
    network: true,
    shape: {
      track: z.enum(['testflight', 'appstore']).default('testflight'),
      submit_for_review: z.boolean().default(false),
      upload_metadata: z.boolean().default(false),
      upload_screenshots: z.boolean().default(false),
      wait: z.boolean().default(false).describe('Follow the build to the end (~20 min)'),
      ref: z.string().optional().describe('Branch or tag'),
    },
    commands: (i) => [['ios-ci', 'build', '--track', i.track, ...flags({
      '--submit-for-review': i.submit_for_review, '--upload-metadata': i.upload_metadata,
      '--upload-screenshots': i.upload_screenshots, '--no-wait': !i.wait, '--ref': i.ref,
    })]],
    planNote: (i) => `Queues a GitHub macOS build (billed as macOS minutes) → ${i.track}${i.submit_for_review ? ', then SUBMITS FOR REVIEW' : ''}.`,
  }),
  cli({
    name: 'ios_ci_status',
    title: 'Recent iOS CI builds',
    description: 'Read-only: the latest iOS build runs and, for a failed one, the failing step.',
    kind: 'read',
    network: true,
    shape: {},
    commands: () => [['ios-ci', 'status']],
  }),
];
