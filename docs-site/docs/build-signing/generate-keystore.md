---
sidebar_position: 10
title: Android Signing Keystore
---

# Android Signing Keystore

Generate an Android signing keystore for Play Store releases.

**Command:** `kappmaker generate-keystore` Creates `keystore.jks` and `keystore.properties` with a secure random password.

```bash
kappmaker generate-keystore --organization "MyCompany"
kappmaker generate-keystore --first-name "John Doe" --organization "MyCompany"
kappmaker generate-keystore --output ./custom-keystore-dir
```

Run from the project root (containing `MobileApp/`) or inside `MobileApp/` directly.

## Options

| Flag | Description | Required |
|------|-------------|----------|
| `--first-name <name>` | Developer name for keystore | One of these |
| `--organization <name>` | Organization name for keystore | is required |
| `--output <dir>` | Output directory for keystore files | No |

## Output

Default location: `distribution/android/keystore/` inside MobileApp.

- `keystore.jks` — the signing keystore
- `keystore.properties` — password, alias, and store file path
