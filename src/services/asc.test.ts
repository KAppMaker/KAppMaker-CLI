// App Store Connect regressions (bugs 3, 4, 5 in the App Army bug list),
// against a fake `asc` binary on PATH: no real Apple call is made.
// Run: npm run test:asc
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kappmaker-asc-'));
const bin = path.join(tmp, 'bin');
fs.mkdirSync(bin);
fs.symlinkSync(path.join(here, '..', 'test-support', 'fake-asc.mjs'), path.join(bin, 'asc'));
process.env.PATH = `${bin}:${process.env.PATH}`;
process.env.HOME = tmp;
process.env.KAPPMAKER_NONINTERACTIVE = '1';
const LOG = path.join(tmp, 'calls.log');
const RULES = path.join(tmp, 'rules.json');
process.env.FAKE_ASC_LOG = LOG;
process.env.FAKE_ASC_RULES = RULES;

type Rule = { match: string; exit?: number; stdout?: unknown; stderr?: string };
function rules(r: Rule[]): void {
  fs.writeFileSync(RULES, JSON.stringify(r));
}
function calls(): string[][] {
  return fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
}
const called = (re: RegExp) => calls().filter((c) => re.test(c.join(' ')));

beforeEach(() => {
  fs.rmSync(LOG, { force: true });
  rules([]);
});

const asc = await import('./asc.service.js');
const money = await import('./asc-monetization.service.js');
const { applyRequiredDefaults } = await import('../commands/create-appstore-app.js');

// ── Bug 3: old asc on PATH -> every step silently skipped ────────────

test('bug 3: asc older than 5.9.0 stops the command with the exact upgrade line', async () => {
  assert.throws(() => asc.checkAscVersion('1.4.1'), /asc 1\.4\.1 is too old: kappmaker needs asc 5\.9\.0[\s\S]*brew update && brew upgrade asc/);
  assert.throws(() => asc.checkAscVersion('garbage'), /Could not read the asc version/);
  assert.equal(asc.checkAscVersion('5.17.1 (commit: unknown)'), '5.17.1');
  rules([{ match: '^--version$', stdout: '1.4.1' }]);
  await assert.rejects(asc.validateAscInstalled(), /too old/);
});

test('bug 3: a failing required asc step throws with asc output (no allowFailure skip)', async () => {
  rules([{ match: '^categories set', exit: 1, stderr: 'The app must have an editable version' }]);
  await assert.rejects(asc.setCategories('123', { primary: 'GAMES' }), (e: Error) => {
    assert.equal(e.name, 'ToolError');
    assert.match(e.message, /editable version/);
    return true;
  });
});

// ── Bug 4: step 13 OK but no App Review detail ───────────────────────

const review = { contact_first_name: 'Dev', contact_last_name: 'Support', contact_email: 'dev@example.com', contact_phone: '+1 408 555 0100' };

test('bug 4: review detail create failing is reported, not printed as OK', async () => {
  rules([{ match: '^review details-create', exit: 1, stderr: 'HTTP 409 conflict' }]);
  await assert.rejects(asc.setReviewDetails('v1', review), /HTTP 409/);
});

test('bug 4: review detail missing on read-back fails the step', async () => {
  rules([{ match: '^review details-for-version', stdout: { data: null } }]);
  await assert.rejects(asc.setReviewDetails('v1', review), /no review detail/);
});

test('bug 4/5: review detail uses --if-exists update and demoAccountRequired=false without login, read back', async () => {
  rules([{ match: '^review details-for-version', stdout: { data: { id: 'rd1', attributes: { contactEmail: 'dev@example.com', demoAccountRequired: false } } } }]);
  await asc.setReviewDetails('v1', review);
  const create = called(/^review details-create/)[0];
  assert.ok(create.includes('--demo-account-required=false'));
  assert.deepEqual(create.slice(create.indexOf('--if-exists'), create.indexOf('--if-exists') + 2), ['--if-exists', 'update']);
});

test('bug 4: a review_info without contact phone fails before asking Apple', async () => {
  await assert.rejects(asc.setReviewDetails('v1', { ...review, contact_phone: '' }), /missing contact_phone/);
  assert.equal(called(/details-create/).length, 0);
});

// ── Bug 5: copyright, territories, age rating, subscriptions ─────────

test('bug 5: copyright defaults to "<year> <company>" and reaches an existing version (--if-exists update), read back', async () => {
  const cfg = { app: { name: 'Zenbo' }, version: { version_string: '1.0.0', copyright: '', release_type: 'AFTER_APPROVAL' }, pricing: undefined, subscriptions: { groups: [] } } as never;
  applyRequiredDefaults(cfg, 'Example Co');
  const v = (cfg as { version: import("../types/appstore.js").AppStoreVersionConfig }).version;
  assert.equal(v.copyright, `${new Date().getFullYear()} Example Co`);
  rules([
    { match: '^versions create', stdout: { data: { id: 'ver1' }, action: 'updated' } },
    { match: '^versions view', stdout: { data: { id: 'ver1', attributes: { versionString: '1.0.0', copyright: v.copyright } } } },
  ]);
  assert.equal(await asc.createVersion('123', v, 'IOS'), 'ver1');
  const create = called(/^versions create/)[0];
  assert.ok(create.includes('--copyright') && create.includes(v.copyright));
  assert.ok(create.join(' ').includes('--if-exists update'));
});

test('bug 5: copyright read-back mismatch fails', async () => {
  rules([
    { match: '^versions create', stdout: { data: { id: 'ver1' } } },
    { match: '^versions view', stdout: { data: { id: 'ver1', attributes: { versionString: '1.0.0', copyright: '' } } } },
  ]);
  await assert.rejects(asc.createVersion('123', { version_string: '1.0.0', copyright: '2026 Example Co', release_type: 'MANUAL' }, 'IOS'), /copyright: wanted/);
});

test('bug 5: age rating answers the new questions (social media, UGC, messaging) explicitly and reads back', async () => {
  const args = asc.ageRatingArgs('123', { social_media: false, user_generated_content: false, messaging_and_chat: false, violence_cartoon_or_fantasy: 'NONE' });
  const joined = args.join(' ');
  assert.match(joined, /--social-media false/);
  assert.match(joined, /--user-generated-content false/);
  assert.match(joined, /--messaging-and-chat false/);
  rules([{ match: '^age-rating view', stdout: { data: { attributes: { socialMedia: true, userGeneratedContent: false, messagingAndChat: false } } } }]);
  await assert.rejects(asc.setAgeRating('123', {}), /socialMedia: wanted false/);
});

test('bug 5: app availability covers all territories (--all-territories) and is read back', async () => {
  const all = Array.from({ length: 175 }, (_, i) => ({ id: `T${i}`, attributes: { available: true } }));
  rules([{ match: '^pricing availability territory-availabilities', stdout: { data: all } }]);
  await money.createPricing('123', { base_territory: 'USA', price_tier: '0', price: '0', availability: { include_all: true, territories: [], available_in_new_territories: true } });
  assert.ok(called(/^pricing schedule create .*--free/).length === 1);
  const avail = called(/^pricing availability create/)[0].join(' ');
  assert.match(avail, /--all-territories/);
  assert.match(avail, /--available-in-new-territories=true/);
});

test('bug 5: availability read-back short of all territories fails', async () => {
  rules([{ match: '^pricing availability territory-availabilities', stdout: { data: [{ attributes: { available: true } }, { attributes: { available: false } }] } }]);
  await assert.rejects(money.createPricing('123', { base_territory: 'USA', price_tier: '0', price: '0', availability: { include_all: true, territories: [], available_in_new_territories: true } }), /available in 1 of 2/);
});

test('bug 5: subscription group localization is created on the group version and equalize runs with --workers 2', async () => {
  rules([
    { match: '^subscriptions groups list', stdout: { data: [{ id: 'g1', attributes: { referenceName: 'zenbo.premium.v1' } }] } },
    { match: '^subscriptions setup', stdout: { subscriptionId: 's1' } },
    { match: '^subscriptions groups versions list', stdout: { data: [{ id: 'gv1' }] } },
    // first list: nothing; after create: en-US present (the fake answers the same, so check the create call)
    { match: '^subscriptions groups versions localizations list', stdout: { data: [] } },
  ]);
  const group = {
    reference_name: 'zenbo.premium.v1',
    localizations: [{ locale: 'en-US', name: 'Zenbo Premium' }],
    subscriptions: [{ ref_name: 'Zenbo Premium Weekly v1 (6.99)', product_id: 'zenbo.premium.weekly.v1.699.v1', subscription_period: 'ONE_WEEK', ppp_enabled: false, localizations: [{ locale: 'en-US', name: 'Weekly' }], prices: [{ territory: 'USA', price: '6.99' }] }],
  } as never;
  // The read-back still sees no en-US (fake), so the step must FAIL, not print OK.
  await assert.rejects(money.setupSubscriptions('123', group), /localization read-back: missing en-US/);
  assert.equal(called(/^subscriptions groups versions localizations create .*--locale en-US/).length, 1);
  const eq = called(/^subscriptions pricing equalize/)[0];
  assert.ok(eq, 'equalize ran for ppp_enabled=false');
  assert.deepEqual(eq.slice(eq.indexOf('--workers'), eq.indexOf('--workers') + 2), ['--workers', '2']);
});

test('bug 5: subscriptions are read back with asc validate subscriptions (MISSING_METADATA fails)', async () => {
  rules([{ match: '^validate subscriptions', exit: 1, stdout: '{"subscriptions":[{"state":"MISSING_METADATA","issues":["no review screenshot"]}]}' }]);
  await assert.rejects(money.validateSubscriptions('123'), /MISSING_METADATA/);
});

test('demoAccountRequired is true only with credentials, or when set explicitly', () => {
  assert.equal(asc.demoAccountRequired(review), false);
  assert.equal(asc.demoAccountRequired({ ...review, demo_username: 'u', demo_password: 'p' }), true);
  assert.equal(asc.demoAccountRequired({ ...review, demo_account_required: true }), true);
});
