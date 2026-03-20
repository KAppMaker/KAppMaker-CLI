export interface AdaptyConfig {
  app: AdaptyAppConfig;
  access_level: AdaptyAccessLevel;
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
