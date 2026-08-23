#!/bin/zsh
set -euo pipefail

input_path=""
requested_identity=""

usage() {
    print -u2 -- "usage: select-developer-id-identity.sh [--requested <sha1-or-exact-name>] [--input <security-output-file>]"
}

fail() {
    print -u2 -- "Developer ID identity selection failed: $1"
    exit ${2:-65}
}

while (( $# > 0 )); do
    case "$1" in
        --requested)
            (( $# >= 2 )) || { usage; exit 64; }
            [[ -z "$requested_identity" ]] \
                || fail "--requested may be provided only once" 64
            requested_identity=$2
            shift 2
            ;;
        --input)
            (( $# >= 2 )) || { usage; exit 64; }
            [[ -z "$input_path" ]] \
                || fail "--input may be provided only once" 64
            input_path=$2
            shift 2
            ;;
        *)
            usage
            exit 64
            ;;
    esac
done

if [[ -n "$input_path" ]]; then
    [[ -f "$input_path" && ! -L "$input_path" ]] \
        || fail "identity input must be a regular non-symbolic-link file" 66
    input_size=$(/usr/bin/stat -f '%z' "$input_path")
    (( input_size <= 1048576 )) \
        || fail "identity input exceeds the 1 MiB parsing limit" 65
    identity_output=$(<"$input_path")
else
    if ! identity_output=$(/usr/bin/security find-identity -v -p codesigning 2>&1); then
        fail "the macOS keychain identity query failed" 69
    fi
fi

typeset -a identity_hashes
typeset -a identity_names
identity_pattern='^[[:space:]]*[0-9]+\)[[:space:]]+([[:xdigit:]]{40})[[:space:]]+"(Developer ID Application: [^"]+)"[[:space:]]*$'

while IFS= read -r identity_line; do
    if [[ "$identity_line" =~ $identity_pattern ]]; then
        identity_hashes+=("${match[1]:u}")
        identity_names+=("${match[2]}")
    fi
done <<< "$identity_output"

(( ${#identity_hashes} > 0 )) \
    || fail "no valid Developer ID Application identities found"

if [[ -z "$requested_identity" ]]; then
    (( ${#identity_hashes} == 1 )) \
        || fail "more than one valid Developer ID Application identity found; select one by full SHA-1 hash or exact certificate name"
    print -r -- "$identity_hashes[1]"
    exit 0
fi

requested_hash=""
if [[ "$requested_identity" =~ '^[[:xdigit:]]{40}$' ]]; then
    requested_hash=${requested_identity:u}
fi

typeset -a matching_hashes
for index in {1..${#identity_hashes}}; do
    if [[ -n "$requested_hash" ]]; then
        [[ "$identity_hashes[$index]" == "$requested_hash" ]] \
            && matching_hashes+=("$identity_hashes[$index]")
    elif [[ "$identity_names[$index]" == "$requested_identity" ]]; then
        matching_hashes+=("$identity_hashes[$index]")
    fi
done

(( ${#matching_hashes} == 1 )) \
    || fail "requested Developer ID Application identity was not found uniquely"
print -r -- "$matching_hashes[1]"
