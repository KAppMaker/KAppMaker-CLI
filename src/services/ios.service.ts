import path from 'node:path';
import { run } from '../utils/exec.js';

export async function installPods(mobileDir: string): Promise<void> {
  await run('pod', ['install', '--repo-update'], {
    cwd: path.join(mobileDir, 'iosApp'),
    label: 'Installing iOS dependencies (pod install)',
  });
}
