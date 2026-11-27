#!/usr/bin/env node
// prepublish-check.mjs: refuse `npm publish` when the package would ship a secret, a secret-bearing file
// or one of the maintainer's private identifiers.
//
// It asks npm for the exact file list (`npm pack --dry-run --json`), so it checks what would really be
// uploaded, not the source tree. Matched values are never printed: only file:line and the rule name.
//
//   node scripts/prepublish-check.mjs            check the package (runs from prepublishOnly)
//   node scripts/prepublish-check.mjs --self-test  prove every rule fires, using canaries made at run time
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { randomInt } from 'node:crypto';

export const CONTENT_RULES = [
  ['telegram-bot-token', /\b\d{8,10}:AA[A-Za-z0-9_-]{30,}/],
  ['google-api-key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['google-oauth-client-secret', /GOCSPX-[A-Za-z0-9_-]{20,}/],
  ['pem-private-key', /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/],
  ['gcp-service-account', /"type"\s*:\s*"service_account"/],
  ['anthropic-key', /\bsk-ant-[a-z]+\d{2}-[A-Za-z0-9_-]{20,}/],
  ['openai-key', /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{32,}/],
  ['fal-key', /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{32}\b/],
  ['stripe-like-key', /\b[sr]k_(?:live|test)_[A-Za-z0-9]{16,}/],
  ['revenuecat-secret-key', /(?:^|[^A-Za-z0-9_])sk_[A-Za-z0-9]{24,}/],
  ['adapty-key', /\b(?:public|secret)_live_[A-Za-z0-9._-]{16,}/],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{60,})/],
  ['npm-token', /\bnpm_[A-Za-z0-9]{36}\b/],
  ['aws-access-key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['slack-token', /\bxox[abposr]-[A-Za-z0-9-]{10,}/],
  ['mailgun-key', /\bkey-[0-9a-f]{32}\b/],
  ['jwt', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['signing-password', /(?:storePassword|keyPassword|STORE_PASSWORD|KEY_PASSWORD)\s*[=:]\s*["']?[^$"'\s<{]{6,}/],
  // maintainer identifiers: a home path or a personal mailbox in a published file is a leak
  ['maintainer-home-path', /\/Users\/mirzemehdi\b|\/home\/devuser\b/],
  ['maintainer-email', /\bmirzemehdi@|\bkappmakerapp(?:\+[a-z0-9]+)?@gmail/],
  // com.measify.kappmaker / com.measify.myapp are the template's documented defaults; any other
  // com.measify.<app> is one of the maintainer's real apps
  ['maintainer-app-id', /\bcom\.measify\.(?!kappmaker\b|myapp\b)[a-z][A-Za-z0-9_]*/],
];
export const FILE_RULES = [
  /\.(?:p8|p12|pfx|jks|keystore|pem|key|sql)$/i, /(?:^|\/)\.env(?:\.|$)/, /(?:^|\/)\.(?:npmrc|netrc|pypirc)$/,
  /(?:^|\/)(?:google-services\.json|GoogleService-Info\.plist|local\.properties|(?:keystore|signing)\.properties)$/,
  /(?:^|\/)(?:service[-_]?account[^/]*|client_secret[^/]*|credentials|token|access)\.json$/i,
  /(?:^|\/)id_(?:rsa|ed25519|ecdsa)$/,
];

export function scanFiles(root, files) {
  const hits = [];
  for (const f of files) {
    if (FILE_RULES.some((r) => r.test(f))) hits.push(`${f}: secret-bearing file`);
    let text;
    try { text = readFileSync(join(root, f), 'utf8'); } catch { continue; }
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      for (const [name, re] of CONTENT_RULES) if (re.test(line)) hits.push(`${f}:${i + 1}: ${name}`);
    });
  }
  return hits;
}

function packFiles(root) {
  const out = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  return JSON.parse(out)[0].files.map((f) => f.path);
}

function selfTest() {
  const a = (n, cs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') =>
    Array.from({ length: n }, () => cs[randomInt(cs.length)]).join('');
  const hx = '0123456789abcdef';
  const canaries = {
    'telegram-bot-token': `${randomInt(1e8, 1e9)}:AA${a(33)}`, 'google-api-key': `AIza${a(35)}`,
    'google-oauth-client-secret': `GOCSPX-${a(28)}`, 'pem-private-key': '-----BEGIN ' + 'PRIVATE KEY-----',
    'gcp-service-account': '{"type": "service_' + 'account"}', 'anthropic-key': `sk-ant-api03-${a(48)}`,
    'openai-key': `sk-proj-${a(48)}`, 'fal-key': `${a(8, hx)}-${a(4, hx)}-${a(4, hx)}-${a(4, hx)}-${a(12, hx)}:${a(32, hx)}`,
    'stripe-like-key': `sk_live_${a(24)}`, 'revenuecat-secret-key': `k = sk_${a(32)}`, 'adapty-key': `secret_live_${a(8)}.${a(24)}`,
    'github-token': `ghp_${a(36)}`, 'npm-token': `npm_${a(36)}`, 'aws-access-key': `AKIA${a(16, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')}`,
    'slack-token': `xoxb-${a(24)}`, 'mailgun-key': `key-${a(32, hx)}`, 'jwt': `eyJ${a(20)}.eyJ${a(30)}.${a(40)}`,
    'signing-password': `storePassword=${a(14)}`, 'maintainer-home-path': '/Users/' + 'mirzemehdi/x',
    'maintainer-email': 'mirzemehdi' + '@gmail.com', 'maintainer-app-id': 'com.' + 'measify.someapp',
  };
  const dir = mkdtempSync(join(tmpdir(), 'kappmaker-guard-'));
  let fail = 0;
  try {
    for (const [rule, value] of Object.entries(canaries)) {
      writeFileSync(join(dir, 'f.js'), `x\n${value}\n`);
      const hits = scanFiles(dir, ['f.js']);
      const okHit = hits.some((h) => h.endsWith(`: ${rule}`));
      const leaked = hits.some((h) => value.length >= 12 && h.includes(value));
      if (!okHit || leaked) { fail++; console.log(`FAIL ${rule}`); } else console.log(`ok   ${rule}`);
    }
    writeFileSync(join(dir, 'f.js'), 'applicationId = "com.measify.kappmaker"\n// e.g. com.measify.myapp\n');
    if (scanFiles(dir, ['f.js']).length) { fail++; console.log('FAIL template default ids must pass'); } else console.log('ok   template default ids pass');
    for (const f of ['AuthKey_X.p8', 'release.jks', '.env', 'dist/.env.local', 'google-services.json', 'service-account.json', '.npmrc']) {
      if (!scanFiles(dir, [f]).some((h) => h.endsWith('secret-bearing file'))) { fail++; console.log(`FAIL file ${f}`); } else console.log(`ok   file ${f}`);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
  console.log(fail ? `\nself-test: ${fail} failed` : '\nself-test: all rules fire');
  process.exit(fail ? 1 : 0);
}

if (process.argv[1] && basename(process.argv[1]) === 'prepublish-check.mjs') {
  if (process.argv.includes('--self-test')) selfTest();
  const root = new URL('..', import.meta.url).pathname;
  const files = packFiles(root);
  const hits = scanFiles(root, files);
  if (hits.length) {
    console.error(`prepublish-check: REFUSED, ${hits.length} hit(s) in the files npm would publish (values not shown):`);
    for (const h of hits) console.error(`  ${h}`);
    process.exit(1);
  }
  console.log(`prepublish-check: ${files.length} files clean (no secrets, secret files or maintainer ids)`);
}
