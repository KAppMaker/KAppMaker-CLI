---
sidebar_position: 3
title: Git Setup Upstream
---

# Git Setup Upstream

Renames the `origin` remote to `upstream` so the template repo is preserved as the upstream remote — the user is then free to add their own `origin` later. This is step 10 of [`kappmaker create`](/project-setup/create) exposed as a standalone command, designed for the "fork from template" workflow.

**Command:** `kappmaker git setup-upstream [path]`

```bash
kappmaker git setup-upstream                    # Run from inside the cloned repo
kappmaker git setup-upstream ./MyApp-All        # Or pass the path explicitly
```

## Arguments

| Argument | Description | Default |
|----------|-------------|---------|
| `[path]` | Path to the repo root | Current directory |

## Behavior

Runs `git remote rename origin upstream` against the given repo root. Exits non-zero if the path isn't a git repository.

## Typical Use

After [`kappmaker clone`](/project-setup/clone) (or a manual `git clone`), in the cloned repo:

```bash
kappmaker git setup-upstream
git remote add origin git@github.com:your-username/your-app.git
git push -u origin main
```

The full [`kappmaker create`](/project-setup/create) command runs this automatically as step 10.
