# Publishing handoff

The Gumroad product is already public with the verified v1.0 customer archive. The hardened local v1.1
upgrade is `READY TO UPLOAD`, but it has not been uploaded, saved or delivered by Gumroad. Do not
describe v1.1 or its worked example as live until the provider and buyer-delivery checks below pass.

Upgrade verdict: `READY TO UPLOAD - LIVE UPDATE NOT APPLIED`.

## Current verified live state - v1.0

- Product: Mix Revision & Mastering Handoff Kit
- Identity: Gabriel Garcia Alonso / Hologram People
- Price: €14 EUR
- Gumroad product ID: `pmiicv`
- Gumroad state: PUBLISHED - verified 2026-08-20
- Public URL: `https://notgabriel.gumroad.com/l/mix-revision-mastering-handoff-kit`
- Public page rechecked 2026-08-20 21:27 CEST: HTTP 200, `is_published: true`, permalink `pmiicv`,
  product currency EUR and base price 1,400 cents
- Public description still lists the eleven templates and guide without the worked example, confirming
  that the staged v1.1 copy has not replaced the live v1.0 presentation
- Provider-hosted customer ZIP: 21,357 bytes
- Provider-hosted customer ZIP SHA-256: `63a9fd1004ad244f5591c64331eb6b753610b9df8307a2a006448c3c3ec06ed0`
- Creator test purchase: PASSED - zero-charge order and customer delivery verified 2026-08-20
- Purchase-delivered ZIP: integrity and full extracted-package verification PASSED

Gumroad's content editor displayed the persisted v1.0 ZIP as `0 byte`, but both the provider-hosted
editor download and the purchase-delivered download returned 21,357-byte archives with the exact v1.0
checksum above. Treat this as a display defect unless a future downloaded checksum differs.

## Staged local upgrade - v1.1

- Customer ZIP: `dist/Mix_Revision_and_Mastering_Handoff_Kit.zip`
- Customer ZIP size: 31,995 bytes
- Customer ZIP SHA-256: `0844b8700df0a573d700c4ec0d16226f99a4e37f9c2b7b98c4492921eee70711`
- Guide SHA-256: `3bba99bace9ec53b26720ea98f19ec26022f4c46a6a78b39da9dfe892153c907`
- Provider state for v1.1: NOT UPLOADED OR VERIFIED
- Buyer-delivery state for v1.1: NOT TESTED

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

## Staged upload assets

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

## Live-update gate

1. Gabriel reviews the v1.1 ZIP utility, worked example, storefront images and updated listing.
2. Gabriel confirms that the current €14 price and current Gumroad refund-policy setting should remain.
3. Replace the Gumroad customer file with the exact v1.1 ZIP and update the description to mention the worked example.
4. Save, reload the seller editor, and read back the persisted title, price, refund policy, media and customer file.
5. Download the provider-hosted file and require SHA-256 `0844b8700df0a573d700c4ec0d16226f99a4e37f9c2b7b98c4492921eee70711`.
6. Reopen the public product page and inspect a clean buyer checkout.
7. Complete another zero-charge creator test purchase, download the delivered ZIP and require the same v1.1 checksum.

The verified v1.0 product remains public. The v1.1 upgrade is not live until both the provider-hosted and
purchase-delivered downloads match its checksum.
