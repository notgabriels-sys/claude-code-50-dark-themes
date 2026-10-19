#!/usr/bin/env bash
# Build a themes-only zip for a release tag.
#
#   scripts/build-release-zip.sh SOURCE_DIR TAG OUT_DIR
#
# SOURCE_DIR is a checkout of TAG. Two tag shapes are accepted:
#
#   themes-plugin-vX.Y.Z       every plugin directory under SOURCE_DIR/plugins
#                              that has a themes/ folder, as the first releases
#                              shipped -> claude-code-dark-themes-vX.Y.Z.zip
#   dark-themes-vol-N-vX.Y.Z   that expansion's plugin directory only, and X.Y.Z
#                              must equal the version in its plugin manifest
#                              -> claude-code-dark-themes-vol-N-vX.Y.Z.zip
#
# Each packed plugin is copied whole, exactly as released (themes/, LICENSE,
# README.md, manifest, any previews), so the zip holds the files published at
# that tag and nothing rebuilt or renamed. A short INSTALL.txt is added for
# readers who chose the zip over the plugin command.
set -euo pipefail
shopt -s nullglob

src="${1:?usage: build-release-zip.sh SOURCE_DIR TAG OUT_DIR}"
tag="${2:?usage: build-release-zip.sh SOURCE_DIR TAG OUT_DIR}"
out="${3:?usage: build-release-zip.sh SOURCE_DIR TAG OUT_DIR}"

semver='(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)'
every_pack_tag='^themes-plugin-v'"$semver"'$'
one_expansion_tag='^(dark-themes-vol-([1-9][0-9]*))-v'"$semver"'$'
if [[ "$tag" =~ $every_pack_tag ]]; then
  only=""
  version="${tag#themes-plugin-v}"
  root="claude-code-dark-themes-v$version"
  title="Dark themes for Claude Code"
elif [[ "$tag" =~ $one_expansion_tag ]]; then
  only="${BASH_REMATCH[1]}"
  version="${tag#"$only"-v}"
  root="claude-code-$only-v$version"
  title="Dark Themes Vol. ${BASH_REMATCH[2]} for Claude Code"
else
  echo "Unexpected tag '$tag'; expected themes-plugin-vMAJOR.MINOR.PATCH (every pack) or dark-themes-vol-N-vMAJOR.MINOR.PATCH (one expansion)." >&2
  exit 1
fi
if [[ ! -d "$src/plugins" ]]; then
  echo "No plugins/ directory under '$src'." >&2
  exit 1
fi
if [[ -n "$(find "$src/plugins" -type l -print -quit)" ]]; then
  echo "Refusing to pack symbolic links under '$src/plugins'." >&2
  exit 1
fi

# zip runs from the staging directory below, so OUT_DIR must be absolute first.
mkdir -p "$out"
out="$(cd "$out" && pwd)"

stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
mkdir -p "$stage/$root"

if [[ -n "$only" ]]; then
  if [[ ! -d "$src/plugins/$only/themes" ]]; then
    echo "Tag '$tag' names plugins/$only, but '$src/plugins/$only/themes' does not exist at this tag." >&2
    exit 1
  fi
  manifest="$src/plugins/$only/.claude-plugin/plugin.json"
  if [[ ! -f "$manifest" ]]; then
    echo "Tag '$tag' names plugins/$only, but it has no .claude-plugin/plugin.json at this tag." >&2
    exit 1
  fi
  manifest_version="$(node -e 'process.stdout.write(String(JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")).version ?? ""))' "$manifest")"
  if [[ "$manifest_version" != "$version" ]]; then
    echo "Tag '$tag' says version $version, but plugins/$only/.claude-plugin/plugin.json says '$manifest_version'. Tag the commit whose manifest carries the version in the tag." >&2
    exit 1
  fi
  candidates=("$src/plugins/$only/")
else
  candidates=("$src"/plugins/*/)
fi

count=0
plugins=()
for plugin in "${candidates[@]}"; do
  name="$(basename "$plugin")"
  [[ -d "$plugin/themes" ]] || continue
  cp -R "$plugin" "$stage/$root/$name"
  packed=0
  for file in "$stage/$root/$name"/themes/*.json; do
    node -e 'JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"))' "$file"
    packed=$((packed + 1))
  done
  if (( packed == 0 )); then
    echo "No theme files in '$plugin/themes'." >&2
    exit 1
  fi
  count=$((count + packed))
  plugins+=("$name")
done
if (( count == 0 )); then
  echo "No theme files found under '$src/plugins'." >&2
  exit 1
fi

{
  echo "$title, release $tag"
  echo "$count theme files, one JSON each, MIT licensed. These are exactly the files published at this tag."
  echo
  echo "Recommended install (Claude Code v2.1.118 or later):"
  echo "  claude plugin marketplace add notgabriels-sys/claude-code-50-dark-themes"
  for name in "${plugins[@]}"; do
    echo "  claude plugin install $name@notgabriels-themes"
  done
  echo
  echo "Manual install (run from this folder, $root):"
  echo "  mkdir -p ~/.claude/themes"
  for name in "${plugins[@]}"; do
    echo "  cp $name/themes/*.json ~/.claude/themes/"
  done
  echo "Then run /theme inside Claude Code and pick a theme. If ~/.claude/themes did not"
  echo "exist before, restart Claude Code once so it finds the folder."
  echo
  echo "Gallery: https://gabs-utilities.com/"
  echo "Source:  https://github.com/notgabriels-sys/claude-code-50-dark-themes"
} > "$stage/$root/INSTALL.txt"

zipfile="$out/$root.zip"
rm -f "$zipfile"
(cd "$stage" && zip -q -r -X "$zipfile" "$root")

echo "$count theme files from $tag packed into $zipfile"
sha256sum "$zipfile"
