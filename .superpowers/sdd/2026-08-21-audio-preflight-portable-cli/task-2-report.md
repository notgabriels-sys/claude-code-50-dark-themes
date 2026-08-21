# Task 2 Report: Presets, Findings, Reports, and CLI

## Outcome

Implemented the portable Go CLI Task 2 scope in `products/audio-delivery-preflight-cli/` without changing the approved Task 1 inventory and media-inspection interface.

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
