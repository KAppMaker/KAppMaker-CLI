import { priceDigits } from './credit-pack.defaults.js';

/**
 * Shared product-ID + period mapping used by `subscription add` / `iap add`
 * (and could be adopted by the existing `fill*Defaults()` paths in
 * create-appstore-app.ts / create-play-app.ts / adapty-setup.ts — currently
 * those keep their own inline maps for historical reasons).
 *
 * All IDs follow the alignment table in CLAUDE.md so a single product created
 * here lands on Play + ASC + Adapty with matching identifiers.
 */

export type SubscriptionPeriodSlug =
  | 'weekly'
  | 'monthly'
  | 'twomonths'
  | 'quarterly'
  | 'semiannual'
  | 'yearly';

export const SUBSCRIPTION_PERIODS: SubscriptionPeriodSlug[] = [
  'weekly', 'monthly', 'twomonths', 'quarterly', 'semiannual', 'yearly',
];

const ASC_PERIOD: Record<SubscriptionPeriodSlug, string> = {
  weekly: 'ONE_WEEK',
  monthly: 'ONE_MONTH',
  twomonths: 'TWO_MONTHS',
  quarterly: 'THREE_MONTHS',
  semiannual: 'SIX_MONTHS',
  yearly: 'ONE_YEAR',
};

const PLAY_BILLING_PERIOD: Record<SubscriptionPeriodSlug, string> = {
  weekly: 'P1W',
  monthly: 'P1M',
  twomonths: 'P2M',
  quarterly: 'P3M',
  semiannual: 'P6M',
  yearly: 'P1Y',
};

const ADAPTY_PERIOD: Record<SubscriptionPeriodSlug, string> = {
  weekly: 'weekly',
  monthly: 'monthly',
  twomonths: 'two_months',
  quarterly: 'trimonthly',
  semiannual: 'semiannual',
  yearly: 'annual',
};

const PERIOD_LABEL: Record<SubscriptionPeriodSlug, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  twomonths: 'Two Months',
  quarterly: 'Quarterly',
  semiannual: 'Semi Annual',
  yearly: 'Yearly',
};

const PERIOD_DESCRIPTION: Record<SubscriptionPeriodSlug, string> = {
  weekly: 'Full access for one week.',
  monthly: 'Full access for one month.',
  twomonths: 'Full access for two months.',
  quarterly: 'Full access for three months.',
  semiannual: 'Full access for six months.',
  yearly: 'Full access for one year.',
};

export function normalizeAppName(appName: string): string {
  return appName.toLowerCase().replace(/\s+/g, '');
}

export interface SubscriptionIds {
  /** {appname}.premium.{period}.v1.{priceDigits}.v1 */
  ascProductId: string;
  /** {AppName} Premium {PeriodLabel} v1 ({price}) */
  ascRefName: string;
  /** ASC API enum, e.g. ONE_WEEK */
  ascSubscriptionPeriod: string;
  /** {appname}.premium.{period}.v1 */
  playProductId: string;
  /** autorenew-{period}-{priceDigits}-v1 */
  playBasePlanId: string;
  /** ISO 8601, e.g. P1W */
  playBillingPeriod: string;
  /** {AppName} Premium {PeriodLabel} */
  playListingTitle: string;
  /** Adapty period value, e.g. weekly / two_months / trimonthly / annual */
  adaptyPeriod: string;
  /** Display label, e.g. Weekly / Two Months */
  periodLabel: string;
  /** Period-derived default description, e.g. "Full access for one week." */
  defaultDescription: string;
}

export function subscriptionIds(
  period: SubscriptionPeriodSlug,
  price: string,
  appName: string,
  version = 1,
): SubscriptionIds {
  const appNameLower = normalizeAppName(appName);
  const digits = priceDigits(price);
  const label = PERIOD_LABEL[period];
  const v = `v${version}`;

  return {
    ascProductId: `${appNameLower}.premium.${period}.${v}.${digits}.${v}`,
    ascRefName: `${appName} Premium ${label} ${v} (${price})`,
    ascSubscriptionPeriod: ASC_PERIOD[period],
    playProductId: `${appNameLower}.premium.${period}.${v}`,
    playBasePlanId: `autorenew-${period}-${digits}-${v}`,
    playBillingPeriod: PLAY_BILLING_PERIOD[period],
    playListingTitle: `${appName} Premium ${label}`,
    adaptyPeriod: ADAPTY_PERIOD[period],
    periodLabel: label,
    defaultDescription: PERIOD_DESCRIPTION[period],
  };
}

export function isSubscriptionPeriod(value: string): value is SubscriptionPeriodSlug {
  return (SUBSCRIPTION_PERIODS as string[]).includes(value);
}
