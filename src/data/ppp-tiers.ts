// Source: https://github.com/iosdevmax/ppp-pricing/blob/main/ppp_tiers.json (MIT)
// Steam/Spotify/RevenueCat-inspired multipliers — NOT raw World Bank PPP, since
// raw PPP under-prices markets prone to VPN arbitrage and misses 'rich tourist'
// high-cost-of-living markets. The verbatim upstream JSON is bundled at
// `./ppp-tiers.upstream.json` for diffability and licence compliance; this
// `.ts` file is the canonical runtime source.

/** ISO 3166-1 alpha-2 → multiplier on the USD anchor price. */
export const PPP_MULTIPLIERS: Record<string, number> = {
  // 0.30 — very low
  AR: 0.30, EG: 0.30, PK: 0.30, BD: 0.30, NG: 0.30, KE: 0.30, LK: 0.30,
  NP: 0.30, MM: 0.30, GH: 0.30, ET: 0.30, TZ: 0.30, UG: 0.30, BO: 0.30, VE: 0.30,
  // 0.35 — low
  IN: 0.35, VN: 0.35, PH: 0.35, ID: 0.35, UA: 0.35, MA: 0.35, DZ: 0.35,
  TN: 0.35, JO: 0.35, LB: 0.35, IQ: 0.35, AM: 0.35, GE: 0.35, AZ: 0.35,
  UZ: 0.35, KZ: 0.35, MN: 0.35,
  // 0.45 — lower-mid
  BR: 0.45, TR: 0.45, TH: 0.45, MY: 0.45, CO: 0.45, PE: 0.45, EC: 0.45,
  DO: 0.45, PY: 0.45, RO: 0.45, BG: 0.45, RS: 0.45, MK: 0.45, BA: 0.45,
  AL: 0.45, MD: 0.45,
  // 0.60 — mid
  MX: 0.60, ZA: 0.60, CL: 0.60, UY: 0.60, CR: 0.60, PA: 0.60, PL: 0.60,
  HU: 0.60, HR: 0.60, GR: 0.60, PT: 0.60, CZ: 0.60, SK: 0.60, LT: 0.60,
  LV: 0.60, EE: 0.60, SI: 0.60, MT: 0.60, CY: 0.60,
  // 0.80 — upper-mid
  KR: 0.80, JP: 0.80, TW: 0.80, ES: 0.80, IT: 0.80, IL: 0.80, SA: 0.80,
  AE: 0.80, QA: 0.80, KW: 0.80, BH: 0.80, OM: 0.80,
  // 1.00 — base
  US: 1.00, CA: 1.00, GB: 1.00, AU: 1.00, NZ: 1.00, FR: 1.00, DE: 1.00,
  NL: 1.00, BE: 1.00, AT: 1.00, IE: 1.00, SG: 1.00, HK: 1.00,
  // 1.10 — high
  CH: 1.10, NO: 1.10, DK: 1.10, SE: 1.10, FI: 1.10, IS: 1.10, LU: 1.10,
};

/** Default multiplier for regions not in PPP_MULTIPLIERS and not in FALLBACK_NEIGHBOUR. */
export const PPP_DEFAULT_COEFFICIENT = 0.60;

/**
 * Closest-neighbour fallbacks for regions not in the upstream PPP table.
 * Each entry maps an alpha-2 code to a region whose multiplier we mirror.
 * Picks based on geographic / economic proximity. Anything missing both lookups
 * falls through to PPP_DEFAULT_COEFFICIENT (0.60 — "mid", matches upstream's _default_coefficient).
 */
export const FALLBACK_NEIGHBOUR: Record<string, string> = {
  // US territories / Caribbean
  PR: 'US', GU: 'US', VI: 'US', AS: 'US', MP: 'US', UM: 'US',
  BS: 'US', BM: 'US', KY: 'US',
  // EU member states / EEA missing from upstream → mirror EU base
  AD: 'FR', MC: 'FR', SM: 'IT', VA: 'IT', LI: 'CH',
  // Eastern Europe / former Soviet → MD/UA/AM tier
  BY: 'UA', RU: 'UA', KG: 'UZ', TJ: 'UZ', TM: 'UZ', XK: 'AL', XKS: 'AL',
  // MENA → mirror MA/DZ/TN tier
  LY: 'DZ', SD: 'EG', YE: 'JO', PS: 'JO', SY: 'JO', AF: 'PK',
  // Sub-Saharan Africa → mirror low tier
  CI: 'KE', CM: 'KE', SN: 'KE', ML: 'KE', BF: 'KE', NE: 'KE', BJ: 'KE',
  TG: 'KE', RW: 'KE', BW: 'KE', NA: 'ZA', MW: 'KE', MZ: 'KE', AO: 'KE',
  ZM: 'KE', ZW: 'KE', CD: 'KE', CG: 'KE', GA: 'KE', CV: 'KE', SC: 'KE',
  MU: 'KE', MG: 'KE', SS: 'KE', ER: 'KE', SO: 'KE', DJ: 'KE', LR: 'KE',
  SL: 'KE', GN: 'KE', GW: 'KE', GM: 'KE', ST: 'KE', GQ: 'KE', TD: 'KE',
  CF: 'KE', BI: 'KE', LS: 'ZA', SZ: 'ZA',
  // Latin America / Caribbean → mirror BR/MX/CL tier
  GT: 'MX', SV: 'MX', HN: 'MX', NI: 'MX', BZ: 'MX', GY: 'MX', SR: 'MX',
  HT: 'DO', JM: 'DO', TT: 'DO', BB: 'DO', GD: 'DO', LC: 'DO', VC: 'DO',
  AG: 'DO', DM: 'DO', KN: 'DO', AI: 'DO', MS: 'DO', TC: 'DO', VG: 'DO',
  CU: 'DO', CW: 'DO', AW: 'DO', SX: 'DO', BQ: 'DO',
  // Asia → mirror SG/KR/MY tier
  CN: 'KR', LA: 'VN', KH: 'VN', BN: 'MY', BT: 'IN', MV: 'IN', MO: 'HK',
  // Pacific
  FJ: 'AU', PG: 'AU', WS: 'AU', TO: 'AU', VU: 'AU', SB: 'AU', NR: 'AU',
  KI: 'AU', TV: 'AU', PW: 'AU', FM: 'AU', MH: 'AU', CK: 'NZ', NU: 'NZ',
  NC: 'AU', PF: 'AU',
  // North-Atlantic / overseas
  GL: 'DK', FO: 'DK', AX: 'FI', SJ: 'NO',
  GI: 'GB', JE: 'GB', GG: 'GB', IM: 'GB', FK: 'GB', SH: 'GB',
  // Misc
  TL: 'ID', GE_GEO: 'GE', // Bhutan handled above; East Timor here.
};

export const PPP_TIER_VALUES = [0.30, 0.35, 0.45, 0.60, 0.80, 1.00, 1.10] as const;
