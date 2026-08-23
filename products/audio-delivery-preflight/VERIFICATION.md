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

### 2026-08-23 low-disk diagnostic replacement

An exact packaged-candidate run exposed a customer-facing diagnostic defect when the host had less than the documented 2 GiB temporary-staging reserve. Trusted `afinfo` and `sips` inspection still confirmed that the sample WAV and PNG were valid, but audio and image staging failures were reported as generic unreadable-media errors with advice to replace or re-export the files. Focused regression tests first reproduced the mismatch through the existing `TrustedFileAccessError.insufficientStagingCapacity` path. Source commit `41beb7477bce4dd16f60d4a089c8a3c6f924f83a` now emits dedicated `inspection.audio-staging-capacity` and `inspection.image-staging-capacity` findings titled “Not enough temporary-disk space,” records the minimum reserve in evidence, and tells the customer to free disk space rather than replace a valid file based on that finding alone.

The complete clean-source verifier passed at that commit with 240 tests and zero failures, both optimized products, the deterministic `ready` scan, all report exports, trusted-tool comparisons, source immutability, adversarial content and preset probes, and the real Universal package contract. No restart or security-setting change was used. After safe cache cleanup and normal macOS storage reclamation, the earlier host-wide `spctl` internal error cleared; both packaging and an independent durable-copy verification returned the expected unsigned Gatekeeper result, `rejected (exit 3)`.

The replacement archive is 2,136,210 bytes with SHA-256 `cb175ec7a22413ae8d2a024f31471766da4dd98bac84718cfbb28184a3bc9ebf`; its external sidecar is 126 bytes. The verified durable pair is in `Audio Delivery Preflight 0.1.0 Universal Unsigned 41beb74`. A verifier run against that durable ZIP freshly extracted it, checked ZIP and manifest coverage, required exact `arm64 x86_64` executables and coherent ad-hoc signatures, confirmed source commit `41beb74` and a clean packaging tree, ran the packaged CLI against the included sample, produced HTML, JSON, and checksum reports, required `ready`, proved the sample unchanged, and passed identity/private-path leakage checks.

A fresh extraction of the exact replacement `41beb74` app launched normally and exposed the named window, local-processing statement, preset selector, Choose Folder control, and drop zone. Its native chooser opened directly on the included `Sample Delivery Package`, with Artwork, Credits, and Masters visibly present. The computer-control pipe closed when Open was clicked, before post-selection state could be read; no later UI state is inferred, and Start Scan was not clicked blindly. The Review requirements evidence below belongs to the superseded `60b9638` app and is retained only as historical smoke evidence.

On 2026-08-24, the exact replacement ZIP and 126-byte sidecar were uploaded to the existing unpublished Gumroad product `vddnq` without changing its price, refund period, receipt, legal, tax, seller, or publication state. After saving and reloading the editor, Gumroad's folder download contained exactly the 2,136,210-byte replacement ZIP and 126-byte sidecar. The downloaded ZIP computed as SHA-256 `cb175ec7a22413ae8d2a024f31471766da4dd98bac84718cfbb28184a3bc9ebf`, and the downloaded sidecar declared the same value. The superseded provider folder was separately downloaded and identified as SHA-256 `be7a195bbbb3f57a47be4af792b5c214416181f3c95f657d1d3649199fed6d04` before deletion. It was removed only after the replacement readback passed. A full saved-page reload then showed one delivery folder, and a second download of that sole remaining folder again contained exactly the replacement pair and returned `cb175ec7...9ebf`. The superseded durable local pair remains available for rollback. No publication, purchase, payment, customer email, or public promotion occurred.

### Superseded 60b9638 candidate and pre-replacement Gumroad state

The selected customer archive was assembled from clean merge commit `60b963804983c5b6d121761687899981e89d46f9`, which already contains the customer-README packaging correction. The product subtree has no diff from `60b9638` to clean branch tip `c4c9bff`; the later tip changes only the storefront index, so it does not require a package rebuild. The archived `README.md` and source `CUSTOMER_README.md` have the same SHA-256, `0525b893a82077d5eb8d384ae78fb7fbf9b52fac2fbf75d0515d8698606651bf`.

The package records that the complete product verifier passed, with exact `arm64` and `x86_64` executables, coherent ad-hoc signatures, source commit `60b9638`, and the customer-facing unsigned-installation disclosure. Its Gatekeeper assessment is rejected, as expected for the explicitly Developer-ID-unsigned and not-notarized route. The selected archive is 2,132,152 bytes with SHA-256 `be7a195bbbb3f57a47be4af792b5c214416181f3c95f657d1d3649199fed6d04`; the external sidecar is 126 bytes.

The exact packaged app launched and exposed the local-processing statement, chooser, drop zone, and all four preset choices. Selecting Digital Release updated the visible preset value. A later clean launch from a fresh extraction of the durable `60b9638` ZIP was attributed to the exact executable path after two older idle instances with the same bundle identifier were closed. The native chooser selected the packaged `Sample Delivery Package`, and the exact app visibly reached Review requirements with that folder and an enabled Start Scan control. No Gatekeeper bypass or security-setting change was used. The computer-control service disconnected on chooser confirmation and subsequently failed while reading that exact review screen, although the exact app process remained alive. Start Scan was not clicked blindly. Scanning, cancellation, results, exports, keyboard, VoiceOver, appearance, and quarantined-download behavior therefore remain unverified; the automation failure is not counted as product success or product failure.

The selected ZIP and sidecar were copied out of temporary storage to the durable folder `Audio Delivery Preflight 0.1.0 Universal Unsigned 60b9638`. The copied external sidecar returned `OK`, ZIP integrity testing reported no errors, and the copied sizes remained 2,132,152 and 126 bytes. A fresh extraction of that exact durable ZIP launched normally and reached Review requirements with the included sample. The exact GUI scan/export workflow and a browser-quarantined customer-copy workflow remain open.

A fresh run of `scripts/verify-release-archive.sh` against the durable ZIP on 2026-08-23 revalidated the external checksum, ZIP structure, internal manifest, required package files, architecture set, and all three ad-hoc signatures before stopping at the live Gatekeeper comparison. At that time the macOS 27.0 beta build `26A5406e` host returned `internal error in Code Signing subsystem` with exit 1 for the packaged app, Apple TextEdit, and `/usr/bin/true`, while assessments remained enabled. Unified logs also showed repeated `syspolicyd` quarantine-process initialization failures. That was a host-wide Gatekeeper-assessment outage, not evidence that the archive changed or became accepted. No security setting or policy service was altered. The exact packaged CLI checks after that verifier stop were run directly and passed. The outage later cleared without a restart; the replacement `41beb74` archive now completes the full verifier with the expected `rejected (exit 3)` result.

The signed-in Gumroad product `vddnq` was reconciled and read back on 2026-08-23. At that historical snapshot, `Audio Delivery Preflight` remained **Unpublished** at EUR 24 with the 14-day money-back guarantee, and its delivery folder contained the cleanly named `60b9638` ZIP and 126-byte sidecar. Gumroad's folder download contained exactly those two files; the sidecar check returned `OK` for SHA-256 `be7a195b...6d04`. The superseded `9e96ef8c...4c64` ZIP and sidecar and an earlier failed zero-byte upload were removed only after that `60b9638` download was verified. The receipt message and `Download Audio Preflight` button were read back, and the public route explicitly said the product was not currently for sale with no purchase button. The 2026-08-24 replacement reconciliation above supersedes only the attached provider files; it does not imply publication or customer delivery.

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
- Complete owner review of seller identity, consumer information, tax treatment and presentation, payout, and customer licence terms. The saved provider attachment is verified; live checkout and customer delivery remain separate gates.
- Conduct a zero-charge test purchase only after the account owner explicitly authorizes that live action at that time, then independently open the customer download.

Until those gates are complete, this repository contains a local candidate, not a publicly available product and not a verified customer delivery.

## Universal Developer-ID-unsigned packaging gate

The release-packaging branch adds a repeatable assembly and independent-verification path for a Developer-ID-unsigned version 0.1.0 candidate. The packager first runs the complete product verifier, builds separate `arm64` and `x86_64` app and CLI executables, and combines each pair into an exact Universal binary without a single-architecture fallback. The package uses ad-hoc signatures only, which permit execution but establish no publisher identity or Apple trust. The real-binary packaging contract requires an explicitly named Universal ZIP and release root, `.app` structure, selected icon and bundle metadata, CLI, deterministic sample delivery, documentation, unsigned disclosure, source/build provenance, exact internal-manifest coverage, bundle identifier, version, macOS 14 floor, safe and unique archive paths, and matching external SHA-256 sidecar. It compares the packaged icon with the selected source asset and recorded provenance, verifies the signatures and Gatekeeper result, runs the packaged CLI against the included sample, confirms sample immutability, refuses overwrite, rejects a false external sidecar, and rejects changed archive content even behind a correctly recomputed external sidecar. The complete product verifier runs this packaging contract.

This closes the repeatable Universal bundle/archive assembly, durable-copy CLI verification, and unpublished Gumroad attachment-readback portions of the release gate for replacement source commit `41beb74` and archive SHA-256 `cb175ec7...9ebf`. The current local replacement verifies completely, including a valid live Gatekeeper rejection. Gumroad's sole remaining delivery folder was downloaded after cleanup and matched the same replacement checksum, but that seller-side readback is not a buyer checkout or verified customer delivery. The exact replacement GUI scan/export workflow, browser-quarantined customer workflow, and independent macOS 14 installation still require testing. Developer ID signing and notarization are intentionally not applicable to the selected no-Apple-payment route. Packaged-icon visual inspection, accessibility testing, customer-path quarantine behavior, legal acceptance, seller/tax review, and public publication remain open.

## Historical packaged-app smoke evidence

An earlier archive built at packaging correction commit `e6b5767` verified with SHA-256 `f0c77e521eb4220da9fa17f71359816d329dc9d611afa7b11a5dd9c694e37476`. That work established that removing every code signature prevents normal Apple Silicon execution, so Developer-ID-unsigned candidates use coherent ad-hoc signatures while explicitly claiming no publisher identity or notarization.

The earlier packaged `.app` launched without bypassing a security warning. Its accessibility tree exposed the named window, local-processing statement, labeled preset selector, labeled Choose Folder button, and labeled drop zone. The preset menu exposed General Audio, Stereo Premaster, Digital Release, and Custom; selecting Digital Release updated the selector value. The native chooser opened and navigated to the generated fixture. The computer-control service disconnected on chooser confirmation while the application process continued and no application crash report appeared. This is historical evidence only: folder-selection completion, scan, cancellation, result review, export, keyboard-only operation, assistive-technology validation, and the newly selected icon remain unverified on the reconciled package.
