export interface AppStoreConfig {
  app: AppStoreAppConfig;
  version: AppStoreVersionConfig;
  categories: AppStoreCategoriesConfig;
  localizations: AppStoreLocalization[];
  privacy: AppStorePrivacyConfig;
  age_rating: AppStoreAgeRatingConfig;
  pricing: AppStorePricingConfig;
  subscriptions: AppStoreSubscriptionsConfig;
  in_app_purchases: AppStoreInAppPurchase[];
  encryption: AppStoreEncryptionConfig;
  review_info: AppStoreReviewInfoConfig;
}

export interface AppStoreAppConfig {
  id: string;
  name: string;
  bundle_id: string;
  sku: string;
  platform: string;
  primary_locale: string;
  content_rights: string;
}

export interface AppStoreVersionConfig {
  version_string: string;
  copyright: string;
  release_type: string;
}

export interface AppStoreCategoriesConfig {
  primary: string;
  primary_subcategory_one?: string;
  primary_subcategory_two?: string;
  secondary?: string;
  secondary_subcategory_one?: string;
  secondary_subcategory_two?: string;
}

export interface AppStoreLocalization {
  locale: string;
  subtitle?: string;
  description?: string;
  keywords?: string;
  whats_new?: string;
  promotional_text?: string;
  support_url?: string;
  marketing_url?: string;
  privacy_policy_url?: string;
}

export interface AppStorePrivacyConfig {
  enabled: boolean;
  publish: boolean;
  allow_deletes: boolean;
  data_usages: AppStoreDataUsage[];
}

export interface AppStoreDataUsage {
  category: string;
  purposes?: string[];
  dataProtections: string[];
}

export interface AppStoreAgeRatingConfig {
  alcohol_tobacco_or_drug_use_or_references?: string;
  contests?: string;
  gambling_simulated?: string;
  guns_or_other_weapons?: string;
  medical_or_treatment_information?: string;
  profanity_or_crude_humor?: string;
  sexual_content_graphic_and_nudity?: string;
  sexual_content_or_nudity?: string;
  horror_or_fear_themes?: string;
  mature_or_suggestive_themes?: string;
  violence_cartoon_or_fantasy?: string;
  violence_realistic?: string;
  violence_realistic_prolonged_graphic_or_sadistic?: string;
  advertising?: boolean;
  age_assurance?: boolean;
  gambling?: boolean;
  health_or_wellness_topics?: boolean;
  loot_box?: boolean;
  messaging_and_chat?: boolean;
  parental_controls?: boolean;
  unrestricted_web_access?: boolean;
  user_generated_content?: boolean;
}

export interface AppStorePricingConfig {
  base_territory: string;
  price_tier: string;
  price: string;
  availability: AppStoreAvailability;
}

export interface AppStoreAvailability {
  available_in_new_territories: boolean;
  include_all: boolean;
  territories: string[];
}

export interface AppStoreSubscriptionsConfig {
  availability?: AppStoreAvailability;
  groups: AppStoreSubscriptionGroup[];
}

export interface AppStoreSubscriptionGroup {
  reference_name: string;
  localizations?: AppStoreSubscriptionGroupLocalization[];
  subscriptions: AppStoreSubscription[];
}

export interface AppStoreSubscriptionGroupLocalization {
  locale: string;
  name: string;
  custom_app_name?: string;
}

export interface AppStoreSubscription {
  ref_name: string;
  product_id: string;
  subscription_period: string;
  family_sharable: boolean;
  prices: AppStoreSubscriptionPrice[];
  localizations: AppStoreSubscriptionLocalization[];
}

export interface AppStoreSubscriptionPrice {
  territory: string;
  price?: string;
  tier?: string;
}

export interface AppStoreSubscriptionLocalization {
  locale: string;
  name: string;
  description: string;
}

export interface AppStoreInAppPurchase {
  type: string;
  ref_name: string;
  product_id: string;
  family_sharable: boolean;
  prices: AppStoreSubscriptionPrice[];
  localizations: AppStoreSubscriptionLocalization[];
}

export interface AppStoreEncryptionConfig {
  contains_proprietary_cryptography: boolean;
  contains_third_party_cryptography: boolean;
  available_on_french_store: boolean;
  description: string;
}

export interface AppStoreReviewInfoConfig {
  contact_first_name: string;
  contact_last_name: string;
  contact_phone: string;
  contact_email: string;
  demo_username?: string;
  demo_password?: string;
  notes?: string;
}

export interface CreateAppStoreOptions {
  config?: string;
}
