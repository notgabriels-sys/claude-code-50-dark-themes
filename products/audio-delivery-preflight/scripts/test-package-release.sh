#!/bin/zsh
set -euo pipefail

script_dir=${0:A:h}
product_dir=${script_dir:h}
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

output_dir="$test_root/output"
"$script_dir/package-release.sh" --output "$output_dir" --unsigned

archives=("$output_dir"/Audio-Delivery-Preflight-0.1.0-macOS-*-unsigned.zip(N))
(( ${#archives[@]} == 1 )) || fail "expected exactly one architecture-labelled ZIP archive"
archive=${archives[1]}
sidecar="$archive.sha256"
require_file "$sidecar"

"$script_dir/verify-release-archive.sh" "$archive"

extract_dir="$test_root/extracted"
mkdir -p "$extract_dir"
/usr/bin/ditto -x -k "$archive" "$extract_dir"
top_level_entries=("$extract_dir"/*(N))
(( ${#top_level_entries[@]} == 1 )) || fail "archive must contain exactly one top-level entry"
release_root=${top_level_entries[1]}
[[ -d "$release_root" ]] || fail "archive top-level entry must be a directory"

app="$release_root/Audio Delivery Preflight.app"
app_executable="$app/Contents/MacOS/AudioDeliveryPreflightApp"
app_icon="$app/Contents/Resources/AppIcon.icns"
cli="$release_root/audio-preflight"
plist="$app/Contents/Info.plist"
package_info="$release_root/PACKAGE-INFO.json"
sample="$release_root/Sample Delivery Package"

require_executable "$app_executable"
require_executable "$cli"
for required in \
    "$plist" \
    "$app_icon" \
    "$release_root/README.md" \
    "$release_root/PRIVACY.md" \
    "$release_root/LIMITATIONS.md" \
    "$release_root/UNSIGNED.txt" \
    "$release_root/BUILD-EVIDENCE.txt" \
    "$package_info" \
    "$release_root/SHA256SUMS.txt" \
    "$sample/Masters/Main Master.wav" \
    "$sample/Artwork/Cover.png" \
    "$sample/Credits/credits.md"; do
    require_file "$required"
done

[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$plist")" == "com.gabrielgarciaalonso.AudioDeliveryPreflight" ]] \
    || fail "unexpected bundle identifier"
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$plist")" == "0.1.0" ]] \
    || fail "unexpected app version"
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$plist")" == "1" ]] \
    || fail "unexpected app build number"
[[ "$(/usr/libexec/PlistBuddy -c 'Print :LSMinimumSystemVersion' "$plist")" == "14.0" ]] \
    || fail "unexpected minimum macOS version"
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIconFile' "$plist")" == "AppIcon" ]] \
    || fail "unexpected application icon metadata"
/usr/bin/cmp "$app_icon" "$product_dir/Resources/AppIcon.icns" \
    || fail "packaged application icon differs from the selected source icon"

app_archs=$(/usr/bin/lipo -archs "$app_executable")
cli_archs=$(/usr/bin/lipo -archs "$cli")
[[ "$app_archs" == "$cli_archs" ]] || fail "app and CLI architectures differ"
case " $app_archs " in
    *" arm64 "*" x86_64 "*|*" x86_64 "*" arm64 "*)
        expected_label="Universal"
        expected_slug="universal"
        ;;
    " arm64 ")
        expected_label="Apple Silicon"
        expected_slug="apple-silicon"
        ;;
    " x86_64 ")
        expected_label="Intel"
        expected_slug="intel"
        ;;
    *)
        fail "unsupported or undisclosed architecture set: $app_archs"
        ;;
esac

architecture_label=$(/usr/bin/plutil -extract architectureLabel raw -o - "$package_info")
[[ "$architecture_label" == "$expected_label" ]] || fail "architecture label does not match the binaries"
[[ "${archive:t}" == *"-$expected_slug-unsigned.zip" ]] || fail "archive name does not disclose architecture"
[[ "${release_root:t}" == *"(macOS $expected_label, Unsigned)" ]] || fail "release directory does not disclose architecture and signing state"

[[ "$(/usr/bin/plutil -extract developerIDSigned raw -o - "$package_info")" == "false" ]] \
    || fail "package metadata must not claim Developer ID signing"
[[ "$(/usr/bin/plutil -extract adHocSigned raw -o - "$package_info")" == "true" ]] \
    || fail "package metadata must disclose the ad-hoc execution signature"
[[ "$(/usr/bin/plutil -extract notarized raw -o - "$package_info")" == "false" ]] \
    || fail "package metadata must not claim notarization"
[[ "$(/usr/bin/plutil -extract commerciallyPublished raw -o - "$package_info")" == "false" ]] \
    || fail "local candidate must not claim publication"
source_commit=$(/usr/bin/plutil -extract sourceCommit raw -o - "$package_info")
print -r -- "$source_commit" | /usr/bin/grep -Eq '^[0-9a-f]{40}$' \
    || fail "source commit is not a full Git object identifier"

/usr/bin/codesign --verify --deep --strict --verbose=2 "$app" >/dev/null 2>&1 \
    || fail "ad-hoc app signature does not verify"
/usr/bin/codesign --verify --strict --verbose=2 "$cli" >/dev/null 2>&1 \
    || fail "ad-hoc CLI signature does not verify"
app_signature=$(/usr/bin/codesign -dvv "$app" 2>&1)
cli_signature=$(/usr/bin/codesign -dvv "$cli" 2>&1)
[[ "$app_signature" == *"Signature=adhoc"* ]] || fail "app signature is not ad hoc"
[[ "$cli_signature" == *"Signature=adhoc"* ]] || fail "CLI signature is not ad hoc"

[[ "$("$cli" version)" == "Audio Delivery Preflight 0.1.0" ]] || fail "packaged CLI version command failed"

(
    cd "$release_root"
    /usr/bin/shasum -a 256 -c SHA256SUMS.txt
) >/dev/null || fail "internal SHA-256 manifest does not validate"

/usr/bin/find "$release_root" -type l -print -quit | /usr/bin/grep -q . \
    && fail "release package contains a symbolic link"

if /usr/bin/grep -a -E -i -q -- 'Lack of Fate|Fate Through|Hologram People' \
    "$release_root/README.md" \
    "$release_root/PRIVACY.md" \
    "$release_root/LIMITATIONS.md" \
    "$release_root/UNSIGNED.txt" \
    "$release_root/BUILD-EVIDENCE.txt" \
    "$package_info"; then
    fail "release metadata blends an artist or label identity into the neutral product"
fi

if /usr/bin/grep -a -E -q -- '/Users/[^/]+|/private/tmp/' \
    "$release_root/README.md" \
    "$release_root/UNSIGNED.txt" \
    "$release_root/BUILD-EVIDENCE.txt" \
    "$package_info"; then
    fail "customer-facing package metadata exposes a private build path"
fi

snapshot_directory "$sample" "$test_root/sample-before.tsv"
reports="$test_root/reports"
mkdir -p "$reports"
"$cli" scan "$sample" \
    --preset digital-release \
    --report-html "$reports/report.html" \
    --report-json "$reports/report.json" \
    --checksums "$reports/SHA256SUMS.txt" >/dev/null
snapshot_directory "$sample" "$test_root/sample-after.tsv"
/usr/bin/cmp "$test_root/sample-before.tsv" "$test_root/sample-after.tsv" \
    || fail "packaged CLI modified the sample source package"
/usr/bin/grep -E -q -- '"overallStatus" : "ready"' "$reports/report.json" \
    || fail "packaged CLI did not produce a ready fixture report"
require_file "$reports/report.html"
require_file "$reports/SHA256SUMS.txt"

archive_hash_before=$(/usr/bin/shasum -a 256 "$archive" | /usr/bin/awk '{print $1}')
set +e
"$script_dir/package-release.sh" --output "$output_dir" --unsigned \
    > "$test_root/overwrite.stdout" 2> "$test_root/overwrite.stderr"
overwrite_exit=$?
set -e
(( overwrite_exit == 73 )) || fail "packager did not refuse an existing output directory"
archive_hash_after=$(/usr/bin/shasum -a 256 "$archive" | /usr/bin/awk '{print $1}')
[[ "$archive_hash_after" == "$archive_hash_before" ]] || fail "refused overwrite changed the existing archive"

tampered_archive="$test_root/Tampered.zip"
/bin/cp "$archive" "$tampered_archive"
/usr/bin/printf '%064d  %s\n' 0 "${tampered_archive:t}" > "$tampered_archive.sha256"
if "$script_dir/verify-release-archive.sh" "$tampered_archive" \
    > "$test_root/tampered.stdout" 2> "$test_root/tampered.stderr"; then
    fail "archive verifier accepted a false SHA-256 sidecar"
fi

print -- "Release-package contract passed with real release binaries: $architecture_label, unsigned, version 0.1.0."
