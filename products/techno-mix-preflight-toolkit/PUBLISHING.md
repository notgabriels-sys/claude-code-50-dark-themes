# Publishing handoff

Status: published and customer delivery verified 2026-08-20. Practical DAW usage was approved, the seller state was reloaded, a zero-charge creator checkout was completed, and the delivered ZIP matched the approved source archive byte-for-byte.

Release verdict: READY — TECHNICAL QC PASSED.

## Product

- Name: Techno Mix Preflight Toolkit — 24 WAVs + Guide
- Identity: Hologram People / Gabriel Garcia Alonso
- Price: €12
- Gumroad product ID: `rdivwt`
- Public URL: `https://notgabriel.gumroad.com/l/techno-mix-preflight-toolkit`
- Customer archive: `dist/Techno_Mix_Preflight_Toolkit_by_Hologram_People.zip`
- SHA-256: `c41180fdc1c798a44ea0cd4aa7099b2a6adcf1a10281d9e14dc3e6624eb7ce9e`

## Upload assets

- Landscape cover: `artwork/cover.png` (1280 × 720)
- Square thumbnail: `artwork/thumbnail.png` (800 × 800)
- Store copy: `LISTING.md`

## Publication gate

Completed:

1. Practical usage approval received from Gabriel.
2. Gumroad product created with the exact title and €12 base price.
3. Verified ZIP, landscape cover and square thumbnail uploaded.
4. Published seller state read back as `Unpublish` after reload.
5. Saved delivery file read back as ZIP, 16.6 MB.
6. Public product page opened at the custom URL.
7. Checkout displayed item price €12, VAT €2.28 and total €14.28 in the current German creator-checkout context. Buyer country can change tax treatment.
8. The checkout contained only this product and displayed Gumroad's explicit creator test-purchase notice that the payment method would not be charged; no card fields were requested.
9. The successful purchase exposed `Techno_Mix_Preflight_Toolkit_by_Hologram_People.zip` as the customer download, displayed as 16.6 MB.
10. The delivered ZIP was downloaded as a 17,438,627-byte file. `unzip -t` reported no errors and its SHA-256 value matched the approved source archive exactly: `c41180fdc1c798a44ea0cd4aa7099b2a6adcf1a10281d9e14dc3e6624eb7ce9e`.
11. The extracted delivered copy passed the complete 24-WAV archive verifier, including file count and folders, stereo 48 kHz/24-bit format, 8-second duration, zero boundaries, RMS and peak limits, channel-isolation behavior, and intended phase relationships.

Optional follow-up:

1. Repeat a fully signed-out checkout inspection if an anonymous browser surface becomes available. This can verify buyer-context tax presentation but does not block the completed publication or delivery gates.

The product is published and publicly purchasable. Customer-delivery identity is proven by the successful zero-charge creator purchase, downloaded-archive integrity check, exact checksum match, and post-download audio verification.
