import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import { runStreaming } from '../utils/exec.js';
import { logger } from '../utils/logger.js';

const GEMFILE_CONTENT = `source "https://rubygems.org"

gem "fastlane"
`;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function getFastfileContent(): Promise<string> {
  const templatePath = path.join(__dirname, '..', 'templates', 'Fastfile.txt');
  // In compiled dist/, templates is a sibling; in src/ via tsx, same structure
  if (await fs.pathExists(templatePath)) {
    return fs.readFile(templatePath, 'utf8');
  }
  // Fallback: try from source location
  const srcPath = path.join(__dirname, '..', '..', 'src', 'templates', 'Fastfile.txt');
  return fs.readFile(srcPath, 'utf8');
}

export async function configureFastlane(mobileDir: string): Promise<void> {
  const gemfilePath = path.join(mobileDir, 'Gemfile');
  const fastlaneDir = path.join(mobileDir, 'fastlane');
  const fastfilePath = path.join(fastlaneDir, 'Fastfile');

  // Create Gemfile
  if (await fs.pathExists(gemfilePath)) {
    logger.warn('Gemfile already exists — skipping.');
  } else {
    await fs.writeFile(gemfilePath, GEMFILE_CONTENT, 'utf8');
    logger.success('Created Gemfile');
  }

  // Create fastlane/Fastfile
  if (await fs.pathExists(fastfilePath)) {
    logger.warn('fastlane/Fastfile already exists — skipping.');
  } else {
    const fastfileContent = await getFastfileContent();
    await fs.ensureDir(fastlaneDir);
    await fs.writeFile(fastfilePath, fastfileContent, 'utf8');
    logger.success('Created fastlane/Fastfile');
  }

  // Run bundle install
  await runStreaming('bundle', ['install'], {
    cwd: mobileDir,
    label: 'Running bundle install',
  });

  logger.success('Fastlane configured successfully.');
}
