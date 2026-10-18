#!/usr/bin/env bash
# 50 Dark Themes for Claude Code — installer
#
#   ./install.sh                 install all 50
#   ./install.sh acid deep-field install only those
#   ./install.sh --list          show theme names
#   ./install.sh --uninstall     remove every theme in the pack from the themes dir
#   ./install.sh --uninstall ink remove only those
#   ./install.sh --dir PATH      install somewhere else (default ~/.claude/themes)
#
# Existing files with the same name are backed up to <name>.json.bak once.
# --uninstall matches by filename, not contents: a theme you edited yourself,
# or wrote under a pack name, is removed too. Backups are never touched.
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="${HOME}/.claude/themes"
MODE=install
WANTED=()

while [ $# -gt 0 ]; do
  case "$1" in
    --list)      MODE=list; shift ;;
    --uninstall) MODE=uninstall; shift ;;
    --dir)       DEST="${2:?--dir needs a path}"; shift 2 ;;
    # Print the header comment block: everything after the shebang up to the
    # first line that is not a comment. A fixed line range drifts — '2,12p'
    # had already slipped past the block and printed `set -euo pipefail`.
    -h|--help)   awk 'NR==1{next} !/^#/{exit} {sub(/^# ?/,""); print}' "${BASH_SOURCE[0]}"; exit 0 ;;
    -*)          echo "unknown option: $1" >&2; exit 2 ;;
    *)           WANTED+=("${1%.json}"); shift ;;
  esac
done

themes() { find "$SRC" -maxdepth 1 -name '*.json' -not -name 'package*.json' | sort; }
# True when no names were given, or when $1 is one of them.
wanted() {
  [ ${#WANTED[@]} -eq 0 ] && return 0
  local w
  for w in "${WANTED[@]}"; do [ "$w" = "$1" ] && return 0; done
  return 1
}

if [ "$MODE" = list ]; then
  themes() { find "$SRC" -maxdepth 1 -name '*.json' -not -name 'package*.json' | sort; }
  n=0
  while IFS= read -r f; do
    printf '  %s\n' "$(basename "${f%.json}")"; n=$((n+1))
  done < <(themes)
  echo "$n themes"
  exit 0
fi

# Every name given must be a theme in the pack, or nothing changes. A typo used
# to be skipped silently: `./install.sh acid deepfield` installed acid alone
# and reported success.
if [ ${#WANTED[@]} -gt 0 ]; then
  unknown=()
  for w in "${WANTED[@]}"; do
    found=0
    while IFS= read -r f; do [ "$(basename "${f%.json}")" = "$w" ] && found=1; done < <(themes)
    [ $found -eq 1 ] || unknown+=("$w")
  done
  if [ ${#unknown[@]} -gt 0 ]; then
    echo "No theme matched: ${unknown[*]}" >&2
    echo "Run ./install.sh --list to see the names. Nothing was changed." >&2
    exit 1
  fi
fi

if [ "$MODE" = uninstall ]; then
  removed=0
  while IFS= read -r f; do
    t="$(basename "$f")"
    wanted "${t%.json}" || continue
    if [ -f "$DEST/$t" ]; then rm -f "$DEST/$t"; removed=$((removed+1)); fi
  done < <(themes)
  echo "Removed $removed theme(s) from $DEST"
  echo "Backups (*.json.bak) were left alone."
  exit 0
fi

mkdir -p "$DEST"
installed=0; backed=0; skipped=0

while IFS= read -r f; do
  name="$(basename "${f%.json}")"
  wanted "$name" || { skipped=$((skipped+1)); continue; }
  target="$DEST/$name.json"
  if [ -f "$target" ] && ! cmp -s "$f" "$target"; then
    [ -f "$target.bak" ] || { cp "$target" "$target.bak"; backed=$((backed+1)); }
  fi
  cp "$f" "$target"
  installed=$((installed+1))
done < <(themes)

echo "Installed $installed theme(s) into $DEST"
[ $backed -gt 0 ] && echo "Backed up $backed existing file(s) as *.json.bak"
echo
echo "In Claude Code, run  /theme  and pick one."
echo "Requires Claude Code v2.1.118 or later."
