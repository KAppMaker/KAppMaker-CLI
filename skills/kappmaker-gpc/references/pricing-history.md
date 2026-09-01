# Play pricing engine — version history and deep troubleshooting

Read this when a user hits a pricing/region error the quick table in SKILL.md maps here, or when
you need the full mechanics of the PPP fan-out (multiplier table, currency drift, sticky regions).
Every entry names the CLI version that fixed the problem — the fix for a user on an older version
is almost always "upgrade, then re-run".

**Per-region PPP pricing (1.6.0+)**: both subscriptions and one-time products are fanned out to every billable Play region (~140 of the ~175 ISO codes; sanctioned countries like AF/IR/KP/SY are auto-excluded via `convertRegionPrices`) with purchasing-power-parity-adjusted USD prices. Multiplier table (Steam/Spotify-inspired, sourced from [iosdevmax/ppp-pricing](https://github.com/iosdevmax/ppp-pricing) — MIT) lives at `src/data/ppp-tiers.ts`; helper at `src/services/ppp-pricing.service.ts`. India ≈ 0.35×, Argentina/Pakistan/Egypt ≈ 0.30×, US/CA/EU base 1.00×, Switzerland/Norway 1.10×; rounded to .99 endings. User-listed regions in `regional_configs` win; PPP fills the rest. Per-product opt-out via `"ppp_enabled": false`. Run `npm run test:ppp` to smoke-test.

**Re-run updates existing products (1.6.1+)**: when an existing product is hit, the CLI PATCHes it with the new pricing instead of skipping — back-fills PPP regional pricing onto products created by earlier CLI versions.

**Billable-region filter (1.6.2+)**: HTTP 400 _"Region code X is not billable at the specified regions version 2022/02"_ is fixed in 1.6.2 — upgrade if a user reports it. The CLI now queries `convertRegionPrices` once per setup run to fetch the authoritative billable region list and filters PPP fan-out to that set.

**Native-currency PPP (1.6.3+)**: HTTP 400 _"Invalid currency for region code AE: expected AED but got USD"_ is fixed in 1.6.3 — upgrade if a user reports it. PPP fan-out now sends prices in each region's native currency (AED for AE, JPY for JP, INR for IN, etc.) by using Google's `convertRegionPrices` for FX, then applying the PPP multiplier in local currency with currency-appropriate charm rounding (X.99 for decimal currencies, X99/X9/integer for zero-decimal currencies like JPY/KRW/VND).

**Two pricing modes (1.6.4+)**: each base plan / one-time product carries `ppp_enabled?: boolean` (default `true`).
- `ppp_enabled: true` → explicit per-region PPP via `convertRegionPrices` + native-currency entries (current default; ~150 regions per product).
- `ppp_enabled: false` → fall back to `otherRegionsConfig` (subs) / `newRegionsConfig` (one-time products) with USD + EUR anchors. Google auto-fans-out via its FX pricing template — every billable region gets a price, no PPP discounting. Smaller payload. Tell users this is the right pick if they want uniform USD-anchor pricing without PPP discounts. **Important**: Google requires BOTH `usdPrice` and `eurPrice` Money objects (HTTP 400 if either is missing) — 1.6.4 derives both from the user's USD anchor (mirroring USD value as EUR anchor unless an explicit EUR entry is in `regional_configs`).

**Proto3 partial-Money fix (1.6.6+)** — if a user reports HTTP 400 _"Invalid value at '...price.units' (TYPE_INT64), 'NaN'"_, upgrade to 1.6.6. Google's JSON response omits `Money.units` when it's `0` (proto3 default-value omission); the CLI now normalizes incoming Money payloads at the boundary so missing `units`/`nanos` default to `"0"`/`0` instead of propagating `NaN`.

**Post-PATCH verification + diagnostic message (1.6.9+)** — when a user reports "products still show USA only in Play Console" after a successful API run, check the `Stored on Google: X/Y regions available` lines in the CLI output. If `Y` is high (e.g., 167), the data IS saved on Google's side and the user is hitting Play Console UI lag OR app-level country availability (Production track → Country availability — the app itself must be released in those countries). 1.6.9 prints a diagnostic checklist at the end of `setupSubscriptions` / `setupInAppProducts` covering all four scenarios. Also fixes `activateBasePlan` body (was sending `{}` instead of the required `packageName/productId/basePlanId/latencyTolerance` fields).

**Existing-region preservation (1.6.10+)** — if a user reports HTTP 400 _"Regional configs were removed from the base plan: X, Y, Z"_ (or _"...from the purchase option"_), upgrade to 1.6.10. The cause: Google considers regional configs sticky at the per-region level — once a product has stored a config for `X`, every subsequent PATCH must include `X` or Google rejects. 1.6.10 reads existing state first via `fetchExistingSubscriptionState` / `fetchExistingOneTimeProductState` (one GET per product), then echoes every previously-stored region for regions not already in the fresh PPP fan-out.

**Currency override approach + NEVER_BILLABLE (1.6.11+)** — 1.6.10's drop-and-mark-unavailable approach was wrong. Drift regions (except MN) ARE billable at `regionsVersion=2022/02` — just under a different currency than the live `convertRegionPrices` API returns. 1.6.11+ overrides the currency inline in the fresh fan-out via `applyCurrencyOverrideFor2022_02`:

| Region | Live API | 2022/02 expects | Fix |
|---|---|---|---|
| BG | EUR | BGN | Convert EUR → BGN via the 1 EUR = 1.95583 BGN peg |
| HR | EUR | EUR ✓ | None (Google updated 2022/02 retroactively) |
| CI / CM / SN | XOF / XAF | USD | Replace with USD anchor; PPP still applies on top |
| MN | billable | NOT BILLABLE | In `NEVER_BILLABLE_AT_2022_02`; skipped entirely |

Net result on legacy products with all 5 drift regions stored: 173/173 regions AVAILABLE instead of 168/173 force-unavailable. Google's storage layer auto-converts the submitted currency to each region's actual display currency.

For genuinely unfixable products (an existing product has MN or another `NEVER_BILLABLE` region stored on it), the CLI surfaces a "stuck" warning + 3 fix options:
1. Bump `product_id` in config — recommended; no downtime
2. `--recreate-stuck` flag — DELETE+recreate, but Google holds the ID in soft-delete reservation for a few minutes to hours afterwards
3. Manually delete on Play Console UI, wait, re-run

**"New countries" availability (1.6.11+)** — one-time products' `newRegionsConfig` is now ALWAYS set to `availability: AVAILABLE` (was previously only set when `ppp_enabled: false`). Mirrors what subscriptions do via `otherRegionsConfig`. Future regions Google adds get auto-priced from the USD/EUR anchor.

**Two regionsVersion 2022/02 drift error patterns + session cache (1.6.8+)** — if a user reports either HTTP 400 _"Invalid currency for region code X: expected Y but got Z"_ OR _"Region code X is not billable at the specified regions version 2022/02"_, upgrade to 1.6.8. The CLI now:
- Preseeds `KNOWN_2022_02_DRIFT_REGIONS = {BG, HR, CI, CM, MN}` (Bulgaria, Croatia — Eurozone; Ivory Coast, Cameroon — CFA franc; Mongolia — not billable).
- Parses BOTH `Invalid currency for region code X` AND `Region code X is not billable` from 400 responses via `extractDriftRegions`.
- Maintains a `sessionDriftCache` per package so once a region is discovered as drifted on product N, products N+1, N+2, ... skip it up front.
- Retries each PATCH up to 5× with progressively larger exclude set.

Result: the user sees `Subscription/IAP updated (dropped K drift regions: BG, HR, CI, CM, MN)` instead of cascading errors. If Romania or Czech Republic joins the Eurozone in the future and Google's API drifts again, the auto-retry catches it on the first run without any CLI update.

**Three PATCH gotchas fixed in 1.6.5** — upgrade if any of these errors surface:
1. _"expanded $X.XX to 0 regions"_ — `convertRegionPrices` response shape mismatch (field is `price`, not `regionPrice`).
2. _"is missing the other regions config, which is now required since it has been previously set"_ — subscriptions: `otherRegionsConfig` is sticky once set; every PATCH must include it. 1.6.5 always includes it when a USD anchor exists.
3. _"Product must list all of its existing purchase options. Missing: buy"_ — one-time products: legacy products used `purchaseOptionId: "buy"`, not `"default"`. 1.6.5 GETs the existing product first and reuses its actual purchase option ID.

If a user reports "products only show in US + Mongolia / Nigeria / etc." they're on a version older than 1.6.0 that relied on Google's `otherRegionsConfig` / `newRegionsConfig` auto-conversion (which fanned out unreliably). Upgrade to 1.6.0+ — explicit per-region pricing replaces it.

If a user reports HTTP 400 _"Unknown name 'otherRegionsConfig' at 'one_time_product.purchase_options[0]': Cannot find field"_ they're on a version older than 1.5.2.

