// Smoke test runnable via `npm run test:ppp` (configured in package.json).
// Exits 0 on success, 1 on any failed assertion.
import assert from 'node:assert';
import {
  applyPpp,
  expandAscTerritories,
  expandPlayRegions,
  getMultiplier,
} from './ppp-pricing.service.js';

let failed = 0;
function check(label: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ok  ${label}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL ${label}`);
    console.log(`       ${(err as Error).message}`);
  }
}

console.log('PPP service smoke tests\n');

check('getMultiplier returns 1.00 for US', () => {
  assert.strictEqual(getMultiplier('US'), 1.00);
});

check('getMultiplier returns 0.35 for IN', () => {
  assert.strictEqual(getMultiplier('IN'), 0.35);
});

check('getMultiplier returns 0.30 for AR (very low tier)', () => {
  assert.strictEqual(getMultiplier('AR'), 0.30);
});

check('getMultiplier returns 1.10 for CH (high tier)', () => {
  assert.strictEqual(getMultiplier('CH'), 1.10);
});

check('getMultiplier falls back via FALLBACK_NEIGHBOUR for PR (US territory)', () => {
  assert.strictEqual(getMultiplier('PR'), 1.00);
});

check('getMultiplier returns default 0.60 for completely unknown region "ZZ"', () => {
  assert.strictEqual(getMultiplier('ZZ'), 0.60);
});

check('applyPpp $4.99 in IN with round99 = $1.99', () => {
  // 4.99 * 0.35 = 1.7465 → floor(1) + 0.99 = 1.99
  assert.strictEqual(applyPpp('4.99', 'IN'), '1.99');
});

check('applyPpp $4.99 in CH with round99 = $5.99', () => {
  // 4.99 * 1.10 = 5.489 → floor(5) + 0.99 = 5.99
  assert.strictEqual(applyPpp('4.99', 'CH'), '5.99');
});

check('applyPpp $4.99 in US = $4.99 (multiplier 1.0)', () => {
  // 4.99 * 1.00 = 4.99 → floor(4) + 0.99 = 4.99
  assert.strictEqual(applyPpp('4.99', 'US'), '4.99');
});

check('applyPpp without round99 keeps raw cents', () => {
  // 4.99 * 0.35 = 1.7465 → "1.75"
  assert.strictEqual(applyPpp('4.99', 'IN', { round99: false }), '1.75');
});

check('applyPpp $19.99 in AR = $5.99', () => {
  // 19.99 * 0.30 = 5.997 → floor(5) + 0.99 = 5.99
  assert.strictEqual(applyPpp('19.99', 'AR'), '5.99');
});

check('expandPlayRegions returns >100 entries for $4.99 (excluding US)', () => {
  const fan = expandPlayRegions('4.99', new Set(['US']));
  assert.ok(fan.length > 100, `expected >100, got ${fan.length}`);
  assert.ok(!fan.some((p) => p.region_code === 'US'), 'US should be excluded');
  assert.ok(fan.every((p) => p.currency_code === 'USD'), 'all entries should be USD');
});

check('expandPlayRegions India entry is $1.99', () => {
  const fan = expandPlayRegions('4.99', new Set());
  const inEntry = fan.find((p) => p.region_code === 'IN');
  assert.ok(inEntry, 'IN entry should exist');
  assert.strictEqual(inEntry!.price, '1.99');
});

check('expandAscTerritories returns 175 alpha-3 entries', () => {
  const fan = expandAscTerritories('4.99', new Set());
  assert.ok(fan.length >= 170, `expected ~175, got ${fan.length}`);
  assert.ok(fan.every((p) => p.territory.length === 3), 'all entries should be alpha-3');
});

check('expandAscTerritories India (IND) entry is $1.99', () => {
  const fan = expandAscTerritories('4.99', new Set());
  const indEntry = fan.find((p) => p.territory === 'IND');
  assert.ok(indEntry, 'IND entry should exist');
  assert.strictEqual(indEntry!.targetPrice, '1.99');
});

check('expandAscTerritories excludes user-listed territories', () => {
  const fan = expandAscTerritories('4.99', new Set(['USA', 'JPN']));
  assert.ok(!fan.some((p) => p.territory === 'USA'), 'USA should be excluded');
  assert.ok(!fan.some((p) => p.territory === 'JPN'), 'JPN should be excluded');
});

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'}: ${failed} failure(s)`);
process.exit(failed === 0 ? 0 : 1);
