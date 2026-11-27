import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { openSecretPage } from './army/secret-page.js';
import { FIELDS } from './army/secrets.js';

const TOKEN = '123456789:AAbbCCddEEffGGhhIIjjKKllMMnnOOppQQ';
const post = (url: string, body: string) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });

function rawGet(url: string, host: string): Promise<number> {
  const u = new URL(url);
  return new Promise((resolve, reject) => {
    http.get({ host: u.hostname, port: u.port, path: u.pathname, headers: { Host: host } }, (res) => { res.resume(); resolve(res.statusCode ?? 0); }).on('error', reject);
  });
}

test('the page: loopback only, this path only, checks the value, takes one answer, then is gone', async () => {
  const page = await openSecretPage({ title: 'Your Telegram bot token', fields: [FIELDS.bot(false)] });
  assert.match(page.url, /^http:\/\/127\.0\.0\.1:\d+\/kappmaker\/[0-9a-f]{32}$/);
  const html = await fetch(page.url).then((r) => r.text());
  assert.match(html, /type="password"/);
  assert.match(html, /@BotFather/);
  assert.equal(await rawGet(page.url, 'evil.example:80'), 404, 'other Host names are refused (DNS rebinding)');
  assert.equal((await fetch(page.url.replace(/[0-9a-f]{32}$/, '0'.repeat(32)))).status, 404, 'other paths are refused');

  const bad = await post(page.url, 'bot_token=hello').then((r) => r.text());
  assert.match(bad, /That is not a bot token/);
  assert.equal(page.finished(), false);
  assert.ok(!bad.includes('hello'), 'what was typed is not echoed back');

  const ok = await post(page.url, new URLSearchParams({ bot_token: ` ${TOKEN} ` }).toString()).then((r) => r.text());
  assert.match(ok, /Got it/);
  assert.deepEqual(await page.result, { bot_token: TOKEN });
  await new Promise((r) => setTimeout(r, 20));
  await assert.rejects(fetch(page.url), 'closed after one answer');
});

test('closing an unanswered page resolves it empty', async () => {
  const page = await openSecretPage({ title: 'x', fields: [FIELDS.code] });
  page.close();
  assert.equal(await page.result, undefined);
});
