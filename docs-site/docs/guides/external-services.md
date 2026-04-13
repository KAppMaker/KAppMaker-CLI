---
sidebar_position: 1
title: External Services & API Keys
---

# External Services & API Keys

The CLI integrates with several external services for AI image generation, app store management, and subscription setup. All keys are stored locally at `~/.config/kappmaker/config.json`.

## fal.ai — AI Image Generation

**Used for:** Logo generation, background removal, image enhancement, screenshot translation, and screenshot generation.

**How to get your key:**
1. Sign up at [fal.ai](https://fal.ai)
2. Go to [Dashboard > Keys](https://fal.ai/dashboard/keys) and create an API key
3. Configure:
   ```bash
   kappmaker config set falApiKey <your-key>
   ```
   Or skip this — the CLI will prompt you the first time you run a command that needs it.

---

## ImgBB — Image Hosting

**Used for:** Temporarily hosting reference images when generating or translating screenshots (fal.ai needs a public URL to process images).

**How to get your key:**
1. Sign up at [imgbb.com](https://imgbb.com)
2. Go to [api.imgbb.com](https://api.imgbb.com/) and get your free API key
3. Configure:
   ```bash
   kappmaker config set imgbbApiKey <your-key>
   ```

---

## OpenAI — Prompt Generation

**Used for:** Generating detailed screenshot specifications from a short app description (uses GPT-4.1). Only needed for the `generate-screenshots` command.

**How to get your key:**
1. Sign up at [platform.openai.com](https://platform.openai.com)
2. Go to [API Keys](https://platform.openai.com/api-keys) and create a new key
3. Configure:
   ```bash
   kappmaker config set openaiApiKey <your-key>
   ```

---

## App Store Connect CLI

**Used for:** Creating apps, setting metadata, categories, subscriptions, privacy declarations, and review info on App Store Connect. The same API key credentials are also used by `publish --platform ios`.

**How to set up:**
1. Install: `brew install asc`
2. Generate an API key at [App Store Connect > Users and Access > Integrations > API](https://appstoreconnect.apple.com/access/integrations/api) (Admin role, download the `.p8` file immediately)
3. Configure:
   ```bash
   kappmaker config set ascKeyId <your-key-id>
   kappmaker config set ascIssuerId <your-issuer-id>
   kappmaker config set ascPrivateKeyPath /path/to/AuthKey.p8
   kappmaker config set appleId your@email.com
   ```
   Or run `kappmaker config appstore-defaults --init` for interactive setup.

:::note
`kappmaker publish --platform ios` uses `ascKeyId`, `ascIssuerId`, and `ascPrivateKeyPath` to automatically generate the Fastlane-format publisher JSON — no separate credentials needed.
:::

---

## Adapty CLI — Subscription Management

**Used for:** Setting up in-app subscription products, paywalls, and placements across iOS and Android via Adapty's backend.

**How to set up:**
1. Install: `npm install -g adapty`
2. Log in: `adapty auth login` (opens browser for authentication)
3. Run: `kappmaker adapty setup`

---

## Firebase CLI — Backend Setup

**Used for:** Creating Firebase projects, registering Android/iOS apps, downloading SDK config files, and enabling anonymous authentication.

**How to set up:**
1. Install: `npm install -g firebase-tools`
2. The `create` command handles login and project creation interactively.

---

## Google Play Publisher

**Used for:**
- Building and uploading Android AABs via `kappmaker publish --platform android` (Fastlane)
- Configuring store listings, subscriptions, in-app products, and data safety via `kappmaker gpc ...` (direct Publisher API)

Both flows share the same service account JSON key — set it once, use it everywhere.

**How to set up:**

1. Go to [Google Cloud Console](https://console.cloud.google.com) and create a new project (or select existing)
2. Open **APIs & Services > Library**, search for **Google Play Android Developer API**, and enable it
3. Go to **IAM & Admin > Service Accounts**, create a new service account (skip role assignment)
4. Open the service account, go to **Keys**, click **Add key > Create new key > JSON**, and download it
5. Open [Google Play Console](https://play.google.com/console), go to **Settings > Users and permissions**
6. Click **Invite new user** with the service account email and grant permissions for your app(s)
7. Save the JSON key file and configure:
   ```bash
   kappmaker config set googleServiceAccountPath /path/to/google-service-app-publisher.json
   ```

:::note
Google Play does not allow creating new apps via any public API — you must create the app manually once in [Play Console](https://play.google.com/console/u/0/developers) before `kappmaker gpc` can configure it.
:::

---

## App Store Publisher — iOS Store Uploads

**Used for:** Building and uploading iOS IPAs to App Store Connect via `kappmaker publish --platform ios`.

The `publish` command reuses the same App Store Connect API key credentials used by `create-appstore-app` (`ascKeyId`, `ascIssuerId`, `ascPrivateKeyPath`) and automatically generates the Fastlane-format publisher JSON.

If not already configured for `create-appstore-app`:

1. Open [App Store Connect > Users and Access > Integrations](https://appstoreconnect.apple.com/access/integrations/api)
2. Create an API key with **App Manager** access and download the `.p8` file
3. Note the **Key ID** and **Issuer ID**
4. Configure:
   ```bash
   kappmaker config set ascKeyId <your-key-id>
   kappmaker config set ascIssuerId <your-issuer-id>
   kappmaker config set ascPrivateKeyPath /path/to/AuthKey.p8
   ```
