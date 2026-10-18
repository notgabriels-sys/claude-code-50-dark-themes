#!/usr/bin/env bash
# Build a themes-only zip for a release tag.
#
#   scripts/build-release-zip.sh SOURCE_DIR TAG OUT_DIR
#
# SOURCE_DIR is a checkout of TAG. Every plugin under SOURCE_DIR/plugins is
# copied exactly as released (themes/, LICENSE, README.md, manifest), so the zip
# holds the files published at that tag and nothing rebuilt or renamed. A short
# INSTALL.txt is added for readers who chose the zip over the plugin command.
set -euo pipefail

src="${1:?usage: build-release-zip.sh SOURCE_DIR TAG OUT_DIR}"
tag="${2:?usage: build-release-zip.sh SOURCE_DIR TAG OUT_DIR}"
out="${3:?usage: build-release-zip.sh SOURCE_DIR TAG OUT_DIR}"

if [[ ! "$tag" =~ ^themes-plugin-v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Unexpected tag '$tag'; expected themes-plugin-vMAJOR.MINOR.PATCH." >&2
  exit 1
fi
if [[ ! -d "$src/plugins" ]]; then
  echo "No plugins/ directory under '$src'." >&2
  exit 1
fi

version="${tag#themes-plugin-v}"
root="claude-code-dark-themes-v$version"
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
mkdir -p "$stage/$root"

count=0
plugins=()
for plugin in "$src"/plugins/*/; do
  name="$(basename "$plugin")"
  [[ -d "$plugin/themes" ]] || continue
  cp -R "$plugin" "$stage/$root/$name"
  for file in "$stage/$root/$name"/themes/*.json; do
    node -e 'JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"))' "$file"
    count=$((count + 1))
  done
  plugins+=("$name")
done
if (( count == 0 )); then
  echo "No theme files found under '$src/plugins'." >&2
  exit 1
fi

{
  echo "Dark themes for Claude Code, release $tag"
  echo "$count theme files, one JSON each, MIT licensed. These are exactly the files published at this tag."
  echo
  echo "Recommended install (Claude Code v2.1.118 or later):"
  echo "  claude plugin marketplace add notgabriels-sys/claude-code-50-dark-themes"
  for name in "${plugins[@]}"; do
    echo "  claude plugin install $name@notgabriels-themes"
  done
  echo
  echo "Manual install:"
  echo "  mkdir -p ~/.claude/themes"
  for name in "${plugins[@]}"; do
    echo "  cp $name/themes/*.json ~/.claude/themes/"
  done
  echo "Then run /theme inside Claude Code and pick a theme."
  echo
  echo "Gallery: https://gabs-utilities.com/"
  echo "Source:  https://github.com/notgabriels-sys/claude-code-50-dark-themes"
} > "$stage/$root/INSTALL.txt"

mkdir -p "$out"
zipfile="$out/$root.zip"
rm -f "$zipfile"
(cd "$stage" && zip -q -r -X "$zipfile" "$root")

echo "$count theme files from $tag packed into $zipfile"
sha256sum "$zipfile"
