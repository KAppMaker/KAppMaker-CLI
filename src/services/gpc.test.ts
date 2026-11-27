// Google Play regressions (bugs 1, 2, 8 in the App Army bug list), against a
// fake Play API: no real Google call is made. Run: npm run test:play
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupHome, installFakePlay } from '../test-support/fake-play.js';

setupHome();
process.env.KAPPMAKER_NONINTERACTIVE = '1'; // a prompt nobody answers must throw, not hang

let ds: typeof import('./gpc-data-safety-push.service.js');
let listingsSvc: typeof import('./gpc-listings.service.js');
let gpc: typeof import('./gpc.service.js');
let money: typeof import('./gpc-monetization.service.js');
let regions: typeof import('./gpc-regions.js');

before(async () => {
  ds = await import('./gpc-data-safety-push.service.js');
  listingsSvc = await import('./gpc-listings.service.js');
  gpc = await import('./gpc.service.js');
  money = await import('./gpc-monetization.service.js');
  regions = await import('./gpc-regions.js');
});

const app = (pkg: string) => ({
  app: { name: 'Lab Rat', package_name: pkg, default_language: 'en-US' },
  details: {}, listings: [], subscriptions: [], in_app_products: [],
}) as unknown as import('../types/googleplay.js').GooglePlayConfig;

// ── Bug 1: data-safety push printed OK on HTTP 400 ──────────────────

test('bug 1: data-safety push fails with the Play error body on HTTP 400', async () => {
  installFakePlay({ failures: { 'POST /dataSafety$': { status: 400, body: { error: { code: 400, message: 'Row 12: invalid response value' } } } } });
  const cfg = { ...app('com.example.ds1'), data_safety: { apply_defaults: true } };
  await assert.rejects(ds.pushDataSafetyFromConfig(cfg), (e: Error) => {
    assert.equal(e.name, 'ApiError');
    assert.match(e.message, /HTTP 400/);
    assert.match(e.message, /Row 12: invalid response value/);
    return true;
  });
});

test('bug 1: data-safety push succeeds on 2xx and --verify lists what Play now holds', async () => {
  const play = installFakePlay();
  const cfg = { ...app('com.example.ds2'), data_safety: { apply_defaults: true } };
  assert.equal(await ds.pushDataSafetyFromConfig(cfg, { verify: true }), 'pushed');
  const post = play.calls.find((c) => c.path.endsWith('/dataSafety'));
  assert.ok(post, 'POST /dataSafety was sent');
  assert.match((post.body as { safetyLabels: string }).safetyLabels, /PSL_DATA_COLLECTION_COLLECTS_PERSONAL_DATA,,TRUE/);
});

test('bug 1: a typo in a data-safety answer key fails before anything is sent', async () => {
  const play = installFakePlay();
  const cfg = { ...app('com.example.ds3'), data_safety: { apply_defaults: true, answers: { PSL_DATA_TYPES_PERSONAL_TYPO: true } } };
  await assert.rejects(ds.pushDataSafetyFromConfig(cfg, { verify: true }), /matches no Play question/);
  assert.equal(play.calls.filter((c) => c.path.endsWith('/dataSafety')).length, 0);
});

test('every required Play call throws on non-2xx instead of warning (commit edit)', async () => {
  installFakePlay({ failures: { 'POST :commit$': { status: 400, body: { error: { message: 'Only releases with status draft may be created on draft app' } } } } });
  await assert.rejects(gpc.withEdit('com.example.commit', async () => 1), /HTTP 400[\s\S]*draft app/);
});

// ── Bug 2: listings push could blank live listings ──────────────────

const live = [{ language: 'en-US', title: 'Lab Rat', shortDescription: 'Science games', fullDescription: 'Long live text' }];

test('bug 2: an empty en-US listing in the config sends nothing and keeps the live text', async () => {
  const play = installFakePlay({ liveListings: live });
  const result = await gpc.withEdit('com.example.l1', (editId) =>
    listingsSvc.pushListings('com.example.l1', editId, [{ locale: 'en-US', title: '', short_description: '', full_description: '' }]));
  assert.deepEqual(result.pushed, []);
  assert.equal(play.calls.filter((c) => c.method === 'PUT' && c.path.includes('/listings/')).length, 0);
  assert.equal(play.listings[0].fullDescription, 'Long live text');
});

test('bug 2: a partial config keeps the live fields it does not fill in (PUT replaces the whole listing)', async () => {
  process.env.KAPPMAKER_ASSUME_YES = '1';
  try {
    const play = installFakePlay({ liveListings: live });
    await gpc.withEdit('com.example.l2', (editId) =>
      listingsSvc.pushListings('com.example.l2', editId, [{ locale: 'en-US', short_description: 'Lab games for kids' }]));
    const put = play.calls.find((c) => c.method === 'PUT' && c.path.includes('/listings/'));
    assert.deepEqual(put?.body, { language: 'en-US', title: 'Lab Rat', shortDescription: 'Lab games for kids', fullDescription: 'Long live text' });
  } finally {
    delete process.env.KAPPMAKER_ASSUME_YES;
  }
});

test('bug 2: a change to a live listing needs a yes (no terminal = refuses, nothing sent)', async () => {
  const play = installFakePlay({ liveListings: live });
  await assert.rejects(gpc.withEdit('com.example.l3', (editId) =>
    listingsSvc.pushListings('com.example.l3', editId, [{ locale: 'en-US', title: 'New Title' }])), /needs an answer/);
  assert.equal(play.calls.filter((c) => c.method === 'PUT').length, 0);
  assert.ok(play.calls.some((c) => c.method === 'DELETE'), 'the edit is discarded');
});

test('bug 2: --allow-empty clears only what the config explicitly empties', async () => {
  process.env.KAPPMAKER_ASSUME_YES = '1';
  try {
    const play = installFakePlay({ liveListings: live });
    await gpc.withEdit('com.example.l4', (editId) =>
      listingsSvc.pushListings('com.example.l4', editId, [{ locale: 'en-US', full_description: '' }], { allowEmpty: true }));
    assert.equal(play.listings[0].fullDescription, '');
    assert.equal(play.listings[0].title, 'Lab Rat');
  } finally {
    delete process.env.KAPPMAKER_ASSUME_YES;
  }
});

test('bug 2: a listing write that does not stick fails the read-back and is not committed', async () => {
  process.env.KAPPMAKER_ASSUME_YES = '1';
  try {
    const play = installFakePlay({ liveListings: live, dropListingWrites: true });
    await assert.rejects(gpc.withEdit('com.example.l5', (editId) =>
      listingsSvc.pushListings('com.example.l5', editId, [{ locale: 'en-US', title: 'New Title' }])), /read-back does not match/);
    assert.equal(play.calls.filter((c) => c.path.endsWith(':commit')).length, 0);
  } finally {
    delete process.env.KAPPMAKER_ASSUME_YES;
  }
});

test('app details PUT keeps live contact fields the config leaves empty', async () => {
  const play = installFakePlay({ liveDetails: { defaultLanguage: 'en-US', contactEmail: 'a@example.com', contactPhone: '+1 555 0100' } });
  await gpc.withEdit('com.example.d1', (editId) => gpc.updateAppDetails('com.example.d1', editId, 'en-US', { contact_email: '', contact_phone: '' }));
  assert.equal(play.details.contactPhone, '+1 555 0100');
  assert.equal(play.details.contactEmail, 'a@example.com');
});

// ── Bug 8: regionsVersion 2022/02 hardcoded, ppp_enabled=false priced US only ─

const sub = (ppp: boolean) => ({
  product_id: 'labrat.premium.weekly.v1',
  listings: [{ locale: 'en-US', title: 'Lab Rat Premium Weekly' }],
  base_plans: [{ base_plan_id: 'autorenew-weekly-699-v1', billing_period: 'P1W', ppp_enabled: ppp, regional_configs: [{ region_code: 'US', price: '6.99', currency_code: 'USD' }] }],
});

test('bug 8: monetization uses regionsVersion 2026/01 by default (2022/02 made ET unbillable)', async () => {
  const play = installFakePlay({ unbillableUnlessVersion: { version: '2026/01', regions: ['ET'] } });
  await regions.resolveRegionsVersion();
  regions.resetMonetizationReport();
  await money.setupSubscriptions('com.example.m1', [sub(true)], 'en-US');
  const create = play.calls.find((c) => c.method === 'POST' && c.path.endsWith('/subscriptions'));
  assert.equal(create?.query['regionsVersion.version'], '2026/01');
  const { coverage, failures } = regions.monetizationReport();
  assert.deepEqual(failures, []);
  assert.equal(coverage[0].priced, play.regionCount);
  assert.equal(coverage[0].billable, play.regionCount);
  assert.equal(regions.printCoverageReport(), true);
});

test('bug 8: ppp_enabled=false still prices every billable region (plain conversion)', async () => {
  const play = installFakePlay();
  regions.setRegionsVersion('2026/01');
  regions.resetMonetizationReport();
  await money.setupSubscriptions('com.example.m2', [sub(false)], 'en-US');
  const create = play.calls.find((c) => c.method === 'POST' && c.path.endsWith('/subscriptions'));
  const configs = (create?.body as { basePlans: Array<{ regionalConfigs: Array<{ regionCode: string; price: { currencyCode: string; units: string } }> }> }).basePlans[0].regionalConfigs;
  assert.equal(configs.length, play.regionCount);
  const tr = configs.find((c) => c.regionCode === 'TR');
  assert.equal(tr?.price.currencyCode, 'TRY');
  assert.equal(tr?.price.units, '229', 'no PPP discount applied');
  assert.equal(regions.monetizationReport().coverage[0].priced, play.regionCount);
});

test('bug 8: the regionsVersion comes from config playRegionsVersion, and a flag wins over it', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const file = path.join(process.env.HOME as string, '.config', 'kappmaker', 'config.json');
  const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.writeFileSync(file, JSON.stringify({ ...cfg, playRegionsVersion: '2025/03' }));
  try {
    assert.equal(await regions.resolveRegionsVersion(), '2025/03');
    assert.equal(await regions.resolveRegionsVersion('2026/01'), '2026/01');
  } finally {
    fs.writeFileSync(file, JSON.stringify(cfg));
    regions.setRegionsVersion('2026/01');
  }
});

test('bug 8: a product Google stores in fewer regions than billable is reported FAILED (N of M)', () => {
  regions.resetMonetizationReport();
  regions.recordCoverage(regions.coverageFor('x/bp', new Map([['US', true], ['ET', true], ['MN', true]]), ['US', 'ET', 'MN', 'DE', 'JP']));
  assert.equal(regions.printCoverageReport(), false);
  assert.deepEqual(regions.monetizationReport().coverage[0].missing, ['DE', 'JP']);
});

test('bug 8: a one-time product is priced in every billable region and read back', async () => {
  const play = installFakePlay();
  regions.setRegionsVersion('2026/01');
  regions.resetMonetizationReport();
  await money.setupInAppProducts('com.example.m3', [{
    sku: 'credit_pack_10_499_labrat', default_language: 'en-US', ppp_enabled: false,
    listings: [{ locale: 'en-US', title: '10 Credits' }],
    default_price: { region_code: 'US', price: '4.99', currency_code: 'USD' },
  }]);
  const patch = play.calls.find((c) => c.method === 'PATCH');
  assert.equal(patch?.query['regionsVersion.version'], '2026/01');
  assert.equal(regions.monetizationReport().coverage[0].priced, play.regionCount);
});
