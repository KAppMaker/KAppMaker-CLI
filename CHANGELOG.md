# Changelog

## 2.2.1 (2026-11-27)

Fixes for the "Set up App Army from your AI" path, found in the end-to-end test on a fresh server.

- The Claude sign-in link now comes through clean and once. Claude prints it as a terminal hyperlink, and the link
  reached your AI twice with hidden codes stuck to it, so it looked broken.
- After you sign in, the private page for the sign-in code now opens. Before, the setup only said "Not signed in
  yet" and you had to log in to the server yourself and paste the code there.

## 2.2.0 (2026-11-27)

The first release on npm since 2.0.0. Version 2.1.0 was only ever on a branch and never published, so
everything that was built for it (`kappmaker mcp`) ships here for the first time. Plugin 2.15.0.

### New: `kappmaker mcp`
- `kappmaker mcp` runs the CLI as an MCP server over stdio with 54 typed tools: health checks, a new
  app, Firebase, logo, icons, screenshots, App Store Connect, Google Play, subscriptions, builds,
  publishing, and App Army on your own server over your own SSH key.
- `kappmaker mcp connect claude-code|claude-desktop|codex|gemini` adds it to your AI app in one line
  and sets the long tool timeout where the app has one. Claude Code: `claude mcp add --scope user
  kappmaker -- npx -y kappmaker@latest mcp`.
- One sentence sets up App Army: "Set up App Army on my server at 1.2.3.4". `army_setup` does the
  next step on each call (plan, install, Claude sign-in, Telegram bot, pairing) until it answers
  READY. `army_pair_telegram` finishes the Telegram connection after you confirm it is you.
- Long or paid tools return a plan first and run only with `confirm: true`. No tool takes a key,
  token or password; those go into a private form, and tool output is redacted.
- The army tools read what you bought with a read-only `POST /api/license/check`; nothing else
  about your machine is sent.

### New: publish guard
- `npm publish` refuses when the package would ship a secret or a maintainer id
  (`scripts/prepublish-check.mjs`, run by `prepublishOnly`; `npm run test:publish-guard`).

Fixes for the 12 bugs App Army logged while building 9 apps. The theme: a command must never
print OK for something that did not happen.

### Fixed: silent failures
- **`gpc data-safety push` printed OK on HTTP 400.** Every Play API call now stops the command
  with the HTTP status and Google's error body (exit 1). New `--verify` checks the declaration
  answer by answer against Play's question set (a typo in an answer key fails before anything is
  sent) and prints what Play now declares. Play has no API to read the form back, so it says so.
- **`gpc listings push` could blank live listings.** Play's listing PUT replaces the whole listing;
  the CLI now starts from the live listing, overlays only the fields the config fills in, shows the
  diff, asks before changing a live listing, needs `--allow-empty` to clear a field, and reads the
  listing back before committing the edit. App details keep live contact fields the same way.
- **ASC steps were skipped quietly with an old `asc`.** An `asc` older than 5.9.0, or one whose
  version cannot be read, stops at step 1 with the exact upgrade line. Required asc steps throw
  instead of running with `allowFailure`.
- **`create-appstore-app` printed OK without an App Review detail.** The detail is created or
  updated (`--if-exists update`) and read back; missing contact fields fail up front.
- A tolerated non-zero exit no longer shows a green tick in the spinner.

### Fixed: wrong results
- **`create-appstore-app`** sets the copyright (default `"<year> <organization or app name>"`, also
  on an existing version), every territory (`--all-territories`), the age-rating answers including
  social media / UGC / messaging, and `demoAccountRequired=false` for no-login apps; ensures the
  subscription group localizations on the group version; runs `subscriptions pricing equalize
  --workers 2` for `ppp_enabled: false`; and reads everything back (`asc validate subscriptions`
  for subscriptions). The run ends with a summary of FAILED steps.
- **Prompts ignored piped input** (create app?, adapty y/n). One line reader now serves piped
  answers in order. Every prompting command has `-y, --yes`; `--config <file>` implies it. `--yes`
  never answers a destructive question, an interactive login or an install.
- **`adapty setup`** reads every access level, product, paywall and placement back.
- **Play `regionsVersion` was hardcoded to 2022/02** ("ET is not billable"). Default is now
  `2026/01` (`--regions-version`, config `playRegionsVersion`). `ppp_enabled: false` prices every
  billable region by plain conversion instead of only the listed ones (an app went live priced in
  the US, ET and MN only). Every product is read back and reported as `N of M regions priced`; a
  short product exits 1.
- **`update-version` bumped the version name.** It now bumps the build numbers only;
  `--version-name X` sets the name (`-v` still works).
- **`refactor --app-name "Lab Rat"` broke Gradle.** `rootProject.name`, Xcode `PRODUCT_NAME` and the
  iOS publish workflow `app_name` get the Gradle-safe `LabRat`; the display name keeps its spaces.
  The workflow `app_name` is rewritten whatever it held (it stayed "Koko").
- **Icons left the Kotlin splash.** `generate-ios-icons` writes `ic_logo.imageset` (and
  `SplashBackground` with `--splash-background`); `generate-android-icons` points
  `windowSplashScreenAnimatedIcon` at the new icon, sets the splash background, and writes a
  themed monochrome icon.

### Also
- Play and Adapty list calls fail loudly (a failed list used to read as "nothing exists").
- `kappmaker create`, `subscription add` and `iap add` end with a step summary.
- Tests: `test:play` (fake Play API), `test:asc` (fake `asc` binary), `test:fixes`.
