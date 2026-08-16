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
2. checks `.github/workflows/publish_ios_appstore.yml` — **the boilerplate already
   ships this workflow**, so an up-to-date project is left alone. Only a project
   predating the match-based pipeline gets it rewritten, and the fastlane lane is
   added only when absent. There is always exactly one iOS workflow.
3. mints a `match` password (or reuses the stored one) and keeps it in
   `~/.config/kappmaker/match-passwords.json`,
4. pushes `APPSTORE_KEY_ID` / `APPSTORE_ISSUER_ID` / `APPSTORE_PRIVATE_KEY`,
   `MATCH_PASSWORD` and a generated `GRADLE_CACHE_ENCRYPTION_KEY` into the repo's
   **GitHub secrets** (via `gh secret set`, value on stdin so it never hits a
   process list), plus any build key already filled in locally,
5. prints what a human still has to do.

Certificates live on a `match-certificates` branch of the same repo, so the
built-in `GITHUB_TOKEN` reaches them: no second repository and no personal access
token. The git URL and auth are derived inside the workflow from the Actions
context rather than stored as secrets.

Idempotent: re-running reuses the stored password and leaves an up-to-date
workflow and lane untouched.
`--dry-run` writes the files locally and touches nothing on GitHub — it needs
`--repo` because it deliberately makes no API calls.

**One thing `init` cannot do for the user**, and it blocks the first build:
**commit and push the workflow** — GitHub only runs workflows present on the
default branch. On an up-to-date project it is already committed, so there is
nothing to do.

### ios-ci build — ship it

**Syntax**: `kappmaker ios-ci build [--track testflight|appstore] [--submit-for-review]
[--upload-metadata] [--upload-screenshots] [--no-wait] [--ref <branch>]`

Defaults to TestFlight. Verifies every required secret exists before spending 20
minutes of runner time, triggers the workflow, then follows it and reports the
failing step by name if it goes red.

`--upload-metadata` / `--upload-screenshots` push the App Store listing text and
screenshots from `distribution/ios/appstore_metadata/` — the same paths and the
same fastlane action the local `appstore_release` lane uses. They apply to the
**appstore track only**; TestFlight takes a build, not a listing, and the lane
says so rather than silently ignoring them.

**Build numbers come from the commit.** Apple rejects a build number it has
already accepted, and CI builds exactly what is in git — so run
**kappmaker-version** (`kappmaker update-version`) before re-releasing, the same
as for a local publish. There is deliberately no auto-bump in the pipeline: one
way to move the number, and it stays auditable in git.

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
