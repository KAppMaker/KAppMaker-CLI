---
sidebar_position: 3
title: Claude Code Skill
---

# Claude Code Skill

If you use [Claude Code](https://claude.ai/code), you can install the `/kappmaker` skill to run any CLI command through natural language — with automatic prerequisite checks, guided setup, and inline error recovery.

## Install

```bash
npx skills add KAppMaker/KAppMaker-CLI --skill kappmaker
```

Or via the Claude Code plugin system:

```
/plugin marketplace add KAppMaker/KAppMaker-CLI
/plugin install kappmaker@KAppMaker-CLI
```

## Usage

```
/kappmaker create MyApp
/kappmaker generate screenshots for my fitness app
/kappmaker set up App Store Connect
```

Claude will check your config, verify API keys are set, and walk you through any missing prerequisites before running the command.
