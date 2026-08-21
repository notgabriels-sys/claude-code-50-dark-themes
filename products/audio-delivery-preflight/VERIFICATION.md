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
8. compares source-relative SHA-256, size, fractional/subsecond modification time (`stat %Fm` under the fixed `C` locale), and mode before and after the scan;
9. compares the reported WAV and PNG measurements with `afinfo` and `sips`; and
10. runs release-binary probes proving that a renamed AAC cannot satisfy the built-in lossless role and that a category-agnostic Custom role carrying audio-only constraints cannot return `ready`.

The generated fixture contains only repository-generated test data: a one-second stereo 48 kHz 24-bit PCM WAV, a 3000 x 3000 RGB PNG, and synthetic credits text.

The deterministic candidate run on 2026-08-21 against tracked tree `669ae147937c77b8511fbe3aa0328805901bcce6` observed the following. Final reconciliation commit `1dacf31` was then confirmed byte-for-byte identical to that tracked tree before the verification record was updated.

- 182 tests executed with 0 failures;
- successful release builds of both products;
- `Audio Delivery Preflight 0.1.0` from the version command;
- a Digital Release result of `ready` with 6 inventory entries, 0 errors, and 0 warnings;
- successful HTML, JSON, and checksum-manifest writes outside the fixture; and
- matching fixture provenance, source SHA-256/size/subsecond-mtime/mode evidence, report privacy checks, and `afinfo`/`sips` measurements;
- a renamed AAC release probe that returned `requirementsNotMet` with exit code 2; and
- an invalid category-agnostic Custom role carrying `allowedEncodings: ["Linear PCM"]` that returned invalid-configuration exit code 3, never printed `Status: ready`, and left its source unchanged.

Additional release-binary probes observed:

- at earlier reviewed implementation commit `97dabfd`, the README custom-preset JSON imported through `--preset-file`, resolved before scanning, returned `ready` with exit code 0, did not print its private import path, and retained identical preset and fixture SHA-256 evidence;
- synthetic AAC-LC M4A bytes with documented SHA-256 `f995d9f26e1ea62f9f3a12e6569f870e28b25a0d1ee3da9169076a8137aed089`, renamed to `Masters/Main Master.wav`, returned `requirementsNotMet` with exit code 2, retained inspected `M4A`/`AAC` evidence, emitted both `audio.filename-content-mismatch` and `role.disallowed-encoding.main-master`, emitted no unreadable-audio conflict, and retained identical source SHA-256/size/subsecond-mtime/mode evidence; and
- the repository verifier passed with 50 themes, 50 gallery cards, 3 PayPal links, and the safe extension-install command. The storefront and payment surfaces were not changed by this product fix wave.

## Requirement-to-evidence map

| Non-deferred requirement | Evidence |
|---|---|
| macOS 14 deployment floor and Swift 6 language mode | `Package.swift`; both release products compile in the deterministic gate. Oldest-supported-host execution remains a separate gate. |
| Local scan engine with no intended network request | `PreflightCore` and presentation targets contain no networking API; `PRIVACY.md` documents the boundary. Network-observed/offline validation of the final distribution build remains open. |
| Source files are never intentionally deleted, moved, renamed, converted, normalized, rewritten, or uploaded | Filesystem-boundary unit tests, scan fingerprint tests, report-destination tests, and the generated fixture's before/after SHA-256, size, fractional/subsecond mtime, and mode comparison. |
| Symbolic links are recorded and never followed; inventory and regular-file access remain beneath the selected root | Descriptor-anchored inventory, checksum, audio, image, preset-import, scan-race, and report-destination regressions, including deterministic selected-root and ancestor swaps. |
| Failed or unavailable constrained measurements remain unknown and cannot pass | Domain, inspector, checksum, rule, and scan-orchestration tests cover unknown sample rate, PCM bit depth, channel count, artwork dimensions, and content encoding, including a single readable file under every consistency-enabled built-in. |
| Lossless roles are proven from inspected content rather than filename alone | Preset, rule-engine, inspector, production-scan, and adversarial release-binary evidence accept intended Linear PCM/FLAC/ALAC values and reject AAC, MP3, and unknown encodings even under a lossless-looking extension. |
| Transparent built-in and Custom presets, consistency checks, and role matching | Preset and rule-engine tests plus `audio-preflight preset show digital-release`; requirements print before the CLI scan summary. The app provides an in-memory schema-complete Custom editor, while the CLI imports a bounded, no-follow schema-`1.0` preset file. Resolver, app, CLI, and release-binary regressions reject audio-only role constraints or active media readability unless the role category supports them; changing the app category clears fields that become hidden. |
| Checksum state remains independent from media inspection state | Domain, checksum, duplicate-group, scan, manifest, and JSON key-set regressions preserve `.notInspected`, `.succeeded`, and `.failed` inspection while recording an explicit checksum status. |
| Media staging is bounded, cancellation-aware, and cleaned after cooperative cancellation | Audio and image inspector tests cover chunked copies, source mutation, leaf/ancestor swaps, and staging cleanup. The image inspector registers cleanup immediately after staging and has a deterministic cancel-after-stage regression; audio has a deterministic mid-copy cancellation regression. Both propagate cancellation rather than reporting unreadable media. |
| Embedded metadata has an enforceable resource boundary | Production scans deliberately do not request AVFoundation common-metadata collections or string values because the framework materializes complete values before caller-side limits can apply. A real tagged-M4A regression first confirms that AVFoundation can see the tags, then proves the production inspector leaves metadata empty while preserving core audio measurements. The versioned report model retains the field for compatibility, and credits/metadata documents remain filename-matched package files whose contents are not parsed. |
| Deterministic exit codes and interrupted-scan behavior | CLI tests cover ready, warnings, errors, invalid configuration, incomplete scans, and export failures. |
| Accessible native workflow with explicit selection, editable requirements, scan, results, and export phases | App-model tests cover Custom/Digital Release editing state, typed validation, role assignments, and the workflow. The exact-final temporary-bundle smoke below covers launch, local-only copy, chooser, and requirements rendering; an earlier broader workflow smoke covers results, filters, inventory, and exports. Final-build drag/drop, manual cancellation, keyboard-only, and assistive-technology validation remain open. |
| Relative, private, stable reports | Intentional JSON schema-`1.0` key-set/privacy tests, HTML escaping/accessibility tests, checksum-manifest tests, and exact fixture report inspection cover explicit inspection/checksum states, role assignments, relative paths, and the production-empty compatibility metadata field. |
| Technical `ready` is not artistic approval or distributor acceptance | App, CLI, HTML report, README, and limitations copy; claim scan checks prohibited marketing language. |
| Required Digital Release roles can produce a real `ready` result | Generated fixture exact CLI happy path with lossless main master, readable artwork, and credits document. |

## Native workflow evidence

On 2026-08-21, after confirming final reconciliation commit `1dacf31` was byte-for-byte identical to the fully verified tracked tree, the release `AudioDeliveryPreflightApp` binary was wrapped only in a temporary ad-hoc signed `.app` with a test bundle identifier. It was not installed, signed for distribution, notarized, archived for customers, or published. The host was macOS 27.0 (26A5406e).

The exact-final short smoke observed:

- the Start view with “Processed locally. Nothing is uploaded,” the preset selector, chooser, and non-automatic drop-zone explanation;
- explicit selection of the deterministic repository fixture through the folder chooser;
- transition to “Review requirements” without starting a scan;
- display of only the fixture folder's final name, not its absolute path;
- resolved General Audio requirements and the explicit Delivery roles section; and
- a separate Start Scan action, confirming that folder selection still does not auto-scan.

An earlier broader temporary-bundle smoke at implementation commit `97dabfd` observed the chooser, General requirements, a controlled scan with expected duplicate and ambiguous-version warnings, distinct finding selection and details, severity filtering, the six-entry relative inventory, HTML/JSON/SHA-256 exports, and the no-overwrite export guard. It also observed Digital Release requirements and a `requirementsNotMet` result, plus the in-memory Custom editor. The controlled source fixture retained identical SHA-256, size, and modification-time evidence across that smoke. This earlier interaction evidence is not presented as an exact-final UI pass after the later role-transparency changes.

## Copied real-delivery gate

A bounded, read-only search of standard local Documents, Downloads, and Music locations did not identify a clearly suitable non-sensitive delivery package. Candidate-named directories alone do not prove public/non-sensitive status, and no searched directory clearly supplied the required audio, artwork, and document combination. No private delivery was copied, opened, scanned, or committed for this gate.

Therefore the copied-real-delivery immutability check, offline-network scan, multi-format trusted-tool comparison, and complete-package manual review remain **not performed**. The generated fixture is deterministic integration evidence, not a substitute for this commercial release gate.

## Remaining release and commercial gates

- Repeat the complete app workflow against the final distributable build: Finder drag and drop, manual cancellation, filters, each repeated finding, inventory, and all exports.
- Run VoiceOver, keyboard-only, increased-text, light-appearance, and dark-appearance checks against the final distributable build.
- Scan a copied, explicitly approved non-sensitive complete real delivery and compare every source file before and after.
- Compare supported properties with trusted local tools for more than one audio and artwork format.
- Observe or deny network access while scanning the final distribution build.
- Run on an independent Mac or virtual machine at the declared macOS 14 floor.
- Build a distributable `.app`, then code-sign and notarize it or disclose the unsigned-installation limitation before purchase.
- Assemble, checksum, and independently open the customer archive.
- Create and read back the provider product, price, currency, tax presentation, delivery attachment, and live checkout only under separate authorization.
- Conduct a zero-charge test purchase only after the account owner explicitly authorizes that live action at that time, then independently open the customer download.

Until those gates are complete, this repository contains a local candidate, not a publicly available product and not a verified customer delivery.
