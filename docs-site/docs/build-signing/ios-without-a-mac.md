---
sidebar_position: 12
title: Ship iOS without a Mac
---

# Ship iOS without a Mac

Xcode only runs on macOS, so a Windows or Linux machine cannot compile an iOS app. That is the
*only* part of shipping that needs Apple hardware — creating the App Store Connect record,
subscriptions, pricing, metadata and screenshots all happen over the API and work anywhere.

`kappmaker ios-ci` closes that one gap by renting a Mac for the twenty minutes the compile takes: a
GitHub-hosted macOS runner builds your app, signs it, and uploads it to TestFlight or the App Store.

**You never install Xcode, never handle a signing certificate, and never buy a Mac.**

## What you need first

- A GitHub repository for your app, and the GitHub CLI logged in — `gh auth login`
- An App Store Connect API key in your kappmaker config (`ascKeyId`, `ascIssuerId`,
  `ascPrivateKeyPath`) — the same key `create-appstore-app` uses
- The App Store Connect app record already created — `kappmaker create-appstore-app`

## One-time setup

Run from your project root:

```bash
kappmaker ios-ci init
```

This reads your bundle ID and repo, then:

1. generates a password that encrypts your signing certificates, and stores it on your machine
2. pushes your App Store Connect key and that password into your repo's GitHub **secrets**,
   along with any build-time keys already filled in locally
3. checks the release workflow — your project already ships it, so an up-to-date app is left
   alone; only an older project gets it updated

It is safe to re-run.

To see exactly what it would write without touching GitHub:

```bash
kappmaker ios-ci init --dry-run --repo owner/name
```

### One thing you must do yourself

**Commit and push the workflow**, if your project didn't already have it. GitHub only runs workflows
that exist on your default branch.

## Shipping

```bash
kappmaker ios-ci build                    # → TestFlight
kappmaker ios-ci build --track appstore   # → App Store
```

Full App Store release with listing text and screenshots:

```bash
kappmaker ios-ci build --track appstore \
  --upload-metadata --upload-screenshots --submit-for-review
```

The command checks every required secret before spending runner time, starts the build, then follows
it and tells you which step failed if it goes red. Add `--no-wait` to queue it and get on with
something else.

```bash
kappmaker ios-ci status   # recent builds and their results
```

You can also use the familiar publish command:

```bash
kappmaker publish --platform ios --remote
```

## Options

| Flag | Meaning |
|---|---|
| `--track testflight\|appstore` | Where the build goes. Default `testflight`. |
| `--upload-metadata` | Also upload App Store listing text. App Store track only. |
| `--upload-screenshots` | Also upload App Store screenshots. App Store track only. |
| `--submit-for-review` | Submit for review after uploading. |
| `--no-wait` | Queue the build and return immediately. |
| `--ref <branch>` | Build a specific branch or tag. |

TestFlight takes a build, not a store listing, so metadata and screenshots only apply to the
`appstore` track.

## Bump the version before you re-release

Apple rejects a build number it has already accepted, and the build uses exactly what is committed.
So before shipping a new build of the same app, run:

```bash
kappmaker update-version
```

then commit and push. Same step you would take for a local release — the pipeline deliberately does
not invent numbers for you, so what ships always matches what is in git.

## What it costs

GitHub gives every account a monthly allowance of Actions minutes, but macOS minutes are charged at
roughly ten times the Linux rate. In practice that is about **ten iOS builds a month on a free
plan** — plenty for a normal release cadence.

The workflow only runs when you ask it to (there is no build-on-every-push trigger) precisely so a
busy week of commits cannot quietly drain your allowance.

## Where your signing certificates live

Two different things are involved, and they have different lifetimes:

| | Scope | |
|---|---|---|
| **Distribution certificate** | your Apple Developer **account** | Apple allows only **3**. One signs all your apps. |
| **Provisioning profile** | one **app** | Binds that app's bundle ID to the certificate. |

Because the certificate is account-wide, all your apps share **one private repo** for signing
material — by default `<your-owner>/apple-certificates`, created automatically. Your first app
creates the certificate; every app after that finds it and adds only its own profile.

Give each app its own store instead and you would mint a fresh certificate per app — and your
fourth app would fail permanently, because Apple would not issue another.

```bash
kappmaker ios-ci init --certs-repo my-org/apple-certificates   # or let it default
```

The choice is remembered (`iosCertsRepo`), so later apps reuse it without the flag.

**The repo is private**, so your certificates are never public regardless of whether your app repos
are. Reading it from a build needs a personal access token with repo read access — GitHub's built-in
token only reaches the repo it is running in:

```bash
kappmaker config set iosCertsRepoToken <token>    # set once, reused by every app
```

### The first build on a brand-new store

Builds normally only *read* the certificate store, because Apple issues just **two** distribution
certificates per account and an automatic re-issue can quietly consume both. To populate an empty
store the first time, set the repository **variable** `MATCH_READONLY` to `false`, run one build, then
delete it.

```bash
gh variable set MATCH_READONLY --body false     # bootstrap
kappmaker ios-ci build
gh variable delete MATCH_READONLY              # back to read-only
```

If you ever see *"Could not create another Distribution certificate"*, your account is already at the
limit — revoke one you no longer use in the Apple Developer portal.

**Keep your `MATCH_PASSWORD`.** It encrypts the store, and every app sharing that store uses the same
one. Lose it and the stored certificates can never be decrypted — you would have to reset the repo
and burn another of your three certificates.
