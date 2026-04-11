import { execa } from 'execa';
import { run, runStreaming } from '../utils/exec.js';
import { logger } from '../utils/logger.js';
import { confirm } from '../utils/prompt.js';
import { loadConfig } from '../utils/config.js';
import type {
  AppStoreAppConfig,
  AppStoreVersionConfig,
  AppStoreCategoriesConfig,
  AppStoreAgeRatingConfig,
  AppStoreLocalization,
  AppStoreEncryptionConfig,
  AppStoreReviewInfoConfig,
} from '../types/appstore.js';

// Minimum supported asc CLI version. v1.0 removed compatibility shims for
// `apps create`, `age-rating set`, `submit preflight`, `release run`, etc.
// See https://docs.asccli.sh/migrate-to-1-0
const MIN_ASC_VERSION = '1.2.1';

export async function validateAscInstalled(): Promise<void> {
  let versionOutput: string | null = null;
  try {
    const result = await execa('asc', ['--version']);
    versionOutput = result.stdout;
  } catch {
    logger.warn('asc CLI is not installed.');
    console.log('');
    const shouldInstall = await confirm('  Would you like to install it? (brew install asc)');
    if (shouldInstall) {
      await runStreaming('brew', ['install', 'asc'], { label: 'Installing asc CLI...' });
    } else {
      logger.fatal('asc CLI is required. Install manually: brew install asc');
      process.exit(1);
    }
    return;
  }

  if (versionOutput && !meetsMinimumVersion(versionOutput, MIN_ASC_VERSION)) {
    const found = versionOutput.match(/\d+\.\d+\.\d+/)?.[0] ?? versionOutput.trim();
    logger.warn(`asc CLI ${found} is older than ${MIN_ASC_VERSION}. Some commands may fail.`);
    logger.info('Upgrade with: brew upgrade asc');
    logger.info('Migration notes: https://docs.asccli.sh/migrate-to-1-0');
  }
}

function meetsMinimumVersion(versionString: string, minimum: string): boolean {
  const match = versionString.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return true; // Unknown format — don't block
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

export async function validateAscAuth(): Promise<void> {
  const result = await run('asc', ['auth', 'status', '--validate'], {
    label: 'Checking App Store Connect authentication',
    allowFailure: true,
  });

  // Check both exit code and whether credentials actually exist
  const hasCredentials = result.exitCode === 0 && !result.stdout.includes('"credentials":[]');
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
    const shouldLogin = await confirm('  Would you like to log in interactively? (asc auth login)');
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

export async function createBundleId(bundleId: string, name: string, platform: string): Promise<void> {
  const result = await run(
    'asc',
    ['bundle-ids', 'create', '--identifier', bundleId, '--name', name, '--platform', platform],
    { label: `Creating bundle ID: ${bundleId}`, allowFailure: true },
  );
  if (result.exitCode !== 0) {
    logger.info(`Bundle ID "${bundleId}" may already exist, continuing...`);
  }
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
  await run('asc', [
    'apps', 'update',
    '--id', appId,
    '--content-rights', contentRights,
    '--output', 'json',
  ], {
    label: 'Updating content rights',
    allowFailure: true,
  });
}

export async function createVersion(appId: string, version: AppStoreVersionConfig, platform: string): Promise<string> {
  const result = await run(
    'asc',
    [
      'versions', 'create',
      '--app', appId,
      '--platform', platform,
      '--version', version.version_string,
      '--copyright', version.copyright,
      '--release-type', version.release_type,
      '--output', 'json',
    ],
    { label: `Creating version ${version.version_string}`, allowFailure: true },
  );

  if (result.exitCode === 0) {
    const versionId = parseVersionId(result.stdout);
    if (versionId) return versionId;
  }

  logger.info('Version may already exist, looking up...');
  return findVersionId(appId, platform);
}

export async function setCategories(appId: string, categories: AppStoreCategoriesConfig): Promise<void> {
  const args = ['categories', 'set', '--app', appId, '--primary', categories.primary];
  if (categories.secondary) args.push('--secondary', categories.secondary);
  if (categories.primary_subcategory_one) args.push('--primary-subcategory-one', categories.primary_subcategory_one);
  if (categories.primary_subcategory_two) args.push('--primary-subcategory-two', categories.primary_subcategory_two);
  if (categories.secondary_subcategory_one) args.push('--secondary-subcategory-one', categories.secondary_subcategory_one);
  if (categories.secondary_subcategory_two) args.push('--secondary-subcategory-two', categories.secondary_subcategory_two);
  await run('asc', args, { label: 'Setting categories', allowFailure: true });
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
};

export async function setAgeRating(appId: string, ageRating: AppStoreAgeRatingConfig): Promise<void> {
  // v1.0 renamed `asc age-rating set` → `asc age-rating edit`.
  // Start with --all-none to set safe defaults, then override any non-default values.
  const args = ['age-rating', 'edit', '--app', appId, '--all-none'];

  for (const [key, value] of Object.entries(ageRating)) {
    if (value === undefined || value === '' || value === 'NONE' || value === false) continue;
    const flag = AGE_RATING_FLAG_MAP[key];
    if (flag) {
      args.push(`--${flag}`, String(value));
    }
  }

  await run('asc', args, { label: 'Setting age rating', allowFailure: true });
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
  await run('asc', versionArgs, { label: `Updating version localization (${loc.locale})`, allowFailure: true });

  if (loc.subtitle || loc.privacy_policy_url) {
    const appArgs = ['localizations', 'update', '--app', appId, '--type', 'app-info', '--locale', loc.locale];
    if (loc.subtitle) appArgs.push('--subtitle', loc.subtitle);
    if (loc.privacy_policy_url) appArgs.push('--privacy-policy-url', loc.privacy_policy_url);
    await run('asc', appArgs, { label: `Updating app-info localization (${loc.locale})`, allowFailure: true });
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
}

export async function setReviewDetails(versionId: string, info: AppStoreReviewInfoConfig): Promise<void> {
  const args = [
    'review', 'details-create',
    '--version-id', versionId,
    '--contact-email', info.contact_email,
    '--contact-first-name', info.contact_first_name,
    '--contact-last-name', info.contact_last_name,
    '--contact-phone', info.contact_phone,
    '--output', 'json',
  ];
  if (info.demo_username) args.push('--demo-account-name', info.demo_username);
  if (info.demo_password) args.push('--demo-account-password', info.demo_password);
  if (info.notes) args.push('--notes', info.notes);
  await run('asc', args, { label: 'Setting review details', allowFailure: true });
}

export async function setPrivacy(appId: string, privacyFilePath: string): Promise<void> {
  // Privacy requires Apple ID auth (asc web privacy is experimental)
  const config = await loadConfig();
  if (!config.appleId) {
    logger.warn('Apple ID not configured. Privacy setup requires Apple ID.');
    logger.info('Set it with: kappmaker config appstore-defaults --init');
    return;
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
  await runStreaming('asc', applyArgs, { label: 'Applying privacy data usages', allowFailure: true });

  const publishArgs = [
    'web', 'privacy', 'publish',
    '--app', appId,
    '--apple-id', config.appleId,
    '--confirm',
    '--output', 'json',
  ];
  await runStreaming('asc', publishArgs, { label: 'Publishing privacy data usages', allowFailure: true });
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
  const result = await run('asc', ['apps', 'list', '--output', 'json'], {
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

async function findVersionId(appId: string, platform: string): Promise<string> {
  const result = await run('asc', ['versions', 'list', '--app', appId, '--output', 'json'], {
    label: 'Looking up existing version',
    allowFailure: true,
  });

  if (result.exitCode === 0) {
    try {
      const data = JSON.parse(result.stdout);
      const versions = data?.data ?? data ?? [];
      if (versions.length > 0) return versions[0].id;
    } catch {
      // Fall through to error
    }
  }

  logger.fatal(`Could not find version for app "${appId}".`);
  process.exit(1);
}
