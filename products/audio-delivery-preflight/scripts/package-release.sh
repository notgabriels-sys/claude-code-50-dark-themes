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

app_archs=$(/usr/bin/lipo -archs "$app_binary")
cli_archs=$(/usr/bin/lipo -archs "$cli_binary")
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

release_name="Audio Delivery Preflight $version (macOS $architecture_label, Unsigned)"
release_root="$output_dir/$release_name"
app="$release_root/Audio Delivery Preflight.app"
archive="$output_dir/Audio-Delivery-Preflight-$version-macOS-$architecture_slug-unsigned.zip"

mkdir -p "$app/Contents/MacOS"
install -m 755 "$app_binary" "$app/Contents/MacOS/AudioDeliveryPreflightApp"
install -m 644 "$product_dir/Resources/Info.plist" "$app/Contents/Info.plist"
install -m 755 "$cli_binary" "$release_root/audio-preflight"
/usr/bin/codesign --force --sign - --timestamp=none "$app"
/usr/bin/codesign --force --sign - --timestamp=none "$release_root/audio-preflight"
install -m 644 "$product_dir/README.md" "$release_root/README.md"
install -m 644 "$product_dir/PRIVACY.md" "$release_root/PRIVACY.md"
install -m 644 "$product_dir/LIMITATIONS.md" "$release_root/LIMITATIONS.md"
install -m 644 "$product_dir/UNSIGNED.txt" "$release_root/UNSIGNED.txt"
/usr/bin/ditto "$product_dir/Tests/Fixtures/valid-digital-release" "$release_root/Sample Delivery Package"

source_commit=$(git -C "$product_dir" rev-parse HEAD 2>/dev/null) || { print -u2 "could not resolve source commit"; exit 65; }
if git -C "$product_dir" diff --quiet -- . && git -C "$product_dir" diff --cached --quiet -- .; then
  source_tree_clean=true
else
  source_tree_clean=false
fi

print -r -- "Audio Delivery Preflight $version
Source commit: $source_commit
Architecture: $architecture_label ($app_archs)
Developer ID signed: no
Ad-hoc execution signature: yes
Apple notarized: no
Commercially published: no
Source tree clean when packaged: $source_tree_clean" > "$release_root/BUILD-EVIDENCE.txt"

print -r -- "{
  \"schemaVersion\": \"1.0\",
  \"productName\": \"Audio Delivery Preflight\",
  \"productVersion\": \"$version\",
  \"buildVersion\": \"1\",
  \"minimumMacOSVersion\": \"14.0\",
  \"bundleIdentifier\": \"$bundle_id\",
  \"architectureLabel\": \"$architecture_label\",
  \"architectures\": \"$app_archs\",
  \"sourceCommit\": \"$source_commit\",
  \"sourceTreeClean\": $source_tree_clean,
  \"developerIDSigned\": false,
  \"adHocSigned\": true,
  \"notarized\": false,
  \"commerciallyPublished\": false
}" > "$release_root/PACKAGE-INFO.json"

(
  cd "$release_root"
  /usr/bin/find . -type f ! -name SHA256SUMS.txt -print0 \
    | /usr/bin/sort -z \
    | while IFS= read -r -d '' relative_file; do
        /usr/bin/shasum -a 256 "$relative_file"
      done
) > "$release_root/SHA256SUMS.txt"

find "$release_root" -type l -print -quit | grep -q . && { print -u2 "release tree must not contain symbolic links"; exit 65; }
xattr -cr "$release_root"
ditto -c -k --sequesterRsrc --keepParent "$release_root" "$archive"
archive_hash=$(shasum -a 256 "$archive" | awk '{print $1}')
print -r -- "$archive_hash  ${archive:t}" > "$archive.sha256"

print -r -- "Created unsigned release candidate:"
print -r -- "$archive"
print -r -- "$archive.sha256"
