import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { run } from '../utils/exec.js';
import { logger } from '../utils/logger.js';
import {
  encodePricePointId,
  expandAscTerritories,
  findExactPricePointForPrice,
  logPppFanOut,
  resolveUsdTierWithS,
} from './ppp-pricing.service.js';
import type {
  AppStorePricingConfig,
  AppStoreSubscriptionGroup,
  AppStoreSubscription,
  AppStoreAvailability,
  AppStoreInAppPurchase,
} from '../types/appstore.js';

export async function createPricing(appId: string, pricing: AppStorePricingConfig): Promise<void> {
  const isFree = !pricing.price || pricing.price === '0';
  const targetPrice = isFree ? '0' : pricing.price;
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // v1.x `asc pricing schedule create` only accepts --price-point (no --price),
  // so resolve a price-point ID that matches the target customer price first.
  const pricePoint = await findPricePointForPrice(appId, pricing.base_territory, targetPrice);
  if (!pricePoint) {
    const label = isFree ? 'free price point' : `price point for $${targetPrice}`;
    logger.warn(`Could not find a ${label} in ${pricing.base_territory}. Skipping price schedule.`);
    return;
  }

  const args = [
    'pricing', 'schedule', 'create',
    '--app', appId,
    '--base-territory', pricing.base_territory,
    '--start-date', today,
    '--price-point', pricePoint,
    '--output', 'json',
  ];
  const label = isFree ? 'Setting pricing (free)' : `Setting pricing ($${pricing.price})`;
  await run('asc', args, { label, allowFailure: true });

  // Set availability
  if (pricing.availability) {
    let territories = pricing.availability.territories;
    if (pricing.availability.include_all && territories.length === 0) {
      territories = await fetchAllTerritories();
    }
    if (territories.length > 0) {
      await setAppAvailability(appId, pricing.availability.available_in_new_territories, territories);
    }
  }
}

/**
 * Find a price-point ID in the given territory whose customer price matches the target.
 * Matching is tolerant of trailing-zero formatting ("6.99", "6.990", "0.00", "0").
 * Returns null if no exact numeric match is found.
 */
async function findPricePointForPrice(
  appId: string,
  territory: string,
  targetPrice: string,
): Promise<string | null> {
  const result = await run(
    'asc',
    ['pricing', 'price-points', '--app', appId, '--territory', territory, '--output', 'json'],
    { label: `Looking up price point for ${targetPrice === '0' ? 'free tier' : `$${targetPrice}`}`, allowFailure: true },
  );

  if (result.exitCode !== 0 || !result.stdout) return null;

  let points: Array<{ id?: string; attributes?: { customerPrice?: string }; customerPrice?: string }> = [];
  try {
    const data = JSON.parse(result.stdout);
    points = data?.data ?? data ?? [];
  } catch {
    return null;
  }

  const target = Number(targetPrice);
  if (!Number.isFinite(target)) return null;

  for (const p of points) {
    const attrs = p.attributes ?? p;
    const raw = attrs.customerPrice;
    if (raw === undefined || raw === null) continue;
    const num = Number(raw);
    if (Number.isFinite(num) && num === target) {
      return p.id ?? null;
    }
  }
  return null;
}

async function setAppAvailability(appId: string, availableInNew: boolean, territories: string[]): Promise<void> {
  // Use asc app-setup availability set — needs ASC_TIMEOUT for 175 territories
  await run('asc', [
    'app-setup', 'availability', 'set',
    '--app', appId,
    '--territory', territories.join(','),
    '--available', 'true',
    '--available-in-new-territories', String(availableInNew),
    '--output', 'json',
  ], {
    label: `Setting app availability (${territories.length} territories)`,
    allowFailure: true,
    timeout: 3 * 60_000,
    env: { ASC_TIMEOUT: '180s' },
  });
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

export async function setupSubscriptions(
  appId: string,
  group: AppStoreSubscriptionGroup,
  availability?: AppStoreAvailability,
): Promise<void> {
  let groupId = await findGroupByName(appId, group.reference_name);

  // Resolve territories for subscription availability
  let territories: string[] = [];
  if (availability) {
    territories = availability.territories;
    if (availability.include_all && territories.length === 0) {
      territories = await fetchAllTerritories();
    }
  }

  for (const sub of group.subscriptions) {
    await setupSubscription(appId, group.reference_name, groupId, sub, territories);
    // After first subscription creates the group, fetch its ID for subsequent ones
    if (!groupId) {
      groupId = await findGroupByName(appId, group.reference_name);
    }
  }

  // Set group localizations (setup command doesn't handle these)
  if (group.localizations && group.localizations.length > 0) {
    // Re-fetch group ID if it was just created
    if (!groupId) {
      groupId = await findGroupByName(appId, group.reference_name);
    }
    if (groupId) {
      for (const loc of group.localizations) {
        const args = [
          'subscriptions', 'groups', 'localizations', 'create',
          '--group-id', groupId,
          '--locale', loc.locale,
          '--name', loc.name,
        ];
        if (loc.custom_app_name) args.push('--custom-app-name', loc.custom_app_name);
        args.push('--output', 'json');
        await run('asc', args, {
          label: `Setting group localization (${loc.locale})`,
          allowFailure: true,
        });
      }
    }
  }
}

async function setupSubscription(
  appId: string,
  groupReferenceName: string,
  existingGroupId: string | null,
  sub: AppStoreSubscription,
  territories: string[],
): Promise<void> {
  const args = ['subscriptions', 'setup', '--app', appId];

  if (existingGroupId) {
    args.push('--group-id', existingGroupId);
  } else {
    args.push('--group-reference-name', groupReferenceName);
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
  const alreadyExists =
    result.exitCode !== 0 &&
    (result.stdout.includes('already been used') || result.stderr.includes('already been used'));

  if (result.exitCode === 0) {
    try {
      subscriptionId = JSON.parse(result.stdout)?.subscriptionId ?? null;
    } catch {
      // Fall through
    }
  } else if (alreadyExists) {
    logger.info(`Subscription "${sub.ref_name}" (${sub.product_id}) already exists — refreshing pricing.`);
  } else {
    const errMsg = result.stderr || result.stdout;
    logger.warn(`Could not create subscription "${sub.ref_name}": ${errMsg.slice(0, 150)}`);
    return;
  }

  // The asc CLI's --subscription-id flag accepts the product_id directly (it
  // resolves the internal ID server-side), so for pre-existing subscriptions
  // we can use sub.product_id and still run the PPP fan-out.
  const idForCli = subscriptionId ?? sub.product_id;
  const basePrice = sub.prices[0];
  if (basePrice?.price && sub.ppp_enabled !== false) {
    await applyPppToSubscription(appId, idForCli, sub, basePrice.price);
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
 *   3. For each territory in the PPP fan-out, synthesise the price-point ID
 *      as base64(`{s, t: territory, p}`) — same tier ID lookup Apple uses
 *      internally, but no API call needed per territory.
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
    logger.warn(`PPP ${sub.ref_name}: could not resolve USA price-point catalog; skipping fan-out.`);
    return;
  }

  // Build the CSV. `price` column is required by the importer but is informational
  // when `price_point_id` is provided (Apple resolves the actual price from
  // the price-point ID). We pass the USD target for readability.
  const rows: string[] = ['territory,price,price_point_id'];
  for (const item of fanOut) {
    const tier = tierByUsd.get(item.targetPrice);
    if (tier === undefined) continue;
    const ppId = encodePricePointId(subInternalS, item.territory, tier);
    rows.push(`${item.territory},${item.targetPrice},${ppId}`);
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
    logger.warn(`PPP ${sub.ref_name}: no rows resolved; skipping import.`);
    return;
  }

  // The CLI's import drives Apple's `POST /v1/subscriptionPrices` ONE row at
  // a time internally — Apple has no documented batch endpoint. Empirically
  // ~1.5–2 s per row, so 175 rows ≈ 5 min per subscription on first run.
  // We split into chunks of 50 so the user sees regular progress updates
  // instead of one long silent spinner.
  //
  // We deliberately omit `--start-date` so each row is treated as a STARTING
  // price (effective immediately). Adding `--start-date` would file the rows
  // as future-dated price changes, which Apple rejects for territories that
  // don't yet have a starting price ("Create a starting price before creating
  // future prices") — common on freshly created subscriptions.
  const CHUNK_SIZE = 50;
  const header = rows[0];
  const dataRows = rows.slice(1);
  const chunks: string[][] = [];
  for (let i = 0; i < dataRows.length; i += CHUNK_SIZE) {
    chunks.push(dataRows.slice(i, i + CHUNK_SIZE));
  }

  let totalCreated = 0;
  let totalFailed = 0;
  const allFailures: Array<{ territory: string; error: string }> = [];

  for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
    const chunk = chunks[chunkIdx];
    const csvPath = path.join(os.tmpdir(), `kappmaker-ppp-${sub.product_id}-${Date.now()}-${chunkIdx}.csv`);
    await fs.writeFile(csvPath, [header, ...chunk].join('\n') + '\n', 'utf-8');
    try {
      const result = await run(
        'asc',
        [
          'subscriptions', 'pricing', 'prices', 'import',
          '--app', appId,
          '--subscription-id', subscriptionId,
          '--input', csvPath,
          '--output', 'json',
        ],
        {
          label: `PPP ${sub.ref_name}: importing batch ${chunkIdx + 1}/${chunks.length} (${chunk.length} territories, ~${Math.round(chunk.length * 1.75)}s)`,
          allowFailure: true,
          timeout: 5 * 60_000,
        },
      );
      type ImportResp = {
        total?: number;
        created?: number;
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
        logger.warn(`PPP ${sub.ref_name} batch ${chunkIdx + 1}: import failed — ${(result.stderr || result.stdout).slice(0, 300)}`);
        totalFailed += chunk.length;
        continue;
      }
      totalCreated += parsed.created ?? 0;
      totalFailed += parsed.failed ?? 0;
      if (parsed.failures?.length) allFailures.push(...parsed.failures);
    } finally {
      await fs.unlink(csvPath).catch(() => undefined);
    }
  }

  const total = dataRows.length;
  if (totalFailed > 0) {
    const sample = allFailures.slice(0, 3).map((f) => `${f.territory}: ${f.error.slice(0, 100)}`).join('\n    ');
    logger.warn(`PPP ${sub.ref_name}: ${totalCreated}/${total} territories applied; ${totalFailed} failed.\n    ${sample}${totalFailed > 3 ? `\n    … (${totalFailed - 3} more)` : ''}`);
  } else {
    logger.success(`PPP ${sub.ref_name}: ${totalCreated}/${total} territories applied via CSV import.`);
  }
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
): Promise<void> {
  if (iaps.length === 0) {
    logger.info('No in-app purchases configured, skipping.');
    return;
  }

  for (const iap of iaps) {
    await setupInAppPurchase(appId, iap);
  }
}

async function setupInAppPurchase(appId: string, iap: AppStoreInAppPurchase): Promise<void> {
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

  if (alreadyExists) {
    logger.info(`IAP "${iap.ref_name}" (${iap.product_id}) already exists — refreshing pricing.`);
  } else if (result.exitCode !== 0) {
    const errMsg = result.stderr || result.stdout;
    logger.warn(`Could not create IAP "${iap.ref_name}": ${errMsg.slice(0, 150)}`);
    return;
  }

  // Per-territory PPP fan-out via a single `iap pricing schedules create` call.
  // Always run for both fresh and pre-existing IAPs — re-runs need to update prices.
  if (iap.ppp_enabled !== false && price?.price) {
    const iapId = await resolveIapId(appId, iap.product_id);
    if (iapId) await applyPppToIap(appId, iapId, iap, price.price);
  }
}

// Cache the IAP-list lookup so we only fetch once per orchestrator run.
let iapListCache: Map<string, string> | null = null;
async function resolveIapId(appId: string, productId: string): Promise<string | null> {
  if (!iapListCache) {
    const r = await run(
      'asc',
      ['iap', 'list', '--app', appId, '--paginate', '--output', 'json'],
      { label: 'Listing in-app purchases', allowFailure: true },
    );
    iapListCache = new Map();
    if (r.exitCode === 0 && r.stdout) {
      try {
        const data = JSON.parse(r.stdout);
        const arr: Array<{ id?: string; attributes?: { productId?: string }; productId?: string }> = data?.data ?? data ?? [];
        for (const e of arr) {
          const attrs = e.attributes ?? e;
          if (e.id && attrs.productId) iapListCache.set(attrs.productId, e.id);
        }
      } catch {
        // Fall through
      }
    }
  }
  return iapListCache.get(productId) ?? null;
}

/**
 * Apply PPP pricing across ASC territories for an IAP via a single `schedules
 * create` call. The CLI's `--prices` list takes app-level price-point IDs
 * (territory-specific), so we:
 *   1. Resolve each unique USD target → CLI tier via USA's catalog (one fetch).
 *   2. Construct each (territory, tier) price-point ID directly using Apple's
 *      base64 `{s, t, p}` format — avoids 174 per-territory CLI fetches.
 *   3. Submit all 174 entries in one `schedules create` call.
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

  // Resolve each unique USD target to a tier once via USA's app-level catalog.
  // For IAPs `s = appId` (verified empirically — IAP price-points always
  // encode the appId as the `s` field).
  const uniqueTargets = new Set(fanOut.map((f) => f.targetPrice));
  const tierByUsd = new Map<string, number>();
  for (const usd of uniqueTargets) {
    const r = await resolveUsdTierWithS(appId, usd, { catalog: 'app' });
    if (r) tierByUsd.set(usd, r.tier);
  }

  const startDate = new Date().toISOString().slice(0, 10);
  const entries: string[] = [];
  for (const item of fanOut) {
    const tier = tierByUsd.get(item.targetPrice);
    if (tier === undefined) continue;
    const ppId = encodePricePointId(appId, item.territory, tier);
    entries.push(`${ppId}:${startDate}`);
  }

  // User-listed territory overrides go in the same schedule (last wins).
  for (const p of iap.prices) {
    if (!p.price || !p.territory) continue;
    const ppId = await findExactPricePointForPrice(appId, p.territory, p.price, { catalog: 'app' });
    if (ppId) entries.push(`${ppId}:${startDate}`);
  }

  if (entries.length === 0) {
    logger.warn(`PPP fan-out for IAP "${iap.ref_name}" produced no price-points; skipping schedule create.`);
    return;
  }

  const baseTerritory = iap.prices[0]?.territory ?? 'USA';
  await run(
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
