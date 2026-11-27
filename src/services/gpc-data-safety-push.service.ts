import path from 'node:path';
import fs from 'fs-extra';
import { logger } from '../utils/logger.js';
import { CliError } from '../utils/errors.js';
import { updateDataSafety } from './gpc.service.js';
import { buildDataSafetyCsv, checkDataSafetyCsv } from './gpc-data-safety.service.js';
import type { GooglePlayConfig } from '../types/googleplay.js';

export type DataSafetyOutcome = 'pushed' | 'not-configured';

/**
 * Push the Data safety declaration. Throws (non-zero exit) when the CSV is
 * missing/empty/invalid or Play answers non-2xx, with Play's error body. It
 * used to warn and print OK while Play had rejected it with HTTP 400.
 *
 * Priority: `data_safety_csv_path` (a Play-exported CSV, sent verbatim), then
 * the `data_safety` JSON block (built into Play's CSV format).
 */
export async function pushDataSafetyFromConfig(
  config: GooglePlayConfig,
  opts: { verify?: boolean } = {},
): Promise<DataSafetyOutcome> {
  let csv: string;
  let source: string;
  const fromFile = Boolean(config.data_safety_csv_path);
  if (config.data_safety_csv_path) {
    const csvPath = path.resolve(config.data_safety_csv_path);
    if (!(await fs.pathExists(csvPath))) {
      throw new CliError(`data_safety_csv_path is set to ${csvPath} but the file does not exist.`);
    }
    csv = await fs.readFile(csvPath, 'utf8');
    if (!csv.trim()) throw new CliError(`Data safety CSV at ${csvPath} is empty.`);
    source = csvPath;
  } else if (config.data_safety !== undefined) {
    csv = buildDataSafetyCsv(config.data_safety);
    source = 'data_safety JSON';
  } else {
    return 'not-configured';
  }

  // Check before sending: Play rejects a malformed form with a 400, and a typo
  // in an answer key would be dropped silently. A Play-exported CSV may carry
  // questions newer than our bundled template, so for a file those are notes.
  const check = checkDataSafetyCsv(csv, fromFile ? undefined : config.data_safety);
  const blocking = fromFile ? check.problems.filter((p) => !p.includes('unknown question')) : check.problems;
  for (const p of check.problems.filter((x) => !blocking.includes(x))) logger.warn(`Data safety: ${p}`);
  if (blocking.length > 0) {
    throw new CliError(`Data safety declaration from ${source} is not valid, nothing was sent:\n  - ${blocking.join('\n  - ')}`);
  }

  await updateDataSafety(config.app.package_name, csv);
  logger.success(`Play accepted the data safety declaration (from ${source}).`);

  if (opts.verify) {
    logger.info(`Verify: ${check.answered.length} answers sent, all match Play's question set.`);
    logger.info('Play now declares these data types as collected:');
    if (check.collected.length === 0) logger.info('  (none: the app declares that it collects no user data)');
    for (const c of check.collected) logger.info(`  ${c.type}: ${c.purposes.join(', ')}`);
    logger.info('Note: Play has no API to read the form back. Check it once by eye in Play Console > App content > Data safety.');
  }
  return 'pushed';
}
