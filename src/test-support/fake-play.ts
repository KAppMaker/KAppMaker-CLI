// A stateful fake of the Google Play Developer API for tests: OAuth token,
// edits, listings, details, data safety, convertRegionPrices, subscriptions and
// one-time products. Installed over globalThis.fetch; every request is logged.
import { generateKeyPairSync } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface Call { method: string; path: string; query: Record<string, string>; body: unknown }

export interface FakePlayOptions {
  /** Region -> local price for convertRegionPrices (default: US, DE, JP, TR, IN, BR, ET). */
  regions?: Record<string, { currencyCode: string; units: string; nanos?: number }>;
  liveListings?: Array<Record<string, string>>;
  liveDetails?: Record<string, string>;
  /** Make a route answer an error: key "METHOD /path-suffix-regex". */
  failures?: Record<string, { status: number; body: unknown }>;
  /** Regions Google refuses at any regionsVersion other than this map's key. */
  unbillableUnlessVersion?: { version: string; regions: string[] };
  /** Ignore listing PUT bodies (simulate a write that does not stick). */
  dropListingWrites?: boolean;
}

export function setupHome(): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'kappmaker-play-home-'));
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const saPath = path.join(home, 'sa.json');
  fs.writeFileSync(saPath, JSON.stringify({
    client_email: 'test@example.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  }));
  fs.mkdirSync(path.join(home, '.config', 'kappmaker'), { recursive: true });
  fs.writeFileSync(path.join(home, '.config', 'kappmaker', 'config.json'), JSON.stringify({ googleServiceAccountPath: saPath }));
  process.env.HOME = home;
  return home;
}

export function installFakePlay(opts: FakePlayOptions = {}) {
  const calls: Call[] = [];
  const regions = opts.regions ?? {
    US: { currencyCode: 'USD', units: '6', nanos: 990000000 },
    DE: { currencyCode: 'EUR', units: '6', nanos: 490000000 },
    JP: { currencyCode: 'JPY', units: '1100' },
    TR: { currencyCode: 'TRY', units: '229', nanos: 990000000 },
    IN: { currencyCode: 'INR', units: '599' },
    BR: { currencyCode: 'BRL', units: '39', nanos: 990000000 },
    ET: { currencyCode: 'USD', units: '6', nanos: 990000000 },
  };
  let listings = (opts.liveListings ?? []).map((l) => ({ ...l }));
  let details: Record<string, string> = { ...(opts.liveDetails ?? { defaultLanguage: 'en-US' }) };
  const subs = new Map<string, Record<string, unknown>>();
  const otps = new Map<string, Record<string, unknown>>();

  const json = (status: number, body: unknown) =>
    new Response(body === undefined ? '' : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const fake = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? 'GET').toUpperCase();
    if (url.hostname === 'oauth2.googleapis.com') return json(200, { access_token: 'fake-token', expires_in: 3600 });
    const p = url.pathname.replace('/androidpublisher/v3/applications/', '');
    const query = Object.fromEntries(url.searchParams.entries());
    let body: unknown;
    if (typeof init?.body === 'string') { try { body = JSON.parse(init.body); } catch { body = init.body; } }
    calls.push({ method, path: p, query, body });

    for (const [key, f] of Object.entries(opts.failures ?? {})) {
      const [m, re] = key.split(' ');
      if (m === method && new RegExp(re).test(p)) return json(f.status, f.body);
    }
    const rv = query['regionsVersion.version'];
    if (rv && opts.unbillableUnlessVersion && rv !== opts.unbillableUnlessVersion.version) {
      const sent = JSON.stringify(body ?? '');
      const bad = opts.unbillableUnlessVersion.regions.find((r) => sent.includes(`"regionCode":"${r}"`));
      if (bad) return json(400, { error: { code: 400, message: `Region code ${bad} is not billable at the specified regions version ${rv}.` } });
    }

    let m: RegExpMatchArray | null;
    if (method === 'POST' && /^[^/]+\/edits$/.test(p)) return json(200, { id: 'edit1' });
    if (method === 'POST' && /\/edits\/edit1:commit$/.test(p)) return json(200, { id: 'edit1' });
    if (method === 'DELETE' && /\/edits\/edit1$/.test(p)) return json(204, undefined);
    if (method === 'GET' && /\/edits\/edit1\/details$/.test(p)) return json(200, details);
    if (method === 'PUT' && /\/edits\/edit1\/details$/.test(p)) { details = body as Record<string, string>; return json(200, details); }
    if (method === 'GET' && /\/edits\/edit1\/tracks$/.test(p)) return json(200, { tracks: [{ track: 'internal', releases: [{ versionCodes: ['1'] }] }] });
    if (method === 'GET' && /\/edits\/edit1\/listings$/.test(p)) return json(200, { listings });
    if (method === 'PUT' && (m = p.match(/\/edits\/edit1\/listings\/([^/]+)$/))) {
      const lang = decodeURIComponent(m[1]);
      if (!opts.dropListingWrites) listings = [...listings.filter((l) => l.language !== lang), body as Record<string, string>];
      return json(200, body);
    }
    if (method === 'POST' && /\/dataSafety$/.test(p)) return json(200, {});
    if (method === 'POST' && /\/pricing:convertRegionPrices$/.test(p)) {
      const out: Record<string, unknown> = {};
      for (const [r, price] of Object.entries(regions)) out[r] = { regionCode: r, price };
      return json(200, { convertedRegionPrices: out });
    }
    if (method === 'GET' && /^[^/]+\/subscriptions$/.test(p)) return json(200, { subscriptions: [...subs.values()] });
    if (method === 'POST' && /^[^/]+\/subscriptions$/.test(p)) { subs.set(query.productId, { ...(body as object), productId: query.productId }); return json(200, body); }
    if (method === 'PATCH' && (m = p.match(/\/subscriptions\/([^/]+)$/))) { subs.set(decodeURIComponent(m[1]), body as Record<string, unknown>); return json(200, body); }
    if (method === 'GET' && (m = p.match(/\/subscriptions\/([^/]+)$/))) {
      const s = subs.get(decodeURIComponent(m[1]));
      return s ? json(200, s) : json(404, { error: { message: 'not found' } });
    }
    if (method === 'POST' && /basePlans\/[^/]+:activate$/.test(p)) return json(200, {});
    if (method === 'GET' && /^[^/]+\/oneTimeProducts$/.test(p)) return json(200, { oneTimeProducts: [...otps.values()] });
    if (method === 'PATCH' && (m = p.match(/\/onetimeproducts\/([^/]+)$/))) { otps.set(decodeURIComponent(m[1]), body as Record<string, unknown>); return json(200, body); }
    if (method === 'GET' && (m = p.match(/\/oneTimeProducts\/([^/]+)$/))) {
      const o = otps.get(decodeURIComponent(m[1]));
      return o ? json(200, o) : json(404, { error: { message: 'not found' } });
    }
    if (method === 'POST' && /purchaseOptions:batchUpdateStates$/.test(p)) return json(200, {});
    return json(500, { error: { message: `fake-play: no route for ${method} ${p}` } });
  };
  globalThis.fetch = fake as typeof fetch;
  return { calls, get listings() { return listings; }, get details() { return details; }, subs, otps, regionCount: Object.keys(regions).length };
}
