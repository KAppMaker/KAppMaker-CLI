---
sidebar_position: 4
title: Google Play Console Setup
---

# Google Play Console Setup

A tight wrapper around the official Google Play Android Publisher API. All subcommands authenticate via the service account JSON at `googleServiceAccountPath`. **No external CLI and no extra npm dependencies** — the JWT flow and HTTPS calls are implemented with Node's built-in `crypto` and `fetch`.

:::note
Google Play does not allow creating new apps via any public API. Create the app manually once in [Play Console](https://play.google.com/console/u/0/developers), then use these commands to configure it.
:::

## gpc setup

Full end-to-end configuration (11 steps) — the Google Play parallel to `create-appstore-app`.

```bash
kappmaker gpc setup
kappmaker gpc setup --config ./my-config.json
```

**Alias:** `kappmaker create-play-app`

### What it Does (11 Steps)

1. Validate service account + obtain access token
2. Load config (`./Assets/googleplay-config.json` or interactive prompts). Auto-detects Play's actual default language and migrates legacy product IDs
3. Review summary and confirm
4. Verify app exists on Play Console (fails fast with a deep link if not)
5. Start a Play Console edit (skipped if default-language listing has no title)
6. Update app details (default language + contact website/email/phone)
7. Update store listings per locale (title, short/full description, video); commits the edit. Empty listing titles are auto-filled from the app name
8. Create subscriptions via the new monetization API. Base plans are available to all ~175 Play regions (not just the regions with explicit prices — Google auto-converts pricing for the rest). Idempotent — existing product IDs are skipped. Skipped if no build is uploaded to any track
9. Create one-time in-app products via the new monetization API. Idempotent
10. Update the data safety declaration (JSON → CSV conversion using bundled canonical template)
11. Print a checklist of manual-only Play Console declarations that have no REST endpoints

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--config <path>` | Path to JSON config file | `./Assets/googleplay-config.json` |

---

## gpc listings push

Push just the store listings section from the config file. Useful after editing copy.

```bash
kappmaker gpc listings push
kappmaker gpc listings push --config ./my-config.json
```

Runs a single edit transaction: updates app details → updates every listing locale → commits.

---

## gpc subscriptions list

Read-only — lists existing subscription product IDs on Play Console.

```bash
kappmaker gpc subscriptions list --package com.example.myapp
kappmaker gpc subscriptions list   # uses app.package_name from the config file
```

## gpc subscriptions push

Create or reuse subscriptions from the config file. Idempotent — already-existing product IDs are skipped.

```bash
kappmaker gpc subscriptions push
```

Uses the new monetization API. Auto-generated IDs:

| Field | Format | Example ($6.99 weekly) |
|---|---|---|
| `productId` | `{appname}.premium.{period}.v1` | `myapp.premium.weekly.v1` |
| `basePlanId` | `autorenew-{period}-{priceDigits}-v1` | `autorenew-weekly-699-v1` |
| Subscription title | `{AppName} Premium {PeriodLabel}` | `MyApp Premium Weekly` |

---

## gpc iap list

Read-only — lists existing one-time in-app product SKUs on Play Console.

```bash
kappmaker gpc iap list --package com.example.myapp
kappmaker gpc iap list
```

## gpc iap push

Create or reuse one-time in-app products from the config file. Idempotent.

```bash
kappmaker gpc iap push
```

Uses the new monetization API (`PATCH /onetimeproducts/{id}?allowMissing=true`), replacing the legacy `/inappproducts` endpoint.

---

## gpc data-safety push

Push only the data safety declaration. Faster than running the full `setup` when iterating on the privacy answers.

```bash
kappmaker gpc data-safety push
```

### Two Ways to Configure

**1. Structured JSON (recommended)** — `data_safety.answers` overlay on top of defaults:

```json
"data_safety": {
  "apply_defaults": true,
  "answers": {}
}
```

Default data types collected:

| Data type | Play Question / Response | Collection purposes |
|---|---|---|
| User IDs | `PSL_DATA_TYPES_PERSONAL/PSL_USER_ACCOUNT` | App functionality, Account management |
| Device ID | `PSL_DATA_TYPES_IDENTIFIERS/PSL_DEVICE_ID` | App functionality, Advertising or marketing, Account management |
| Crash logs | `PSL_DATA_TYPES_APP_PERFORMANCE/PSL_CRASH_LOGS` | Analytics |
| Diagnostics | `PSL_DATA_TYPES_APP_PERFORMANCE/PSL_PERFORMANCE_DIAGNOSTICS` | Analytics |
| Other performance | `PSL_DATA_TYPES_APP_PERFORMANCE/PSL_OTHER_PERFORMANCE` | Analytics |
| App interactions | `PSL_DATA_TYPES_APP_ACTIVITY/PSL_USER_INTERACTION` | Analytics |

Default data handling: collected only (not shared), processed ephemerally, collection is required, encrypted in transit.

To override a specific answer, add keys to `answers`:

```json
"data_safety": {
  "apply_defaults": true,
  "answers": {
    "PSL_DATA_TYPES_LOCATION/PSL_APPROX_LOCATION": true
  }
}
```

**2. Escape hatch: CSV file** — upload a Play Console-exported CSV verbatim:

```json
"data_safety_csv_path": "Assets/data-safety.csv"
```

---

## gpc app-check

Quick read-only probe to verify that an app exists on Play Console. Useful for CI scripts.

```bash
kappmaker gpc app-check --package com.example.myapp
```

Exits `0` if found, `2` if missing (prints the Play Console deep link).

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--package <name>` | Override the package name from config | — |
