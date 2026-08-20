# Task 5 report — scan orchestration, cancellation, and source evidence

## Outcome

Implemented and committed scan orchestration as
`59ddbdc` (`Orchestrate safe audio delivery scans`). The new `ScanService`
is a `Sendable`, protocol-injected `ScanServicing` implementation that runs
the fixed scan sequence:

1. resolve the request's serialized preset definition through `PresetResolver`;
2. inventory the selected root;
3. capture a descriptor-relative, no-follow source fingerprint;
4. inspect supported regular audio and artwork files through
   `TrustedMediaSource`;
5. checksum the inspected inventory;
6. evaluate rules;
7. capture and compare a post-scan source fingerprint; and
8. derive the final status only after all completed findings are known.

The service checks cancellation between phases, before each inspected entry,
after checksumming, and before returning a completed result. Cancellation,
root/precondition failures, and invalid preset resolution return an
`.incomplete` result with generic non-path-bearing findings. A detected source
change appends `filesystem.source-changed-during-scan` at `.error` severity,
which prevents a `.ready` result.

## Files

- `products/audio-delivery-preflight/Sources/PreflightCore/Scan/ScanService.swift`
  - Adds `ScanServicing`, production and dependency-injected `ScanService`
    initializers, scoped inspection merging, cancellation handling, typed
    incomplete findings, and the stable orchestration sequence.
- `products/audio-delivery-preflight/Sources/PreflightCore/Scan/SourceFingerprint.swift`
  - Adds a serializable source-evidence DTO and descriptor-relative
    `O_NOFOLLOW` metadata collection for every regular inventory entry.
    Fingerprints store validated relative path, byte size, modification date,
    and an already-available checksum.
- `products/audio-delivery-preflight/Sources/PreflightCore/Inventory/ChecksumService.swift`
  - Exposes the injectable `InventoryChecksumming` protocol and exits its
    batch loop promptly when cancelled, preserving the existing trusted
    descriptor-relative checksum access.
- `products/audio-delivery-preflight/Sources/PreflightCore/Inventory/FileInventory.swift`
  - Treats `.md` as a document so the required `credits.md` package file is
    inventory-visible as a document.
- `products/audio-delivery-preflight/Sources/PreflightCore/Rules/BuiltInPresets.swift`
  - Allows `.md` in the Digital Release metadata-or-credits role, matching the
    task's required package shape.
- `products/audio-delivery-preflight/Tests/PreflightCoreTests/ScanServiceTests.swift`
  - Adds phase-order, isolated inspection-failure, cancellation, typed
    precondition-failure, real source-mutation, and production integration
    coverage.

No UI, CLI behavior, report rendering, shop surface, payment object, or
`index.html` change was made.

## TDD evidence

1. The first sandboxed `swift test --filter ScanServiceTests` could not write
   Swift's module cache, so it stopped before compilation. The identical test
   with the normal local compiler cache reached the intended RED state:
   missing `ScanService`, `InventoryChecksumming`, `SourceFingerprinting`, and
   `SourceFingerprint` compilation errors.
2. After the initial implementation, the new integration test failed as
   designed: `credits.md` was classified as `.other`, causing the Digital
   Release document role to be missing. Markdown inventory classification and
   the visible role pattern were then added.
3. A later focused test added for typed invalid-preset/root behavior failed
   with `scan.precondition-failed` where it required
   `preset.resolution-failed` and `filesystem.root-access-failed`. The service
   now maps those typed `PreflightError` cases explicitly.
4. During self-review, the initial fingerprint implementation was found to
   reuse inventory metadata rather than reread the source. It was replaced
   with descriptor-relative `fstat` collection. The mutation test now uses
   the production `SourceFingerprint` and changes actual source bytes during
   inspection; it receives the required error finding and cannot become
   ready.

## Verification

Fresh commands run from `products/audio-delivery-preflight` after the final
source changes:

```text
swift test --filter ScanServiceTests
```

Result: **5 tests passed, 0 failures**. This includes stable phase ordering,
an inspector failure that does not abort unaffected files, cancellation after
inventory yields, typed root/preset incomplete results, actual mutation
between production fingerprints, and a real Digital Release package with a
stereo WAV, square PNG, and `credits.md`.

```text
swift test
```

Result: **64 tests passed, 0 failures**.

```text
git diff --cached --check
```

Result: no whitespace errors before commit. The staged scope contained only
the six files listed above.

## Self-review

- Inspectors receive only `TrustedMediaSource(root:relativePath)` values;
  there is no URL-only source boundary.
- Source fingerprints and checksums use `TrustedFileAccess` with an opened
  root descriptor and component-relative no-follow opens. Fingerprinting does
  not write to the selected root, and the AVFoundation staging file is never
  inventoried or fingerprinted.
- Inspector outcomes are merged only into their own inventory entries.
  Unmeasured properties stay optional; one failed file does not stop
  inspection/checksumming of the remaining entries.
- Scan-owned failure findings have no affected filesystem paths. Existing
  path-bearing findings retain `RelativePath` values only.
- The integration test snapshots every regular package file's bytes, size,
  modification date, and POSIX permissions before and after a production
  scan; the snapshots are equal.
- The post-scan evidence compares descriptor-safe metadata and a freshly
  calculated SHA-256 witness across the two observations. It does **not**
  claim that an operating system makes external mutation impossible.

## Concerns / follow-up boundaries

- The source-change check is deliberately evidence-based: it detects an
  unreadable/disappeared regular file, a changed byte size, modification time,
  or descriptor-calculated SHA-256 witness, and a newly added regular file via
  the post-scan bounded inventory. It is not a filesystem lock and should not
  be described as one.
- Report rendering, CLI presentation/exit mapping, and UI status handling are
  intentionally left for their later tasks.

## Fix round 1/5 — hardened immutability and cancellation evidence

Committed as `7fd0ecf` (`Harden scan immutability evidence`).

### Findings addressed

1. **P1 — common byte witness:** `SourceFingerprint` now calculates SHA-256
   from each trusted descriptor during both the pre- and post-scan
   observations. `matches(_:)` requires the observed checksums to match; it no
   longer accepts a missing pre-scan inventory checksum as equivalent. The
   regression changes source bytes to a same-length value and restores the
   original modification time. The result contains
   `filesystem.source-changed-during-scan` at error severity and is not ready.

2. **P1 — live regular-file set:** after rules have evaluated the original,
   bounded inventory, `ScanService` obtains a second bounded inventory and
   fingerprints its live regular-file set. A file created during audio
   inspection changes the evidence set, produces the source-changed error, and
   is deliberately absent from the evaluated/report inventory. Existing
   inventory handling continues to record but not follow symlinks; the source
   fingerprint opens only regular entries through descriptor-relative no-follow
   access. Service files retain their established inventory semantics and are
   part of source evidence when regular.

3. **P2 — checksum cancellation:** `InventoryChecksumming` is now throwing.
   `ChecksumService` checks cancellation before and after its controllable
   chunk boundary and rethrows `CancellationError` rather than converting it
   into a `checksum.read-failed` result. `ScanService` converts that propagated
   cancellation into the established incomplete `scan.cancelled` result.

4. **P2 — root failure after inventory:** fingerprint and checksum root access
   errors now flow to `filesystem.root-access-failed` with `.incomplete`
   status and generic, non-path-bearing copy. The regression removes the root
   immediately after inventory and verifies this exact result.

5. **P2 — inspection status clobber:** a successful checksum preserves an
   existing `.failed` inspection status. The production-path regression uses
   unreadable `.wav` bytes: SHA-256 is present, the entry remains failed, and
   `inspection.audio-unreadable` survives rule evaluation.

### RED and correction evidence

- The initial focused run after adding the cancellation regression failed to
  compile because `ChecksumService(onBeforeReadingChunk:)` did not exist. This
  was the expected missing seam for deterministic in-loop cancellation.
- After the throwing batch API was introduced, older checksum test call sites
  correctly failed compilation until marked `try await`.
- The first runnable focused pass showed two useful test corrections: the
  expected stable phase stream must include the deliberate post-scan inventory,
  and the unreadable-audio production fixture has an independent
  `audio.unreadable` error from the inspector, so its correct final status is
  `requirementsNotMet`, not `needsReview`. The status-preservation assertion
  remains the entry's `.failed` status plus its surviving rule finding.

### Fresh verification

Commands run after the final code changes:

```text
swift test --filter 'ScanServiceTests|ChecksumServiceTests'
```

Result: **16 tests passed, 0 failures** — ScanServiceTests 8/8 and
ChecksumServiceTests 8/8.

```text
swift test
```

Result: **68 tests passed, 0 failures**.

`git diff --cached --check` produced no whitespace errors before commit. The
commit changes only the scan/fingerprint/checksum implementation and their two
focused test files; no shop or payment surface changed.

### Residual boundary

The strengthened evidence detects content changes even when observed size and
mtime are restored, and detects newly added regular files through the second
inventory. It remains evidence rather than a filesystem lock: an external
actor can still mutate files between observations, and source disappearance or
root access loss correctly yields incomplete rather than a ready verdict.

## Fix round 2/5 — canonical inventory witness and post-inventory recovery

Committed as `0f430fd` (`Harden scan inventory witness`).

### Findings addressed

1. **Second-inventory root loss:** `FileInventory` now converts failure to
   read the selected root's resource values into the typed, generic
   `PreflightError.invalidScanRequest`. `ScanService` treats every non-cancel
   failure in the deliberate second-inventory phase as
   `filesystem.root-access-failed`, returning `.incomplete` with no affected
   paths or raw root in the explanation. The deterministic regression runs
   the complete pre-inventory/fingerprint/checksum/inspection/rules sequence,
   removes the root immediately before the second inventory, and verifies the
   typed incomplete result.

2. **Symlink and kind mutations:** `SourceFingerprint` now carries a sorted
   canonical `InventoryWitness`: every original `RelativePath` paired with its
   `FileKind`. Equality requires this witness in addition to the trusted
   descriptor-derived regular-file SHA-256 evidence. The scanner therefore
   detects additions/removals and regular-to-symlink replacements, including
   symlinks and service-file entries. Only regular entries are opened or
   hashed; symlink targets are neither followed nor fingerprinted. The two
   deterministic scan regressions create an in-root symlink and replace a
   regular master with a symlink to `/dev/null`; both produce
   `filesystem.source-changed-during-scan` and never produce ready. The
   assertions confirm actual symlink creation, while the result carries no
   target path.

3. **Inventory cancellation:** `FileInventory` checks task cancellation
   before access and on every enumeration iteration, including the second
   inventory invoked by `ScanService`. Cancellation is thrown as
   `CancellationError`, rather than converted into an enumeration warning. A
   deterministic enumeration gate cancels the task at the loop boundary and
   verifies propagation.

### Failure-first evidence and review

- The first focused run after strengthening the regular-to-symlink test failed
  only because its new symlink assertion was accidentally placed in the
  ordinary file-addition regression. That test intentionally does not create
  a symlink, so the failure demonstrated the misplaced assertion. The
  assertion was moved to the replacement regression; the same focused suite
  then passed cleanly.
- The add-symlink fixture originally omitted the link's parent directory and
  silently skipped link creation. It was corrected to create the parent and
  now verifies the live inventory classifies the new entry as `.symbolicLink`
  before asserting source change. This was a test-fixture correction, not a
  production witness failure.
- Self-review confirms the post inventory is never supplied to checksums,
  inspectors, or rules. It is evidence only. The production fingerprint's
  trusted descriptor path remains restricted to `entry.kind == .regular`.
- `git diff --check` passed. The final diff contains only FileInventory,
  ScanService, SourceFingerprint, and their focused test files; shop/payment
  files remain untouched.

### Fresh verification

Commands run after the final test correction:

```text
swift test --filter 'ScanServiceTests|FileInventoryTests'
```

Result: **18 tests passed, 0 failures** — ScanServiceTests 11/11 and
FileInventoryTests 7/7.

```text
swift test
```

Result: **72 tests passed, 0 failures**. This includes
ChecksumServiceTests 8/8, including the pre-existing deterministic
in-chunk cancellation regression.

### Residual boundary

The canonical witness detects entry path/kind set changes at the two bounded
observations without evaluating a mixed-time post-scan inventory. It remains
an observation boundary rather than a filesystem lock: a source may change
again after the final observation. Root loss or inaccessible trusted evidence
returns incomplete, and cancellation returns the existing incomplete cancelled
result; neither can be ready.

## Fix round 3/5 — incomplete post-scan observation evidence

Committed as `fb73270` (`Reject incomplete post-scan evidence`).

### Finding addressed

`ScanService` previously ignored `postInventory.findings`. A second inventory
could therefore return a partial snapshot with an enumeration or metadata
access failure, and the scanner could compare that incomplete witness as
stable. The service now checks cancellation immediately after the second
inventory and, before fingerprinting it, rejects post observations containing
either `filesystem.enumeration-failed` or
`filesystem.metadata-unreadable`. It returns the existing generic,
non-path-bearing `filesystem.root-access-failed` result at `.incomplete`.
Cancellation still reaches the outer `CancellationError` handler and produces
the established `scan.cancelled` incomplete result.

The classifier intentionally does not include informational or otherwise
non-observation findings such as `filesystem.symlink-not-followed`, nor
service-file and special-entry findings. A normal post inventory with those
findings can still be compared using the canonical witness; only incomplete
enumeration or metadata evidence blocks comparison.

`FileInventory` now names resource-value access failures
`filesystem.metadata-unreadable`, matching the observation-failure contract.

### Deterministic regressions

- The new `ScanServiceTests` regression uses the injected `FileInventorying`
  boundary to return a deterministic partial second snapshot carrying
  `filesystem.enumeration-failed`. Immediately before doing so it creates and
  proves the existence of a hidden symlink under the pre-existing `Masters`
  directory. The partial snapshot deliberately omits that new link, modelling
  an inaccessible/failed subtree without relying on permission changes that
  may be ineffective under test privileges. The scan must be incomplete,
  non-ready, contain only the generic root-access finding, and reveal neither
  the selected-root path nor the symlink target.
- `SourceFingerprint(entries:)` now uses the same private sorted initializer
  as the production descriptor fingerprint. The regression supplies the same
  entries in opposite orders, proves both public witnesses are scalar-sorted,
  and proves they match.

### Failure-first and review evidence

- Before production changes, the deterministic partial-post regression
  returned `.ready` with no finding, despite the injected
  `filesystem.enumeration-failed` and omitted hidden symlink. The ordering
  regression also showed the public initializer retained caller order and two
  otherwise identical fingerprints did not match.
- The first red execution exposed an assertion-indexing issue in the new test
  when no finding existed yet; the assertion was made optional-safe and the
  rerun then recorded the intended failures above. No production change was
  made before that clean red result.
- Self-review confirms the second inventory is still evidence-only: it is
  never sent to inspectors, checksums, or rules. The generic incomplete result
  has no affected paths, and the classifier only names actual enumeration or
  metadata access failures.
- `git diff --check` passed. The final diff contains FileInventory,
  ScanService, SourceFingerprint, and ScanServiceTests only; no shop or
  payment surface changed.

### Fresh verification

Commands run after the final regression assertion refinement:

```text
swift test --filter 'ScanServiceTests|FileInventoryTests'
```

Result: **20 tests passed, 0 failures** — ScanServiceTests 13/13 and
FileInventoryTests 7/7.

```text
swift test
```

Result: **74 tests passed, 0 failures**.

### Residual boundary

The second inventory remains a bounded observation, not a lock. If its
enumeration or metadata evidence is incomplete, the service now refuses to
compare it and cannot return ready. A later external mutation after a complete
second observation is still outside the evidence window, as documented in the
earlier rounds.

## Fix round 4/5 — invalid-relative-path post evidence

### Finding addressed

`FileInventory` emits `filesystem.invalid-relative-path` and calls
`skipDescendants()` when an enumerated URL cannot be represented as a safe
`RelativePath`. That makes the inventory deliberately partial. The round 3
post-evidence classifier rejected enumeration and metadata failures but omitted
this third partial-observation mode, so unchanged surviving entries could still
compare equal and produce a false-ready result.

`ScanService.postInventoryHasIncompleteEvidence` now also classifies
`filesystem.invalid-relative-path` as incomplete evidence. The existing guard
therefore returns the existing generic, non-path-bearing
`filesystem.root-access-failed` result at `.incomplete` before the post
fingerprint is captured or compared. No other scan status or inventory
semantics changed.

### Deterministic regressions

- The invalid-relative-path regression injects a complete first inventory,
  creates a new omitted descendant symlink targeting `/dev/null`, and returns a
  second snapshot with exactly the original entries plus
  `filesystem.invalid-relative-path`. It verifies the descendant exists but the
  scan result is `.incomplete`, contains only
  `filesystem.root-access-failed`, has no inventory, affected paths, or
  evidence, reveals neither the raw selected-root path nor the target/omitted
  subtree, and can never be `.ready`.
- A direct injected `filesystem.metadata-unreadable` post-inventory regression
  now exercises the same result contract explicitly. The classifier already
  handled this rule, so this test passed in the RED run while the new
  invalid-relative-path regression failed.

### Failure-first and correction evidence

- The first sandboxed focused run stopped before manifest compilation because
  Swift's module cache was not writable. The normal-cache rerun then exposed a
  missing test-actor initializer; only the fixture construction was corrected.
- The clean RED run executed 15 `ScanServiceTests`: 14 passed, including the
  direct metadata-unreadable regression, while the invalid-relative-path case
  failed four behavioral assertions because the result was `.ready` with no
  finding instead of generic `.incomplete`.
- The production correction is one classifier entry. The GREEN focused run
  then passed all 15 `ScanServiceTests` with zero failures.

### Fresh verification

Commands run after the production correction:

```text
swift test --filter ScanServiceTests
```

Result: **15 tests passed, 0 failures**.

```text
swift test
```

Result: **76 tests passed, 0 failures**.

`git diff --check` passed. The implementation/test diff was limited to
`ScanService.swift` and `ScanServiceTests.swift`; this report is the only other
changed file. No shop, payment, or unrelated semantics were changed.

### Residual boundary

The post inventory is still a bounded observation rather than a filesystem
lock. All three current `FileInventory` findings that mean entries or
descendants may be absent — enumeration failure, unreadable metadata, and an
invalid relative path — now prevent fingerprint comparison and a ready result.
Any future inventory finding that introduces another partial-observation mode
must be added deliberately to this completeness classifier.
