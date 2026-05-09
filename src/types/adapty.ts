export interface AdaptyConfig {
  app: AdaptyAppConfig;
  /** Multiple access levels. The legacy single `access_level` field is auto-migrated to a one-element array. */
  access_levels: AdaptyAccessLevel[];
  /** @deprecated Replaced by `access_levels`. Kept for backward compatibility — auto-migrated on load. */
  access_level?: AdaptyAccessLevel;
  products: AdaptyProduct[];
  paywalls: AdaptyPaywallConfig[];
  placements: AdaptyPlacementConfig[];
}

export interface AdaptyAppConfig {
  title: string;
  bundle_id: string;
  package_id: string;
  app_id: string;
}

export interface AdaptyAccessLevel {
  sdk_id: string;
  title: string;
}

export interface AdaptyProduct {
  title: string;
  period: string;
  price: string;
  ios_product_id: string;
  android_product_id: string;
  android_base_plan_id: string;
  adapty_product_id?: string;
  /** SDK ID of the access level this product unlocks. Defaults to the first entry of `access_levels` when omitted. */
  access_level_sdk_id?: string;
  /** When set, marks this entry as a credit pack and triggers ios/android product_id auto-generation as `credit_pack_{credits}_{priceDigits}_{appname}`. android_base_plan_id is left empty (IAPs have no base plan); period is forced to "consumable" and the product is routed via the Adapty REST API since the CLI doesn't accept that period value. */
  credits?: number;
}

export interface AdaptyPaywallConfig {
  title: string;
  product_titles: string[];
  paywall_id?: string;
}

export interface AdaptyPlacementConfig {
  title: string;
  developer_id: string;
}

export interface CreateAdaptyOptions {
  config?: string;
}
