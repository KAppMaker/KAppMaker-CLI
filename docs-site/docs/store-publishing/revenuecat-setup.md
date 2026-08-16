---
sidebar_position: 6
title: Subscription Management (RevenueCat)
---

# Subscription Management (RevenueCat)

Set up RevenueCat entitlements, products, offerings and packages for your app.

**Command:** `kappmaker revenuecat setup`

```bash
kappmaker revenuecat setup --api-key sk_...
```

RevenueCat is one of two supported subscription providers — the other is
[Adapty](./adapty-setup.md). A project normally uses one of them; the quick-add commands detect
which by looking for `Assets/revenuecat-config.json` or `Assets/adapty-config.json`.

Unlike Adapty, there is no external CLI to install: kappmaker talks directly to the RevenueCat
REST API v2.

## Getting an API key

In the RevenueCat dashboard: **Project settings → API keys → V2**, and create a **secret** key
(`sk_...`). A v1 key will not work.

**Keys are per-project.** A v2 key is created inside one RevenueCat project and can only see that
project — so each app needs its own key. Pass it once and it is remembered for that app:

```bash
cd ~/projects/MyApp-All      # the folder containing Assets/ and MobileApp/
kappmaker revenuecat setup --api-key sk_...
```

The key is saved under the app's bundle ID in `~/.config/kappmaker/revenuecat-keys.json`, so later
commands find it with no flags. If your account only has one app, you can instead set a global
fallback:

```bash
kappmaker config set revenuecatApiKey sk_...
```

Because the key identifies its own project, there is no project ID to configure. If the config
already names a different project than the key belongs to, setup stops rather than writing your
products into the wrong app.

## What it does

Seven idempotent steps:

1. validate the key
2. load `Assets/revenuecat-config.json` (created from a template if missing)
3. find or create the App Store and Play Store apps
4. create entitlements — `premium` and `credit_pack_access`
5. connect your store products
6. attach products to their entitlements
7. create the `default` and `credits_pack` offerings, with a package per product

Re-running is safe: everything is found before it is created.

## Product IDs

The same generator as App Store Connect, Google Play and Adapty, so IDs line up automatically with
whatever `create-appstore-app` and `gpc setup` created.

One RevenueCat-specific rule: **Play subscriptions are connected as `productId:basePlanId`**, for
example `myapp.premium.weekly.v1:autorenew-weekly-699-v1`. RevenueCat rejects the bare subscription
ID as ambiguous. iOS products and Play one-time products use their plain IDs.

Packages use RevenueCat's conventional keys — `$rc_weekly`, `$rc_monthly`, `$rc_annual` — and credit
packs get `credit_pack_<credits>`. The credits offering is called `credits_pack`, matching Adapty's
placement name, so your app code uses one constant whichever provider you pick.

## Adding a product later

Don't re-run the full setup for one product — the quick-add commands push to the stores **and**
mirror into your provider:

```bash
kappmaker subscription add --period weekly --price 9.99
kappmaker iap add --credits 50 --price 14.99
```

Use `--provider revenuecat` to force it when no config file exists yet, or `--provider both` if you
run both providers. See [Quick Add](./quick-add.md).

## Finish in the dashboard

RevenueCat cannot validate purchases until the store credentials are uploaded — these steps are
dashboard-only, and the command prints them as a checklist:

- **App Store Connect API key** — the same `.p8` / Key ID / Issuer ID used by `create-appstore-app`
- **Play service credentials** — the same service-account JSON used by `gpc setup`
- **SDK keys** — copy each app's public key (`appl_...` / `goog_...`) into your mobile app
- **Current offering** — mark `default` as current if it isn't already
