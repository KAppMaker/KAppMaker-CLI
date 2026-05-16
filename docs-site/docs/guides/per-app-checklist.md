---
sidebar_position: 1
title: Per-App Checklist
---

# Per-App Checklist

A short, copy-and-tick list of what to run for each new app from idea to live in both stores. Each item is phrased as a natural-language prompt for the [Claude Code skill](./claude-code-skill.md) — paste it into a session and the skill picks the right command, reads `AiGuidelines/` for missing context, and prompts only for the gaps.

For the full walkthrough with copy-paste examples, sequencing rules, and the trade-offs behind each step, see [Claude Code Skill — End-to-End](./claude-code-skill.md#end-to-end-from-idea-to-production).

## Pre-development

- [ ] Using kappmaker, scaffold the project
- [ ] Using kappmaker, research ASO keywords for the app idea
- [ ] Using kappmaker, create the app logo
- [ ] Using kappmaker, generate the iOS app icons from the logo
- [ ] Using kappmaker, generate the Android app icons from the logo with my brand color

## Build the app

Use Claude Code (or your normal workflow) to implement the features, UI, business logic, and integrations. Resume below once the app is functionally complete enough to screenshot and submit to stores.

## Post-development

- [ ] Using kappmaker, generate marketing screenshots
- [ ] Using kappmaker, generate the Play Store feature graphic
- [ ] Using kappmaker, localize the ASO metadata (keyword-expansion or market-localization)
- [ ] Using kappmaker, translate the screenshots into the chosen locales
- [ ] Using kappmaker, set up App Store Connect
- [ ] Using kappmaker, set up Google Play Console
- [ ] Using kappmaker, set up Adapty subscriptions and paywalls
- [ ] Using kappmaker, configure Fastlane (once per machine)
- [ ] Using kappmaker, generate the Android signing keystore (once per app)
- [ ] Using kappmaker, build the signed Android release
- [ ] Using kappmaker, bump the app version to 1.0.0
- [ ] Using kappmaker, publish to both stores

## Subsequent releases

For follow-on releases, the list collapses to three lines:

- [ ] Using kappmaker, bump the app version
- [ ] Using kappmaker, build the signed Android release
- [ ] Using kappmaker, publish to both stores

If you only changed ASO copy and don't need a rebuild, just re-localize and push listings:

- [ ] Using kappmaker, localize the ASO metadata
- [ ] Using kappmaker, push store listings to Google Play
