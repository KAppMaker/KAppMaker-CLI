import type { GooglePlayDataSafety } from '../types/googleplay.js';
import template from '../templates/data-safety-template.json' with { type: 'json' };

/**
 * Google Play Data Safety form is submitted as a CSV file wrapped in a JSON
 * body: `POST /applications/{pkg}/dataSafety`, body `{ safetyLabels: "<csv>" }`.
 *
 * This service owns the JSON → CSV conversion. It loads a canonical template
 * (extracted from the well-maintained fastlane-plugin-google_data_safety
 * project), applies kappmaker's opinionated defaults, then overlays the
 * caller's answers before serializing to CSV.
 *
 * Template rows have the shape:
 *   [Question ID, Response ID | null, Response value | null, Answer requirement, Human label]
 *
 * Answer-keys in {@link GooglePlayDataSafety.answers} can be:
 *   - "QID"           → fills single-answer rows where Response ID is null
 *   - "QID/RID"       → fills the matching multi-choice row
 *   - "QID:RID"       → alternative composite syntax; same as "QID/RID"
 */

type TemplateRow = [string, string | null, string | null, string, string];
const rows = template as unknown as TemplateRow[];

/**
 * KAppMaker defaults — mirror the App Store Connect privacy defaults as closely
 * as the Play Data Safety schema allows. Review before publishing to production.
 *
 * iOS → Play mapping:
 *   USER_ID               → PSL_USER_ACCOUNT           (Personal info, App functionality)
 *   DEVICE_ID             → PSL_DEVICE_ID              (Identifiers, Analytics)
 *   CRASH_DATA            → PSL_CRASH_LOGS             (App info, Analytics)
 *   PERFORMANCE_DATA      → PSL_OTHER_PERFORMANCE      (App info, Analytics)
 *   OTHER_DIAGNOSTIC_DATA → PSL_PERFORMANCE_DIAGNOSTICS(App info, Analytics)
 *   OTHER_USAGE_DATA      → PSL_OTHER_APP_ACTIVITY     (App activity, Analytics)
 *   PRODUCT_INTERACTION   → PSL_USER_INTERACTION    (App activity, Analytics)
 *
 * Defaults:
 *   - Account creation: "My app does not allow users to create an account"
 *   - Data deletion: skipped (OPTIONAL question — omitted entirely)
 *   - App activity: only "App interactions" (PSL_USER_INTERACTION), NOT "Other"
 *   - Data handling for ALL collected types:
 *     • Ephemeral = YES (processed ephemerally)
 *     • User control = REQUIRED (users can't turn off collection)
 *     • Collected only (not shared with third parties)
 *   - Encrypted in transit: YES
 *   - No sensitive data (no health, no financial, no location, no personal info)
 */
const KAPPMAKER_DEFAULTS: Record<string, boolean | string> = {
  // ── Top-level disclosures ─────────────────────────────────────────
  PSL_DATA_COLLECTION_COLLECTS_PERSONAL_DATA: true,
  PSL_DATA_COLLECTION_ENCRYPTED_IN_TRANSIT: true,

  // Account creation: "My app does not allow users to create an account"
  'PSL_SUPPORTED_ACCOUNT_CREATION_METHODS/PSL_ACM_NONE': true,
  // Can users log in with accounts created outside the app? → No
  PSL_HAS_OUTSIDE_APP_ACCOUNTS: false,
  // Do you provide a way for users to request deletion? → skip (OPTIONAL)
  // PSL_SUPPORT_DATA_DELETION_BY_USER — omitted, optional question

  // ── Data type: Personal info / User IDs ────────────────────────────
  'PSL_DATA_TYPES_PERSONAL/PSL_USER_ACCOUNT': true,
  'PSL_DATA_USAGE_RESPONSES:PSL_USER_ACCOUNT:PSL_DATA_USAGE_COLLECTION_AND_SHARING/PSL_DATA_USAGE_ONLY_COLLECTED': true,
  'PSL_DATA_USAGE_RESPONSES:PSL_USER_ACCOUNT:PSL_DATA_USAGE_EPHEMERAL': true,
  'PSL_DATA_USAGE_RESPONSES:PSL_USER_ACCOUNT:DATA_USAGE_USER_CONTROL/PSL_DATA_USAGE_USER_CONTROL_REQUIRED': true,
  'PSL_DATA_USAGE_RESPONSES:PSL_USER_ACCOUNT:DATA_USAGE_COLLECTION_PURPOSE/PSL_APP_FUNCTIONALITY': true,

  // ── Data type: Identifiers / Device ID ────────────────────────────
  'PSL_DATA_TYPES_IDENTIFIERS/PSL_DEVICE_ID': true,
  // Data handling: collected only (not shared), ephemeral, collection required
  'PSL_DATA_USAGE_RESPONSES:PSL_DEVICE_ID:PSL_DATA_USAGE_COLLECTION_AND_SHARING/PSL_DATA_USAGE_ONLY_COLLECTED': true,
  'PSL_DATA_USAGE_RESPONSES:PSL_DEVICE_ID:PSL_DATA_USAGE_EPHEMERAL': true,
  'PSL_DATA_USAGE_RESPONSES:PSL_DEVICE_ID:DATA_USAGE_USER_CONTROL/PSL_DATA_USAGE_USER_CONTROL_REQUIRED': true,
  'PSL_DATA_USAGE_RESPONSES:PSL_DEVICE_ID:DATA_USAGE_COLLECTION_PURPOSE/PSL_ANALYTICS': true,
  'PSL_DATA_USAGE_RESPONSES:PSL_DEVICE_ID:DATA_USAGE_COLLECTION_PURPOSE/PSL_APP_FUNCTIONALITY': true,

  // ── Data type: App info / Crash logs ──────────────────────────────
  'PSL_DATA_TYPES_APP_PERFORMANCE/PSL_CRASH_LOGS': true,
  'PSL_DATA_USAGE_RESPONSES:PSL_CRASH_LOGS:PSL_DATA_USAGE_COLLECTION_AND_SHARING/PSL_DATA_USAGE_ONLY_COLLECTED': true,
  'PSL_DATA_USAGE_RESPONSES:PSL_CRASH_LOGS:PSL_DATA_USAGE_EPHEMERAL': true,
  'PSL_DATA_USAGE_RESPONSES:PSL_CRASH_LOGS:DATA_USAGE_USER_CONTROL/PSL_DATA_USAGE_USER_CONTROL_REQUIRED': true,
  'PSL_DATA_USAGE_RESPONSES:PSL_CRASH_LOGS:DATA_USAGE_COLLECTION_PURPOSE/PSL_ANALYTICS': true,

  // ── Data type: App info / Performance diagnostics ─────────────────
  'PSL_DATA_TYPES_APP_PERFORMANCE/PSL_PERFORMANCE_DIAGNOSTICS': true,
  'PSL_DATA_USAGE_RESPONSES:PSL_PERFORMANCE_DIAGNOSTICS:PSL_DATA_USAGE_COLLECTION_AND_SHARING/PSL_DATA_USAGE_ONLY_COLLECTED': true,
  'PSL_DATA_USAGE_RESPONSES:PSL_PERFORMANCE_DIAGNOSTICS:PSL_DATA_USAGE_EPHEMERAL': true,
  'PSL_DATA_USAGE_RESPONSES:PSL_PERFORMANCE_DIAGNOSTICS:DATA_USAGE_USER_CONTROL/PSL_DATA_USAGE_USER_CONTROL_REQUIRED': true,
  'PSL_DATA_USAGE_RESPONSES:PSL_PERFORMANCE_DIAGNOSTICS:DATA_USAGE_COLLECTION_PURPOSE/PSL_ANALYTICS': true,

  // ── Data type: App info / Other performance ──────────────────────
  'PSL_DATA_TYPES_APP_PERFORMANCE/PSL_OTHER_PERFORMANCE': true,
  'PSL_DATA_USAGE_RESPONSES:PSL_OTHER_PERFORMANCE:PSL_DATA_USAGE_COLLECTION_AND_SHARING/PSL_DATA_USAGE_ONLY_COLLECTED': true,
  'PSL_DATA_USAGE_RESPONSES:PSL_OTHER_PERFORMANCE:PSL_DATA_USAGE_EPHEMERAL': true,
  'PSL_DATA_USAGE_RESPONSES:PSL_OTHER_PERFORMANCE:DATA_USAGE_USER_CONTROL/PSL_DATA_USAGE_USER_CONTROL_REQUIRED': true,
  'PSL_DATA_USAGE_RESPONSES:PSL_OTHER_PERFORMANCE:DATA_USAGE_COLLECTION_PURPOSE/PSL_ANALYTICS': true,

  // ── Data type: App activity / App interactions (only this one, not "Other") ──
  'PSL_DATA_TYPES_APP_ACTIVITY/PSL_USER_INTERACTION': true,
  'PSL_DATA_USAGE_RESPONSES:PSL_USER_INTERACTION:PSL_DATA_USAGE_COLLECTION_AND_SHARING/PSL_DATA_USAGE_ONLY_COLLECTED': true,
  'PSL_DATA_USAGE_RESPONSES:PSL_USER_INTERACTION:PSL_DATA_USAGE_EPHEMERAL': true,
  'PSL_DATA_USAGE_RESPONSES:PSL_USER_INTERACTION:DATA_USAGE_USER_CONTROL/PSL_DATA_USAGE_USER_CONTROL_REQUIRED': true,
  'PSL_DATA_USAGE_RESPONSES:PSL_USER_INTERACTION:DATA_USAGE_COLLECTION_PURPOSE/PSL_ANALYTICS': true,
};

/** Normalize ":"/"/" composite keys into a single canonical form used for lookup. */
function rowLookupKey(qid: string, rid: string | null): string {
  if (rid === null) return qid;
  return `${qid}/${rid}`;
}

/** Accept both "QID/RID" and "QID:RID" from user input. */
function normalizeAnswerKey(key: string): string {
  // "QID:RID" → "QID/RID"  (but preserve the inner "PSL_DATA_USAGE_RESPONSES:..." triple colons)
  // Only convert the LAST ":" before the trailing responseId, which is harder to
  // detect generically. Safer: accept both forms, try matching in buildAnswerMap.
  return key;
}

function buildAnswerMap(
  defaults: Record<string, boolean | string>,
  overrides: Record<string, boolean | string | null> | undefined,
): Map<string, boolean | string | null> {
  const merged = new Map<string, boolean | string | null>();
  for (const [k, v] of Object.entries(defaults)) merged.set(k, v);
  if (overrides) {
    for (const [k, v] of Object.entries(overrides)) {
      merged.set(normalizeAnswerKey(k), v);
    }
  }
  return merged;
}

/**
 * Render the CSV. Columns: Question ID, Response ID, Response value, Answer
 * requirement, Human-friendly question label. First row is the header from
 * the template.
 */
function renderCsv(filled: (string | null)[][]): string {
  return filled.map((row) => row.map(csvEscape).join(',')).join('\n');
}

function csvEscape(cell: string | null | undefined): string {
  if (cell === null || cell === undefined) return '';
  const s = String(cell);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Build a filled Data Safety CSV from a user-provided declaration.
 * Returns the CSV string ready to be wrapped in `{ safetyLabels: csv }`.
 */
export function buildDataSafetyCsv(declaration: GooglePlayDataSafety): string {
  const applyDefaults = declaration.apply_defaults !== false; // default true
  const answers = buildAnswerMap(
    applyDefaults ? KAPPMAKER_DEFAULTS : {},
    declaration.answers,
  );

  const filled: (string | null)[][] = rows.map((row, idx) => {
    if (idx === 0) return [...row]; // header row as-is
    const [qid, rid, , requirement, label] = row;
    const key = rowLookupKey(qid, rid);
    const answer = answers.get(key);

    let value: string | null = null;
    if (answer === true) value = 'TRUE';
    else if (answer === false) value = 'FALSE';
    else if (typeof answer === 'string') value = answer;
    // null / undefined → leave blank

    return [qid, rid, value, requirement, label];
  });

  return renderCsv(filled);
}

/**
 * Count how many REQUIRED / MAYBE_REQUIRED rows still have no value after
 * defaults + overrides — useful for a pre-flight warning.
 */
export function countUnansweredRequired(declaration: GooglePlayDataSafety): number {
  const answers = buildAnswerMap(
    declaration.apply_defaults !== false ? KAPPMAKER_DEFAULTS : {},
    declaration.answers,
  );
  let missing = 0;
  for (let i = 1; i < rows.length; i++) {
    const [qid, rid, , requirement] = rows[i];
    if (requirement !== 'REQUIRED') continue;
    const key = rowLookupKey(qid, rid);
    const a = answers.get(key);
    if (a === undefined || a === null) missing++;
  }
  return missing;
}
