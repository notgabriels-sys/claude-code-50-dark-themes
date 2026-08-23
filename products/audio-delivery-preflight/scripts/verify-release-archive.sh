#!/bin/zsh
set -euo pipefail

version=0.1.0
build_number=1
bundle_identifier=com.gabrielgarciaalonso.AudioDeliveryPreflight
minimum_macos=14.0
release_name="Audio Delivery Preflight $version (macOS Universal, Unsigned)"
archive_name="Audio-Delivery-Preflight-$version-macOS-universal-unsigned.zip"

usage() {
    print -u2 -- "usage: verify-release-archive.sh <archive.zip>"
}

fail() {
    print -u2 -- "Release archive verification failed: $1"
    exit ${2:-1}
}

snapshot_directory() {
    local source_directory=$1
    local destination=$2
    (
        cd "$source_directory"
        /usr/bin/find . -type f -print0 \
            | /usr/bin/sort -z \
            | while IFS= read -r -d '' relative_file; do
                digest=$(/usr/bin/shasum -a 256 "$relative_file" | /usr/bin/awk '{print $1}')
                /usr/bin/stat -f '%N\t%z\t%Fm\t%Lp' "$relative_file" \
                    | /usr/bin/sed "s#^$relative_file#$digest\t${relative_file#./}#"
            done
    ) > "$destination"
}

(( $# == 1 )) || { usage; exit 64; }
archive=${1:A}
sidecar="$archive.sha256"
[[ -f "$archive" ]] || fail "archive not found: $archive" 66
[[ -f "$sidecar" ]] || fail "SHA-256 sidecar not found: $sidecar" 66
[[ "${archive:t}" == "$archive_name" ]] || fail "archive filename does not disclose the required universal unsigned build"

sidecar_lines=$(/usr/bin/awk 'END { print NR }' "$sidecar")
(( sidecar_lines == 1 )) || fail "SHA-256 sidecar must contain exactly one line"
read -r expected_digest recorded_name extra < "$sidecar"
[[ -z "${extra:-}" ]] || fail "SHA-256 sidecar contains unexpected fields"
[[ "$recorded_name" == "$archive_name" ]] || fail "sidecar filename does not match the archive"
print -r -- "$expected_digest" | /usr/bin/grep -Eq '^[0-9a-f]{64}$' \
    || fail "sidecar does not contain one lowercase SHA-256 digest"
actual_digest=$(/usr/bin/shasum -a 256 "$archive" | /usr/bin/awk '{print $1}')
[[ "$actual_digest" == "$expected_digest" ]] || fail "archive SHA-256 does not match the sidecar"
/usr/bin/unzip -t "$archive" >/dev/null || fail "ZIP integrity test failed"

entries=$(/usr/bin/zipinfo -1 "$archive")
[[ -n "$entries" ]] || fail "archive is empty"
entry_count=$(print -r -- "$entries" | /usr/bin/wc -l | /usr/bin/tr -d ' ')
(( entry_count <= 10000 )) || fail "archive has an unreasonable number of entries"
duplicates=$(print -r -- "$entries" | /usr/bin/sort | /usr/bin/uniq -d)
[[ -z "$duplicates" ]] || fail "archive contains duplicate paths"
if /usr/bin/zipinfo -l "$archive" | /usr/bin/grep -E '^l' >/dev/null; then
    fail "archive contains a symbolic-link entry"
fi

root_name=""
while IFS= read -r entry; do
    [[ -n "$entry" ]] || continue
    case "$entry" in
        /*|..|../*|*/../*|*/..|*\\*)
            fail "archive contains an unsafe path: $entry"
            ;;
    esac
    entry_root=${entry%%/*}
    [[ -n "$entry_root" && "$entry_root" != "." && "$entry_root" != ".." ]] \
        || fail "archive contains an invalid top-level path"
    if [[ -z "$root_name" ]]; then
        root_name=$entry_root
    elif [[ "$entry_root" != "$root_name" ]]; then
        fail "archive contains more than one top-level item"
    fi
done <<< "$entries"

[[ "$root_name" == "$release_name" ]] \
    || fail "top-level directory does not disclose the required version, architecture, and unsigned status"
print -r -- "$entries" | /usr/bin/grep -Fx -- "$release_name/" >/dev/null \
    || fail "archive does not contain an explicit top-level directory entry"

extract_root=$(mktemp -d /private/tmp/audio-preflight-release-verify.XXXXXX)
cleanup() {
    /bin/rm -rf -- "$extract_root"
}
trap cleanup EXIT INT TERM HUP

/usr/bin/ditto -x -k "$archive" "$extract_root"
top_level_count=$(find "$extract_root" -mindepth 1 -maxdepth 1 | /usr/bin/wc -l | /usr/bin/tr -d ' ')
(( top_level_count == 1 )) || fail "extracted archive does not contain exactly one top-level item"
release_root="$extract_root/$release_name"
[[ -d "$release_root" ]] || fail "expected extracted release directory is missing"
[[ -z "$(find "$release_root" -type l -print -quit)" ]] \
    || fail "extracted release contains a symbolic link"

app="$release_root/Audio Delivery Preflight.app"
app_executable="$app/Contents/MacOS/AudioDeliveryPreflightApp"
cli="$release_root/audio-preflight"
plist="$app/Contents/Info.plist"
icon="$app/Contents/Resources/AppIcon.icns"
package_info="$release_root/PACKAGE-INFO.json"
manifest="$release_root/SHA256SUMS.txt"
sample="$release_root/Sample Delivery Package"

[[ -x "$app_executable" ]] || fail "app executable is missing or not executable"
[[ -x "$cli" ]] || fail "CLI is missing or not executable"
for required in \
    "$plist" \
    "$icon" \
    "$release_root/README.md" \
    "$release_root/PRIVACY.md" \
    "$release_root/LIMITATIONS.md" \
    "$release_root/UNSIGNED.txt" \
    "$release_root/BUILD-EVIDENCE.txt" \
    "$package_info" \
    "$manifest" \
    "$sample/Masters/Main Master.wav" \
    "$sample/Artwork/Cover.png" \
    "$sample/Credits/credits.md"; do
    [[ -f "$required" ]] || fail "required package file is missing: ${required:t}"
done

plutil -lint "$plist" >/dev/null || fail "Info.plist is invalid"
plutil -convert xml1 -o - "$package_info" >/dev/null || fail "PACKAGE-INFO.json is invalid"
[[ "$(plutil -extract schemaVersion raw -o - "$package_info")" == "1.0" ]] \
    || fail "PACKAGE-INFO.json schema version mismatch"
[[ "$(plutil -extract productName raw -o - "$package_info")" == "Audio Delivery Preflight" ]] \
    || fail "package product name mismatch"
[[ "$(plutil -extract version raw -o - "$package_info")" == "$version" ]] \
    || fail "package version mismatch"
[[ "$(plutil -extract productVersion raw -o - "$package_info")" == "$version" ]] \
    || fail "package product-version compatibility field mismatch"
[[ "$(plutil -extract buildNumber raw -o - "$package_info")" == "$build_number" ]] \
    || fail "package build number mismatch"
[[ "$(plutil -extract buildVersion raw -o - "$package_info")" == "$build_number" ]] \
    || fail "package build-version compatibility field mismatch"
[[ "$(plutil -extract bundleIdentifier raw -o - "$package_info")" == "$bundle_identifier" ]] \
    || fail "package bundle identifier mismatch"
[[ "$(plutil -extract minimumMacOS raw -o - "$package_info")" == "$minimum_macos" ]] \
    || fail "package platform floor mismatch"
[[ "$(plutil -extract minimumMacOSVersion raw -o - "$package_info")" == "$minimum_macos" ]] \
    || fail "package minimum-macOS compatibility field mismatch"
[[ "$(plutil -extract architectureLabel raw -o - "$package_info")" == "Universal" ]] \
    || fail "package architecture label mismatch"
[[ "$(plutil -extract architectureSet raw -o - "$package_info")" == "arm64 x86_64" ]] \
    || fail "package architecture set mismatch"
[[ "$(plutil -extract architectures raw -o - "$package_info")" == "arm64 x86_64" ]] \
    || fail "package architectures compatibility field mismatch"
[[ "$(plutil -extract packagingMode raw -o - "$package_info")" == "local-unsigned-candidate" ]] \
    || fail "package mode mismatch"
[[ "$(plutil -extract developerIDSigned raw -o - "$package_info")" == "false" ]] \
    || fail "unsigned candidate claims Developer ID signing"
[[ "$(plutil -extract adHocSigned raw -o - "$package_info")" == "true" ]] \
    || fail "unsigned candidate does not disclose its ad-hoc execution signatures"
[[ "$(plutil -extract notarized raw -o - "$package_info")" == "false" ]] \
    || fail "unsigned candidate claims Apple notarization"
[[ "$(plutil -extract commerciallyPublished raw -o - "$package_info")" == "false" ]] \
    || fail "local candidate claims commercial publication"
[[ "$(plutil -extract productVerifierPassed raw -o - "$package_info")" == "true" ]] \
    || fail "package metadata does not record the product verifier"
[[ "$(plutil -extract productSourceClean raw -o - "$package_info")" == "true" ]] \
    || fail "package metadata does not bind a clean product source"
source_tree_clean=$(plutil -extract sourceTreeClean raw -o - "$package_info")
[[ "$source_tree_clean" == "true" || "$source_tree_clean" == "false" ]] \
    || fail "package source-tree state is invalid"
source_commit=$(plutil -extract sourceCommit raw -o - "$package_info")
print -r -- "$source_commit" | /usr/bin/grep -Eq '^[0-9a-f]{40}$' \
    || fail "package source commit is not a full Git object identifier"
for digest_field in packagingScriptSHA256 archiveVerifierScriptSHA256; do
    digest_value=$(plutil -extract "$digest_field" raw -o - "$package_info")
    print -r -- "$digest_value" | /usr/bin/grep -Eq '^[0-9a-f]{64}$' \
        || fail "package metadata contains an invalid script digest: $digest_field"
done
icon_digest=$(/usr/bin/shasum -a 256 "$icon" | /usr/bin/awk '{print $1}')
[[ "$icon_digest" == "$(plutil -extract appIconSHA256 raw -o - "$package_info")" ]] \
    || fail "packaged icon digest does not match package provenance"

[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$plist")" == "$bundle_identifier" ]] \
    || fail "bundle identifier mismatch"
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$plist")" == "$version" ]] \
    || fail "marketing version mismatch"
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$plist")" == "$build_number" ]] \
    || fail "build number mismatch"
[[ "$(/usr/libexec/PlistBuddy -c 'Print :LSMinimumSystemVersion' "$plist")" == "$minimum_macos" ]] \
    || fail "minimum macOS version mismatch"
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIconFile' "$plist")" == "AppIcon" ]] \
    || fail "bundle metadata does not register the app icon"
/usr/bin/sips -g format "$icon" 2>/dev/null | /usr/bin/grep -F -- 'format: icns' >/dev/null \
    || fail "app icon is not a valid ICNS resource"

app_archs=$(lipo -archs "$app_executable")
cli_archs=$(lipo -archs "$cli")
app_arch_count=$(print -r -- "$app_archs" | /usr/bin/wc -w | /usr/bin/tr -d ' ')
cli_arch_count=$(print -r -- "$cli_archs" | /usr/bin/wc -w | /usr/bin/tr -d ' ')
[[ " $app_archs " == *" arm64 "* && " $app_archs " == *" x86_64 "* && "$app_arch_count" == 2 ]] \
    || fail "app executable is not exactly arm64 plus x86_64"
[[ " $cli_archs " == *" arm64 "* && " $cli_archs " == *" x86_64 "* && "$cli_arch_count" == 2 ]] \
    || fail "CLI executable is not exactly arm64 plus x86_64"

manifest_paths="$extract_root/manifest-paths.txt"
actual_paths="$extract_root/actual-paths.txt"
: > "$manifest_paths"
manifest_lines=0
while IFS= read -r manifest_line; do
    [[ -n "$manifest_line" ]] || fail "internal manifest contains a blank line"
    manifest_digest=${manifest_line%%  *}
    manifest_path=${manifest_line#*  }
    print -r -- "$manifest_digest" | /usr/bin/grep -Eq '^[0-9a-f]{64}$' \
        || fail "internal manifest contains an invalid digest"
    case "$manifest_path" in
        ""|/*|..|../*|*/../*|*/..|*\\*|SHA256SUMS.txt)
            fail "internal manifest contains an unsafe or self-referential path"
            ;;
    esac
    [[ -f "$release_root/$manifest_path" ]] || fail "manifest path is missing: $manifest_path"
    print -r -- "$manifest_path" >> "$manifest_paths"
    (( manifest_lines += 1 ))
done < "$manifest"
(( manifest_lines > 0 )) || fail "internal manifest is empty"
manifest_duplicates=$(/usr/bin/sort "$manifest_paths" | /usr/bin/uniq -d)
[[ -z "$manifest_duplicates" ]] || fail "internal manifest contains duplicate paths"
(
    cd "$release_root"
    /usr/bin/find . -type f ! -name SHA256SUMS.txt -print \
        | /usr/bin/sed 's#^\./##' \
        | /usr/bin/sort
) > "$actual_paths"
/usr/bin/sort "$manifest_paths" -o "$manifest_paths"
/usr/bin/cmp "$manifest_paths" "$actual_paths" >/dev/null \
    || fail "internal manifest does not cover exactly every package file"
(
    cd "$release_root"
    /usr/bin/shasum -a 256 -c SHA256SUMS.txt
) >/dev/null || fail "internal SHA-256 manifest does not validate"

codesign --verify --deep --strict "$app" || fail "app bundle signature is invalid"
codesign --verify --strict "$app_executable" || fail "app executable signature is invalid"
codesign --verify --strict "$cli" || fail "CLI signature is invalid"

signature_kind() {
    local target=$1
    local signature_output
    if signature_output=$(codesign -dv --verbose=4 "$target" 2>&1); then
        if [[ "$signature_output" == *"Authority=Developer ID Application"* ]]; then
            print -- "developer-id"
        elif [[ "$signature_output" == *"Signature=adhoc"* ]]; then
            print -- "ad-hoc"
        else
            print -- "signed-other"
        fi
    else
        print -- "unsigned"
    fi
}

app_bundle_signature=$(signature_kind "$app")
app_executable_signature=$(signature_kind "$app_executable")
cli_signature=$(signature_kind "$cli")
[[ "$app_bundle_signature" == "$(plutil -extract appBundleSignature raw -o - "$package_info")" ]] \
    || fail "app bundle signature state changed after archiving"
[[ "$app_executable_signature" == "$(plutil -extract appExecutableSignature raw -o - "$package_info")" ]] \
    || fail "app executable signature state changed after archiving"
[[ "$cli_signature" == "$(plutil -extract cliSignature raw -o - "$package_info")" ]] \
    || fail "CLI signature state changed after archiving"
[[ "$app_bundle_signature" == "ad-hoc" \
    && "$app_executable_signature" == "ad-hoc" \
    && "$cli_signature" == "ad-hoc" ]] \
    || fail "signature state conflicts with the unsigned release label"

set +e
spctl -a -vv --type execute "$app" > "$extract_root/spctl.stdout" 2> "$extract_root/spctl.stderr"
spctl_exit=$?
set -e
if (( spctl_exit == 0 )); then
    gatekeeper_assessment=accepted
elif /usr/bin/grep -E -i -q -- 'rejected|not accepted|unnotarized' "$extract_root/spctl.stderr"; then
    gatekeeper_assessment=rejected
else
    gatekeeper_assessment=unavailable
fi
[[ "$gatekeeper_assessment" == "$(plutil -extract gatekeeperAssessment raw -o - "$package_info")" ]] \
    || fail "Gatekeeper assessment changed after archive extraction"
recorded_gatekeeper_exit=$(plutil -extract gatekeeperExitCode raw -o - "$package_info")
print -r -- "$recorded_gatekeeper_exit" | /usr/bin/grep -Eq '^[0-9]+$' \
    || fail "recorded Gatekeeper exit code is invalid"

[[ "$($cli version)" == "Audio Delivery Preflight $version" ]] \
    || fail "packaged CLI version command failed"
sample_before="$extract_root/sample-before.tsv"
sample_after="$extract_root/sample-after.tsv"
reports="$extract_root/reports"
snapshot_directory "$sample" "$sample_before"
mkdir "$reports"
"$cli" scan "$sample" \
    --preset digital-release \
    --report-html "$reports/report.html" \
    --report-json "$reports/report.json" \
    --checksums "$reports/SHA256SUMS.txt" >/dev/null \
    || fail "packaged CLI did not accept the deterministic sample"
snapshot_directory "$sample" "$sample_after"
/usr/bin/cmp "$sample_before" "$sample_after" >/dev/null \
    || fail "packaged CLI modified the deterministic sample"
/usr/bin/grep -E -q -- '"overallStatus" : "ready"' "$reports/report.json" \
    || fail "packaged CLI did not produce a ready sample report"
[[ -f "$reports/report.html" && -f "$reports/SHA256SUMS.txt" ]] \
    || fail "packaged CLI did not create every requested sample report"
unsigned_disclosure=$(/usr/bin/tr '\n\t' '  ' < "$release_root/UNSIGNED.txt")
[[ "$unsigned_disclosure" == *'not been signed with an Apple Developer ID certificate'* ]] \
    || fail "unsigned disclosure is incomplete"
[[ "$unsigned_disclosure" == *'not been notarized by Apple'* ]] \
    || fail "notarization disclosure is incomplete"

if /usr/bin/grep -R -a -E -i -q -- 'Lack of Fate|Fate Through|Hologram People' "$release_root"; then
    fail "artist or label identity leaked into the neutral package"
fi
if /usr/bin/grep -R -a -E -q -- '/Users/[^/]+|/private/tmp/' \
    "$release_root/README.md" \
    "$release_root/PRIVACY.md" \
    "$release_root/LIMITATIONS.md" \
    "$release_root/UNSIGNED.txt" \
    "$release_root/BUILD-EVIDENCE.txt" \
    "$package_info"; then
    fail "customer-facing package metadata exposes a private build path"
fi
if /usr/bin/strings "$app_executable" "$cli" \
    | /usr/bin/grep -E -- '/Users/|/private/tmp/' >/dev/null; then
    fail "release binary exposes a private build path"
fi

print -- "Verified release archive: ${archive:t}"
print -- "SHA-256: $actual_digest"
print -- "Architecture: Universal (arm64 x86_64)"
print -- "Signatures: app bundle $app_bundle_signature; executable $app_executable_signature; CLI $cli_signature"
print -- "Gatekeeper assessment: $gatekeeper_assessment (exit $spctl_exit)"
print -- "Source commit: $source_commit; entire tree clean: $source_tree_clean"
