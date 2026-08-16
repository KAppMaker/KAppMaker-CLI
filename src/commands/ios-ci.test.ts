import assert from 'node:assert/strict';
import {
  defaultCertsRepo, relativeMobileDir, generateMatchPassword, appendCiLane,
  discoverBuildProperties, buildLocalPropertiesStep, parseLocalProperties,
} from './ios-ci.js';

let failures = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures++;
    console.log(`  FAIL ${name}: ${(error as Error).message}`);
  }
}

console.log('ios-ci:');

test('certs repo sits beside the app repo, same owner', () => {
  assert.equal(defaultCertsRepo('KAppMaker/MyApp-All'), 'KAppMaker/MyApp-All-certs');
});

test('mobile dir is repo-relative with forward slashes', () => {
  assert.equal(relativeMobileDir('/home/u/App-All', '/home/u/App-All/MobileApp'), 'MobileApp');
  // Running from inside MobileApp when it IS the repo root must not yield ""
  // — the workflow's working-directory would then be invalid.
  assert.equal(relativeMobileDir('/home/u/App', '/home/u/App'), '.');
});

test('match password is long, random and URL-safe', () => {
  const a = generateMatchPassword();
  const b = generateMatchPassword();
  assert.notEqual(a, b);
  assert.ok(a.length >= 30, `too short: ${a.length}`);
  // base64url only — a "/" or "+" would break shell/env handling on the runner.
  assert.match(a, /^[A-Za-z0-9_-]+$/);
});

test('CI lane is inserted inside the ios platform block', () => {
  const fastfile = [
    'platform :android do',
    '  lane :play do',
    '  end',
    'end',
    '',
    'platform :ios do',
    '  lane :appstore_release do',
    '  end',
    'end',
    '',
  ].join('\n');
  const out = appendCiLane(fastfile, '  lane :ci_appstore_release do\n  end');

  const iosStart = out.indexOf('platform :ios do');
  const laneAt = out.indexOf('ci_appstore_release');
  assert.ok(laneAt > iosStart, 'lane must land after the ios platform opens');
  // …and before that block's closing end, or fastlane sees a top-level lane.
  assert.ok(out.trimEnd().endsWith('end'), 'file must still close the block');
  assert.equal((out.match(/platform :ios do/g) ?? []).length, 1, 'must not duplicate the block');
});

test('appending twice is caught by the caller marker, not by duplication here', () => {
  // appendCiLane is unconditional by design; the marker check lives in init.
  // This test pins that contract so a future refactor does not silently rely on
  // appendCiLane being idempotent when it is not.
  const once = appendCiLane('platform :ios do\nend\n', '  # lane');
  const twice = appendCiLane(once, '  # lane');
  assert.equal((twice.match(/# lane/g) ?? []).length, 2);
});

test('a Fastfile with no ios block still gets the lane', () => {
  const out = appendCiLane('platform :android do\nend\n', '  # ci lane');
  assert.ok(out.includes('# ci lane'));
});

test('discovers every getRequiredProperty key across modules', () => {
  const shared = `
    buildConfigField("GOOGLE_WEB_CLIENT_ID", getRequiredProperty(key = "GOOGLE_WEB_CLIENT_ID", defaultValue = "testValue"))
    buildConfigField("FIREBASE_API_KEY", getRequiredProperty(key = "FIREBASE_API_KEY", defaultValue = ""))
    getRequiredProperty(
        key = "SUBSCRIPTION_PROVIDER_ANDROID_API_KEY",
        defaultValue = "testValue",
    )`;
  const android = 'getRequiredProperty(key = "ADMOB_APP_ID_ANDROID", defaultValue = "")';
  const keys = discoverBuildProperties([shared, android]);
  assert.deepEqual(keys, [
    'ADMOB_APP_ID_ANDROID', 'FIREBASE_API_KEY', 'GOOGLE_WEB_CLIENT_ID',
    'SUBSCRIPTION_PROVIDER_ANDROID_API_KEY',
  ]);
});

test('no build keys means no local.properties step at all', () => {
  assert.equal(buildLocalPropertiesStep([], 'MobileApp'), '');
});

test('local.properties step writes each key from a same-named secret', () => {
  const step = buildLocalPropertiesStep(['FIREBASE_API_KEY', 'OPENAI_API_KEY'], 'MobileApp');
  assert.match(step, /working-directory: MobileApp/);
  assert.match(step, /FIREBASE_API_KEY=\$\{\{ secrets\.FIREBASE_API_KEY \}\}/);
  // appended, not overwritten: the runner's local.properties may already carry
  // sdk.dir written by the Android setup step.
  assert.match(step, />> local\.properties/);
});

test('parsing local.properties keeps real values and drops empty ones', () => {
  const parsed = parseLocalProperties([
    '# comment',
    'sdk.dir=/opt/android',
    'GOOGLE_WEB_CLIENT_ID=123.apps.googleusercontent.com',
    'FIREBASE_API_KEY=',
    '  OPENAI_API_KEY = sk-abc  ',
  ].join('\n'));
  assert.equal(parsed['GOOGLE_WEB_CLIENT_ID'], '123.apps.googleusercontent.com');
  assert.equal(parsed['OPENAI_API_KEY'], 'sk-abc');
  // An empty value must NOT be treated as configured — that is exactly the case
  // that silently ships a placeholder.
  assert.equal(parsed['FIREBASE_API_KEY'], undefined);
  assert.equal(parsed['sdk.dir'], '/opt/android');
});

console.log(failures === 0 ? 'ios-ci: all green' : 'ios-ci: FAILURES');
process.exit(failures === 0 ? 0 : 1);
