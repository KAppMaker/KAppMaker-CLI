// All territories ASC supports (ISO 3166-1 alpha-3, plus "XKS" for Kosovo).
// Snapshot via `asc pricing territories list --paginate` (175 entries as of
// 2026-05-10). Bump when Apple adds territories.
//
// Used as the universe of territories KAppMaker fans out PPP-priced
// subscriptions / IAPs to. The runtime helper `fetchAllTerritories()` in
// `asc-monetization.service.ts` keeps the live API as a fallback so that
// drift between this snapshot and Apple's catalog is detected automatically.

export const ASC_TERRITORIES: readonly string[] = [
  'AFG', 'AGO', 'AIA', 'ALB', 'ARE', 'ARG', 'ARM', 'ATG', 'AUS', 'AUT',
  'AZE', 'BEL', 'BEN', 'BFA', 'BGR', 'BHR', 'BHS', 'BIH', 'BLR', 'BLZ',
  'BMU', 'BOL', 'BRA', 'BRB', 'BRN', 'BTN', 'BWA', 'CAN', 'CHE', 'CHL',
  'CHN', 'CIV', 'CMR', 'COD', 'COG', 'COL', 'CPV', 'CRI', 'CYM', 'CYP',
  'CZE', 'DEU', 'DMA', 'DNK', 'DOM', 'DZA', 'ECU', 'EGY', 'ESP', 'EST',
  'FIN', 'FJI', 'FRA', 'FSM', 'GAB', 'GBR', 'GEO', 'GHA', 'GMB', 'GNB',
  'GRC', 'GRD', 'GTM', 'GUY', 'HKG', 'HND', 'HRV', 'HUN', 'IDN', 'IND',
  'IRL', 'IRQ', 'ISL', 'ISR', 'ITA', 'JAM', 'JOR', 'JPN', 'KAZ', 'KEN',
  'KGZ', 'KHM', 'KNA', 'KOR', 'KWT', 'LAO', 'LBN', 'LBR', 'LBY', 'LCA',
  'LKA', 'LTU', 'LUX', 'LVA', 'MAC', 'MAR', 'MDA', 'MDG', 'MDV', 'MEX',
  'MKD', 'MLI', 'MLT', 'MMR', 'MNE', 'MNG', 'MOZ', 'MRT', 'MSR', 'MUS',
  'MWI', 'MYS', 'NAM', 'NER', 'NGA', 'NIC', 'NLD', 'NOR', 'NPL', 'NRU',
  'NZL', 'OMN', 'PAK', 'PAN', 'PER', 'PHL', 'PLW', 'PNG', 'POL', 'PRT',
  'PRY', 'QAT', 'ROU', 'RUS', 'RWA', 'SAU', 'SEN', 'SGP', 'SLB', 'SLE',
  'SLV', 'SRB', 'STP', 'SUR', 'SVK', 'SVN', 'SWE', 'SWZ', 'SYC', 'TCA',
  'TCD', 'THA', 'TJK', 'TKM', 'TON', 'TTO', 'TUN', 'TUR', 'TWN', 'TZA',
  'UGA', 'UKR', 'URY', 'USA', 'UZB', 'VCT', 'VEN', 'VGB', 'VNM', 'VUT',
  'XKS', 'YEM', 'ZAF', 'ZMB', 'ZWE',
];
