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
 * Charm-round to the NEAREST x.49 / x.99 ending (ties round up). Examples:
 * 2.45 → 2.49, 2.10 → 1.99, 2.74 → 2.99, 5.49 → 5.49. Smallest output 0.49.
 * Replaces the pre-1.13.18 "floor + .99" rule, which inflated mid-dollar
 * values (2.45 → 2.99, +22% over the PPP intent).
 */
export function charmRound(value: number): number {
  const whole = Math.floor(value);
  let best = 0.49;
  for (const c of [whole - 0.01, whole + 0.49, whole + 0.99]) {
    if (c <= 0) continue;
    const d = Math.abs(c - value);
    const bd = Math.abs(best - value);
    if (d < bd - 1e-9 || (Math.abs(d - bd) < 1e-9 && c > best)) best = c;
  }
  return best;
}

/**
 * Apply PPP to a USD base price. By default charm-rounds to the nearest
 * .49/.99 ending (e.g. 4.99 × 0.35 = 1.7465 → "1.99"; 6.99 × 0.35 = 2.4465
 * → "2.49"). Set `round99: false` to keep raw cents.
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
  return charmRound(raw).toFixed(2);
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
  /**
   * "app" → `asc pricing price-points` (app-level catalog, `s` = appId).
   * "iap" → `asc iap pricing price-points list --iap-id` (per-IAP catalog, `s` = iapId).
   * "subscription" → `asc subscriptions pricing price-points list` (per-sub catalog, `s` = subId).
   *
   * NOTE: IAP price schedules require the per-IAP catalog ("iap"), NOT the
   * app-level one ("app"). The two share tier numbering but encode a DIFFERENT
   * `s` field — app-level uses appId, per-IAP uses the IAP's own ID. A schedule
   * built from app-level IDs (s=appId) is silently rejected by Apple, leaving
   * the IAP on auto-adjusted ("May Adjust Automatically") pricing.
   */
  catalog: 'app' | 'subscription' | 'iap';
  /** Required when catalog = "subscription". */
  subscriptionId?: string;
  /** Required when catalog = "iap". Accepts the numeric IAP ID or the product ID. */
  iapId?: string;
  /** ASC territory alpha-3 to filter (defaults to USA since tier numbering is global). */
  territory?: string;
}

async function fetchPricePoints(appId: string, opts: FetchPricePointsOpts): Promise<PricePoint[]> {
  const territory = opts.territory ?? 'USA';
  const key = opts.catalog === 'subscription'
    ? `sub:${appId}:${opts.subscriptionId}:${territory}`
    : opts.catalog === 'iap'
      ? `iap:${appId}:${opts.iapId}:${territory}`
      : `app:${appId}:${territory}`;
  const cached = pricePointCache.get(key);
  if (cached) return cached;

  const args = opts.catalog === 'subscription'
    ? ['subscriptions', 'pricing', 'price-points', 'list',
       '--app', appId,
       '--subscription-id', opts.subscriptionId!,
       '--territory', territory,
       '--paginate', '--output', 'json']
    : opts.catalog === 'iap'
      ? ['iap', 'pricing', 'price-points', 'list',
         '--app', appId,
         '--iap-id', opts.iapId!,
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

/**
 * Re-encode a price-point ID for a different territory using the same `s` and
 * `p`. Used to reconstruct the USA price point from (s, tier) and as a
 * FALLBACK for territories missing from Apple's equalizations — synthesis
 * assumes tier N is FX-proportional in the target territory, which several
 * local grids violate (see fetchEqualizations), so equalized IDs always win.
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
  opts: { catalog: 'app' | 'subscription' | 'iap'; subscriptionId?: string; iapId?: string },
): Promise<{ tier: number; s: string } | null> {
  const target = Number(targetUsdPrice);
  if (!Number.isFinite(target) || target <= 0) return null;
  const points = await fetchPricePoints(appId, {
    catalog: opts.catalog,
    subscriptionId: opts.subscriptionId,
    iapId: opts.iapId,
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
  opts: { catalog: 'app' | 'subscription' | 'iap'; subscriptionId?: string; iapId?: string } = { catalog: 'app' },
): Promise<string | null> {
  const target = Number(targetPrice);
  if (!Number.isFinite(target)) return null;
  const points = await fetchPricePoints(appId, {
    catalog: opts.catalog,
    subscriptionId: opts.subscriptionId,
    iapId: opts.iapId,
    territory,
  });
  for (const p of points) {
    const num = Number(p.customerPrice);
    if (Number.isFinite(num) && num === target) return p.id;
  }
  return null;
}

/** Test/diagnostic-only — clears the in-memory price-point + equalization caches. */
export function _clearPricePointCacheForTesting(): void {
  pricePointCache.clear();
  equalizationCache.clear();
}

// ── Equalizations ───────────────────────────────────────────────────
//
// For a given USA price point, Apple's "equalizations" endpoint returns the
// value-matched price point in every other territory — the same mapping App
// Store Connect's UI applies when it fills all countries after you pick a
// base price. This is the only reliable cross-territory fan-out: the same
// tier NUMBER does not mean the same USD value in every territory. Apple
// keeps several local grids non-proportional (KZT tier N ≈ 0.15× the
// FX-proportional price; PKR/INR/RUB/TZS/VND similar; JPY/KRW/BRL/IDR/TRY
// non-linear in the other direction), so synthesising `{s, t, p}` IDs with
// the USA tier number under- or over-prices those markets by 2–7×.

const equalizationCache = new Map<string, Map<string, PricePoint>>();

/**
 * Fetch Apple's equalized price points for a USA price-point ID. Returns a
 * map keyed by territory alpha-3 (decoded from each returned ID's `t` field).
 * Empty map when the CLI call fails — caller should fall back to synthesis.
 * Cached per (catalog, usaPricePointId) for the whole run.
 */
export async function fetchEqualizations(
  usaPricePointId: string,
  opts: { catalog: 'app' | 'subscription' | 'iap' },
): Promise<Map<string, PricePoint>> {
  const key = `${opts.catalog}:${usaPricePointId}`;
  const cached = equalizationCache.get(key);
  if (cached) return cached;

  const args = opts.catalog === 'subscription'
    ? ['subscriptions', 'pricing', 'price-points', 'equalizations',
       '--price-point-id', usaPricePointId, '--paginate', '--output', 'json']
    : opts.catalog === 'iap'
      ? ['iap', 'pricing', 'price-points', 'equalizations',
         '--id', usaPricePointId, '--paginate', '--output', 'json']
      : ['pricing', 'price-points', 'equalizations',
         '--price-point', usaPricePointId, '--paginate', '--output', 'json'];

  const byTerritory = new Map<string, PricePoint>();
  const result = await run('asc', args, {
    label: `Fetching ${opts.catalog} price equalizations`,
    allowFailure: true,
  });
  if (result.exitCode === 0 && result.stdout) {
    try {
      const data = JSON.parse(result.stdout);
      const arr: Array<{ id?: string; attributes?: { customerPrice?: string }; customerPrice?: string }> = data?.data ?? data ?? [];
      for (const p of arr) {
        if (!p?.id) continue;
        const territory = decodePricePointId(p.id)?.t;
        if (!territory) continue;
        const attrs = p.attributes ?? p;
        byTerritory.set(territory, { id: p.id, customerPrice: attrs.customerPrice ?? '' });
      }
    } catch {
      // Leave empty — caller falls back to tier synthesis.
    }
  }
  equalizationCache.set(key, byTerritory);
  return byTerritory;
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
