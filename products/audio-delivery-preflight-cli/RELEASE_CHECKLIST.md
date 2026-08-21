# Release checklist: Audio Delivery Preflight CLI 1.0.0

Opened: 2026-08-21
Owner: Gabriel Garcia Alonso

This checklist keeps repository checks, private candidate archives, customer
delivery, and public commercial release separate. Nothing in the first two
sections authorizes publication.

## Build and private-candidate verification

- [ ] Confirm the exact source commit and clean worktree.
- [ ] Run `go test ./...`, `go test -race ./...`, `go vet ./...`, and `gofmt -d`.
- [ ] Build each declared target with the reproducible packaging command.
- [ ] Verify each generated private candidate without extracting it.
- [ ] Record archive and sidecar SHA-256 values with the source commit.
- [ ] From a separate location, extract and run the matching local-platform
      executable through `version`, `presets`, and a safe fixture scan.
- [ ] Read the CI run that tests Linux, static/race gates where supported, and
      builds plus verifies all three private candidates.

## Documentation and legal gates

- [ ] Review the README, privacy notice, limitations, examples, and checksum
      instructions against the exact artifacts.
- [ ] Gabriel reviews and accepts the final seller legal identity, governing
      law, consumer information, and customer license; only then rename the
      license for a final archive.
- [ ] Rebuild and verify any final archive after that accepted-text change.

## Owner-controlled commercial gates

- [ ] Gabriel creates the Gumroad product in the intended seller account.
- [ ] Read back the real product name, EUR 19 amount, currency, tax treatment,
      attachment, and customer-delivery settings.
- [ ] Confirm checkout copy matches the final product and platform limits.
- [ ] Gabriel explicitly authorizes a zero-charge purchase at that time.
- [ ] Download independently, compare the delivered archive checksum, extract,
      and run the matching platform smoke test.
- [ ] Add a public shop button or publish only after every preceding gate is
      satisfied.

## Rollback triggers

Do not publish, or disable a future listing, if an archive fails verification,
the delivered checksum differs, the wrong platform binary is attached, a source
file is modified or followed unexpectedly, an invalid delivery is reported
ready, or any checkout amount, currency, tax, seller, or attachment differs
from the approved provider object.
