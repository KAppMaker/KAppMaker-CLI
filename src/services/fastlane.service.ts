import { run } from '../utils/exec.js';

export async function firstTimeBuild(
  mobileDir: string,
  organization: string,
): Promise<void> {
  await run(
    'bundle',
    [
      'exec',
      'fastlane',
      'android',
      'first_time_build',
      `organization:${organization}`,
    ],
    {
      cwd: mobileDir,
      label: 'Running Fastlane first_time_build for Android',
    },
  );
}
