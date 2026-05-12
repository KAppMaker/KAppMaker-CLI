import { logger } from '../utils/logger.js';
import { apiRequest } from './gpc.service.js';
import { getMultiplier, logPppFanOut } from './ppp-pricing.service.js';
import type {
  GooglePlaySubscription,
  GooglePlayBasePlan,
  GooglePlayRegionalPrice,
  GooglePlayInAppProduct,
} from '../types/googleplay.js';

// ── convertRegionPrices: native-currency conversion + billable region list ─
//
// `pricing:convertRegionPrices` takes a USD anchor and returns a map of
// region → native-currency Money for every billable region. One call gives us
// both the FX conversion AND the billable filter (sanctioned countries are
// absent from the response). Cached per (packageName, baseUsdPrice).

const conversionCache = new Map<string, Map<string, Money>>();

async function fetchConvertedRegionPrices(
  packageName: string,
  baseUsd: Money,
): Promise<Map<string, Money>> {
  const cacheKey = `${packageName}:${baseUsd.units}.${String(baseUsd.nanos).padStart(9, '0')}`;
  const cached = conversionCache.get(cacheKey);
  if (cached) return cached;

  const result = await apiRequest<{
    convertedRegionPrices?: Record<string, { price?: Money; regionPrice?: Money }>;
  }>({
    method: 'POST',
    path: `/applications/${encodeURIComponent(packageName)}/pricing:convertRegionPrices`,
    body: { price: baseUsd },
    label: `Converting $${moneyToPriceString(baseUsd)} USD to all billable Play regions`,
    allowFailure: true,
  });

  const out = new Map<string, Money>();
  if (result.ok && result.data?.convertedRegionPrices) {
    for (const [region, val] of Object.entries(result.data.convertedRegionPrices)) {
      // Per Google's v3 discovery doc the field is `price`; accept the
      // misnamed `regionPrice` too as a defensive fallback in case the API surface drifts.
      const money = val?.price ?? val?.regionPrice;
      if (money) out.set(region, normalizeMoney(money));
    }
  } else {
    logger.warn('Could not fetch convertRegionPrices; PPP fan-out will skip and only your user-listed regions go live.');
  }
  conversionCache.set(cacheKey, out);
  return out;
}

/**
 * Proto3 JSON omits Money fields with default values (`units` missing when
 * price is `< 1 unit`, `nanos` missing when fraction is 0). Without this
 * normalization, `parseInt(undefined)` → NaN → "Invalid value (TYPE_INT64) 'NaN'".
 */
function normalizeMoney(m: Partial<Money> & { currencyCode?: string }): Money {
  return {
    currencyCode: m.currencyCode ?? 'USD',
    units: m.units != null && m.units !== '' ? String(m.units) : '0',
    nanos: typeof m.nanos === 'number' && Number.isFinite(m.nanos) ? m.nanos : 0,
  };
}

// ISO 4217 zero-decimal currencies — these use whole-unit Money (nanos always 0).
// All other currencies use 2-decimal nanos representation (nanos = cents × 10_000_000).
const ZERO_DECIMAL_CURRENCIES = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW',
  'PYG', 'RWF', 'UGX', 'UYI', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
]);

// ── regionsVersion=2022/02 drift table ──────────────────────────────
//
// Google Play's monetization API requires `regionsVersion.version`. The only
// documented value is `"2022/02"` (per Google's API ref + verified by community
// tooling). But that snapshot has known disagreements with what live
// `convertRegionPrices` returns today:
//
//   Region | Live API  | 2022/02 expects | Resolution
//   ------ | --------- | --------------- | ----------------------------------
//   BG     | EUR       | BGN             | Convert via the 1 EUR = 1.95583 BGN peg
//   HR     | EUR       | EUR ✓           | No override (Google updated 2022/02)
//   CI/CM/SN | XOF/XAF | USD             | Replace with the USD anchor
//   MN     | billable  | NOT BILLABLE    | Drop entirely (no currency works)
//
// BG and HR both joined the Eurozone (HR 2023, BG 2025); Google retroactively
// patched 2022/02 for HR but not for BG. CI/CM/SN are CFA franc countries
// Google never localised in the 2022/02 template.
const EXPECTED_2022_02_CURRENCY: Record<string, string> = {
  BG: 'BGN',
  HR: 'EUR',
  CI: 'USD',
  CM: 'USD',
  SN: 'USD',
};

/** No currency works for these at 2022/02 — every PATCH that includes them fails. */
const NEVER_BILLABLE_AT_2022_02 = new Set(['MN']);

/**
 * Echo-loop skip list: when patching an EXISTING product, we drop legacy
 * stored entries for these regions and let the fresh fan-out re-add them with
 * the correct 2022/02 currency. Without this skip we'd re-send the legacy
 * (often wrong) currency and Google would 400.
 */
const KNOWN_2022_02_DRIFT_REGIONS = new Set(['BG', 'HR', 'CI', 'CM', 'MN', 'SN']);

/**
 * Override a region's price from `convertRegionPrices` to use the currency
 * 2022/02 actually expects. Returns null when no currency works (MN).
 */
function applyCurrencyOverrideFor2022_02(
  region: string,
  livePrice: Money,
  usdAnchor: Money,
): Money | null {
  if (NEVER_BILLABLE_AT_2022_02.has(region)) return null;
  const expected = EXPECTED_2022_02_CURRENCY[region];
  if (!expected || livePrice.currencyCode === expected) return livePrice;

  if (expected === 'USD') {
    return { currencyCode: 'USD', units: usdAnchor.units, nanos: usdAnchor.nanos };
  }

  if (region === 'BG' && livePrice.currencyCode === 'EUR') {
    // 1 EUR = 1.95583 BGN (the Currency Board peg held since 1999).
    const bgnValue = moneyToFloat(livePrice) * 1.95583;
    const whole = Math.max(0, Math.floor(bgnValue));
    const nanos = Math.round((bgnValue - whole) * 1e9);
    return {
      currencyCode: 'BGN',
      units: String(whole),
      nanos: Math.max(0, Math.min(999999999, nanos)),
    };
  }
  return null;
}

/** Module-level cache: regions Google rejected during this CLI run, per package. */
const sessionDriftCache = new Map<string, Set<string>>();

/**
 * One-time products that hit `NEVER_BILLABLE_AT_2022_02` during this run.
 * Collected so we can print a single final summary with the manual-fix
 * instructions instead of one warning per failure point.
 */
const stuckOneTimeProducts = new Set<string>();
const stuckSubscriptions = new Set<string>();

function rememberDrift(packageName: string, regions: Iterable<string>): void {
  let cache = sessionDriftCache.get(packageName);
  if (!cache) {
    cache = new Set();
    sessionDriftCache.set(packageName, cache);
  }
  for (const r of regions) cache.add(r);
}

function getSessionDrift(packageName: string): ReadonlySet<string> {
  return sessionDriftCache.get(packageName) ?? new Set();
}

/**
 * Parse Google's region-rejection errors from a 400 response body. Handles
 * BOTH error sentence formats observed in the wild:
 *   - "Invalid currency for region code X" (currency drift; X joined Eurozone, etc.)
 *   - "Region code X is not billable" (region disabled in this regionsVersion)
 * Returns the union for the next retry attempt.
 */
function extractDriftRegions(errorText: string): Set<string> {
  const out = new Set<string>();
  const patterns = [
    /Invalid currency for region code (\w+)/g,
    /Region code (\w+) is not billable/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(errorText)) !== null) out.add(m[1]);
  }
  return out;
}

/**
 * Parse Google's "you tried to remove a region that's still on the product"
 * errors. Three formats observed:
 *   - Subscriptions: "Regional configs were removed from the base plan: A, B, C"
 *   - One-time products: 'Cannot remove region once it has been added: X' (one at a time)
 *   - Defensive list variant: "Cannot remove regions: A, B, C"
 */
function extractRemovedRegions(errorText: string): Set<string> {
  const out = new Set<string>();
  // Format 1 + 3: comma-separated list after a "...:" colon.
  const listPatterns = [
    /Regional configs were removed[^:]*:\s*([A-Z, ]+)/g,
    /Cannot remove regions?[^:]*:\s*([A-Z, ]+)/g,
  ];
  for (const re of listPatterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(errorText)) !== null) {
      for (const code of m[1].split(',')) {
        const trimmed = code.trim();
        if (/^[A-Z]{2}$/.test(trimmed)) out.add(trimmed);
      }
    }
  }
  // Format 2: single region — purchase-option variant.
  const singlePattern = /Cannot remove region once it has been added:\s*([A-Z]{2})/g;
  let m: RegExpExecArray | null;
  while ((m = singlePattern.exec(errorText)) !== null) {
    out.add(m[1]);
  }
  return out;
}

function moneyToFloat(m: Money): number {
  // Proto3 JSON omits default-valued fields, so `units` may arrive as undefined
  // or empty when the converted price is < 1 unit. Treat both as 0 to avoid
  // NaN propagation downstream.
  const unitsRaw = m.units;
  const units = unitsRaw != null && unitsRaw !== '' ? parseInt(String(unitsRaw), 10) : 0;
  const nanos = typeof m.nanos === 'number' && Number.isFinite(m.nanos) ? m.nanos : 0;
  return (Number.isFinite(units) ? units : 0) + nanos / 1e9;
}

function moneyToPriceString(m: Money): string {
  if (m.nanos === 0) return m.units;
  // Money.nanos is billionths; show 2 decimal places (cents).
  const cents = Math.round(m.nanos / 10_000_000).toString().padStart(2, '0');
  return `${m.units}.${cents}`;
}

/**
 * Apply a PPP multiplier to a Money value, with charm-rounding appropriate to
 * the currency: zero-decimal currencies (JPY/KRW/etc.) round to the nearest
 * X99 / X9 / X integer; decimal currencies (USD/EUR/INR/etc.) get the
 * Spotify-style "floor to whole + .99" treatment.
 */
function applyPppCharmRound(m: Money, multiplier: number): Money {
  const baseValue = moneyToFloat(m);
  const scaled = baseValue * multiplier;
  if (!Number.isFinite(scaled)) {
    // Defensive: never let NaN escape into a body. Fall back to the source
    // Money unchanged so Google sees a valid number (and we keep an audit log).
    logger.warn(`applyPppCharmRound got non-finite value for ${m.currencyCode} (units="${m.units}", nanos=${m.nanos}, multiplier=${multiplier}); using source price.`);
    return normalizeMoney(m);
  }
  if (ZERO_DECIMAL_CURRENCIES.has(m.currencyCode)) {
    let rounded: number;
    if (scaled >= 100) rounded = Math.max(1, Math.round(scaled / 100) * 100 - 1); // 415 → 399
    else if (scaled >= 10) rounded = Math.max(1, Math.round(scaled / 10) * 10 - 1); // 17 → 19
    else rounded = Math.max(1, Math.round(scaled));
    return { currencyCode: m.currencyCode, units: String(rounded), nanos: 0 };
  }
  const whole = Math.max(0, Math.floor(scaled));
  return { currencyCode: m.currencyCode, units: String(whole), nanos: 990000000 };
}

/**
 * Per-region PPP fan-out in each region's native currency. Fetches
 * convertRegionPrices, applies the 2022/02 currency override where needed,
 * multiplies by the region's PPP multiplier, and charm-rounds.
 *
 * Excludes regions in `userExclude` and `extraExclude`.
 */
async function expandPlayRegionsLocal(
  packageName: string,
  baseUsdPrice: string,
  userExclude: ReadonlySet<string>,
  pppEnabled: boolean,
  /** Regions to skip on retry after Google rejected them — accumulates across retries within one product. */
  extraExclude: ReadonlySet<string> = new Set(),
): Promise<GooglePlayRegionalPrice[]> {
  const usdMoney = priceToMoney(baseUsdPrice, 'USD');
  const conv = await fetchConvertedRegionPrices(packageName, usdMoney);
  const sessionDrift = getSessionDrift(packageName);
  const out: GooglePlayRegionalPrice[] = [];
  const overriddenRegions: string[] = [];
  const skippedRegions: string[] = [];
  for (const [region, livePrice] of conv.entries()) {
    if (userExclude.has(region)) continue;
    if (extraExclude.has(region)) continue;
    if (sessionDrift.has(region)) {
      skippedRegions.push(region);
      continue;
    }

    // Currency-override step: convertRegionPrices returns each region's CURRENT
    // billing currency, which sometimes differs from what regionsVersion=2022/02
    // expects (BG: live EUR → 2022/02 BGN; CI/CM/SN: live XOF/XAF → 2022/02 USD).
    // applyCurrencyOverrideFor2022_02 returns the override Money, or null when
    // the region is truly unbillable at 2022/02 (MN).
    const correctedPrice = applyCurrencyOverrideFor2022_02(region, livePrice, usdMoney);
    if (!correctedPrice) {
      skippedRegions.push(region);
      continue;
    }
    if (correctedPrice.currencyCode !== livePrice.currencyCode) {
      overriddenRegions.push(`${region}:${livePrice.currencyCode}→${correctedPrice.currencyCode}`);
    }

    const finalPrice = pppEnabled
      ? applyPppCharmRound(correctedPrice, getMultiplier(region))
      : correctedPrice;
    out.push({
      region_code: region,
      price: moneyToPriceString(finalPrice),
      currency_code: finalPrice.currencyCode,
    });
  }
  if (overriddenRegions.length > 0) {
    logger.info(`Currency overrides for regionsVersion 2022/02: ${overriddenRegions.join(', ')}.`);
  }
  if (skippedRegions.length > 0) {
    logger.info(`Skipped ${skippedRegions.join(', ')} from PPP fan-out (no 2022/02-compatible currency — region was removed from the catalog).`);
  }
  return out;
}

// ── Price helpers ────────────────────────────────────────────────────

interface Money {
  currencyCode: string;
  units: string;
  nanos: number;
}

/**
 * Convert a human-readable price like "6.99" into the Google Play money
 * representation: { currencyCode, units, nanos }. Nanos are billionths,
 * so "6.99" becomes { units: "6", nanos: 990000000 }.
 */
function priceToMoney(price: string, currencyCode: string): Money {
  const [wholeRaw, fractionRaw = ''] = price.trim().split('.');
  const whole = wholeRaw.replace(/^-/, '') || '0';
  // Pad or truncate fractional part to 9 digits (nanos)
  const fractionPadded = (fractionRaw + '000000000').slice(0, 9);
  const nanos = Number(fractionPadded) || 0;
  return {
    currencyCode,
    units: whole,
    nanos: price.startsWith('-') ? -nanos : nanos,
  };
}

/**
 * Derive USD and EUR anchor prices from a list of regional configs.
 *
 * Google requires both `usdPrice` and `eurPrice` Money objects on
 * `otherRegionsConfig` (subscription base plans) and `newRegionsConfig`
 * (one-time product purchase options) to opt the product into all
 * Play-supported regions with auto-converted pricing.
 *
 * Strategy: prefer explicit USD / EUR entries from the user's `regional_configs`.
 * If only USD is provided, mirror the USD value as the EUR anchor — Google's
 * per-region pricing algorithm still adjusts for local market conditions, so
 * the exact anchor matters less than including one. Returns null if no USD
 * price is available (in which case the caller should skip the field rather
 * than send an invalid request).
 */
function deriveAnchorPrices(
  prices: GooglePlayRegionalPrice[],
): { usdPrice: Money; eurPrice: Money } | null {
  const usdEntry = prices.find((p) => p.currency_code === 'USD');
  if (!usdEntry) return null;
  const eurEntry = prices.find((p) => p.currency_code === 'EUR');
  return {
    usdPrice: priceToMoney(usdEntry.price, 'USD'),
    eurPrice: eurEntry
      ? priceToMoney(eurEntry.price, 'EUR')
      : priceToMoney(usdEntry.price, 'EUR'),
  };
}

function buildRegionalConfigs(prices: GooglePlayRegionalPrice[]): Record<string, { newSubscriberAvailability: boolean; price: Money }> {
  // Only include regions with explicit prices. Google Play auto-converts
  // pricing for unlisted regions — listing a region WITHOUT a price causes
  // a 400 ("Expected AED but got XXX") because the API treats the missing
  // price as currency code XXX.
  const out: Record<string, { newSubscriberAvailability: boolean; price: Money }> = {};
  for (const p of prices) {
    out[p.region_code] = {
      newSubscriberAvailability: true,
      price: priceToMoney(p.price, p.currency_code),
    };
  }
  return out;
}

// ── Subscriptions ────────────────────────────────────────────────────

interface PlayListSubscriptionsResponse {
  subscriptions?: Array<{ productId: string; packageName: string }>;
}

export async function listSubscriptions(packageName: string): Promise<Set<string>> {
  const result = await apiRequest<PlayListSubscriptionsResponse>({
    method: 'GET',
    path: `/applications/${encodeURIComponent(packageName)}/subscriptions`,
    label: 'Looking up existing subscriptions',
    allowFailure: true,
  });
  if (!result.ok || !result.data?.subscriptions) return new Set();
  return new Set(result.data.subscriptions.map((s) => s.productId));
}

export async function setupSubscriptions(
  packageName: string,
  subscriptions: GooglePlaySubscription[],
  playDefaultLanguage: string,
): Promise<void> {
  if (subscriptions.length === 0) {
    logger.info('No subscriptions configured, skipping.');
    return;
  }

  const existing = await listSubscriptions(packageName);

  for (const sub of subscriptions) {
    if (existing.has(sub.product_id)) {
      // Re-PATCH so regional pricing (PPP fan-out) is updated on existing
      // subscriptions instead of leaving them stuck at their original config
      // (typically US-only, from earlier CLI versions).
      logger.info(`Subscription "${sub.product_id}" exists — patching regional pricing.`);
      await updateSubscriptionWithBasePlans(packageName, sub, playDefaultLanguage);
    } else {
      await createSubscriptionWithBasePlans(packageName, sub, playDefaultLanguage);
    }
  }
  printRegionAvailabilityHint();
}

// Print once per `gpc setup` run, after monetization wraps. De-duped via a flag.
let regionAvailabilityHintPrinted = false;
function printRegionAvailabilityHint(): void {
  if (regionAvailabilityHintPrinted) return;
  regionAvailabilityHintPrinted = true;
  logger.info('');
  logger.info('If Play Console still shows products as "available in US only" after this run:');
  logger.info('  1. Wait 5-10 min — Play Console UI lags after API writes.');
  logger.info('  2. Check the verify lines above ("Stored on Google: X/Y regions") — if Y is high, the data IS on Google.');
  logger.info('  3. Check Production track → Country availability — the APP itself must be released in countries you want product pricing visible in.');
  logger.info('  4. If the app is still in DRAFT (never published), per-region pricing only takes effect after the first production rollout.');
}

// Google Play's new monetization API ties pricing regions to a "regionsVersion"
// — bump this constant if Google publishes a newer region catalog.
const REGIONS_VERSION = '2022/02';

// One-time products surface drifted regions ONE AT A TIME per error response,
// so a legacy product with many drift regions needs many retries. Bail early
// when the error stops mentioning new regions.
const SUBSCRIPTION_MAX_RETRIES = 20;
const ONE_TIME_PRODUCT_MAX_RETRIES = 20;

/**
 * Apply the retry policy after one attempt of a subscription POST/PATCH:
 *   - success → return true (caller breaks out of the loop)
 *   - drift error (Invalid currency / not billable) → add to extraExclude
 *   - removal error (Cannot remove region) → add to forceUnavailable
 *   - region in BOTH extraExclude AND a drift error → deadlock; mark stuck
 *   - no recognised error → return true (no further progress possible)
 */
function handleSubscriptionRetry(
  result: { ok: boolean; error?: string },
  productId: string,
  packageName: string,
  extraExclude: Set<string>,
  forceUnavailable: Set<string>,
): boolean {
  if (result.ok) return true;
  const bad = extractDriftRegions(result.error ?? '');
  const removed = extractRemovedRegions(result.error ?? '');
  if (bad.size === 0 && removed.size === 0) return true;
  const deadlocked = [...bad].filter((r) => forceUnavailable.has(r));
  if (deadlocked.length > 0) {
    logger.warn(`Deadlock on ${productId}: region${deadlocked.length === 1 ? '' : 's'} ${deadlocked.join(', ')} can't be removed and can't be kept under regionsVersion ${REGIONS_VERSION}.`);
    stuckSubscriptions.add(productId);
    return true;
  }
  for (const r of bad) extraExclude.add(r);
  for (const r of removed) forceUnavailable.add(r);
  rememberDrift(packageName, bad);
  if (bad.size > 0) logger.info(`Drift on ${[...bad].join(', ')} — retrying without those regions.`);
  if (removed.size > 0) logger.info(`Google requires ${[...removed].join(', ')} to remain on product — retrying with newSubscriberAvailability=false.`);
  return false;
}

/**
 * Same shape as `handleSubscriptionRetry` but for one-time products. Extra
 * branch for "Product ID already in use" (Google's soft-delete reservation
 * window — wait, don't retry tight).
 */
function handleOneTimeProductRetry(
  result: { ok: boolean; error?: string },
  sku: string,
  packageName: string,
  extraExclude: Set<string>,
  forceUnavailable: Set<string>,
): boolean {
  if (result.ok) return true;
  if ((result.error ?? '').includes('Product ID already in use')) {
    logger.warn(`${sku} is in Google's soft-delete reservation window (a few minutes to a few hours after DELETE).`);
    logger.info(`Wait 30+ minutes and re-run \`kappmaker gpc iap push\` (without --recreate-stuck — the product will be re-created fresh).`);
    stuckOneTimeProducts.add(sku);
    return true;
  }
  const bad = extractDriftRegions(result.error ?? '');
  const removed = extractRemovedRegions(result.error ?? '');
  if (bad.size === 0 && removed.size === 0) return true;
  const deadlocked = [...bad].filter((r) => forceUnavailable.has(r));
  if (deadlocked.length > 0) {
    logger.warn(`Deadlock on ${sku}: region${deadlocked.length === 1 ? '' : 's'} ${deadlocked.join(', ')} can't be removed and can't be kept under regionsVersion ${REGIONS_VERSION}.`);
    stuckOneTimeProducts.add(sku);
    return true;
  }
  for (const r of bad) extraExclude.add(r);
  for (const r of removed) forceUnavailable.add(r);
  rememberDrift(packageName, bad);
  if (bad.size > 0) logger.info(`Drift on ${[...bad].join(', ')} — retrying without those regions.`);
  if (removed.size > 0) logger.info(`Google requires ${[...removed].join(', ')} to remain on product — retrying with NO_LONGER_AVAILABLE.`);
  return false;
}

/**
 * Existing regional config for a base plan, captured verbatim from a GET
 * before the PATCH. Used to preserve regions that Google has already stored
 * but our fresh fan-out would otherwise drop (drift regions, manually-added
 * regions, etc.). Omitting them on PATCH triggers HTTP 400 _"Regional configs
 * were removed from the base plan: X, Y, Z"_.
 */
interface ExistingRegionalConfig {
  regionCode: string;
  price?: Money;
  newSubscriberAvailability?: boolean;
}

type ExistingBasePlanState = Map<string, Map<string, ExistingRegionalConfig>>;

/**
 * GET an existing subscription and return its base-plan → region-code → config
 * map. The PATCH body must echo every region currently stored on Google
 * (it's "once added, never removed" for active base plans), so we read first
 * and merge our fresh PPP fan-out on top.
 *
 * Returns an empty map if the subscription doesn't exist yet (create path) or
 * the GET fails — caller falls back to fresh-fan-out-only behaviour.
 */
async function fetchExistingSubscriptionState(
  packageName: string,
  productId: string,
): Promise<ExistingBasePlanState> {
  const out: ExistingBasePlanState = new Map();
  const result = await apiRequest<{
    basePlans?: Array<{
      basePlanId?: string;
      regionalConfigs?: Array<{
        regionCode?: string;
        price?: Partial<Money>;
        newSubscriberAvailability?: boolean;
      }>;
    }>;
  }>({
    method: 'GET',
    path: `/applications/${encodeURIComponent(packageName)}/subscriptions/${encodeURIComponent(productId)}`,
    label: `Reading existing regional configs for ${productId}`,
    allowFailure: true,
  });
  if (!result.ok || !result.data?.basePlans) return out;
  for (const bp of result.data.basePlans) {
    if (!bp.basePlanId) continue;
    const byRegion = new Map<string, ExistingRegionalConfig>();
    for (const cfg of bp.regionalConfigs ?? []) {
      if (!cfg.regionCode) continue;
      byRegion.set(cfg.regionCode, {
        regionCode: cfg.regionCode,
        price: cfg.price ? normalizeMoney(cfg.price) : undefined,
        newSubscriberAvailability: cfg.newSubscriberAvailability,
      });
    }
    out.set(bp.basePlanId, byRegion);
  }
  return out;
}

async function buildSubscriptionBody(
  packageName: string,
  sub: GooglePlaySubscription,
  playDefaultLanguage: string,
  extraExclude: ReadonlySet<string> = new Set(),
  existingState: ExistingBasePlanState = new Map(),
  forceUnavailable: ReadonlySet<string> = new Set(),
): Promise<Record<string, unknown>> {
  // Play rejects subscriptions that don't have a listing in the app's current
  // default language. If the config's listings don't cover it, clone the first
  // entry with the Play default language tacked on.
  const listings = [...sub.listings];
  const hasDefault = listings.some((l) => l.locale === playDefaultLanguage);
  if (!hasDefault && listings.length > 0) {
    const first = listings[0];
    listings.unshift({
      locale: playDefaultLanguage,
      title: first.title,
      description: first.description,
      benefits: first.benefits,
    });
    logger.info(`Cloned "${first.locale}" listing to "${playDefaultLanguage}" (Play default language).`);
  }

  return {
    packageName,
    productId: sub.product_id,
    listings: listings.map((l) => ({
      languageCode: l.locale,
      title: l.title,
      description: l.description ?? '',
      benefits: l.benefits ?? [],
    })),
    basePlans: await Promise.all(
      sub.base_plans.map((bp) =>
        buildBasePlanBody(packageName, bp, extraExclude, existingState.get(bp.base_plan_id), forceUnavailable),
      ),
    ),
  };
}

async function createSubscriptionWithBasePlans(
  packageName: string,
  sub: GooglePlaySubscription,
  playDefaultLanguage: string,
): Promise<void> {
  // POST creates subscription + base plans in one call. productId and
  // regionsVersion.version go in the QUERY (passing productId in the body
  // triggers "Product ID must be specified"). Create path has no existing
  // state to preserve — pass an empty map for type consistency.
  const extraExclude = new Set<string>();
  const forceUnavailable = new Set<string>();
  const existingState: ExistingBasePlanState = new Map();
  let lastResult: { ok: boolean; error?: string } | null = null;

  for (let attempt = 0; attempt < SUBSCRIPTION_MAX_RETRIES; attempt++) {
    const body = await buildSubscriptionBody(packageName, sub, playDefaultLanguage, extraExclude, existingState, forceUnavailable);
    const result = await apiRequest({
      method: 'POST',
      path: `/applications/${encodeURIComponent(packageName)}/subscriptions`,
      query: { productId: sub.product_id, 'regionsVersion.version': REGIONS_VERSION },
      body,
      label: attempt === 0
        ? `Creating subscription: ${sub.product_id}`
        : `Retrying subscription ${sub.product_id} (drop ${extraExclude.size}, force-unavailable ${forceUnavailable.size})`,
      allowFailure: true,
    });
    lastResult = result;
    if (handleSubscriptionRetry(result, sub.product_id, packageName, extraExclude, forceUnavailable)) break;
  }

  if (!lastResult?.ok) {
    logger.warn(`Could not create subscription ${sub.product_id}. Skipping its base plans.`);
    return;
  }

  for (const basePlan of sub.base_plans) {
    await activateBasePlan(packageName, sub.product_id, basePlan.base_plan_id);
  }
  await verifySubscriptionRegions(packageName, sub.product_id);
}

/**
 * PATCH an existing subscription with new pricing. Used to back-fill PPP
 * regional configs onto products created by an earlier CLI version that
 * only set US pricing. updateMask=basePlans,listings replaces those fields
 * wholesale; Google rejects regionalConfig changes that lower price below
 * the current floor for active subscribers, so this is best-effort.
 */
async function updateSubscriptionWithBasePlans(
  packageName: string,
  sub: GooglePlaySubscription,
  playDefaultLanguage: string,
): Promise<void> {
  const extraExclude = new Set<string>();
  const forceUnavailable = new Set<string>();
  let lastResult: { ok: boolean; error?: string } | null = null;

  // Read existing state ONCE before the retry loop — Google's "Regional configs
  // were removed" rule applies at the per-region level for active base plans.
  // We need to echo any region currently stored that the fresh fan-out doesn't
  // cover (drift regions, manually-added regions, etc.).
  const existingState = await fetchExistingSubscriptionState(packageName, sub.product_id);
  const preservedCount = [...existingState.values()].reduce((n, m) => n + m.size, 0);
  if (preservedCount > 0) {
    logger.info(`Preserving ${preservedCount} existing regional config${preservedCount === 1 ? '' : 's'} on ${sub.product_id}.`);
  }

  for (let attempt = 0; attempt < SUBSCRIPTION_MAX_RETRIES; attempt++) {
    const body = await buildSubscriptionBody(packageName, sub, playDefaultLanguage, extraExclude, existingState, forceUnavailable);
    const result = await apiRequest({
      method: 'PATCH',
      path: `/applications/${encodeURIComponent(packageName)}/subscriptions/${encodeURIComponent(sub.product_id)}`,
      query: { 'regionsVersion.version': REGIONS_VERSION, updateMask: 'basePlans,listings' },
      body,
      label: attempt === 0
        ? `Updating subscription regional pricing: ${sub.product_id}`
        : `Retrying subscription ${sub.product_id} (drop ${extraExclude.size}, force-unavailable ${forceUnavailable.size})`,
      allowFailure: true,
    });
    lastResult = result;
    if (handleSubscriptionRetry(result, sub.product_id, packageName, extraExclude, forceUnavailable)) break;
  }

  if (!lastResult?.ok) {
    logger.warn(`Could not update subscription ${sub.product_id}. Existing pricing left as-is.`);
    logger.info('Tip: Google may reject region-removal or price-decrease changes on active base plans. Consider creating a new product_id (e.g., bump v1 → v2) for new pricing.');
  } else if (extraExclude.size > 0) {
    logger.success(`Subscription ${sub.product_id} updated (dropped ${extraExclude.size} drift region${extraExclude.size === 1 ? '' : 's'}: ${[...extraExclude].join(', ')}).`);
  }

  // Re-activate base plans (no-op if already active; idempotent).
  for (const basePlan of sub.base_plans) {
    await activateBasePlan(packageName, sub.product_id, basePlan.base_plan_id);
  }
  if (lastResult?.ok) await verifySubscriptionRegions(packageName, sub.product_id);
}

/**
 * Build a base plan body. Two pricing modes:
 *   - `ppp_enabled !== false` (default) — fresh fan-out via `convertRegionPrices`
 *     produces one entry per billable region (~170) in the region's native
 *     currency with the PPP multiplier applied.
 *   - `ppp_enabled === false` — only user-listed regions + `otherRegionsConfig`
 *     with USD/EUR anchors; Google auto-converts for every other region.
 *
 * `existingRegions` is the per-region snapshot from a pre-PATCH GET — we echo
 * any region Google has stored that the fresh fan-out doesn't already cover
 * (Google's "Regional configs were removed" rule). `forceUnavailable` carries
 * regions discovered during retries that we couldn't drop — re-injected with
 * `newSubscriberAvailability: false`.
 */
async function buildBasePlanBody(
  packageName: string,
  basePlan: GooglePlayBasePlan,
  extraExclude: ReadonlySet<string> = new Set(),
  existingRegions: Map<string, ExistingRegionalConfig> = new Map(),
  forceUnavailable: ReadonlySet<string> = new Set(),
): Promise<Record<string, unknown>> {
  const userConfigs = basePlan.regional_configs;
  const usdAnchor = userConfigs.find((p) => p.currency_code === 'USD');
  const pppEnabled = basePlan.ppp_enabled !== false;

  let allConfigs: GooglePlayRegionalPrice[] = userConfigs;
  if (pppEnabled && usdAnchor) {
    const userRegions = new Set(userConfigs.map((p) => p.region_code));
    const expanded = await expandPlayRegionsLocal(packageName, usdAnchor.price, userRegions, true, extraExclude);
    // User-listed entries that happen to be in the retry-exclude set should also drop out.
    const filteredUser = userConfigs.filter((p) => !extraExclude.has(p.region_code));
    allConfigs = [...expanded, ...filteredUser];
    logPppFanOut(`base plan ${basePlan.base_plan_id}`, usdAnchor.price, expanded.length, filteredUser.length);
  } else if (pppEnabled && !usdAnchor) {
    logger.warn(`No USD anchor in regional_configs for "${basePlan.base_plan_id}" — falling back to user-listed regions only.`);
  }

  // Build the regional config map from the fresh PPP + user fan-out.
  const merged = buildRegionalConfigs(allConfigs);

  // Echo previously-stored regions that the fresh fan-out doesn't cover —
  // Google's "Regional configs were removed" rule. But skip drift regions:
  // their legacy stored currency would conflict with 2022/02, and the fresh
  // fan-out re-adds them in the correct currency anyway.
  const sessionDriftSet = getSessionDrift(packageName);
  let echoedCount = 0;
  let skippedDriftCount = 0;
  for (const [region, cfg] of existingRegions.entries()) {
    if (merged[region]) continue; // fresh fan-out already covers it
    if (!cfg.price) continue; // can't echo without a price
    const isDrift =
      KNOWN_2022_02_DRIFT_REGIONS.has(region) ||
      sessionDriftSet.has(region) ||
      extraExclude.has(region);
    if (isDrift) {
      skippedDriftCount++;
      continue;
    }
    merged[region] = {
      newSubscriberAvailability: cfg.newSubscriberAvailability ?? true,
      price: normalizeMoney(cfg.price),
    };
    echoedCount++;
  }
  if (echoedCount > 0) {
    logger.info(`Echoed ${echoedCount} previously-stored region${echoedCount === 1 ? '' : 's'} on ${basePlan.base_plan_id} (Google rejects PATCH bodies that drop existing regions).`);
  }
  if (skippedDriftCount > 0) {
    logger.warn(`Dropped ${skippedDriftCount} drift region${skippedDriftCount === 1 ? '' : 's'} from ${basePlan.base_plan_id}'s existing config — their stored currency no longer matches regionsVersion 2022/02. If Google rejects the removal we'll retry marking them NO_LONGER_AVAILABLE.`);
  }

  // Re-inject `forceUnavailable` regions using the 2022/02-expected currency
  // (the stored price's currency is often wrong, e.g. legacy BG/EUR). For
  // NEVER_BILLABLE regions (MN) no currency works — surface as stuck.
  let forceUnavailableCount = 0;
  const neverBillableSubRegions: string[] = [];
  for (const region of forceUnavailable) {
    if (merged[region]?.newSubscriberAvailability === false) continue; // already handled
    if (NEVER_BILLABLE_AT_2022_02.has(region)) {
      neverBillableSubRegions.push(region);
      continue;
    }
    const expectedCurrency = EXPECTED_2022_02_CURRENCY[region] ?? 'USD';
    merged[region] = {
      newSubscriberAvailability: false,
      price: { currencyCode: expectedCurrency, units: '0', nanos: 990000000 },
    };
    forceUnavailableCount++;
  }
  if (forceUnavailableCount > 0) {
    logger.info(`Re-injected ${forceUnavailableCount} region${forceUnavailableCount === 1 ? '' : 's'} on ${basePlan.base_plan_id} as newSubscriberAvailability=false with expected 2022/02 currency.`);
  }
  if (neverBillableSubRegions.length > 0) {
    logger.warn(`Cannot fix ${neverBillableSubRegions.join(', ')} on subscription base plan ${basePlan.base_plan_id} — these regions were removed from Google's 2022/02 billable catalog. The subscription is "stuck"; PATCH will fail.`);
  }

  const body: Record<string, unknown> = {
    basePlanId: basePlan.base_plan_id,
    state: 'DRAFT', // activated in a separate call
    autoRenewingBasePlanType: {
      billingPeriodDuration: basePlan.billing_period,
      resubscribeState: 'RESUBSCRIBE_STATE_ACTIVE',
      ...(basePlan.grace_period ? { gracePeriodDuration: basePlan.grace_period } : {}),
    },
    regionalConfigs: Object.entries(merged).map(
      ([region, cfg]) => ({
        regionCode: region,
        newSubscriberAvailability: cfg.newSubscriberAvailability,
        price: cfg.price,
      }),
    ),
  };

  // ALWAYS include otherRegionsConfig when we have a USD anchor. Google requires
  // it on every PATCH once it has been set previously, and it covers any region
  // Google adds in the future. Both usdPrice and eurPrice are required.
  const anchors = deriveAnchorPrices(userConfigs);
  if (anchors) {
    body.otherRegionsConfig = {
      newSubscriberAvailability: true,
      usdPrice: anchors.usdPrice,
      eurPrice: anchors.eurPrice,
    };
    if (!pppEnabled) {
      logger.info(`Base plan "${basePlan.base_plan_id}": ppp_enabled=false → Google auto-fan-out via otherRegionsConfig (USD ${usdAnchor?.price} anchor).`);
    }
  } else if (!pppEnabled) {
    logger.warn(`Base plan "${basePlan.base_plan_id}": ppp_enabled=false but no USD anchor — pricing will be limited to user-listed regions only.`);
  }
  return body;
}

async function activateBasePlan(
  packageName: string,
  productId: string,
  basePlanId: string,
): Promise<void> {
  await apiRequest({
    method: 'POST',
    path: `/applications/${encodeURIComponent(packageName)}/subscriptions/${encodeURIComponent(productId)}/basePlans/${encodeURIComponent(basePlanId)}:activate`,
    // Per discovery doc `ActivateBasePlanRequest` requires these fields in the
    // body even though the path provides them. Sending {} appeared to succeed
    // but may have been a no-op on Google's side.
    body: {
      packageName,
      productId,
      basePlanId,
      latencyTolerance: 'PRODUCT_UPDATE_LATENCY_TOLERANCE_LATENCY_SENSITIVE',
    },
    label: `Activating base plan ${productId}/${basePlanId}`,
    allowFailure: true,
  });
}

/**
 * GET an existing subscription and log how many regions are configured per base
 * plan, plus how many of those are flagged available to new subscribers. Lets
 * the user verify "did the PATCH actually write what we sent?" — Play Console's
 * UI lags by a few minutes after a successful API call.
 */
async function verifySubscriptionRegions(packageName: string, productId: string): Promise<void> {
  const result = await apiRequest<{
    basePlans?: Array<{
      basePlanId: string;
      regionalConfigs?: Array<{ regionCode: string; newSubscriberAvailability?: boolean }>;
      otherRegionsConfig?: { newSubscriberAvailability?: boolean };
    }>;
  }>({
    method: 'GET',
    path: `/applications/${encodeURIComponent(packageName)}/subscriptions/${encodeURIComponent(productId)}`,
    label: `Verifying subscription ${productId}`,
    allowFailure: true,
  });
  if (!result.ok || !result.data?.basePlans) return;
  for (const bp of result.data.basePlans) {
    const total = bp.regionalConfigs?.length ?? 0;
    const available = bp.regionalConfigs?.filter((c) => c.newSubscriberAvailability !== false).length ?? 0;
    const other = bp.otherRegionsConfig ? ` + otherRegions(${bp.otherRegionsConfig.newSubscriberAvailability ? 'available' : 'unavailable'})` : '';
    logger.info(`  Stored on Google: ${productId}/${bp.basePlanId} → ${available}/${total} regions available${other}`);
  }
}

/**
 * GET an existing one-time product and log how many regions are configured per
 * purchase option, plus how many are flagged AVAILABLE.
 */
async function verifyOneTimeProductRegions(packageName: string, sku: string): Promise<void> {
  const result = await apiRequest<{
    purchaseOptions?: Array<{
      purchaseOptionId?: string;
      state?: string;
      regionalPricingAndAvailabilityConfigs?: Array<{ regionCode: string; availability?: string }>;
    }>;
  }>({
    method: 'GET',
    path: `/applications/${encodeURIComponent(packageName)}/oneTimeProducts/${encodeURIComponent(sku)}`,
    label: `Verifying one-time product ${sku}`,
    allowFailure: true,
  });
  if (!result.ok || !result.data?.purchaseOptions) return;
  for (const po of result.data.purchaseOptions) {
    const total = po.regionalPricingAndAvailabilityConfigs?.length ?? 0;
    const available = po.regionalPricingAndAvailabilityConfigs?.filter((c) => c.availability === 'AVAILABLE').length ?? 0;
    const state = po.state ? ` state=${po.state}` : '';
    logger.info(`  Stored on Google: ${sku}/${po.purchaseOptionId ?? '?'} → ${available}/${total} regions AVAILABLE${state}`);
  }
}

// ── One-time in-app products (new monetization API) ─────────────────
//
// Legacy `/applications/{pkg}/inappproducts` returns 403 for migrated apps.
// We use the `monetization.onetimeproducts.*` family:
//
//   LIST:   GET    /applications/{pkg}/oneTimeProducts          (camelCase)
//   GET:    GET    /applications/{pkg}/oneTimeProducts/{id}     (camelCase)
//   CREATE: PATCH  /applications/{pkg}/onetimeproducts/{id}     (LOWERCASE) ⚠️
//                    ?allowMissing=true&regionsVersion.version=2022/02
//   DELETE: DELETE /applications/{pkg}/oneTimeProducts/{id}     (camelCase)
//
// CASING QUIRK: the PATCH path is lowercase while list/get/delete are
// camelCase. Verified against the v3 discovery doc. Creation uses the
// AIP-134 "patch with allow_missing" upsert pattern.

interface PlayListOneTimeProductsResponse {
  oneTimeProducts?: Array<{ productId: string; packageName: string }>;
  nextPageToken?: string;
}

export async function listInAppProducts(packageName: string): Promise<Set<string>> {
  const existing = new Set<string>();
  let pageToken: string | undefined;
  do {
    const result = await apiRequest<PlayListOneTimeProductsResponse>({
      method: 'GET',
      path: `/applications/${encodeURIComponent(packageName)}/oneTimeProducts`,
      query: pageToken ? { pageToken } : undefined,
      label: 'Looking up existing one-time products',
      allowFailure: true,
    });
    if (!result.ok) return existing;
    for (const p of result.data?.oneTimeProducts ?? []) {
      existing.add(p.productId);
    }
    pageToken = result.data?.nextPageToken;
  } while (pageToken);
  return existing;
}

export async function setupInAppProducts(
  packageName: string,
  products: GooglePlayInAppProduct[],
  options: { recreateStuck?: boolean } = {},
): Promise<void> {
  if (products.length === 0) {
    logger.info('No one-time in-app products configured, skipping.');
    return;
  }

  const existing = await listInAppProducts(packageName);

  for (const product of products) {
    let existingState: ExistingOneTimeProductState | undefined;
    if (existing.has(product.sku)) {
      existingState = await fetchExistingOneTimeProductState(packageName, product.sku);
      const stuckRegions = [...(existingState?.regionalConfigs.keys() ?? [])].filter((r) =>
        NEVER_BILLABLE_AT_2022_02.has(r),
      );
      if (stuckRegions.length > 0 && options.recreateStuck) {
        // User opted in via --recreate-stuck. Delete the product so the PATCH
        // below creates it fresh, free of legacy region baggage.
        logger.warn(`Product "${product.sku}" has unfixable regions (${stuckRegions.join(', ')}). --recreate-stuck is set → deleting and recreating.`);
        await deleteOneTimeProduct(packageName, product.sku);
        existingState = undefined;
      } else {
        const existingRegions = existingState?.regionalConfigs.size ?? 0;
        logger.info(`One-time product "${product.sku}" exists — patching regional pricing (purchaseOption="${existingState?.purchaseOptionId ?? 'default'}", ${existingRegions} existing region${existingRegions === 1 ? '' : 's'}).`);
      }
    }
    await createInAppProduct(packageName, product, existingState);
  }
  printRegionAvailabilityHint();
  printStuckProductsHint(options.recreateStuck === true);
}

/**
 * DELETE a one-time product. Used when --recreate-stuck is set and the product
 * has regions that cannot coexist with regionsVersion 2022/02.
 *
 * IMPORTANT — Google soft-deletes one-time products: the productId remains
 * "in use" for a few minutes to a few hours after deletion. A subsequent
 * CREATE with the same ID returns HTTP 400 "Product ID already in use".
 * Callers must handle the soft-delete window (retry-with-backoff or have the
 * user wait) — this helper just issues the DELETE.
 */
async function deleteOneTimeProduct(packageName: string, sku: string): Promise<void> {
  await apiRequest({
    method: 'DELETE',
    path: `/applications/${encodeURIComponent(packageName)}/oneTimeProducts/${encodeURIComponent(sku)}`,
    label: `Deleting stuck one-time product ${sku}`,
    allowFailure: true,
  });
  logger.warn(`Deleted ${sku}. Google soft-deletes — the productId remains reserved for a few minutes to a few hours.`);
  logger.warn(`If the recreate below fails with "Product ID already in use", wait 30+ min and re-run \`kappmaker gpc iap push\` (without --recreate-stuck).`);
}

/**
 * Print a one-time summary at the end of `gpc iap push` / `gpc subscriptions push`
 * listing any products that hit the 2022/02 never-billable deadlock. Tells the
 * user how to recover (delete on Play Console UI or use --recreate-stuck).
 */
let stuckHintPrinted = false;
function printStuckProductsHint(recreateStuckWasOn: boolean): void {
  if (stuckHintPrinted) return;
  if (stuckOneTimeProducts.size === 0 && stuckSubscriptions.size === 0) return;
  stuckHintPrinted = true;
  logger.info('');
  logger.warn(`${stuckOneTimeProducts.size + stuckSubscriptions.size} product(s) could not be updated due to regions removed from Google's 2022/02 catalog:`);
  for (const sku of stuckOneTimeProducts) logger.warn(`  • one-time product: ${sku}`);
  for (const id of stuckSubscriptions) logger.warn(`  • subscription: ${id}`);
  if (recreateStuckWasOn) {
    logger.info('--recreate-stuck deleted the product(s). Google holds the productId in a soft-delete reservation window for a few minutes to a few hours.');
    logger.info('Re-run `kappmaker gpc iap push` (WITHOUT --recreate-stuck) after waiting — the products will then be created fresh with full PPP fan-out.');
  } else {
    logger.info('Fix options (in order of safety):');
    logger.info('  1. RECOMMENDED — bump the product_id in your config (e.g. credit_pack_X_Y_Z → credit_pack_X_Y_Z_v2). Old product stays as-is; new product gets full PPP fan-out. No data loss, no waiting period.');
    logger.info('  2. Use `--recreate-stuck` to DELETE the stuck product(s) and let the CLI recreate them. WARNING: Google soft-deletes — the productId is locked for a few minutes to a few hours after deletion, during which time CREATE returns "Product ID already in use". Plan downtime.');
    logger.info('  3. Manually delete on Play Console UI and re-run after Google releases the ID.');
  }
}

/**
 * Snapshot of an existing one-time product's purchase option, used to preserve
 * the purchaseOptionId (legacy "buy" vs KAppMaker "default") and to echo
 * previously-stored regional pricing entries back on PATCH. Without the echo,
 * Google rejects with "Regional configs were removed from the purchase option:
 * X, Y, Z".
 */
interface ExistingOneTimeProductState {
  purchaseOptionId?: string;
  /** regionCode → existing Money + availability state. */
  regionalConfigs: Map<string, { price?: Money; availability?: string }>;
}

/**
 * GET an existing one-time product to discover its current purchaseOptionId
 * AND its current regional pricing/availability. Caller merges the existing
 * regional list into the fresh PPP fan-out so no region is silently dropped.
 */
async function fetchExistingOneTimeProductState(
  packageName: string,
  sku: string,
): Promise<ExistingOneTimeProductState | undefined> {
  const result = await apiRequest<{
    purchaseOptions?: Array<{
      purchaseOptionId?: string;
      regionalPricingAndAvailabilityConfigs?: Array<{
        regionCode?: string;
        price?: Partial<Money>;
        availability?: string;
      }>;
    }>;
  }>({
    method: 'GET',
    // Note: GET uses camelCase `oneTimeProducts` (PATCH uses lowercase `onetimeproducts`).
    path: `/applications/${encodeURIComponent(packageName)}/oneTimeProducts/${encodeURIComponent(sku)}`,
    label: `Reading existing purchase option for ${sku}`,
    allowFailure: true,
  });
  if (!result.ok) return undefined;
  const firstOption = result.data?.purchaseOptions?.[0];
  if (!firstOption) return undefined;
  const regionalConfigs = new Map<string, { price?: Money; availability?: string }>();
  for (const cfg of firstOption.regionalPricingAndAvailabilityConfigs ?? []) {
    if (!cfg.regionCode) continue;
    regionalConfigs.set(cfg.regionCode, {
      price: cfg.price ? normalizeMoney(cfg.price) : undefined,
      availability: cfg.availability,
    });
  }
  return {
    purchaseOptionId: firstOption.purchaseOptionId,
    regionalConfigs,
  };
}

async function createInAppProduct(
  packageName: string,
  product: GooglePlayInAppProduct,
  existingState?: ExistingOneTimeProductState,
): Promise<void> {
  const listings = product.listings.map((loc) => ({
    languageCode: loc.locale,
    title: loc.title,
    description: loc.description ?? '',
  }));

  const userPrices = [product.default_price, ...(product.prices ?? [])];
  const usdAnchor = userPrices.find((p) => p.currency_code === 'USD');
  const pppEnabled = product.ppp_enabled !== false;
  const existingPurchaseOptionId = existingState?.purchaseOptionId;
  const existingRegions = existingState?.regionalConfigs ?? new Map();

  const extraExclude = new Set<string>();
  /** Regions Google refuses to let us remove — re-inject with NO_LONGER_AVAILABLE. */
  const forceUnavailable = new Set<string>();
  let lastResult: { ok: boolean; error?: string } | null = null;

  for (let attempt = 0; attempt < ONE_TIME_PRODUCT_MAX_RETRIES; attempt++) {
    let allPrices: GooglePlayRegionalPrice[] = userPrices.filter((p) => !extraExclude.has(p.region_code));
    if (pppEnabled && usdAnchor) {
      const userRegions = new Set(userPrices.map((p) => p.region_code));
      const expanded = await expandPlayRegionsLocal(packageName, usdAnchor.price, userRegions, true, extraExclude);
      allPrices = [...expanded, ...allPrices];
      if (attempt === 0) {
        logPppFanOut(`one-time product ${product.sku}`, usdAnchor.price, expanded.length, allPrices.length - expanded.length);
      }
    } else if (pppEnabled && !usdAnchor && attempt === 0) {
      logger.warn(`No USD anchor in default_price/prices for "${product.sku}" — falling back to user-listed regions only.`);
    }

    // Dedupe by region — last wins, so user entries override PPP entries.
    const byRegion = new Map<string, GooglePlayRegionalPrice>();
    for (const p of allPrices) byRegion.set(p.region_code, p);

    const regionalPricingAndAvailabilityConfigs: Array<{
      regionCode: string;
      price?: Money;
      availability: string;
    }> = Array.from(byRegion.values()).map((p) => ({
      regionCode: p.region_code,
      price: priceToMoney(p.price, p.currency_code),
      availability: 'AVAILABLE',
    }));

    // Echo previously-stored regions that the fresh fan-out doesn't cover.
    // Skip drift regions: their legacy currency would conflict with 2022/02
    // (the fresh fan-out re-adds them with the correct currency anyway).
    const freshRegions = new Set(byRegion.keys());
    const sessionDriftSet = getSessionDrift(packageName);
    let echoedCount = 0;
    let skippedDriftCount = 0;
    for (const [region, cfg] of existingRegions.entries()) {
      if (freshRegions.has(region)) continue; // fresh fan-out wins for overlap
      if (!cfg.price) continue;
      const isDrift =
        KNOWN_2022_02_DRIFT_REGIONS.has(region) ||
        sessionDriftSet.has(region) ||
        extraExclude.has(region);
      if (isDrift) {
        skippedDriftCount++;
        continue;
      }
      regionalPricingAndAvailabilityConfigs.push({
        regionCode: region,
        price: normalizeMoney(cfg.price),
        availability: cfg.availability ?? 'AVAILABLE',
      });
      echoedCount++;
    }
    if (echoedCount > 0 && attempt === 0) {
      logger.info(`Echoed ${echoedCount} previously-stored region${echoedCount === 1 ? '' : 's'} on ${product.sku} (Google rejects PATCH bodies that drop existing regions).`);
    }
    if (skippedDriftCount > 0 && attempt === 0) {
      logger.warn(`Dropped ${skippedDriftCount} drift region${skippedDriftCount === 1 ? '' : 's'} from ${product.sku}'s existing config — their stored currency no longer matches regionsVersion 2022/02. If Google rejects the removal we'll retry marking them NO_LONGER_AVAILABLE.`);
    }

    // Re-inject `forceUnavailable` regions with availability=NO_LONGER_AVAILABLE
    // and a nominal 0.99 price in the 2022/02-expected currency. NEVER_BILLABLE
    // regions (MN) can't be re-injected at all — surface as stuck.
    let forceUnavailableInjected = 0;
    let neverBillableSkipped: string[] = [];
    type RpaConfig = { regionCode: string; price?: Money; availability: string };
    const rpa = regionalPricingAndAvailabilityConfigs as RpaConfig[];
    for (const region of forceUnavailable) {
      if (NEVER_BILLABLE_AT_2022_02.has(region)) {
        neverBillableSkipped.push(region);
        continue;
      }
      const expectedCurrency = EXPECTED_2022_02_CURRENCY[region] ?? 'USD';
      const nominalPrice: Money = {
        currencyCode: expectedCurrency,
        units: '0',
        nanos: 990000000, // 0.99 in any currency — Google accepts this for NO_LONGER_AVAILABLE
      };
      const idx = rpa.findIndex((c) => c.regionCode === region);
      const entry: RpaConfig = {
        regionCode: region,
        price: nominalPrice,
        availability: 'NO_LONGER_AVAILABLE',
      };
      if (idx >= 0) rpa[idx] = entry;
      else rpa.push(entry);
      forceUnavailableInjected++;
    }
    if (forceUnavailableInjected > 0) {
      logger.info(`Re-injected ${forceUnavailableInjected} region${forceUnavailableInjected === 1 ? '' : 's'} on ${product.sku} as NO_LONGER_AVAILABLE with expected 2022/02 currency.`);
    }
    if (neverBillableSkipped.length > 0) {
      stuckOneTimeProducts.add(product.sku);
      logger.warn(`Cannot fix ${neverBillableSkipped.join(', ')} on ${product.sku} — these regions were removed from Google's 2022/02 billable catalog entirely. The product is "stuck": Google refuses to remove them AND refuses to keep them. Skipping this product.`);
    }

    const purchaseOption: Record<string, unknown> = {
      // Preserve the legacy purchaseOptionId on existing products (Google rejects
      // PATCHes that miss any existing option). New products land on "default".
      purchaseOptionId: existingPurchaseOptionId ?? 'default',
      buyOption: { legacyCompatible: true },
      regionalPricingAndAvailabilityConfigs,
    };

    // Always set newRegionsConfig.availability=AVAILABLE when there's a USD
    // anchor — Play Console surfaces this as "New countries/regions" and it
    // controls auto-pricing for any region Google adds in the future. For
    // ppp_enabled=false it also auto-fans-out the CURRENT regions the user
    // didn't list (mirrors `otherRegionsConfig` on subscriptions).
    const newRegionsAnchors = deriveAnchorPrices(userPrices);
    if (newRegionsAnchors) {
      purchaseOption.newRegionsConfig = {
        availability: 'AVAILABLE',
        usdPrice: newRegionsAnchors.usdPrice,
        eurPrice: newRegionsAnchors.eurPrice,
      };
      if (attempt === 0 && !pppEnabled) {
        logger.info(`One-time product "${product.sku}": ppp_enabled=false → Google auto-fan-out via newRegionsConfig (USD ${usdAnchor?.price} anchor).`);
      }
    } else if (attempt === 0 && !pppEnabled) {
      logger.warn(`One-time product "${product.sku}": ppp_enabled=false but no USD anchor — pricing will be limited to user-listed regions only.`);
    }

    const body: Record<string, unknown> = {
      packageName,
      productId: product.sku,
      listings,
      purchaseOptions: [purchaseOption],
    };

    // CASING QUIRK: patch path is lowercase `onetimeproducts`; list/get use
    // camelCase `oneTimeProducts` (verified against the v3 discovery doc).
    const result = await apiRequest({
      method: 'PATCH',
      path: `/applications/${encodeURIComponent(packageName)}/onetimeproducts/${encodeURIComponent(product.sku)}`,
      query: {
        allowMissing: 'true',
        'regionsVersion.version': REGIONS_VERSION,
        updateMask: 'listings,purchaseOptions',
      },
      body,
      label: attempt === 0
        ? `Creating one-time product: ${product.sku}`
        : `Retrying one-time product ${product.sku} (drop ${extraExclude.size}, force-unavailable ${forceUnavailable.size})`,
      allowFailure: true,
    });
    lastResult = result;
    if (handleOneTimeProductRetry(result, product.sku, packageName, extraExclude, forceUnavailable)) break;
  }

  if (!lastResult?.ok) {
    logger.warn(`Could not create one-time product ${product.sku}.`);
    return;
  }
  if (extraExclude.size > 0) {
    logger.success(`One-time product ${product.sku} updated (dropped ${extraExclude.size} drift region${extraExclude.size === 1 ? '' : 's'}: ${[...extraExclude].join(', ')}).`);
  }

  // New purchase options land in DRAFT state — activate so buyers can see it.
  // Use the same purchaseOptionId we just patched (preserves legacy "buy" ID).
  await activatePurchaseOption(packageName, product.sku, existingPurchaseOptionId ?? 'default');

  // Verify what's actually stored on Google — useful when Play Console UI still
  // looks like "USA only" but our PATCH succeeded (UI lag vs. real state).
  await verifyOneTimeProductRegions(packageName, product.sku);
}

async function activatePurchaseOption(
  packageName: string,
  productId: string,
  purchaseOptionId: string,
): Promise<void> {
  await apiRequest({
    method: 'POST',
    path: `/applications/${encodeURIComponent(packageName)}/oneTimeProducts/${encodeURIComponent(productId)}/purchaseOptions:batchUpdateStates`,
    body: {
      requests: [
        {
          activatePurchaseOptionRequest: {
            packageName,
            productId,
            purchaseOptionId,
            latencyTolerance: 'PRODUCT_UPDATE_LATENCY_TOLERANCE_LATENCY_SENSITIVE',
          },
        },
      ],
    },
    label: `Activating purchase option ${productId}/${purchaseOptionId}`,
    allowFailure: true,
  });
}
