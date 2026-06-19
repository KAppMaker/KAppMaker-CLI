// Per-region purchasing-power-parity pricing helpers.
// Tier values come from https://github.com/iosdevmax/ppp-pricing (MIT,
// Steam/Spotify/RevenueCat-inspired) — see src/data/ppp-tiers.ts for the
// multiplier table and FALLBACK_NEIGHBOUR for regions outside the upstream set.
import { run } from '../utils/exec.js';
import { logger } from '../utils/logger.js';
import {
  PPP_MULTIPLIERS,
  FALLBACK_NEIGHBOUR,
  PPP_DEFAULT_COEFFICIENT,
} from '../data/ppp-tiers.js';
import { PLAY_REGIONS } from '../data/play-regions.js';
import { ASC_TERRITORIES } from '../data/asc-territories.js';
import { ALPHA3_TO_ALPHA2 } from '../data/iso-3166.js';

export interface PlayRegionalPpp {
  region_code: string;
  price: string;
  currency_code: 'USD';
}

export interface AscTerritoryPpp {
  /** Alpha-3 territory code (e.g. "USA", "JPN"). */
  territory: string;
  /** PPP-adjusted USD price; caller resolves it to a price-point ID. */
  targetPrice: string;
}

export interface PricePoint {
  id: string;
  customerPrice: string;
}

export interface ApplyPppOptions {
  /** Round to .99 (Spotify-style). Default true. */
  round99?: boolean;
}

/** Multiplier for an alpha-2 region. Falls back to neighbour, then PPP_DEFAULT_COEFFICIENT. */
export function getMultiplier(regionAlpha2: string): number {
  return (
    PPP_MULTIPLIERS[regionAlpha2]
    ?? PPP_MULTIPLIERS[FALLBACK_NEIGHBOUR[regionAlpha2]]
    ?? PPP_DEFAULT_COEFFICIENT
  );
}

/**
 * Apply PPP to a USD base price. By default rounds to .99 endings (e.g.
 * 4.99 × 0.30 = 1.497 → "1.99"). Set `round99: false` to keep raw cents.
 */
export function applyPpp(
  baseUsdPrice: string,
  regionAlpha2: string,
  opts: ApplyPppOptions = {},
): string {
  const base = parseFloat(baseUsdPrice);
  if (!Number.isFinite(base) || base <= 0) return baseUsdPrice;
  const m = getMultiplier(regionAlpha2);
  const raw = base * m;

  if (opts.round99 === false) return raw.toFixed(2);

  // Spotify-style: floor to whole dollar, then add .99. Smallest output is 0.99.
  const dollars = Math.max(0, Math.floor(raw));
  return (dollars + 0.99).toFixed(2);
}

/**
 * Expand a USD base price across all Play-supported regions, skipping any
 * regions in `exclude`. All entries are USD — Google's `convertRegionPrices`
 * displays the local currency at runtime via the configured exchange table.
 */
export function expandPlayRegions(
  baseUsdPrice: string,
  exclude: ReadonlySet<string> = new Set(),
  opts: ApplyPppOptions = {},
): PlayRegionalPpp[] {
  const out: PlayRegionalPpp[] = [];
  for (const region of PLAY_REGIONS) {
    if (exclude.has(region)) continue;
    out.push({
      region_code: region,
      price: applyPpp(baseUsdPrice, region, opts),
      currency_code: 'USD',
    });
  }
  return out;
}

/**
 * Expand a USD base price across all ASC territories, returning alpha-3
 * codes paired with PPP-adjusted target prices. Caller is responsible for
 * resolving each (territory, targetPrice) into an ASC price-point ID via
 * `findClosestPricePointForPrice`.
 */
export function expandAscTerritories(
  baseUsdPrice: string,
  excludeAlpha3: ReadonlySet<string> = new Set(),
  opts: ApplyPppOptions = {},
): AscTerritoryPpp[] {
  const out: AscTerritoryPpp[] = [];
  for (const alpha3 of ASC_TERRITORIES) {
    if (excludeAlpha3.has(alpha3)) continue;
    const alpha2 = ALPHA3_TO_ALPHA2[alpha3] ?? alpha3;
    out.push({
      territory: alpha3,
      targetPrice: applyPpp(baseUsdPrice, alpha2, opts),
    });
  }
  return out;
}

// ── Price-point cache (per app + territory) ─────────────────────────
//
// Two catalogs:
//   - `appPricePoints` (app-level): IAPs / one-time apps. `s` field = app ID.
//   - `subscriptionPricePoints` (subscription-level): subscriptions only.
//     `s` field = an internal subscription identifier (NOT the app ID).
// Subscription price-points are NOT valid for IAP operations and vice versa
// — Apple rejects cross-catalog IDs with HTTP "The provided entity is invalid".
//
// Both catalogs share the same TIER NUMBERING: tier N (1..800) maps to
// base64 ID's `p` field = `10000 + N`. Tier N has the same USD-equivalent
// price across both catalogs (e.g. tier 88 = USA $6.99 in both).

const pricePointCache = new Map<string, PricePoint[]>();

interface FetchPricePointsOpts {
  /** "app" → `asc pricing price-points` (for IAPs). "subscription" → `asc subscriptions pricing price-points list` */
  catalog: 'app' | 'subscription';
  /** Required when catalog = "subscription". */
  subscriptionId?: string;
  /** ASC territory alpha-3 to filter (defaults to USA since tier numbering is global). */
  territory?: string;
}

async function fetchPricePoints(appId: string, opts: FetchPricePointsOpts): Promise<PricePoint[]> {
  const territory = opts.territory ?? 'USA';
  const key = opts.catalog === 'subscription'
    ? `sub:${appId}:${opts.subscriptionId}:${territory}`
    : `app:${appId}:${territory}`;
  const cached = pricePointCache.get(key);
  if (cached) return cached;

  const args = opts.catalog === 'subscription'
    ? ['subscriptions', 'pricing', 'price-points', 'list',
       '--app', appId,
       '--subscription-id', opts.subscriptionId!,
       '--territory', territory,
       '--paginate', '--output', 'json']
    : ['pricing', 'price-points', '--app', appId, '--territory', territory, '--paginate', '--output', 'json'];

  const result = await run('asc', args, {
    label: `Fetching ${opts.catalog} price-point catalog for ${territory}`,
    allowFailure: true,
  });
  if (result.exitCode !== 0 || !result.stdout) {
    pricePointCache.set(key, []);
    return [];
  }

  let points: PricePoint[] = [];
  try {
    const data = JSON.parse(result.stdout);
    const arr: Array<{ id?: string; attributes?: { customerPrice?: string }; customerPrice?: string }> = data?.data ?? data ?? [];
    points = arr
      .map((p) => {
        const attrs = p.attributes ?? p;
        return { id: p.id ?? '', customerPrice: attrs.customerPrice ?? '' };
      })
      .filter((p): p is PricePoint => Boolean(p.id) && Boolean(p.customerPrice));
  } catch {
    points = [];
  }
  pricePointCache.set(key, points);
  return points;
}

/**
 * Decode an Apple price-point ID (base64 of `{s, t, p}`). Returns null when
 * the ID isn't in Apple's standard format (caller should fall back).
 */
export function decodePricePointId(id: string): { s: string; t: string; p: string } | null {
  try {
    const padded = id + '='.repeat((4 - (id.length % 4)) % 4);
    const raw = Buffer.from(padded, 'base64').toString('utf-8');
    const obj = JSON.parse(raw) as { s?: string; t?: string; p?: string };
    if (!obj.s || !obj.t || !obj.p) return null;
    return { s: obj.s, t: obj.t, p: obj.p };
  } catch {
    return null;
  }
}

/** Convert an Apple price-point `p` value (e.g. "10049") to a CLI tier (1..800). */
export function tierFromPricePointId(id: string): number | null {
  const decoded = decodePricePointId(id);
  if (!decoded) return null;
  const tier = parseInt(decoded.p, 10) - 10000;
  return Number.isFinite(tier) && tier >= 1 && tier <= 800 ? tier : null;
}

/**
 * Re-encode a price-point ID for a different territory using the same `s` and
 * `p`. Used to fan out across territories without 174 per-territory fetches —
 * we read the `s` from a single USA fetch and synthesise the rest.
 *
 *  - For IAPs: `s` = the appId.
 *  - For subscriptions: `s` = an internal subscription identifier (different
 *    from appId); must be extracted from a real subscription price-point ID.
 *
 * Apple's base64 IDs aren't part of the documented API but the format has
 * been stable for years across both catalogs (verified 2026).
 */
export function encodePricePointId(s: string, territory: string, tier: number): string {
  const payload = JSON.stringify({ s, t: territory, p: String(10000 + tier) });
  return Buffer.from(payload, 'utf-8').toString('base64').replace(/=+$/, '');
}


/**
 * Resolve a USD target price to a (tier, internal-`s`) pair by matching against
 * USA's catalog. Use `catalog: "app"` for IAPs (s = appId) or `"subscription"`
 * for subscriptions (s = an internal sub identifier — caller doesn't need to
 * understand it, just passes it back into `encodePricePointId`).
 *
 * Returns null when the catalog can't be fetched or no match is found.
 */
export async function resolveUsdTierWithS(
  appId: string,
  targetUsdPrice: string,
  opts: { catalog: 'app' | 'subscription'; subscriptionId?: string },
): Promise<{ tier: number; s: string } | null> {
  const target = Number(targetUsdPrice);
  if (!Number.isFinite(target) || target <= 0) return null;
  const points = await fetchPricePoints(appId, {
    catalog: opts.catalog,
    subscriptionId: opts.subscriptionId,
    territory: 'USA',
  });
  if (points.length === 0) return null;

  let best: PricePoint | null = null;
  let bestDelta = Infinity;
  for (const p of points) {
    const num = Number(p.customerPrice);
    if (!Number.isFinite(num)) continue;
    const delta = Math.abs(num - target);
    if (delta < bestDelta) {
      best = p;
      bestDelta = delta;
    }
  }
  if (!best) return null;
  const decoded = decodePricePointId(best.id);
  if (!decoded) return null;
  const tier = parseInt(decoded.p, 10) - 10000;
  if (!Number.isFinite(tier) || tier < 1 || tier > 800) return null;
  return { tier, s: decoded.s };
}


/**
 * Find the price-point ID in `territory` whose customerPrice exactly matches
 * `targetPrice` IN THAT TERRITORY'S CURRENCY (not USD-converted). Used for
 * user-listed overrides like `{ territory: "DEU", price: "5.49", currency: "EUR" }`.
 * Returns null if no exact match.
 */
export async function findExactPricePointForPrice(
  appId: string,
  territory: string,
  targetPrice: string,
  opts: { catalog: 'app' | 'subscription'; subscriptionId?: string } = { catalog: 'app' },
): Promise<string | null> {
  const target = Number(targetPrice);
  if (!Number.isFinite(target)) return null;
  const points = await fetchPricePoints(appId, {
    catalog: opts.catalog,
    subscriptionId: opts.subscriptionId,
    territory,
  });
  for (const p of points) {
    const num = Number(p.customerPrice);
    if (Number.isFinite(num) && num === target) return p.id;
  }
  return null;
}

/** Test/diagnostic-only — clears the in-memory price-point cache. */
export function _clearPricePointCacheForTesting(): void {
  pricePointCache.clear();
}

/**
 * Territories where Apple's price tiers scale non-proportionally vs USD tier numbers.
 * Synthesising from the USA tier under-prices these markets because Apple sets tier N's
 * local price to << N × tier-1 (e.g. Turkey: tier 14 ≈ 3× tier-1, not 14×).
 * We instead fetch the territory catalog and pick the price-point closest to
 * tier1_local × usaTierNumber — preserving the proportional ratio using Apple's own scale.
 */
export const LOCAL_PRICE_TERRITORIES = new Set([
  'TUR', // Turkey  (TRY) — tier 14 ≈ 3× tier-1, not 14× (confirmed 2026-06)
  'EGY', // Egypt   (EGP) — post-2023 devaluation breaks proportionality
  'NGA', // Nigeria (NGN) — pricing volatile/suspended periods
  'JPN', // Japan   (JPY) — Apple updates JPY sporadically; may diverge between updates
  'KOR', // S.Korea (KRW) — same sporadic update pattern
  'IDN', // Indonesia (IDR) — large-denomination currency, historically divergent
  'BRA', // Brazil  (BRL) — large non-linear BRL adjustments by Apple
]);

/**
 * For territories in LOCAL_PRICE_TERRITORIES, find the price-point whose local price
 * is proportionally closest to our PPP USD target using Apple's own tier-1 price as anchor:
 *   target_local = territory_tier1_price × usaTierNumber
 * Avoids the double-PPP-discount caused by using the USA tier number on a territory
 * where Apple's tiers don't scale linearly (e.g. Turkey tier 14 = 99.99 ₺ ≈ $2.17
 * instead of the intended ~490 ₺ ≈ $13.50 at Apple's implicit rate).
 */
export async function findLocalPricePoint(
  appId: string,
  territory: string,
  usaTierNumber: number,
  opts: { catalog: 'app' | 'subscription'; subscriptionId?: string },
): Promise<string | null> {
  const points = await fetchPricePoints(appId, { ...opts, territory });
  if (points.length === 0) return null;

  let tier1Price = Infinity;
  for (const p of points) {
    const num = Number(p.customerPrice);
    if (Number.isFinite(num) && num > 0 && num < tier1Price) tier1Price = num;
  }
  if (!Number.isFinite(tier1Price) || tier1Price <= 0) return null;

  const targetLocal = tier1Price * usaTierNumber;

  let best: PricePoint | null = null;
  let bestDelta = Infinity;
  for (const p of points) {
    const num = Number(p.customerPrice);
    if (!Number.isFinite(num) || num <= 0) continue;
    const delta = Math.abs(num - targetLocal);
    if (delta < bestDelta) {
      best = p;
      bestDelta = delta;
    }
  }
  return best?.id ?? null;
}

/** Log a one-line summary of PPP fan-out results. */
export function logPppFanOut(
  label: string,
  basePrice: string,
  fannedOut: number,
  excluded: number,
): void {
  logger.info(`PPP "${label}": expanded $${basePrice} to ${fannedOut} regions (${excluded} user overrides preserved).`);
}
