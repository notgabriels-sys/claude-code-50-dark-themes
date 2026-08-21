# Product decisions: Audio Delivery Preflight

Decision date: 2026-08-21

These decisions define the intended launch offer. They do not create a live provider product or override owner-controlled identity, tax, payout, Apple enrollment, or legal-acceptance gates.

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
- The customer receives a ZIP containing the notarized `.app`, CLI, README, privacy notice, limitations, customer license, and checksum instructions.
- Do not launch with the current ad-hoc-signed candidate. Public version 1.0.0 requires Developer ID signing, Apple notarization, stapling, and independent Gatekeeper validation.
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
- Developer ID signed and notarized status, verified literally at launch;
- GUI and CLI included;
- one user, up to three personally controlled Macs;
- €24 one-time purchase;
- 14-day refund policy;
- no guarantee of artistic quality or distributor acceptance.

## Version policy

- `0.1.x`: private release candidates only.
- `1.0.0`: first paid release after every mandatory release gate passes.
- Patch: backward-compatible defect or security correction.
- Minor: backward-compatible feature or preset addition.
- Major: potentially paid upgrade or materially changed behavior; announced separately.
