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
10. runs release-binary probes proving that a renamed AAC cannot satisfy the built-in lossless role and that a category-agnostic Custom role carrying audio-only constraints returns exact invalid-configuration exit code 3 before requirements or scan output; and
11. imports a character-class regex spoof and requires exact invalid-configuration exit code 3, no requirements or scan output, and unchanged source evidence.

The generated fixture contains only repository-generated test data: a one-second stereo 48 kHz 24-bit PCM WAV, a 3000 x 3000 RGB PNG, and synthetic credits text.

The deterministic candidate run on 2026-08-21 against correction implementation commit `905e5daec9d8107e4bd91f11e19ed06d8573afb7` observed the following:

- 238 tests executed with 0 failures;
- successful release builds of both products;
- `Audio Delivery Preflight 0.1.0` from the version command;
- a Digital Release result of `ready` with 6 inventory entries, 0 errors, and 0 warnings;
- successful HTML, JSON, and checksum-manifest writes outside the fixture;
- matching fixture provenance, source SHA-256/size/subsecond-mtime/mode evidence, report privacy checks, and `afinfo`/`sips` measurements;
- a renamed AAC release probe that returned `requirementsNotMet` with exit code 2;
- an invalid category-agnostic Custom role carrying `allowedEncodings: ["Linear PCM"]` that returned invalid-configuration exit code 3 before requirements or scan output and left its source unchanged; and
- an imported role pattern `[\s*\d+]a*a*b` that returned invalid-configuration exit code 3 before requirements or scan output and left its source unchanged.

Additional release-binary probes observed:

- at earlier reviewed implementation commit `97dabfd`, the README custom-preset JSON imported through `--preset-file`, resolved before scanning, returned `ready` with exit code 0, did not print its private import path, and retained identical preset and fixture SHA-256 evidence;
- synthetic AAC-LC M4A bytes with documented SHA-256 `f995d9f26e1ea62f9f3a12e6569f870e28b25a0d1ee3da9169076a8137aed089`, renamed to `Masters/Main Master.wav`, returned `requirementsNotMet` with exit code 2, retained inspected `M4A`/`AAC` evidence, emitted both `audio.filename-content-mismatch` and `role.disallowed-encoding.main-master`, emitted no unreadable-audio conflict, and retained identical source SHA-256/size/subsecond-mtime/mode evidence;
- an unsafe imported regex whose apparent `\s*\d+` trigger occurs inside a character class was rejected structurally by the optimized release binary with exact exit code 3, the invalid-configuration message, no resolved requirements, scan summary, or status, and identical source SHA-256/size/subsecond-mtime/mode evidence; and
- the repository verifier passed with 50 themes, 50 gallery cards, 3 PayPal links, and the safe extension-install command. The storefront and payment surfaces were not changed by this product fix wave.

## Requirement-to-evidence map

| Non-deferred requirement | Evidence |
|---|---|
| macOS 14 deployment floor and Swift 6 language mode | `Package.swift`; both release products compile in the deterministic gate. Oldest-supported-host execution remains a separate gate. |
| Local scan engine with no intended network request | `PreflightCore` and presentation targets contain no networking API; `PRIVACY.md` documents the boundary. Network-observed/offline validation of the final distribution build remains open. |
| Source files are never intentionally deleted, moved, renamed, converted, normalized, rewritten, or uploaded | Filesystem-boundary unit tests, scan fingerprint tests, report-destination tests, and the generated fixture's before/after SHA-256, size, fractional/subsecond mtime, and mode comparison. |
| Symbolic links are recorded and never followed; inventory and regular-file access remain beneath the selected root | Descriptor-anchored inventory, checksum, audio, image, preset-import, scan-race, and report-destination regressions, including deterministic selected-root and ancestor swaps. |
| Inventory work is finite and never truncated into `ready` | Boundary regressions cover 50,000 total entries, depth 32, 20,000 names per directory, 4096 UTF-8 bytes per relative path, and 16 MiB aggregate relative-path text. Newline, DEL, and C1 names reserve their entry and raw path-byte work before path rejection, so invalid names cannot bypass global ceilings. Every over-limit resource maps to a specific visible empty `incomplete` result, including initial and post-scan inventory exhaustion. |
| Failed or unavailable constrained measurements remain unknown and cannot pass | Domain, inspector, checksum, rule, and scan-orchestration tests cover unknown sample rate, PCM bit depth, channel count, artwork dimensions, and content encoding, including a single readable file under every consistency-enabled built-in. |
| Lossless roles are proven from inspected content rather than filename alone | Preset, rule-engine, inspector, production-scan, and adversarial release-binary evidence accept intended Linear PCM/FLAC/ALAC values and reject AAC, MP3, and unknown encodings even under a lossless-looking extension. |
| Transparent built-in and Custom presets, consistency checks, and role matching | Preset and rule-engine tests plus `audio-preflight preset show digital-release`; requirements print before the CLI scan summary. The app provides an in-memory schema-complete Custom editor, while the CLI imports a bounded, no-follow schema-`1.0` preset file. Resolver and native-draft tests enforce 32 roles, 512 UTF-8 bytes per expression, 4096 UTF-8 bytes per other string, 4096 collection values and 1,048,576 configured-string bytes in aggregate, bounded repetition no higher than 256, normalized identifiers, required names, and control rejection. Built-in regex trust is locked to five explicitly reviewed literals. Custom regex tests require parser-observed adjacent structural `\s*\d+` for the sole two-variable exception and reject character-class, escaped, and extended-mode spoofs. The native editor checks raw limits before retaining, trimming, lowercasing, mapping, or incrementally parsing an edit. Resolver, app, CLI, and release-binary regressions also reject audio-only role constraints or active media readability unless the role category supports them; changing the app category clears fields that become hidden. |
| Checksum state remains independent from media inspection state | Domain, checksum, duplicate-group, scan, manifest, and JSON key-set regressions preserve `.notInspected`, `.succeeded`, and `.failed` inspection while recording an explicit checksum status. |
| Media staging and artwork measurement have enforceable resource ceilings | Boundary regressions cover 4 GiB audio and 256 MiB image staging limits, next-byte refusals before copying, overflow-safe temporary-volume capacity, the greater-of-2-GiB-or-10-percent reserve, cancellation, mutation, no-follow access, and cleanup. Artwork regressions cover positive dimensions, 100,000,000 pixels, overflow/extreme refusals, disabled ImageIO caching, and unknown alpha without a full-image decode. Resource refusals are non-ready. |
| Embedded metadata has an enforceable resource boundary | Production scans deliberately do not request AVFoundation common-metadata collections or string values because the framework materializes complete values before caller-side limits can apply. A real tagged-M4A regression first confirms that AVFoundation can see the tags, then proves the production inspector leaves metadata empty while preserving core audio measurements. The versioned report model retains the field for compatibility, and credits/metadata documents remain filename-matched package files whose contents are not parsed. |
| Deterministic exit codes and interrupted-scan behavior | CLI tests cover ready, warnings, errors, invalid configuration, incomplete scans, and export failures. The release invalid-role and unsafe-regex probes each require exact exit 3, the invalid-configuration message, no requirement or scan output, and unchanged source evidence. |
| Accessible native workflow with explicit selection, editable requirements, scan, results, and export phases | App-model tests cover Custom/Digital Release editing state, bounded storage, typed validation, structural regex rejection, role assignments, and the workflow. The temporary-bundle interaction evidence below predates correction commit `905e5da` and is historical, not an exact-final UI pass. A fresh final-build drag/drop, manual cancellation, keyboard-only, and assistive-technology pass remains open. |
| Relative, private, stable reports | Intentional JSON schema-`1.0` key-set/privacy tests, HTML escaping/accessibility tests, checksum-manifest tests, and exact fixture report inspection cover explicit inspection/checksum states, role assignments, relative paths, and the production-empty compatibility metadata field. Relative paths reject C0/DEL/C1 controls, all CLI sinks escape them defensively, and checksum manifests fail all-or-error instead of omitting malformed successful entries. |
| Technical `ready` is not artistic approval or distributor acceptance | App, CLI, HTML report, README, and limitations copy; claim scan checks prohibited marketing language. |
| Required Digital Release roles can produce a real `ready` result | Generated fixture exact CLI happy path with lossless main master, readable artwork, and credits document. |

## Historical native workflow evidence

No interactive native-app smoke was run against correction implementation commit `905e5da`. Automated app-model coverage, the complete package suite, and the optimized native release build passed, but those checks do not replace a current UI interaction pass.

On 2026-08-21, at earlier reconciliation commit `1dacf31`, the release `AudioDeliveryPreflightApp` binary was wrapped only in a temporary ad-hoc signed `.app` with a test bundle identifier. It was not installed, signed for distribution, notarized, archived for customers, or published. The host was macOS 27.0 (26A5406e).

That historical short smoke observed:

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

## Developer-ID-unsigned packaging gate

The release-packaging branch adds a repeatable assembly and independent-verification path for a Developer-ID-unsigned version 0.1.0 candidate. The package uses ad-hoc app and CLI signatures only, which permit execution but establish no publisher identity or Apple trust. The real-binary packaging contract requires an architecture-labelled ZIP and release root, `.app` structure, CLI, deterministic sample delivery, documentation, unsigned disclosure, source/build provenance, internal manifest, bundle identifier, version, macOS 14 floor, safe archive paths, and matching SHA-256 sidecar. It verifies the ad-hoc signatures, runs the packaged CLI against the included sample, confirms source immutability, refuses overwrite, and rejects a false sidecar. The complete product verifier runs this packaging contract.

This closes only the repeatable bundle/archive-assembly portion of the release gate. A real archive built from release binaries must still be copied to an independent location, reverified, launched, exercised manually, and tested under Gatekeeper. Developer ID signing, notarization, final icon work, independent macOS 14 testing, accessibility testing, and commerce-provider verification remain open.
