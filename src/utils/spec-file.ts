import path from 'node:path';
import fs from 'fs-extra';
import { logger } from './logger.js';

// Loads a pre-authored image-generation spec (--spec <file.json>) and returns
// it normalized as a pretty-printed JSON string to use as the fal.ai prompt.
// The spec replaces the OpenAI prompt-generation step: any AI model (or the
// user by hand) can author it — see `--print-prompt` on the owning command
// for the exact schema and style direction the JSON is expected to follow.
export async function loadSpec(
  specPath: string,
  expectedScreenshotCount?: number,
): Promise<string> {
  const resolved = path.resolve(specPath);
  if (!(await fs.pathExists(resolved))) {
    logger.fatal(`Spec file not found: ${resolved}`);
    process.exit(1);
  }

  const raw = await fs.readFile(resolved, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    logger.fatal(`Spec file is not valid JSON: ${resolved}\n${(err as Error).message}`);
    process.exit(1);
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    logger.fatal(`Spec file must contain a single JSON object: ${resolved}`);
    process.exit(1);
  }

  // Underscore-prefixed keys (e.g. the templates' _instructions) are
  // authoring aids, not prompt content — strip them before sending.
  for (const key of Object.keys(parsed as Record<string, unknown>)) {
    if (key.startsWith('_')) delete (parsed as Record<string, unknown>)[key];
  }

  const screenshots = (parsed as { screenshots?: unknown }).screenshots;
  if (
    expectedScreenshotCount !== undefined &&
    Array.isArray(screenshots) &&
    screenshots.length !== expectedScreenshotCount
  ) {
    logger.warn(
      `Spec lists ${screenshots.length} screenshots but the grid renders exactly ${expectedScreenshotCount} — output count will not change.`,
    );
  }

  logger.info(`Using spec: ${resolved}`);
  return JSON.stringify(parsed, null, 2);
}
