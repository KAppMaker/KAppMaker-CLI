export interface RevenueCatConfig {
  /** RevenueCat project ID (proj…). Auto-resolved when the API key can see exactly one project. */
  project_id: string;
  app: RevenueCatAppConfig;
  entitlements: RevenueCatEntitlement[];
  products: RevenueCatProduct[];
  offerings: RevenueCatOfferingConfig[];
}

export interface RevenueCatAppConfig {
  title: string;
  bundle_id: string;
  package_id: string;
  /** RevenueCat app IDs, filled in after setup so re-runs skip the lookup. */
  ios_app_id?: string;
  android_app_id?: string;
}

export interface RevenueCatEntitlement {
  /** Stable key the mobile SDK checks, e.g. "premium". */
  lookup_key: string;
  display_name: string;
  entitlement_id?: string;
}

export interface RevenueCatProduct {
  title: string;
  /** kappmaker period slug (weekly/monthly/…) or "consumable" for credit packs. */
  period: string;
  price: string;
  ios_product_id: string;
  android_product_id: string;
  /** Play base plan — RevenueCat identifies Play subscriptions as "productId:basePlanId". Empty for one-time products. */
  android_base_plan_id: string;
  /** Entitlement this product unlocks. Defaults to the first entitlement when omitted. */
  entitlement_lookup_key?: string;
  /** Marks a credit pack; triggers the shared credit_pack_… product ID generation. */
  credits?: number;
  /** RevenueCat product IDs, filled in after setup. */
  rc_ios_product_id?: string;
  rc_android_product_id?: string;
}

export interface RevenueCatOfferingConfig {
  /** Offering identifier the SDK fetches, e.g. "default" or "credits_pack". */
  identifier: string;
  display_name: string;
  /** Titles of products (from `products`) to expose as packages in this offering. */
  product_titles: string[];
  offering_id?: string;
}

export interface CreateRevenueCatOptions {
  config?: string;
  /** Project-scoped v2 secret key; saved into the per-app key map on success. */
  apiKey?: string;
}
