// Regressions for bugs 6, 7, 9, 10, 11, 12 of the App Army bug list (prompts,
// update-version, refactor, splash). No network. Run: npm run test:fixes
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const tsx = path.join(root, 'node_modules', '.bin', 'tsx');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'kappmaker-fix-'));

function runScript(file: string, input: string, env: Record<string, string> = {}) {
  const r = spawnSync(tsx, [path.join(root, file)], { input, encoding: 'utf8', env: { PATH: process.env.PATH ?? '', HOME: tmp(), ...env }, timeout: 60_000 });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}
function cli(args: string[], cwd: string, env: Record<string, string> = {}) {
  const r = spawnSync(tsx, [path.join(root, 'src', 'index.ts'), ...args], { cwd, input: '', encoding: 'utf8', env: { PATH: process.env.PATH ?? '', HOME: tmp(), ...env }, timeout: 60_000 });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

// ── Bugs 6 + 7: prompts ignored piped input / needed --yes ───────────

test('bug 6: piped answers reach every prompt in order (the first prompt used to swallow them all)', () => {
  const r = runScript('src/test-support/two-confirms.ts', 'y\nLab Rat\ny\n');
  assert.match(r.out, /RESULT \[true,"Lab Rat",true\]/, r.out);
});

test('bug 6: piped stdin that ends early answers the rest with no (never hangs)', () => {
  const r = runScript('src/test-support/two-confirms.ts', 'y\n');
  assert.match(r.out, /RESULT \[true,"",false\]/, r.out);
});

test('bugs 6/7: KAPPMAKER_YES (--yes / --config) answers confirms yes, even with no terminal', () => {
  const r = runScript('src/test-support/two-confirms.ts', '', { KAPPMAKER_YES: '1' });
  assert.match(r.out, /RESULT \[true,"",true\]/, r.out);
});

test('bugs 6/7: --yes is on every prompting command and --config turns it on', async () => {
  const { createCli } = await import('../cli.js');
  const program = createCli();
  const find = (p: string[]) => p.reduce((c, n) => c.commands.find((x) => x.name() === n) ?? c, program);
  for (const p of [['create-appstore-app'], ['adapty', 'setup'], ['gpc', 'setup'], ['gpc', 'listings', 'push'], ['revenuecat', 'setup'], ['create-play-app']]) {
    assert.ok(find(p).options.some((o) => o.long === '--yes'), `${p.join(' ')} has --yes`);
  }
  // --config <file> implies --yes (the preAction hook)
  delete process.env.KAPPMAKER_YES;
  const { setAssumeYes, assumeYes } = await import('../utils/prompt.js');
  assert.equal(assumeYes(), false);
  setAssumeYes();
  assert.equal(assumeYes(), true);
  delete process.env.KAPPMAKER_YES;
});

test('--yes never answers a destructive question', async () => {
  const { confirm } = await import('../utils/prompt.js');
  process.env.KAPPMAKER_YES = '1';
  process.env.KAPPMAKER_NONINTERACTIVE = '1';
  try {
    await assert.rejects(confirm('Delete it and start fresh?', { destructive: true }), /needs an answer/);
    assert.equal(await confirm('Log in interactively?', { yesAnswer: false }), false);
  } finally {
    delete process.env.KAPPMAKER_YES;
    delete process.env.KAPPMAKER_NONINTERACTIVE;
  }
});

// ── Bug 9: update-version bumped the version name ────────────────────

function mobileProject(): string {
  const dir = tmp();
  const m = path.join(dir, 'MobileApp');
  fs.mkdirSync(path.join(m, 'androidApp'), { recursive: true });
  fs.writeFileSync(path.join(m, 'androidApp', 'build.gradle.kts'), 'android {\n  defaultConfig {\n    versionCode = 7\n    versionName = "1.0.0"\n  }\n}\n');
  fs.mkdirSync(path.join(m, 'iosApp', 'iosApp.xcodeproj'), { recursive: true });
  fs.mkdirSync(path.join(m, 'iosApp', 'iosApp'), { recursive: true });
  fs.writeFileSync(path.join(m, 'iosApp', 'iosApp.xcodeproj', 'project.pbxproj'), 'CURRENT_PROJECT_VERSION = 7;\nMARKETING_VERSION = 1.0;\nCURRENT_PROJECT_VERSION = 7;\nMARKETING_VERSION = 1.0;\n');
  return dir;
}

test('bug 9: update-version bumps only the build numbers by default', () => {
  const dir = mobileProject();
  const r = cli(['update-version'], dir);
  assert.equal(r.code, 0, r.out);
  const gradle = fs.readFileSync(path.join(dir, 'MobileApp/androidApp/build.gradle.kts'), 'utf8');
  const pbx = fs.readFileSync(path.join(dir, 'MobileApp/iosApp/iosApp.xcodeproj/project.pbxproj'), 'utf8');
  assert.match(gradle, /versionCode = 8/);
  assert.match(gradle, /versionName = "1\.0\.0"/, 'Android name unchanged (was 1.0.1)');
  assert.match(pbx, /CURRENT_PROJECT_VERSION = 8;/);
  assert.match(pbx, /MARKETING_VERSION = 1\.0;/, 'iOS name unchanged (was 1.1)');
});

test('bug 9: --version-name X sets the name explicitly (and -v still works)', () => {
  const dir = mobileProject();
  assert.equal(cli(['update-version', '--version-name', '2.0.0'], dir).code, 0);
  assert.match(fs.readFileSync(path.join(dir, 'MobileApp/androidApp/build.gradle.kts'), 'utf8'), /versionName = "2\.0\.0"/);
  assert.match(fs.readFileSync(path.join(dir, 'MobileApp/iosApp/iosApp.xcodeproj/project.pbxproj'), 'utf8'), /MARKETING_VERSION = 2\.0\.0;/);
  assert.equal(cli(['update-version', '-v', '2.1.0'], dir).code, 0);
  assert.match(fs.readFileSync(path.join(dir, 'MobileApp/androidApp/build.gradle.kts'), 'utf8'), /versionName = "2\.1\.0"/);
});

// ── Bugs 10 + 11: refactor app name with a space; workflow app_name ──

function templateProject(): string {
  const dir = tmp();
  const m = path.join(dir, 'MobileApp');
  const write = (rel: string, text: string) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
  write('MobileApp/settings.gradle.kts', 'rootProject.name = "Koko"\ninclude(":androidApp")\n');
  write('MobileApp/androidApp/build.gradle.kts', 'android {\n  namespace = "com.measify.kappmaker"\n  defaultConfig { applicationId = "com.measify.kappmaker" }\n}\n');
  write('MobileApp/androidApp/src/main/AndroidManifest.xml', '<application android:label="Koko" android:icon="@mipmap/ic_launcher"/>\n');
  write('MobileApp/iosApp/iosApp.xcodeproj/project.pbxproj', 'path = Koko.app;\nINFOPLIST_KEY_CFBundleDisplayName = Koko;\nPRODUCT_NAME = Koko;\n"${DWARF}/${PRODUCT_NAME}",\n');
  // The workflow's app_name does not match the detected old name (the Zenbo case).
  write('.github/workflows/publish_ios_appstore.yml', 'env:\n      app_name: KAppMakerAllModules\n      scheme: iosApp\n');
  return m;
}

test('bugs 10/11: "Lab Rat" -> Gradle-safe rootProject.name, display name kept, workflow app_name rewritten', async () => {
  const { refactor } = await import('../services/refactor.service.js');
  const m = templateProject();
  await refactor(m, 'com.example.labrat', 'Lab Rat', true);
  assert.match(fs.readFileSync(path.join(m, 'settings.gradle.kts'), 'utf8'), /rootProject\.name = "LabRat"/);
  assert.match(fs.readFileSync(path.join(m, 'androidApp/src/main/AndroidManifest.xml'), 'utf8'), /android:label="Lab Rat"/);
  const pbx = fs.readFileSync(path.join(m, 'iosApp/iosApp.xcodeproj/project.pbxproj'), 'utf8');
  assert.match(pbx, /INFOPLIST_KEY_CFBundleDisplayName = "Lab Rat";/);
  assert.match(pbx, /PRODUCT_NAME = LabRat;/);
  assert.match(pbx, /path = LabRat\.app;/);
  assert.match(pbx, /\$\{PRODUCT_NAME\}/, 'build-setting references untouched');
  const wf = fs.readFileSync(path.join(m, '..', '.github/workflows/publish_ios_appstore.yml'), 'utf8');
  assert.match(wf, /app_name: LabRat\n/);
  // A second refactor finds the current names and moves on cleanly.
  await refactor(m, 'com.example.labrat', 'Lab Rat Pro', true);
  assert.match(fs.readFileSync(path.join(m, 'androidApp/src/main/AndroidManifest.xml'), 'utf8'), /android:label="Lab Rat Pro"/);
  assert.match(fs.readFileSync(path.join(m, 'settings.gradle.kts'), 'utf8'), /"LabRatPro"/);
});

// ── Bug 12: icons left the Kotlin splash ─────────────────────────────

async function logoPng(file: string): Promise<void> {
  // Transparent canvas with an opaque square in the middle (a "logo without background").
  const inner = await sharp({ create: { width: 600, height: 600, channels: 4, background: { r: 200, g: 30, b: 30, alpha: 1 } } }).png().toBuffer();
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: inner, left: 212, top: 212 }]).png().toFile(file);
}

test('bug 12: generate-ios-icons also writes the launch screen logo and SplashBackground', async () => {
  const dir = tmp();
  const xc = path.join(dir, 'MobileApp/iosApp/iosApp/Assets.xcassets');
  fs.mkdirSync(path.join(xc, 'AppIcon.appiconset'), { recursive: true });
  fs.mkdirSync(path.join(xc, 'ic_logo.imageset'), { recursive: true });
  fs.writeFileSync(path.join(xc, 'ic_logo.imageset', 'ic_logo.png'), 'kotlin logo');
  fs.mkdirSync(path.join(dir, 'Assets'));
  await logoPng(path.join(dir, 'Assets', 'logo.png'));
  const r = cli(['generate-ios-icons', '--splash-background', '#112233'], dir);
  assert.equal(r.code, 0, r.out);
  const contents = JSON.parse(fs.readFileSync(path.join(xc, 'ic_logo.imageset', 'Contents.json'), 'utf8'));
  assert.deepEqual(contents.images.map((i: { scale: string }) => i.scale), ['1x', '2x', '3x']);
  assert.equal((await sharp(path.join(xc, 'ic_logo.imageset', 'ic_logo@3x.png')).metadata()).width, 540);
  const bg = JSON.parse(fs.readFileSync(path.join(xc, 'SplashBackground.colorset', 'Contents.json'), 'utf8'));
  assert.deepEqual(bg.colors[0].color.components, { red: '0x11', green: '0x22', blue: '0x33', alpha: '1.000' });
});

test('bug 12: generate-android-icons points the splash at the new icon and adds a monochrome icon', async () => {
  const dir = tmp();
  const res = path.join(dir, 'MobileApp/androidApp/src/main/res');
  fs.mkdirSync(path.join(res, 'values'), { recursive: true });
  fs.writeFileSync(path.join(res, 'values', 'styles.xml'), '<resources>\n    <style name="Theme.App.Starting" parent="Theme.SplashScreen">\n        <item name="windowSplashScreenAnimatedIcon">@drawable/ic_launcher_foreground</item>\n    </style>\n</resources>\n');
  fs.writeFileSync(path.join(res, 'values', 'colors.xml'), '<resources>\n    <color name="windowBackgroundColor">#F9F7FF</color>\n</resources>\n');
  fs.mkdirSync(path.join(dir, 'Assets'));
  await logoPng(path.join(dir, 'Assets', 'logo.png'));
  const r = cli(['generate-android-icons', '--splash-background', '#000000'], dir);
  assert.equal(r.code, 0, r.out);
  assert.match(fs.readFileSync(path.join(res, 'values', 'styles.xml'), 'utf8'), /windowSplashScreenAnimatedIcon">@mipmap\/ic_launcher_foreground</);
  assert.match(fs.readFileSync(path.join(res, 'values', 'colors.xml'), 'utf8'), /windowBackgroundColor">#000000</);
  assert.ok(fs.existsSync(path.join(res, 'mipmap-xxxhdpi', 'ic_launcher_monochrome.webp')));
  assert.match(fs.readFileSync(path.join(res, 'mipmap-anydpi-v26', 'ic_launcher.xml'), 'utf8'), /<monochrome android:drawable="@mipmap\/ic_launcher_monochrome"\/>/);
});
