# Product decisions: Audio Delivery Preflight CLI

Decision date: 2026-08-21. This records a proposed CLI-only EUR 19 offer. It
does not create a Gumroad object, checkout, payment link, product attachment,
or publication, and it does not resolve owner-controlled legal gates.

## Current public release status

Updated: 2026-08-24.

The proposal below has been superseded by a verified public Gumroad listing:

- Product page: <https://notgabriel.gumroad.com/l/audio-delivery-preflight-cli>.
- Owned landing page: <https://notgabriels-sys.github.io/claude-code-50-dark-themes/audio-delivery-preflight-cli.html>.
- Price read-back: **EUR 19** (`price_cents: 1900`).
- Publication read-back: `is_published: true`.
- Customer file read-back: six files, with no duplicate filenames:
  `darwin-arm64`, `darwin-amd64`, and `linux-amd64` archives plus checksum
  sidecars.

No independent paid or zero-charge checkout-download smoke test is recorded in
this file. Treat Gumroad publication, hosted page visibility, purchase flow,
downloaded archive verification, and customer support readiness as separate
states.

## Proposed offer

- Product name: **Audio Delivery Preflight CLI**.
- One-time price: **EUR 19**, before any location-dependent tax Gumroad is
  required to show or collect.
- No subscription.
- One self-contained command-line executable per platform: `darwin/arm64`,
  `darwin/amd64`, and `linux/amd64`.
- One proposed license per named user on up to three primarily user-controlled
  computers; commercial client and label work would be allowed; teams would
  purchase one license per user.
- Version-1 fixes and feature updates would be included. A future major version
  could be a paid upgrade only under final accepted terms.

This is a CLI-only offer. It does not include, replace, or advertise the
separate private Swift/macOS application candidate.

## Product promise and disclosures

The CLI inventories a delivery folder, evaluates the selected technical preset,
and exports a technical record without modifying or uploading the selected
source package. It is not an audio editor, mastering processor, rights review,
artistic approval service, or guarantee of distributor acceptance.

Any later product page must state local processing, technical-only scope,
supported platforms and formats, documented limitations, macOS Gatekeeper
behavior for independently distributed executables, and that no installer,
Developer ID signature, or notarization is included in this CLI edition.

## Private-candidate boundary

Earlier archives were private candidates only. The current public Gumroad
listing uses customer-release archives, but future archive rebuilds must still
preserve the private-candidate/customer-release boundary and must not infer
accepted legal terms from this development document alone.

## Owner-controlled commercial gates

Gabriel alone controls seller identity, legal/customer terms, Gumroad settings,
checkout tests, refunds, taxes, payouts, and future publication changes. A
source commit, package command, or documentation edit never changes Gumroad
state by itself.
