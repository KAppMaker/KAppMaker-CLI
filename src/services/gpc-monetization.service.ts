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
    await createSubscriptionWithBasePlans(packageName, sub);
  }
}

async function createSubscriptionWithBasePlans(
  packageName: string,
  sub: GooglePlaySubscription,
): Promise<void> {
  // 1. Create the subscription shell with localized listings and all base plans
  //    in a single call, then activate each base plan individually.
  const body: Record<string, unknown> = {
    packageName,
    productId: sub.product_id,
    listings: sub.listings.map((l) => ({
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

// ── In-app products (one-time) ───────────────────────────────────────

interface PlayListInAppProductsResponse {
  inappproduct?: Array<{ sku: string; packageName: string }>;
}

export async function listInAppProducts(packageName: string): Promise<Set<string>> {
  const result = await apiRequest<PlayListInAppProductsResponse>({
    method: 'GET',
    path: `/applications/${encodeURIComponent(packageName)}/inappproducts`,
    label: 'Looking up existing in-app products',
    allowFailure: true,
  });
  if (!result.ok || !result.data?.inappproduct) return new Set();
  return new Set(result.data.inappproduct.map((p) => p.sku));
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
      logger.info(`In-app product "${product.sku}" already exists, skipping.`);
      continue;
    }
    await createInAppProduct(packageName, product);
  }
}

async function createInAppProduct(
  packageName: string,
  product: GooglePlayInAppProduct,
): Promise<void> {
  const listings: Record<string, { title: string; description: string }> = {};
  for (const loc of product.listings) {
    listings[loc.locale] = {
      title: loc.title,
      description: loc.description ?? '',
    };
  }

  const prices: Record<string, { priceMicros: string; currency: string }> = {};
  const allPrices = [product.default_price, ...(product.prices ?? [])];
  for (const p of allPrices) {
    const money = priceToMoney(p.price, p.currency_code);
    // Legacy inappproducts endpoint uses priceMicros (string) and currency fields.
    const priceMicros = (BigInt(money.units) * 1_000_000n + BigInt(Math.round(money.nanos / 1000))).toString();
    prices[p.region_code] = { priceMicros, currency: p.currency_code };
  }

  const body: Record<string, unknown> = {
    packageName,
    sku: product.sku,
    status: 'active',
    purchaseType: product.purchase_type ?? 'managedUser',
    defaultLanguage: product.default_language,
    listings,
    defaultPrice: {
      priceMicros: (BigInt(priceToMoney(product.default_price.price, product.default_price.currency_code).units) * 1_000_000n + BigInt(Math.round(priceToMoney(product.default_price.price, product.default_price.currency_code).nanos / 1000))).toString(),
      currency: product.default_price.currency_code,
    },
    prices,
  };

  await apiRequest({
    method: 'POST',
    path: `/applications/${encodeURIComponent(packageName)}/inappproducts`,
    body,
    label: `Creating in-app product: ${product.sku}`,
    allowFailure: true,
  });
}
