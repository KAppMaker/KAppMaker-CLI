import http from 'node:http';
import { randomBytes } from 'node:crypto';

/**
 * A one-time page on THIS computer for what the AI must never see: the bot token, the install code or licence key,
 * a sign-in code. The MCP spec says servers must not ask for secrets in a form (the client may hand the answer to the
 * model); URL-mode elicitation opens a page instead. This page is served by the `kappmaker mcp` process itself on
 * 127.0.0.1 (random port, random path), takes one good POST, checks the values, and closes. The values stay in this
 * process's memory only: never in a tool result, a log, a file or a command line.
 */

export interface SecretField {
  name: string;
  label: string;
  /** Plain steps shown under the field (e.g. how to get a bot token from @BotFather). */
  hint?: string;
  pattern: RegExp;
  /** Shown when the value does not match. */
  invalid: string;
  optional?: boolean;
}

export interface SecretPage {
  id: string;
  url: string;
  /** The values once the user sent the page; undefined when it timed out or was closed. */
  result: Promise<Record<string, string> | undefined>;
  finished: () => boolean;
  close: () => void;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const STYLE = 'body{font:16px/1.5 system-ui,sans-serif;max-width:34rem;margin:3rem auto;padding:0 1rem;color:#1f2328;background:#fff}' +
  'h1{font-size:1.35rem}label{display:block;font-weight:600;margin-top:1.4rem}.hint{margin:.2rem 0 .4rem;color:#4b5563}' +
  '.err{margin:.2rem 0;color:#b42318}input{width:100%;box-sizing:border-box;padding:.6rem;font:inherit;border:1px solid #6e7781;border-radius:6px}' +
  'button{margin-top:1.6rem;padding:.65rem 1.2rem;font:inherit;font-weight:600;color:#fff;background:#0b5bd3;border:0;border-radius:6px}' +
  '.note{margin-top:1.6rem;color:#4b5563;font-size:.9rem}';
const shell = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer">` +
  `<title>${esc(title)}</title><style>${STYLE}</style></head><body><h1>${esc(title)}</h1>${body}</body></html>`;

function form(title: string, fields: SecretField[], action: string, errors: Record<string, string>): string {
  const rows = fields.map((f) => `<label for="${f.name}">${esc(f.label)}${f.optional ? ' (or leave it for later)' : ''}</label>` +
    (f.hint ? `<p class="hint">${esc(f.hint)}</p>` : '') + (errors[f.name] ? `<p class="err">${esc(errors[f.name])}</p>` : '') +
    `<input id="${f.name}" name="${f.name}" type="password" autocomplete="off" spellcheck="false"${f.optional ? '' : ' required'}>`).join('');
  return shell(title, `<form method="post" action="${action}">${rows}<button type="submit">Send</button></form>` +
    '<p class="note">This page runs on your own computer. What you type goes only to your server, over your own SSH connection. Your AI never sees it.</p>');
}

export async function openSecretPage(o: { title: string; fields: SecretField[]; ttlMs?: number }): Promise<SecretPage> {
  const id = randomBytes(16).toString('hex');
  const path = `/kappmaker/${id}`;
  let resolve!: (v: Record<string, string> | undefined) => void;
  const result = new Promise<Record<string, string> | undefined>((r) => { resolve = r; });
  let finished = false;
  const headers = {
    'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
  };
  const server = http.createServer((req, res) => {
    const port = (server.address() as { port: number } | null)?.port;
    const host = String(req.headers.host ?? '');
    // Only this exact page, only under the loopback name it was opened with (no DNS rebinding, no other paths).
    if (finished || req.url !== path || (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }
    if (req.method === 'GET') { res.writeHead(200, headers).end(form(o.title, o.fields, path, {})); return; }
    if (req.method !== 'POST') { res.writeHead(405, { 'Content-Type': 'text/plain' }).end('Method not allowed'); return; }
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (c: string) => { body += c; if (body.length > 8192) req.destroy(); });
    req.on('end', () => {
      if (finished) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found'); return; }
      const sent = new URLSearchParams(body);
      const values: Record<string, string> = {};
      const errors: Record<string, string> = {};
      for (const f of o.fields) {
        const v = (sent.get(f.name) ?? '').trim();
        if (!v && f.optional) continue;
        if (f.pattern.test(v)) values[f.name] = v; else errors[f.name] = f.invalid;
      }
      if (Object.keys(errors).length) { res.writeHead(200, headers).end(form(o.title, o.fields, path, errors)); return; }
      finished = true;
      res.writeHead(200, headers).end(shell('Got it', '<p>You can close this tab and go back to your AI.</p>'));
      setImmediate(stop);
      resolve(values);
    });
  });
  const stop = () => { server.close(); server.closeAllConnections(); };
  const close = () => { if (!finished) { finished = true; resolve(undefined); } stop(); };
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  server.unref();
  setTimeout(close, o.ttlMs ?? 30 * 60_000).unref();
  const port = (server.address() as { port: number }).port;
  return { id, url: `http://127.0.0.1:${port}${path}`, result, finished: () => finished, close };
}
