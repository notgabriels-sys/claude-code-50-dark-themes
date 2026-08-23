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
- [x] Build the selected unsigned release archive from clean source commit `60b963804983c5b6d121761687899981e89d46f9`. The product tree has no diff from that commit to branch tip `c4c9bff`; the later tip changes only the storefront index.
- [x] Record archive SHA-256 `be7a195bbbb3f57a47be4af792b5c214416181f3c95f657d1d3649199fed6d04` for the 2026-08-23 no-Apple-payment candidate.
- [x] Copy the ZIP and checksum to `Audio Delivery Preflight 0.1.0 Universal Unsigned 60b9638` outside temporary storage, verify the external sidecar there, and pass ZIP integrity testing.
- [x] Independently extract and normally launch the exact durable `60b9638` archive rather than relying on an earlier candidate or build-tree executable. The exact process path was read back, the native chooser selected the included sample, and the app reached Review requirements without a Gatekeeper bypass.

## Selected unsigned distribution route

Apple Developer Program payment, Developer ID certificate creation, notarization, and stapling are **not applicable** to the route selected by Gabriel on 2026-08-23. Re-open those steps only if Gabriel explicitly changes that decision.

- [x] Confirm the Keychain contains no valid Developer ID signing identity; packaging fails closed rather than selecting an unintended identity.
- [x] Apply coherent ad-hoc signatures and verify them with `codesign --verify --deep --strict`.
- [x] Record the packaging-time literal Gatekeeper result as rejected rather than accepted or notarized. A 2026-08-23 recheck on macOS 27.0 beta returned `internal error in Code Signing subsystem` for this app, TextEdit, and `/usr/bin/true`; treat current Gatekeeper reassessment as host-unavailable, not as package acceptance or mutation.
- [x] Include an unavoidable unsigned disclosure and Apple-documented manual opening path in the customer archive.
- [x] Put the same unsigned, not-notarized, Gatekeeper, checksum, and manual-opening disclosure on the Gumroad product page before purchase.
- [x] Upload the exact approved `60b9638` archive and checksum to Gumroad product `vddnq`, download the saved folder back, and verify SHA-256 `be7a195b...6d04` from that download.
- [ ] Exercise the browser-quarantined customer copy: extract, launch, complete the core workflow, and confirm the selected source folder remains unchanged.

Do not describe the unsigned archive as Apple-verified, notarized, or a normal one-click installation.

## Manual product validation

- [x] Choose the included deterministic sample using the native chooser in the exact durable `60b9638` app and reach Review requirements.
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
- [x] Preserve the existing Gumroad product `vddnq` in the signed-in `Sysgga` seller account; do not create a duplicate.
- [x] Read back the product name, EUR 24 price, 14-day refund period, exact two-file delivery folder, receipt copy, and unpublished state.
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
