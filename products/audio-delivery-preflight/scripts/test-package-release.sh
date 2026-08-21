#!/bin/zsh
set -euo pipefail

script_dir=${0:A:h}
product_dir=${script_dir:h}
fixture_bin=$(mktemp -d "${TMPDIR:-/tmp}/audio-preflight-package-test.XXXXXX")
cleanup() {
  rm -rf "$fixture_bin"
}
trap cleanup EXIT

fake_app_binary="$fixture_bin/AudioDeliveryPreflightApp"
fake_cli_binary="$fixture_bin/audio-preflight"
output_dir="$fixture_bin/output"

cp /usr/bin/true "$fake_app_binary"
cp /usr/bin/true "$fake_cli_binary"

"$script_dir/package-release.sh" \
  --output "$output_dir" \
  --app-binary "$fake_app_binary" \
  --cli-binary "$fake_cli_binary" \
  --unsigned

app="$output_dir/Audio Delivery Preflight 0.1.0/Audio Delivery Preflight.app"
archive="$output_dir/Audio-Delivery-Preflight-0.1.0-macOS-unsigned.zip"
checksum="$archive.sha256"

test -x "$app/Contents/MacOS/AudioDeliveryPreflightApp"
test -x "$output_dir/Audio Delivery Preflight 0.1.0/audio-preflight"
test -f "$app/Contents/Info.plist"
test -f "$output_dir/Audio Delivery Preflight 0.1.0/README.md"
test -f "$output_dir/Audio Delivery Preflight 0.1.0/PRIVACY.md"
test -f "$output_dir/Audio Delivery Preflight 0.1.0/LIMITATIONS.md"
test -f "$output_dir/Audio Delivery Preflight 0.1.0/UNSIGNED.txt"
test -f "$archive"
test -f "$checksum"

test "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app/Contents/Info.plist")" = "com.gabrielgarciaalonso.AudioDeliveryPreflight"
test "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app/Contents/Info.plist")" = "0.1.0"
test "$(/usr/libexec/PlistBuddy -c 'Print :LSMinimumSystemVersion' "$app/Contents/Info.plist")" = "14.0"

codesign --verify --deep --strict "$app"
codesign --verify --strict "$output_dir/Audio Delivery Preflight 0.1.0/audio-preflight"
app_signature=$(codesign -d --verbose=4 "$app" 2>&1)
cli_signature=$(codesign -d --verbose=4 "$output_dir/Audio Delivery Preflight 0.1.0/audio-preflight" 2>&1)
[[ "$app_signature" == *"Signature=adhoc"* ]]
[[ "$cli_signature" == *"Signature=adhoc"* ]]

"$script_dir/verify-release-archive.sh" "$archive"

echo "Release packaging test passed."
