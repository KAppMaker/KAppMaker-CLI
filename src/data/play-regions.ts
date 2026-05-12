import { ASC_TERRITORIES } from './asc-territories.js';
import { ALPHA3_TO_ALPHA2 } from './iso-3166.js';

// Google Play's region codes are ISO 3166-1 alpha-2 ("US", "DE", "JP"). Apple
// and Google support nearly the same set of countries, so we derive the Play
// universe from the ASC territory list (alpha-3) by translation. Any Play
// region not in this set falls back to alpha-2 codes Google publishes for
// regions Apple does not (none currently — confirm if Google adds new regions).

export const PLAY_REGIONS: readonly string[] = ASC_TERRITORIES.map(
  (alpha3) => ALPHA3_TO_ALPHA2[alpha3],
).filter((alpha2): alpha2 is string => Boolean(alpha2));
