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

## Final clean-commit evidence: 2026-08-22

The final private candidates were rebuilt from clean commit `dc49778`. Go
1.26.3 does not expose linker `-X` values through `debug/buildinfo`, so the
equivalent provenance mechanism is a unique marker linked into, retained by,
and byte-verified in each executable. The marker binds product version `1.0.0`
and exact clean source revision. The packager also rejects dirty or untracked
source state and verifies the committed version source before building.

Fresh normal tests, race tests, vet, formatting, and diff checks passed. The
race run included `internal/release` in 112.471 seconds. Three independently
verified private candidates were generated:

> **Superseded.** The hashes in the table below are the historical Task 3
> record for commit `dc49778` and are correct for that revision. They are not
> the current candidate hashes: `269671f` (test portability) and `c04f227` (CI
> output location) changed the source tree afterwards, so every candidate was
> rebuilt. The current hashes live in `private-artifact-manifest.md`. Do not
> quote the table below as current.

| Platform | Archive SHA-256 | Sidecar-file SHA-256 |
| --- | --- | --- |
| `darwin-arm64` | `8a66ff2f132d5a7958665e18442349fa4794cae4ba602fd103cd054982fc9bea` | `70808cba06838ad142cec25c33e948a67edc0d41b286a6c42cec3280721bf9f8` |
| `darwin-amd64` | `97d2a6d0534931b8535851e30e6e72c4042f721fb7a356bfdd8db52b49affdd4` | `b30a2c1e51cc790e95108cc9f843f6978e8ffdd7149c93e560c7865f12e4d261` |
| `linux-amd64` | `b3f5c9049978e33ea585bab4bc1cbeca17dce6797a48a995e7b1d218607c6d89` | `4f581b49a5dd0961e862b2d57acafb2f3ca964fab53ea40c917a9d284f682510` |

Two further clean `darwin-arm64` builds compared byte-for-byte identical for
both archive and sidecar. A separately extracted Apple Silicon candidate
passed every internal checksum, reported version `1.0.0`, listed all three
presets, and scanned the fresh extraction folder with General Audio as
`Status: ready`, 11 inventory entries, and zero findings.

These remain private candidates. GitHub Actions has not run, Intel macOS and
Linux binaries have not been executed on matching hosts, the license is still
a draft, and no upload, payment object, checkout, shop link, tag, release, or
publication was created.

Final independent review verdict: **Spec compliance APPROVED; Code quality
APPROVED; no remaining blocker.** The reviewer independently rechecked the
complete Task 3 range, exact executable provenance marker, mode-specific
documents, regression tests, archive hashes, sidecars, reproducibility copies,
full tests/race/vet/format/diff checks, unchanged shop/Swift surfaces, and the
private publication boundary.

## Fix round 1 checkpoint: 2026-08-21

The independent review was read in full. This uncommitted checkpoint adds a
single `internal/version` source (`1.0.0`, reviewed toolchain `go1.26.3`),
complete Mach-O/ELF parsing, Go build-info checks for command package, target,
build mode, CGO, trimpath, exact toolchain, source revision and runtime-version
provenance in the manifest, default private-candidate plus explicit
customer-release modes, canonical tar-header checks, bounded member sizes, and
staged hard-link publication of archive/checksum pairs. CI is pinned to Go
1.26.3 and compares two fresh arm64 archives.

Fresh local evidence for this checkpoint: `go test ./...`, `go test -race
./...`, `go vet ./...`, formatting, and diff checks passed. Fresh
`darwin-arm64`, `darwin-amd64`, and `linux-amd64` private candidates built and
passed verifier checks. Two fresh arm64 archives compared byte-identically.

This checkpoint is intentionally **not committed** as a completed review fix.
The remaining required work is explicit: add adversarial regression coverage
for every new mode/metadata/limit/transaction rule; bind version evidence to
the linked runtime value more strongly than a raw executable-byte occurrence;
reject trailing gzip/tar payload explicitly; run the owner-supplied final-mode
path only with a real accepted-license file when Gabriel provides one; and
update the public-facing verification instructions for the new provenance and
mode arguments. CI and target-host execution remain unverified external gates.

## Fix round 2 checkpoint: 2026-08-21

Round 2 replaces otherwise-valid archive fixtures with real Go executables
built using the exact release settings. The verifier requires a version-specific
`audio_preflight_v1_0_0` Go build tag in parsed build metadata, alongside the
expected command package, Go version, target, executable build mode, CGO and
trimpath settings. Host packaging continues to capture runtime `version` output
as an additional check. Synthetic tests cover draft/final mode separation and
trailing-payload rejection; no real owner-accepted license was used or treated
as accepted.

Fresh round-2 checks passed: full Go tests, race detector, vet, format/diff
checks, provenance-aware build and verification of all three private targets,
and a byte comparison of two fresh arm64 archives. README and checksum
instructions now document required source revision and explicit mode.

This remains an uncommitted checkpoint because the requested dedicated
adversarial tests for every canonical-metadata, count/size, and transactional
publication branch have not all been added yet. Customer-release remains a
tested synthetic path only and has not been exercised with real legal terms.

## Fix round 4 completion: 2026-08-21

Round 4 closes the remaining independent-review regressions without changing
the Task 3 commercial or publication boundary. The verifier now has dedicated
tests for setgid mode, sticky mode, extended attributes, member-count bounds,
cumulative expanded size, an unexpected oversized member rejected before its
body is consumed, and a highly compressible oversized document. The version
regression builds a real otherwise-valid Go `0.9.0` executable with the exact
reviewed toolchain, command package, target, build mode, CGO, and trimpath
settings; verification rejects it from a `1.0.0` archive through parsed Go
build-tag evidence.

Transactional publication has a narrow sidecar-file opener seam. Tests cover a
pre-existing archive, a pre-existing sidecar with archive rollback, injected
sidecar write failure, injected sidecar close failure, and successful complete
pair publication. Write and close fault tests were first observed failing
because a partial sidecar remained, then passed after failure cleanup was
implemented. Mutation checks also demonstrated that the dedicated setgid,
sticky-bit, and xattr tests fail when exact metadata enforcement is weakened,
and that the old-version test fails when executable version-tag validation is
removed. Each temporary mutation was restored before the final focused run.

### Fresh round-4 checks

The following checks passed on the restored final tree using the exact local
`go1.26.3 darwin/arm64` toolchain:

```text
go test -count=1 -v ./internal/release ./cmd/release-package
go test -count=1 ./...
go test -count=1 -race ./...
go vet ./...
gofmt file-list check
git diff --check
```

The focused restored-tree run reported `internal/release` passing in 23.359
seconds and `cmd/release-package` passing in 0.385 seconds. The uncached full
suite passed every package. The full race run passed, including
`internal/release` in 92.017 seconds. Vet produced no findings, formatting
listed no files, and the diff check produced no errors.

Three fresh private candidates were generated outside the repository and each
passed the stream verifier plus its separately stored sidecar check:

| Platform | Archive SHA-256 | Sidecar-file SHA-256 |
| --- | --- | --- |
| `darwin-arm64` | `9f195ebd8ba303068bdc4ce227efcf9b33a29810616c73fd1ac63c481adabcc0` | `1034bb9174601ec3f85b55ffdc3a5a172c1739f7256179fc680f23f5ed1a35c5` |
| `darwin-amd64` | `b44462d45dd8248eb4c5a6cba2b7d32b0b903ce862de3077e766bc44a2dddce3` | `a8440a484735c052a416b8928a3030f46fbe5a0d17cb3a1a0b8e886434dfa624` |
| `linux-amd64` | `2b95ca80b853b4ec6f4c060f83fcaf03e13eec9426f5c08599eb3f3adbe802c8` | `5edd4921ed8e409d338dd7653fee43f5b947923be6f403d61e05ed2039bdc5a6` |

Each sidecar's recorded archive digest matched the corresponding archive hash.
Two additional fresh `darwin-arm64` package runs produced archive SHA-256
`9f195ebd8ba303068bdc4ce227efcf9b33a29810616c73fd1ac63c481adabcc0`
and sidecar-file SHA-256
`1034bb9174601ec3f85b55ffdc3a5a172c1739f7256179fc680f23f5ed1a35c5`
in both directories. Direct `cmp` checks confirmed byte-identical archives and
byte-identical sidecars.

### Final whole-diff self-review

The completed review covered archive path and member-type handling; exact tar
mode, owner, timestamp, USTAR, PAX, and xattr metadata; member-count, per-file,
cumulative-size, and trailing-payload bounds; internal and sidecar checksums;
complete Mach-O/ELF parsing; Go command, platform, toolchain, build settings,
and version evidence; candidate/final license-mode separation; failure cleanup
and no-overwrite pair publication; deterministic construction; exact CI
toolchain and reproducibility checks; documentation claims; and owner-only
legal, payment, delivery, and publication gates.

The final scope audit found only Task 3 packaging, verifier, CLI version,
workflow, documentation, report, and regression-test files. `index.html`, the
root `README.md`, and the existing Swift product under
`products/audio-delivery-preflight/` remained unchanged. No unresolved
in-scope correctness, security, transactional-publication, reproducibility, or
publication-boundary issue was found in the reviewed Task 3 diff.

### External limits retained after round 4

- These locally generated archives are disposable pre-commit verification
  evidence. Their manifests record then-current `HEAD` `a2663cc`; any future
  release candidate must be rebuilt from the clean committed source so its
  provenance identifies the exact source tree.
- GitHub Actions has not run for this unpushed commit, so remote CI is not
  verified.
- `darwin-amd64` and `linux-amd64` were cross-built and structurally verified,
  but were not executed on native matching hosts in round 4.
- Customer-release mode was exercised only with synthetic test terms. No real
  owner-accepted license was supplied, accepted, or packaged.
- Seller identity, governing law, consumer information, Gumroad object and
  attachment, EUR 19 checkout read-back, tax treatment, and independent
  customer download remain owner-controlled and unverified.
- No signing, notarization, push, upload, tag, release, shop change, payment,
  customer delivery, public publication, or customer-ready claim occurred.
