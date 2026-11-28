# App Army, MCP server and Claude Code skill

Moved here from the README. Index: [docs/commands](README.md).

## Claude Code Skill

If you use [Claude Code](https://claude.ai/code), you can install the `/kappmaker` skill to run any CLI command through natural language — with automatic prerequisite checks, guided setup, and inline error recovery.

**Install:**

```bash
npx skills add KAppMaker/KAppMaker-CLI --skill kappmaker
```

Or via the Claude Code plugin system:

```
/plugin marketplace add KAppMaker/KAppMaker-CLI
/plugin install kappmaker@KAppMaker-CLI
```

**Use:**

```
/kappmaker create MyApp
/kappmaker generate screenshots for my fitness app
/kappmaker set up App Store Connect
```

Claude will check your config, verify API keys are set, and walk you through any missing prerequisites before running the command.

**Context-aware**: when a command needs inputs you didn't pass (app description, app name, brand color, tagline, keywords, etc.), the skill reads your project's `AiGuidelines/` folder first (`app-idea.md`, `prd.md`, `keywords.md`, `brand.md`), then `README.md`, then existing ASO metadata, and fills in what it finds — you're only prompted for things that aren't already written down somewhere in the project.

## MCP server (Claude Code, Claude desktop, Codex, Gemini CLI)

`kappmaker mcp` gives your AI every KAppMaker step as a tool (54 tools: health checks, a new app, Firebase, logo,
icons, screenshots, App Store Connect, Google Play, subscriptions, builds, publishing, and App Army on your own server
over your own SSH key). The one-line connect commands are in the
[README](../../README.md#three-ways-in); `kappmaker mcp connect <app>` sets
the long tool timeout for you where the app has one.

For App Army, `army_setup` does the whole server setup: each call does the next step and says what it needs from you,
until it answers READY. Long or paid tools return a plan first and run only after you say yes. No tool takes a key,
token or password: those go into a private form or stay in your saved `kappmaker config`, and output is redacted.
Guides: [App Army from your AI](https://cli.kappmaker.com/guides/app-army-from-your-ai) ·
[MCP server](https://cli.kappmaker.com/guides/mcp-server).

## `kappmaker army`

Bridge to the App Army kit (`kappmaker-army`), which runs the agents on your own machine.

```bash
kappmaker army install                 # laptop (macOS / Linux)
kappmaker army install --server        # a Linux server, as root (adds a worker user, hardening, services)
kappmaker army install --dry-run       # show what the installer would do, change nothing
kappmaker army doctor                  # = kappmaker-army doctor
kappmaker army update                  # = kappmaker-army update
kappmaker army worker add app2         # any other kappmaker-army command, args passed through
```

- **With the kit installed**, every `kappmaker army <cmd> [args]` runs `kappmaker-army <cmd> [args]` (found on `PATH`, or in `~/.army/kit/cli`) and exits with its exit code. Flags, `--help` included, go to the kit.
- **`install`** downloads `https://kappmaker.com/install.sh` and `install.sh.sha256` to a private temp directory, refuses to run anything if the checksum is missing or does not match, then runs the verified script with your arguments. Any `install.sh` option works (`--sudo limited|full`, `--worker NAME`, `--version vX.Y.Z`, `--update`, …). It is the same as `curl -fsSL https://kappmaker.com/install.sh | bash`, plus the checksum check, and is safe to re-run.
- **Licence key**: the installer asks for it with hidden input. `--key K` or `KAPPMAKER_LICENSE_KEY` also work; the key reaches `install.sh` only through its environment, never its command line or the output. (`--key` on your own command line still lands in shell history, so the prompt or the env var is better.)
- **Without the kit**, `doctor`, `update` and every other command print the install lines and exit 1.
- `KAPPMAKER_API` points the download at another origin (https only, except `localhost`).
