#!/bin/zsh
set -euo pipefail

script_dir=${0:A:h}
selector="$script_dir/select-developer-id-identity.sh"
test_root=$(mktemp -d /private/tmp/audio-preflight-developer-id-test.XXXXXX)

cleanup() {
    /bin/rm -rf -- "$test_root"
}
trap cleanup EXIT INT TERM HUP

fail() {
    print -u2 -- "Developer ID selector contract failed: $1"
    exit 1
}

single_fixture="$test_root/single.txt"
multiple_fixture="$test_root/multiple.txt"
zero_fixture="$test_root/zero.txt"
malformed_fixture="$test_root/malformed.txt"

print -r -- '  1) 1111111111111111111111111111111111111111 "Apple Development: Example Developer (ABCDE12345)"' > "$single_fixture"
print -r -- '  2) AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA "Developer ID Application: Example Developer (ABCDE12345)"' >> "$single_fixture"
print -r -- '     2 valid identities found' >> "$single_fixture"

print -r -- '  1) BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB "Developer ID Application: Example Developer (ABCDE12345)"' > "$multiple_fixture"
print -r -- '  2) CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC "Developer ID Application: Example Company (FGHIJ67890)"' >> "$multiple_fixture"
print -r -- '     2 valid identities found' >> "$multiple_fixture"

print -r -- '     0 valid identities found' > "$zero_fixture"

print -r -- '  1) NOT-A-SHA1 "Developer ID Application: Malformed Example (ABCDE12345)"' > "$malformed_fixture"
print -r -- '     1 valid identities found' >> "$malformed_fixture"

expect_success() {
    local expected=$1
    local fixture=$2
    shift 2
    local output
    if ! output=$("$selector" --input "$fixture" "$@" 2> "$test_root/stderr"); then
        fail "expected success, got: $(<"$test_root/stderr")"
    fi
    [[ "$output" == "$expected" ]] \
        || fail "expected selected identity $expected, got $output"
}

expect_failure() {
    local expected_message=$1
    local fixture=$2
    shift 2
    set +e
    "$selector" --input "$fixture" "$@" \
        > "$test_root/stdout" 2> "$test_root/stderr"
    local selector_exit=$?
    set -e
    (( selector_exit != 0 )) || fail "expected selector failure"
    /usr/bin/grep -F -q -- "$expected_message" "$test_root/stderr" \
        || fail "failure did not explain '$expected_message': $(<"$test_root/stderr")"
    [[ ! -s "$test_root/stdout" ]] \
        || fail "failed selection exposed an identity on standard output"
}

[[ -x "$selector" ]] || fail "missing executable selector: $selector"

expect_success \
    AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA \
    "$single_fixture"
expect_success \
    BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB \
    "$multiple_fixture" \
    --requested bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
expect_success \
    CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC \
    "$multiple_fixture" \
    --requested 'Developer ID Application: Example Company (FGHIJ67890)'

expect_failure 'no valid Developer ID Application identities found' "$zero_fixture"
expect_failure 'more than one valid Developer ID Application identity found' "$multiple_fixture"
expect_failure 'requested Developer ID Application identity was not found' \
    "$multiple_fixture" \
    --requested 'Example Company'
expect_failure 'no valid Developer ID Application identities found' "$malformed_fixture"

print -- "Developer ID identity-selection contract passed."
