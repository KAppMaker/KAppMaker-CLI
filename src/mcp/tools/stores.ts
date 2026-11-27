import { z } from 'zod';
import { cli, flags, type ToolDef } from '../define.js';

const config = z.string().optional().describe('Config JSON path (default: the one under Assets/ in project_dir)');
const only = z.enum(['subscriptions', 'iap']).optional().describe('Push only subscriptions or only in-app purchases');
const regionsVersion = z.string().regex(/^\d{4}\/\d{2}$/).optional()
  .describe('Google Play regionsVersion, e.g. "2026/01" (default: config playRegionsVersion, else 2026/01)');

export const storeTools: ToolDef[] = [
  cli({
    name: 'appstore_setup',
    title: 'Set up the app on App Store Connect',
    description:
      'Creates/configures the iOS app on App Store Connect from Assets/appstore-config.json: bundle ID, app record, version, ' +
      'categories, listing, privacy, age rating, subscriptions and IAPs with per-country prices. Safe to run again. ' +
      'Needs the App Store Connect API key saved in kappmaker config (set it up once with `kappmaker create-appstore-app` in a terminal).',
    kind: 'long',
    network: true,
    shape: { config },
    commands: (i) => [['create-appstore-app', ...flags({ '--config': i.config })]],
  }),
  cli({
    name: 'appstore_monetization_push',
    title: 'Push App Store subscriptions + IAPs',
    description: 'Creates or refreshes the subscriptions and in-app purchases from the App Store config on App Store Connect, with per-country prices. Safe to run again.',
    kind: 'long',
    network: true,
    shape: { config, only },
    commands: (i) => [['appstore-monetization-push', ...flags({
      '--config': i.config, '--subscriptions-only': i.only === 'subscriptions', '--iap-only': i.only === 'iap',
    })]],
  }),
  cli({
    name: 'appstore_review_screenshot',
    title: 'Replace App Review screenshots',
    description: 'Replaces the App Review screenshot on App Store subscriptions or IAPs (resized to 1290×2796). Products stay "Missing Metadata" without one.',
    kind: 'long',
    network: true,
    shape: {
      target: z.enum(['subscriptions', 'iap']),
      file: z.string().optional().describe('Screenshot to apply to all matched products (default: review_screenshot from config)'),
      product_id: z.string().optional().describe('Only this product (product_id or ref_name)'),
      config,
    },
    commands: (i) => [[
      i.target === 'iap' ? 'appstore-update-iap-review-screenshot' : 'appstore-update-subscription-review-screenshot',
      ...flags({ '--file': i.file, '--product-id': i.product_id, '--config': i.config }),
    ]],
  }),
  cli({
    name: 'google_play_setup',
    title: 'Set up the app on Google Play Console',
    description:
      'Configures an existing Google Play app from Assets/googleplay-config.json: details, listings, subscriptions, ' +
      'one-time products with per-country prices, data safety. The app must already exist in Play Console (Google allows ' +
      'no API creation) and have one AAB uploaded for subscriptions. Needs googleServiceAccountPath in kappmaker config.',
    kind: 'long',
    network: true,
    shape: { config, regions_version: regionsVersion },
    commands: (i) => [['gpc', 'setup', ...flags({ '--config': i.config, '--regions-version': i.regions_version })]],
  }),
  cli({
    name: 'google_play_push',
    title: 'Push one part of the Play listing',
    description: 'Pushes one section of the Google Play config: listings, subscriptions, iap, monetization (both) or data-safety. Safe to run again.',
    kind: 'long',
    network: true,
    shape: {
      section: z.enum(['listings', 'subscriptions', 'iap', 'monetization', 'data-safety']),
      config,
      only: only.describe('With section=monetization: push only subscriptions or only IAPs'),
      recreate_stuck: z.boolean().optional().describe('iap/monetization: delete + recreate products Google rejects as stuck (they disappear for a while)'),
      allow_empty: z.boolean().optional().describe(
        'listings only: CLEARS live Play listing fields that are empty in the config. Off by default: empty fields are skipped and the live text stays.'),
      verify: z.boolean().optional().describe('data-safety only: check every answer against Play\'s question set and list what Play now declares'),
      regions_version: regionsVersion.describe('subscriptions/iap/monetization: Google Play regionsVersion, e.g. "2026/01"'),
    },
    commands: (i) => [['gpc', i.section, 'push', ...flags({
      '--config': i.config,
      '--subscriptions-only': i.section === 'monetization' && i.only === 'subscriptions',
      '--iap-only': i.section === 'monetization' && i.only === 'iap',
      '--recreate-stuck': (i.section === 'iap' || i.section === 'monetization') && i.recreate_stuck,
      '--allow-empty': i.section === 'listings' && i.allow_empty,
      '--verify': i.section === 'data-safety' && i.verify,
      '--regions-version': ['subscriptions', 'iap', 'monetization'].includes(i.section) ? i.regions_version : undefined,
    })]],
  }),
  cli({
    name: 'google_play_check',
    title: 'Check an app exists on Google Play',
    description: 'Read-only: says whether the package exists on Google Play Console (exit 2 = not found; create it in the Play Console UI first).',
    kind: 'read',
    network: true,
    shape: { package_name: z.string().describe('Android package, e.g. com.example.myapp') },
    commands: (i) => [['gpc', 'app-check', '--package', i.package_name]],
  }),
  cli({
    name: 'google_play_list',
    title: 'List Play subscriptions or IAPs',
    description: 'Read-only: lists the subscriptions or one-time products that exist on Google Play for the app.',
    kind: 'read',
    network: true,
    shape: {
      what: z.enum(['subscriptions', 'iap']),
      package_name: z.string().optional().describe('Default: app.package_name from the Play config'),
      config,
    },
    commands: (i) => [['gpc', i.what, 'list', ...flags({ '--package': i.package_name, '--config': i.config })]],
  }),
];
