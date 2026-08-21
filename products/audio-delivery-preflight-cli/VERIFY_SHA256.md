# Verify a private candidate archive

This document applies to a **private candidate**, not a public or
customer-ready release. The archive's own filename must contain
`private-candidate` and the included license must remain
`CUSTOMER_LICENSE_DRAFT.md`.

Before extracting, calculate the archive digest and compare it with the
separately supplied `.sha256` file from the same controlled handoff:

```sh
shasum -a 256 audio-preflight-cli-private-candidate_1.0.0_darwin-arm64.tar.gz
# Linux alternative: sha256sum audio-preflight-cli-private-candidate_1.0.0_linux-amd64.tar.gz
```

Extract only after the archive digest matches the separately supplied value:

```sh
tar -xzf audio-preflight-cli-private-candidate_1.0.0_darwin-arm64.tar.gz
cd audio-preflight-cli-1.0.0-darwin-arm64
shasum -a 256 -c SHA256SUMS.txt
# Linux alternative: sha256sum -c SHA256SUMS.txt
```

`SHA256SUMS.txt` validates every included regular file except itself. The
release verifier also rejects traversal paths, symlinks, hard links, missing
required files, incorrect permissions, checksum mismatches, and inconsistent
candidate metadata without extracting the archive.
