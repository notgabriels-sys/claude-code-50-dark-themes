# Task 3 report: cross-platform private-candidate packaging

Date: 2026-08-21
Scope: Audio Delivery Preflight CLI Task 3 only

## Outcome

Implemented reproducible, non-publishing private-candidate packaging for the
CLI targets `darwin-arm64`, `darwin-amd64`, and `linux-amd64`. The existing
Swift/macOS candidate documentation and every live shop/payment surface were
left unchanged.

The generated archive name is deliberately
`audio-preflight-cli-private-candidate_<version>_<platform>.tar.gz`. It is not
public or customer-ready. It may include the clearly named
`CUSTOMER_LICENSE_DRAFT.md` only for controlled review. Final license text,
seller identity, governing terms, Gumroad object creation, checkout validation,
and publication remain owner-controlled gates.

## Delivered Task 3 surface

- `internal/release`: deterministic `tar.gz` construction and stream-only
  verification.
- `cmd/release-package` and `scripts/package.sh`: builds a target with Go
  `-trimpath`, disabled VCS stamping, fixed linker build ID, deterministic tar
  metadata, and an archive sidecar SHA-256 file.
- `cmd/verify-archive` and `scripts/verify-archive.sh`: validates a candidate
  without extracting archive members.
- Candidate archive contents: executable, README, privacy notice, limitations,
  draft customer license, examples, SHA-256 instructions, release manifest,
  and `SHA256SUMS.txt`.
- `.github/workflows/verify.yml`: Linux test, race, format, and static-analysis
  gates plus build-and-verify steps for all three targets. The workflow does
  not upload, tag, release, or publish artifacts.
- CLI-only EUR 19 product decisions and release checklist, separate from the
  existing Swift candidate documents.

## Archive-verifier security contract

The verifier rejects unsafe or inconsistent archives before extraction:

- absolute, parent-traversal, backslash, duplicate, and out-of-root paths;
- symlinks, hard links, directories other than the single required root, and
  all non-regular archive members;
- missing or unexpected files;
- wrong root, private-candidate filename, manifest version, platform, release
  status, or executable name;
- wrong required file modes, including executable mode other than `0755`;
- an executable header that does not match the declared macOS arm64, macOS
  amd64, or Linux amd64 target;
- oversized members/control files; and
- malformed, incomplete, duplicate, self-referential, or mismatched SHA-256
  manifest entries.

## Test-first evidence

- The initial archive construction test was run red before the release API
  existed, then green after the minimal implementation.
- The draft-license loader test was run red before `LoadDocuments` existed,
  then green after the loader required `CUSTOMER_LICENSE_DRAFT.md`.
- Whole-diff review identified that metadata, naming, and permissions alone did
  not independently establish executable platform. A regression test proving a
  Darwin executable could pass as `linux-amd64` was run red, then green after
  Mach-O/ELF architecture validation was added.
- Adversarial tests cover traversal, symlinks, missing required files, wrong
  executable mode, and checksum tampering.

## Local checks observed

Before final commit, the following commands were run successfully from
`products/audio-delivery-preflight-cli`:

```text
go test ./...
go test -race ./...
go vet ./...
gofmt check
git diff --check
```

Local packaging and archive verification succeeded for all declared targets:

```text
darwin-arm64
darwin-amd64
linux-amd64
```

The final gate rebuilt `darwin-arm64` twice into separate fresh directories.
Both `.tar.gz` archives and their sidecar checksum files compared byte-for-byte
identical. All three final archives also passed their sidecar checksum checks.

The `darwin-arm64` candidate was also extracted to a separate temporary
location. Its internal checksums passed; `audio-preflight version` returned
`1.0.0`; the built-in preset list was present; and a Digital Release scan of
the existing valid fixture completed with `Status: ready` and zero findings.

## Whole-diff review

Review dimensions: archive traversal/link handling, metadata consistency,
checksum coverage, executable permissions and platform evidence, deterministic
generation, CI publication boundary, documentation claims, and owner-only
commercial/legal gates.

One issue was found and fixed during this review: the first verifier revision
did not inspect the executable binary header. The final revision validates the
Mach-O/ELF header and target CPU architecture against the declared platform.
No unresolved correctness, security, or publication-boundary issue was found
in the Task 3 diff.

## Known limits and remaining owner gates

- GitHub Actions has been configured but has not run in this local task; CI
  status is unknown until GitHub executes the workflow.
- `darwin-amd64` and `linux-amd64` were cross-built and archive-verified
  locally, but not executed on matching target hosts in this task.
- No Windows target is supplied.
- The license remains a draft; seller legal identity, governing terms,
  consumer information, and final seller acceptance remain open.
- No Gumroad product, payment object, checkout, zero-charge order, upload,
  shop button, tag, release, or publication was created or verified.

## Commit boundary

This report is committed only with the Task 3 packaging, CI, documentation,
and checklist changes after the final local gates pass. It does not make the
candidate public or customer-ready.
