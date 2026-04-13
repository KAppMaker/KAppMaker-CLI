---
sidebar_position: 5
title: Subscription Management (Adapty)
---

# Subscription Management (Adapty)

Set up Adapty subscription products, paywalls, and placements using the [Adapty CLI](https://github.com/adaptyteam/adapty-cli).

**Command:** `kappmaker adapty setup`

```bash
kappmaker adapty setup
kappmaker adapty setup --config ./my-config.json
```

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `--config <path>` | Path to JSON config file | `./Assets/adapty-config.json` |

## Prerequisites

Install and log in:

```bash
npm install -g adapty
adapty auth login
```

## What it Does (8 Steps)

1. Validate CLI and authentication
2. Load config (from file or interactive prompts)
3. Find or create app (iOS + Android)
4. Create "Premium" access level
5. Create products
6. Create paywalls (linking products)
7. Create placements (linking paywalls)

## Default Products

| Product | Period | Price | iOS Product ID | Android Product ID | Android Base Plan ID |
|---------|--------|-------|----------------|--------------------|-----------------------|
| Weekly Premium | `weekly` | $6.99 | `{appname}.premium.weekly.v1.699.v1` | `{appname}.premium.weekly.v1` | `autorenew-weekly-699-v1` |
| Yearly Premium | `annual` | $29.99 | `{appname}.premium.yearly.v1.2999.v1` | `{appname}.premium.yearly.v1` | `autorenew-yearly-2999-v1` |

iOS product IDs match the App Store Connect format, and Android IDs match what `kappmaker gpc setup` writes to Google Play Console — so all three systems link automatically.

## Default Paywalls and Placements

| Paywall | Products | Placement | Developer ID |
|---------|----------|-----------|-------------|
| Default Paywall | Weekly + Yearly | Default | `default` |
| Onboarding Paywall | Weekly + Yearly | Onboarding | `onboarding` |
