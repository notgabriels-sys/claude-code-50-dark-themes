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

### 2026-08-23 no-Apple-payment reconciliation

The complete verifier was rerun against clean no-Apple-payment commit `3b491319aebffc0661c3a510eaa0bf58cbb37b03`: 238 tests passed with zero failures, both optimized products built, the deterministic sample returned `ready`, source evidence remained unchanged, adversarial probes passed, and the Universal archive contract passed. A durable candidate was created with SHA-256 `9e96ef8c0f7b4be9f85e177a7f244ea91276100a92e03657e9dea97d2b8f4c64`. It contains exact `arm64` and `x86_64` executables with coherent ad-hoc signatures plus the customer-facing unsigned-installation disclosure. Its Gatekeeper assessment is rejected, as expected for the explicitly Developer-ID-unsigned and not-notarized route.

The exact packaged app launched and exposed the local-processing statement, chooser, drop zone, and all four preset choices. Selecting Digital Release updated the visible preset value. The native chooser opened on the packaged sample delivery. On chooser confirmation, the computer-control service disconnected while the application process remained alive and no new application crash report appeared. Folder-selection completion, requirements display, scanning, cancellation, results, exports, keyboard, VoiceOver, appearance, and quarantined-download behavior remain unverified; the disconnect is not counted as product success or product failure.

The final ZIP and sidecar were copied to a separate temporary location and the archive verifier passed there with the same hash, exact architecture set, ad-hoc signatures, rejected Gatekeeper state, clean source commit, internal manifest, packaged sample, and tamper checks. The copied ZIP was then independently extracted and its packaged app launched to the expected start view. This verifies copy, extraction, and launch of the frozen archive; it does not simulate the quarantine metadata added by a real browser/customer download.

The signed-in Gumroad catalog was read back on 2026-08-23. `Audio Delivery Preflight` remains **Unpublished** at €24. Its attached ZIP and sidecar still identify the older archive SHA-256 `82350f0b881480e7bc2d2794a1d9002c185676fe9a1f1d509164ff2c963929a4`, not the durable `bad90f9` candidate. No provider file, copy, price, refund policy, or publication state was changed during this reconciliation.

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
- For the selected no-Apple-payment route, disclose the unsigned/not-notarized status, expected Gatekeeper limitation, checksum verification, and manual opening path before purchase.
- Assemble, checksum, and independently open the customer archive.
- Create and read back the provider product, price, currency, tax presentation, delivery attachment, and live checkout only under separate authorization.
- Conduct a zero-charge test purchase only after the account owner explicitly authorizes that live action at that time, then independently open the customer download.

Until those gates are complete, this repository contains a local candidate, not a publicly available product and not a verified customer delivery.

## Universal Developer-ID-unsigned packaging gate

The release-packaging branch adds a repeatable assembly and independent-verification path for a Developer-ID-unsigned version 0.1.0 candidate. The packager first runs the complete product verifier, builds separate `arm64` and `x86_64` app and CLI executables, and combines each pair into an exact Universal binary without a single-architecture fallback. The package uses ad-hoc signatures only, which permit execution but establish no publisher identity or Apple trust. The real-binary packaging contract requires an explicitly named Universal ZIP and release root, `.app` structure, selected icon and bundle metadata, CLI, deterministic sample delivery, documentation, unsigned disclosure, source/build provenance, exact internal-manifest coverage, bundle identifier, version, macOS 14 floor, safe and unique archive paths, and matching external SHA-256 sidecar. It compares the packaged icon with the selected source asset and recorded provenance, verifies the signatures and Gatekeeper result, runs the packaged CLI against the included sample, confirms sample immutability, refuses overwrite, rejects a false external sidecar, and rejects changed archive content even behind a correctly recomputed external sidecar. The complete product verifier runs this packaging contract.

This closes the repeatable Universal bundle/archive-assembly portion of the release gate and records a durable candidate from clean commit `3b49131`. The archive must still be copied to an independent location, reverified, launched, exercised manually, and tested on an independent macOS 14 installation. Developer ID signing and notarization are intentionally not applicable to the selected no-Apple-payment route; prominent unsigned-installation disclosure and customer-path quarantine testing are required instead. Packaged-icon visual inspection, accessibility testing, legal acceptance, and commerce-provider verification remain open.

## Historical packaged-app smoke evidence

An earlier archive built at packaging correction commit `e6b5767` verified with SHA-256 `f0c77e521eb4220da9fa17f71359816d329dc9d611afa7b11a5dd9c694e37476`. That work established that removing every code signature prevents normal Apple Silicon execution, so Developer-ID-unsigned candidates use coherent ad-hoc signatures while explicitly claiming no publisher identity or notarization.

The earlier packaged `.app` launched without bypassing a security warning. Its accessibility tree exposed the named window, local-processing statement, labeled preset selector, labeled Choose Folder button, and labeled drop zone. The preset menu exposed General Audio, Stereo Premaster, Digital Release, and Custom; selecting Digital Release updated the selector value. The native chooser opened and navigated to the generated fixture. The computer-control service disconnected on chooser confirmation while the application process continued and no application crash report appeared. This is historical evidence only: folder-selection completion, scan, cancellation, result review, export, keyboard-only operation, assistive-technology validation, and the newly selected icon remain unverified on the reconciled package.
