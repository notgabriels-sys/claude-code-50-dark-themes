# Publishing handoff

Status: published on Gumroad on 2026-08-20 after Gabriel approved the audio and 30-day guarantee.
Cover, thumbnail, polished public MP3 preview, €15 EUR price and paid ZIP were verified after a fresh
provider reload. The live public page, clean checkout metadata and zero-charge creator test purchase
were also verified. The customer-delivered ZIP exactly matches the approved release archive.

## Product

- Name: Industrial Tension & Transition FX — 48 WAVs
- Artist/product identity: Hologram People
- Price: €15
- Format: one 83 MB ZIP containing 48 stereo, 24-bit/48 kHz WAV files, README, licence and manifest
- Store order: Gumroad first; Bandcamp may use the same archive and artwork afterward

## Gumroad live product

- Product ID: `rhzsc`
- Editor: `https://gumroad.com/products/rhzsc/edit`
- Public URL: `https://notgabriel.gumroad.com/l/industrial-tension-fx`
- Public slug: `industrial-tension-fx`
- Saved state: exact title, Hologram People attribution, EUR currency, €15 base price, description
  and summary
- Publication state: published; provider showed `Published!` and exposes an `Unpublish` control
- Cover: saved and visible in the provider preview after reload
- Thumbnail: saved and visible as `Thumbnail image` after reload
- Public preview: `Industrial Tension FX — Audition Reel`, MP3, 1.4 MB, saved and playable after reload
- Customer delivery: `Industrial_Tension_and_Transition_FX_by_Hologram_People`, ZIP, 83.3 MB,
  saved after reload with a provider-backed download URL
- Gumroad-generated product detail: `Size — 83.3 MB`
- Refund display: `30-day money back guarantee`, explicitly approved by Gabriel before publication
- Current account byline in the embedded preview: `Sysgga`; the product copy itself explicitly
  identifies the creator as Hologram People

## Receipt and launch audit

- Receipt button text and custom message are blank, so Gumroad's standard `View content` flow is
  currently used.
- The receipt preview identifies the seller as `Sysgga` and routes customer questions to the
  Gumroad account's existing support email.
- The public page displays €15 and selects Euro as the detected currency. Clean, cookie-free checkout
  data reports product currency `eur`, `price_cents: 1500` and a €15 presentment amount.
- Gumroad may add location-dependent VAT or convert the buyer's display currency. During the final
  signed-in German test, the cart displayed a €15 subtotal, €2.85 VAT and €17.85 total.
- The unrelated `Dark Email Templates — 10-Pack` item was removed before testing. The final checkout
  contained only this product, showed no card fields, and explicitly stated that it was a creator test
  purchase and the payment method would not be charged.
- The live URL returned HTTP 200 and clean public metadata contains the exact title, €15 EUR price
  and polished audition-reel title.

## Uploaded files

- Customer download: `dist/Industrial_Tension_and_Transition_FX_by_Hologram_People.zip` — uploaded
  and provider-reloaded; local SHA-256
  `65c6c6dbc7325d9bbec383d80b60a36cbfe0da0b507d4a992d8dad1c1f25706b`
- Landscape cover: `artwork/cover.png` (1280 × 720) — uploaded and provider-reloaded
- Square thumbnail: `artwork/thumbnail.png` (800 × 800) — uploaded and provider-reloaded
- Audio preview: `qa/ITFX_Audition_Reel.mp3` — uploaded and provider-reloaded
- Store copy: `LISTING.md`

## Human approval

Gabriel explicitly approved the audio for publication on 2026-08-20. `AUDIO_APPROVAL.json` binds
that approval to the exact audition-reel and customer-archive SHA-256 values so regenerated media
cannot silently inherit the approval.

## Completed release gates

1. Audio and refund-policy approval recorded.
2. Public preview renamed to `Industrial Tension FX — Audition Reel`.
3. Hologram People identity preserved; no Fate Through or Lack of Fate attribution and no addition
   to the Everything Dark template bundle.
4. Product published and provider-reloaded; exact title, €15 price, cover, thumbnail, preview MP3
   and 83.3 MB ZIP remain attached.
5. Public URL, HTTP 200 response and clean €15 EUR checkout metadata verified.
6. Zero-charge creator test purchase completed; Gumroad showed a successful receipt and exposed the
   83.3 MB customer ZIP from the purchased-content page.
7. Customer-delivered ZIP downloaded, reopened with no compressed-data errors and matched the
   approved release SHA-256 exactly.

## Completed post-purchase delivery gate

The signed-in creator checkout explicitly identified the order as a test purchase and stated that the
payment method would not be charged. Submitting `Pay` returned a successful receipt and Gumroad's
purchased-content page exposed `Industrial_Tension_and_Transition_FX_by_Hologram_People`, ZIP,
83.3 MB. Gumroad also reported that it sent the receipt to the signed-in buyer email.

The downloaded file was 87,347,884 bytes. `unzip -t` reported no errors, and its SHA-256 was
`65c6c6dbc7325d9bbec383d80b60a36cbfe0da0b507d4a992d8dad1c1f25706b`, exactly matching the approved
release archive and `dist/SHA256SUMS.txt`. Publication, checkout and post-purchase file delivery are
therefore all directly verified.
