# Integrations audit — 2026-11-26 (kappmaker 2.0.0)

Every external tool or API the CLI wraps or checks, verified against the tool's current `--help`,
release notes, official docs or discovery document on 2026-11-26. `kappmaker doctor` shows what is
installed on a machine, with the exact install line for macOS (Homebrew) and Linux (apt).

Status: **fixed** = was broken or wrong, changed in this release · **updated** = worked, brought
current · **ok** = verified, no change · **open** = known, not changed (see notes).

## CLIs the CLI shells out to

| Tool | Current version / API | What changed | Status |
|---|---|---|---|
| **asc** (App Store Connect CLI, rorkai) | 7.6.1 on Homebrew; audited flag-by-flag on 5.17.1 `--help` + 2.0–7.x release notes | `app-setup availability set` renamed in 3.0 and can no longer set the new-territory flag → `pricing availability create --if-exists update`. `subscriptions groups localizations create` removed in 5.0 → `subscriptions setup --group-locale/--group-display-name` + group-version localizations. `prices import` needs `--confirm` (3.3). `subscriptions setup` now verifies the finished product and fails a fresh one → `--no-verify`, id read on non-zero exit, re-run detection matches "existing subscription". Import counts `skipped`/`reconciled` as applied. Env-var credentials count as logged in. Bundle-id lookup filters with `--identifier`. `--demo-account-required=true` with demo credentials. Minimum **5.9.0** (was 1.2.1). Linux without Homebrew: `curl -fsSL https://asccli.sh/install \| bash`. 6.x/7.x flags not checked against `--help` (not installed); their notes don't touch the commands used. | **fixed** |
| **adapty** CLI | 0.33.0 (npm, Node ^22 \|\| >=24); was tested against 0.1.5 | EU region host (`api-eu-admin.adapty.io`) for the consumable REST workaround, chosen like the CLI does (`ADAPTY_API_URL` → `ADAPTY_REGION` → stored `region` → US). `paywalls create --products '<json>'` on ≥ 0.33 (`--product-id` deprecated). `products create --price-usd` now exists and is sent. `consumable` still missing from `--period` → REST workaround kept. Minimum 0.33.0 (warns). | **fixed** |
| **firebase-tools** | 15.37.0 (Node ≥ 20) | `projects:create`, `apps:create`, `apps:sdkconfig`, `apps:list`, token location unchanged. `firebase login` now adds `--no-localhost` over SSH / on Linux without a display (VPS). Minimum 14.0.0. | **updated** |
| **fastlane** (via project Gemfile) | 2.242.0, Ruby ≥ 3.2 | All actions used are current. `export_method "app-store"` → `"app-store-connect"`. Bundle-id regex had an accidental `.-_` range. Runs with `FASTLANE_OPT_OUT_USAGE=YES` and update check off. Ruby floor 3.2. | **updated** |
| **gh** (GitHub CLI) | 2.106.0 | `auth status`, `repo view/create`, `secret set` (stdin), `secret list`, `workflow run`, `run list/view` all current. Minimum 2.40. Install hint platform-aware. | **ok** |
| **git** | — | Hint was `xcode-select --install` on every OS; Linux now gets apt. | **updated** |
| **JDK / keytool** | JDK 17+ (current AGP) | New check (doctor + hints): macOS `brew install --cask temurin@17`, Linux `openjdk-17-jdk`. The macOS `/usr/bin/java` stub counts as missing. | **updated** |
| **Android SDK** | platform/build-tools 36 (Play target API 36 since 2026-08-31) | Default path follows `ANDROID_HOME` / `ANDROID_SDK_ROOT`, and is `~/Android/Sdk` on Linux (was the macOS path everywhere). Install lines name `android-36` / `36.0.0`. | **fixed** |
| **Xcode** | 26+ (App Store Connect rejects older SDK builds since 2026-04-28) | Doctor checks ≥ 26; on Linux points at `ios-ci` / `publish --remote`. | **updated** |
| **CocoaPods** | — | Used only when the template has a `Podfile`; current KAppMaker template is SwiftPM. | **ok** |
| **ffmpeg** | 7.x | Optional (mascot WebP/GIF). Missing vs failed now reported apart, platform hint. | **updated** |
| **Node.js** | 22 LTS (maintenance) / 24 LTS; Node 20 is EOL | Engine `>=22.12` (commander 15 / execa 10 / ora 10 / chalk 6). Entry point checks before importing and prints the install line. | **fixed** |

## HTTP APIs called directly

| API | Current | What changed | Status |
|---|---|---|---|
| **Google Play Developer API** (androidpublisher v3) | discovery revision 20261126 | Every endpoint used exists (edits, listings, details, subscriptions + basePlans, onetimeproducts, purchaseOptions:batchUpdateStates, pricing:convertRegionPrices, dataSafety). `regionsVersion 2022/02` is still the newest. Deprecated `subscriptions.archive` / legacy `inappproducts` subscription fields are not used. | **ok** |
| **App Store Connect API** | via asc only | No direct calls. | **ok** |
| **RevenueCat REST v2** | per-resource docs (the published OpenAPI file currently has empty `paths`) | App, product, entitlement, package bodies match. Added Retry-After/backoff on HTTP 429 (60 req/min on project configuration). Offerings body (`lookup_key`) could not be re-checked. | **updated** |
| **Adapty developer API** | `/api/v1/developer` (US + EU hosts) | See adapty above. | **fixed** |
| **Firebase Identity Toolkit / Service Usage** | admin v2 | `config?updateMask=signIn.anonymous.enabled` and service enable unchanged. | **ok** |
| **fal.ai** queue API | `queue.fal.run`, `Key` auth | `fal-ai/ltxv-2/image-to-video/fast` was removed (404) → `fal-ai/ltx-2.3/image-to-video/fast`. Seedance 2.0 `duration` is a string enum → sent as string. nano-banana-2, nano-banana-2/edit, bria background removal unchanged. | **fixed** |
| **OpenAI** Responses API | `/v1/responses` (no deprecation) | `gpt-4.1` is deprecated, shutdown **2027-01-14**. Model is now configurable (`openaiModel`, `KAPPMAKER_OPENAI_MODEL`); default left at `gpt-4.1` because the successor ID could not be verified independently. Response text read from `output_text` / first message item (reasoning models). | **open** — set a new default before 2027-01-14 |
| **imgbb** | `api.imgbb.com/1/upload` | Uploads now expire after 24 h (were public forever). | **updated** |
| **kappmaker.com** | `/install.sh` + `/install.sh.sha256` | New: `kappmaker army install` only. Fixed User-Agent, no machine details. Needs the website to serve `install.sh.sha256`. | **new** |

## GitHub Actions template (`src/templates/ios-ci-workflow.yml`)

`actions/checkout` v4 → v7, `actions/upload-artifact` v4 → v7, `softprops/action-gh-release` v1 → v3,
Ruby 3.2 (EOL) → 3.4, hardcoded `app_name: Koko` → `__APP_NAME__`. `macos-latest` = macOS 26 arm64
with Xcode 26 — fine. **updated**

## Privacy / phone-home

kappmaker itself: no telemetry, analytics, crash reporting or update checks; every network call is
to a service the running command is configured for. Third-party tools it starts: fastlane usage
reporting turned off via env; firebase-tools asks for its own analytics opt-in at `firebase login`
(the user's answer, nothing forced); the adapty CLI checks npm for updates only on `adapty version`.

## Open items

- OpenAI default model must move off `gpt-4.1` before 2027-01-14 (needs a verified model ID).
- `firebase projects:list` / `apps:list` output is parsed as a table; `--json` would be sturdier.
- The ASC flags were checked on asc 5.17.1; re-run the check against 7.x `--help` once installed.
- `kappmaker.com/install.sh.sha256` must be published next to `install.sh` (website).
