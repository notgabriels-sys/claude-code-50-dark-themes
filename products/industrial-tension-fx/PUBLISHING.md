# Publishing handoff

Status: published on Gumroad on 2026-08-20 after Gabriel approved the audio and 30-day guarantee.
Cover, thumbnail, polished public MP3 preview, €15 EUR price and paid ZIP were verified after a fresh
provider reload. The live public page and clean checkout metadata were also verified. A completed
post-purchase delivery remains unverified because no real purchase was submitted.

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
- Gumroad may add location-dependent VAT or convert the buyer's display currency. A signed-in German
  cart displayed this product as US$17.53 and also contained an older Dark Email Templates item; that
  unrelated cart item was not removed or modified, and no payment was submitted.
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

## Remaining post-purchase gate

Gumroad's official `Testing a purchase` instructions confirm that a logged-in creator sees `Test card`,
is not charged for buying their own product, receives both seller and buyer test emails, and can
download the delivered file. The current signed-in cart also contains `Dark Email Templates — 10-Pack`.
Do not delete that cart item or submit the final test `Pay` action without exact action-time approval.

After approval, remove only the unrelated Dark Email Templates cart item, complete the zero-charge
test purchase for Industrial Tension & Transition FX, download the customer-delivered ZIP, and compare
its SHA-256 value with `dist/SHA256SUMS.txt`. The product is already live; this remaining gate concerns
proof of post-purchase delivery, not publication state.
