---
name: kappmaker
description: Entry point for the KAppMaker CLI — routes to the right KAppMaker skill. Use when the user mentions kappmaker, or wants to work on a mobile app but which part is not yet clear: creating a new app, Firebase, subscriptions and in-app purchases, Adapty, App Store Connect, Google Play Console, ASO keywords, logos, illustrations, app icons, store screenshots, the feature graphic, building and publishing, version bumps, or renaming the package.
argument-hint: "[command or description]"
---

# KAppMaker CLI

Each area of the CLI is its own skill, so only what you need gets loaded. Pick from the table and
use that skill — do not hand-roll a command a skill already documents.

| The user wants… | Use this skill |
|---|---|
| A new app, a new project, "I have an app idea" | **kappmaker-new-app** |
| Firebase, google-services, auth/analytics | **kappmaker-firebase** |
| Subscription / IAP products, credit packs, pricing | **kappmaker-monetization** |
| Adapty — provider dashboard, entitlements, paywalls | **kappmaker-adapty** |
| App Store Connect, iOS listing | **kappmaker-asc** |
| Google Play Console, Android listing, data safety, releases | **kappmaker-gpc** |
| Which keywords to target, ASO research | **kappmaker-aso** |
| What to write in title / subtitle / keywords, per locale | **kappmaker-aso-metadata** |
| The app logo / brand mark | **kappmaker-logo** |
| Any other image — illustrations, empty states, onboarding art | **kappmaker-image** |
| Edit an existing image — split, remove background, enhance, WebP | **kappmaker-image-tools** |
| App icons, launcher icons | **kappmaker-app-icons** |
| Store screenshots, or screenshots in other languages | **kappmaker-screenshots** |
| The Play feature graphic | **kappmaker-feature-graphic** |
| Build, sign, ship — fastlane, keystore, AAB, upload | **kappmaker-publish** |
| Bump the version | **kappmaker-version** |
| Rename the package, bundle ID or app name | **kappmaker-refactor** |

**Starting from a raw idea?** Scaffold with **kappmaker-new-app**, then follow the project's own
bundled `new-app` skill for the PRD interview — it lives *inside* the project and does not exist
until it has been cloned.

**Chained work.** Shipping is keystore → signed AAB → upload; all three live in
**kappmaker-publish** because they are one flow, not three separate asks.

## Prerequisites Check

Before running ANY command, always check:

1. **CLI installed**: Run `which kappmaker`. If missing, tell user to run `npm install -g kappmaker`.
2. **Config exists**: Read `~/.config/kappmaker/config.json` to see what's configured.
3. **Command-specific requirements** (see each command section below).

If a required API key is missing, tell the user exactly how to set it:
```
kappmaker config set <key> <value>
```

And where to get it (see API Key Sources section).

## Context Gathering — Read `AiGuidelines/` First

**Before running ANY kappmaker command, if the user's request is missing inputs the command needs (app idea, app name, tagline, brand color, screenshot direction, keywords, target audience, etc.), read the project's `AiGuidelines/` folder first.** Do not jump straight to asking the user for the missing flags — the answers are usually already written down in the project.

`AiGuidelines/` is the canonical home for AI-facing planning docs in a KAppMaker project. Typical files:

- `app-idea.md` — short pitch / one-liner / target audience
- `prd.md` — product requirements (features, screens, user flows)
- `keywords.md` — ASO keyword research output (primary keywords, sub-niche clusters)
- `brand.md` / `style.md` — brand voice, primary color, typography guidance (if present)
- Any other `*.md` describing the product, screens, or marketing copy

**Cascade order** (stop at first useful match):

1. `AiGuidelines/*.md` — primary source
2. `README.md` at the project root — usually contains the elevator pitch
3. Existing ASO metadata under `MobileApp/distribution/ios/appstore_metadata/texts/en-US/` (`name.txt`, `subtitle.txt`, `description.txt`) — useful for app name + tagline
4. `Assets/googleplay-config.json` / `Assets/appstore-config.json` — for `app.name`, `package_name`, listings

### How to apply the context

After reading the relevant files, **fill in CLI flags automatically** and only prompt the user for inputs that genuinely have no answer in the project. Examples:

- **`generate-feature-image`** — needs `--prompt`, `--app-name`, `--primary-color`, optional `--subtitle`. Pull the description from `app-idea.md` or `prd.md`, the name from `appstore-config.json` / `name.txt`, the subtitle from `subtitle.txt`, the color from `brand.md` (or grep for a hex color in `AiGuidelines/`). If color is the only missing piece, ask only for that.
- **`generate-screenshots`** — needs `--prompt`. Use `prd.md` or `app-idea.md` to build a rich app description automatically.
- **`create-logo`** — needs `--prompt`. Build it from `app-idea.md` + brand notes so the logo matches the product vision.
- **`create-appstore-app`** / **`gpc setup`** — pull title, short description, keywords from `keywords.md` and ASO metadata files instead of asking the user to type them.
- **ASO keyword research** — already follows this convention (documented in the "ASO Keyword Research" section below); apply the same pattern everywhere else.

### When to ask the user

Only prompt the user for inputs that:
1. Are not in `AiGuidelines/`, `README.md`, or store-config files, AND
2. Are required by the command (a `requiredOption` in the CLI), AND
3. Cannot be inferred from another available source

For anything inferable, **state the source briefly** ("Using app name 'Masclet' from `AiGuidelines/app-idea.md`") so the user can correct if the inference is wrong.

### When `AiGuidelines/` doesn't exist

If the folder is missing and the user's request is rich enough to derive the inputs (e.g., they said "generate a feature graphic for my AI mascot app called Masclet, red theme"), proceed without prompting. If the folder is missing AND the request is sparse, offer to create `AiGuidelines/app-idea.md` from a few quick answers — once it's written, every future kappmaker command in this project benefits.

## Template-Bundled Agent Skills — the project has its own playbook

The KAppMaker boilerplate ships ~36 agent skills **inside every scaffolded project**: a `skills/` folder at the repo root, auto-discovered by Claude Code via the `.claude/skills` symlink (other agents find them through `AGENTS.md` / `GEMINI.md` / `.cursorrules` pointers). The index is `<project>/skills/README.md`. They cover what this CLI does not: **writing the actual app**.

- **Phase guides** — ordered blueprints for the developer journey: `getting-started` (Phase 1: run locally + build the MVP, no accounts), `integrations` (Firebase, auth, web-proxy), `publishing` (icons, signing, listings), `monetization` (subscriptions, credit packs, paywall, ads), `growth` (analytics, push, onboarding, virality). Progress is tracked in committed `PROGRESS_FEATURES.md` / `PROGRESS_P1…P5*.md` files at the project's git repo root — read them first, continue from the first unchecked item. The CLI follows the same convention for its own 13-step setup via `PROGRESS_SETUP.md` (see the `create` section).
- **Task skills** — one job each: `new-app` (idea → PRD interview), `build-features`, `new-screen`, `new-local-model`, `add-api-service`, `run-the-app`, `run-quality-gates`, `verify-ui`, and more.

**Division of labor**:

- **This CLI / this skill** → scaffolding, AI assets (logos, screenshots, icons), Firebase / App Store / Play Console / Adapty automation, builds, publishing, ASO, version bumps.
- **Project-bundled skills** → in-repo development (features, screens, models, wiring, quality gates) and the phase-by-phase journey. Several bundled skills invoke kappmaker commands at the right moment — when following one, let it drive.

**Handoff rules**:

- After `create` or `clone` finishes, point the user at the bundled skills. If they arrived with just an idea and no PRD, follow the project's `new-app` skill (interview → `AiGuidelines/prd.md` → hands off to `getting-started`) instead of inventing features yourself.
- When the user asks for in-project work this CLI doesn't cover, check `<project>/skills/README.md` for a matching skill before improvising — the skills know the repo's real paths and conventions.
- Projects cloned from older template versions (or a custom `--template-repo`) may have no `skills/` folder — fall back to normal engineering.

### Starting from a raw idea (interview-first flow)

When the user arrives with only an idea — "build me a habit tracker", "I want to make an app that…" — and there's no app name, no PRD, no project directory yet, do **not** jump straight into `kappmaker create`'s prompts, and do **not** invent the product for them. The boilerplate's bundled **`new-app`** skill owns the idea-to-PRD interview; your job pre-clone is only to unblock the one input scaffolding needs (the name), then hand off:

1. **Name first** (the only thing `clone`/`create` truly needs): if the user has no name, suggest **3 candidates** with one marked ✅ recommended, and derive the app id from the pick (`com.<org>.<appname>`, lowercase). Validate PascalCase. If they say "you decide", take the ✅ one and say so.
2. **Scaffold light**: run `kappmaker clone <AppName>` (not the full `create`). Phase 1 of the bundled journey needs no Firebase / store / Adapty accounts — the template ships a mock subscription provider and a no-Firebase AI path — so deferring the 13-step flow keeps the user moving in minutes instead of front-loading account setup.
3. **Hand off to the project's `new-app` skill** (`<project>/skills/new-app/SKILL.md`): it interviews the user properly — core loop, target audience, pain points, MVP scope, first-taste moment, monetization intent, UI direction — in small batches of 2–3 questions, each with concrete options and a ✅ recommended pick plus "decide for me" / "later" escape hatches. It writes `AiGuidelines/prd.md` / `user_flow.md` / `ui_ux.md`, records deferred decisions, then hands off to the `getting-started` guide (which runs the rebrand via `refactor-package` using the name/id from step 1).
4. **Infra when a phase demands it**: Firebase → the `integrations` guide (calls `kappmaker firebase …`); stores/monetization → `publishing`/`monetization` guides (call `kappmaker create-appstore-app`, `gpc setup`, `adapty setup`). The full `kappmaker create` remains the right call when the user explicitly wants everything provisioned up front — name still gets decided via step 1's pattern first.

Follow the interview style, don't just reference it: **never ask an open-ended question when options will do, batch 2–3 questions max, always mark a ✅ recommended choice, and stop and wait after each batch.**

## API Key Sources

| Key | Where to get it |
|-----|----------------|
| `falApiKey` | https://fal.ai/dashboard/keys |
| `imgbbApiKey` | https://api.imgbb.com (free) |
| `openaiApiKey` | https://platform.openai.com/api-keys |
| `ascKeyId` + `ascIssuerId` + `ascPrivateKeyPath` | App Store Connect > Users and Access > Integrations > App Store Connect API |
| `appleId` | Your Apple ID email address |
| `googleServiceAccountPath` | Google Cloud Console > IAM > Service Accounts > Keys > JSON (then grant access in Play Console > Users and permissions). Used by both `kappmaker publish --platform android` and the entire `kappmaker gpc` command group. |

## Error Handling

- If a command fails, read the error output carefully.
- Common issues:
  - **Missing API keys (fal.ai, OpenAI, imgbb)**: The CLI prompts for them inline on first use and saves to config automatically. No need to pre-configure — the user will be asked when a command needs a key.
  - **Firebase auth errors**: Run `firebase login` separately first
  - **asc not found**: Run `brew install asc`
  - **adapty not found**: Run `npm install -g adapty`
  - **App name validation**: Must be PascalCase, start uppercase, alphanumeric only
  - **Directory already exists**: The create command will ask whether to delete it
- Steps that fail due to missing dependencies warn and skip gracefully instead of aborting the entire flow.
- Missing API keys are prompted inline and saved to config on first use (never fatal exits for unconfigured keys).
- If no config file exists when `create` runs, `configInit()` is triggered automatically before the first step.
- Missing App Store Connect config triggers inline interactive setup (API key, Apple ID, review contact).

## Chaining Commands

Some common workflows:
1. **Full app setup**: `kappmaker create <AppName>` (does everything)
2. **Minimal scaffold (clone + refactor only)**: `kappmaker clone <AppName>` → `cd <AppName>-All/MobileApp` → `kappmaker refactor --app-id <id> --app-name <name>`. Then optionally `cd ..` and `kappmaker git setup-upstream` if the user wants the template kept as the upstream remote.
3. **Firebase-only setup (existing project)**: `kappmaker firebase login` → `kappmaker firebase project --app-name <Name>` → `kappmaker firebase apps --project <id> --app-name <Name> --package-name <pkg>` → `kappmaker firebase auth-anonymous --project <id>` → `kappmaker firebase configs --project <id> --app-name <Name> --package-name <pkg>`. Same as steps 2–6 of `create`.
3. **Screenshots pipeline**: First `generate-screenshots`, then `translate-screenshots`
3. **Logo pipeline**: `create-logo`, then optionally `image-remove-bg` and `image-enhance`
4. **Generic image pipeline**: `generate-image`, then optionally `image-remove-bg` and `image-enhance` for one-off assets (hero images, backgrounds, mockups)
4. **Store setup**: `create-appstore-app`, then `gpc setup`, then `adapty setup` — product IDs align automatically across all three systems. On Android, the Play Console app must already exist (create manually once in Play Console, then `gpc setup` configures everything else).
4. **Re-sync pricing only (after upgrading CLI or adjusting prices)**: `appstore-monetization-push` (ASC subs + IAPs) and/or `gpc monetization push` (Play subs + IAPs) — runs the PPP fan-out without touching listings, data safety, or other config sections.
5. **Iterate on Play Store copy without a full upload**: edit `Assets/googleplay-config.json`, then `kappmaker gpc listings push` (skips Fastlane, talks to the API directly)
5. **Rebrand app**: `refactor --app-id <new-id> --app-name <new-name>`, then `update-version`
6. **First publish**: `fastlane configure`, then `android-release-build`, then `publish`

### config — Configuration Management

**Subcommands**:
- `kappmaker config list` — Show all config values
- `kappmaker config get <key>` — Get a specific value
- `kappmaker config set <key> <value>` — Set a value
- `kappmaker config path` — Show config file path
- `kappmaker config init` — Interactive setup wizard (has prompts). Also offers to initialize global App Store and Adapty defaults at the end.
- `kappmaker config appstore-defaults --init` — Interactive App Store defaults setup. Backfills missing credit-pack IAPs from the template on re-run (useful after upgrading from pre-1.4 defaults).
- `kappmaker config appstore-defaults --save <file>` — Save JSON as global defaults
- `kappmaker config adapty-defaults --init` — Initialize Adapty defaults from the built-in template (subs + 3 credit packs + Credits Paywall + `credits_pack` placement). Backfills any of `products` / `paywalls` / `placements` that are empty/missing on re-run.
- `kappmaker config adapty-defaults --save <file>` — Save Adapty JSON as global defaults

**Valid config keys**: `templateRepo`, `bundleIdPrefix`, `androidSdkPath`, `organization`, `falApiKey`, `imgbbApiKey`, `openaiApiKey`, `ascAuthName`, `ascKeyId`, `ascIssuerId`, `ascPrivateKeyPath`, `appleId`, `googleServiceAccountPath`.

For config setup, prefer using `kappmaker config set <key> <value>` for each key individually rather than `kappmaker config init` (which is fully interactive and harder to guide through).
