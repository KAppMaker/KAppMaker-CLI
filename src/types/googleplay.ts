export interface GooglePlayConfig {
  app: GooglePlayAppConfig;
  details: GooglePlayAppDetails;
  listings: GooglePlayListing[];
  data_safety?: GooglePlayDataSafetyForm;
  subscriptions: GooglePlaySubscription[];
  in_app_products: GooglePlayInAppProduct[];
}

export interface GooglePlayAppConfig {
  /** Android package name (= iOS bundle_id, e.g. com.example.myapp) */
  package_name: string;
  /** Display name shown in Play Console (for logging only; Play stores the per-locale title) */
  name: string;
  /** Default store listing language, e.g. "en-US" */
  default_language: string;
}

export interface GooglePlayAppDetails {
  contact_website?: string;
  contact_email?: string;
  contact_phone?: string;
}

export interface GooglePlayListing {
  /** BCP-47 locale code used by Play, e.g. "en-US" */
  locale: string;
  /** Max 30 chars */
  title?: string;
  /** Max 80 chars */
  short_description?: string;
  /** Max 4000 chars */
  full_description?: string;
  /** YouTube URL */
  video?: string;
}

/**
 * Raw pass-through to POST /applications/{pkg}/dataSafety. Google has changed
 * the safety-labels schema several times, so we don't re-encode it — whatever
 * the user provides is sent verbatim and validated server-side.
 */
export type GooglePlayDataSafetyForm = Record<string, unknown>;

export interface GooglePlaySubscription {
  /** Product ID (e.g. "myapp.premium.weekly.v1.699.v1") — must match Adapty android_product_id */
  product_id: string;
  /** Localized subscription name/description shown in Play Store */
  listings: GooglePlaySubscriptionListing[];
  base_plans: GooglePlayBasePlan[];
}

export interface GooglePlaySubscriptionListing {
  locale: string;
  title: string;
  description?: string;
  benefits?: string[];
}

export interface GooglePlayBasePlan {
  /** Short period-based ID like "weekly", "monthly", "yearly" — matches Adapty android_base_plan_id */
  base_plan_id: string;
  /** ISO 8601 duration: P1W, P1M, P3M, P6M, P1Y */
  billing_period: string;
  /** Grace period in ISO 8601, e.g. "P3D". Optional. */
  grace_period?: string;
  /** Whether the base plan is available to new subscribers */
  available_to_new_subscribers?: boolean;
  /** Regional pricing. First entry is treated as the base price. */
  regional_configs: GooglePlayRegionalPrice[];
}

export interface GooglePlayRegionalPrice {
  /** ISO 3166-1 alpha-2 region code, e.g. "US" */
  region_code: string;
  /** Human-readable price like "6.99" */
  price: string;
  /** ISO 4217 currency code, e.g. "USD" */
  currency_code: string;
}

export interface GooglePlayInAppProduct {
  /** SKU / productId in Play Console */
  sku: string;
  /** "managed" for consumable / non-consumable */
  purchase_type?: 'managed';
  default_language: string;
  listings: GooglePlayInAppProductListing[];
  /** Base price for default region */
  default_price: GooglePlayRegionalPrice;
  /** Optional regional overrides */
  prices?: GooglePlayRegionalPrice[];
}

export interface GooglePlayInAppProductListing {
  locale: string;
  title: string;
  description?: string;
}

export interface CreatePlayAppOptions {
  config?: string;
}
