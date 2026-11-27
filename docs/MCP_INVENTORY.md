# MCP servers and external CLIs the agents use to build apps

Snapshot 2026-11-27. Sources: this Mac's `~/.claude.json` / `~/.claude/settings.json` (server **names and
transport only**, no values read), and the box1 mirror taken by the W8 audit (`claude/settings.json`,
`installed_plugins.json`, `projects/.factory/docs/APP_ARMY_OVERVIEW.md` §5). A live read of box1's
`~/.claude.json` was not possible from this session (SSH not permitted); the box1 overview lists its MCP
servers by name, which is what this table uses.

"Kit today" = what `app-army` main (41a10b6) installs or configures. "Buyer supplies" = what only the buyer can
provide. Nothing in this list phones home on behalf of KAppMaker: each server talks only to the service the buyer
configured.

## MCP servers

| Server | Where seen | Transport | Used for in the app-building flow | Kit today | Buyer supplies |
|---|---|---|---|---|---|
| **kappmaker** (new, this branch) | — | stdio, `kappmaker mcp` | Every CLI capability as typed tools: clone/create, refactor, ASC/Play setup, monetization, logo/icons/screenshots, version, publish, ios-ci, doctor | Not yet (W12 adds it to `kappmaker-army init`) | Nothing extra: reuses `~/.config/kappmaker/*` |
| **stitch** (Google Stitch) | box1 (user scope) | HTTP `stitch.googleapis.com/mcp`, header `X-Goog-Api-Key` | Stitch-first UI prototype (one mobile screen, then edits), plus `stitch-fetch` / `stitch-rpc` | Yes: `kappmaker-army mcp stitch` writes the entry with a `headersHelper` that reads `$STITCH_KEY_FILE`; doctor reports it | Stitch API key (free Google account) |
| **telegram** (plugin `telegram@claude-plugins-official`) | box1, Mac | plugin MCP (bun) | Talk to always-on workers from a phone; reply/react/attach builds and screenshots | Yes: `kappmaker-army worker add` installs it; doctor checks | BotFather bot token, their Telegram account |
| **claude-mem** (plugin `claude-mem@thedotmack`) | box1 | plugin MCP (`mcp-search`) + hooks | Cross-session recall for long-running workers | Yes on server installs (`--claude-mem yes`), `army-claude-mem-install` | Nothing |
| **astro** (Astro ASO) | Mac (user + several projects) | HTTP, local `127.0.0.1:8089/mcp` (served by the Astro Mac app) | ASO keyword research: `search_app_store`, `extract_competitors_keywords`, `get_keyword_suggestions` (skill `kappmaker-aso`) | No. Skill falls back to a manual brainstorm. Keyword bank imports Astro CSV exports | Astro app licence; **macOS only** (local server), so not on a Linux VPS |
| **revenuecat** | Mac (user scope) | HTTP `mcp.revenuecat.ai/mcp`, Bearer v2 secret key or OAuth | Ad-hoc inspection/fixes of offerings, products, entitlements (skill `kappmaker-revenuecat`); the repeatable setup stays `kappmaker revenuecat setup` | No | RevenueCat account + project-scoped `sk_…` key (only if they pick RevenueCat over Adapty) |
| **playwright** (`@playwright/mcp`) | Mac (user scope) | stdio `npx @playwright/mcp` | Landing-page / web-preview checks, screenshots of the Wasm/web build | No (INSTALL.md optional row lists `playwright-cli`) | Nothing (local browser) |
| **caveman-shrink** | box1 + Mac (project scope) | stdio | Token compression for the owner's sessions | No | — owner tooling, not needed for apps |
| **clipugc** | Mac (user), box1 plugin | stdio `npx` / plugin | Owner's UGC marketing videos | No | — not part of app building |
| **adloop** | Mac (user + project) | stdio `adloop` | Owner's Google Ads/GA4 work | No | — not part of app building |

Account connectors visible on box1 sessions (Claude Docs, Gmail, Calendar, Drive) are claude.ai-account
features, not App Army dependencies.

## External CLIs the agents shell out to

| CLI | Used for | Kit today | Buyer supplies |
|---|---|---|---|
| `kappmaker` (npm, this repo) | Whole store/asset/build pipeline | Yes: install.sh `npm i -g kappmaker` | API keys in `~/.config/kappmaker` (fal.ai, imgbb, optional OpenAI) |
| `kappmaker` Claude plugin (27 skills) | Routing for ASO, screenshots, ASC/GPC, publish, ios-ci | **No** (W8 finding C-27/D-26) | — |
| `firebase` | Firebase project/apps/configs | Yes (setup-vps) | Google account login |
| `asc` (App Store Connect CLI ≥ 5.9) | ASC app record, products, pricing, metadata | Yes | ASC API key (.p8, key id, issuer id), Apple ID |
| `adapty` (≥ 0.33) | Adapty products/paywalls | Yes | Adapty account (`adapty auth login`) |
| `gh` | Repos, ios-ci secrets/workflow runs | Yes | GitHub login, PAT for certs repo |
| `fastlane` + Ruby/bundler | Builds, uploads | Yes | Play service-account JSON |
| JDK 17, Android SDK, Gradle | Android builds | Yes (`gradle-slot` wrapper) | — |
| Xcode | Local iOS builds (or `ios-ci` on a macOS runner) | n/a on Linux | A Mac, or GitHub Actions minutes |
| `ffmpeg` | Mascot animation loops | Yes | — |
| `stitch-fetch` / `stitch-rpc` (kit) | Pull Stitch screens | Yes | Stitch key |
| `playwright-cli` | Browser checks | Docs only | — |

## What W12 changes

1. `kappmaker mcp` exposes the CLI as an agent-neutral MCP server (Claude Code, Codex, Gemini CLI).
2. `kappmaker-army init` registers it for Claude Code (no nested `claude`; direct `~/.claude.json` write like
   `mcp stitch`), and offers the optional servers above (Stitch, RevenueCat, Playwright, Astro on macOS) with
   plain prompts. Keys are typed by the buyer and stored only in their own files (mode 600), read at connect
   time by a headers helper, never inline in agent config.
3. `kappmaker-army doctor` reports each one: connected / not set up / key stored inline.
