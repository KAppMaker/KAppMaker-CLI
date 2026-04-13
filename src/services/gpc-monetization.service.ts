import { logger } from '../utils/logger.js';
import { apiRequest } from './gpc.service.js';
import type {
  GooglePlaySubscription,
  GooglePlayBasePlan,
  GooglePlayRegionalPrice,
  GooglePlayInAppProduct,
} from '../types/googleplay.js';

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
export function priceToMoney(price: string, currencyCode: string): Money {
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

function buildRegionalConfigs(prices: GooglePlayRegionalPrice[]): Record<string, { newSubscriberAvailability: boolean; price: Money }> {
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
      logger.info(`Subscription "${sub.product_id}" already exists, skipping create.`);
      // Still (best-effort) try to activate any base plans that aren't active.
      for (const basePlan of sub.base_plans) {
        await activateBasePlan(packageName, sub.product_id, basePlan.base_plan_id);
      }
      continue;
    }
    await createSubscriptionWithBasePlans(packageName, sub, playDefaultLanguage);
  }
}

// Google Play's new monetization API ties pricing regions to a "regionsVersion"
// — bump this constant if Google publishes a newer region catalog.
const REGIONS_VERSION = '2022/02';

async function createSubscriptionWithBasePlans(
  packageName: string,
  sub: GooglePlaySubscription,
  playDefaultLanguage: string,
): Promise<void> {
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

  // Create subscription + base plans in a single call. The new monetization API
  // requires productId and regionsVersion.version as QUERY PARAMETERS (not body)
  // — passing productId in the body triggers "Product ID must be specified".
  const body: Record<string, unknown> = {
    packageName,
    productId: sub.product_id,
    listings: listings.map((l) => ({
      languageCode: l.locale,
      title: l.title,
      description: l.description ?? '',
      benefits: l.benefits ?? [],
    })),
    basePlans: sub.base_plans.map((bp) => buildBasePlanBody(bp)),
  };

  const result = await apiRequest({
    method: 'POST',
    path: `/applications/${encodeURIComponent(packageName)}/subscriptions`,
    query: {
      productId: sub.product_id,
      'regionsVersion.version': REGIONS_VERSION,
    },
    body,
    label: `Creating subscription: ${sub.product_id}`,
    allowFailure: true,
  });

  if (!result.ok) {
    logger.warn(`Could not create subscription ${sub.product_id}. Skipping its base plans.`);
    return;
  }

  // 2. Activate each base plan so it's available to buyers
  for (const basePlan of sub.base_plans) {
    await activateBasePlan(packageName, sub.product_id, basePlan.base_plan_id);
  }
}

function buildBasePlanBody(basePlan: GooglePlayBasePlan): Record<string, unknown> {
  const body: Record<string, unknown> = {
    basePlanId: basePlan.base_plan_id,
    state: 'DRAFT', // activated in a separate call
    autoRenewingBasePlanType: {
      billingPeriodDuration: basePlan.billing_period,
      resubscribeState: 'RESUBSCRIBE_STATE_ACTIVE',
      ...(basePlan.grace_period ? { gracePeriodDuration: basePlan.grace_period } : {}),
    },
    regionalConfigs: Object.entries(buildRegionalConfigs(basePlan.regional_configs)).map(
      ([region, cfg]) => ({
        regionCode: region,
        newSubscriberAvailability: cfg.newSubscriberAvailability,
        price: cfg.price,
      }),
    ),
  };
  return body;
}

export async function activateBasePlan(
  packageName: string,
  productId: string,
  basePlanId: string,
): Promise<void> {
  await apiRequest({
    method: 'POST',
    path: `/applications/${encodeURIComponent(packageName)}/subscriptions/${encodeURIComponent(productId)}/basePlans/${encodeURIComponent(basePlanId)}:activate`,
    body: {},
    label: `Activating base plan ${productId}/${basePlanId}`,
    allowFailure: true,
  });
}

// ── One-time in-app products (new monetization API) ─────────────────
//
// The legacy `/applications/{pkg}/inappproducts` endpoint returns 403
// "Please migrate to the new publishing API" for apps that have been
// migrated to the new monetization model (most apps now). We use the
// `monetization.onetimeproducts.*` family instead:
//
//   LIST:   GET    /applications/{pkg}/oneTimeProducts
//   GET:    GET    /applications/{pkg}/oneTimeProducts/{productId}
//   CREATE: PATCH  /applications/{pkg}/onetimeproducts/{productId}?allowMissing=true&regionsVersion.version=2022/02
//   DELETE: DELETE /applications/{pkg}/oneTimeProducts/{productId}
//
// Note the CASING QUIRK: list/get/delete use `/oneTimeProducts` (camelCase)
// but patch uses `/onetimeproducts` (all lowercase). This is verified
// against Google's v3 discovery document and is a known Google API quirk.
//
// Creation uses the AIP-134 "patch with allow_missing" pattern: if the
// product does not yet exist, allowMissing=true tells Play to create it
// from scratch; if it exists, the patch updates it.

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
): Promise<void> {
  if (products.length === 0) {
    logger.info('No one-time in-app products configured, skipping.');
    return;
  }

  const existing = await listInAppProducts(packageName);

  for (const product of products) {
    if (existing.has(product.sku)) {
      logger.info(`One-time product "${product.sku}" already exists, skipping.`);
      continue;
    }
    await createInAppProduct(packageName, product);
  }
}

async function createInAppProduct(
  packageName: string,
  product: GooglePlayInAppProduct,
): Promise<void> {
  const listings = product.listings.map((loc) => ({
    languageCode: loc.locale,
    title: loc.title,
    description: loc.description ?? '',
  }));

  // Build one purchase option with regional pricing from the config.
  // We default to a single "default" purchase option covering the base price
  // and any per-region overrides the user supplied.
  const allPrices = [product.default_price, ...(product.prices ?? [])];
  // Dedupe by region — if the user listed the same region twice, last wins.
  const byRegion = new Map<string, GooglePlayInAppProduct['default_price']>();
  for (const p of allPrices) byRegion.set(p.region_code, p);

  const regionalPricingAndAvailabilityConfigs = Array.from(byRegion.values()).map((p) => ({
    regionCode: p.region_code,
    price: priceToMoney(p.price, p.currency_code),
    availability: 'AVAILABLE',
  }));

  const body: Record<string, unknown> = {
    packageName,
    productId: product.sku,
    listings,
    purchaseOptions: [
      {
        purchaseOptionId: 'default',
        buyOption: { legacyCompatible: true },
        regionalPricingAndAvailabilityConfigs,
      },
    ],
  };

  // Note: patch path is lowercase `onetimeproducts` even though list/get use
  // camelCase `oneTimeProducts`. Matches Google's v3 discovery document.
  const result = await apiRequest({
    method: 'PATCH',
    path: `/applications/${encodeURIComponent(packageName)}/onetimeproducts/${encodeURIComponent(product.sku)}`,
    query: {
      allowMissing: 'true',
      'regionsVersion.version': REGIONS_VERSION,
      updateMask: 'listings,purchaseOptions',
    },
    body,
    label: `Creating one-time product: ${product.sku}`,
    allowFailure: true,
  });

  if (!result.ok) {
    logger.warn(`Could not create one-time product ${product.sku}.`);
    return;
  }

  // New purchase options land in DRAFT state — activate so buyers can see it.
  await activatePurchaseOption(packageName, product.sku, 'default');
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
