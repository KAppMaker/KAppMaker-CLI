---
sidebar_position: 4
title: MCP Server (Claude Code, Codex, Gemini CLI)
---

# MCP Server

`kappmaker mcp` runs the CLI as an [MCP](https://modelcontextprotocol.io) server over stdio. Any agent
that speaks MCP gets every KAppMaker capability as a typed tool: Claude Code, OpenAI Codex, Gemini CLI, and others.

You need kappmaker 2.1.0 or newer: `npm i -g kappmaker`.

## Connect your agent

### Claude Code

```bash
claude mcp add --scope user kappmaker -- kappmaker mcp
```

Check it with `claude mcp list`, or with `/mcp` inside a session.

### OpenAI Codex

```bash
codex mcp add kappmaker -- kappmaker mcp
```

Or add it to `~/.codex/config.toml` yourself. Codex stops waiting for a tool after 60 seconds by default, and builds
take longer than that, so raise the limit:

```toml
[mcp_servers.kappmaker]
command = "kappmaker"
args = ["mcp"]
tool_timeout_sec = 3600
```

### Gemini CLI

```bash
gemini mcp add kappmaker kappmaker mcp
```

Or add it to `~/.gemini/settings.json`. The timeout is in milliseconds, and the default is 10 minutes:

```json
{
  "mcpServers": {
    "kappmaker": { "command": "kappmaker", "args": ["mcp"], "timeout": 3600000 }
  }
}
```

## Tools

| Area | Tools |
|---|---|
| Health | `doctor`, `config_check`, `create_app_plan` |
| New app | `clone_template`, `firebase_project`, `firebase_apps`, `firebase_auth_anonymous`, `firebase_configs`, `refactor_package`, `git_setup_upstream`, `version_bump` |
| Images | `spec_template`, `generate_logo`, `pick_logo`, `generate_icons`, `generate_screenshots`, `generate_feature_graphic`, `generate_image`, `translate_screenshots` |
| Stores | `appstore_setup`, `appstore_monetization_push`, `appstore_review_screenshot`, `google_play_setup`, `google_play_push`, `google_play_check`, `google_play_list` |
| Monetization | `subscription_add`, `iap_add`, `adapty_setup`, `revenuecat_setup` |
| Build and ship | `fastlane_configure`, `generate_keystore`, `android_release_build`, `publish`, `ios_ci_init`, `ios_ci_build`, `ios_ci_status` |

Every tool takes a `project_dir` argument: the app folder, for example `MyApp-All`. For a new app, start with
`create_app_plan`. It returns the steps in order, the same flow as `kappmaker create`.

## Plan first, then confirm

Some tools take minutes, create things on a store or in the cloud, or rewrite a project. Others spend money on your
own fal.ai or OpenAI account. Calling one of these tools runs nothing the first time: it returns a **plan** with the
exact `kappmaker …` command and what it will cost or create. The agent shows you the plan, and the command runs only
when the agent calls the tool again with `confirm: true`.

Quick local tools run straight away: `doctor`, `config_check`, `pick_logo`, `generate_icons`, `version_bump`,
`generate_keystore`, `firebase_configs`.

`publish` defaults to the Play `internal` track and does not submit for review unless the agent asks for it.

## Keys and accounts

No tool takes an API key, token or password. The tools use what you already saved with `kappmaker config …` (or set
up once in a terminal). Tool output never shows any of these values: every saved key, and anything shaped like a
private key, token or password, is replaced with `[redacted]`. `config_check` tells you which keys are saved, as set
or not set, never the values.

If a step needs something only you can give it, such as a key, a login or an answer, the tool stops and tells you the
exact command to run in a terminal. For example: `kappmaker config set falApiKey …`, `firebase login`, or
`gh auth login`.

## Privacy

The server runs on your machine and sends nothing anywhere itself. Each tool runs the same `kappmaker` command you
would type by hand, and that command talks only to the services you set up: Apple, Google, Firebase, fal.ai, Adapty,
RevenueCat and GitHub.
