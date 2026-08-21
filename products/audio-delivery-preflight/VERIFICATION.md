# Verification record

This record separates locally observed evidence from unfinished distribution claims. It contains no private source path, customer filename, source checksum, account identifier, or customer material.

## Deterministic candidate gate

Run from any working directory:

```bash
/absolute/path/to/products/audio-delivery-preflight/scripts/verify.sh
```

The script resolves its own product root and, with strict shell error handling:

1. cleans SwiftPM build state;
2. runs the complete test suite;
3. builds the `audio-preflight` and `AudioDeliveryPreflightApp` release products;
4. verifies the version command;
5. independently regenerates the original `valid-digital-release` fixture and compares every generated file with the committed bytes;
6. runs the release CLI with the Digital Release preset and explicit HTML, JSON, and SHA-256 destinations outside the fixture;
7. requires `ready`, checks stable JSON fields and relative paths, and rejects any report containing the fixture's absolute root;
8. compares source-relative SHA-256, size, modification time, and mode before and after the scan; and
9. compares the reported WAV and PNG measurements with `afinfo` and `sips`.

The generated fixture contains only repository-generated test data: a one-second stereo 48 kHz 24-bit PCM WAV, a 3000 x 3000 RGB PNG, and synthetic credits text.

The isolated committed-candidate run on 2026-08-21 observed:

- 124 tests executed with 0 failures;
- successful release builds of both products;
- `Audio Delivery Preflight 0.1.0` from the version command;
- a Digital Release result of `ready` with 6 inventory entries, 0 errors, and 0 warnings;
- successful HTML, JSON, and checksum-manifest writes outside the fixture; and
- matching fixture provenance, source immutability evidence, report privacy checks, and `afinfo`/`sips` measurements.

## Requirement-to-evidence map

| Non-deferred requirement | Evidence |
|---|---|
| macOS 14 deployment floor and Swift 6 language mode | `Package.swift`; both release products compile in the deterministic gate. Oldest-supported-host execution remains a separate gate. |
| Local scan engine with no intended network request | `PreflightCore` and presentation targets contain no networking API; `PRIVACY.md` documents the boundary. Network-observed/offline validation of the final distribution build remains open. |
| Source files are never intentionally deleted, moved, renamed, converted, normalized, rewritten, or uploaded | Filesystem-boundary unit tests, scan fingerprint tests, report-destination tests, and the generated fixture's before/after SHA-256, size, mtime, and mode comparison. |
| Symbolic links are recorded and never followed; regular-file access remains beneath the selected root | Inventory, checksum, audio, image, scan-race, and report-destination regression suites. |
| Failed measurements remain unknown | Domain, inspector, checksum, rule, and scan-orchestration tests. |
| Transparent built-in presets and role matching | Preset and rule-engine tests plus `audio-preflight preset show digital-release`; requirements print before the CLI scan summary. |
| Deterministic exit codes and interrupted-scan behavior | CLI tests cover ready, warnings, errors, invalid configuration, incomplete scans, and export failures. |
| Accessible native workflow with explicit selection, scan, results, and export phases | App-model tests and a prior native Start-screen smoke check. Full manual interaction and assistive-technology validation remain open. |
| Relative, private, stable reports | JSON schema key-set/privacy tests, HTML escaping/accessibility tests, checksum-manifest tests, and exact fixture report inspection. |
| Technical `ready` is not artistic approval or distributor acceptance | App, CLI, HTML report, README, and limitations copy; claim scan checks prohibited marketing language. |
| Required Digital Release roles can produce a real `ready` result | Generated fixture exact CLI happy path with lossless main master, readable artwork, and credits document. |

## Copied real-delivery gate

A bounded, read-only search of standard local Documents, Downloads, and Music locations did not identify a clearly suitable non-sensitive Fate Through delivery package. Candidate-named directories alone do not prove public/non-sensitive status, and no searched directory clearly supplied the required audio, artwork, and document combination. No private delivery was copied, opened, scanned, or committed for this gate.

Therefore the copied-real-delivery immutability check, offline-network scan, multi-format trusted-tool comparison, and complete-package manual review remain **not performed**. The generated fixture is deterministic integration evidence, not a substitute for this commercial release gate.

## Remaining release and commercial gates

- Complete the app workflow manually: chooser, Finder drag and drop, requirements, cancellation, filters, each repeated finding, inventory, and all exports.
- Run VoiceOver, keyboard-only, increased-text, light-appearance, and dark-appearance checks.
- Scan a copied, explicitly approved non-sensitive complete real delivery and compare every source file before and after.
- Compare supported properties with trusted local tools for more than one audio and artwork format.
- Observe or deny network access while scanning the final distribution build.
- Run on an independent Mac or virtual machine at the declared macOS 14 floor.
- Build a distributable `.app`, then code-sign and notarize it or disclose the unsigned-installation limitation before purchase.
- Assemble, checksum, and independently open the customer archive.
- Create and read back the provider product, price, currency, tax presentation, delivery attachment, and live checkout only under separate authorization.
- Conduct a zero-charge test purchase only after Gabriel explicitly confirms that live action at that time, then independently open the customer download.

Until those gates are complete, this repository contains a local candidate, not a publicly available product and not a verified customer delivery.
