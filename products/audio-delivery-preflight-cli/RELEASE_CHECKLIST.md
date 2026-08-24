# Release checklist: Audio Delivery Preflight CLI 1.0.0

Opened: 2026-08-21
Owner: Gabriel Garcia Alonso

This checklist keeps repository checks, private candidate archives, customer
delivery, and public commercial release separate. Nothing in the first two
sections authorizes publication.

Status update: 2026-08-24. Gumroad publication at EUR 19 and six customer files
were read back after duplicate-attachment cleanup. An independent paid or
zero-charge checkout-download smoke test is not recorded here.

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

- [x] Gabriel creates the Gumroad product in the intended seller account.
- [x] Read back the real product name, EUR 19 amount, currency,
      attachment, and customer-delivery settings.
- [x] Confirm public product page and owned landing page match the final product
      and platform limits.
- [ ] Gabriel explicitly authorizes a zero-charge or paid purchase at that time.
- [ ] Download independently, compare the delivered archive checksum, extract,
      and run the matching platform smoke test.
- [x] Add a public shop card and publish the Gumroad listing after owner
      confirmation.

## Rollback triggers

Do not publish, or disable a future listing, if an archive fails verification,
the delivered checksum differs, the wrong platform binary is attached, a source
file is modified or followed unexpectedly, an invalid delivery is reported
ready, or any checkout amount, currency, tax, seller, or attachment differs
from the approved provider object.
