#!/bin/zsh
set -euo pipefail

(( $# == 1 )) || { print -u2 "usage: verify-release-archive.sh <archive.zip>"; exit 64; }
archive=${1:A}
checksum="$archive.sha256"
version=0.1.0

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

top_level_entries=("$extract_dir"/*(N))
(( ${#top_level_entries[@]} == 1 )) || { print -u2 "archive must contain exactly one top-level entry"; exit 65; }
release_root=${top_level_entries[1]}
[[ -d "$release_root" ]] || { print -u2 "archive top-level entry must be a directory"; exit 65; }
app="$release_root/Audio Delivery Preflight.app"
plist="$app/Contents/Info.plist"

[[ -x "$app/Contents/MacOS/AudioDeliveryPreflightApp" ]] || { print -u2 "missing app executable"; exit 65; }
[[ -x "$release_root/audio-preflight" ]] || { print -u2 "missing CLI executable"; exit 65; }
for required in \
  "$plist" \
  "$release_root/README.md" \
  "$release_root/PRIVACY.md" \
  "$release_root/LIMITATIONS.md" \
  "$release_root/UNSIGNED.txt" \
  "$release_root/BUILD-EVIDENCE.txt" \
  "$release_root/PACKAGE-INFO.json" \
  "$release_root/SHA256SUMS.txt" \
  "$release_root/Sample Delivery Package/Masters/Main Master.wav" \
  "$release_root/Sample Delivery Package/Artwork/Cover.png" \
  "$release_root/Sample Delivery Package/Credits/credits.md"; do
  [[ -f "$required" ]] || { print -u2 "missing release file: ${required:t}"; exit 65; }
done
find "$release_root" -type l -print -quit | grep -q . && { print -u2 "release contains symbolic links"; exit 65; }

plutil -lint "$plist" >/dev/null
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$plist")" == "com.gabrielgarciaalonso.AudioDeliveryPreflight" ]] || { print -u2 "bundle identifier mismatch"; exit 65; }
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$plist")" == "$version" ]] || { print -u2 "bundle version mismatch"; exit 65; }
[[ "$(/usr/libexec/PlistBuddy -c 'Print :LSMinimumSystemVersion' "$plist")" == "14.0" ]] || { print -u2 "minimum macOS version mismatch"; exit 65; }

app_archs=$(/usr/bin/lipo -archs "$app/Contents/MacOS/AudioDeliveryPreflightApp")
cli_archs=$(/usr/bin/lipo -archs "$release_root/audio-preflight")
[[ "$app_archs" == "$cli_archs" ]] || { print -u2 "app and CLI architectures differ"; exit 65; }
case " $app_archs " in
  *" arm64 "*" x86_64 "*|*" x86_64 "*" arm64 "*)
    architecture_label="Universal"
    architecture_slug="universal"
    ;;
  " arm64 ")
    architecture_label="Apple Silicon"
    architecture_slug="apple-silicon"
    ;;
  " x86_64 ")
    architecture_label="Intel"
    architecture_slug="intel"
    ;;
  *)
    print -u2 "unsupported architecture set: $app_archs"
    exit 65
    ;;
esac
[[ "${archive:t}" == *"-$architecture_slug-unsigned.zip" ]] || { print -u2 "archive name does not disclose architecture"; exit 65; }
[[ "${release_root:t}" == "Audio Delivery Preflight $version (macOS $architecture_label, Unsigned)" ]] || { print -u2 "release directory does not disclose architecture and signing state"; exit 65; }

package_info="$release_root/PACKAGE-INFO.json"
[[ "$(/usr/bin/plutil -extract architectureLabel raw -o - "$package_info")" == "$architecture_label" ]] || { print -u2 "package architecture metadata mismatch"; exit 65; }
[[ "$(/usr/bin/plutil -extract developerIDSigned raw -o - "$package_info")" == "false" ]] || { print -u2 "package incorrectly claims Developer ID signing"; exit 65; }
[[ "$(/usr/bin/plutil -extract adHocSigned raw -o - "$package_info")" == "true" ]] || { print -u2 "package does not disclose ad-hoc signing"; exit 65; }
[[ "$(/usr/bin/plutil -extract notarized raw -o - "$package_info")" == "false" ]] || { print -u2 "package incorrectly claims notarization"; exit 65; }
[[ "$(/usr/bin/plutil -extract commerciallyPublished raw -o - "$package_info")" == "false" ]] || { print -u2 "package incorrectly claims publication"; exit 65; }
source_commit=$(/usr/bin/plutil -extract sourceCommit raw -o - "$package_info")
print -r -- "$source_commit" | /usr/bin/grep -Eq '^[0-9a-f]{40}$' || { print -u2 "invalid source commit metadata"; exit 65; }

/usr/bin/codesign --verify --deep --strict --verbose=2 "$app" >/dev/null 2>&1 || { print -u2 "ad-hoc app signature failed verification"; exit 65; }
/usr/bin/codesign --verify --strict --verbose=2 "$release_root/audio-preflight" >/dev/null 2>&1 || { print -u2 "ad-hoc CLI signature failed verification"; exit 65; }
app_signature=$(/usr/bin/codesign -dvv "$app" 2>&1)
cli_signature=$(/usr/bin/codesign -dvv "$release_root/audio-preflight" 2>&1)
[[ "$app_signature" == *"Signature=adhoc"* ]] || { print -u2 "app signature is not ad hoc"; exit 65; }
[[ "$cli_signature" == *"Signature=adhoc"* ]] || { print -u2 "CLI signature is not ad hoc"; exit 65; }

(
  cd "$release_root"
  /usr/bin/shasum -a 256 -c SHA256SUMS.txt
) >/dev/null || { print -u2 "internal SHA-256 manifest failed"; exit 65; }

[[ "$("$release_root/audio-preflight" version)" == "Audio Delivery Preflight $version" ]] || { print -u2 "packaged CLI version check failed"; exit 65; }

print -r -- "Verified unsigned release archive: $archive"
print -r -- "SHA-256: $actual_hash"
