import chalk from 'chalk';
import { loadConfig } from '../utils/config.js';
import { logger } from '../utils/logger.js';

/**
 * Google Play `regionsVersion` + the region-coverage report.
 *
 * The CLI used to hardcode `2022/02`. Play now rejects that catalog for some
 * regions ("ET is not billable") and expects `2026/01`. The version is now
 * resolved per run: --regions-version flag > config `playRegionsVersion` >
 * DEFAULT_REGIONS_VERSION. The 2022/02 currency-drift workarounds only apply
 * when someone explicitly asks for 2022/02.
 */
export const DEFAULT_REGIONS_VERSION = '2026/01';

let regionsVersion = DEFAULT_REGIONS_VERSION;

export function getRegionsVersion(): string {
  return regionsVersion;
}

export function setRegionsVersion(v: string): void {
  if (!/^\d{4}\/\d{2}$/.test(v)) throw new Error(`Invalid regionsVersion "${v}" (expected YYYY/MM, e.g. ${DEFAULT_REGIONS_VERSION})`);
  regionsVersion = v;
}

/** flag > config playRegionsVersion > default. */
export async function resolveRegionsVersion(flag?: string): Promise<string> {
  const fromConfig = (await loadConfig()).playRegionsVersion;
  setRegionsVersion(flag || fromConfig || DEFAULT_REGIONS_VERSION);
  logger.info(`Google Play regionsVersion: ${regionsVersion}`);
  return regionsVersion;
}

/** The 2022/02 catalog has known currency drift (BG/CI/CM/SN) and MN removed. */
export function isLegacy2022Catalog(): boolean {
  return regionsVersion === '2022/02';
}

// ── Coverage + failures ─────────────────────────────────────────────

export interface CoverageRow {
  product: string;
  /** Regions with a price that new buyers can purchase in. */
  priced: number;
  /** Billable regions for the product's base price (from convertRegionPrices). */
  billable: number;
  /** Billable regions that are missing or not available. */
  missing: string[];
}

const coverage: CoverageRow[] = [];
const failures: Array<{ product: string; reason: string }> = [];

export function resetMonetizationReport(): void {
  coverage.length = 0;
  failures.length = 0;
}

export function recordCoverage(row: CoverageRow): void {
  coverage.push(row);
}

export function recordMonetizationFailure(product: string, reason: string): void {
  failures.push({ product, reason });
}

export function monetizationReport(): { coverage: CoverageRow[]; failures: Array<{ product: string; reason: string }> } {
  return { coverage: [...coverage], failures: [...failures] };
}

/** "N of M regions priced" per product. Returns true when every product is fully priced and nothing failed. */
export function printCoverageReport(): boolean {
  if (coverage.length === 0 && failures.length === 0) return true;
  console.log('');
  console.log(chalk.bold('  Google Play region coverage'));
  for (const row of coverage) {
    const full = row.priced >= row.billable && row.missing.length === 0;
    const mark = full ? chalk.green('OK    ') : chalk.red('FAILED');
    const miss = row.missing.length > 0 ? chalk.gray(` missing: ${row.missing.slice(0, 12).join(', ')}${row.missing.length > 12 ? ', ...' : ''}`) : '';
    console.log(`    ${mark} ${row.product}: ${row.priced} of ${row.billable} regions priced${miss}`);
  }
  for (const f of failures) console.log(`    ${chalk.red('FAILED')} ${f.product}: ${f.reason}`);
  const short = coverage.filter((r) => r.priced < r.billable || r.missing.length > 0);
  return short.length === 0 && failures.length === 0;
}

/**
 * Compare what Google stored against the billable set. `stored` maps region ->
 * whether new buyers can purchase there.
 */
export function coverageFor(product: string, stored: Map<string, boolean>, billable: Iterable<string>): CoverageRow {
  const billableSet = new Set(billable);
  const missing = [...billableSet].filter((r) => stored.get(r) !== true).sort();
  const priced = [...billableSet].filter((r) => stored.get(r) === true).length;
  return { product, priced, billable: billableSet.size, missing };
}

/** Print the coverage report and throw when a product is short or failed (for one-shot pushes). */
export function assertPlayCoverage(what: string): void {
  if (!printCoverageReport()) throw new Error(`${what}: not priced in every billable region or a write failed (see the report above).`);
}
