# Changelog

## 2.2.0 (unreleased)

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
