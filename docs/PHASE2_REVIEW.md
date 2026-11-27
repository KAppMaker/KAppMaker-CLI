# Phase 2 review: CLI and MCP against the golden path (2026-11-27)

Scope: every `kappmaker` command and every `kappmaker mcp` tool, checked against the kit at app-army main (v1.2.0)
plus the pending branches (W13 design flow, W14 secret checks, W11 first-run seeding), the licence API
(`/api/license/check|activate|redeem-code`, `/download`) and the golden path in KAppMaker-AI `docs/LAUNCH_PROGRESS.md`.

Branch: `claude/phase2-cli-mcp-review-ed5986` (CLI 2.2.0, plugin 2.15.0, W14's publish guard merged).
Kit branch: app-army `claude/phase2-ready-message` (29bcfb6, from main ef719f6).

## 1. Missing for the golden path (fixed here)

| # | What was missing | Fix |
|---|---|---|
| M1 | No one-shot tool. The AI had to chain 6 tools in the right order and know when to wait. | `army_setup {host, ssh_key_path?}`: each call looks at the server and does the next step (plan → install → Claude sign-in link → bot token form → first message → "is that you?") and stops at `READY`. Lines starting `WAITING FOR YOU` say what the human must do; `INSTALLING` reports the current installer step and minutes. |
| M2 | The install ran inside ONE tool call for 10 to 25 minutes. Codex (60 s) and Gemini (10 min) time out, and the SSH hardening step restarting sshd can cut the session. | `army_setup` starts the official installer DETACHED on the server (`/var/lib/kappmaker-setup`, root-only; `nohup setsid`, rc + log kept), returns at once, and reports progress on the next call. The licence key, when used instead of a code, sits in a 600 file there for the seconds before the installer reads and deletes it. |
| M3 | Pairing needed a terminal: `army_add_worker` ended with "run `ssh -t … kappmaker-army start`". | `army_pair_telegram` (also used by `army_setup`): notices the first message on the server and asks the user "is that you?" in a private form the model cannot fill. Without forms it asks the user in chat and approves only the sender id they confirmed (`approve_sender`). Never auto-approved. |
| M4 | The bot never wrote first. "Your App Army is ready. Tell me your app idea." did not exist anywhere in the kit. | Kit branch: `tg_pair.py greet` sends it with the bot's own token right after approval, in both `kappmaker-army start` and the new `kappmaker-army worker pair --approve`. The MCP reports it (`READY … It just wrote to you on Telegram: "…"`). |
| M5 | No machine-readable pairing in the kit. | Kit: `kappmaker-army worker pair <name> [--wait S] [--approve CODE \| --deny CODE]`, `key=value` lines. Approving also fills `ARMY_NOTIFY_CHAT_ID`. Test `kit/cli/tests/test_pairing.py` (fake Telegram API), wired into `release.sh` units. |
| M6 | Connecting the MCP was not one line for Claude desktop, Codex or Gemini (hand-edited JSON/TOML, a global install first, timeouts to set by hand). | `kappmaker mcp connect claude-code\|claude-desktop\|codex\|gemini`, run through `npx -y kappmaker@latest`: writes only that app's kappmaker entry (rest kept, `.bak` copy), sets the timeout, and for the desktop app uses absolute paths plus a PATH so a GUI app finds node. No global install needed. |
| M7 | AI apps without private forms dead-ended on the bot token (terminal only). | `army_add_worker` / `army_setup` accept `bot_file` (a text file the user saved; only the path goes through chat). |
| M8 | The user had to know their SSH key path. | `army_setup` defaults to `~/.ssh/id_ed25519`, then `id_ecdsa`, `id_rsa`. |
| M9 | `--sudo full` turns root SSH off after the install, so the next call as root failed. | `army_setup` retries as the worker user `army` (the installer gives it root's key). |

## 2. Stale or wrong (fixed here)

| # | Where | Was | Now |
|---|---|---|---|
| S1 | `army_new_app` | Claimed "plan, a few questions, then it builds". It only saves the idea (`start --yes --no-launch`) and, with a bot, tells the user to send it to the bot. Gated as `long` for no reason. | Honest description, `write` kind. Golden path: the idea goes to the bot, which runs the app order. |
| S2 | `army_update` | "Workers keep running until restarted." | Update restarts running workers fresh (handoff first) since v1.2.0. |
| S3 | kit `worker add` | "DM the bot … then `/telegram:access pair <code>`" | Points at `kappmaker-army start --worker <name>` (auto-detect + confirm). |
| S4 | MCP server instructions | Started with doctor/config_check; App Army second. | App Army first (`army_setup`, then keep calling until READY), app building second. |
| S5 | `army_plan_setup` text | Listed 6 manual tools, no pairing step. | Leads with `army_setup`; lists `army_pair_telegram`. |
| S6 | `kappmaker --help` | Jargon ("canonical spec JSON", "mipmap density buckets", "Cross-platform … management", "AAB"), em dashes. | Plain words, no dashes, and a "Start here" block (connect your AI, install App Army, make an app). |
| S7 | MCP text | Em dashes in error text and the plan; "Idempotent." | Colons; "Safe to run again." |
| S8 | README first screen | A feature list and `npm install -g`; MCP and App Army far down. | Three ways in (ask your AI with one line per app, one command, the plugin), then everything else. |
| S9 | docs-site MCP + App Army pages | `npm i -g` first, "set up my VPS", hand-edited configs, "needs kappmaker 2.1.0". | One-line connect table, the one sentence, the 4 things the user does, 2.2.0. |
| S10 | CLAUDE.md | "52 typed tools". | 54 (`army_setup`, `army_pair_telegram` added). |

## 3. Checked and current

- Kit commands the tools call exist on main and on W13 with the same flags: `doctor`, `status`, `worker list|logs|restart [--resume]|remove --yes [--purge]|add --token-file`, `update --yes|--check|--rollback`, `start --yes --no-launch --worker --app`, `mentor install`.
- Licence: `checkEntitlement` uses the read-only `POST /api/license/check` and degrades on 404/405 ("the installer checks it when it starts"); install.sh stays the real gate (`redeem-code`/`activate`). Tiers `app-army`, `app-army-mentor`, `build-with-me` = kit; anything else (`app-army-mod`) = the plugin. Matches W5's interface notes.
- Repos and names: `KAppMaker/app-army-mod` + `kappmaker-app-army@app-army-mod` (plugin), `KAppMaker/KAppMaker-All` (template, HTTPS). Product names in the tools: "App Army for Claude Code (the plugin)", "App Army", "App Army with Mentor", "App Army with Build With Me". Prices are not in the CLI.
- `npx -y kappmaker@latest mcp` works: the server re-spawns itself through `process.execPath` + `argv[1]`, never through PATH, and stdout carries only the protocol.
- The publish guard (W14) passes: `prepublish-check: 376 files clean`.

## 4. Naming: `kappmaker army …` vs `kappmaker-army …`

Both are right, for different places; keep them, but say which is which:
- `kappmaker-army <cmd>` is what the installer puts on the server and laptop (`~/.army/bin`). All kit docs, kit output
  and MCP tool text use it. Keep.
- `kappmaker army <cmd>` is the npm CLI forwarding to it, plus `kappmaker army install` (download + checksum + run
  install.sh). Use it only where the buyer has the npm CLI and not yet the kit.
- Not fixed here (phase 4 sweep): README "## `kappmaker army`" lists `kappmaker army doctor/update` as the main way;
  on an installed box the kit name is shorter to explain. Also the website's install line is `curl … | bash`, while
  this README used to lead with `kappmaker army install`: now the curl line leads, which matches "Done means" 1.

## 5. Not needed for the golden path (left as is)

- App order, design flow, design stack, copy check (W13) run inside the worker on the server, driven by the bot. The
  MCP does not need tools for them; `army_doctor` already shows the design-stack section once W13 lands.
- `army_install_server`, `army_claude_login`, `army_add_worker` stay as single steps for people who want control.
  `army_install_server` is still synchronous; prefer `army_setup`.

## 6. Open, needs the owner or a later phase

| # | Item | Why it matters |
|---|---|---|
| O1 | Release the kit branch `claude/phase2-ready-message` (with W11/W13/W14) as v1.2.1. Until then `army_setup` on a v1.2.0 server falls back to "message your bot, then run this in your terminal" for pairing, and no ready message is sent. | Golden path step 4. |
| O2 | Deploy `/api/license/check` (W12's KAppMaker-AI branch). Without it the plan cannot name the product (works, just vaguer). | Plan text. |
| O3 | Publish kappmaker 2.2.0 to npm. Every one-line connect uses `npx -y kappmaker@latest`; 2.0.0 has no `mcp`. | All of path 1. |
| O4 | Decide whether the pasted sentence counts as the yes for the install plan (one fewer human step), and whether "My purchase" puts the install code into the sentence (it is single-use and expires in 30 minutes; the form keeps it out of the chat). | Step count (below). |
| O5 | Claude desktop still needs one terminal line (`npx … mcp connect claude-desktop`). A Desktop Extension (`.mcpb`, one click) would remove the terminal entirely. Not built: needs packaging and signing choices. | "No terminal knowledge on the MCP path". |
| O6 | Live check of private forms (MCP elicitation) in Claude desktop, Codex and Gemini. Without forms the flow still works (install code in the sentence, token via `bot_file`, sender confirmed in chat), but the model then sees the install code. | Phase 6. |
| O7 | `army_install_plugin` says "Claude Code 2.1.330 or later": confirm the real minimum. | Plugin path. |
| O9 | Merge order with W15/W19 `claude/fix-cli-bugs-12-660009` (b93b0d9): both branches are at CLI 2.2.0 / plugin 2.15.0, so keep those numbers. Conflicts to expect: `src/cli.ts` (keep this branch's plain-word help texts), `src/mcp/tools/stores.ts` and `src/mcp/errors.ts` (wording). The MCP inputs for W19's new flags (`--allow-empty`, `--verify`, `--regions-version`, splash options) are added on W19's branch, which owns them. The plan/confirm gate still holds under W19's `--config` implies `--yes`, because every MCP tool that passes `--config` is `long` (plan first) or a read-only list. | Merge in phase 5. |
| O8 | On the server the install code is an argument of install.sh for the seconds before it is redeemed (visible in `ps` to other local users of a fresh box). Low; the key never is. | Hardening. |

## 7. Human steps on the MCP path, as counted now

After paying, with a VPS made at a provider with the buyer's SSH key:
1. Paste the one connect line (Claude Code users are already in a terminal; desktop users need one, see O5).
2. Say the sentence ("Set up App Army on my server at 1.2.3.4").
3. Say yes to the plan (and enter the install code in the private form, the same moment).
4. Open the Claude sign-in link and sign in.
5. Make the bot in BotFather and paste its token in the private form.
6. Send the bot one message and confirm "that is me".
7. Reply to the bot's "Your App Army is ready. Tell me your app idea." with the idea.

7 actions, against the target of 5. Steps 1 and 3 are the extra ones: O5 removes the terminal from 1, and O4 can fold 3
into 2. Waiting: the install runs by itself (10 to 25 minutes); nothing else needs the human.
