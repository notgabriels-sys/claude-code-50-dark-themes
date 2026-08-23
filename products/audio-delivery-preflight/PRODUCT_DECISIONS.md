# Product decisions: Audio Delivery Preflight

Decision date: 2026-08-21

Distribution decision updated: 2026-08-23

These decisions define the intended launch offer. They do not create a live provider product or override owner-controlled identity, tax, payout, or legal-acceptance gates.

Gabriel will not purchase an Apple Developer Program membership for this release. The selected version `0.1.0` route is therefore direct Developer-ID-unsigned distribution with coherent ad-hoc signatures and prominent pre-purchase Gatekeeper disclosure. The product must never claim Apple publisher verification, notarization, or normal one-click installation. No Apple payment or enrollment step is part of this route.

## Positioning

**Name:** Audio Delivery Preflight

**Category:** Native macOS technical delivery utility

**Audience:** Independent producers, mixing and mastering engineers, labels, audio post professionals, and delivery coordinators

**Promise:** Check the technical completeness and internal consistency of an audio-delivery folder before handoff, without modifying or uploading source files.

The product is not an audio editor, mastering processor, artistic approval service, rights review, or guarantee of distributor acceptance.

## Offer

- One-time price: **€24** before any location-dependent tax Gumroad is required to show or collect.
- No subscription.
- Native macOS application and advanced command-line tool included in one download.
- One customer license covers one named user on up to three Macs controlled primarily by that user.
- Commercial client and label work is allowed.
- Teams purchase one license per user.
- Fixes and feature updates within major version 1 are included.
- A future major version may be a paid upgrade, with terms disclosed before purchase.
- Minimum supported operating system at launch: macOS 14.

## Distribution

- Direct digital delivery through Gumroad.
- Gumroad is currently documented as merchant of record for sales and as handling applicable sales-tax collection and remittance. The real product and checkout must still be read back before launch.
- The customer receives a ZIP containing the ad-hoc-signed Developer-ID-unsigned `.app`, CLI, README, privacy notice, limitations, accepted customer license, unsigned-installation disclosure, and checksum instructions.
- The product page and checkout must state before purchase that the app is not signed with an Apple Developer ID certificate, is not notarized, may be blocked or warned about by Gatekeeper, and can require a manual **Privacy & Security > Open Anyway** exception. Do not describe it as a normal one-click installation.
- A customer download must be independently checksum-verified and exercised through the real downloaded/quarantined path before publication. A locally built archive is not a substitute.
- Do not add a shop button until the exact delivered archive and checkout have passed an independent zero-charge purchase.

## Support and refunds

- Support channel: reply to the Gumroad receipt email. Do not publish a separate personal address solely for this product unless Gabriel approves it.
- Support scope: download access, installation, launch, reproducible defects, and clarification of documented behavior.
- Support does not include remote installation, mixing/mastering advice, distributor submission, custom preset development, or private delivery review.
- Response target: within three Berlin business days. This is a service target, not a guaranteed service-level agreement.
- Refund policy: 14-day money-back guarantee from purchase. A short reason may be requested to improve the product but is not required for the refund.
- Duplicate and fraudulent charges are handled through Gumroad’s supported process.
- Mandatory consumer rights remain unaffected.

## Launch copy direction

Lead with the avoided failure, not broad creative claims:

> Check the folder before the handoff. Audio Delivery Preflight inventories a delivery, verifies supported media evidence, flags missing or ambiguous files, and exports a technical record without modifying or uploading the source package.

Required product-page disclosures:

- macOS 14 or later;
- technical checks only;
- local processing with no intended upload;
- supported formats and documented limitations;
- Developer ID and notarization status, reported literally as unsigned and not notarized for the selected `0.1.0` route;
- expected Gatekeeper warning and the manual opening path;
- GUI and CLI included;
- one user, up to three personally controlled Macs;
- €24 one-time purchase;
- 14-day refund policy;
- no guarantee of artistic quality or distributor acceptance.

## Version policy

- `0.1.0`: intended first paid Developer-ID-unsigned release after every applicable non-Apple release and commercial gate passes.
- `0.1.x`: backward-compatible defect, security, documentation, or installation correction within the explicitly unsigned distribution line.
- `1.0.0`: a future stable milestone only; no Apple-signing or upgrade promise is implied.
- Patch: backward-compatible defect or security correction.
- Minor: backward-compatible feature or preset addition.
- Major: potentially paid upgrade or materially changed behavior; announced separately.
