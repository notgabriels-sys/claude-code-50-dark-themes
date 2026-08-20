# Publishing handoff

Status: fully populated, saved Gumroad draft. Cover, thumbnail, public MP3 preview and paid ZIP
were uploaded and verified again after a fresh provider reload on 2026-08-20. The product remains
unpublished; representative listening, customer-policy approval, publication, signed-out checkout
and delivered-file verification remain.

## Product

- Name: Industrial Tension & Transition FX — 48 WAVs
- Artist/product identity: Hologram People
- Price: €15
- Format: one 83 MB ZIP containing 48 stereo, 24-bit/48 kHz WAV files, README, licence and manifest
- Store order: Gumroad first; Bandcamp may use the same archive and artwork afterward

## Gumroad draft

- Product ID: `rhzsc`
- Editor: `https://gumroad.com/products/rhzsc/edit`
- Intended public slug: `industrial-tension-fx`
- Saved state: exact title, Hologram People attribution, EUR currency, €15 base price, description
  and summary
- Publication state: unpublished
- Provider status shown in the product preview: `This product is not currently for sale.`
- Cover: saved and visible in the provider preview after reload
- Thumbnail: saved and visible as `Thumbnail image` after reload
- Public preview: `ITFX_Audition_Reel`, MP3, 1.4 MB, saved and playable after reload
- Customer delivery: `Industrial_Tension_and_Transition_FX_by_Hologram_People`, ZIP, 83.3 MB,
  saved after reload with a provider-backed download URL
- Gumroad-generated product detail: `Size — 83.3 MB`
- Current refund display: `30-day money back guarantee`; this customer commitment was already
  selected in the draft and has not yet been explicitly approved for publication
- Current account byline in the embedded preview: `Sysgga`; the product copy itself explicitly
  identifies the creator as Hologram People

## Receipt and launch audit

- Receipt button text and custom message are blank, so Gumroad's standard `View content` flow is
  currently used.
- The receipt preview identifies the seller as `Sysgga` and routes customer questions to the
  Gumroad account's existing support email.
- The receipt product-price row displays `€15`, but the same preview also contains `$15`, `$17.53`
  and Gumroad's notice that charges are processed in USD. Treat those preview conversions as
  unverified until the signed-out buyer checkout is inspected after publication.
- Opening Share returned Gumroad's explicit unpublished-product alert, confirming that no public
  launch occurred during asset setup.

## Uploaded files

- Customer download: `dist/Industrial_Tension_and_Transition_FX_by_Hologram_People.zip` — uploaded
  and provider-reloaded; local SHA-256
  `65c6c6dbc7325d9bbec383d80b60a36cbfe0da0b507d4a992d8dad1c1f25706b`
- Landscape cover: `artwork/cover.png` (1280 × 720) — uploaded and provider-reloaded
- Square thumbnail: `artwork/thumbnail.png` (800 × 800) — uploaded and provider-reloaded
- Audio preview: `qa/ITFX_Audition_Reel.mp3` — uploaded and provider-reloaded
- Store copy: `LISTING.md`

## Human gate before publishing

Listen to `qa/ITFX_Audition_Reel.mp3` on studio monitors or trusted headphones. Check for clicks,
unwanted harshness, excessive sub energy, poor transitions and any sound that does not fit the
Hologram People identity. Do not publish if the reel fails this check.

## Remaining release gates

1. Gabriel listens to the representative reel and selected full-resolution WAVs and explicitly
   approves the audio for sale.
2. Confirm the customer-facing refund policy. Do not publish an accidental default commitment.
3. Rename the visible preview heading from the file stem `ITFX_Audition_Reel` to a polished title,
   recommended: `Industrial Tension FX — Audition Reel`.
4. Keep the product identity as Hologram People. Do not present it as a Fate Through release or a
   Lack of Fate product, and do not add it to the Everything Dark template bundle.
5. Publish, reload the product editor and confirm that the exact title, €15 price, cover, thumbnail,
   preview MP3 and 83.3 MB ZIP remain attached.
6. Open the public product page signed out and record both the displayed €15 product price and the
   actual checkout charge/currency; resolve any contradiction with the receipt preview before
   announcing the product.
7. Complete a seller-side test delivery or Gumroad test purchase, download the delivered ZIP, and
   compare its SHA-256 value with `dist/SHA256SUMS.txt`.

The product is only “out for sale” after steps 5–7 succeed. A populated draft or provider-stored
upload does not count as publication, checkout verification or delivered-file verification.
