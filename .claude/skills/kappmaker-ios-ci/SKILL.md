---
name: kappmaker-ios-ci
description: Build and ship a KAppMaker iOS app from GitHub Actions, so no Mac is needed locally — TestFlight and App Store releases, signing, metadata and screenshots included. Use when the user has no Mac, when an iOS build fails because Xcode is missing (Linux boxes, CI, a Windows machine), or when they ask to publish/ship/release iOS, send a build to TestFlight, or set up iOS CI.
---

# KAppMaker — iOS from CI (no Mac needed)

Xcode only runs on macOS, so a Linux box cannot compile an iOS app. Everything
*around* the compile — App Store Connect records, products, metadata, ASO — the
CLI already does over the API from anywhere. This skill closes the one real gap
by renting a Mac for the ~20 minutes the compile takes: a GitHub-hosted macOS
runner does the build, signs it, and uploads it.

**The runner is the Mac.** The user never installs Xcode, never handles a
certificate, never owns Apple hardware.

## Before running any command

1. **Prerequisites** — `kappmaker --version` (install: `npm i -g kappmaker`), plus
   `gh` logged in (`gh auth login`) since everything runs through the user's own
   GitHub account.
2. **App Store Connect API key in config** — `ascKeyId`, `ascIssuerId`,
   `ascPrivateKeyPath`, exactly as for `kappmaker create-appstore-app`.
3. The project must be a GitHub repo, and the ASC app record must exist
   (**kappmaker-asc**).

### ios-ci init — one-time setup

**Syntax**: `kappmaker ios-ci init [--repo <owner/name>] [--certs-repo <owner/name>]
[--match-password <value>] [--mobile-dir <path>] [--dry-run]`

Run it from the project root. It:

1. reads the bundle ID from the Xcode project and the repo from the git remote,
2. creates a **private** certificates repo (`<repo>-certs`) if missing — and
   refuses to continue if that repo is public, because it holds signing identities,
3. mints a `match` password (or reuses the stored one) and keeps it in
   `~/.config/kappmaker/match-passwords.json`,
4. pushes the ASC key, match password and certs-repo URL into the app repo's
   **GitHub secrets** (via `gh secret set`, value on stdin so it never hits a
   process list),
5. writes `.github/workflows/ios-release.yml` and inserts a `ci_appstore_release`
   lane into `fastlane/Fastfile`,
6. prints what a human still has to do.

Idempotent: re-running reuses the certs repo, the password and the existing lane.
`--dry-run` writes the files locally and touches nothing on GitHub — it needs
`--repo` because it deliberately makes no API calls.

**Two things init cannot do for the user**, and both block the first build:

- **Commit and push the workflow.** GitHub only runs workflows present on the
  default branch.
- **A token that can read the certs repo.** `match` clones it from the runner, and
  the built-in `GITHUB_TOKEN` only reaches the repo it runs in. Set `GITHUB_TOKEN`
  (a PAT with `repo` read) in the environment before `init`, or add
  `MATCH_GIT_BASIC_AUTHORIZATION` by hand afterwards — base64 of
  `x-access-token:<pat>`. Without it the build fails at the `match` step with a
  clone error, which reads confusingly as a signing problem.

### Build-time secrets — the silent-breakage trap

A KAppMaker app reads a dozen-plus values through `getRequiredProperty()` in
`build.gradle.kts` — Firebase, OpenAI, the subscription provider, AdMob, Google
sign-in. They live in `local.properties`, which is **gitignored**, so a CI
checkout has none of them. Every one declares a `defaultValue`, so a missing key
does **not** fail the build: it produces a green binary carrying `""` or
`"testValue"` and ships a broken app to TestFlight.

`init` therefore scans the Gradle files, generates a workflow step that rebuilds
`local.properties` from same-named repo secrets, and copies across whatever the
developer's own `local.properties` already has. Keys with no value are listed in
the checklist with the exact `gh secret set` line — **relay that list to the
user**, because nothing downstream will complain about them.

### ios-ci build — ship it

**Syntax**: `kappmaker ios-ci build [--track testflight|appstore] [--submit-for-review]
[--upload-metadata] [--upload-screenshots] [--no-bump-build] [--no-wait] [--ref <branch>]`

Defaults to TestFlight. Verifies every required secret exists before spending 20
minutes of runner time, triggers the workflow, then follows it and reports the
failing step by name if it goes red.

`--upload-metadata` / `--upload-screenshots` push the App Store listing text and
screenshots from `distribution/ios/appstore_metadata/` — the same paths and the
same fastlane action the local `appstore_release` lane uses. They apply to the
**appstore track only**; TestFlight takes a build, not a listing, and the lane
says so rather than silently ignoring them.

**Build numbers auto-advance** past the latest on TestFlight, because CI builds
from a clean checkout and Apple rejects a number it has already seen — locally
you would run `kappmaker update-version` first. `--no-bump-build` ships exactly
what is committed.

### ios-ci status

Recent runs with their conclusions, and the failing step for the most recent
failure. Use it when the user asks "did my build work?".

### publish --remote

`kappmaker publish --platform ios --remote` routes through this pipeline instead
of building locally, so the familiar command works on a machine with no Xcode.
Without `--remote` on a non-Mac, `publish` now fails with a pointer here instead
of an opaque Xcode error.

## What this does and does not need a Mac for

| Task | Needs a Mac? |
|---|---|
| Compile the app, make the `.ipa` | Yes — that is what the runner is for |
| Sign it | No — `match` runs on the runner with certs from the private repo |
| Upload build, metadata, screenshots | No — App Store Connect API |
| Create the app record, products, pricing | No — **kappmaker-asc**, works from Linux today |

## Cost

GitHub-hosted macOS minutes bill at a multiple of Linux minutes and draw from the
account's included allowance, which works out to roughly ten 20-minute iOS builds
a month on a free plan. Enough for a normal release cadence; a team building all
day will pay per minute beyond it. Worth telling the user before they wire up a
build-on-every-push trigger — the workflow is deliberately `workflow_dispatch`
only for this reason.

---

## Where this sits in the flow

- **Before this:** **kappmaker-asc** (the app record must exist),
  **kappmaker-version** if shipping a new marketing version.
- **After this:** the build is in TestFlight or in review. **kappmaker-aso-metadata**
  and **kappmaker-screenshots** produce the listing content this uploads.
