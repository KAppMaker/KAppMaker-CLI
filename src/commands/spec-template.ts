import path from 'node:path';
import fs from 'fs-extra';
import { logger } from '../utils/logger.js';
import screenshotsTemplate from '../templates/specs/screenshots.json' with { type: 'json' };
import featureGraphicTemplate from '../templates/specs/feature-graphic.json' with { type: 'json' };
import logoTemplate from '../templates/specs/logo.json' with { type: 'json' };
import imageTemplate from '../templates/specs/image.json' with { type: 'json' };

// Registry of canonical spec-JSON templates, one per image kind. Adding a new
// image kind = drop a template into src/templates/specs/ and register it here.
const TEMPLATES: Record<string, { spec: unknown; usedBy: string }> = {
  screenshots: { spec: screenshotsTemplate, usedBy: 'generate-screenshots --spec' },
  'feature-graphic': { spec: featureGraphicTemplate, usedBy: 'generate-feature-image --spec' },
  logo: { spec: logoTemplate, usedBy: 'create-logo --spec' },
  image: { spec: imageTemplate, usedBy: 'generate-image --spec' },
};

export interface SpecTemplateOptions {
  list?: boolean;
  output?: string;
}

export async function specTemplate(
  kind: string | undefined,
  options: SpecTemplateOptions,
): Promise<void> {
  if (options.list || !kind) {
    for (const [name, { usedBy }] of Object.entries(TEMPLATES)) {
      console.log(`${name.padEnd(16)} → kappmaker ${usedBy} <file>`);
    }
    return;
  }

  const entry = TEMPLATES[kind];
  if (!entry) {
    logger.fatal(`Unknown spec template: ${kind}. Available: ${Object.keys(TEMPLATES).join(', ')}`);
    process.exit(1);
  }

  const json = JSON.stringify(entry.spec, null, 2);

  if (options.output) {
    const resolved = path.resolve(options.output);
    if (await fs.pathExists(resolved)) {
      logger.fatal(`Refusing to overwrite existing file: ${resolved}`);
      process.exit(1);
    }
    await fs.ensureDir(path.dirname(resolved));
    await fs.writeFile(resolved, `${json}\n`);
    logger.success(`Spec template written to: ${resolved}`);
    logger.info('Fill the empty fields (the _instructions key explains how), then pass it via --spec.');
    return;
  }

  console.log(json);
}
