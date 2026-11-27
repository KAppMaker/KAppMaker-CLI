import chalk from 'chalk';
import { apiRequest } from './gpc.service.js';
import { logger } from '../utils/logger.js';
import { confirm, isInteractive, assumeYes } from '../utils/prompt.js';
import { CliError } from '../utils/errors.js';
import type { GooglePlayListing } from '../types/googleplay.js';

/**
 * Store listings, done safely.
 *
 * `PUT /edits/{id}/listings/{lang}` REPLACES the whole listing: a field left out
 * of the body is cleared on Play. The old code sent only the non-empty config
 * fields, so a config with an empty en-US entry blanked the live descriptions.
 * Now every push starts from the live listing, overlays only the fields the
 * config fills in, shows the diff, refuses to clear a live field unless
 * --allow-empty, and reads the listing back before the edit is committed.
 */

export interface PlayListing {
  language: string;
  title?: string;
  shortDescription?: string;
  fullDescription?: string;
  video?: string;
}

type Field = 'title' | 'shortDescription' | 'fullDescription' | 'video';
const FIELDS: Array<{ field: Field; key: keyof GooglePlayListing }> = [
  { field: 'title', key: 'title' },
  { field: 'shortDescription', key: 'short_description' },
  { field: 'fullDescription', key: 'full_description' },
  { field: 'video', key: 'video' },
];

export interface FieldChange {
  field: Field;
  from: string;
  to: string;
  clears: boolean;
}

export interface ListingPlan {
  locale: string;
  /** Full body to PUT (live merged with config), or null when nothing to send. */
  body: PlayListing | null;
  changes: FieldChange[];
  isNew: boolean;
  /** Why nothing is sent for this locale. */
  skipReason?: string;
}

/** Pure: what would change for one locale. Empty config strings never touch Play unless allowEmpty. */
export function planListing(
  live: PlayListing | undefined,
  cfg: GooglePlayListing,
  allowEmpty: boolean,
  fallbackTitle?: string,
): ListingPlan {
  // The app name stands in for a missing title only where Play has no title yet,
  // never over a live one.
  if (!cfg.title?.trim() && !live?.title?.trim() && fallbackTitle?.trim()) cfg = { ...cfg, title: fallbackTitle.trim() };
  const body: PlayListing = { ...(live ?? {}), language: cfg.locale };
  const changes: FieldChange[] = [];
  for (const { field, key } of FIELDS) {
    const raw = cfg[key];
    if (raw === undefined || raw === null) continue;
    const want = String(raw).trim();
    const have = (live?.[field] ?? '').trim();
    if (want === '') {
      if (!allowEmpty || have === '') continue; // never push an empty field
      changes.push({ field, from: have, to: '', clears: true });
      body[field] = '';
      continue;
    }
    if (want !== have) {
      changes.push({ field, from: have, to: want, clears: false });
      body[field] = want;
    }
  }
  if (!live && !body.title) {
    return { locale: cfg.locale, body: null, changes: [], isNew: true, skipReason: 'no title (Play needs one for a new locale)' };
  }
  if (changes.length === 0) {
    return { locale: cfg.locale, body: null, changes, isNew: !live, skipReason: live ? 'already matches Play' : 'nothing filled in' };
  }
  return { locale: cfg.locale, body, changes, isNew: !live };
}

/** What would be cleared if the config's empty fields were allowed through. */
export function wouldClear(live: PlayListing | undefined, cfg: GooglePlayListing): Field[] {
  return planListing(live, cfg, true).changes.filter((c) => c.clears).map((c) => c.field);
}

export async function fetchLiveListings(packageName: string, editId: string): Promise<Map<string, PlayListing>> {
  const result = await apiRequest<{ listings?: PlayListing[] }>({
    method: 'GET',
    path: `/applications/${encodeURIComponent(packageName)}/edits/${editId}/listings`,
    label: 'Reading live store listings',
  });
  return new Map((result.data?.listings ?? []).map((l) => [l.language, l]));
}

function short(text: string): string {
  const one = text.replace(/\s+/g, ' ');
  return one.length > 70 ? `${one.slice(0, 67)}...` : one || '(empty)';
}

export function printListingDiff(plans: ListingPlan[]): void {
  for (const p of plans) {
    if (!p.body) {
      logger.info(`Listing ${p.locale}: unchanged (${p.skipReason}).`);
      continue;
    }
    console.log(`    ${chalk.bold(p.locale)}${p.isNew ? chalk.gray(' (new locale)') : ''}`);
    for (const c of p.changes) {
      const to = c.clears ? chalk.red('(CLEARED)') : chalk.green(short(c.to));
      console.log(`      ${c.field}: ${chalk.gray(short(c.from))} -> ${to}`);
    }
  }
}

export interface PushListingsResult {
  pushed: string[];
  unchanged: string[];
}

/**
 * Push listings inside an existing edit. Throws (caller drops the edit) when a
 * clear is refused, the user says no, Play rejects a PUT, or the read-back does
 * not match what was sent.
 */
export async function pushListings(
  packageName: string,
  editId: string,
  listings: GooglePlayListing[],
  opts: { allowEmpty?: boolean; fallbackTitle?: string } = {},
): Promise<PushListingsResult> {
  const live = await fetchLiveListings(packageName, editId);

  // A clear needs --allow-empty. Without it, empty config fields are just skipped,
  // but say which live fields they would have blanked.
  if (!opts.allowEmpty) {
    for (const cfg of listings) {
      const cleared = wouldClear(live.get(cfg.locale), cfg);
      if (cleared.length > 0) {
        logger.info(`Listing ${cfg.locale}: empty in config, kept on Play: ${cleared.join(', ')} (pass --allow-empty to clear them).`);
      }
    }
  }

  const plans = listings.map((cfg) => planListing(live.get(cfg.locale), cfg, opts.allowEmpty === true, opts.fallbackTitle));
  const toSend = plans.filter((p) => p.body);
  printListingDiff(plans);
  if (toSend.length === 0) return { pushed: [], unchanged: plans.map((p) => p.locale) };

  const clears = toSend.flatMap((p) => p.changes.filter((c) => c.clears).map((c) => `${p.locale}.${c.field}`));
  if (clears.length > 0) {
    logger.warn(`This push CLEARS live Play fields: ${clears.join(', ')}`);
    // --allow-empty is the explicit flag for this; still ask a human at a terminal.
    if (isInteractive() && !assumeYes()) {
      const ok = await confirm('  Clear these live fields on Google Play?', { destructive: true });
      if (!ok) throw new CliError('Listings push cancelled: nothing was changed on Play.');
    }
  } else if (toSend.some((p) => !p.isNew)) {
    const ok = await confirm('  Apply these listing changes on Google Play?');
    if (!ok) throw new CliError('Listings push cancelled: nothing was changed on Play.');
  }

  for (const p of toSend) {
    await apiRequest({
      method: 'PUT',
      path: `/applications/${encodeURIComponent(packageName)}/edits/${editId}/listings/${encodeURIComponent(p.locale)}`,
      body: p.body,
      label: `Updating listing (${p.locale})`,
    });
  }

  // Read back inside the edit: what Play holds must equal what was sent.
  const after = await fetchLiveListings(packageName, editId);
  const mismatches: string[] = [];
  for (const p of toSend) {
    const got = after.get(p.locale);
    for (const { field } of FIELDS) {
      const want = (p.body?.[field] ?? '').trim();
      const have = (got?.[field] ?? '').trim();
      if (want !== have) mismatches.push(`${p.locale}.${field}`);
    }
  }
  if (mismatches.length > 0) {
    throw new CliError(`Listing read-back does not match what was sent: ${mismatches.join(', ')}. The edit was not committed.`);
  }
  logger.success(`Listing read-back matches for ${toSend.map((p) => p.locale).join(', ')}.`);
  return { pushed: toSend.map((p) => p.locale), unchanged: plans.filter((p) => !p.body).map((p) => p.locale) };
}
