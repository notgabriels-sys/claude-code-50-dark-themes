# Audio Delivery Preflight v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a macOS-native, fully local application and supported CLI that inspect an audio-delivery folder, evaluate transparent technical requirements, and export evidence-backed reports without changing source files.

**Architecture:** A Swift package provides a shared `PreflightCore` library, an `audio-preflight` executable, and a SwiftUI macOS executable. The core owns all filesystem boundaries, inspection, rules, presets, findings, and reports; the CLI and app are presentation layers over the same `ScanService` API.

**Tech Stack:** Swift 6, Swift Package Manager, Foundation, CryptoKit, AVFoundation, ImageIO, UniformTypeIdentifiers, SwiftUI, XCTest; no third-party runtime dependencies in v1.

**Spec:** `docs/superpowers/specs/2026-08-20-audio-delivery-preflight-design.md`

## Global Constraints

- Target macOS 14 or later and Swift 6 language mode for v1.
- Process selected folders locally; no network request may occur during a scan.
- Never delete, move, rename, convert, normalize, rewrite, or upload source files.
- Never follow symbolic links or open a resolved path outside the canonical selected root.
- Export relative paths by default; do not expose absolute source paths in reports.
- Failed measurements remain unknown and must never be guessed.
- `ready` means selected technical requirements passed; it is never an artistic judgment.
- Do not implement loudness, true peak, perceptual similarity, mastering advice, cloud accounts, billing, publishing, or DAW repair in v1.
- All validation rules live in `PreflightCore`; neither presentation layer may invent a rule.
- Preserve the existing static shop and existing products while this product remains under development.

---

## Planned file map

- `products/audio-delivery-preflight/Package.swift`: package targets, macOS floor, and resources.
- `products/audio-delivery-preflight/Sources/PreflightCore/Domain/Models.swift`: shared value types, severities, statuses, evidence, and results.
- `products/audio-delivery-preflight/Sources/PreflightCore/Domain/Errors.swift`: typed scan, preset, inspection, and export errors.
- `products/audio-delivery-preflight/Sources/PreflightCore/Inventory/FileInventory.swift`: bounded traversal and file classification.
- `products/audio-delivery-preflight/Sources/PreflightCore/Inventory/ChecksumService.swift`: streaming SHA-256 and duplicate groups.
- `products/audio-delivery-preflight/Sources/PreflightCore/Inspection/AudioInspector.swift`: AVFoundation-backed audio properties.
- `products/audio-delivery-preflight/Sources/PreflightCore/Inspection/ImageInspector.swift`: ImageIO-backed artwork properties.
- `products/audio-delivery-preflight/Sources/PreflightCore/Rules/Preset.swift`: Codable preset schema and built-ins.
- `products/audio-delivery-preflight/Sources/PreflightCore/Rules/RuleEngine.swift`: filename, role, consistency, artwork, and duplicate findings.
- `products/audio-delivery-preflight/Sources/PreflightCore/Scan/ScanService.swift`: orchestration, cancellation, and overall status.
- `products/audio-delivery-preflight/Sources/PreflightCore/Reports/JSONReportWriter.swift`: stable schema export.
- `products/audio-delivery-preflight/Sources/PreflightCore/Reports/HTMLReportWriter.swift`: escaped, accessible standalone report.
- `products/audio-delivery-preflight/Sources/PreflightCore/Reports/ChecksumManifestWriter.swift`: portable checksum manifest.
- `products/audio-delivery-preflight/Sources/AudioPreflightCLI/main.swift`: argument parsing, commands, output, and exit codes.
- `products/audio-delivery-preflight/Sources/AudioDeliveryPreflightApp/AudioDeliveryPreflightApp.swift`: app entry point.
- `products/audio-delivery-preflight/Sources/AudioDeliveryPreflightApp/AppModel.swift`: app state and async core calls.
- `products/audio-delivery-preflight/Sources/AudioDeliveryPreflightApp/ContentView.swift`: start, requirements, results, and export interface.
- `products/audio-delivery-preflight/Sources/AudioDeliveryPreflightApp/Views/*.swift`: focused reusable SwiftUI views.
- `products/audio-delivery-preflight/Tests/PreflightCoreTests/*.swift`: unit and integration tests.
- `products/audio-delivery-preflight/Tests/ReportSnapshotTests/*.swift`: deterministic report tests.
- `products/audio-delivery-preflight/README.md`: supported behavior, privacy, limitations, CLI, and build instructions.
- `products/audio-delivery-preflight/scripts/verify.sh`: clean verification command.

### Task 1: Package foundation and stable domain model

**Files:**
- Create: `products/audio-delivery-preflight/Package.swift`
- Create: `products/audio-delivery-preflight/Sources/PreflightCore/Domain/Models.swift`
- Create: `products/audio-delivery-preflight/Sources/PreflightCore/Domain/Errors.swift`
- Create: `products/audio-delivery-preflight/Sources/AudioPreflightCLI/main.swift`
- Create: `products/audio-delivery-preflight/Sources/AudioDeliveryPreflightApp/AudioDeliveryPreflightApp.swift`
- Create: `products/audio-delivery-preflight/Sources/AudioDeliveryPreflightApp/ContentView.swift`
- Create: `products/audio-delivery-preflight/Tests/PreflightCoreTests/DomainModelTests.swift`

**Interfaces:**
- Consumes: no earlier product code.
- Produces: `FindingSeverity`, `OverallStatus`, `FileCategory`, `InspectionStatus`, `EvidenceValue`, `Finding`, `InventoryEntry`, `AudioProperties`, `ImageProperties`, `ResolvedPreset`, `ScanRequest`, `ScanResult`, and `PreflightError`.

- [ ] **Step 1: Write the package manifest and failing domain tests**

Create a Swift 6 package with library target `PreflightCore`, executable target `audio-preflight`, executable target `AudioDeliveryPreflightApp`, test target `PreflightCoreTests`, and test target `ReportSnapshotTests`. Set `.macOS(.v14)` and apply `.swiftLanguageMode(.v6)` to targets.

In `DomainModelTests.swift`, assert stable Codable round trips and status derivation:

```swift
import XCTest
@testable import PreflightCore

final class DomainModelTests: XCTestCase {
    func testFindingRoundTripPreservesEvidenceAndOrigin() throws {
        let finding = Finding(
            ruleID: "audio.mixed-sample-rates",
            severity: .warning,
            title: "Mixed sample rates",
            explanation: "The package contains more than one sample rate.",
            affectedPaths: ["Masters/Track.wav"],
            evidence: [.init(label: "sampleRate", value: .number(48_000))],
            expected: "One sample rate for matched masters",
            suggestedAction: "Confirm that the difference is intentional.",
            origin: .preset,
            engineVersion: "0.1.0"
        )
        let data = try JSONEncoder().encode(finding)
        XCTAssertEqual(try JSONDecoder().decode(Finding.self, from: data), finding)
    }

    func testOverallStatusUsesMostSevereCompletedFinding() {
        XCTAssertEqual(OverallStatus.completed(findings: []), .ready)
        XCTAssertEqual(OverallStatus.completed(findings: [.fixture(.warning)]), .needsReview)
        XCTAssertEqual(OverallStatus.completed(findings: [.fixture(.error)]), .requirementsNotMet)
    }
}
```

- [ ] **Step 2: Run the domain tests and verify failure**

Run: `cd products/audio-delivery-preflight && swift test --filter DomainModelTests`

Expected: compilation fails because the domain types do not exist.

- [ ] **Step 3: Implement the minimal domain model**

Define all public value types as `Sendable`, `Codable`, and `Equatable` where their stored values permit it. Use string-backed enums. Define `EvidenceValue` as a Codable enum supporting string, number, integer, boolean, and unknown values. Define `OverallStatus.completed(findings:)` so error outranks warning and pass/information do not block readiness. Define `.incomplete` only from scan orchestration, never from ordinary findings.

Keep `InventoryEntry` inspection fields optional so a failed inspector cannot force invented properties. Give exported schema-bearing types explicit `schemaVersion` or engine-version fields where required by the spec.

The initial CLI prints a development message and exits successfully; the initial SwiftUI view states “Audio Delivery Preflight — implementation in progress.” Neither layer adds validation logic.

- [ ] **Step 4: Run tests and build all targets**

Run: `cd products/audio-delivery-preflight && swift test`

Expected: all domain tests pass.

Run: `cd products/audio-delivery-preflight && swift build`

Expected: all three targets compile on macOS 14+.

- [ ] **Step 5: Commit the foundation**

```bash
git add products/audio-delivery-preflight
git commit -m "Build audio preflight package foundation"
```

### Task 2: Safe bounded inventory and exact duplicate detection

**Files:**
- Create: `products/audio-delivery-preflight/Sources/PreflightCore/Inventory/FileInventory.swift`
- Create: `products/audio-delivery-preflight/Sources/PreflightCore/Inventory/ChecksumService.swift`
- Create: `products/audio-delivery-preflight/Tests/PreflightCoreTests/FileInventoryTests.swift`
- Create: `products/audio-delivery-preflight/Tests/PreflightCoreTests/ChecksumServiceTests.swift`

**Interfaces:**
- Consumes: `InventoryEntry`, `FileCategory`, `InspectionStatus`, `Finding`, and `PreflightError` from Task 1.
- Produces: `FileInventorying.inventory(root:) async throws -> InventorySnapshot`, `ChecksumCalculating.sha256(for:) async throws -> String`, and `ChecksumService.duplicateGroups(entries:) -> [DuplicateGroup]`.

- [ ] **Step 1: Write failing filesystem-boundary tests**

Use temporary directories and write fixtures through XCTest setup. Test that normal nested files use relative paths, `.DS_Store` is classified as `.serviceFile`, symlinks are recorded but never followed, a symlink to an external sentinel never reads the sentinel, and special/unreadable entries become findings rather than crashes.

```swift
func testSymlinkOutsideRootIsRecordedAndNotFollowed() async throws {
    let fixture = try TemporaryInventoryFixture.make()
    try fixture.createExternalSentinel(contents: "PRIVATE")
    try fixture.createEscapingSymlink(named: "outside.wav")

    let snapshot = try await FileInventory().inventory(root: fixture.root)

    XCTAssertEqual(snapshot.entries.first { $0.relativePath == "outside.wav" }?.kind, .symbolicLink)
    XCTAssertFalse(snapshot.entries.contains { $0.sha256 != nil })
    XCTAssertTrue(snapshot.findings.contains { $0.ruleID == "filesystem.symlink-not-followed" })
}
```

- [ ] **Step 2: Run inventory tests and verify failure**

Run: `cd products/audio-delivery-preflight && swift test --filter FileInventoryTests`

Expected: compilation fails because inventory interfaces are missing.

- [ ] **Step 3: Implement bounded inventory**

Use `FileManager.DirectoryEnumerator` with resource keys for regular-file, directory, symbolic-link, hidden, size, and modification-date values. Standardize the root URL once. Do not resolve or enumerate symlink destinations. Before opening a regular file, standardize its URL and require its path components to begin with the root path components; a string-prefix check alone is prohibited because `/root-two` is not inside `/root`.

Sort final inventory entries by Unicode scalar order of their relative paths for deterministic reports. Do not calculate checksums in the traversal itself; inventory and hashing remain separable.

- [ ] **Step 4: Write failing checksum and duplicate tests**

Test the SHA-256 of UTF-8 bytes `abc` equals `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad`, same-content files group despite different names, different bytes do not group, service files are excluded, and a read failure leaves checksum unknown with a finding.

- [ ] **Step 5: Implement streaming checksums and duplicate grouping**

Read files in bounded chunks using `FileHandle.read(upToCount:)`, update `CryptoKit.SHA256`, close handles with `defer`, and return lowercase hexadecimal. Add checksum results to copied inventory entries after traversal. Group only successful checksums with two or more regular files. Sort paths and groups deterministically.

- [ ] **Step 6: Run the inventory and checksum suites**

Run: `cd products/audio-delivery-preflight && swift test --filter FileInventoryTests && swift test --filter ChecksumServiceTests`

Expected: all tests pass, including the external-symlink sentinel test.

- [ ] **Step 7: Commit safe inventory**

```bash
git add products/audio-delivery-preflight/Sources/PreflightCore/Inventory products/audio-delivery-preflight/Tests/PreflightCoreTests
git commit -m "Add bounded file inventory and checksums"
```

### Task 3: Objective audio and artwork inspection

**Files:**
- Create: `products/audio-delivery-preflight/Sources/PreflightCore/Inspection/AudioInspector.swift`
- Create: `products/audio-delivery-preflight/Sources/PreflightCore/Inspection/ImageInspector.swift`
- Create: `products/audio-delivery-preflight/Tests/PreflightCoreTests/AudioInspectorTests.swift`
- Create: `products/audio-delivery-preflight/Tests/PreflightCoreTests/ImageInspectorTests.swift`
- Create: `products/audio-delivery-preflight/Tests/PreflightCoreTests/FixtureFactory.swift`

**Interfaces:**
- Consumes: inventory paths and `AudioProperties`, `ImageProperties`, `InspectionStatus`, and `Finding` from Task 1.
- Produces: `AudioInspecting.inspect(url:) async -> InspectionOutcome<AudioProperties>` and `ImageInspecting.inspect(url:) -> InspectionOutcome<ImageProperties>`.

- [ ] **Step 1: Write failing audio fixture and property tests**

Create tiny original PCM WAV fixtures in test setup by writing RIFF headers and zero-valued sample payloads. Cover mono 44.1 kHz/16-bit, stereo 48 kHz/24-bit, a truncated WAV, a text file named `.wav`, and a valid file with a non-audio extension.

Assert that measured duration, channel count, sample rate, PCM bit depth, container, and readability match fixture facts. For properties AVFoundation cannot prove, assert `nil`, never a default.

- [ ] **Step 2: Run audio tests and verify failure**

Run: `cd products/audio-delivery-preflight && swift test --filter AudioInspectorTests`

Expected: compilation fails because `AudioInspector` and `InspectionOutcome` are missing.

- [ ] **Step 3: Implement audio inspection**

Use `AVURLAsset` and its async track-loading APIs. Load duration and the first audio track; derive channel count and sample rate from `CMAudioFormatDescription`/`AudioStreamBasicDescription` when present. Report container from the URL/content type and codec from format descriptions only when determinable. Parse PCM bit depth from the stream description only for linear PCM. Return a typed failure outcome with a finding for unreadable media.

Recognize extension candidates case-insensitively, but treat successful media inspection as evidence and extension as classification only. Do not add loudness, peak, phase, or quality measurements.

- [ ] **Step 4: Write failing image tests**

Generate small PNG and JPEG fixtures with CoreGraphics/ImageIO. Test square and non-square dimensions, alpha presence, format, byte size, and unreadable image handling.

```swift
func testPNGReportsDimensionsAndAlpha() throws {
    let url = try FixtureFactory.png(width: 300, height: 300, alpha: true)
    let outcome = ImageInspector().inspect(url: url)
    XCTAssertEqual(outcome.value?.pixelWidth, 300)
    XCTAssertEqual(outcome.value?.pixelHeight, 300)
    XCTAssertEqual(outcome.value?.hasAlpha, true)
}
```

- [ ] **Step 5: Implement image inspection**

Use `CGImageSourceCreateWithURL` and source properties. Read pixel width, height, color model, and alpha when available. Identify the format from the source UTI. Preserve unknowns as `nil`. Return evidence-backed failures for unreadable images.

- [ ] **Step 6: Run inspection tests and full suite**

Run: `cd products/audio-delivery-preflight && swift test`

Expected: all domain, inventory, checksum, audio, and image tests pass.

- [ ] **Step 7: Commit media inspection**

```bash
git add products/audio-delivery-preflight/Sources/PreflightCore/Inspection products/audio-delivery-preflight/Tests/PreflightCoreTests
git commit -m "Inspect audio and artwork properties"
```

### Task 4: Transparent presets, delivery roles, and rule engine

**Files:**
- Create: `products/audio-delivery-preflight/Sources/PreflightCore/Rules/Preset.swift`
- Create: `products/audio-delivery-preflight/Sources/PreflightCore/Rules/BuiltInPresets.swift`
- Create: `products/audio-delivery-preflight/Sources/PreflightCore/Rules/RuleEngine.swift`
- Create: `products/audio-delivery-preflight/Tests/PreflightCoreTests/PresetTests.swift`
- Create: `products/audio-delivery-preflight/Tests/PreflightCoreTests/RuleEngineTests.swift`

**Interfaces:**
- Consumes: inspected inventory, duplicate groups, domain findings, and evidence.
- Produces: `PresetResolving.resolve(_:) throws -> ResolvedPreset`, `BuiltInPresets.all`, and `RuleEvaluating.evaluate(snapshot:preset:engineVersion:) -> [Finding]`.

- [ ] **Step 1: Write failing preset-schema tests**

Assert that built-in identifiers are exactly `general-audio`, `stereo-premaster`, and `digital-release`; all resolved requirements can be encoded into reports; General Audio mandates no sample rate/bit depth; Stereo Premaster requires one readable lossless stereo role; Digital Release requires a lossless main master, artwork, and metadata-or-credits document; invalid regex or contradictory numeric ranges throw `PreflightError.invalidPreset(field:reason:)`.

- [ ] **Step 2: Implement preset types and built-ins**

Define Codable types for allowed formats, numeric constraints, artwork constraints, filename constraints, and delivery roles. Compile role patterns during resolution, not during every file evaluation. Make every default severity explicit. A custom preset uses the same schema as built-ins.

- [ ] **Step 3: Write failing rule tests**

Use in-memory inventory fixtures to test:

- mixed sample rates warn only when the preset enables consistency;
- `Track FINAL2.wav` produces `filename.ambiguous-version`;
- `Track.wav` and `track.wav` produce a case-insensitive collision warning;
- a missing main master is an error in Digital Release;
- two files matching main master produce an ambiguity warning and no silent winner;
- non-square or undersized art evaluates against visible artwork requirements;
- exact duplicates produce paths and duplicate byte totals;
- engine-fact versus preset origin is preserved;
- findings are sorted by severity, rule ID, then relative path.

- [ ] **Step 4: Run rule tests and verify failure**

Run: `cd products/audio-delivery-preflight && swift test --filter RuleEngineTests`

Expected: compilation fails because `RuleEngine` is missing.

- [ ] **Step 5: Implement the rule engine**

Implement focused private evaluators called by one public `evaluate` method: readability, audio consistency, filename hygiene, role matching, artwork requirements, service files, symlinks, and exact duplicates. Each evaluator returns immutable findings. Every preset-based finding includes expected condition and suggested action. Do not infer a role from file contents.

- [ ] **Step 6: Run preset, rule, and complete suites**

Run: `cd products/audio-delivery-preflight && swift test`

Expected: all tests pass and built-in presets encode deterministically.

- [ ] **Step 7: Commit rules and presets**

```bash
git add products/audio-delivery-preflight/Sources/PreflightCore/Rules products/audio-delivery-preflight/Tests/PreflightCoreTests
git commit -m "Add transparent delivery validation rules"
```

### Task 5: Scan orchestration, cancellation, and immutability evidence

**Files:**
- Create: `products/audio-delivery-preflight/Sources/PreflightCore/Scan/ScanService.swift`
- Create: `products/audio-delivery-preflight/Sources/PreflightCore/Scan/SourceFingerprint.swift`
- Create: `products/audio-delivery-preflight/Tests/PreflightCoreTests/ScanServiceTests.swift`

**Interfaces:**
- Consumes: inventory, checksum, inspectors, preset resolver, and rule engine protocols.
- Produces: `ScanServicing.scan(_ request: ScanRequest) async -> ScanResult` and dependency-injected `ScanService` initializers for production and tests.

- [ ] **Step 1: Write failing orchestration tests with spies**

Test ordered collaboration without coupling to concrete implementations: resolve preset, inventory, fingerprint source metadata/checksums, inspect supported regular files, hash files, evaluate rules, derive status, and compare the post-scan source fingerprint. Assert one inspector failure does not abort unaffected files.

Test cancellation by cancelling a task after a controllable inventory spy yields; expected status is `.incomplete`, no `ready` result is possible, and the result includes `scan.cancelled`.

Test simulated source mutation between pre- and post-scan fingerprints; expected finding is `filesystem.source-changed-during-scan` with `.error` severity because the scan cannot prove a stable source snapshot.

- [ ] **Step 2: Run orchestration tests and verify failure**

Run: `cd products/audio-delivery-preflight && swift test --filter ScanServiceTests`

Expected: compilation fails because `ScanService` is missing.

- [ ] **Step 3: Implement scan orchestration**

Implement `ScanService` as a `Sendable` struct with protocol-injected dependencies. Check `Task.checkCancellation()` between phases and periodically during batches. Merge inspector outcomes into inventory entries without filling absent measurements. Convert root access and invalid preset failures into incomplete results with typed findings.

`SourceFingerprint` records each regular source file's relative path, byte size, modification time, and checksum when already available. Compare before and after without writing to the source. This evidence supports the claim that the scanner did not observe a source change; documentation must not claim the operating system makes external mutation impossible.

- [ ] **Step 4: Add a complete integration package test**

Create a temporary Digital Release package containing a stereo WAV, square PNG, and `credits.md`. Run the production `ScanService`. Assert `.ready`, relative paths only, required roles matched visibly, SHA-256 present, and source file bytes/attributes equal their pre-scan snapshots.

- [ ] **Step 5: Run all core tests**

Run: `cd products/audio-delivery-preflight && swift test`

Expected: all tests pass, including cancellation and immutability evidence.

- [ ] **Step 6: Commit the scan service**

```bash
git add products/audio-delivery-preflight/Sources/PreflightCore/Scan products/audio-delivery-preflight/Tests/PreflightCoreTests
git commit -m "Orchestrate safe audio delivery scans"
```

### Task 6: Stable JSON, accessible HTML, and checksum reports

**Files:**
- Create: `products/audio-delivery-preflight/Sources/PreflightCore/Reports/JSONReportWriter.swift`
- Create: `products/audio-delivery-preflight/Sources/PreflightCore/Reports/HTMLReportWriter.swift`
- Create: `products/audio-delivery-preflight/Sources/PreflightCore/Reports/ChecksumManifestWriter.swift`
- Create: `products/audio-delivery-preflight/Tests/ReportSnapshotTests/JSONReportWriterTests.swift`
- Create: `products/audio-delivery-preflight/Tests/ReportSnapshotTests/HTMLReportWriterTests.swift`
- Create: `products/audio-delivery-preflight/Tests/ReportSnapshotTests/ChecksumManifestWriterTests.swift`

**Interfaces:**
- Consumes: complete `ScanResult` values.
- Produces: `JSONReportWriter.data(for:) throws -> Data`, `HTMLReportWriter.html(for:) -> String`, and `ChecksumManifestWriter.text(for:) -> String`.

- [ ] **Step 1: Write failing JSON stability and privacy tests**

Create one fixed scan result and assert pretty-printed, sorted-key JSON includes schema version, engine version, resolved preset, status, inventory, evidence, and findings; excludes `/Users/example/private-delivery`; and produces byte-identical output across two calls after fixing the scan timestamp in the fixture.

- [ ] **Step 2: Implement versioned JSON export**

Use `JSONEncoder` with `.prettyPrinted`, `.sortedKeys`, and ISO-8601 dates. Encode a dedicated `JSONReportV1` DTO rather than exposing accidental internal fields. Reject any inventory relative path that becomes absolute at export time.

- [ ] **Step 3: Write failing HTML security and accessibility tests**

Assert filenames containing `<script>`, `&`, quotes, and Unicode render escaped; report language and UTF-8 metadata exist; the overall status has visible text rather than color alone; findings use headings and lists; relative paths appear; absolute roots do not; and the technical-versus-artistic limitation is visible.

- [ ] **Step 4: Implement standalone HTML export**

Generate one self-contained document with inline CSS, semantic landmarks, a summary table, severity labels, inventory table, findings, resolved requirements, and privacy/limitations footer. Implement one dedicated HTML escaping function and test all five special characters.

- [ ] **Step 5: Write failing checksum-manifest tests**

Assert lowercase SHA-256, two spaces between hash and relative path, lexical ordering, exclusion of unknown checksums/service files, newline termination, and escaping/rejection of newline characters in paths.

- [ ] **Step 6: Implement checksum manifest and run report tests**

Run: `cd products/audio-delivery-preflight && swift test --filter ReportSnapshotTests`

Expected: all report tests pass.

- [ ] **Step 7: Run the full suite and commit reports**

Run: `cd products/audio-delivery-preflight && swift test`

```bash
git add products/audio-delivery-preflight/Sources/PreflightCore/Reports products/audio-delivery-preflight/Tests/ReportSnapshotTests
git commit -m "Export private audio preflight reports"
```

### Task 7: Supported command-line product

**Files:**
- Modify: `products/audio-delivery-preflight/Sources/AudioPreflightCLI/main.swift`
- Create: `products/audio-delivery-preflight/Sources/AudioPreflightCLI/CLI.swift`
- Create: `products/audio-delivery-preflight/Tests/PreflightCoreTests/CLITests.swift`

**Interfaces:**
- Consumes: `ScanService`, `BuiltInPresets`, and all report writers.
- Produces: `CLI.run(arguments:environment:) async -> Int32`, commands `scan`, `presets`, `preset show`, and `version`, and exit codes 0–5 from the specification.

- [ ] **Step 1: Write failing parser and exit-code tests**

Test exact commands, missing folder, unknown preset, unwritable report destination through an injected filesystem, ready result `0`, warning result `1`, error result `2`, invalid command `3`, scan-start failure `4`, and unexpected injected failure `5`. Capture stdout/stderr through injected closures.

- [ ] **Step 2: Run CLI tests and verify failure**

Run: `cd products/audio-delivery-preflight && swift test --filter CLITests`

Expected: compilation fails because `CLI` is missing.

- [ ] **Step 3: Implement explicit dependency-free argument parsing**

Support exactly:

```text
audio-preflight scan <folder> [--preset <id>] [--report-html <path>] [--report-json <path>] [--checksums <path>]
audio-preflight presets
audio-preflight preset show <id>
audio-preflight version
```

Default scan preset is `general-audio`. Reject duplicate flags and unknown options. Display resolved requirements before the final scan summary. Write reports atomically to user-specified destinations outside or inside the selected folder only when explicitly requested; report export must not alter the scan verdict.

- [ ] **Step 4: Wire the async executable and test a fixture manually**

Run:

```bash
cd products/audio-delivery-preflight
swift run audio-preflight presets
swift run audio-preflight preset show digital-release
swift run audio-preflight scan Tests/Fixtures/valid-digital-release --preset digital-release --report-json /tmp/audio-preflight-report.json
```

Expected: preset commands succeed; scan prints counts and relative paths; output JSON contains no repository absolute path.

- [ ] **Step 5: Run tests and commit CLI**

Run: `cd products/audio-delivery-preflight && swift test && swift build -c release --product audio-preflight`

```bash
git add products/audio-delivery-preflight/Sources/AudioPreflightCLI products/audio-delivery-preflight/Tests/PreflightCoreTests/CLITests.swift
git commit -m "Ship audio delivery preflight CLI"
```

### Task 8: Native SwiftUI workflow

**Files:**
- Modify: `products/audio-delivery-preflight/Sources/AudioDeliveryPreflightApp/AudioDeliveryPreflightApp.swift`
- Modify: `products/audio-delivery-preflight/Sources/AudioDeliveryPreflightApp/ContentView.swift`
- Create: `products/audio-delivery-preflight/Sources/AudioDeliveryPreflightApp/AppModel.swift`
- Create: `products/audio-delivery-preflight/Sources/AudioDeliveryPreflightApp/Views/StartView.swift`
- Create: `products/audio-delivery-preflight/Sources/AudioDeliveryPreflightApp/Views/RequirementsView.swift`
- Create: `products/audio-delivery-preflight/Sources/AudioDeliveryPreflightApp/Views/ResultsView.swift`
- Create: `products/audio-delivery-preflight/Sources/AudioDeliveryPreflightApp/Views/FindingDetailView.swift`
- Create: `products/audio-delivery-preflight/Sources/AudioDeliveryPreflightApp/Views/ExportView.swift`
- Create: `products/audio-delivery-preflight/Tests/PreflightCoreTests/AppModelTests.swift`

**Interfaces:**
- Consumes: `ScanServicing`, built-in presets, resolved requirements, scan results, and report writers.
- Produces: `@MainActor AppModel` with `Phase` cases `.start`, `.requirements`, `.scanning`, `.results`, and `.export`; folder selection/drop; scan cancellation; filters; and explicit export.

- [ ] **Step 1: Write failing app-state tests**

Inject a `ScanServicing` spy and test: selecting a folder moves to requirements rather than scanning immediately; starting scan moves through scanning to results; cancellation returns an incomplete result; choosing another folder clears stale findings; export failure leaves results intact; no recent path is persisted by default.

- [ ] **Step 2: Implement `AppModel` state transitions**

Keep all asynchronous core calls in `AppModel`; views send user intents only. Store the active scan in a `Task` for cancellation. Publish progress by phase, not invented percentages unless the core later provides measured counts. Keep selected absolute URL in memory and show only the last path component where possible.

- [ ] **Step 3: Implement start and requirements views**

Use `fileImporter` for folders and `onDrop` restricted to file URLs. Display “Processed locally. Nothing is uploaded.” Display every resolved requirement before enabling Start Scan. The app must not auto-scan on drop.

- [ ] **Step 4: Implement results, evidence, and export views**

Show status as text plus symbol; provide severity filters; list findings with title, relative paths, expected condition, measured evidence, and suggested action; provide a separate inventory view; display the technical/artistic boundary next to `ready`. Use `fileExporter` or explicit save panels for each requested report. Never export automatically.

- [ ] **Step 5: Add accessibility identifiers and keyboard behavior**

Give controls stable accessibility labels and identifiers, preserve native Dynamic Type behavior, avoid color-only severity, ensure focus reaches result summary after scan, and make Escape invoke cancellation only during a scan.

- [ ] **Step 6: Run model tests and compile the app**

Run: `cd products/audio-delivery-preflight && swift test --filter AppModelTests`

Run: `cd products/audio-delivery-preflight && swift build --product AudioDeliveryPreflightApp`

Expected: tests pass and native executable compiles.

- [ ] **Step 7: Perform manual UI smoke checks**

Run: `cd products/audio-delivery-preflight && swift run AudioDeliveryPreflightApp`

Confirm folder chooser, drag/drop, visible requirements, cancellation, warning/error filters, relative evidence, light/dark appearance, keyboard navigation, and explicit report export. Confirm no source timestamp or checksum changes using the integration fixture.

- [ ] **Step 8: Commit the native workflow**

```bash
git add products/audio-delivery-preflight/Sources/AudioDeliveryPreflightApp products/audio-delivery-preflight/Tests/PreflightCoreTests/AppModelTests.swift
git commit -m "Build native audio preflight workflow"
```

### Task 9: Documentation, deterministic verification, and release-candidate gate

**Files:**
- Create: `products/audio-delivery-preflight/README.md`
- Create: `products/audio-delivery-preflight/PRIVACY.md`
- Create: `products/audio-delivery-preflight/LIMITATIONS.md`
- Create: `products/audio-delivery-preflight/scripts/verify.sh`
- Create: `products/audio-delivery-preflight/Tests/Fixtures/README.md`
- Modify: `products/audio-delivery-preflight/Package.swift`

**Interfaces:**
- Consumes: complete core, CLI, app, and test suite.
- Produces: one documented verification entry point and a locally verified release candidate; does not create a shop card or claim public availability.

- [ ] **Step 1: Write the verification script before documentation claims**

Create an executable script that uses strict shell flags and runs from its own product root:

```bash
#!/bin/zsh
set -euo pipefail
SCRIPT_DIR=${0:A:h}
PRODUCT_DIR=${SCRIPT_DIR:h}
cd "$PRODUCT_DIR"
swift package clean
swift test
swift build -c release --product audio-preflight
swift build -c release --product AudioDeliveryPreflightApp
swift run audio-preflight version
```

- [ ] **Step 2: Run verification and fix only observed failures**

Run: `products/audio-delivery-preflight/scripts/verify.sh`

Expected: clean build, all tests pass, both release products compile, version command succeeds.

- [ ] **Step 3: Write evidence-matched documentation**

Document supported formats and macOS floor, local-processing behavior, exact checks, CLI commands, preset semantics, exit codes, report schemas, build/test commands, and all deferred measurements. State that macOS framework support can affect readable compressed formats. State that technical `ready` is not artistic approval or distributor acceptance.

`PRIVACY.md` must state that scans make no intended network request and that exported reports use relative paths by default. `LIMITATIONS.md` must list unsupported judgments and measurements explicitly.

- [ ] **Step 4: Run privacy and claim scans**

Run:

```bash
rg -n -i "club.ready|guarantee|perfect|professional mastering|AI analysis|upload|loudness|true peak" products/audio-delivery-preflight
```

Expected: every match is either a prohibition/limitation, an accurate local-processing statement, or approved test text; no unsupported sales claim exists.

Run:

```bash
rg -n "/Users/|notgabriels|hologrampeoplemusic" products/audio-delivery-preflight --glob '!*.md'
```

Expected: no private absolute path or account identifier in code, reports, or fixtures.

- [ ] **Step 5: Verify source immutability on a copied real delivery**

Copy a non-sensitive Fate Through test delivery into a temporary directory chosen at execution time. Record file-relative SHA-256, sizes, and modification timestamps before scanning; scan while networking is unavailable or blocked; record the same values afterward; compare exactly. Do not add the real delivery or report to Git.

Expected: source inventory is byte- and metadata-identical before and after; report contains relative paths only; measured properties agree with `afinfo`, `sips`, or another trusted local tool for the compared fields.

- [ ] **Step 6: Run repository-level regression checks**

Run: `node scripts/verify.mjs`

Run: `git diff --check`

Expected: the existing theme/shop verifier still passes and no whitespace errors exist.

- [ ] **Step 7: Commit documented local release candidate**

```bash
git add products/audio-delivery-preflight
git commit -m "Verify audio delivery preflight v1 candidate"
```

- [ ] **Step 8: Stop at the commercial boundary**

Report the literal local state. Do not add a buy button, create or edit a Gumroad product, set a price, sign/notarize, publish, conduct a zero-charge purchase, or claim the product is for sale without separately completing and reading back those provider and distribution gates.

## Final implementation verification

- [ ] Read the design specification again and map each non-deferred requirement to a passing test, manual check, or documentation section.
- [ ] Run `products/audio-delivery-preflight/scripts/verify.sh` from the repository root.
- [ ] Run `node scripts/verify.mjs` from the repository root.
- [ ] Run `git diff --check` and `git status --short`.
- [ ] Confirm existing payment links and shop content were not modified during product development.
- [ ] Record exact commit IDs and remaining commercial gates in the handoff.

