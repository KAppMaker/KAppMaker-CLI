# KAppMaker CLI

Make Android and iOS apps with AI, and run App Army, your own AI app team, on your own server.

## Three ways in

**1. Ask your AI.** Connect KAppMaker with one line, then say **"Set up App Army on my server at 1.2.3.4"**.

| Your AI | One line |
|---|---|
| Claude Code | `claude mcp add --scope user kappmaker -- npx -y kappmaker@latest mcp` |
| Claude desktop app | `npx -y kappmaker@latest mcp connect claude-desktop` |
| Codex | `npx -y kappmaker@latest mcp connect codex` |
| Gemini CLI | `npx -y kappmaker@latest mcp connect gemini` |

It installs what you bought and stops only for what needs you: a Claude sign-in link, your Telegram bot token (in a
private form), and one message to your new bot. Then your bot writes: "Your App Army is ready. Tell me your app idea."

**2. One command** on your laptop, or on a Linux server as root:

```bash
curl -fsSL https://kappmaker.com/install.sh | bash
curl -fsSL https://kappmaker.com/install.sh | bash -s -- --server
```

**3. Only the Claude Code plugin** (App Army for Claude Code; accept the GitHub invite first), inside Claude Code:

```
/plugin marketplace add KAppMaker/app-army-mod
/plugin install kappmaker-app-army@app-army-mod
```

You need Node.js 22.12 or newer for `npx`. Your install code and licence key are on "My purchase" at
[kappmaker.com](https://kappmaker.com). Full docs: [cli.kappmaker.com](https://cli.kappmaker.com).

---

## What the CLI does

It automates the whole mobile app launch for a Kotlin Multiplatform app, from the first project to store ready
builds: the template, Firebase, a logo and icons, App Store Connect, Google Play, subscriptions, screenshots, signed
builds and uploads. Every command is one an agent can run unattended, and it is the CLI behind
[App Army](https://kappmaker.com). It sends nothing about you or your machine anywhere: no telemetry, no analytics, no
update checks.

## Installation

```bash
npm install -g kappmaker
```

## Configuration

```bash
kappmaker config init
```

## Reference

- [Command reference index](docs/commands/README.md)
- [What the CLI does, all commands, prerequisites and API keys](docs/commands/overview.md)
- [Create, clone, refactor, version and config](docs/commands/create-and-config.md)
- [Firebase, App Store Connect, Google Play, subscriptions and Adapty](docs/commands/stores.md)
- [Logos, images, screenshots, icons and ASO](docs/commands/images-and-aso.md)
- [Build, sign and publish](docs/commands/build-and-publish.md)
- [App Army, MCP server and Claude Code skill](docs/commands/army-and-mcp.md)
- [Development setup, credits and project structure](docs/commands/project-structure.md)
- [CHANGELOG](CHANGELOG.md)
- Docs site: [cli.kappmaker.com](https://cli.kappmaker.com)

## License

[MIT](LICENSE). Third-party notices: [NOTICE.md](NOTICE.md).
