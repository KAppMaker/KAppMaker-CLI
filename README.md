# KAppMaker CLI

CLI tool for automating KAppMaker mobile app setup — cloning templates, configuring Firebase, running Gradle/Fastlane builds, and setting up git remotes.

## Prerequisites

- **Node.js** >= 20
- **Git**
- **Firebase CLI** — `npm install -g firebase-tools`
- **CocoaPods** — `sudo gem install cocoapods`
- **Fastlane** — via Bundler in the template repo
- **Android SDK** — installed at `~/Library/Android/sdk` (configurable)

## Setup

```bash
npm install
```

## Usage

### Development

```bash
npx tsx src/index.ts create <AppName>
```

### Production

```bash
npm run build
node dist/index.js create <AppName>
```

### Global install (after build)

```bash
npm link
kappmaker create <AppName>
```

## Commands

### `create <app-name>`

Bootstraps a new KAppMaker app from the template repository.

```bash
kappmaker create Remimi
```

**What it does:**

1. Clones the template repo into `<AppName>-All`
2. Logs into Firebase (opens browser)
3. Creates a Firebase project (`<appname>-app`)
4. Creates Android + iOS Firebase apps and downloads config files
5. Runs Gradle refactor to set package name (`com.measify.<appname>`) and app name
6. Creates `local.properties`, installs CocoaPods, runs Gradle build
7. Runs Fastlane `first_time_build` for Android
8. Renames origin to upstream (template repo becomes upstream remote)

The project is created in the **current working directory** as `<AppName>-All/`.

**Options:**

| Flag | Description | Default |
|------|-------------|---------|
| `--template-repo <url>` | Template repository URL | KAppMaker template |
| `--organization <org>` | Organization for Fastlane signing | App name (configurable) |

### `config`

Manage CLI configuration stored at `~/.config/kappmaker/config.json`.

```bash
kappmaker config init              # Interactive setup
kappmaker config list              # Show all values
kappmaker config set <key> <value> # Set a value
kappmaker config get <key>         # Get a value
kappmaker config path              # Show config file path
```

**Config keys:**

| Key | Description | Default |
|-----|-------------|---------|
| `androidSdkPath` | Android SDK location | `~/Library/Android/sdk` |
| `organization` | Organization for Fastlane signing | Empty (uses app name) |
| `falApiKey` | fal.ai API key (for screenshot translation) | Empty |
| `openaiApiKey` | OpenAI API key (for ASO metadata) | Empty |

## Project Structure

```
src/
  index.ts                  # Entry point
  cli.ts                    # Command registration (Commander.js)
  commands/
    create.ts               # Create command orchestrator
    config.ts               # Config management command
  services/
    firebase.service.ts     # Firebase CLI wrapper
    git.service.ts          # Git operations
    gradle.service.ts       # Gradle build operations
    ios.service.ts          # CocoaPods setup
    fastlane.service.ts     # Fastlane build operations
  utils/
    logger.ts               # Chalk-based logging
    exec.ts                 # Command execution wrapper (execa + ora)
    validator.ts            # Dependency and input validation
    config.ts               # User config (~/.config/kappmaker/config.json)
    prompt.ts               # Interactive prompts (confirm, input)
  types/
    index.ts                # TypeScript interfaces
```
