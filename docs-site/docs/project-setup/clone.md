---
sidebar_position: 2
title: Clone Template
---

# Clone Template

Clone the KAppMaker template (or any custom template) into a new project directory. This is step 1 of [`kappmaker create`](/project-setup/create) exposed as a standalone command — useful when you only want to scaffold a project and apply your own changes (e.g. clone + refactor without touching Firebase, ASC, or stores).

**Command:** `kappmaker clone <app-name>`

```bash
kappmaker clone Remimi
kappmaker clone Remimi --template-repo git@github.com:my-org/my-template.git
kappmaker clone Remimi --target-dir ./projects/Remimi
```

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `--template-repo <url>` | Git URL of the template repository | `templateRepo` from CLI config |
| `--target-dir <path>` | Target directory for the clone | `<AppName>-All` |

## App Name Rules

PascalCase, starts uppercase, alphanumeric only — same rules as [`create`](/project-setup/create).

## What It Does

1. Validates the app name.
2. If no config exists at `~/.config/kappmaker/config.json`, runs `kappmaker config init` first.
3. If the target directory already exists, prompts to delete and start fresh.
4. Runs `git clone <templateRepo> <targetDir>`.

## Minimal Flow

Clone + refactor — without Firebase, ASC, Play Console, or Adapty:

```bash
kappmaker clone MyApp
cd MyApp-All/MobileApp
kappmaker refactor --app-id com.example.myapp --app-name MyApp
```

Optionally rename the template's `origin` to `upstream` so you can add your own origin:

```bash
cd ..
kappmaker git setup-upstream
```

See [`git setup-upstream`](/project-setup/git-setup-upstream) for details.
