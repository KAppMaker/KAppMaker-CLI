---
sidebar_position: 5
title: Set up App Army from your AI
---

# Set up App Army from your AI

Connect the KAppMaker MCP server to the AI you already use. Then say **"set up my VPS at 203.0.113.7"**, and it
installs what you bought, checks that it works, and starts your first app. It works from your own computer over your
own SSH key.

## 1. Install the CLI and connect it

```bash
npm i -g kappmaker
```

| Your AI | Connect it |
|---|---|
| Claude Code | `claude mcp add --scope user kappmaker -- kappmaker mcp` |
| Claude desktop app | Settings → Developer → Edit Config. Under `mcpServers` add `"kappmaker": { "command": "/full/path/to/kappmaker", "args": ["mcp"] }`, using the path that `which kappmaker` prints. Then restart the app. |
| OpenAI Codex | `codex mcp add kappmaker -- kappmaker mcp`, then set `tool_timeout_sec = 3600` under `[mcp_servers.kappmaker]` in `~/.codex/config.toml` |
| Gemini CLI | `gemini mcp add kappmaker kappmaker mcp`, then set `"timeout": 3600000` for it in `~/.gemini/settings.json` |

Installs take 10 to 25 minutes. That is why Codex and Gemini need the longer timeout.

## 2. Ask for it

Say one of these:

- "Set up App Army on my VPS at 203.0.113.7. My SSH key is ~/.ssh/id_ed25519."
- "What do I need to set up what I bought?" (give it the install code from **My purchase** on kappmaker.com)

The AI first works out the plan from your purchase:

- **The Claude Code plugin:** no server needed. It installs the plugin into Claude Code on your computer. Accept the
  GitHub invite first.
- **App Army:** it checks your server, then installs everything on it: the security setup, a worker user with limited
  rights, the tools, the kit and an always-on worker.
- **If your purchase includes the mentor pack:** it installs the pack too, with the keyword bank, scored ideas and the
  keyword tool.

Every step that changes something shows you its plan first and runs only after you say yes. Anything that cannot be
undone, such as going back a release or removing a worker, asks you a second time.

## What it needs from you, and how

| What | How you give it |
|---|---|
| Server address and SSH key | You tell the AI the IP and the **path** to your key. The key file itself is never read, copied or stored. |
| Install code or licence key | In a private form your AI app shows you, or as a file path. It goes straight to the installer and is never shown in the chat. |
| Claude sign-in on the server | The AI gives you a link. You sign in in your own browser. |
| Telegram bot token | You make a bot with @BotFather and type the token into the private form. If your AI app cannot show forms, you get one command to run in your own terminal instead. |

You are never asked for a password, and no tool takes one.

## What it can do afterwards

| Ask | Tool |
|---|---|
| "Is everything healthy?" | `army_doctor` |
| "What is it doing?" | `army_status`, `army_logs` |
| "Update App Army" / "go back to the last version" | `army_update_check`, `army_update`, `army_rollback` |
| "Restart the worker" / "add a second bot" / "remove a worker" | `army_restart_worker`, `army_add_worker`, `army_remove_worker` |
| "Build me a habit tracker for runners" | `army_new_app` |

## Privacy

It connects only to the server you named. The SSH connection is yours. The only calls to kappmaker.com are the ones
the installer makes anyway: fetching the installer, reading what you bought (read-only), activating this install, and downloading the kit.
Nothing about your machine is sent.
