import path from 'node:path';
import fs from 'fs-extra';
import { getConfigDir } from '../utils/config.js';

/**
 * Secrets never leave `kappmaker mcp` in tool output. Two layers:
 *  1. every secret VALUE the CLI's own config holds (exact-string replace), and
 *  2. shape patterns for secrets the CLI may print that are not in config
 *     (keystore passwords, private keys, tokens a child tool echoed).
 */

/** Config keys whose values are secret or personal (appleId is the buyer's email). */
export const SECRET_CONFIG_KEYS = [
  'falApiKey',
  'imgbbApiKey',
  'openaiApiKey',
  'ascKeyId',
  'ascIssuerId',
  'appleId',
  'revenuecatApiKey',
  'iosCertsRepoToken',
] as const;

/** Files in the config dir that are maps of `<app or store> -> secret`. */
const SECRET_MAP_FILES = ['revenuecat-keys.json', 'match-passwords.json'];

const MASK = '[redacted]';

const PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /"private_key"\s*:\s*"[^"]*"/g,
  /\b(sk|rk)_[A-Za-z0-9]{16,}\b/g, // RevenueCat / Stripe-style secret keys
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, // GitHub tokens
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bAIza[0-9A-Za-z_-]{30,}\b/g, // Google API keys (Stitch, Firebase web keys)
  /\bya29\.[0-9A-Za-z_.-]{20,}/g, // Google OAuth access tokens
  /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{12,}/gi,
];

/** `password=value` keeps the key name so the reader still knows what was there. */
const PASSWORD_RE = /\b(store_?password|key_?password|password|passwd|MATCH_PASSWORD)(\s*[=:]\s*)("[^"]*"|\S+)/gi;

export type Redactor = (text: string) => string;

export function makeRedactor(secretValues: string[]): Redactor {
  // Longest first so a secret that contains another is masked whole.
  const values = [...new Set(secretValues.filter((v) => typeof v === 'string' && v.trim().length >= 6))]
    .sort((a, b) => b.length - a.length);
  return (text: string) => {
    let out = text;
    for (const v of values) out = out.split(v).join(MASK);
    for (const re of PATTERNS) out = out.replace(re, MASK);
    return out.replace(PASSWORD_RE, `$1$2${MASK}`);
  };
}

/** Reads every secret value the CLI's config holds. Missing/corrupt files are skipped. */
export async function loadSecretValues(configDir: string = getConfigDir()): Promise<string[]> {
  const values: string[] = [];
  const cfg = await fs.readJson(path.join(configDir, 'config.json')).catch(() => ({}));
  for (const key of SECRET_CONFIG_KEYS) {
    if (typeof cfg[key] === 'string') values.push(cfg[key]);
  }
  for (const file of SECRET_MAP_FILES) {
    const map = await fs.readJson(path.join(configDir, file)).catch(() => ({}));
    collectStrings(map, values);
  }
  for (const name of ['REVENUECAT_API_KEY', 'ADAPTY_TOKEN', 'FAL_KEY', 'OPENAI_API_KEY', 'GITHUB_TOKEN', 'GH_TOKEN']) {
    if (process.env[name]) values.push(process.env[name]!);
  }
  return values;
}

function collectStrings(node: unknown, into: string[]): void {
  if (typeof node === 'string') into.push(node);
  else if (Array.isArray(node)) node.forEach((n) => collectStrings(n, into));
  else if (node && typeof node === 'object') Object.values(node).forEach((n) => collectStrings(n, into));
}
