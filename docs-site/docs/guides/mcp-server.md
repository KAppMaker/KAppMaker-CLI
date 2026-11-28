---
sidebar_position: 4
title: MCP Server (Claude Code, Codex, Gemini CLI)
---

# MCP Server

`kappmaker mcp` runs the CLI as an [MCP](https://modelcontextprotocol.io) server over stdio. Any agent
that speaks MCP gets every KAppMaker capability as a typed tool: Claude Code, OpenAI Codex, Gemini CLI, and others.

You need kappmaker 2.2.2 or newer (2.2.1 and 2.2.2 fixed the App Army setup from your AI). Nothing to install first:
the lines below start the newest version with `npx` (Node.js 22.12 or newer).

## Connect your agent

One line for each app. `kappmaker mcp connect` writes that app's own MCP config (one entry named kappmaker, the rest
kept, a `.bak` copy next to it) and sets the long tool timeout where the app has one, because builds take minutes.

| Your AI | One line | Then |
|---|---|---|
| Claude Code | `claude mcp add --scope user kappmaker -- npx -y kappmaker@latest mcp` | `/mcp` in a session shows it |
| Claude desktop app | `npx -y kappmaker@latest mcp connect claude-desktop` | Quit and reopen the app |
| OpenAI Codex | `npx -y kappmaker@latest mcp connect codex` | Writes `[mcp_servers.kappmaker]` with `tool_timeout_sec = 3600` in `~/.codex/config.toml` |
| Gemini CLI | `npx -y kappmaker@latest mcp connect gemini` | Writes `mcpServers.kappmaker` with `"timeout": 3600000` in `~/.gemini/settings.json` |

Installed globally (`npm i -g kappmaker`)? `kappmaker mcp connect <app>` does the same.

## Tools

| Area | Tools |
|---|---|
| Health | `doctor`, `config_check`, `create_app_plan` |
| New app | `clone_template`, `firebase_project`, `firebase_apps`, `firebase_auth_anonymous`, `firebase_configs`, `refactor_package`, `git_setup_upstream`, `version_bump` |
| Images | `spec_template`, `generate_logo`, `pick_logo`, `generate_icons`, `generate_screenshots`, `generate_feature_graphic`, `generate_image`, `translate_screenshots` |
| Stores | `appstore_setup`, `appstore_monetization_push`, `appstore_review_screenshot`, `google_play_setup`, `google_play_push`, `google_play_check`, `google_play_list` |
| Monetization | `subscription_add`, `iap_add`, `adapty_setup`, `revenuecat_setup` |
| Build and ship | `fastlane_configure`, `generate_keystore`, `android_release_build`, `publish`, `ios_ci_init`, `ios_ci_build`, `ios_ci_status` |
| App Army on your server | `army_setup` (all of it, one step per call), `army_plan_setup`, `army_check_server`, `army_install_server`, `army_install_plugin`, `army_claude_login`, `army_add_worker`, `army_pair_telegram`, `army_doctor`, `army_status`, `army_logs`, `army_update_check`, `army_update`, `army_rollback`, `army_restart_worker`, `army_remove_worker`, `army_new_app`. See [Set up App Army from your AI](./app-army-from-your-ai) |

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
