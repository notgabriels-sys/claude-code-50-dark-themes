#!/bin/zsh
set -euo pipefail

script_dir=${0:A:h}
product_dir=${script_dir:h}
repo_root=${product_dir:h:h}
version=0.1.0
build_number=1
bundle_identifier=com.gabrielgarciaalonso.AudioDeliveryPreflight
minimum_macos=14.0
output_dir=""
unsigned=false

usage() {
    print -u2 -- "usage: package-release.sh --output <new-absolute-directory> --unsigned"
}

fail() {
    print -u2 -- "Release packaging failed: $1"
    exit ${2:-1}
}

while (( $# > 0 )); do
    case "$1" in
        --output)
            (( $# >= 2 )) || { usage; exit 64; }
            output_dir=$2
            shift 2
            ;;
        --unsigned)
            unsigned=true
            shift
            ;;
        *)
            usage
            exit 64
            ;;
    esac
done

[[ -n "$output_dir" && "$unsigned" == true ]] || { usage; exit 64; }
[[ "$output_dir" == /* ]] || fail "the output directory must be an absolute path" 64
[[ ! -e "$output_dir" ]] || fail "refusing to overwrite existing output: $output_dir" 73
[[ -d "${output_dir:h}" ]] || fail "the output parent does not exist: ${output_dir:h}" 66
case "$output_dir" in
    /|/tmp|/private|/private/tmp|"$repo_root"|"$product_dir")
        fail "refusing unsafe output target: $output_dir" 64
        ;;
esac

for required in \
    "$product_dir/Package.swift" \
    "$product_dir/Resources/Info.plist" \
    "$product_dir/Resources/AppIcon.icns" \
    "$product_dir/README.md" \
    "$product_dir/PRIVACY.md" \
    "$product_dir/LIMITATIONS.md" \
    "$product_dir/UNSIGNED.txt" \
    "$script_dir/verify.sh" \
    "$script_dir/verify-release-archive.sh"; do
    [[ -f "$required" ]] || fail "missing packaging input: $required" 66
done
[[ -d "$product_dir/Tests/Fixtures/valid-digital-release" ]] \
    || fail "missing deterministic sample delivery fixture" 66

plutil -lint "$product_dir/Resources/Info.plist" >/dev/null
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$product_dir/Resources/Info.plist")" == "$bundle_identifier" ]] \
    || fail "unexpected bundle identifier in Info.plist" 65
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$product_dir/Resources/Info.plist")" == "$version" ]] \
    || fail "unexpected marketing version in Info.plist" 65
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$product_dir/Resources/Info.plist")" == "$build_number" ]] \
    || fail "unexpected build number in Info.plist" 65
[[ "$(/usr/libexec/PlistBuddy -c 'Print :LSMinimumSystemVersion' "$product_dir/Resources/Info.plist")" == "$minimum_macos" ]] \
    || fail "unexpected minimum macOS version in Info.plist" 65

source_changes=$(git -C "$repo_root" status --porcelain -- \
    products/audio-delivery-preflight/Package.swift \
    products/audio-delivery-preflight/Sources \
    products/audio-delivery-preflight/Resources)
[[ -z "$source_changes" ]] \
    || fail "refusing to package uncommitted Package.swift, Sources, or Resources changes" 65

print -- "Running the complete product verifier before packaging..."
AUDIO_PREFLIGHT_SKIP_PACKAGE_TEST=1 "$script_dir/verify.sh"

source_commit=$(git -C "$repo_root" rev-parse HEAD)
source_branch=$(git -C "$repo_root" branch --show-current)
if [[ -n "$(git -C "$repo_root" status --porcelain)" ]]; then
    source_tree_clean=false
else
    source_tree_clean=true
fi
package_script_digest=$(/usr/bin/shasum -a 256 "$script_dir/package-release.sh" | /usr/bin/awk '{print $1}')
archive_verifier_digest=$(/usr/bin/shasum -a 256 "$script_dir/verify-release-archive.sh" | /usr/bin/awk '{print $1}')
icon_digest=$(/usr/bin/shasum -a 256 "$product_dir/Resources/AppIcon.icns" | /usr/bin/awk '{print $1}')

build_root=$(mktemp -d /private/tmp/audio-preflight-release-build.XXXXXX)
cleanup() {
    /bin/rm -rf -- "$build_root"
}
trap cleanup EXIT INT TERM HUP
staging_output="$build_root/staged-output"
mkdir "$staging_output"

export CLANG_MODULE_CACHE_PATH="$build_root/clang-module-cache"
export SWIFT_MODULECACHE_PATH="$build_root/swift-module-cache"
export LC_ALL=C

build_for_architecture() {
    local architecture=$1
    local scratch="$build_root/build-$architecture"
    local triple="${architecture}-apple-macosx${minimum_macos}"
    swift build --package-path "$product_dir" \
        --scratch-path "$scratch" \
        --triple "$triple" \
        -c release \
        --product audio-preflight >&2
    swift build --package-path "$product_dir" \
        --scratch-path "$scratch" \
        --triple "$triple" \
        -c release \
        --product AudioDeliveryPreflightApp >&2
    local binary_directory
    binary_directory=$(swift build --package-path "$product_dir" \
        --scratch-path "$scratch" \
        --triple "$triple" \
        -c release \
        --show-bin-path)
    [[ -x "$binary_directory/audio-preflight" ]] || return 1
    [[ -x "$binary_directory/AudioDeliveryPreflightApp" ]] || return 1
    print -r -- "$binary_directory"
}

print -- "Building verified arm64 and x86_64 release executables..."
arm64_binary_directory=$(build_for_architecture arm64) \
    || fail "the arm64 release build failed" 70
x86_binary_directory=$(build_for_architecture x86_64) \
    || fail "the x86_64 release build failed" 70

universal_app="$build_root/AudioDeliveryPreflightApp"
universal_cli="$build_root/audio-preflight"
lipo -create \
    "$arm64_binary_directory/AudioDeliveryPreflightApp" \
    "$x86_binary_directory/AudioDeliveryPreflightApp" \
    -output "$universal_app"
lipo -create \
    "$arm64_binary_directory/audio-preflight" \
    "$x86_binary_directory/audio-preflight" \
    -output "$universal_cli"
/usr/bin/strip -x "$universal_app" "$universal_cli"

app_archs=$(lipo -archs "$universal_app")
cli_archs=$(lipo -archs "$universal_cli")
app_arch_count=$(print -r -- "$app_archs" | /usr/bin/wc -w | /usr/bin/tr -d ' ')
cli_arch_count=$(print -r -- "$cli_archs" | /usr/bin/wc -w | /usr/bin/tr -d ' ')
[[ " $app_archs " == *" arm64 "* && " $app_archs " == *" x86_64 "* && "$app_arch_count" == 2 ]] \
    || fail "app executable is not exactly arm64 plus x86_64" 65
[[ " $cli_archs " == *" arm64 "* && " $cli_archs " == *" x86_64 "* && "$cli_arch_count" == 2 ]] \
    || fail "CLI executable is not exactly arm64 plus x86_64" 65

architecture_label=Universal
architecture_set="arm64 x86_64"
release_name="Audio Delivery Preflight $version (macOS $architecture_label, Unsigned)"
release_root="$staging_output/$release_name"
app="$release_root/Audio Delivery Preflight.app"
app_executable="$app/Contents/MacOS/AudioDeliveryPreflightApp"
cli="$release_root/audio-preflight"
archive="$staging_output/Audio-Delivery-Preflight-$version-macOS-universal-unsigned.zip"

mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
/usr/bin/install -m 755 "$universal_app" "$app_executable"
/usr/bin/install -m 644 "$product_dir/Resources/Info.plist" "$app/Contents/Info.plist"
/usr/bin/install -m 644 "$product_dir/Resources/AppIcon.icns" "$app/Contents/Resources/AppIcon.icns"
/usr/bin/install -m 755 "$universal_cli" "$cli"
/usr/bin/install -m 644 "$product_dir/README.md" "$release_root/README.md"
/usr/bin/install -m 644 "$product_dir/PRIVACY.md" "$release_root/PRIVACY.md"
/usr/bin/install -m 644 "$product_dir/LIMITATIONS.md" "$release_root/LIMITATIONS.md"
/usr/bin/install -m 644 "$product_dir/UNSIGNED.txt" "$release_root/UNSIGNED.txt"
/usr/bin/ditto "$product_dir/Tests/Fixtures/valid-digital-release" \
    "$release_root/Sample Delivery Package"

[[ -z "$(find "$release_root" -type l -print -quit)" ]] \
    || fail "release tree contains a symbolic link" 65
xattr -cr "$release_root"
codesign --force --sign - --timestamp=none "$cli"
codesign --force --deep --sign - --timestamp=none "$app"
codesign --verify --strict "$cli"
codesign --verify --deep --strict "$app"

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
[[ "$app_bundle_signature" == "ad-hoc" \
    && "$app_executable_signature" == "ad-hoc" \
    && "$cli_signature" == "ad-hoc" ]] \
    || fail "the unsigned candidate must contain coherent ad-hoc signatures" 65

set +e
spctl -a -vv --type execute "$app" > "$build_root/spctl.stdout" 2> "$build_root/spctl.stderr"
spctl_exit=$?
set -e
if (( spctl_exit == 0 )); then
    gatekeeper_assessment=accepted
elif /usr/bin/grep -E -i -q -- 'rejected|not accepted|unnotarized' "$build_root/spctl.stderr"; then
    gatekeeper_assessment=rejected
else
    gatekeeper_assessment=unavailable
fi

package_info="$release_root/PACKAGE-INFO.json"
plutil -create xml1 "$package_info"
plutil -insert schemaVersion -string "1.0" "$package_info"
plutil -insert productName -string "Audio Delivery Preflight" "$package_info"
plutil -insert version -string "$version" "$package_info"
plutil -insert productVersion -string "$version" "$package_info"
plutil -insert buildNumber -integer "$build_number" "$package_info"
plutil -insert buildVersion -string "$build_number" "$package_info"
plutil -insert bundleIdentifier -string "$bundle_identifier" "$package_info"
plutil -insert minimumMacOS -string "$minimum_macos" "$package_info"
plutil -insert minimumMacOSVersion -string "$minimum_macos" "$package_info"
plutil -insert architectureLabel -string "$architecture_label" "$package_info"
plutil -insert architectureSet -string "$architecture_set" "$package_info"
plutil -insert architectures -string "$architecture_set" "$package_info"
plutil -insert packagingMode -string "local-unsigned-candidate" "$package_info"
plutil -insert developerIDSigned -bool false "$package_info"
plutil -insert adHocSigned -bool true "$package_info"
plutil -insert notarized -bool false "$package_info"
plutil -insert commerciallyPublished -bool false "$package_info"
plutil -insert productVerifierPassed -bool true "$package_info"
plutil -insert sourceCommit -string "$source_commit" "$package_info"
plutil -insert sourceBranch -string "$source_branch" "$package_info"
plutil -insert sourceTreeClean -bool "$source_tree_clean" "$package_info"
plutil -insert productSourceClean -bool true "$package_info"
plutil -insert packagingScriptSHA256 -string "$package_script_digest" "$package_info"
plutil -insert archiveVerifierScriptSHA256 -string "$archive_verifier_digest" "$package_info"
plutil -insert appBundleSignature -string "$app_bundle_signature" "$package_info"
plutil -insert appExecutableSignature -string "$app_executable_signature" "$package_info"
plutil -insert cliSignature -string "$cli_signature" "$package_info"
plutil -insert gatekeeperAssessment -string "$gatekeeper_assessment" "$package_info"
plutil -insert gatekeeperExitCode -integer "$spctl_exit" "$package_info"
plutil -insert appIconSHA256 -string "$icon_digest" "$package_info"
plutil -convert json -r "$package_info"

{
    print -- "AUDIO DELIVERY PREFLIGHT $version: BUILD EVIDENCE"
    print -- ""
    print -- "Source commit: $source_commit"
    print -- "Source branch: $source_branch"
    print -- "Entire source tree clean: $source_tree_clean"
    print -- "Package.swift, Sources, and Resources clean: true"
    print -- "Product verifier passed: true"
    print -- "Minimum macOS: $minimum_macos"
    print -- "Architecture label: $architecture_label"
    print -- "Binary architectures: $architecture_set"
    print -- "App bundle signature: $app_bundle_signature"
    print -- "App executable signature: $app_executable_signature"
    print -- "CLI signature: $cli_signature"
    print -- "Developer ID signed: false"
    print -- "Apple notarized: false"
    print -- "Gatekeeper assessment during assembly: $gatekeeper_assessment (exit $spctl_exit)"
    print -- "Commercially published: false"
    print -- "App icon SHA-256: $icon_digest"
    print -- "Packaging script SHA-256: $package_script_digest"
    print -- "Archive verifier SHA-256: $archive_verifier_digest"
    print -- ""
    print -- "These are local technical observations, not identity attestation, legal approval,"
    print -- "commercial publication, artistic approval, or distributor acceptance."
} > "$release_root/BUILD-EVIDENCE.txt"

if /usr/bin/strings "$app_executable" "$cli" \
    | /usr/bin/grep -E -- '/Users/|/private/tmp/' >/dev/null; then
    fail "a release binary exposes a private build path" 65
fi
if /usr/bin/grep -R -a -E -i -q -- 'Lack of Fate|Fate Through|Hologram People' "$release_root"; then
    fail "an artist or label identity leaked into the neutral release package" 65
fi
if /usr/bin/grep -R -a -E -q -- '/Users/[^/]+|/private/tmp/' \
    "$release_root/README.md" \
    "$release_root/PRIVACY.md" \
    "$release_root/LIMITATIONS.md" \
    "$release_root/UNSIGNED.txt" \
    "$release_root/BUILD-EVIDENCE.txt" \
    "$package_info"; then
    fail "customer-facing metadata exposes a private build path" 65
fi

(
    cd "$release_root"
    /usr/bin/find . -type f ! -name SHA256SUMS.txt -print0 \
        | /usr/bin/sort -z \
        | while IFS= read -r -d '' release_file; do
            digest=$(/usr/bin/shasum -a 256 "$release_file" | /usr/bin/awk '{print $1}')
            /usr/bin/printf '%s  %s\n' "$digest" "${release_file#./}"
        done
) > "$release_root/SHA256SUMS.txt"

/usr/bin/find "$release_root" -exec /usr/bin/touch -t 202601010000 {} +
(
    cd "$staging_output"
    /usr/bin/find "$release_name" -print \
        | /usr/bin/sort \
        | /usr/bin/zip -q -X "$archive" -@
)
/usr/bin/unzip -t "$archive" >/dev/null
archive_digest=$(/usr/bin/shasum -a 256 "$archive" | /usr/bin/awk '{print $1}')
/usr/bin/printf '%s  %s\n' "$archive_digest" "${archive:t}" > "$archive.sha256"

"$script_dir/verify-release-archive.sh" "$archive"

/bin/mv "$staging_output" "$output_dir"
final_archive="$output_dir/${archive:t}"

print -- "Created and verified local unsigned release candidate:"
print -- "$final_archive"
print -- "$final_archive.sha256"
