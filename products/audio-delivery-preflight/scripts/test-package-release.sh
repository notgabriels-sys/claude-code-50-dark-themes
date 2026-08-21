#!/bin/zsh
set -euo pipefail

script_dir=${0:A:h}
test_root=$(mktemp -d /private/tmp/audio-preflight-package-contract.XXXXXX)

cleanup() {
    /bin/rm -rf -- "$test_root"
}
trap cleanup EXIT INT TERM HUP

fail() {
    print -u2 -- "Release-package contract failed: $1"
    exit 1
}

require_file() {
    [[ -f "$1" ]] || fail "missing file: $1"
}

require_executable() {
    [[ -f "$1" && -x "$1" ]] || fail "missing executable: $1"
}

version=0.1.0
release_name="Audio Delivery Preflight $version (macOS Universal, Unsigned)"
archive_name="Audio-Delivery-Preflight-$version-macOS-universal-unsigned.zip"
output_dir="$test_root/output"
release_root="$output_dir/$release_name"
archive="$output_dir/$archive_name"
sidecar="$archive.sha256"

"$script_dir/package-release.sh" \
    --output "$output_dir" \
    --unsigned

require_file "$archive"
require_file "$sidecar"
require_file "$release_root/PACKAGE-INFO.json"
require_file "$release_root/BUILD-EVIDENCE.txt"
require_file "$release_root/SHA256SUMS.txt"

app="$release_root/Audio Delivery Preflight.app"
app_executable="$app/Contents/MacOS/AudioDeliveryPreflightApp"
cli="$release_root/audio-preflight"
plist="$app/Contents/Info.plist"
package_info="$release_root/PACKAGE-INFO.json"

require_executable "$app_executable"
require_executable "$cli"
for required in \
    "$plist" \
    "$app/Contents/Resources/AppIcon.icns" \
    "$release_root/README.md" \
    "$release_root/PRIVACY.md" \
    "$release_root/LIMITATIONS.md" \
    "$release_root/UNSIGNED.txt"; do
    require_file "$required"
done

[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$plist")" == "com.gabrielgarciaalonso.AudioDeliveryPreflight" ]] \
    || fail "unexpected bundle identifier"
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$plist")" == "$version" ]] \
    || fail "unexpected app version"
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$plist")" == "1" ]] \
    || fail "unexpected build number"
[[ "$(/usr/libexec/PlistBuddy -c 'Print :LSMinimumSystemVersion' "$plist")" == "14.0" ]] \
    || fail "unexpected minimum macOS version"
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIconFile' "$plist")" == "AppIcon" ]] \
    || fail "app icon is not registered"

app_archs=$(lipo -archs "$app_executable")
cli_archs=$(lipo -archs "$cli")
app_arch_count=$(print -r -- "$app_archs" | /usr/bin/wc -w | /usr/bin/tr -d ' ')
cli_arch_count=$(print -r -- "$cli_archs" | /usr/bin/wc -w | /usr/bin/tr -d ' ')
[[ " $app_archs " == *" arm64 "* && " $app_archs " == *" x86_64 "* && "$app_arch_count" == 2 ]] \
    || fail "app is not an exact arm64 and x86_64 Universal executable"
[[ " $cli_archs " == *" arm64 "* && " $cli_archs " == *" x86_64 "* && "$cli_arch_count" == 2 ]] \
    || fail "CLI is not an exact arm64 and x86_64 Universal executable"
[[ "$($cli version)" == "Audio Delivery Preflight $version" ]] \
    || fail "packaged CLI version command failed"

[[ "$(plutil -extract architectureLabel raw -o - "$package_info")" == "Universal" ]] \
    || fail "package architecture label is not Universal"
[[ "$(plutil -extract architectureSet raw -o - "$package_info")" == "arm64 x86_64" ]] \
    || fail "package architecture set is wrong"
[[ "$(plutil -extract developerIDSigned raw -o - "$package_info")" == "false" ]] \
    || fail "candidate must not claim Developer ID signing"
[[ "$(plutil -extract notarized raw -o - "$package_info")" == "false" ]] \
    || fail "candidate must not claim notarization"
[[ "$(plutil -extract commerciallyPublished raw -o - "$package_info")" == "false" ]] \
    || fail "candidate must not claim publication"
[[ "$(plutil -extract productVerifierPassed raw -o - "$package_info")" == "true" ]] \
    || fail "candidate must record the product verifier"
source_commit=$(plutil -extract sourceCommit raw -o - "$package_info")
print -r -- "$source_commit" | /usr/bin/grep -Eq '^[0-9a-f]{40}$' \
    || fail "source commit is not a full Git object identifier"

codesign --verify --deep --strict "$app"
codesign --verify --strict "$app_executable"
codesign --verify --strict "$cli"
(
    cd "$release_root"
    /usr/bin/shasum -a 256 -c SHA256SUMS.txt
) >/dev/null || fail "internal SHA-256 manifest does not validate"

"$script_dir/verify-release-archive.sh" "$archive"

archive_hash_before=$(/usr/bin/shasum -a 256 "$archive" | /usr/bin/awk '{print $1}')
set +e
"$script_dir/package-release.sh" --output "$output_dir" --unsigned \
    > "$test_root/overwrite.stdout" 2> "$test_root/overwrite.stderr"
overwrite_exit=$?
set -e
(( overwrite_exit == 73 )) || fail "packager did not refuse an existing output directory"
archive_hash_after=$(/usr/bin/shasum -a 256 "$archive" | /usr/bin/awk '{print $1}')
[[ "$archive_hash_after" == "$archive_hash_before" ]] || fail "refused overwrite changed the existing archive"

false_sidecar_dir="$test_root/false-sidecar"
mkdir "$false_sidecar_dir"
false_sidecar_archive="$false_sidecar_dir/$archive_name"
/bin/cp "$archive" "$false_sidecar_archive"
/usr/bin/printf '%064d  %s\n' 0 "$archive_name" > "$false_sidecar_archive.sha256"
if "$script_dir/verify-release-archive.sh" "$false_sidecar_archive" \
    > "$test_root/false-sidecar.stdout" 2> "$test_root/false-sidecar.stderr"; then
    fail "archive verifier accepted a false external SHA-256 sidecar"
fi

tampered_dir="$test_root/tampered"
tampered_extract="$tampered_dir/extracted"
mkdir -p "$tampered_extract"
/usr/bin/ditto -x -k "$archive" "$tampered_extract"
print -- "tampered after the internal manifest was written" >> "$tampered_extract/$release_name/README.md"
tampered_archive="$tampered_dir/$archive_name"
(
    cd "$tampered_extract"
    /usr/bin/find "$release_name" -print \
        | /usr/bin/sort \
        | /usr/bin/zip -q -X "$tampered_archive" -@
)
tampered_digest=$(/usr/bin/shasum -a 256 "$tampered_archive" | /usr/bin/awk '{print $1}')
/usr/bin/printf '%s  %s\n' "$tampered_digest" "$archive_name" > "$tampered_archive.sha256"
if "$script_dir/verify-release-archive.sh" "$tampered_archive" \
    > "$test_root/tampered.stdout" 2> "$test_root/tampered.stderr"; then
    fail "archive verifier accepted content changed behind a correct external sidecar"
fi
/usr/bin/grep -F -q -- 'internal SHA-256 manifest does not validate' "$test_root/tampered.stderr" \
    || fail "tampered archive did not fail at the internal-manifest gate"

print -- "Release-package contract passed with real Universal release binaries: arm64 x86_64, unsigned, version $version."
