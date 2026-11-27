# Command reference

The full reference for every `kappmaker` command, moved out of the README so its first screen stays short.

| File | What is in it |
|---|---|
| [overview.md](overview.md) | What the CLI does, every command in one table, features, prerequisites, API keys and external services |
| [create-and-config.md](create-and-config.md) | `create`, `clone`, `git setup-upstream`, `refactor`, `update-version`, configuration and every config key |
| [stores.md](stores.md) | `firebase`, `create-appstore-app`, review screenshots, `appstore-monetization-push`, `gpc`, `subscription add`, `iap add`, `adapty setup` |
| [images-and-aso.md](images-and-aso.md) | `create-logo`, `generate-image`, image tools, screenshots, the feature graphic, app icons, ASO keyword research and metadata |
| [build-and-publish.md](build-and-publish.md) | `fastlane configure`, `publish`, `generate-keystore`, `android-release-build` |
| [army-and-mcp.md](army-and-mcp.md) | `kappmaker army`, the MCP server (`kappmaker mcp`) and the Claude Code skill |
| [project-structure.md](project-structure.md) | Development setup, credits and the source layout |

The docs site has the same commands as pages: [cli.kappmaker.com](https://cli.kappmaker.com).

## Every section

- [Claude Code Skill](army-and-mcp.md#claude-code-skill)
- [MCP server](army-and-mcp.md#mcp-server-claude-code-claude-desktop-codex-gemini-cli)
- [`kappmaker army`](army-and-mcp.md#kappmaker-army): install or run the App Army kit
- [Configuration](create-and-config.md#configuration)
- [Commands Overview](overview.md#commands-overview)
- [Features](overview.md#features)
- [Prerequisites](overview.md#prerequisites)
- [External Services & API Keys](overview.md#external-services--api-keys)
- Commands
  - [`create <app-name>`](create-and-config.md#create-app-name)
  - [`clone <app-name>`](create-and-config.md#clone-app-name)
  - [`git setup-upstream`](create-and-config.md#git-setup-upstream)
  - [`firebase`](stores.md#firebase): Firebase setup steps (login, project, apps, auth, configs)
  - [`create-logo`](images-and-aso.md#create-logo)
  - [`generate-image`](images-and-aso.md#generate-image)
  - [`create-appstore-app`](stores.md#create-appstore-app)
  - [`appstore-monetization-push`](stores.md#appstore-monetization-push): Push subs + IAPs from config to ASC (standalone)
  - [`gpc`](stores.md#gpc): Google Play Console management
  - [`gpc monetization push`](stores.md#gpc-monetization-push): Push subs + IAPs from config to Play (standalone)
  - [`subscription add`](stores.md#subscription-add): Quick-add a subscription to Play + ASC
  - [`iap add`](stores.md#iap-add): Quick-add a credit-pack IAP to Play + ASC + Adapty
  - [`adapty setup`](stores.md#adapty-setup)
  - [Image Tools](images-and-aso.md#image-tools)
  - [`convert-webp`](images-and-aso.md#convert-webp-source)
  - [`translate-screenshots`](images-and-aso.md#translate-screenshots-source-dir)
  - [`generate-screenshots`](images-and-aso.md#generate-screenshots)
  - [`generate-feature-image`](images-and-aso.md#generate-feature-image)
  - [`generate-ios-icons`](images-and-aso.md#generate-ios-icons)
  - [`generate-android-icons`](images-and-aso.md#generate-android-icons)
  - [ASO Keyword Research (skill-driven)](images-and-aso.md#aso-keyword-research-skill-driven)
  - [ASO Metadata Localization (skill-driven)](images-and-aso.md#aso-metadata-localization-skill-driven)
  - [`fastlane configure`](build-and-publish.md#fastlane-configure)
  - [`publish`](build-and-publish.md#publish)
  - [`generate-keystore`](build-and-publish.md#generate-keystore)
  - [`android-release-build`](build-and-publish.md#android-release-build)
  - [`refactor`](create-and-config.md#refactor)
  - [`update-version`](create-and-config.md#update-version)
- [Config Reference](create-and-config.md#config-reference)
- [Development setup](project-structure.md#installation)
- [Credits & Attribution](project-structure.md#credits--attribution)
- [Project Structure](project-structure.md#project-structure)
- [License](../../README.md#license)
