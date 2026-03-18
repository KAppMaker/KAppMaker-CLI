# CLAUDE.md

## Project Overview

KAppMaker CLI — a TypeScript/Node.js CLI tool that automates mobile app bootstrapping for the KAppMaker platform. It wraps Firebase CLI, Gradle, Fastlane, CocoaPods, and Git into a single workflow.

## Tech Stack

- **TypeScript** with ESM (`"type": "module"` in package.json)
- **Commander.js** for CLI structure
- **execa** for subprocess execution
- **chalk** for colored output
- **ora** for spinners
- **fs-extra** for file operations

## Key Conventions

- All imports use `.js` extensions (required by NodeNext module resolution)
- Each CLI command lives in its own file under `src/commands/`
- Each external tool (firebase, git, gradle, etc.) has its own service under `src/services/`
- No file should exceed ~150 lines
- Use `async/await` everywhere
- Use `run()` from `src/utils/exec.ts` for commands with spinner output
- Use `runStreaming()` for interactive commands (e.g., `firebase login`)
- Exit on first failure — no retry/rollback logic

## Commands

```bash
npm run dev          # Run with tsx (no build needed)
npm run build        # Compile TypeScript to dist/
npx tsx src/index.ts create <AppName>  # Run create command in dev
```

## Project Structure

```
src/
  index.ts              # Entry point (shebang)
  cli.ts                # Commander.js program setup
  commands/create.ts    # Create command (8-step orchestrator)
  commands/config.ts    # Config management (list, set, get, init)
  services/             # One service per external tool
  utils/logger.ts       # chalk-based step/success/error logging
  utils/exec.ts         # execa wrapper with spinner and streaming modes
  utils/validator.ts    # CLI dependency checks + app name validation
  utils/config.ts       # User config loader/saver (~/.config/kappmaker/config.json)
  utils/prompt.ts       # Interactive prompts (confirm, input)
  types/index.ts        # Shared interfaces (KAppMakerConfig, DerivedConfig, etc.)
```

## Adding a New Command

1. Create `src/commands/<name>.ts` with an exported async function
2. Register the command in `src/cli.ts` using Commander.js
3. Create any needed services in `src/services/`

## Adding a New Service

1. Create `src/services/<tool>.service.ts`
2. Import `run` or `runStreaming` from `src/utils/exec.js`
3. Export individual functions (not a class)

## Configuration

User config file: `~/.config/kappmaker/config.json` (managed via `src/utils/config.ts`)

| Key | Default | Used by |
|-----|---------|---------|
| `androidSdkPath` | `~/Library/Android/sdk` | `gradle.service.ts` → `local.properties` |
| `organization` | `""` (empty = app name) | `fastlane.service.ts` → keystore signing |
| `falApiKey` | `""` | Future: screenshot translation |
| `openaiApiKey` | `""` | Future: ASO metadata generation |

CLI flags (e.g., `--organization`) override config file values.

## Defaults

- Template repo: `git@github.com:KAppMaker/KAppMaker-MobileAppAndWeb.git`
- Package pattern: `com.measify.<appname>`
- After cloning, origin is renamed to upstream (user adds their own origin later)
