---
sidebar_position: 2
title: Configuration
---

# Configuration

Configuration is stored at `~/.config/kappmaker/config.json`.

## Managing Config

```bash
kappmaker config init                                    # Interactive setup
kappmaker config list                                    # Show all values
kappmaker config set <key> <value>                       # Set a value
kappmaker config get <key>                               # Get a value
kappmaker config path                                    # Show config file path
```

### App Store Defaults

```bash
kappmaker config appstore-defaults                       # View App Store defaults
kappmaker config appstore-defaults --init                # Set up API key + review contact (backfills missing credit-pack IAPs from template)
kappmaker config appstore-defaults --save ./config.json  # Save as global defaults
```

### Adapty Defaults

```bash
kappmaker config adapty-defaults                         # View Adapty defaults
kappmaker config adapty-defaults --init                  # Initialize from template (subs + 3 credit packs + Credits Paywall + credits_pack placement)
kappmaker config adapty-defaults --save ./config.json    # Save as global defaults
```

`--init` is idempotent — running it against an existing defaults file backfills any missing arrays from the built-in template (e.g. `in_app_purchases` for ASC, or `products` / `paywalls` / `placements` for Adapty) so upgrades from earlier KAppMaker versions don't silently lose credit-pack support.

## Config Keys

| Key | Description | Default |
|-----|-------------|---------|
| `templateRepo` | Template repository Git URL | KAppMaker template |
| `bundleIdPrefix` | Bundle/package ID prefix (e.g., `com.measify`) | `com.<appname>` |
| `androidSdkPath` | Android SDK location | `~/Library/Android/sdk` |
| `organization` | Organization for Fastlane signing | App name |
| `falApiKey` | fal.ai API key | — |
| `imgbbApiKey` | imgbb API key | — |
| `openaiApiKey` | OpenAI API key | — |
| `ascAuthName` | ASC keychain credential name | `KAppMaker` |
| `ascKeyId` | App Store Connect API Key ID | — |
| `ascIssuerId` | App Store Connect Issuer ID | — |
| `ascPrivateKeyPath` | Path to `.p8` private key | — |
| `appleId` | Apple ID email | — |
| `googleServiceAccountPath` | Google Play service account JSON | `~/credentials/google-service-app-publisher.json` |

## Global Defaults

| File | Used by | Manage with |
|------|---------|-------------|
| `~/.config/kappmaker/appstore-defaults.json` | `create-appstore-app` | `config appstore-defaults --init` (interactive) or `--save <file>` |
| `~/.config/kappmaker/adapty-defaults.json` | `adapty setup` | `config adapty-defaults --init` (template-based) or `--save <file>` |

Global defaults are merged as a base layer so shared settings (review contact, privacy, subscriptions, etc.) don't need to be re-entered per app.

## Config Resolution Order

For App Store Connect and Adapty, configuration is resolved by deep-merging layers (later overrides earlier):

1. **Built-in template** — sensible defaults (age rating, privacy, encryption, subscriptions)
2. **Global defaults** — shared settings across all your apps
3. **Local config** (e.g., `./Assets/appstore-config.json`) — per-project overrides
4. **Interactive prompts** — only for fields still empty

## Subscription Product ID Alignment

Subscription IDs are auto-generated so App Store Connect, Google Play, and Adapty all link automatically:

| Platform | Field | Format | Example ($6.99 weekly) |
|---|---|---|---|
| App Store Connect | `productId` | `{appname}.premium.{period}.v1.{price}.v1` | `myapp.premium.weekly.v1.699.v1` |
| Google Play | `productId` | `{appname}.premium.{period}.v1` | `myapp.premium.weekly.v1` |
| Google Play | `basePlanId` | `autorenew-{period}-{priceDigits}-v1` | `autorenew-weekly-699-v1` |
| Adapty | `ios_product_id` | matches ASC `productId` | `myapp.premium.weekly.v1.699.v1` |
| Adapty | `android_product_id` | matches Play `productId` | `myapp.premium.weekly.v1` |
| Adapty | `android_base_plan_id` | matches Play `basePlanId` | `autorenew-weekly-699-v1` |

`priceDigits` is the price with the decimal removed (e.g., `6.99` → `699`). `{period}` is one of `weekly`, `monthly`, `twomonths`, `quarterly`, `semiannual`, `yearly`.

## Per-region PPP pricing (1.6.0+)

KAppMaker fans out every subscription and one-time IAP to all supported regions/territories on Google Play (~175) and App Store Connect (~155) with **purchasing-power-parity-adjusted prices**, not a single global USD amount. The multipliers come from a Steam/Spotify-inspired tier table ([iosdevmax/ppp-pricing](https://github.com/iosdevmax/ppp-pricing), MIT).

| Tier | Multiplier | Sample regions |
|---|---|---|
| Very low | 0.30 | AR, EG, PK, BD, NG, KE |
| Low | 0.35 | IN, VN, PH, ID, UA, KZ |
| Lower-mid | 0.45 | BR, TR, TH, MY, CO, RO, BG |
| Mid | 0.60 | MX, ZA, CL, PL, HU, GR, PT, CZ |
| Upper-mid | 0.80 | KR, JP, TW, ES, IT, IL, SA, AE |
| Base | 1.00 | US, CA, GB, AU, NZ, FR, DE, NL, SG |
| High | 1.10 | CH, NO, DK, SE, FI, IS, LU |

Prices round to .99 endings (e.g. `$4.99 × 0.35 = $1.99` in IN). Regions outside the table fall back via a closest-neighbour lookup; anything still missing uses `0.60`.

### Override rule

Any region/territory you list explicitly in `regional_configs` (Play) or `prices` (ASC) wins. PPP fills only the regions/territories you didn't list:

```json
"regional_configs": [
  { "region_code": "US", "price": "6.99", "currency_code": "USD" },
  { "region_code": "DE", "price": "5.99", "currency_code": "EUR" }
]
```

Above: US gets `$6.99`, DE keeps `5.99 EUR`, every other Play region gets a PPP-adjusted USD price derived from your $6.99 anchor.

### Opt-out

Set `"ppp_enabled": false` on any base plan, IAP, or subscription entry to skip the fan-out:

```json
{ "ppp_enabled": false, "regional_configs": [...] }
```

That entry stays restricted to the regions/territories you listed, no automatic fan-out.

### Smoke test

```bash
npm run test:ppp
```

Runs 16 assertions covering multiplier lookup, .99 rounding, fan-out length, and exclusion-set behaviour.

### Currency model

- **Google Play**: every region gets a USD price; Google's `convertRegionPrices` displays each region's local currency to buyers at runtime via the configured exchange table.
- **App Store Connect**: Apple uses fixed price-point tiers per territory. For each (territory, PPP-adjusted USD) pair the CLI resolves to the **closest** price-point in that territory's catalog (territory catalogs are cached per session so each is fetched once).

## Credit Pack (IAP) Product ID Alignment

Default consumable in-app purchases (credit packs) ship in all three templates. Auto-fill triggers on any IAP/product entry with a numeric `credits` field, and the same product ID is used on App Store Connect, Google Play, and Adapty so app code only needs one constant.

| Field | Format | Example (10 credits, $4.99) |
|---|---|---|
| ASC `product_id` | `credit_pack_{credits}_{priceDigits}_{appname}` | `credit_pack_10_499_myapp` |
| Play `sku` | _same_ | `credit_pack_10_499_myapp` |
| Adapty `ios_product_id` / `android_product_id` | _same_ | `credit_pack_10_499_myapp` |
| ASC `ref_name` | `{AppName} {LocalizedName} v1 ({price})` | `MyApp Basic Credit Pack v1 (4.99)` |

**Default credit packs**: Basic — 10 credits / $4.99, Pro — 30 credits / $9.99, Ultimate — 80 credits / $19.99.

The Adapty template also adds a `Credits Paywall` (linking the three credit pack products) and a `Credits` placement (developer_id `credits_pack`). Fetch with `Adapty.getPaywall("credits_pack")`.
