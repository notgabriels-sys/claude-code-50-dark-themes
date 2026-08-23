# Release checklist: Audio Delivery Preflight 0.1.0

Date opened: 2026-08-21
Owner: Gabriel Garcia Alonso

This checklist separates repository evidence, a local archive, a customer-tested delivery, and a public paid product. A checked repository or packaging item does not satisfy a later commercial gate.

## Pre-package

- [x] Repository history includes PR #1; the later hardening wave was independently reviewed and merged locally.
- [x] Exact merged implementation passes 238 tests and both release builds.
- [x] Repository shop verifier passes without payment-surface changes.
- [x] Bundle identifier fixed as `com.gabrielgarciaalonso.AudioDeliveryPreflight`.
- [x] Marketing version fixed as `0.1.0`; build version fixed as `1`.
- [x] Minimum deployment target fixed as macOS 14.0.
- [x] Privacy and limitations documents included.
- [x] Selected icon master, provenance, `.icns`, bundle metadata, and package-contract checks are present.
- [ ] Inspect the packaged icon in Finder, Dock, light appearance, dark appearance, and small sizes.
- [ ] Customer license terms are drafted in `CUSTOMER_LICENSE_DRAFT.md`; seller legal review, verified identity, acceptance, rename to `LICENSE.txt`, and customer-archive inclusion remain open. “All rights reserved” metadata is not a substitute.
- [ ] Known critical bugs reviewed immediately before release.

## Package

- [x] Packaging command refuses an existing output path.
- [x] Package contains the `.app`, selected icon, CLI, sample delivery, README, privacy, limitations, build provenance, internal manifest, and explicit Developer-ID-unsigned disclosure.
- [x] App and CLI are exact Universal binaries containing only `arm64` and `x86_64`; packaging cannot silently fall back to one architecture.
- [x] Archive verifier checks the external and internal SHA-256 evidence, ZIP integrity, duplicate and unsafe paths, exact manifest coverage, required files, permissions, exact architecture set, ad-hoc signatures, identifier, source-commit format, version, macOS floor, icon digest, disclosure, and identity/path leakage.
- [x] Package contract runs the packaged CLI against the sample, confirms source immutability, refuses overwrite, rejects a false external sidecar, and rejects changed content even behind a correctly recomputed external sidecar.
- [x] Build a durable unsigned release archive from clean source commit `3b491319aebffc0661c3a510eaa0bf58cbb37b03`.
- [x] Record archive SHA-256 `9e96ef8c0f7b4be9f85e177a7f244ea91276100a92e03657e9dea97d2b8f4c64` for the 2026-08-23 no-Apple-payment candidate.
- [x] Copy the ZIP and checksum to a separate location and verify them there.
- [x] Extract and launch the copied archive rather than the build-tree executable.

## Selected unsigned distribution route

Apple Developer Program payment, Developer ID certificate creation, notarization, and stapling are **not applicable** to the route selected by Gabriel on 2026-08-23. Re-open those steps only if Gabriel explicitly changes that decision.

- [x] Confirm the Keychain contains no valid Developer ID signing identity; packaging fails closed rather than selecting an unintended identity.
- [x] Apply coherent ad-hoc signatures and verify them with `codesign --verify --deep --strict`.
- [x] Record the literal Gatekeeper result as rejected rather than accepted or notarized.
- [x] Include an unavoidable unsigned disclosure and Apple-documented manual opening path in the customer archive.
- [ ] Put the same unsigned, not-notarized, Gatekeeper, and manual-opening disclosure on the product page and checkout before purchase.
- [ ] Upload the exact approved archive and checksum, download them through the customer path, verify the checksum, and exercise the quarantined copy.

Do not describe the unsigned archive as Apple-verified, notarized, or a normal one-click installation.

## Manual product validation

- [ ] Choose a folder using the native chooser.
- [ ] Drop a Finder folder into the application.
- [ ] Review every built-in preset and a Custom preset.
- [ ] Start and cancel a scan; confirm the result cannot be reported as ready.
- [ ] Review filters, repeated findings, details, inventory, and role assignments.
- [ ] Export HTML, JSON, and SHA-256 files to newly chosen destinations.
- [ ] Confirm the selected source package is byte-for-byte unchanged.
- [ ] Verify keyboard-only operation.
- [ ] Verify VoiceOver labels, order, status announcements, and controls.
- [ ] Verify increased text size and both light and dark appearances.
- [ ] Inspect the selected packaged icon in Finder and Dock at normal and small sizes in both appearances.
- [ ] Observe or deny network access while scanning the final packaged build.
- [ ] Test on an independent installation at the macOS 14 floor.
- [ ] Compare multiple audio and artwork formats with trusted tools.

## Commercial release

- [x] Intended defaults recorded: €24 one-time purchase, one user on up to three personally controlled Macs, version-1 updates, receipt-reply support, and a 14-day refund policy.
- [ ] Seller reviews and accepts the customer license and all legally required seller and consumer information.
- [ ] Create the provider product only in the intended seller account.
- [ ] Read back the real product name, amount, currency, tax treatment, attached archive, and customer-delivery settings.
- [ ] Confirm the product page accurately states signing/notarization and supported-macOS status.
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
