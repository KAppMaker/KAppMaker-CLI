import { execa } from 'execa';
import { run, runStreaming } from '../utils/exec.js';
import { logger } from '../utils/logger.js';
import { confirm } from '../utils/prompt.js';
import { loadConfig } from '../utils/config.js';
import { CliError, ToolError } from '../utils/errors.js';
import type {
  AppStoreAppConfig,
  AppStoreVersionConfig,
  AppStoreCategoriesConfig,
  AppStoreAgeRatingConfig,
  AppStoreLocalization,
  AppStoreEncryptionConfig,
  AppStoreReviewInfoConfig,
} from '../types/appstore.js';

// Minimum supported asc CLI version: `pricing availability create
// --all-territories --if-exists update` (5.9) and `prices import --confirm`
// (3.3) are used by the monetization path; `subscriptions groups
// localizations` moved under group versions in 5.0.
// See https://docs.asccli.sh/migrate-to-5-0
export const MIN_ASC_VERSION = '5.9.0';

/**
 * Check `asc` is installed and new enough, before any step runs. An older asc
 * used to be a warning, after which every step ran with allowFailure and was
 * silently skipped while the command still finished "OK". Now an old or
 * unreadable version stops the command with the exact upgrade line.
 */
export async function validateAscInstalled(): Promise<string> {
  let versionOutput: string | null = null;
  try {
    const result = await execa('asc', ['--version']);
    versionOutput = result.stdout;
  } catch {
    logger.warn('asc CLI is not installed.');
    console.log('');
    // Homebrew works on macOS and Linux; without it, the official install
    // script (it verifies checksums) is the documented route.
    const hasBrew = (await execa('brew', ['--version'], { reject: false })).exitCode === 0;
    const hint = hasBrew ? 'brew install asc' : 'curl -fsSL https://asccli.sh/install | bash';
    const shouldInstall = await confirm(`  Would you like to install it? (${hint})`, { yesAnswer: false });
    if (!shouldInstall) {
      throw new CliError(`asc CLI ${MIN_ASC_VERSION} or newer is required. Install it with: ${hint}`);
    }
    if (hasBrew) await runStreaming('brew', ['install', 'asc'], { label: 'Installing asc CLI...' });
    else await runStreaming('bash', ['-c', hint], { label: 'Installing asc CLI...' });
    versionOutput = (await execa('asc', ['--version'], { reject: false })).stdout;
  }
  return checkAscVersion(versionOutput ?? '');
}

/** Pure version gate, exported for tests. Returns the parsed version. */
export function checkAscVersion(versionOutput: string): string {
  const found = versionOutput.match(/\d+\.\d+\.\d+/)?.[0];
  if (!found) {
    throw new CliError(
      `Could not read the asc version from "asc --version" (got: ${versionOutput.trim().slice(0, 80) || 'nothing'}). ` +
        `kappmaker needs asc ${MIN_ASC_VERSION} or newer: brew update && brew upgrade asc   (or: curl -fsSL https://asccli.sh/install | bash)`,
    );
  }
  if (!meetsMinimumVersion(found, MIN_ASC_VERSION)) {
    throw new CliError(
      `asc ${found} is too old: kappmaker needs asc ${MIN_ASC_VERSION} or newer (the 5.x command surface).\n` +
        '  Upgrade: brew update && brew upgrade asc   (or: curl -fsSL https://asccli.sh/install | bash)\n' +
        '  Migration notes: https://docs.asccli.sh/migrate-to-5-0',
    );
  }
  const major = Number(found.split('.')[0]);
  if (major > Number(MIN_ASC_VERSION.split('.')[0])) {
    logger.warn(`asc ${found} is a newer major version than kappmaker was tested with (${MIN_ASC_VERSION.split('.')[0]}.x). Every step still reads its result back and fails loudly if a command changed.`);
  }
  return found;
}

function meetsMinimumVersion(versionString: string, minimum: string): boolean {
  const match = versionString.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return false;
  const [, maj, min, patch] = match;
  const [minMaj, minMin, minPatch] = minimum.split('.').map(Number);
  const current: [number, number, number] = [Number(maj), Number(min), Number(patch)];
  const required: [number, number, number] = [minMaj, minMin, minPatch];
  for (let i = 0; i < 3; i++) {
    if (current[i] > required[i]) return true;
    if (current[i] < required[i]) return false;
  }
  return true;
}

// ── Strict runner + read-back helpers ───────────────────────────────

/**
 * Run an asc command that a step depends on. Non-zero exit throws a ToolError
 * carrying asc's output, so the step is reported FAILED (never OK). `okIf`
 * lists outputs that mean "already in the wanted state".
 */
export async function ascRun(
  args: string[],
  label: string,
  opts: { okIf?: RegExp; timeout?: number; env?: Record<string, string> } = {},
): Promise<{ stdout: string; json: any }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const r = await run('asc', args, { label, allowFailure: true, timeout: opts.timeout, env: opts.env });
  const out = `${r.stderr}\n${r.stdout}`.trim();
  if (r.exitCode !== 0 && !(opts.okIf && opts.okIf.test(out))) {
    throw new ToolError(label, 'asc', r.exitCode, out);
  }
  return { stdout: r.stdout, json: parseJsonSafe(r.stdout) };
}

function parseJsonSafe(text: string): any { // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    if (start >= 0) {
      try { return JSON.parse(text.slice(start)); } catch { /* fall through */ }
    }
    return null;
  }
}

/** Attributes of `data` (or of the first element when `data` is a list). */
export function attrsOf(json: any): Record<string, unknown> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const d = Array.isArray(json?.data) ? json.data[0] : json?.data ?? json;
  return (d?.attributes ?? d ?? {}) as Record<string, unknown>;
}

/** Throw when a read-back field differs from what was set. */
export function expectFields(what: string, got: Record<string, unknown>, want: Record<string, unknown>): void {
  const bad = Object.entries(want)
    .filter(([k, v]) => v !== undefined && String(got[k] ?? '') !== String(v))
    .map(([k, v]) => `${k}: wanted ${JSON.stringify(v)}, App Store Connect has ${JSON.stringify(got[k] ?? null)}`);
  if (bad.length > 0) throw new CliError(`${what} read-back does not match:\n  - ${bad.join('\n  - ')}`);
}

export function defaultCopyright(organization: string | undefined, appName: string, now = new Date()): string {
  return `${now.getFullYear()} ${(organization || appName).trim()}`;
}

export async function validateAscAuth(): Promise<void> {
  const result = await run('asc', ['auth', 'status', '--validate'], {
    label: 'Checking App Store Connect authentication',
    allowFailure: true,
  });

  // Check both exit code and whether credentials actually exist. Credentials
  // from ASC_KEY_ID/ASC_ISSUER_ID/ASC_PRIVATE_KEY_PATH env vars leave the
  // stored list empty but report environmentCredentialsComplete (asc 5.x).
  const hasCredentials =
    result.exitCode === 0 &&
    (!result.stdout.includes('"credentials":[]') || result.stdout.includes('"environmentCredentialsComplete":true'));
  if (!hasCredentials) {
    logger.warn('asc CLI is not authenticated.');

    // Auto-login with stored credentials if available
    const config = await loadConfig();
    if (config.ascKeyId && config.ascIssuerId && config.ascPrivateKeyPath) {
      const authName = config.ascAuthName || 'KAppMaker';
      await run('asc', [
        'auth', 'login',
        '--name', authName,
        '--key-id', config.ascKeyId,
        '--issuer-id', config.ascIssuerId,
        '--private-key', config.ascPrivateKeyPath,
      ], { label: 'Logging in with saved API key...' });
      return;
    }

    console.log('');
    const shouldLogin = await confirm('  Would you like to log in interactively? (asc auth login)', { yesAnswer: false });
    if (shouldLogin) {
      await runStreaming('asc', ['auth', 'login'], { label: 'Logging in to App Store Connect...' });
      // Re-validate after login
      const recheck = await run('asc', ['auth', 'status', '--validate'], {
        label: 'Re-checking authentication',
        allowFailure: true,
      });
      if (recheck.exitCode !== 0) {
        logger.fatal('Authentication failed. Please try again manually.');
        process.exit(1);
      }
    } else {
      logger.fatal('Authentication required.');
      logger.info('Set up your API key: kappmaker config appstore-defaults --init');
      logger.info('Or run manually: asc auth login --name "MyKey" --key-id <KEY_ID> --issuer-id <ISSUER_ID> --private-key <path-to-.p8>');
      process.exit(1);
    }
  }
}

/**
 * Default capabilities enabled on every new bundle ID. These match the
 * standard KAppMaker app requirements (subscriptions, push, Apple Sign In).
 */
const BUNDLE_ID_CAPABILITIES = ['IN_APP_PURCHASE', 'PUSH_NOTIFICATIONS', 'APPLE_ID_AUTH'];

export async function createBundleId(bundleId: string, _name: string, platform: string): Promise<void> {
  // Name follows Apple convention: "XC com example myapp" for "com.example.myapp"
  const derivedName = `XC ${bundleId.replace(/\./g, ' ')}`;

  const result = await run(
    'asc',
    ['bundle-ids', 'create', '--identifier', bundleId, '--name', derivedName, '--platform', platform],
    { label: `Creating bundle ID: ${bundleId}`, allowFailure: true },
  );
  if (result.exitCode !== 0) {
    logger.info(`Bundle ID "${bundleId}" may already exist, continuing...`);
  }

  // Find the bundle ID's resource ID (needed for capabilities API)
  const resourceId = await findBundleIdResourceId(bundleId);
  if (!resourceId) {
    logger.warn('Could not find bundle ID resource ID: skipping capability setup.');
    return;
  }

  // Enable capabilities: Sign in with Apple, In-App Purchases, Push Notifications
  for (const capability of BUNDLE_ID_CAPABILITIES) {
    await run('asc', [
      'bundle-ids', 'capabilities', 'add',
      '--bundle', resourceId,
      '--capability', capability,
    ], {
      label: `Enabling ${capability} on ${bundleId}`,
      allowFailure: true,
    });
  }
}

async function findBundleIdResourceId(identifier: string): Promise<string | null> {
  // Filter server-side: an unfiltered list returns only the first page.
  const result = await run('asc', ['bundle-ids', 'list', '--identifier', identifier, '--output', 'json'], {
    label: 'Looking up bundle ID resource ID',
    allowFailure: true,
  });
  if (result.exitCode !== 0 || !result.stdout) return null;
  try {
    const data = JSON.parse(result.stdout);
    const bundles = data?.data ?? data ?? [];
    for (const b of bundles) {
      const attrs = b.attributes ?? b;
      if (attrs.identifier === identifier || attrs.bundleId === identifier) {
        return b.id;
      }
    }
  } catch {
    // Fall through
  }
  return null;
}

export async function createApp(config: AppStoreAppConfig): Promise<string> {
  // v1.0+ removed `asc apps create`; creation lives under `asc web apps create`
  // and requires an explicit --apple-id for the web-session auth path.
  const kappConfig = await loadConfig();
  if (!kappConfig.appleId) {
    logger.fatal('Apple ID is required to create apps (asc web apps create --apple-id).');
    logger.info('Set it with: kappmaker config appstore-defaults --init');
    logger.info('Or create the app manually at: https://appstoreconnect.apple.com/apps');
    process.exit(1);
  }

  const shouldCreate = await confirm(
    '  App not found. Create it now? (requires Apple ID session)',
    { assumable: true },
  );

  if (shouldCreate) {
    await runStreaming('asc', [
      'web', 'apps', 'create',
      '--name', config.name,
      '--bundle-id', config.bundle_id,
      '--sku', config.sku,
      '--apple-id', kappConfig.appleId,
    ], { label: `Creating app: ${config.name}` });

    const appId = await findAppByBundleId(config.bundle_id);
    if (appId) return appId;

    logger.fatal('App creation may have failed. Check App Store Connect.');
    process.exit(1);
  }

  logger.fatal('App must exist on App Store Connect before configuring it.');
  logger.info('Create it manually at: https://appstoreconnect.apple.com/apps');
  logger.info('Or run again and choose yes to create via asc web apps create.');
  process.exit(1);
}

export async function updateContentRights(appId: string, contentRights: string): Promise<void> {
  await ascRun(['apps', 'update', '--id', appId, '--content-rights', contentRights, '--output', 'json'], 'Updating content rights');
  const back = await ascRun(['apps', 'view', '--id', appId, '--fields', 'contentRightsDeclaration', '--output', 'json'], 'Reading content rights back');
  expectFields('Content rights', attrsOf(back.json), { contentRightsDeclaration: contentRights });
}

/**
 * Create the version, or update the existing one (copyright and release type),
 * then read the copyright back. It used to create with allowFailure and, when
 * the version existed, only look its id up: the copyright never reached it.
 */
export async function createVersion(appId: string, version: AppStoreVersionConfig, platform: string): Promise<string> {
  const args = [
    'versions', 'create',
    '--app', appId,
    '--platform', platform,
    '--version', version.version_string,
    '--release-type', version.release_type,
    '--if-exists', 'update',
    '--output', 'json',
  ];
  if (version.copyright) args.push('--copyright', version.copyright);
  const created = await ascRun(args, `Creating or updating version ${version.version_string}`);
  const versionId = parseVersionId(created.stdout) ?? (await findVersionId(appId, platform, version.version_string));
  const back = await ascRun(['versions', 'view', '--version-id', versionId, '--include', 'appStoreReviewDetail', '--output', 'json'], 'Reading version back');
  expectFields(`Version ${version.version_string}`, attrsOf(back.json), {
    versionString: version.version_string,
    copyright: version.copyright || undefined,
  });
  return versionId;
}

export async function setCategories(appId: string, categories: AppStoreCategoriesConfig): Promise<void> {
  const args = ['categories', 'set', '--app', appId, '--primary', categories.primary];
  if (categories.secondary) args.push('--secondary', categories.secondary);
  if (categories.primary_subcategory_one) args.push('--primary-subcategory-one', categories.primary_subcategory_one);
  if (categories.primary_subcategory_two) args.push('--primary-subcategory-two', categories.primary_subcategory_two);
  if (categories.secondary_subcategory_one) args.push('--secondary-subcategory-one', categories.secondary_subcategory_one);
  if (categories.secondary_subcategory_two) args.push('--secondary-subcategory-two', categories.secondary_subcategory_two);
  await ascRun(args, 'Setting categories');
}

// Map config keys to asc CLI flag names (they differ significantly)
const AGE_RATING_FLAG_MAP: Record<string, string> = {
  alcohol_tobacco_or_drug_use_or_references: 'alcohol-tobacco-drug-use',
  contests: 'contests',
  gambling_simulated: 'gambling-simulated',
  guns_or_other_weapons: 'guns-or-other-weapons',
  medical_or_treatment_information: 'medical-treatment',
  profanity_or_crude_humor: 'profanity-humor',
  sexual_content_graphic_and_nudity: 'sexual-content-graphic-nudity',
  sexual_content_or_nudity: 'sexual-content-nudity',
  horror_or_fear_themes: 'horror-fear',
  mature_or_suggestive_themes: 'mature-suggestive',
  violence_cartoon_or_fantasy: 'violence-cartoon',
  violence_realistic: 'violence-realistic',
  violence_realistic_prolonged_graphic_or_sadistic: 'violence-realistic-graphic',
  advertising: 'advertising',
  age_assurance: 'age-assurance',
  gambling: 'gambling',
  health_or_wellness_topics: 'health-or-wellness-topics',
  loot_box: 'loot-box',
  messaging_and_chat: 'messaging-and-chat',
  parental_controls: 'parental-controls',
  unrestricted_web_access: 'unrestricted-web-access',
  user_generated_content: 'user-generated-content',
  social_media: 'social-media',
  social_media_age_restricted: 'social-media-age-restricted',
};

/** camelCase attribute name Apple returns for each config key. */
function ageRatingAttr(key: string): string {
  const special: Record<string, string> = {
    alcohol_tobacco_or_drug_use_or_references: 'alcoholTobaccoOrDrugUseOrReferences',
    violence_cartoon_or_fantasy: 'violenceCartoonOrFantasy',
    violence_realistic_prolonged_graphic_or_sadistic: 'violenceRealisticProlongedGraphicOrSadistic',
    gambling: 'gambling',
  };
  return special[key] ?? key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

/** asc args for the age rating: --all-none, then every answer explicitly (booleans included). */
export function ageRatingArgs(appId: string, ageRating: AppStoreAgeRatingConfig): string[] {
  const args = ['age-rating', 'edit', '--app', appId, '--all-none'];
  for (const [key, value] of Object.entries(ageRating)) {
    if (value === undefined || value === '') continue;
    const flag = AGE_RATING_FLAG_MAP[key];
    if (!flag) continue;
    // Send false and NONE too: the newer questionnaire fields (social media,
    // UGC, messaging) stay unanswered on Apple's side unless set explicitly.
    args.push(`--${flag}`, String(value));
  }
  return args;
}

export async function setAgeRating(appId: string, ageRating: AppStoreAgeRatingConfig): Promise<void> {
  const rating: AppStoreAgeRatingConfig = {
    // New questionnaire answers default to "no" so the declaration is complete.
    social_media: false,
    messaging_and_chat: false,
    user_generated_content: false,
    ...ageRating,
  };
  await ascRun(ageRatingArgs(appId, rating), 'Setting age rating');
  const back = await ascRun(['age-rating', 'view', '--app', appId, '--output', 'json'], 'Reading age rating back');
  const got = attrsOf(back.json);
  const want: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rating)) {
    if (value === undefined || value === '' || !AGE_RATING_FLAG_MAP[key]) continue;
    // Only compare fields Apple returns (older declarations lack some).
    if (ageRatingAttr(key) in got) want[ageRatingAttr(key)] = value;
  }
  expectFields('Age rating', got, want);
}

export async function updateLocalization(
  versionId: string,
  appId: string,
  loc: AppStoreLocalization,
): Promise<void> {
  const versionArgs = ['localizations', 'update', '--version', versionId, '--locale', loc.locale];
  if (loc.description) versionArgs.push('--description', loc.description);
  if (loc.keywords) versionArgs.push('--keywords', loc.keywords);
  if (loc.whats_new) versionArgs.push('--whats-new', loc.whats_new);
  if (loc.promotional_text) versionArgs.push('--promotional-text', loc.promotional_text);
  if (loc.support_url) versionArgs.push('--support-url', loc.support_url);
  if (loc.marketing_url) versionArgs.push('--marketing-url', loc.marketing_url);
  if (versionArgs.length > 6) await ascRun(versionArgs, `Updating version localization (${loc.locale})`);

  if (loc.subtitle || loc.privacy_policy_url) {
    const appArgs = ['localizations', 'update', '--app', appId, '--type', 'app-info', '--locale', loc.locale];
    if (loc.subtitle) appArgs.push('--subtitle', loc.subtitle);
    if (loc.privacy_policy_url) appArgs.push('--privacy-policy-url', loc.privacy_policy_url);
    await ascRun(appArgs, `Updating app-info localization (${loc.locale})`);
  }
}

export async function setEncryption(appId: string, encryption: AppStoreEncryptionConfig): Promise<void> {
  await run(
    'asc',
    [
      'encryption', 'declarations', 'create',
      '--app', appId,
      '--app-description', encryption.description,
      '--contains-proprietary-cryptography', String(encryption.contains_proprietary_cryptography),
      '--contains-third-party-cryptography', String(encryption.contains_third_party_cryptography),
      '--available-on-french-store', String(encryption.available_on_french_store),
      '--output', 'json',
    ],
    { label: 'Setting encryption declarations', allowFailure: true },
  );
  // Read back: at least one declaration must exist (a re-run may be refused
  // as a duplicate, which is fine as long as one is there).
  const back = await ascRun(['encryption', 'declarations', 'list', '--app', appId, '--output', 'json'], 'Reading encryption declarations back');
  const list = Array.isArray(back.json?.data) ? back.json.data : [];
  if (list.length === 0) throw new CliError('No encryption declaration exists on App Store Connect after creating one.');
}

/** Whether App Review needs demo credentials: explicit config wins, else only when credentials are set. */
export function demoAccountRequired(info: AppStoreReviewInfoConfig): boolean {
  if (typeof info.demo_account_required === 'boolean') return info.demo_account_required;
  return Boolean(info.demo_username || info.demo_password);
}

export function reviewDetailArgs(versionId: string, info: AppStoreReviewInfoConfig): string[] {
  const required = demoAccountRequired(info);
  const args = [
    'review', 'details-create',
    '--version-id', versionId,
    '--contact-email', info.contact_email,
    '--contact-first-name', info.contact_first_name,
    '--contact-last-name', info.contact_last_name,
    '--contact-phone', info.contact_phone,
    // Go bool flag: needs '='. Always explicit: a no-login app must say false.
    `--demo-account-required=${required}`,
    '--if-exists', 'update',
    '--output', 'json',
  ];
  if (required && info.demo_username) args.push('--demo-account-name', info.demo_username);
  if (required && info.demo_password) args.push('--demo-account-password', info.demo_password);
  if (info.notes) args.push('--notes', info.notes);
  return args;
}

/**
 * Create (or update) the App Review detail and read it back. It used to run
 * with allowFailure: a missing phone or an existing detail meant no detail at
 * all while the step printed OK, and `deliver` later crashed with "No data".
 */
export async function setReviewDetails(versionId: string, info: AppStoreReviewInfoConfig): Promise<void> {
  const missing = (['contact_first_name', 'contact_last_name', 'contact_email', 'contact_phone'] as const).filter((k) => !info[k]?.trim());
  if (missing.length > 0) {
    throw new CliError(`review_info is missing ${missing.join(', ')}; App Store Connect rejects a review detail without them.`);
  }
  await ascRun(reviewDetailArgs(versionId, info), 'Setting review details');
  const back = await ascRun(['review', 'details-for-version', '--version-id', versionId, '--output', 'json'], 'Reading review details back');
  if (!back.json?.data) throw new CliError('App Store Connect has no review detail for this version after creating one.');
  expectFields('Review details', attrsOf(back.json), {
    contactEmail: info.contact_email,
    demoAccountRequired: demoAccountRequired(info),
  });
}

export async function setPrivacy(appId: string, privacyFilePath: string): Promise<void> {
  // Privacy requires Apple ID auth (asc web privacy is experimental)
  const config = await loadConfig();
  if (!config.appleId) {
    throw new CliError('Apple ID not configured; privacy setup needs it. Set it with: kappmaker config appstore-defaults --init');
  }

  logger.info('Applying privacy data usages...');
  const applyArgs = [
    'web', 'privacy', 'apply',
    '--app', appId,
    '--file', privacyFilePath,
    '--apple-id', config.appleId,
    '--allow-deletes',
    '--confirm',
    '--output', 'json',
  ];
  const applied = await runStreaming('asc', applyArgs, { label: 'Applying privacy data usages', allowFailure: true });
  if (applied !== 0) throw new CliError(`asc web privacy apply exited ${applied} (see its output above).`);

  const publishArgs = [
    'web', 'privacy', 'publish',
    '--app', appId,
    '--apple-id', config.appleId,
    '--confirm',
    '--output', 'json',
  ];
  const published = await runStreaming('asc', publishArgs, { label: 'Publishing privacy data usages', allowFailure: true });
  if (published !== 0) throw new CliError(`asc web privacy publish exited ${published} (see its output above).`);
}

// ── Internal helpers ────────────────────────────────────────────────

function parseAppId(output: string): string | null {
  try {
    const data = JSON.parse(output);
    return data?.data?.id ?? data?.id ?? null;
  } catch {
    const match = output.match(/["']?id["']?\s*[:=]\s*["']?(\d+)["']?/);
    return match?.[1] ?? null;
  }
}

function parseVersionId(output: string): string | null {
  try {
    const data = JSON.parse(output);
    return data?.data?.id ?? data?.id ?? null;
  } catch {
    const match = output.match(/["']?id["']?\s*[:=]\s*["']?([a-zA-Z0-9-]+)["']?/);
    return match?.[1] ?? null;
  }
}

export async function findAppByBundleId(bundleId: string): Promise<string | null> {
  // Filter server-side: an unfiltered list is only the first page.
  const result = await run('asc', ['apps', 'list', '--bundle-id', bundleId, '--output', 'json'], {
    label: 'Looking up existing app',
    allowFailure: true,
  });

  if (result.exitCode === 0) {
    try {
      const data = JSON.parse(result.stdout);
      const apps = data?.data ?? data ?? [];
      for (const app of apps) {
        const attrs = app.attributes ?? app;
        if (attrs.bundleId === bundleId || attrs.bundle_id === bundleId) {
          return app.id;
        }
      }
    } catch {
      // Fall through
    }
  }

  return null;
}

async function findVersionId(appId: string, platform: string, versionString?: string): Promise<string> {
  const args = ['versions', 'list', '--app', appId, '--platform', platform, '--output', 'json'];
  if (versionString) args.push('--version', versionString);
  const result = await ascRun(args, 'Looking up existing version');
  const versions = result.json?.data ?? [];
  if (Array.isArray(versions) && versions.length > 0 && versions[0].id) return versions[0].id;
  throw new CliError(`Could not find version ${versionString ?? ''} for app "${appId}".`);
}
