# Release checklist: Audio Delivery Preflight 0.1.0

Date opened: 2026-08-21
Owner: Gabriel Garcia Alonso

This checklist separates repository evidence, a local archive, a customer-tested delivery, and a public paid product. A checked repository or packaging item does not satisfy a later commercial gate.

## Pre-package

- [x] Repository history includes PR #1; the later hardening wave was independently reviewed and merged locally.
- [x] Exact replacement implementation passes 240 tests and both release builds.
- [x] Repository shop verifier passes without payment-surface changes.
- [x] Bundle identifier fixed as `com.gabrielgarciaalonso.AudioDeliveryPreflight`.
- [x] Marketing version fixed as `0.1.0`; build version fixed as `1`.
- [x] Minimum deployment target fixed as macOS 14.0.
- [x] Privacy and limitations documents included.
- [x] Selected icon master, provenance, `.icns`, bundle metadata, and package-contract checks are present.
- [ ] Inspect the packaged icon in Finder, Dock, light appearance, dark appearance, and small sizes. The exact `.icns` now passes direct dark-appearance visual review at 512, 32, and 16 pixels; Finder, Dock, and light appearance remain open.
- [ ] Customer license terms are drafted in `CUSTOMER_LICENSE_DRAFT.md`; seller legal review, verified identity, acceptance, rename to `LICENSE.txt`, and customer-archive inclusion remain open. “All rights reserved” metadata is not a substitute.
- [ ] Known critical bugs reviewed immediately before release.

## Package

- [x] Packaging command refuses an existing output path.
- [x] Package contains the `.app`, selected icon, CLI, sample delivery, README, privacy, limitations, build provenance, internal manifest, and explicit Developer-ID-unsigned disclosure.
- [x] App and CLI are exact Universal binaries containing only `arm64` and `x86_64`; packaging cannot silently fall back to one architecture.
- [x] Archive verifier checks the external and internal SHA-256 evidence, ZIP integrity, duplicate and unsafe paths, exact manifest coverage, required files, permissions, exact architecture set, ad-hoc signatures, identifier, source-commit format, version, macOS floor, icon digest, disclosure, and identity/path leakage.
- [x] Package contract runs the packaged CLI against the sample, confirms source immutability, refuses overwrite, rejects a false external sidecar, and rejects changed content even behind a correctly recomputed external sidecar.
- [x] Build the replacement unsigned release archive from clean source commit `41beb7477bce4dd16f60d4a089c8a3c6f924f83a`, including dedicated low-temporary-disk findings for audio and artwork staging failures.
- [x] Record archive SHA-256 `cb175ec7a22413ae8d2a024f31471766da4dd98bac84718cfbb28184a3bc9ebf` for the 2026-08-23 no-Apple-payment replacement candidate.
- [x] Copy the ZIP and checksum to `Audio Delivery Preflight 0.1.0 Universal Unsigned 41beb74` outside temporary storage, verify the external sidecar and ZIP structure there, and retain the earlier durable pair for rollback until provider readback succeeds.
- [x] Independently extract the exact durable `41beb74` archive, verify provenance, architecture, signatures, internal and external manifests, run its packaged CLI against the included sample, export all reports, require `ready`, and prove source immutability.
- [x] Normally launch a fresh extraction of the exact replacement app and open its native chooser directly on the included `Sample Delivery Package`; Artwork, Credits, and Masters were visible. The control connection dropped when Open was clicked, so post-selection state is not inferred.
- [x] Normally launch the exact replacement `41beb74` app and complete one packaged General Audio GUI happy path through `Ready`, result tabs, all three native report exports, and source-immutability verification. Review-requirements evidence from the superseded `60b9638` app remains historical only; the remaining manual matrix is tracked below.

## Selected unsigned distribution route

Apple Developer Program payment, Developer ID certificate creation, notarization, and stapling are **not applicable** to the route selected by Gabriel on 2026-08-23. Re-open those steps only if Gabriel explicitly changes that decision.

- [x] Confirm the Keychain contains no valid Developer ID signing identity; packaging fails closed rather than selecting an unintended identity.
- [x] Apply coherent ad-hoc signatures and verify them with `codesign --verify --deep --strict`.
- [x] Record the packaging-time and durable-copy Gatekeeper result as `rejected (exit 3)` rather than accepted or notarized. The earlier host-wide `spctl` internal error cleared without a restart or security-setting change; the complete verifier and independent archive verifier now both return the expected rejection.
- [x] Include an unavoidable unsigned disclosure and Apple-documented manual opening path in the customer archive.
- [x] Put the same unsigned, not-notarized, Gatekeeper, checksum, and manual-opening disclosure on the Gumroad product page before purchase.
- [x] Preserve the previously verified `60b9638` archive and checksum on Gumroad product `vddnq` while the replacement is being prepared; its downloaded provider copy verified as SHA-256 `be7a195b...6d04`.
- [x] Replace the unpublished Gumroad attachment with the exact `41beb74` ZIP and sidecar. After a saved-page reload, Gumroad's folder download contained exactly the 2,136,210-byte ZIP and 126-byte sidecar; both resolved to SHA-256 `cb175ec7a22413ae8d2a024f31471766da4dd98bac84718cfbb28184a3bc9ebf`. Only then remove the superseded `be7a195b...6d04` provider folder, save, reload, and download the sole remaining folder again with the same result.
- [ ] Exercise the browser-quarantined customer copy: extract, launch, complete the core workflow, and confirm the selected source folder remains unchanged. An isolated checksum-verified top-level-quarantined copy was attempted on macOS 27.0 build `26A5416b`, but the host returned the same `spctl` Code Signing subsystem internal error for the known exact app and the isolated copy; no warning was bypassed and the customer-path gate remains open.

Do not describe the unsigned archive as Apple-verified, notarized, or a normal one-click installation.

## Manual product validation

- [x] Historical smoke: choose the included deterministic sample using the native chooser in the durable `60b9638` app and reach Review requirements.
- [x] Complete an exact packaged General Audio GUI scan, inspect `Ready`, findings/role-assignment/inventory tabs, export HTML/JSON/SHA-256 through native save panels, and validate the exported evidence.
- [ ] Drop a Finder folder into the application.
- [ ] Review every built-in preset and a Custom preset in the GUI. General Audio completed; Digital Release and Stereo Premaster selector values read back; the exact packaged CLI returned `ready` for all four presets; Custom GUI interaction remains open after the control bridge detached.
- [ ] Start and cancel a scan manually; confirm the result cannot be reported as ready. Seven focused cancellation tests pass, but they do not replace the manual control check.
- [ ] Review filters, repeated findings, details, inventory, and role assignments. The zero-finding General Audio view, six-entry inventory, and expected empty role-assignment view passed; repeated-finding/detail interaction remains open.
- [x] Export HTML, JSON, and SHA-256 files to newly chosen destinations through the exact packaged GUI and verify each result.
- [x] Confirm the exact packaged sample is byte-for-byte unchanged after the GUI scan and exports, including SHA-256, size, mtime, and mode.
- [ ] Verify keyboard-only operation.
- [ ] Verify VoiceOver labels, order, status announcements, and controls.
- [ ] Verify increased text size and both light and dark appearances.
- [ ] Inspect the selected packaged icon in Finder and Dock at normal and small sizes in both appearances. Direct extraction passed at 512, 32, and 16 pixels in dark appearance only.
- [ ] Observe or deny network access while scanning the final packaged GUI build. The exact app had no socket over 30 idle polls, and the exact packaged CLI had none throughout a Digital Release scan at 0.1-second polling; active GUI scan/firewall observation remains open.
- [ ] Test on an independent installation at the macOS 14 floor.
- [ ] Compare multiple audio and artwork formats with trusted tools.

## Commercial release

- [x] Intended defaults recorded: €24 one-time purchase, one user on up to three personally controlled Macs, version-1 updates, receipt-reply support, and a 14-day refund policy.
- [ ] Seller reviews and accepts the customer license and all legally required seller and consumer information.
- [x] Preserve the existing Gumroad product `vddnq` in the signed-in `Sysgga` seller account; do not create a duplicate.
- [x] Read back the product name, EUR 24 price, 14-day refund period, receipt copy, unpublished state, and the final replacement-only two-file delivery folder.
- [ ] Complete owner review of seller identity, consumer information, tax treatment/presentation, payout, and customer licence terms.
- [x] Confirm the saved product page accurately states the unsigned, not-notarized, macOS 14-or-later installation status and limitations.
- [ ] Conduct a zero-charge purchase only after explicit owner confirmation at that time.
- [ ] Download independently, compare SHA-256, extract, launch, and run the key workflow.
- [ ] Add a public shop button only after the provider checkout and delivered artifact are verified.

## Rollback triggers

Remove or disable the public listing if any of these occurs:

- the delivered archive checksum differs from the approved release checksum;
- Gatekeeper blocks a build represented as signed/notarized;
- a source file is modified, followed outside the selected root, or exposed unexpectedly;
- a known invalid package is reported as ready;
- checkout amount, currency, tax presentation, seller account, or delivered attachment differs from the approved provider object;
- the customer download cannot be independently opened and exercised.
