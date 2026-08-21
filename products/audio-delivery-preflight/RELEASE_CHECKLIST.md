# Release checklist: Audio Delivery Preflight 0.1.0

Date opened: 2026-08-21
Owner: Gabriel Garcia Alonso

This checklist separates repository evidence, a local archive, a customer-tested delivery, and a public paid product. A checked repository or packaging item does not satisfy a later commercial gate.

## Pre-package

- [x] Source merged through pull request review boundary.
- [x] Exact merged commit passes 189 tests and both release builds.
- [x] Repository shop verifier passes without payment-surface changes.
- [x] Bundle identifier fixed as `com.gabrielgarciaalonso.AudioDeliveryPreflight`.
- [x] Marketing version fixed as `0.1.0`; build version fixed as `1`.
- [x] Minimum deployment target fixed as macOS 14.0.
- [x] Privacy and limitations documents included.
- [ ] Final application icon reviewed and included.
- [ ] Customer license selected and included. “All rights reserved” metadata is not a substitute for customer license terms.
- [ ] Known critical bugs reviewed immediately before release.

## Package

- [x] Packaging command refuses an existing output path.
- [x] Package contains the `.app`, CLI, README, privacy, limitations, and explicit unsigned disclosure.
- [x] Archive verifier checks SHA-256, extraction safety, required files, permissions, identifier, version, macOS floor, and coherent ad-hoc signatures.
- [ ] Build the real release archive from the exact intended source commit.
- [ ] Record the exact source commit and archive SHA-256.
- [ ] Copy the ZIP and checksum to a separate location and verify them there.
- [ ] Extract and launch the copied archive rather than the build-tree executable.

Observed on the local packaged candidate: archive verification and packaged `.app` launch succeeded. Independent-location copying and independent-host launch remain open.

## Apple distribution

- [ ] Install or select the correct Apple Developer ID Application certificate.
- [ ] Sign nested executable content and the final `.app` with hardened runtime.
- [ ] Verify the signature with `codesign --verify --deep --strict --verbose=2`.
- [ ] Assess with `spctl --assess --type execute --verbose=4`.
- [ ] Submit to Apple notarization and wait for an accepted result.
- [ ] Staple the notarization ticket and reassess the stapled application.
- [ ] Rebuild the customer archive from the final stapled application.

If signing and notarization are deliberately deferred, the product page, checkout description, and included documentation must explain the unsigned Gatekeeper limitation before purchase. Do not describe an unsigned archive as a normal one-click installation.

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
- [ ] Observe or deny network access while scanning the final packaged build.
- [ ] Test on an independent installation at the macOS 14 floor.
- [ ] Compare multiple audio and artwork formats with trusted tools.

Partial local smoke evidence: the packaged start screen, accessibility labels, preset menu, Digital Release selection, and native chooser navigation to the generated fixture were observed. The automation connection ended on chooser confirmation, so the unchecked workflow items above remain deliberately open.

## Commercial release

- [ ] Decide the customer license, support channel, refund terms, and update policy.
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
