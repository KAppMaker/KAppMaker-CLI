---
sidebar_position: 4
title: Firebase Setup
---

# Firebase Setup

Five standalone subcommands matching steps 2–6 of [`kappmaker create`](/project-setup/create). Run them individually for partial flows (e.g. set up Firebase for an existing project, or refresh `google-services.json` in CI), or chain them together to replicate what `create` does.

**Commands:**

```bash
kappmaker firebase login
kappmaker firebase project --app-name MyApp
kappmaker firebase apps --project myapp-app --app-name MyApp --package-name com.example.myapp
kappmaker firebase auth-anonymous --project myapp-app
kappmaker firebase configs --project myapp-app --app-name MyApp --package-name com.example.myapp
```

## Prerequisites

- `firebase` CLI installed (`npm install -g firebase-tools`)
- `kappmaker firebase login` must have been run before any of `project`, `apps`, `auth-anonymous`, or `configs`

## Naming Conventions Used by `create`

Match these if you want to replicate what `create` does:

| Field | Format | Example (app name `MyApp`) |
|---|---|---|
| Project ID | `<lowercase-app-name>-app` | `myapp-app` |
| Android app display name | `${appName} (Android App)` | `MyApp (Android App)` |
| iOS app display name | `${appName} (iOS App)` | `MyApp (iOS App)` |

The `--app-name <Name>` shortcut on `firebase project` derives both project ID and display name. `firebase configs` looks up apps by these display names unless you pass `--android-app-id` / `--ios-app-id` directly.

---

## `firebase login`

Runs `firebase login` (interactive). No args.

```bash
kappmaker firebase login
```

---

## `firebase project`

Creates the Firebase project. Idempotent — if the project already exists it skips creation.

```bash
kappmaker firebase project --app-name MyApp                # derives project-id = myapp-app
kappmaker firebase project --project-id myapp-prod --display-name MyApp
```

| Flag | Description | Required |
|------|-------------|----------|
| `--project-id <id>` | Firebase project ID (e.g. `myapp-app`) | Yes, unless `--app-name` is set |
| `--display-name <name>` | Project display name | Defaults to `--project-id` or `--app-name` |
| `--app-name <name>` | PascalCase app name; derives `project-id = <lowercase>-app` and `display-name = <name>` | Yes, unless explicit IDs are passed |

When called from `create`, returns success/failure to the orchestrator — if creation fails, steps 4–6 are skipped with a warning.

---

## `firebase apps`

Creates an Android + iOS app under the project. Idempotent — reuses existing apps that match the expected display name instead of creating duplicates.

```bash
kappmaker firebase apps --project myapp-app --app-name MyApp --package-name com.example.myapp
```

| Flag | Description | Required |
|------|-------------|----------|
| `--project <id>` | Firebase project ID | Yes |
| `--app-name <name>` | PascalCase display name (used to label the apps) | Yes |
| `--package-name <pkg>` | Android `applicationId` and iOS bundle ID | Yes |

---

## `firebase auth-anonymous`

Enables anonymous authentication via the Identity Toolkit Admin API.

```bash
kappmaker firebase auth-anonymous --project myapp-app
```

| Flag | Description | Required |
|------|-------------|----------|
| `--project <id>` | Firebase project ID | Yes |

If Firebase Auth has never been initialized for the project, the command pauses and asks you to click **Get started** in the Firebase Console, then retries automatically.

---

## `firebase configs`

Downloads `google-services.json` and `GoogleService-Info.plist` for the Android + iOS apps and writes them to the right place.

```bash
kappmaker firebase configs --project myapp-app --app-name MyApp --package-name com.example.myapp
kappmaker firebase configs --project myapp-app --app-name MyApp \
  --android-output ./google-services.json --ios-output ./GoogleService-Info.plist
```

| Flag | Description | Required |
|------|-------------|----------|
| `--project <id>` | Firebase project ID | Yes |
| `--app-name <name>` | PascalCase display name (used to find the apps if app IDs aren't given) | Yes |
| `--package-name <pkg>` | Verify and fix the Android `google-services.json` package name | No |
| `--android-app-id <id>` | Skip lookup and use this Firebase App ID | No |
| `--ios-app-id <id>` | Skip lookup and use this Firebase App ID | No |
| `--android-output <path>` | Output path for `google-services.json` | Auto-detect |
| `--ios-output <path>` | Output path for `GoogleService-Info.plist` | Auto-detect |

### Output auto-detection

When `--android-output` / `--ios-output` aren't given, the command probes:

1. `MobileApp/androidApp/google-services.json` (AGP 9 layout) — picked if `MobileApp/androidApp/` exists
2. `MobileApp/composeApp/google-services.json` (legacy KMP-as-application layout) — picked if `MobileApp/composeApp/` exists
3. `Assets/google-services.json` — last-resort fallback

Same probe for iOS — `MobileApp/iosApp/iosApp/GoogleService-Info.plist` first, otherwise `Assets/GoogleService-Info.plist`.

### Package verification

When `--package-name` is provided, the downloaded `google-services.json` is verified against the expected package name and patched in-place if it doesn't match. This handles cases where the Firebase app was registered with an older `bundleIdPrefix` and you've since refactored.

---

## Idempotency Summary

| Command | Idempotent? | How |
|---|---|---|
| `firebase login` | Cached login | The Firebase CLI handles caching |
| `firebase project` | Yes | Skips creation if project already exists |
| `firebase apps` | Yes | Reuses apps that match the expected display name |
| `firebase auth-anonymous` | Yes | API call is safe to repeat |
| `firebase configs` | Yes | Re-downloads (no side effects) |

## Firebase-Only Setup (existing project)

```bash
kappmaker firebase login
kappmaker firebase project --app-name MyApp
kappmaker firebase apps --project myapp-app --app-name MyApp --package-name com.example.myapp
kappmaker firebase auth-anonymous --project myapp-app
kappmaker firebase configs --project myapp-app --app-name MyApp --package-name com.example.myapp
```

Same as steps 2–6 of [`create`](/project-setup/create).
