import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { run } from '../utils/exec.js';
import { logger } from '../utils/logger.js';
import {
  encodePricePointId,
  expandAscTerritories,
  fetchEqualizations,
  findExactPricePointForPrice,
  logPppFanOut,
  resolveUsdTierWithS,
  type PricePoint,
} from './ppp-pricing.service.js';
import { prepareReviewScreenshot } from './review-screenshot.service.js';
import { ascRun, attrsOf } from './asc.service.js';
import { CliError } from '../utils/errors.js';
import type {
  AppStorePricingConfig,
  AppStoreSubscriptionGroup,
  AppStoreSubscription,
  AppStoreAvailability,
  AppStoreInAppPurchase,
} from '../types/appstore.js';

// ── Failure collector ────────────────────────────────────────────────
// Each subscription / IAP sub-step that fails is recorded here instead of a
// bare warning. setupSubscriptions / setupInAppPurchases throw at the end when
// anything was recorded, so the caller reports the step FAILED.
const failures: string[] = [];

function recordFailure(what: string): void {
  failures.push(what);
  logger.error(what);
}

function takeFailures(): string[] {
  return failures.splice(0);
}

function throwIfFailed(step: string): void {
  const f = takeFailures();
  if (f.length > 0) throw new CliError(`${step}: ${f.length} problem(s):\n  - ${f.join('\n  - ')}`);
}

/**
 * App price + availability, read back. Uses `pricing schedule create --free |
 * --price` (asc 5.x) and `pricing availability create --all-territories` for
 * "every territory", instead of a hand-built territory list.
 */
export async function createPricing(appId: string, pricing: AppStorePricingConfig): Promise<void> {
  const isFree = !pricing.price || Number(pricing.price) === 0;
  const args = ['pricing', 'schedule', 'create', '--app', appId, '--base-territory', pricing.base_territory || 'USA'];
  if (isFree) args.push('--free');
  else args.push('--price', pricing.price);
  args.push('--output', 'json');
  await ascRun(args, isFree ? 'Setting pricing (free)' : `Setting pricing ($${pricing.price})`);

  const availability = pricing.availability ?? { include_all: true, territories: [], available_in_new_territories: true };
  const all = availability.include_all !== false && availability.territories.length === 0;
  await setAppAvailability(appId, availability.available_in_new_territories !== false, all ? 'all' : availability.territories);
}

async function setAppAvailability(appId: string, availableInNew: boolean, territories: string[] | 'all'): Promise<void> {
  const where = territories === 'all' ? ['--all-territories'] : ['--territory', territories.join(',')];
  await ascRun([
    'pricing', 'availability', 'create',
    '--app', appId,
    ...where,
    '--available=true',
    `--available-in-new-territories=${availableInNew}`,
    '--if-exists', 'update',
    '--output', 'json',
  ], `Setting app availability (${territories === 'all' ? 'all territories' : `${territories.length} territories`})`, {
    timeout: 3 * 60_000,
    env: { ASC_TIMEOUT: '180s' },
  });

  // Read back: count the territories the app is actually available in.
  const back = await ascRun(
    ['pricing', 'availability', 'territory-availabilities', '--app', appId, '--paginate', '--output', 'json'],
    'Reading app availability back',
    { timeout: 3 * 60_000, env: { ASC_TIMEOUT: '180s' } },
  );
  const rows: Array<{ attributes?: { available?: boolean } }> = Array.isArray(back.json?.data) ? back.json.data : [];
  const available = rows.filter((r) => r.attributes?.available === true).length;
  const wanted = territories === 'all' ? rows.length : territories.length;
  if (rows.length === 0 || available < wanted) {
    throw new CliError(`App availability read-back: available in ${available} of ${wanted} territories.`);
  }
  logger.success(`App available in ${available} of ${rows.length} territories.`);
}

async function fetchAllTerritories(): Promise<string[]> {
  const result = await run(
    'asc',
    ['pricing', 'territories', 'list', '--output', 'json', '--paginate'],
    { label: 'Fetching all territories', allowFailure: true },
  );

  if (result.exitCode === 0 && result.stdout) {
    try {
      const data = JSON.parse(result.stdout);
      const territories = Array.isArray(data) ? data : (data?.data ?? []);
      return territories.map((t: { id?: string }) => t.id).filter(Boolean);
    } catch {
      // Fall through
    }
  }
  return [];
}

export interface ReviewScreenshotOptions {
  /** Top-level config default applied to every sub/IAP that doesn't override. */
  defaultReviewScreenshot?: string;
}

export async function setupSubscriptions(
  appId: string,
  group: AppStoreSubscriptionGroup,
  availability?: AppStoreAvailability,
  reviewOpts: ReviewScreenshotOptions = {},
): Promise<void> {
  let groupId = await findGroupByName(appId, group.reference_name);
  const createdGroup = !groupId;

  // Resolve territories for subscription availability
  let territories: string[] = [];
  if (availability) {
    territories = availability.territories;
    if (availability.include_all && territories.length === 0) {
      territories = await fetchAllTerritories();
    }
  }

  for (const sub of group.subscriptions) {
    await setupSubscription(appId, group.reference_name, groupId, sub, territories, reviewOpts, group.localizations?.[0]);
    // After first subscription creates the group, fetch its ID for subsequent ones
    if (!groupId) {
      groupId = await findGroupByName(appId, group.reference_name);
    }
  }

  // Group localizations live on the group's version since asc 5.0. The one
  // `subscriptions setup` sends uses Apple's deprecated v1 resource and does
  // not always land, which leaves every subscription MISSING_METADATA. Make
  // sure each configured locale exists on the group version, then read back.
  if (!groupId) groupId = await findGroupByName(appId, group.reference_name);
  if (!groupId) {
    recordFailure(`Subscription group "${group.reference_name}" does not exist after setup.`);
  } else if ((group.localizations ?? []).length === 0) {
    recordFailure(`Subscription group "${group.reference_name}" has no localizations in the config (Apple needs at least one display name).`);
  } else {
    await ensureGroupLocalizations(groupId, group);
  }
  throwIfFailed(`Subscription group "${group.reference_name}"`);
}

async function listGroupLocales(versionId: string): Promise<Set<string>> {
  const r = await ascRun(
    ['subscriptions', 'groups', 'versions', 'localizations', 'list', '--version-id', versionId, '--paginate', '--output', 'json'],
    'Reading subscription group localizations',
  );
  const rows: Array<{ attributes?: { locale?: string } }> = Array.isArray(r.json?.data) ? r.json.data : [];
  return new Set(rows.map((x) => x.attributes?.locale).filter((x): x is string => Boolean(x)));
}

async function ensureGroupLocalizations(groupId: string, group: AppStoreSubscriptionGroup): Promise<void> {
  const versionId = await findGroupVersionId(groupId);
  if (!versionId) {
    recordFailure(`Subscription group "${group.reference_name}" has no editable version for its localizations.`);
    return;
  }
  const have = await listGroupLocales(versionId);
  for (const loc of group.localizations ?? []) {
    if (have.has(loc.locale)) continue;
    const args = [
      'subscriptions', 'groups', 'versions', 'localizations', 'create',
      '--version-id', versionId,
      '--locale', loc.locale,
      '--name', loc.name,
    ];
    if (loc.custom_app_name) args.push('--custom-app-name', loc.custom_app_name);
    args.push('--output', 'json');
    try {
      await ascRun(args, `Setting group localization (${loc.locale})`);
    } catch (error) {
      recordFailure(error instanceof Error ? error.message : String(error));
    }
  }
  const after = await listGroupLocales(versionId);
  const missing = (group.localizations ?? []).filter((l) => !after.has(l.locale)).map((l) => l.locale);
  if (missing.length > 0) recordFailure(`Group "${group.reference_name}" localization read-back: missing ${missing.join(', ')}`);
}

/**
 * Final read-back for subscriptions: `asc validate subscriptions` checks group
 * and subscription localizations, review screenshot, availability and the full
 * price matrix for every subscription still in MISSING_METADATA.
 */
export async function validateSubscriptions(appId: string): Promise<void> {
  await ascRun(['validate', 'subscriptions', '--app', appId, '--output', 'json'], 'Validating subscriptions (read-back)');
}

/** Latest version of a subscription group (holds its localizations since asc 5.0). */
async function findGroupVersionId(groupId: string): Promise<string | null> {
  const list = async () => run('asc', [
    'subscriptions', 'groups', 'versions', 'list', '--group-id', groupId, '--paginate', '--output', 'json',
  ], { label: 'Fetching subscription group version', allowFailure: true });
  let result = await list();
  const pick = (stdout: string): string | null => {
    try {
      const data = JSON.parse(stdout)?.data as Array<{ id?: string }> | undefined;
      return data?.length ? data[data.length - 1].id ?? null : null;
    } catch {
      return null;
    }
  };
  let id = result.exitCode === 0 ? pick(result.stdout) : null;
  if (!id) {
    await run('asc', ['subscriptions', 'groups', 'versions', 'create', '--group-id', groupId, '--output', 'json'], {
      label: 'Creating subscription group version',
      allowFailure: true,
    });
    result = await list();
    id = result.exitCode === 0 ? pick(result.stdout) : null;
  }
  return id;
}

async function setupSubscription(
  appId: string,
  groupReferenceName: string,
  existingGroupId: string | null,
  sub: AppStoreSubscription,
  territories: string[],
  reviewOpts: ReviewScreenshotOptions = {},
  groupLoc?: { locale: string; name: string; custom_app_name?: string },
): Promise<void> {
  // --no-verify: since asc 5.x setup reads the result back and exits non-zero
  // unless the subscription is already complete (review screenshot, all
  // prices…). KAppMaker adds those in the steps below, so verifying here
  // would always fail on a fresh subscription.
  const args = ['subscriptions', 'setup', '--app', appId, '--no-verify'];

  if (existingGroupId) {
    args.push('--group-id', existingGroupId);
  } else {
    args.push('--group-reference-name', groupReferenceName);
    if (groupLoc) {
      args.push('--group-locale', groupLoc.locale, '--group-display-name', groupLoc.name);
      if (groupLoc.custom_app_name) args.push('--group-custom-app-name', groupLoc.custom_app_name);
    }
  }

  args.push(
    '--reference-name', sub.ref_name,
    '--product-id', sub.product_id,
    '--subscription-period', sub.subscription_period,
  );

  if (sub.family_sharable) args.push('--family-sharable');

  const loc = sub.localizations[0];
  if (loc) {
    args.push('--locale', loc.locale);
    args.push('--display-name', loc.name);
    if (loc.description) args.push('--description', loc.description);
  }

  const price = sub.prices[0];
  if (price) {
    if (price.price) {
      args.push('--price', price.price);
    } else if (price.tier) {
      args.push('--tier', price.tier);
    }
    args.push('--price-territory', price.territory);
  }

  if (territories.length > 0) {
    args.push('--territories', territories.join(','));
    args.push('--available-in-new-territories');
  }

  args.push('--output', 'json');

  const result = await run('asc', args, {
    label: `Setting up subscription: ${sub.ref_name}`,
    allowFailure: true,
  });

  let subscriptionId: string | null = null;
  try {
    // Present on success and, since asc 5.x, on partial failures too.
    subscriptionId = JSON.parse(result.stdout)?.subscriptionId ?? null;
  } catch {
    // Fall through
  }
  // asc 1.x said "already been used"; 5.x reuses the subscription and
  // reports a mismatch with "existing subscription …".
  const output = `${result.stdout}\n${result.stderr}`;
  const alreadyExists =
    result.exitCode !== 0 && (/already been used/.test(output) || /existing subscription/i.test(output));

  if (result.exitCode === 0 || subscriptionId) {
    // created or reused (a non-zero exit with an id = a later setup step failed;
    // the steps below redo pricing and the screenshot anyway)
  } else if (alreadyExists) {
    logger.info(`Subscription "${sub.ref_name}" (${sub.product_id}) already exists: refreshing pricing.`);
  } else {
    const errMsg = result.stderr || result.stdout;
    recordFailure(`Could not create subscription "${sub.ref_name}": ${errMsg.slice(0, 400)}`);
    return;
  }

  // The asc CLI's --subscription-id flag accepts the product_id directly (it
  // resolves the internal ID server-side), so for pre-existing subscriptions
  // we can use sub.product_id and still run the PPP fan-out.
  const idForCli = subscriptionId ?? sub.product_id;
  const basePrice = sub.prices[0];
  if (basePrice?.price && sub.ppp_enabled !== false) {
    await applyPppToSubscription(appId, idForCli, sub, basePrice.price);
  } else if (basePrice?.price) {
    // No PPP: Apple's own equalized prices for every territory. 2 workers:
    // more trip Apple's rate limit (HTTP 429) on a fresh account.
    try {
      await ascRun([
        'subscriptions', 'pricing', 'equalize',
        '--app', appId,
        '--subscription-id', idForCli,
        '--base-price', basePrice.price,
        '--base-territory', basePrice.territory || 'USA',
        '--confirm',
        '--workers', '2',
        '--output', 'json',
      ], `Equalizing prices for ${sub.ref_name} (all territories)`, { timeout: 15 * 60_000 });
    } catch (error) {
      recordFailure(error instanceof Error ? error.message : String(error));
    }
  }

  // Upload App Review screenshot (Apple-required; without it subs stay in
  // MISSING_METADATA state). Silently skipped if the file doesn't exist.
  const screenshotPath = sub.review_screenshot ?? reviewOpts.defaultReviewScreenshot;
  if (screenshotPath) {
    await uploadSubscriptionReviewScreenshot(appId, idForCli, sub.ref_name, screenshotPath, {
      promptOnSizeMismatch: true,
    });
  }
}

/**
 * Apply PPP pricing across ASC territories via a single CSV import call.
 *
 * Uses `asc subscriptions pricing prices import` (added in asc CLI 1.4+) which
 * replaces what used to be 174 per-territory `prices set` calls — eliminating
 * the rate-limiting cascade we hit on the per-call route.
 *
 * Algorithm:
 *   1. Fetch USA's subscription price-points once (it's in USD, so we can
 *      match the PPP target numerically). Extract the subscription's internal
 *      identifier `s` from any returned ID (every PP for this sub shares the
 *      same `s`).
 *   2. For each unique USD target, find the closest USA price-point and pull
 *      its tier (`p - 10000`).
 *   3. For each unique target, fetch Apple's EQUALIZATIONS of that USA
 *      price-point — Apple's own value-matched point per territory (handles
 *      non-proportional local grids like KZT/PKR/INR/JPY/KRW). Territories
 *      missing from the response fall back to base64(`{s, t, p}`) synthesis.
 *   4. Emit a single CSV with `territory,price,price_point_id` rows and pipe
 *      to `prices import`.
 */
async function applyPppToSubscription(
  appId: string,
  subscriptionId: string,
  sub: AppStoreSubscription,
  baseUsdPrice: string,
): Promise<void> {
  const userTerritories = new Set(sub.prices.map((p) => p.territory));
  const fanOut = expandAscTerritories(baseUsdPrice, userTerritories);
  logPppFanOut(`subscription ${sub.ref_name}`, baseUsdPrice, fanOut.length, userTerritories.size);

  // Resolve each unique USD target → (tier, subscription `s`) once. The first
  // call also pulls the `s` field which we reuse to synthesise per-territory IDs.
  const uniqueTargets = new Set(fanOut.map((f) => f.targetPrice));
  const tierByUsd = new Map<string, number>();
  let subInternalS: string | null = null;
  for (const usd of uniqueTargets) {
    const r = await resolveUsdTierWithS(appId, usd, { catalog: 'subscription', subscriptionId });
    if (r) {
      tierByUsd.set(usd, r.tier);
      subInternalS ??= r.s;
    }
  }
  if (!subInternalS) {
    recordFailure(`PPP ${sub.ref_name}: could not resolve the USA price-point catalog, so no territory prices were set.`);
    return;
  }

  // Fetch Apple's equalizations for each unique USD target — the authoritative
  // per-territory price points (one CLI call per target, ~6 for a typical base
  // price). Tier-number synthesis is only a fallback: the same tier number is
  // NOT the same USD value in every territory (KZT tier N ≈ 0.15× FX; JPY/KRW/
  // BRL/IDR grids non-linear), which caused the pre-1.13.17 under/over-pricing.
  const eqByUsd = new Map<string, Map<string, PricePoint>>();
  await Promise.all(
    [...tierByUsd.entries()].map(async ([usd, tier]) => {
      const usaPpId = encodePricePointId(subInternalS!, 'USA', tier);
      eqByUsd.set(usd, await fetchEqualizations(usaPpId, { catalog: 'subscription' }));
    }),
  );

  // Build the CSV. `price` column is required by the importer but is informational
  // when `price_point_id` is provided (Apple resolves the actual price from
  // the price-point ID). We pass the USD target for readability.
  const rows: string[] = ['territory,price,price_point_id'];
  let synthesised = 0;
  for (const item of fanOut) {
    const tier = tierByUsd.get(item.targetPrice);
    if (tier === undefined) continue;
    const eq = eqByUsd.get(item.targetPrice)?.get(item.territory);
    let ppId: string;
    if (eq) {
      ppId = eq.id;
    } else if (item.territory === 'USA') {
      // Equalizations exclude the source point itself; synthesis is exact here.
      ppId = encodePricePointId(subInternalS, 'USA', tier);
    } else {
      ppId = encodePricePointId(subInternalS, item.territory, tier);
      synthesised++;
    }
    rows.push(`${item.territory},${item.targetPrice},${ppId}`);
  }
  if (synthesised > 0) {
    logger.warn(
      `PPP ${sub.ref_name}: ${synthesised} territories missing from Apple's equalizations; used tier synthesis fallback (may misprice non-proportional markets).`,
    );
  }

  // User-listed territory overrides (e.g. DE: 5.99 EUR) — resolve the EXACT
  // price-point ID in that territory's catalog so the user's specified
  // local-currency price wins.
  for (const p of sub.prices) {
    if (!p.price || !p.territory) continue;
    const ppId = await findExactPricePointForPrice(appId, p.territory, p.price, {
      catalog: 'subscription',
      subscriptionId,
    });
    if (ppId) rows.push(`${p.territory},${p.price},${ppId}`);
  }

  if (rows.length === 1) {
    recordFailure(`PPP ${sub.ref_name}: no territory price rows resolved, so no prices were set.`);
    return;
  }

  // The CLI's import drives Apple's `POST /v1/subscriptionPrices` ONE row at
  // a time internally — Apple has no documented batch endpoint. Empirically
  // ~1.5–2 s per row, so 175 rows ≈ 5 min per subscription on first run.
  // We split into chunks of 50 so the user sees regular progress updates
  // instead of one long silent spinner.
  //
  const header = rows[0];
  const dataRows = rows.slice(1);
  const chunks = chunkRows(dataRows);

  // Pass 1: no start date (rows land as STARTING prices — correct for subs
  // that have never been approved). Apple rejects starting-price rows on an
  // APPROVED subscription with "Initial price cannot be created again after
  // subscription is approved" — those territories need a future-dated price
  // CHANGE instead, handled by pass 2 below.
  const pass1 = await importSubscriptionPriceRows(appId, subscriptionId, sub.ref_name, header, chunks);
  let totalCreated = pass1.created;
  let totalFailed = pass1.failed;
  let allFailures = pass1.failures;

  const approvedTerritories = new Set(
    pass1.failures
      .filter((f) => /Initial price cannot be created again/i.test(f.error))
      .map((f) => f.territory),
  );
  if (approvedTerritories.size > 0) {
    const retryRows = dataRows.filter((r) => approvedTerritories.has(r.split(',')[0]));
    // Apple demands a strictly-future start date and validates it against its
    // own day boundary (empirically ~today+2 near midnight UTC). Try
    // tomorrow-UTC first; if Apple answers "must be on or after YYYY-MM-DD",
    // reparse and retry once with the exact date it asked for.
    let startDate = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
    logger.info(
      `PPP ${sub.ref_name}: subscription already approved; scheduling ${retryRows.length} territories as price changes starting ${startDate}. Decreases apply to existing subscribers automatically; increases trigger Apple's consent flow.`,
    );
    let pass2 = await importSubscriptionPriceRows(
      appId, subscriptionId, sub.ref_name, header, chunkRows(retryRows), startDate,
    );
    const dateHint = pass2.failures
      .map((f) => /must be on or after (\d{4}-\d{2}-\d{2})/.exec(f.error)?.[1])
      .find(Boolean);
    if (dateHint && pass2.failed > 0) {
      startDate = dateHint;
      const stillFailing = new Set(pass2.failures.map((f) => f.territory));
      const pass3 = await importSubscriptionPriceRows(
        appId, subscriptionId, sub.ref_name, header,
        chunkRows(retryRows.filter((r) => stillFailing.has(r.split(',')[0]))), startDate,
      );
      pass2 = {
        created: pass2.created + pass3.created,
        failed: pass3.failed,
        failures: pass3.failures,
      };
    }
    totalCreated += pass2.created;
    totalFailed = totalFailed - approvedTerritories.size + pass2.failed;
    allFailures = allFailures
      .filter((f) => !approvedTerritories.has(f.territory))
      .concat(pass2.failures);
  }

  const total = dataRows.length;
  if (totalFailed > 0) {
    const sample = allFailures.slice(0, 3).map((f) => `${f.territory}: ${f.error.slice(0, 100)}`).join('\n    ');
    recordFailure(`PPP ${sub.ref_name}: ${totalCreated}/${total} territories applied; ${totalFailed} failed.\n    ${sample}${totalFailed > 3 ? `\n    … (${totalFailed - 3} more)` : ''}`);
  } else {
    logger.success(`PPP ${sub.ref_name}: ${totalCreated}/${total} territories applied via CSV import.`);
  }
}

const IMPORT_CHUNK_SIZE = 50;

function chunkRows(rows: string[]): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < rows.length; i += IMPORT_CHUNK_SIZE) {
    chunks.push(rows.slice(i, i + IMPORT_CHUNK_SIZE));
  }
  return chunks;
}

interface ImportResult {
  created: number;
  failed: number;
  failures: Array<{ territory: string; error: string }>;
}

/** Run `asc subscriptions pricing prices import` over pre-chunked CSV rows. */
async function importSubscriptionPriceRows(
  appId: string,
  subscriptionId: string,
  refName: string,
  header: string,
  chunks: string[][],
  startDate?: string,
): Promise<ImportResult> {
  const out: ImportResult = { created: 0, failed: 0, failures: [] };
  for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
    const chunk = chunks[chunkIdx];
    const csvPath = path.join(os.tmpdir(), `kappmaker-ppp-${subscriptionId}-${Date.now()}-${chunkIdx}.csv`);
    await fs.writeFile(csvPath, [header, ...chunk].join('\n') + '\n', 'utf-8');
    try {
      const args = [
        'subscriptions', 'pricing', 'prices', 'import',
        '--app', appId,
        '--subscription-id', subscriptionId,
        '--input', csvPath,
        '--confirm', // required since asc 3.3 (otherwise a usage error)
        '--output', 'json',
      ];
      if (startDate) args.push('--start-date', startDate);
      const result = await run('asc', args, {
        label: `PPP ${refName}: importing batch ${chunkIdx + 1}/${chunks.length}${startDate ? ` (price change ${startDate})` : ''} (${chunk.length} territories, ~${Math.round(chunk.length * 1.75)}s)`,
        allowFailure: true,
        timeout: 5 * 60_000,
      });
      type ImportResp = {
        created?: number;
        skipped?: number;
        reconciled?: number;
        failed?: number;
        failures?: Array<{ territory: string; error: string }>;
      };
      let parsed: ImportResp | null = null;
      try {
        parsed = JSON.parse(result.stdout) as ImportResp;
      } catch {
        // Fall through.
      }
      if (!parsed) {
        logger.warn(`PPP ${refName} batch ${chunkIdx + 1}: import failed; ${(result.stderr || result.stdout).slice(0, 300)}`);
        out.failed += chunk.length;
        out.failures.push(...chunk.map((row) => ({ territory: row.split(',')[0], error: 'import call failed (no JSON response)' })));
        continue;
      }
      // Rows already at the target price come back as skipped/reconciled on
      // re-runs (asc 5.x) — they are applied, not failures.
      out.created += (parsed.created ?? 0) + (parsed.skipped ?? 0) + (parsed.reconciled ?? 0);
      out.failed += parsed.failed ?? 0;
      if (parsed.failures?.length) out.failures.push(...parsed.failures);
    } finally {
      await fs.unlink(csvPath).catch(() => undefined);
    }
  }
  return out;
}

// ── In-app purchases (consumable / non-consumable / non-renewing) ───
//
// Mirrors `setupSubscriptions` but for the `asc iap` family. Each entry is
// created via `asc iap setup --type ... --product-id ... --price ... --base-territory ...`
// in one call — mirroring the one-shot subscription pattern. Idempotent:
// "already been used" / "already exists" responses are downgraded to info logs
// so reruns are safe.

export async function setupInAppPurchases(
  appId: string,
  iaps: AppStoreInAppPurchase[],
  reviewOpts: ReviewScreenshotOptions = {},
  availability?: AppStoreAvailability,
): Promise<void> {
  if (iaps.length === 0) {
    logger.info('No in-app purchases configured, skipping.');
    return;
  }

  // Resolve IAP availability territories once (shared across all IAPs).
  // IAPs have their OWN availability, separate from app-level availability —
  // without this, an IAP stays available only in its base territory even after
  // PPP prices are set for ~175 territories (pricing and availability are
  // independent fields on Apple's side).
  let territories: string[] = [];
  if (availability) {
    territories = availability.territories;
    if (availability.include_all && territories.length === 0) {
      territories = await fetchAllTerritories();
    }
  }

  for (const iap of iaps) {
    await setupInAppPurchase(appId, iap, reviewOpts, territories, availability?.available_in_new_territories ?? true);
  }
  throwIfFailed('In-app purchases');
}

async function setIapAvailability(
  appId: string,
  iapId: string,
  refName: string,
  territories: string[],
  availableInNew: boolean,
): Promise<void> {
  if (territories.length === 0) return;
  const r = await run('asc', [
    'iap', 'pricing', 'availability', 'set',
    '--app', appId,
    '--iap-id', iapId,
    '--territories', territories.join(','),
    '--available-in-new-territories', String(availableInNew),
    '--output', 'json',
  ], {
    label: `Setting IAP availability for ${refName} (${territories.length} territories)`,
    allowFailure: true,
    timeout: 3 * 60_000,
    env: { ASC_TIMEOUT: '180s' },
  });
  if (r.exitCode !== 0) recordFailure(`IAP availability for ${refName}: ${(r.stderr || r.stdout).slice(0, 300)}`);
}

async function setupInAppPurchase(
  appId: string,
  iap: AppStoreInAppPurchase,
  reviewOpts: ReviewScreenshotOptions = {},
  territories: string[] = [],
  availableInNewTerritories = true,
): Promise<void> {
  const args = [
    'iap', 'setup',
    '--app', appId,
    '--type', iap.type,
    '--reference-name', iap.ref_name,
    '--product-id', iap.product_id,
  ];

  if (iap.family_sharable) args.push('--family-sharable');

  const loc = iap.localizations[0];
  if (loc) {
    args.push('--locale', loc.locale);
    args.push('--display-name', loc.name);
    if (loc.description) args.push('--description', loc.description);
  }

  const price = iap.prices[0];
  if (price) {
    if (price.price) {
      args.push('--price', price.price);
    } else if (price.tier) {
      args.push('--tier', price.tier);
    }
    if (price.territory) args.push('--base-territory', price.territory);
  }

  args.push('--output', 'json');

  const result = await run('asc', args, {
    label: `Setting up IAP: ${iap.ref_name}`,
    allowFailure: true,
  });

  const combined = result.stdout + result.stderr;
  const alreadyExists =
    result.exitCode !== 0 &&
    (combined.includes('already been used') || combined.includes('already exists'));

  // Extract the internal IAP ID from the fresh setup response when available.
  let iapId: string | null = null;
  if (result.exitCode === 0 && result.stdout) {
    try {
      const data = JSON.parse(result.stdout);
      iapId = data?.iapId ?? data?.id ?? data?.data?.id ?? null;
    } catch {
      // Fall through
    }
  }

  if (alreadyExists) {
    logger.info(`IAP "${iap.ref_name}" (${iap.product_id}) already exists: refreshing pricing.`);
  } else if (result.exitCode !== 0) {
    const errMsg = result.stderr || result.stdout;
    recordFailure(`Could not create IAP "${iap.ref_name}": ${errMsg.slice(0, 400)}`);
    return;
  }

  // Mirror the subscription pattern: --iap-id accepts the product_id directly
  // (per asc CLI 1.4+ behaviour), so fall back to product_id when the internal
  // ID isn't available from the setup response (i.e. for pre-existing IAPs).
  const idForCli = iapId ?? iap.product_id;

  // Set per-IAP territory availability (independent of app-level availability
  // and of pricing). Without this the IAP stays available only in its base
  // territory regardless of how many territories get PPP prices.
  await setIapAvailability(appId, idForCli, iap.ref_name, territories, availableInNewTerritories);

  // Per-territory PPP fan-out via a single `iap pricing schedules create` call.
  // Always run for both fresh and pre-existing IAPs — re-runs need to update prices.
  if (iap.ppp_enabled !== false && price?.price) {
    await applyPppToIap(appId, idForCli, iap, price.price);
  }

  // Upload App Review image (Apple-required to leave MISSING_METADATA state).
  // Silently skipped if the file doesn't exist.
  const screenshotPath = iap.review_screenshot ?? reviewOpts.defaultReviewScreenshot;
  if (screenshotPath) {
    await uploadIapReviewScreenshot(appId, idForCli, iap.ref_name, screenshotPath, {
      promptOnSizeMismatch: true,
    });
  }
}

/**
 * Apply PPP pricing across ASC territories for an IAP via a single `schedules
 * create` call. Mirrors `applyPppToSubscription`:
 *   1. Resolve each unique USD target → (tier, internal `s`) once via USA's
 *      PER-IAP catalog (`asc iap pricing price-points list --iap-id`). The `s`
 *      field there is the IAP's OWN ID — NOT the appId. (The app-level catalog
 *      `asc pricing price-points` encodes s=appId, but schedule create rejects
 *      those IDs, silently leaving the IAP on "May Adjust Automatically".)
 *   2. For each unique USD target, fetch Apple's equalizations of the USA
 *      price-point → per-territory value-matched IDs (synthesised base64
 *      `{s, t, p}` IDs only as fallback for missing territories).
 *   3. Submit all entries in one `schedules create` call.
 */
async function applyPppToIap(
  appId: string,
  iapId: string,
  iap: AppStoreInAppPurchase,
  baseUsdPrice: string,
): Promise<void> {
  const userTerritories = new Set(iap.prices.map((p) => p.territory));
  const fanOut = expandAscTerritories(baseUsdPrice, userTerritories);
  logPppFanOut(`IAP ${iap.ref_name}`, baseUsdPrice, fanOut.length, userTerritories.size);

  // Resolve each unique USD target → (tier, internal `s`) once via USA's per-IAP
  // catalog. The first call also pulls the `s` field (the IAP's internal ID,
  // shared by all its price-points) which we reuse to synthesise per-territory IDs.
  const uniqueTargets = new Set(fanOut.map((f) => f.targetPrice));
  const tierByUsd = new Map<string, number>();
  let iapInternalS: string | null = null;
  for (const usd of uniqueTargets) {
    const r = await resolveUsdTierWithS(appId, usd, { catalog: 'iap', iapId });
    if (r) {
      tierByUsd.set(usd, r.tier);
      iapInternalS ??= r.s;
    }
  }
  if (!iapInternalS) {
    recordFailure(`PPP IAP ${iap.ref_name}: could not resolve the USA price-point catalog, so no territory prices were set.`);
    return;
  }

  // Fetch Apple's equalizations for each unique USD target (see
  // applyPppToSubscription for why tier synthesis alone is unsafe).
  const eqByUsd = new Map<string, Map<string, PricePoint>>();
  await Promise.all(
    [...tierByUsd.entries()].map(async ([usd, tier]) => {
      const usaPpId = encodePricePointId(iapInternalS!, 'USA', tier);
      eqByUsd.set(usd, await fetchEqualizations(usaPpId, { catalog: 'iap' }));
    }),
  );

  const startDate = new Date().toISOString().slice(0, 10);
  const entries: string[] = [];
  let synthesised = 0;
  for (const item of fanOut) {
    const tier = tierByUsd.get(item.targetPrice);
    if (tier === undefined) continue;
    const eq = eqByUsd.get(item.targetPrice)?.get(item.territory);
    let ppId: string;
    if (eq) {
      ppId = eq.id;
    } else if (item.territory === 'USA') {
      ppId = encodePricePointId(iapInternalS, 'USA', tier);
    } else {
      ppId = encodePricePointId(iapInternalS, item.territory, tier);
      synthesised++;
    }
    entries.push(`${ppId}:${startDate}`);
  }
  if (synthesised > 0) {
    logger.warn(
      `PPP IAP ${iap.ref_name}: ${synthesised} territories missing from Apple's equalizations; used tier synthesis fallback (may misprice non-proportional markets).`,
    );
  }

  // User-listed territory overrides go in the same schedule (last wins).
  for (const p of iap.prices) {
    if (!p.price || !p.territory) continue;
    const ppId = await findExactPricePointForPrice(appId, p.territory, p.price, { catalog: 'iap', iapId });
    if (ppId) entries.push(`${ppId}:${startDate}`);
  }

  if (entries.length === 0) {
    recordFailure(`PPP fan-out for IAP "${iap.ref_name}" produced no price-points, so no territory prices were set.`);
    return;
  }

  const baseTerritory = iap.prices[0]?.territory ?? 'USA';
  const result = await run(
    'asc',
    [
      'iap', 'pricing', 'schedules', 'create',
      '--app', appId,
      '--iap-id', iapId,
      '--base-territory', baseTerritory,
      '--prices', entries.join(','),
      '--output', 'json',
    ],
    {
      label: `PPP IAP ${iap.ref_name}: ${entries.length} territories`,
      allowFailure: true,
      timeout: 3 * 60_000,
    },
  );
  if (result.exitCode !== 0) {
    recordFailure(`PPP IAP ${iap.ref_name}: schedule create failed: ${(result.stderr || result.stdout).slice(0, 300)}`);
  } else {
    logger.success(`PPP IAP ${iap.ref_name}: ${entries.length} territories applied via schedule create.`);
  }
}

// ── App Review screenshots ─────────────────────────────────────────
//
// Apple requires a review screenshot on every subscription and IAP — without
// one, products remain in MISSING_METADATA state and per-territory pricing
// won't "resolve" (visible via `asc subscriptions pricing prices list --resolved`).
//
// asc commands used:
//   - Subscriptions: `asc subscriptions review screenshots create --file <path>`
//     and `asc subscriptions review app-store-screenshot view` to detect an
//     existing screenshot (one per subscription).
//   - IAPs: `asc iap review-screenshots create --file <path>` and
//     `asc iap review-screenshots view --iap-id <id>` to detect an existing
//     screenshot. NOTE: `asc iap images` is a DIFFERENT category (promotional
//     images, not App Review) — do not use it for review screenshots.
//
// Idempotency: if a screenshot is already uploaded, we SKIP — re-runs don't
// replace. To update, delete via Apple's UI (or the asc `delete` subcommand)
// and re-run, or use the standalone `appstore-update-*-review-screenshot`
// commands which pass `force: true`.


export async function uploadSubscriptionReviewScreenshot(
  appId: string,
  subscriptionId: string,
  refName: string,
  filePath: string,
  opts: { force?: boolean; promptOnSizeMismatch?: boolean } = {},
): Promise<void> {
  const abs = await prepareReviewScreenshot(filePath, {
    promptOnSizeMismatch: opts.promptOnSizeMismatch ?? false,
  });
  if (!abs) {
    logger.info(`Review screenshot for "${refName}" not found at ${filePath}: skipping upload.`);
    return;
  }

  // Check for an existing screenshot. View returns `{ data: { id: "", type: "" } }`
  // when none is attached.
  const existing = await run(
    'asc',
    [
      'subscriptions', 'review', 'app-store-screenshot', 'view',
      '--app', appId,
      '--subscription-id', subscriptionId,
      '--output', 'json',
    ],
    { label: `Checking existing review screenshot for ${refName}`, allowFailure: true },
  );
  let existingId: string | null = null;
  if (existing.exitCode === 0 && existing.stdout) {
    try {
      const data = JSON.parse(existing.stdout);
      const id = data?.data?.id;
      if (id && typeof id === 'string' && id.length > 0) existingId = id;
    } catch {
      // Fall through.
    }
  }

  if (existingId && !opts.force) {
    // Default: idempotent — skip when something is already attached. Used by
    // `create-appstore-app`'s setup flow so re-runs don't re-upload.
    logger.info(`Review screenshot already uploaded for "${refName}": skipping.`);
    return;
  }

  // Force-replace path. Subscription `screenshots update` only marks an
  // out-of-band upload as complete (it takes --uploaded / --checksum, NOT
  // --file) — to swap the actual file we DELETE the existing screenshot then
  // CREATE a new one. The IAP path (uploadIapReviewScreenshot) mirrors this
  // delete + create pattern for parity.
  if (existingId && opts.force) {
    const deleted = await run(
      'asc',
      [
        'subscriptions', 'review', 'screenshots', 'delete',
        '--screenshot-id', existingId,
        '--confirm',
        '--output', 'json',
      ],
      {
        label: `Deleting old review screenshot for ${refName}`,
        allowFailure: true,
        timeout: 60_000,
      },
    );
    if (deleted.exitCode !== 0) {
      logger.warn(`Could not delete existing screenshot for "${refName}": ${(deleted.stderr || deleted.stdout).slice(0, 200)}`);
      return;
    }
  }

  const uploaded = await run(
    'asc',
    [
      'subscriptions', 'review', 'screenshots', 'create',
      '--app', appId,
      '--subscription-id', subscriptionId,
      '--file', abs,
      '--output', 'json',
    ],
    {
      label: existingId && opts.force
        ? `Uploading replacement review screenshot for ${refName}`
        : `Uploading review screenshot for ${refName}`,
      allowFailure: true,
      timeout: 2 * 60_000,
    },
  );
  if (uploaded.exitCode !== 0) {
    recordFailure(`Review screenshot upload for ${refName} failed: ${(uploaded.stderr || uploaded.stdout).slice(0, 300)}`);
  }
}

export async function uploadIapReviewScreenshot(
  appId: string,
  iapId: string,
  refName: string,
  filePath: string,
  opts: { force?: boolean; promptOnSizeMismatch?: boolean } = {},
): Promise<void> {
  const abs = await prepareReviewScreenshot(filePath, {
    promptOnSizeMismatch: opts.promptOnSizeMismatch ?? false,
  });
  if (!abs) {
    logger.info(`Review screenshot for "${refName}" not found at ${filePath}: skipping upload.`);
    return;
  }

  // Each IAP has at most one App Review screenshot (parallel to subscriptions).
  // `view --iap-id` returns `{ data: { id: "", type: "" } }` when none is
  // attached, or `{ data: { id: "<ID>", type: "..." } }` when one exists.
  const existing = await run(
    'asc',
    [
      'iap', 'review-screenshots', 'view',
      '--app', appId,
      '--iap-id', iapId,
      '--output', 'json',
    ],
    { label: `Checking existing review screenshot for ${refName}`, allowFailure: true },
  );
  let existingId: string | null = null;
  if (existing.exitCode === 0 && existing.stdout) {
    try {
      const data = JSON.parse(existing.stdout);
      const id = data?.data?.id;
      if (id && typeof id === 'string' && id.length > 0) existingId = id;
    } catch {
      // Fall through.
    }
  }

  if (existingId && !opts.force) {
    logger.info(`Review screenshot already uploaded for "${refName}": skipping.`);
    return;
  }

  // Force-replace via delete + create. `asc iap review-screenshots update`
  // re-uploads in place, but for parity with the subscription path (where
  // `screenshots update` only marks an out-of-band upload as complete, not
  // file swap) we use delete + create here too. Reliable on both surfaces.
  if (existingId && opts.force) {
    const deleted = await run(
      'asc',
      [
        'iap', 'review-screenshots', 'delete',
        '--screenshot-id', existingId,
        '--confirm',
        '--output', 'json',
      ],
      {
        label: `Deleting old review screenshot for ${refName}`,
        allowFailure: true,
        timeout: 60_000,
      },
    );
    if (deleted.exitCode !== 0) {
      logger.warn(`Could not delete existing screenshot for "${refName}": ${(deleted.stderr || deleted.stdout).slice(0, 200)}`);
      return;
    }
  }

  const uploaded = await run(
    'asc',
    [
      'iap', 'review-screenshots', 'create',
      '--app', appId,
      '--iap-id', iapId,
      '--file', abs,
      '--output', 'json',
    ],
    {
      label: existingId && opts.force
        ? `Uploading replacement review screenshot for ${refName}`
        : `Uploading review screenshot for ${refName}`,
      allowFailure: true,
      timeout: 2 * 60_000,
    },
  );
  if (uploaded.exitCode !== 0) {
    recordFailure(`Review screenshot upload for ${refName} failed: ${(uploaded.stderr || uploaded.stdout).slice(0, 300)}`);
  }
}

async function findGroupByName(appId: string, referenceName: string): Promise<string | null> {
  const result = await run(
    'asc',
    ['subscriptions', 'groups', 'list', '--app', appId, '--output', 'json'],
    { label: 'Looking up existing subscription groups', allowFailure: true },
  );

  if (result.exitCode === 0 && result.stdout) {
    try {
      const data = JSON.parse(result.stdout);
      const groups = data?.data ?? data ?? [];
      for (const g of groups) {
        const attrs = g.attributes ?? g;
        if (attrs.referenceName === referenceName || attrs.reference_name === referenceName) {
          return g.id;
        }
      }
    } catch {
      // Fall through
    }
  }
  return null;
}
