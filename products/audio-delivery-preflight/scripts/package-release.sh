#!/bin/zsh
set -euo pipefail

script_dir=${0:A:h}
product_dir=${script_dir:h}
version=0.1.0
bundle_id=com.gabrielgarciaalonso.AudioDeliveryPreflight
output_dir=""
app_binary=""
cli_binary=""
unsigned=false

usage() {
  print -u2 "usage: package-release.sh --output <new-directory> [--app-binary <path> --cli-binary <path>] --unsigned"
}

while (( $# > 0 )); do
  case "$1" in
    --output)
      (( $# >= 2 )) || { usage; exit 64; }
      output_dir=$2
      shift 2
      ;;
    --app-binary)
      (( $# >= 2 )) || { usage; exit 64; }
      app_binary=$2
      shift 2
      ;;
    --cli-binary)
      (( $# >= 2 )) || { usage; exit 64; }
      cli_binary=$2
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
[[ ! -e "$output_dir" ]] || { print -u2 "refusing to overwrite output: $output_dir"; exit 73; }
if { [[ -n "$app_binary" ]] && [[ -z "$cli_binary" ]]; } || { [[ -z "$app_binary" ]] && [[ -n "$cli_binary" ]]; }; then
  print -u2 "provide both binary paths or neither"
  exit 64
fi

if [[ -z "$app_binary" ]]; then
  swift build --package-path "$product_dir" -c release --product AudioDeliveryPreflightApp
  swift build --package-path "$product_dir" -c release --product audio-preflight
  bin_dir=$(swift build --package-path "$product_dir" -c release --show-bin-path)
  app_binary="$bin_dir/AudioDeliveryPreflightApp"
  cli_binary="$bin_dir/audio-preflight"
fi

[[ -f "$app_binary" && -x "$app_binary" ]] || { print -u2 "app binary is not executable: $app_binary"; exit 66; }
[[ -f "$cli_binary" && -x "$cli_binary" ]] || { print -u2 "CLI binary is not executable: $cli_binary"; exit 66; }
plutil -lint "$product_dir/Resources/Info.plist" >/dev/null
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$product_dir/Resources/Info.plist")" == "$bundle_id" ]] || { print -u2 "unexpected bundle identifier"; exit 65; }
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$product_dir/Resources/Info.plist")" == "$version" ]] || { print -u2 "unexpected bundle version"; exit 65; }

release_name="Audio Delivery Preflight $version"
release_root="$output_dir/$release_name"
app="$release_root/Audio Delivery Preflight.app"
archive="$output_dir/Audio-Delivery-Preflight-$version-macOS-unsigned.zip"

mkdir -p "$app/Contents/MacOS"
install -m 755 "$app_binary" "$app/Contents/MacOS/AudioDeliveryPreflightApp"
install -m 644 "$product_dir/Resources/Info.plist" "$app/Contents/Info.plist"
install -m 755 "$cli_binary" "$release_root/audio-preflight"
codesign --remove-signature "$app/Contents/MacOS/AudioDeliveryPreflightApp"
codesign --remove-signature "$release_root/audio-preflight"
install -m 644 "$product_dir/README.md" "$release_root/README.md"
install -m 644 "$product_dir/PRIVACY.md" "$release_root/PRIVACY.md"
install -m 644 "$product_dir/LIMITATIONS.md" "$release_root/LIMITATIONS.md"
install -m 644 "$product_dir/UNSIGNED.txt" "$release_root/UNSIGNED.txt"

find "$release_root" -type l -print -quit | grep -q . && { print -u2 "release tree must not contain symbolic links"; exit 65; }
xattr -cr "$release_root"
ditto -c -k --sequesterRsrc --keepParent "$release_root" "$archive"
archive_hash=$(shasum -a 256 "$archive" | awk '{print $1}')
print -r -- "$archive_hash  ${archive:t}" > "$archive.sha256"

print -r -- "Created unsigned release candidate:"
print -r -- "$archive"
print -r -- "$archive.sha256"
