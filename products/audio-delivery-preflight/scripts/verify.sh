#!/bin/zsh
set -euo pipefail

SCRIPT_DIR=${0:A:h}
PRODUCT_DIR=${SCRIPT_DIR:h}
FIXTURE_DIR="$PRODUCT_DIR/Tests/Fixtures/valid-digital-release"
VERIFY_TMP=$(mktemp -d /private/tmp/audio-preflight-verify.XXXXXX)
export CLANG_MODULE_CACHE_PATH="$VERIFY_TMP/clang-module-cache"
export SWIFT_MODULECACHE_PATH="$VERIFY_TMP/swift-module-cache"
export LC_ALL=C

cleanup() {
    rm -rf -- "$VERIFY_TMP"
}
trap cleanup EXIT INT TERM HUP

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

cd "$PRODUCT_DIR"

swift package clean
swift test
swift build -c release --product audio-preflight
swift build -c release --product AudioDeliveryPreflightApp
swift run audio-preflight version

GENERATED_FIXTURE="$VERIFY_TMP/generated-valid-digital-release"
swift "$SCRIPT_DIR/generate-valid-digital-release-fixture.swift" "$GENERATED_FIXTURE"
(
    cd "$FIXTURE_DIR"
    /usr/bin/find . -type f -print0 | /usr/bin/sort -z | /usr/bin/xargs -0 /usr/bin/shasum -a 256
) > "$VERIFY_TMP/committed-fixture.sha256"
(
    cd "$GENERATED_FIXTURE"
    /usr/bin/find . -type f -print0 | /usr/bin/sort -z | /usr/bin/xargs -0 /usr/bin/shasum -a 256
) > "$VERIFY_TMP/generated-fixture.sha256"
/usr/bin/cmp "$VERIFY_TMP/committed-fixture.sha256" "$VERIFY_TMP/generated-fixture.sha256"

snapshot_directory "$FIXTURE_DIR" "$VERIFY_TMP/source-before.tsv"
REPORT_DIR="$VERIFY_TMP/reports"
mkdir -p "$REPORT_DIR"
"$PRODUCT_DIR/.build/release/audio-preflight" scan "$FIXTURE_DIR" \
    --preset digital-release \
    --report-html "$REPORT_DIR/report.html" \
    --report-json "$REPORT_DIR/report.json" \
    --checksums "$REPORT_DIR/SHA256SUMS.txt"
snapshot_directory "$FIXTURE_DIR" "$VERIFY_TMP/source-after.tsv"
/usr/bin/cmp "$VERIFY_TMP/source-before.tsv" "$VERIFY_TMP/source-after.tsv"

/usr/bin/grep -E -q -- '"overallStatus" : "ready"' "$REPORT_DIR/report.json"
/usr/bin/grep -E -q -- '"relativePath" : "Masters\\/Main Master.wav"' "$REPORT_DIR/report.json"
/usr/bin/grep -E -q -- '"sampleRate" : 48000' "$REPORT_DIR/report.json"
/usr/bin/grep -E -q -- '"pcmBitDepth" : 24' "$REPORT_DIR/report.json"
/usr/bin/grep -E -q -- '"pixelWidth" : 3000' "$REPORT_DIR/report.json"
/usr/bin/grep -E -q -- '"pixelHeight" : 3000' "$REPORT_DIR/report.json"
/usr/bin/grep -F -q -- 'Masters/Main Master.wav' "$REPORT_DIR/report.html"

EXPECTED_MANIFEST="$VERIFY_TMP/expected-SHA256SUMS.txt"
(
    cd "$FIXTURE_DIR"
    /usr/bin/find . -type f ! -name '.DS_Store' ! -name '._*' -print0 \
        | /usr/bin/sort -z \
        | while IFS= read -r -d '' manifest_file; do
            manifest_digest=$(/usr/bin/shasum -a 256 "$manifest_file" | /usr/bin/awk '{print $1}')
            /usr/bin/printf '%s  %s\n' "$manifest_digest" "${manifest_file#./}"
        done
) > "$EXPECTED_MANIFEST"
/usr/bin/cmp "$EXPECTED_MANIFEST" "$REPORT_DIR/SHA256SUMS.txt"

if /usr/bin/grep -R -F -q -- "$FIXTURE_DIR" "$REPORT_DIR"; then
    print -u2 -- "A report exposed the absolute fixture path."
    exit 1
fi

afinfo "$FIXTURE_DIR/Masters/Main Master.wav" > "$VERIFY_TMP/afinfo.txt"
sips -g pixelWidth -g pixelHeight "$FIXTURE_DIR/Artwork/Cover.png" > "$VERIFY_TMP/sips.txt"
/usr/bin/grep -E -q -- '2 ch' "$VERIFY_TMP/afinfo.txt"
/usr/bin/grep -E -q -- '48000 Hz' "$VERIFY_TMP/afinfo.txt"
/usr/bin/grep -E -q -- '24-bit .*integer' "$VERIFY_TMP/afinfo.txt"
/usr/bin/grep -E -q -- 'pixelWidth: 3000' "$VERIFY_TMP/sips.txt"
/usr/bin/grep -E -q -- 'pixelHeight: 3000' "$VERIFY_TMP/sips.txt"

AAC_BASE64='AAAAHGZ0eXBNNEEgAAACAE00QSBpc29taXNvMgAAAtZtb292AAAAbG12aGQAAAAAAAAAAAAAAAAAAAPoAAAAZAABAAABAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAACJXRyYWsAAABcdGtoZAAAAAMAAAAAAAAAAAAAAAEAAAAAAAAAZAAAAAAAAAAAAAAAAQEAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAACRlZHRzAAAAHGVsc3QAAAAAAAAAAQAAAGQAAAQAAAEAAAAAAZ1tZGlhAAAAIG1kaGQAAAAAAAAAAAAAAAAAAKxEAAAVOlXEAAAAAAAtaGRscgAAAAAAAAAAc291bgAAAAAAAAAAAAAAAFNvdW5kSGFuZGxlcgAAAAFIbWluZgAAABBzbWhkAAAAAAAAAAAAAAAkZGluZgAAABxkcmVmAAAAAAAAAAEAAAAMdXJsIAAAAAEAAAEMc3RibAAAAGpzdHNkAAAAAAAAAAEAAABabXA0YQAAAAAAAAABAAAAAAAAAAAAAQAQAAAAAKxEAAAAAAA2ZXNkcwAAAAADgICAJQABAASAgIAXQBUAAAAAAPoAAAAGFgWAgIAFEghW5QAGgICAAQIAAAAgc3R0cwAAAAAAAAACAAAABQAABAAAAAABAAABOgAAABxzdHNjAAAAAAAAAAEAAAABAAAABgAAAAEAAAAUc3RzegAAAAAAAAAEAAAABgAAABRzdGNvAAAAAAAAAAEAAAMCAAAAGnNncGQBAAAAcm9sbAAAAAIAAAAB//8AAAAcc2JncAAAAAByb2xsAAAAAQAAAAYAAAABAAAAPXVkdGEAAAA1bWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAbWRpcmFwcGwAAAAAAAAAAAAAAAAIaWxzdAAAAAhmcmVlAAAAIG1kYXQBGCAHARggBwEYIAcBGCAHARggBwEYIAc='
AAC_FIXTURE="$VERIFY_TMP/synthetic-aac.m4a"
/usr/bin/printf '%s' "$AAC_BASE64" | /usr/bin/base64 -D > "$AAC_FIXTURE"
/usr/bin/printf '%s  %s\n' \
    'f995d9f26e1ea62f9f3a12e6569f870e28b25a0d1ee3da9169076a8137aed089' \
    "$AAC_FIXTURE" > "$VERIFY_TMP/synthetic-aac.expected"
/usr/bin/shasum -a 256 -c "$VERIFY_TMP/synthetic-aac.expected"

RENAMED_AAC_DIR="$VERIFY_TMP/renamed-aac-digital-release"
/bin/cp -R "$FIXTURE_DIR" "$RENAMED_AAC_DIR"
/bin/cp "$AAC_FIXTURE" "$RENAMED_AAC_DIR/Masters/Main Master.wav"
snapshot_directory "$RENAMED_AAC_DIR" "$VERIFY_TMP/renamed-aac-before.tsv"
RENAMED_AAC_REPORT="$VERIFY_TMP/renamed-aac.json"
if "$PRODUCT_DIR/.build/release/audio-preflight" scan "$RENAMED_AAC_DIR" \
    --preset digital-release \
    --report-json "$RENAMED_AAC_REPORT" \
    > "$VERIFY_TMP/renamed-aac.stdout" \
    2> "$VERIFY_TMP/renamed-aac.stderr"; then
    RENAMED_AAC_EXIT=0
else
    RENAMED_AAC_EXIT=$?
fi
snapshot_directory "$RENAMED_AAC_DIR" "$VERIFY_TMP/renamed-aac-after.tsv"
/usr/bin/cmp "$VERIFY_TMP/renamed-aac-before.tsv" "$VERIFY_TMP/renamed-aac-after.tsv"
if (( RENAMED_AAC_EXIT != 2 )); then
    print -u2 -- "Renamed AAC release probe returned exit $RENAMED_AAC_EXIT instead of 2."
    exit 1
fi
/usr/bin/grep -E -q -- '"overallStatus" : "requirementsNotMet"' "$RENAMED_AAC_REPORT"
/usr/bin/grep -E -q -- '"container" : "M4A"' "$RENAMED_AAC_REPORT"
/usr/bin/grep -E -q -- '"encoding" : "AAC"' "$RENAMED_AAC_REPORT"
/usr/bin/grep -E -q -- '"ruleID" : "audio.filename-content-mismatch"' "$RENAMED_AAC_REPORT"
/usr/bin/grep -E -q -- '"ruleID" : "role.disallowed-encoding.main-master"' "$RENAMED_AAC_REPORT"
if /usr/bin/grep -E -q -- '"ruleID" : "inspection.audio-unreadable"' "$RENAMED_AAC_REPORT"; then
    print -u2 -- "Renamed AAC release probe reported an unreadable-audio conflict."
    exit 1
fi

CUSTOM_AAC_DIR="$VERIFY_TMP/custom-any-category-aac"
mkdir -p "$CUSTOM_AAC_DIR"
/bin/cp "$AAC_FIXTURE" "$CUSTOM_AAC_DIR/Main.m4a"
CUSTOM_PRESET="$VERIFY_TMP/custom-any-category.json"
/usr/bin/tee "$CUSTOM_PRESET" > /dev/null <<'JSON'
{
  "schemaVersion": "1.0",
  "identifier": "adversarial-any-role",
  "name": "Adversarial Any Role",
  "audio": {
    "requireConsistentSampleRate": false,
    "requireConsistentBitDepth": false,
    "requireConsistentChannelCount": false,
    "severity": "warning"
  },
  "artwork": null,
  "filename": {
    "ambiguousVersionPattern": null,
    "ambiguousVersionSeverity": "warning"
  },
  "roles": [
    {
      "identifier": "main",
      "name": "Main",
      "pattern": ".*",
      "required": true,
      "category": null,
      "allowedExtensions": null,
      "allowedEncodings": ["Linear PCM"],
      "channelCount": null,
      "sampleRate": null,
      "bitDepth": null,
      "readability": "warning",
      "severity": "error",
      "ambiguitySeverity": "warning"
    }
  ],
  "serviceFileSeverity": "information",
  "symbolicLinkSeverity": "warning",
  "exactDuplicateSeverity": "warning"
}
JSON
snapshot_directory "$CUSTOM_AAC_DIR" "$VERIFY_TMP/custom-aac-before.tsv"
if "$PRODUCT_DIR/.build/release/audio-preflight" scan "$CUSTOM_AAC_DIR" \
    --preset-file "$CUSTOM_PRESET" \
    > "$VERIFY_TMP/custom-aac.stdout" \
    2> "$VERIFY_TMP/custom-aac.stderr"; then
    CUSTOM_AAC_EXIT=0
else
    CUSTOM_AAC_EXIT=$?
fi
snapshot_directory "$CUSTOM_AAC_DIR" "$VERIFY_TMP/custom-aac-after.tsv"
/usr/bin/cmp "$VERIFY_TMP/custom-aac-before.tsv" "$VERIFY_TMP/custom-aac-after.tsv"
if (( CUSTOM_AAC_EXIT != 2 && CUSTOM_AAC_EXIT != 3 )); then
    print -u2 -- "Invalid Custom-role release probe returned exit $CUSTOM_AAC_EXIT instead of 2 or 3."
    exit 1
fi
if /usr/bin/grep -F -q -- 'Status: ready' "$VERIFY_TMP/custom-aac.stdout"; then
    print -u2 -- "Invalid Custom-role release probe returned a ready status."
    exit 1
fi

print -- "Fixture provenance: generated bytes match committed bytes."
print -- "Digital Release CLI: ready; HTML, JSON, and SHA-256 reports verified."
print -- "Source immutability: SHA-256, size, subsecond mtime, and mode unchanged."
print -- "Trusted tools: afinfo and sips agree with reported fixture properties."
print -- "Adversarial release probes: renamed AAC exits 2; invalid Custom role exits $CUSTOM_AAC_EXIT; sources unchanged."
