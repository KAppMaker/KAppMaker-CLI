/**
 * Turns a failed command's output into one plain sentence plus the exact fix.
 * Order matters: the first rule that matches wins. Rules only ever name
 * commands the buyer runs themselves — never a value of a key.
 */

interface Rule {
  test: RegExp;
  explain: (match: RegExpMatchArray) => string;
}

const RULES: Rule[] = [
  {
    // An orchestrator summary (create-appstore-app, gpc setup, adapty setup, ...):
    // the failed steps are named on this line; the output tail has the detail.
    test: /(\d+) step\(s\) FAILED: ([^\n]+)/,
    explain: (m) =>
      `${m[1]} step(s) failed: ${m[2].trim()}. Completed steps are kept. Fix: read the FAILED lines above, fix their cause, then run the same tool again.`,
  },
  {
    // Google Play API error: "ERROR <label>: HTTP 4xx" followed by Google's error body.
    test: /ERROR ([^\n]+): HTTP (4\d\d)([\s\S]{0,4000})/,
    explain: (m) =>
      `Google Play rejected "${m[1].trim()}" (HTTP ${m[2]})${m[3].trim() ? `: ${googleMessage(m[3])}` : ''}. ` +
      'Fix: correct that part of Assets/googleplay-config.json and run the tool again (nothing else was changed for this step).',
  },
  {
    // An `asc` command failed: "ERROR <label>: asc exited N" followed by its output.
    test: /([^\n]+): asc exited (\d+)\s*\n?([^\n]*)/,
    explain: (m) =>
      `App Store Connect (asc) failed at "${m[1].replace(/^\s*ERROR\s*/, '').trim()}"${m[3] ? `: ${m[3].trim().slice(0, 200)}` : ''}. ` +
      'Fix: correct that part of Assets/appstore-config.json, or run `kappmaker doctor` if asc itself is the problem, then run the tool again.',
  },
  {
    test: /asc (\S+) is too old/,
    explain: (m) => `The installed asc ${m[1]} is too old. Fix: run \`brew update && brew upgrade asc\` (or \`curl -fsSL https://asccli.sh/install | bash\`), then retry.`,
  },
  {
    test: /needs an answer: "([^"]+)"/,
    explain: (m) =>
      `The command stopped at a question it cannot answer on its own: "${m[1]}".` +
      (keyHint(m[1]) || ' Fix: run the same `kappmaker …` command yourself in a terminal and answer it there.'),
  },
  {
    test: /kappmaker config init --yes/,
    explain: () =>
      'KAppMaker is not configured on this machine yet. Fix: run `kappmaker config init --yes ' +
      '--bundle-prefix com.yourcompany --organization "Your Co"` once, then retry.',
  },
  {
    test: /(command not found|ENOENT|is not installed|not installed)/i,
    explain: () =>
      'A tool this step needs is missing. Fix: call the `doctor` tool (or run `kappmaker doctor`): it lists ' +
      'each missing tool with the exact install line.',
  },
  {
    test: /(asc auth|App Store Connect API key|ascKeyId|\.p8)/i,
    explain: () =>
      'App Store Connect is not connected. Fix: run `kappmaker create-appstore-app` once in a terminal ' +
      '(it walks through the API key and Apple ID), or `kappmaker config set ascKeyId|ascIssuerId|ascPrivateKeyPath …`.',
  },
  {
    test: /(service account|googleServiceAccountPath|google-service-app-publisher)/i,
    explain: () =>
      'Google Play is not connected. Fix: save your Play service-account JSON and run ' +
      '`kappmaker config set googleServiceAccountPath /path/to/key.json`.',
  },
  {
    test: /(firebase login|Failed to authenticate|not logged in)/i,
    explain: () => 'Firebase is not logged in. Fix: run `firebase login` (or `kappmaker firebase login`) in a terminal.',
  },
  {
    test: /(gh auth login|not logged into any GitHub)/i,
    explain: () => 'GitHub CLI is not logged in. Fix: run `gh auth login` in a terminal.',
  },
];

/** Google's JSON error body -> its message, else the raw text (short). */
function googleMessage(body: string): string {
  const m = body.match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (m) return m[1].replace(/\\"/g, '"').slice(0, 300);
  return body.trim().split('\n')[0].slice(0, 300);
}

function keyHint(question: string): string {
  const q = question.toLowerCase();
  if (q.includes('fal.ai')) return ' Fix: `kappmaker config set falApiKey <your fal.ai key>` (get one at https://fal.ai/dashboard/keys).';
  if (q.includes('imgbb')) return ' Fix: `kappmaker config set imgbbApiKey <key>` (free at https://api.imgbb.com).';
  if (q.includes('openai')) return ' Fix: `kappmaker config set openaiApiKey <key>`, or pass a spec file so no OpenAI call is needed.';
  if (q.includes('apple id') || q.includes('interactive setup')) return ' Fix: run `kappmaker create-appstore-app` once in a terminal.';
  if (q.includes('log in') || q.includes('install')) return ' Fix: run the command once in a terminal; it installs or logs in for you.';
  return '';
}

export function explainFailure(output: string): string | undefined {
  for (const rule of RULES) {
    const m = output.match(rule.test);
    if (m) return rule.explain(m);
  }
  return undefined;
}
