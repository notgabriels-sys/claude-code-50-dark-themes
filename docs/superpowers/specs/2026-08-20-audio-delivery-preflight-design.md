# Audio Delivery Preflight v1 Design

**Date:** 2026-08-20  
**Status:** Approved design  
**Target:** macOS-native application with a shared Swift core and command-line interface

## Purpose

Audio Delivery Preflight checks the technical completeness and consistency of an audio-delivery folder before it leaves a user's computer. It is intended for independent artists, producers, mixing and mastering engineers, and small labels.

The product validates files and explicit delivery requirements. It does not judge artistic quality, replace professional listening, guarantee distributor acceptance, or describe audio as "club ready."

Version one must be local, private, deterministic, evidence-backed, and non-destructive.

## Product boundaries

The application may inventory files, read supported media properties, calculate checksums, evaluate visible preset rules, and export reports to a destination selected by the user.

It must not:

- upload audio or make a network request during a scan;
- delete, move, rename, convert, normalize, or rewrite source files;
- follow symbolic links;
- read outside the selected folder;
- rewrite metadata or artwork;
- inspect or repair DAW projects;
- publish a release or connect to a payment or distribution provider;
- infer artistic quality from technical measurements.

Failed measurements remain unknown. They must never be replaced with guessed values.

## Recommended architecture

The implementation is a Swift package with three targets:

1. `PreflightCore`, a platform-aware library containing the domain model, inventory, inspection, rules, and reporting.
2. `audio-preflight`, a command-line executable over `PreflightCore`.
3. `AudioDeliveryPreflightApp`, a SwiftUI macOS application over the same core.

The core and CLI are implemented and tested before the graphical interface. The CLI is a supported interface, not throwaway code.

```text
AudioDeliveryPreflight
├── PreflightCore
│   ├── Domain
│   ├── Inventory
│   ├── Audio
│   ├── Artwork
│   ├── Checksums
│   ├── Rules
│   └── Reports
├── audio-preflight
└── AudioDeliveryPreflightApp
```

All presentation layers consume the same scan request, scan result, findings, and preset definitions. No validation rule may exist only in the app or only in the CLI.

## Repository layout

The product lives under `products/audio-delivery-preflight/` so it does not alter the existing static storefront or other product packages while under development.

```text
products/audio-delivery-preflight/
├── Package.swift
├── README.md
├── Sources/
│   ├── PreflightCore/
│   ├── AudioPreflightCLI/
│   └── AudioDeliveryPreflightApp/
├── Tests/
│   ├── PreflightCoreTests/
│   ├── Fixtures/
│   └── ReportSnapshotTests/
├── Presets/
├── docs/
└── scripts/
```

## Scan workflow

1. The user selects or drops one folder.
2. The user selects a built-in or custom preset.
3. The application displays the active requirements before scanning.
4. The core creates a bounded, non-recursive-through-symlinks inventory.
5. Inspectors extract supported audio and image properties.
6. SHA-256 is calculated for regular files included in the delivery inventory.
7. Rules compare measured evidence with the selected preset.
8. The result contains findings, inventory, scan metadata, and an overall requirement status.
9. The user may export HTML, JSON, and checksum reports.
10. The selected source folder remains unchanged.

A single unreadable file does not abort the rest of the scan. Cancellation returns a clearly incomplete result and does not export a report automatically.

## Domain model

### Scan request

A scan request contains:

- canonical selected-folder URL;
- selected preset and its resolved rule definitions;
- application and engine version;
- optional report-output destinations chosen by the user.

### Inventory entry

Each inventory entry contains:

- path relative to the selected folder;
- normalized filename and extension for comparison without changing the source;
- file category;
- byte size;
- modification timestamp;
- file-kind status: regular, directory, symbolic link, or unsupported special item;
- SHA-256 when calculated successfully;
- inspection status and evidence.

Absolute paths are available only in process memory for file access. Exported reports use relative paths by default.

### Finding

Every finding contains:

- stable rule identifier;
- severity: error, warning, information, or pass;
- short title;
- human-readable explanation;
- affected relative paths;
- measured evidence;
- expected condition;
- suggested next action;
- rule origin: engine fact or selected preset;
- engine version.

### Overall status

The user-facing status is:

- `ready`: no errors or warnings;
- `needsReview`: one or more warnings and no errors;
- `requirementsNotMet`: one or more errors;
- `incomplete`: cancelled scan or a scan-level failure that prevents a reliable conclusion.

`ready` means only that the selected technical requirements passed. The interface must state that it is not an artistic release-readiness judgment.

## Inventory and filesystem safety

The scanner recursively inventories normal directories beneath the selected root. It does not follow symbolic links. A symbolic link is recorded as an informational finding by default and may become a warning through a preset.

The scanner must verify that every resolved file it opens remains beneath the canonical selected root. Files that fail that check are not opened and produce an error.

Hidden macOS service files such as `.DS_Store` are recorded separately and excluded from delivery totals and checksums by default. Presets may make their presence visible as a warning.

Special filesystem objects are never opened as regular delivery files. Permission failures and files that disappear during scanning produce evidence-backed findings and do not crash the scan.

## Audio inspection

Initial recognized formats are WAV, AIFF, FLAC, MP3, and M4A/AAC when the installed macOS media frameworks can read them.

The first implementation extracts:

- container and audio encoding when available;
- duration;
- channel count;
- sample rate;
- PCM bit depth when meaningful and available;
- readability;
- embedded metadata fields exposed reliably by the inspection layer.

Rules may identify:

- unreadable or unsupported audio;
- mixed sample rates, PCM bit depths, or channel counts;
- formats disallowed by the selected preset;
- empty or implausibly short audio;
- missing required audio roles;
- multiple ambiguous candidates for one required role;
- duration differences between files explicitly classified as related versions;
- exact duplicates.

Version one does not include integrated loudness, loudness range, true peak, inter-sample clipping, phase quality, tonal balance, dynamic quality, or mastering recommendations.

Sample-peak scanning may be added during version-one implementation only after PCM fixtures prove the measurement and the interface labels it strictly as sample peak. Its absence does not block the initial release candidate.

## Artwork inspection

Initial recognized formats are PNG, JPEG, TIFF, and HEIC when macOS can decode them.

The inspector extracts:

- pixel width and height;
- aspect ratio;
- format;
- color model when available;
- alpha-channel presence when determinable;
- byte size;
- readability.

Preset rules may require minimum or exact dimensions, square artwork, permitted formats, absence of alpha, and maximum byte size. The application makes no aesthetic or rights-clearance judgment.

## Filenames and delivery roles

Filename rules may identify leading or trailing whitespace, repeated whitespace, preset-defined forbidden characters, excessive length, inconsistent separators, missing track numbers, case-insensitive collisions, missing required tokens, and ambiguous suffixes such as `final2`, `newfinal`, `latest`, or `use-this`.

Ambiguous naming is a warning unless a preset explicitly makes the convention mandatory.

A preset defines required and optional delivery roles, such as main master, premaster, instrumental, radio edit, clean version, artwork, credits, metadata, notes, or emergency playback render. Roles are matched through visible filename patterns. The result reports exactly which pattern matched each file. Ambiguous matches remain warnings until the user explicitly resolves them; the scanner does not silently choose a file.

## Duplicate detection

Files with the same SHA-256 checksum are exact duplicates. The report groups same-content files, lists their relative paths, and calculates duplicate byte totals.

The application does not delete duplicates. Perceptual or near-duplicate audio comparison is deferred.

## Presets

Version one ships with four transparent presets.

### General Audio Delivery

Inventories and checks readability without mandating sample rate or bit depth. It warns about inconsistent properties and ambiguous filenames. Artwork and documents are optional.

### Stereo Premaster Delivery

Requires at least one readable, lossless stereo audio file. It warns about multiple unidentified premaster candidates and inconsistent audio properties. It does not impose universal loudness, peak, or headroom targets.

### Digital Release Package

Requires at least one readable lossless main master, artwork, and a metadata or credits document. Artwork expectations are visible and editable. It checks role identification and package consistency without claiming distributor acceptance.

### Custom

The user can configure required roles, allowed formats, sample rates, bit depths, channel counts, artwork requirements, filename patterns, and severity overrides.

Preset requirements are displayed before scanning and serialized into exported JSON so a result remains auditable.

## Reports

Version one exports:

- an accessible, self-contained HTML report;
- a versioned JSON report;
- a plain-text SHA-256 checksum manifest.

A CSV inventory may be included if it does not delay the core release.

Reports contain the relative inventory, findings, resolved preset, engine version, scan timestamp, completion status, and a statement that source files were not intentionally modified. HTML content is escaped. JSON keys and finding identifiers remain stable within a major schema version.

Reports do not include absolute source paths by default. A report export failure never changes or removes the scan result shown in the app.

## Command-line interface

Primary usage:

```bash
audio-preflight scan "/path/to/delivery" \
  --preset digital-release \
  --report-html "./report.html" \
  --report-json "./report.json" \
  --checksums "./SHA256SUMS.txt"
```

Supporting commands:

```bash
audio-preflight presets
audio-preflight preset show digital-release
audio-preflight version
```

Exit codes are:

- `0`: complete scan, no errors or warnings;
- `1`: complete scan, warnings and no errors;
- `2`: complete scan, at least one error;
- `3`: invalid command or configuration;
- `4`: scan could not start;
- `5`: internal failure.

An interrupted scan exits nonzero and never reports requirements as passed.

## macOS interface

The SwiftUI app has four primary states:

1. Start: folder drop zone, Choose Folder button, preset selector, and local-processing statement.
2. Requirements: visible resolved rules and required roles with a Start Scan action.
3. Results: overall status, severity counts, filters, inventory, evidence panel, and Rescan action.
4. Export: report-format choices, user-selected destination, and source-immutability statement.

Recent folders are disabled by default. If later enabled by the user, they store only folder references needed for convenience and can be cleared.

The interface must remain usable with VoiceOver, keyboard navigation, increased text size, and light or dark macOS appearance.

## Error handling

Errors are scoped as narrowly as possible:

- an unreadable file creates a file finding;
- an unsupported format creates an informational finding or preset warning;
- a failed checksum creates a finding for that file;
- a vanished file creates a race-condition finding;
- an export failure leaves the scan result intact;
- an invalid preset prevents scanning and identifies the invalid field;
- an unrecoverable root access failure produces an incomplete scan, not a requirements verdict.

Diagnostic details may be recorded locally for the current session, but reports expose no stack traces, credentials, or unrelated filesystem paths.

## Testing strategy

### Unit tests

Unit tests cover canonical folder boundaries, symlink handling, file classification, supported property extraction, image inspection, SHA-256 calculation, duplicate grouping, filename rules, role matching, severity and status calculation, path redaction, JSON stability, HTML escaping, and CLI exit codes.

### Generated and stored fixtures

Small, original fixtures cover valid mono and stereo PCM WAV, differing sample rates and bit depths, empty and truncated files, exact duplicates under different names, unsupported extensions, square and non-square images, artwork above and below thresholds, ambiguous filenames, missing roles, symlink escape attempts, and mixed delivery packages.

### Integration tests

Integration packages cover a valid digital release, missing artwork, mixed sample rates, unreadable main master, ambiguous duplicate masters, a symlink leaving the root, and harmless unsupported extras.

### Manual release-candidate checks

Before sale, the candidate must scan a copied real Fate Through delivery, have reported properties compared with trusted tools, prove that source bytes and metadata remain unchanged, complete a scan with networking unavailable, handle accented and non-Latin filenames, handle spaces and long paths, survive cancellation, export every required report, and run on the declared oldest supported macOS version.

## Deferred scope

The following are explicitly deferred: loudness and true-peak measurement, perceptual comparison, waveform display, audio conversion, automatic renaming, metadata editing, Ableton inspection, cloud history, accounts, collaboration, subscriptions, payment integration, Windows and Linux graphical interfaces, App Store distribution, AI sonic advice, mastering recommendations, and artistic release-readiness scoring.

## Commercial completion gates

The product is not described as for sale until these separate gates are verified:

1. Core implementation and automated tests complete.
2. Known fixtures produce correct results.
3. A copied real delivery passes manual comparison and immutability checks.
4. Native interface and all required exports complete.
5. Clean release build verified on the supported macOS range.
6. Privacy, limitations, installation, and support documentation complete.
7. Signing and notarization complete, or the unsigned installation limitation disclosed before purchase.
8. Download package assembled and independently verified.
9. Gumroad product, price, tax presentation, and delivery attachment read back from the provider.
10. Public product page and checkout verified.
11. A zero-charge test purchase occurs only with Gabriel's explicit confirmation at that time.
12. The resulting customer download is opened and verified independently.

Local code, a successful build, a static shop card, or a provider editor does not establish public availability or a working customer delivery.

## Acceptance criteria for v1

Version one is complete when a non-technical macOS user can choose a folder and visible preset, complete a fully local scan, understand every result and its evidence, export HTML/JSON/checksum reports, and verify that the source folder was not modified; and when the same engine can perform the scan through a documented CLI with deterministic exit codes.

