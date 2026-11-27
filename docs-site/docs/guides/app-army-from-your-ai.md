---
sidebar_position: 5
title: Set up App Army from your AI
---

# Set up App Army from your AI

Connect the KAppMaker MCP server to the AI you already use. Then say **"Set up App Army on my server at 203.0.113.7"**, and it
installs what you bought, checks that it works, and hands you to your own Telegram bot. It works from your own
computer over your own SSH key.

## 1. Connect it (one line)

| Your AI | One line |
|---|---|
| Claude Code | `claude mcp add --scope user kappmaker -- npx -y kappmaker@latest mcp` |
| Claude desktop app | `npx -y kappmaker@latest mcp connect claude-desktop`, then quit and reopen the app |
| OpenAI Codex | `npx -y kappmaker@latest mcp connect codex` |
| Gemini CLI | `npx -y kappmaker@latest mcp connect gemini` |

You need Node.js 22.12 or newer. Nothing else to install.

## 2. Say one sentence

> Set up App Army on my server at 203.0.113.7.

That sentence is your go-ahead. Your AI uses one tool, `army_setup`, and calls it again after each step. It uses
your SSH key at `~/.ssh/id_ed25519` unless you name another one. Then it only stops for what needs you:

1. **One private page** opens in your browser, on your own computer: paste your install code from "My purchase"
   on kappmaker.com, and your Telegram bot token (in Telegram, open @BotFather, send /newbot, and copy the token it
   gives you). Your AI never sees either one.
2. **Claude sign-in**: open the link it gives you and sign in.
3. **One message to your new bot**, like "hi". It connects to you by itself.

Your bot then writes to you: **"Your App Army is ready. Tell me your app idea."** Reply with your idea.

Want to see the plan first? Say "What would setting up App Army on my server do?" and it shows the plan before
anything runs.

The install takes 10 to 25 minutes and runs on the server by itself, so closing the chat does not stop it. Ask "how
far is it?" at any time.

Not sure what you bought, or you bought the Claude Code plugin? Say "What do I need to set up what I bought?" and it
plans it (`army_plan_setup`). For the plugin it installs it into Claude Code on your computer; accept the GitHub invite
first. When your purchase includes the mentor pack, it is installed too.

Other steps that change something show you their plan first. Anything that cannot be undone, such as going back a
release or removing a worker, asks you a second time.

## What it needs from you, and how

| What | How you give it |
|---|---|
| Server address and SSH key | You tell the AI the IP and the **path** to your key. The key file itself is never read, copied or stored. |
| Install code or licence key | On a one-time private page on your own computer, or as a file path. It goes straight to the installer and is never shown in the chat. |
| Claude sign-in on the server | The AI gives you a link. You sign in in your own browser. |
| Telegram bot token | You make a bot with @BotFather and paste the token on the same private page. If your AI app cannot open pages, you save the token in a file and give the path, or run one command in your own terminal. |

You are never asked for a password, and no tool takes one.

## What it can do afterwards

| Ask | Tool |
|---|---|
| "Is everything healthy?" | `army_doctor` |
| "What is it doing?" | `army_status`, `army_logs` |
| "Update App Army" / "go back to the last version" | `army_update_check`, `army_update`, `army_rollback` |
| "Is it set up yet?" / "how far is the install?" | `army_setup` (when nothing is left to do, it only reports) |
| "Restart the worker" / "add a second bot" / "remove a worker" | `army_restart_worker`, `army_add_worker` + `army_pair_telegram`, `army_remove_worker` |
| "Build me a habit tracker for runners" | Tell your bot on Telegram. `army_new_app` saves the idea on the server and says the same. |

## Privacy

It connects only to the server you named. The SSH connection is yours. The only calls to kappmaker.com are the ones
the installer makes anyway: fetching the installer, reading what you bought (read-only), activating this install, and downloading the kit.
Nothing about your machine is sent. `npx` fetches the CLI from npm, as for any npm package.
