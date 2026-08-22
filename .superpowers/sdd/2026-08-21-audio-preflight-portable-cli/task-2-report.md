# Task 2 Report: Presets, Findings, Reports, and CLI

## Outcome

Implemented the portable Go CLI Task 2 scope in `products/audio-delivery-preflight-cli/` while preserving Task 1's fail-closed inventory behavior. Task 2 deliberately extends the approved media interface with `MediaEvidence.Readable` and adds the source-size argument to internal media inspection so bounded header metadata cannot be mistaken for positive payload readability. This extension adds `inventory.entries[].media.readable` to the Task 2 JSON report schema.

## Delivered

- Commands:
  - `audio-preflight scan <folder> [--preset <id>] [--report-html <new-path>] [--report-json <new-path>] [--checksums <new-path>]`
  - `audio-preflight presets`
  - `audio-preflight preset show <id>`
  - `audio-preflight version`
- Built-in presets only: `general-audio`, `stereo-premaster`, and `digital-release`.
- Explicit exit codes: ready `0`, warnings `1`, requirements-not-met `2`, invalid command/configuration `3`, scan-start failure `4`, and internal/export failure `5`.
- Conservative technical findings for unreadable required media, unsupported required lossless evidence, non-stereo premaster candidates, missing/ambiguous roles, Digital Release artwork dimensions/square shape, duplicates, symbolic links, case-insensitive collisions, ambiguous version markers, filename/content mismatch, and inspectable-property consistency.
- Stable JSON report schema version `1.0`, without absolute source-root paths.
- Self-contained, escaped, semantic HTML report with textual severity labels and accessible sections/tables.
- Deterministic SHA-256 manifest for regular files, ordered by portable relative path.
- Report destinations are explicit, distinct, absent, and created through non-symlink parent paths using handle-relative Unix operations and exclusive creation. The CLI does not create destination directories or overwrite reports.
- Custom preset-file import remains explicitly unavailable; no untrusted preset schema was added.
- Customer-facing CLI documentation is in `products/audio-delivery-preflight-cli/README.md`.

## Test-first evidence

Task 2 behavior was introduced through failing tests before implementation:

- Preset inventory and immutable returned preset definitions.
- Required-role and unreadable-premaster outcomes.
- Stable, path-redacted JSON and escaped accessible HTML.
- Deterministic manifest ordering.
- Existing, duplicate, and symlink-parent report destination rejection.
- CLI commands, all completed-status exit codes, scan-start failure, export behavior, overwrite rejection, version output, and deferred custom import.

## Final verification — 2026-08-21

Executed from `products/audio-delivery-preflight-cli/`:

```text
go test ./...                                                     PASS
go test -race ./...                                               PASS
go vet ./...                                                      PASS
gofmt -d preflight/scan.go preflight/reports.go                   PASS (no output)
  preflight/report_destination_unix.go preflight/scan_test.go
  cmd/audio-preflight/main.go cmd/audio-preflight/main_test.go
GOOS=linux GOARCH=amd64 go build -trimpath                        PASS
  -o /private/tmp/audio-preflight-cli-task2-linux-amd64
  ./cmd/audio-preflight
```

## Scope and remaining limits

- No source delivery file is edited, no source report is overwritten, and no symbolic link in the selected inventory tree is followed.
- No shop, payment, provider, deployment, publication, or push action occurred.
- Windows support remains deferred because the fail-closed report-destination implementation is intentionally scoped to macOS and Linux.
- On macOS, a destination expressed through a symlinked parent such as the `/var` alias is rejected; use the physical `/private/...` path. This is the intended fail-closed behavior.

## Fix round 1 status — incomplete, 2026-08-21

This correction round is intentionally **not committed**. New regression work has been preserved in the worktree without weakening tests.

### Corrected in the preserved worktree

- `MediaEvidence` now carries explicit positive `readable` evidence, separate from bounded header/property extraction.
- Header-only or truncated WAV, AIFF, FLAC, PNG, JPEG, GIF, and TIFF regression fixtures no longer claim positive readability.
- Required Digital Release WAV and PNG header-only fixtures now return requirements-not-met rather than ready.
- Ambiguous main-master candidates are each evaluated, including unreadable candidates.
- Stereo Premaster candidates are restricted to the eligible lossless-role extensions, excluding unrelated MP3 references from the required role.
- General Audio now checks bit-depth consistency when it has positive evidence.
- `.aifc` expects the `AIFC` container rather than `AIFF`.
- The HTML report now exposes schema/timestamps, resolved requirements, assignments/evidence, media evidence and unavailable reasons, and symbolic-link targets.

### Remaining required corrections

1. CLI configuration must be validated before source-root access: current regression tests prove unknown presets, existing report destinations, and destinations inside the selected tree still return scan-start `4` rather than invalid-configuration `3` when the root is missing.
2. Existing CLI ready/export fixtures still use a header-only WAV and now correctly return warnings. The fixture must be made a genuine PCM payload before its ready expectation can remain valid.
3. Multi-report export remains non-transactional: it must retain validated parent descriptors, use no-overwrite handle-relative finalization, roll back every created artifact after any later failure, and receive deterministic collision and ancestor-replacement race tests.
4. The CLI must reject requested report paths below the selected root before scanning, preserving the selected-tree read-only snapshot boundary.
5. Root-open/permission and inventory-stability failures still need explicit scan-start/incomplete `4` classification; unexpected write/sync faults must remain `5`.

### Fresh gate evidence

```text
go test ./... -count=1                                      FAIL
go test -race ./... -count=1                                FAIL
  Both fail only in cmd/audio-preflight:
  - ready/export fixture receives warnings because its WAV is header-only
  - configuration-before-root-access regressions receive 4, not required 3
go vet ./...                                                PASS
gofmt -d (all changed Task 2 Go files)                      PASS (no output)
GOOS=linux GOARCH=amd64 go build -trimpath ./cmd/audio-preflight
                                                              PASS
```

## Fix round 2 completion — 2026-08-21

The residuals above are now resolved. This section supersedes the incomplete
round-1 checkpoint while retaining it as an audit record.

### Corrections completed

- CLI configuration is resolved before opening or inspecting the source root:
  unknown presets, duplicate/existing destinations, and destinations inside
  the lexical selected tree return invalid-configuration exit `3` even when
  the source root is absent or inaccessible.
- Report destinations inside the selected source tree are rejected before the
  inventory scan. This keeps the source snapshot immutable and prevents a
  report write from invalidating it.
- Multi-report export is transactional. Validated parent directories remain
  held by no-follow descriptors; temporary reports are written and synced
  relative to those descriptors, then published with no-overwrite
  handle-relative operations. A late collision or write/sync error removes
  only this run's artifacts and leaves no partial report set.
- Deterministic regression tests cover a late destination collision, an
  ancestor-directory replacement race, and an injected unexpected write
  failure. The replacement race can affect only the moved, held directory,
  never the attacker-controlled replacement path.
- Source-root open and inventory/stability errors map to scan-incomplete exit
  `4`; unexpected report write or sync errors map to internal/export exit `5`.
- The formerly header-only ready/export WAV fixture now contains a valid PCM
  payload. All false-ready regressions for header-only and truncated required
  WAV, AIFF, FLAC, PNG, JPEG, GIF, and TIFF media remain in place.

### Final self-review

- Required role readiness depends on explicit positive payload-readability
  evidence, rather than header metadata alone. Ambiguous candidates each
  receive role-property validation.
- Stereo Premaster matching accepts only eligible lossless audio extensions;
  unrelated reference audio cannot become a required role candidate.
- General Audio includes positive bit-depth consistency evidence, and `.aifc`
  is checked against `AIFC` rather than `AIFF`.
- JSON remains schema-stable and root-path redacted. The self-contained HTML
  exposes timestamps/schema, resolved requirements, assignments and evidence,
  media measurements/unavailable reasons, and symbolic-link targets.
- The exported-report path handling preserves absent, distinct destinations,
  rejects symlinked parents, never overwrites, and is scoped to Unix
  macOS/Linux behavior.

### Final verification — 2026-08-21

Executed from `products/audio-delivery-preflight-cli/` after the corrections:

```text
go test ./... -count=1                                      PASS
go test -race ./... -count=1                                PASS
go vet ./...                                                PASS
gofmt -d (all changed Task 2 Go files)                      PASS (no output)
GOOS=linux GOARCH=amd64 go build -trimpath                  PASS
  -o /private/tmp/audio-preflight-cli-fix-round-2-linux-amd64
  ./cmd/audio-preflight
git diff --check                                             PASS
```

## Fix round 4 correction — 2026-08-21

- Stereo Premaster and Digital Release now describe and require readable PCM
  audio only in version 1. Their descriptions and resolved requirements state
  that FLAC STREAMINFO metadata is inventoried but cannot satisfy a required
  role until complete frame, payload, and CRC validation exists.
- The Digital Release README wording now says `readable PCM main master`, not
  a generic lossless master, and repeats the same FLAC inventory-only limit.
- A command-boundary regression invokes `audio-preflight preset show` for both
  affected presets and rejects output that advertises `PCM or FLAC` required-
  role eligibility.

### Fix round 4 final verification — 2026-08-21

Executed from `products/audio-delivery-preflight-cli/`:

```text
go test ./... -count=1                                      PASS
go test -race ./... -count=1                                PASS
go vet ./...                                                PASS
gofmt -d (all changed Task 2 Go files)                      PASS (no output)
GOOS=linux GOARCH=amd64 go build -trimpath                  PASS
  -o /private/tmp/audio-preflight-cli-fix-round-4-linux-amd64
  ./cmd/audio-preflight
git diff --check                                             PASS
```

### Remaining limits

- The Linux artifact was cross-compiled, not executed on a Linux host.
- Windows remains intentionally unsupported until it has an equivalently
  fail-closed report-destination implementation.
- macOS symlinked destination parents (including the `/var` alias) are
  rejected; callers must use the physical no-symlink path such as
  `/private/...`.

## Fix round 3 corrections — 2026-08-21

- FLAC retains only proven STREAMINFO metadata in version 1. It now always
  records `readable=false` and an unavailable reason for required-role
  purposes, including complete reference files, until complete frame,
  subframe/payload, and CRC validation is implemented. Regressions cover a
  two-byte marker, truncated frame header, truncated payload, and a complete
  libFLAC reference file.
- The source-tree report boundary retains its lexical pre-root rejection for
  missing/inaccessible roots, then compares opened descriptor identities and
  physical ancestry before inventory. Equivalent aliases such as `/tmp` and
  `/private/tmp` cannot place reports into the selected physical source tree.
- Export verifies that every requested parent path still binds to the held
  no-follow descriptor before publication, then reopens it after publication
  to verify both the binding and final report identity. Ancestor replacement
  triggers identity-safe rollback through the held descriptor and a non-success
  configuration result.
- This report now explicitly discloses the deliberate `MediaEvidence.Readable`
  and internal inspection-call extension; it no longer claims Task 1's media
  interface was unchanged.

### Fix round 3 final verification — 2026-08-21

Executed from `products/audio-delivery-preflight-cli/` after the round-3
corrections:

```text
go test ./... -count=1                                      PASS
go test -race ./... -count=1                                PASS
go vet ./...                                                PASS
gofmt -d (all changed Task 2 Go files)                      PASS (no output)
GOOS=linux GOARCH=amd64 go build -trimpath                  PASS
  -o /private/tmp/audio-preflight-cli-fix-round-3-linux-amd64
  ./cmd/audio-preflight
git diff --check                                             PASS
```

## Fix round 5 correction — 2026-08-21

- Required-audio findings for unreadable evidence and disallowed encodings now
  state readable PCM-only version-1 expectations and remediation. They explain
  that FLAC STREAMINFO metadata remains inventory-only until complete frame,
  payload, and CRC validation exists.
- A regression covers both analysis branches and serializes their real findings
  to JSON and self-contained HTML, rejecting every prior `PCM or FLAC` role-
  eligibility recommendation.

### Fix round 5 final verification — 2026-08-21

Executed from `products/audio-delivery-preflight-cli/`:

```text
go test ./... -count=1                                      PASS
go test -race ./... -count=1                                PASS
go vet ./...                                                PASS
gofmt -d (all changed Task 2 Go files)                      PASS (no output)
GOOS=linux GOARCH=amd64 go build -trimpath                  PASS
  -o /private/tmp/audio-preflight-cli-fix-round-5-linux-amd64
  ./cmd/audio-preflight
git diff --check                                             PASS
```
