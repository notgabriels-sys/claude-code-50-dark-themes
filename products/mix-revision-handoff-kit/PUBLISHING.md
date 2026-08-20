# Publishing handoff

The Gumroad product is public with the hardened v1.1 archive. The seller editor, public listing,
provider-hosted download and buyer-delivered download were all verified independently after the live
update.

Release verdict: `LIVE - PROVIDER AND BUYER DELIVERY VERIFIED`.

## Current verified live state - v1.1

- Product: Mix Revision & Mastering Handoff Kit
- Identity: Gabriel Garcia Alonso / Hologram People
- Price: €14 EUR
- Gumroad product ID: `pmiicv`
- Gumroad state: PUBLISHED - seller editor and public page verified 2026-08-20 23:27 CEST
- Public URL: `https://notgabriel.gumroad.com/l/mix-revision-mastering-handoff-kit`
- Seller read-back after save and reload: exact title, EUR currency, €14 amount, `Unpublish` state and
  `30-day money back guarantee`
- Persisted customer content: exactly one file named `Mix_Revision_and_Mastering_Handoff_Kit.zip`
- Provider-hosted customer ZIP: 31,995 bytes
- Provider-hosted customer ZIP SHA-256: `0844b8700df0a573d700c4ec0d16226f99a4e37f9c2b7b98c4492921eee70711`
- Provider-hosted ZIP: `unzip -t` and full clean-extraction package verification PASSED
- Public page rechecked 2026-08-20 23:27 CEST: HTTP 200, worked-example copy present, product currency
  EUR and base price 1,400 cents
- Clean Germany checkout: €14 subtotal, €2.66 VAT, €16.66 total, no tip selected
- Creator checkout explicitly stated that the purchase was a test purchase and the payment method
  would not be charged
- Creator test purchase: PASSED - zero-charge order and customer delivery verified 2026-08-20
- Purchase-delivered ZIP: 31,995 bytes with the exact v1.1 checksum above
- Purchase-delivered ZIP: `unzip -t` and full clean-extraction package verification PASSED

Gumroad's content editor displays the persisted v1.1 ZIP as `0 byte` after reload. This is the same
provider display defect seen with v1.0: both the provider-hosted download and the purchase-delivered
download returned the complete 31,995-byte archive with the exact v1.1 checksum.

## Published v1.1 package

- Customer ZIP: `dist/Mix_Revision_and_Mastering_Handoff_Kit.zip`
- Customer ZIP size: 31,995 bytes
- Customer ZIP SHA-256: `0844b8700df0a573d700c4ec0d16226f99a4e37f9c2b7b98c4492921eee70711`
- Guide SHA-256: `3bba99bace9ec53b26720ea98f19ec26022f4c46a6a78b39da9dfe892153c907`
- Provider state for v1.1: LIVE AND VERIFIED
- Buyer-delivery state for v1.1: LIVE AND VERIFIED

Changes from v1.0:

- Adds completed copies of all eleven templates for one clearly labelled fictional project
- Makes delivery requirements explicit with status, value and authoritative-source columns
- Adds concise field-state and version-control guidance to the README
- Repairs the guide's wrapped `SUPERSEDED` and `INCOMPLETE` labels
- Updates the guide and manifest to version 1.1
- Makes the package and ZIP build reproducible
- Replaces shallow CSV checks with quoted-CSV parsing and exact inventory, path, UTF-8, PDF and manifest verification

## Verified v1.1 customer contents

- 27 files in the customer folder, including the manifest
- 11 blank editable workflow templates in Markdown, CSV and TXT
- 11 completed copies covering one clearly labelled fictional project
- 1 worked-example notice, 1 seven-page PDF guide, README, licence and checksum manifest
- Exact expected paths only; no hidden metadata, symbolic links or path traversal
- All text files valid UTF-8 with no NUL bytes
- All CSV files parse as rectangular quoted CSV with unique, non-empty headers
- Worked-example CSV rows contain no unexplained empty fields
- Manifest contains 26 unique entries and matches every non-manifest file byte-for-byte
- PDF is readable, unencrypted A4 with seven pages, exact title/author metadata, no forms and no JavaScript
- PDF text extracts cleanly; `SUPERSEDED` and `INCOMPLETE` remain unbroken
- All seven PDF pages rendered at 144 DPI and passed full-page visual inspection
- Clean ZIP extraction passed the same package verifier as the source package
- ZIP integrity passed `unzip -t`
- Consecutive clean builds produced the same ZIP checksum

Generated QA evidence:

- `qa/QA_REPORT_SOURCE.json`
- `qa/QA_REPORT_ARCHIVE.json`
- `qa/RELEASE_REPORT.json`
- `VISUAL_QA.json`

## Published presentation assets

- Landscape cover: `cover-1280x720.png` - 1280 x 720 - SHA-256 `cce6772bb2b23cc7e5b4770732663e3738076f5208fc5b3e72eb61f502c2034b`
- Square thumbnail: `thumbnail-800x800.png` - 800 x 800 - SHA-256 `294975a330b359ab8b71b1cbe22138da92d11f419ee54c4a9f10db17b464ed14`
- Updated store copy: `LISTING.md`

The artwork micro-label `SHA256: 01-11` is part of the visual ledger motif, not checksum evidence. A
generative relabelling attempt was rejected because it changed the canvas and redrew the composition;
the existing source artwork was preserved. Exact release hashes appear only in this record and
`SHA256SUMS.txt`.

A consolidated XLSX companion was considered but not generated because the required audited
spreadsheet runtime was unavailable in this session. It is not promised by the listing and does not
block the universal Markdown, CSV and TXT product.

## Completed live-verification gate

1. Gabriel approved the v1.1 package review, retained €14 and retained the 30-day money-back guarantee.
2. The exact v1.1 ZIP replaced the v1.0 customer file; only one customer archive remains.
3. The storefront description and summary now state that the package includes a completed fictional worked example.
4. Save, reload and seller-field read-back passed.
5. The provider-hosted file matched SHA-256 `0844b8700df0a573d700c4ec0d16226f99a4e37f9c2b7b98c4492921eee70711`.
6. The public product page and a clean buyer checkout were inspected.
7. A zero-charge creator test purchase succeeded, and the delivered file matched the same checksum.

## Superseded v1.0 record

- Previous provider-hosted customer ZIP: 21,357 bytes
- Previous ZIP SHA-256: `63a9fd1004ad244f5591c64331eb6b753610b9df8307a2a006448c3c3ec06ed0`
- v1.0 was replaced by the verified v1.1 archive on 2026-08-20.
