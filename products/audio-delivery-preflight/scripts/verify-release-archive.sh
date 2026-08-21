#!/bin/zsh
set -euo pipefail

(( $# == 1 )) || { print -u2 "usage: verify-release-archive.sh <archive.zip>"; exit 64; }
archive=${1:A}
checksum="$archive.sha256"
version=0.1.0
release_name="Audio Delivery Preflight $version"

[[ -f "$archive" ]] || { print -u2 "archive not found: $archive"; exit 66; }
[[ -f "$checksum" ]] || { print -u2 "checksum not found: $checksum"; exit 66; }

expected_name=${archive:t}
read -r expected_hash recorded_name < "$checksum"
[[ "$recorded_name" == "$expected_name" ]] || { print -u2 "checksum filename mismatch"; exit 65; }
print -r -- "$expected_hash" | grep -Eq '^[0-9a-f]{64}$' || { print -u2 "invalid checksum format"; exit 65; }
actual_hash=$(shasum -a 256 "$archive" | awk '{print $1}')
[[ "$actual_hash" == "$expected_hash" ]] || { print -u2 "archive checksum mismatch"; exit 65; }

entries=$(zipinfo -1 "$archive")
while IFS= read -r entry; do
  [[ -n "$entry" ]] || continue
  [[ "$entry" != /* && "$entry" != *"../"* && "$entry" != ".." ]] || { print -u2 "unsafe archive path: $entry"; exit 65; }
done <<< "$entries"

extract_dir=$(mktemp -d "${TMPDIR:-/tmp}/audio-preflight-release-verify.XXXXXX")
cleanup() {
  rm -rf "$extract_dir"
}
trap cleanup EXIT
ditto -x -k "$archive" "$extract_dir"

release_root="$extract_dir/$release_name"
app="$release_root/Audio Delivery Preflight.app"
plist="$app/Contents/Info.plist"

[[ -x "$app/Contents/MacOS/AudioDeliveryPreflightApp" ]] || { print -u2 "missing app executable"; exit 65; }
[[ -x "$release_root/audio-preflight" ]] || { print -u2 "missing CLI executable"; exit 65; }
for required in "$plist" "$release_root/README.md" "$release_root/PRIVACY.md" "$release_root/LIMITATIONS.md" "$release_root/UNSIGNED.txt"; do
  [[ -f "$required" ]] || { print -u2 "missing release file: ${required:t}"; exit 65; }
done
find "$release_root" -type l -print -quit | grep -q . && { print -u2 "release contains symbolic links"; exit 65; }

plutil -lint "$plist" >/dev/null
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$plist")" == "com.gabrielgarciaalonso.AudioDeliveryPreflight" ]] || { print -u2 "bundle identifier mismatch"; exit 65; }
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$plist")" == "$version" ]] || { print -u2 "bundle version mismatch"; exit 65; }
[[ "$(/usr/libexec/PlistBuddy -c 'Print :LSMinimumSystemVersion' "$plist")" == "14.0" ]] || { print -u2 "minimum macOS version mismatch"; exit 65; }
codesign --verify --deep --strict "$app"
codesign --verify --strict "$release_root/audio-preflight"
app_signature=$(codesign -d --verbose=4 "$app" 2>&1)
cli_signature=$(codesign -d --verbose=4 "$release_root/audio-preflight" 2>&1)
[[ "$app_signature" == *"Signature=adhoc"* ]] || { print -u2 "app is not ad-hoc signed"; exit 65; }
[[ "$cli_signature" == *"Signature=adhoc"* ]] || { print -u2 "CLI is not ad-hoc signed"; exit 65; }

print -r -- "Verified unsigned release archive: $archive"
print -r -- "SHA-256: $actual_hash"
