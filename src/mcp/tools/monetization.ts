import { z } from 'zod';
import { cli, flags, type ToolDef } from '../define.js';

const price = z.string().regex(/^\d+\.\d{2}$/, 'a USD price with cents, e.g. "9.99"')
  .describe('USD price as text with cents, e.g. "9.99" (it is part of the product ID; other countries get purchasing-power-adjusted prices)');
const platform = z.enum(['all', 'ios', 'android']).default('all').describe('all = App Store + Google Play');
const provider = z.enum(['auto', 'adapty', 'revenuecat', 'both', 'none']).default('auto')
  .describe('Subscription provider to mirror into; auto = the ones whose Assets config exists');
const productVersion = z.number().int().min(1).default(1).describe('Product line version; 2+ creates a fresh line next to v1');
const overrides = {
  name: z.string().optional().describe('Localized display name'),
  description: z.string().optional().describe('Localized description'),
  review_screenshot: z.string().optional().describe('App Review screenshot path'),
  app_name: z.string().optional(),
  bundle_id: z.string().optional().describe('iOS bundle ID, when Assets/appstore-config.json does not exist yet'),
  package_name: z.string().optional().describe('Android package, when Assets/googleplay-config.json does not exist yet'),
};
const overrideFlags = (i: { name?: string; description?: string; review_screenshot?: string; app_name?: string; bundle_id?: string; package_name?: string }) => flags({
  '--name': i.name, '--description': i.description, '--review-screenshot': i.review_screenshot,
  '--app-name': i.app_name, '--bundle-id': i.bundle_id, '--package-name': i.package_name,
});

export const monetizationTools: ToolDef[] = [
  cli({
    name: 'subscription_add',
    title: 'Add one subscription on both stores',
    description:
      'Creates ONE new auto-renewing subscription on Google Play and App Store Connect with aligned product IDs ' +
      '(e.g. myapp.premium.weekly.v1.999.v1) and per-country prices, and mirrors it into Adapty/RevenueCat when configured. ' +
      'Does not edit local config files. Re-running with the same values only refreshes prices.',
    kind: 'long',
    network: true,
    shape: {
      period: z.enum(['weekly', 'monthly', 'twomonths', 'quarterly', 'semiannual', 'yearly']),
      price, platform, product_version: productVersion, provider,
      group: z.string().optional().describe('App Store subscription group reference (auto-created if missing)'),
      group_name: z.string().optional().describe('Display name for an auto-created group'),
      ...overrides,
    },
    commands: (i) => [['subscription', 'add', '--period', i.period, '--price', i.price,
      '--platform', i.platform, '--product-version', String(i.product_version), '--provider', i.provider,
      ...flags({ '--group': i.group, '--group-name': i.group_name }), ...overrideFlags(i)]],
    planNote: (i) => `Creates a live ${i.period} subscription at $${i.price} on ${i.platform === 'all' ? 'both stores' : i.platform === 'ios' ? 'App Store Connect' : 'Google Play'}.`,
  }),
  cli({
    name: 'iap_add',
    title: 'Add one credit-pack purchase',
    description:
      'Creates ONE consumable credit pack (one-time purchase) on Google Play and App Store Connect with the same product ID ' +
      'on both (credit_pack_<credits>_<price>_<app>), per-country prices, and the Adapty/RevenueCat mirror when configured.',
    kind: 'long',
    network: true,
    shape: { credits: z.number().int().positive(), price, platform, product_version: productVersion, provider, ...overrides },
    commands: (i) => [['iap', 'add', '--credits', String(i.credits), '--price', i.price,
      '--platform', i.platform, '--product-version', String(i.product_version), '--provider', i.provider, ...overrideFlags(i)]],
    planNote: (i) => `Creates a live ${i.credits}-credit pack at $${i.price}.`,
  }),
  cli({
    name: 'adapty_setup',
    title: 'Set up Adapty',
    description:
      'Creates the Adapty access levels, products, paywalls and placements from Assets/adapty-config.json (idempotent). ' +
      'Needs the adapty CLI logged in (`adapty auth login` in a terminal). Run after the store products exist.',
    kind: 'long',
    network: true,
    shape: { config: z.string().optional() },
    commands: (i) => [['adapty', 'setup', ...flags({ '--config': i.config })]],
  }),
  cli({
    name: 'revenuecat_setup',
    title: 'Set up RevenueCat',
    description:
      'Creates RevenueCat apps, entitlements, products, offerings and packages from Assets/revenuecat-config.json (idempotent). ' +
      'Uses the project-scoped secret key already saved for this app (`kappmaker revenuecat setup --api-key …` once in a ' +
      'terminal, or REVENUECAT_API_KEY in the server\'s environment). Keys are never passed through this tool.',
    kind: 'long',
    network: true,
    shape: { config: z.string().optional() },
    commands: (i) => [['revenuecat', 'setup', ...flags({ '--config': i.config })]],
  }),
];
