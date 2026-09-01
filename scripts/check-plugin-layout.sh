#!/bin/sh
# Guards the plugin's skill layout.
#
# Claude Code's plugin loader scans <plugin-root>/skills/ and nothing else. A
# commit once moved the skills into .claude/skills/ and deleted the root
# skills/ directory; the plugin kept installing cleanly and every one of its
# skills silently stopped loading for every user — the failure looks like
# "that skill doesn't exist", days after the change.
#
# So: skills/ must be a real directory at the repo root, and .claude/skills
# must be a symlink to it (that is what makes them load for sessions working
# inside this repo).
#
# Run: sh scripts/check-plugin-layout.sh
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
fail=0
say() { printf '%s - %s\n' "$1" "$2"; }

if [ -d "$ROOT/skills" ] && [ ! -L "$ROOT/skills" ]; then
  say ok "skills/ is a real directory at the repo root"
else
  say FAIL "skills/ missing at the repo root — the plugin loader will find no skills"; fail=1
fi

count=$(find "$ROOT/skills" -mindepth 2 -maxdepth 2 -name SKILL.md 2>/dev/null | wc -l | tr -d ' ')
if [ "$count" -gt 0 ]; then
  say ok "skills/ holds $count SKILL.md files"
else
  say FAIL "no SKILL.md files under skills/"; fail=1
fi

if [ -L "$ROOT/.claude/skills" ]; then
  target=$(readlink "$ROOT/.claude/skills")
  case "$target" in
    ../skills|../skills/) say ok ".claude/skills is a symlink to ../skills" ;;
    *) say FAIL ".claude/skills points at '$target', expected ../skills"; fail=1 ;;
  esac
elif [ -d "$ROOT/.claude/skills" ]; then
  say FAIL ".claude/skills is a real directory — this is the regression that hides every plugin skill"; fail=1
else
  say ok ".claude/skills absent (plugin skills still load from skills/)"
fi

# Every skill must be loadable: a SKILL.md needs frontmatter with a name.
for f in "$ROOT"/skills/*/SKILL.md; do
  [ -f "$f" ] || continue
  d=$(basename "$(dirname "$f")")
  if [ "$(head -n1 "$f")" = "---" ] && grep -q "^name: $d\$" "$f"; then
    :
  else
    say FAIL "$d: SKILL.md needs frontmatter opening with --- and 'name: $d'"; fail=1
  fi
done
[ "$fail" = 0 ] && say ok "every skill declares a name matching its directory"

if [ "$fail" = 0 ]; then printf '\nplugin layout: OK\n'; else printf '\nplugin layout: BROKEN\n'; fi
exit "$fail"
