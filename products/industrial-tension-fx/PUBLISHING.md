# Publishing handoff

Status: unpublished Gumroad draft created and listing details saved; asset uploads, representative
listening and live-store verification remain.

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

## Upload files

- Customer download: `dist/Industrial_Tension_and_Transition_FX_by_Hologram_People.zip`
- Landscape cover: `artwork/cover.png` (1280 × 720)
- Square thumbnail: `artwork/thumbnail.png` (800 × 800)
- Audio preview: `qa/ITFX_Audition_Reel.mp3`
- Store copy: `LISTING.md`

## Human gate before publishing

Listen to `qa/ITFX_Audition_Reel.mp3` on studio monitors or trusted headphones. Check for clicks,
unwanted harshness, excessive sub energy, poor transitions and any sound that does not fit the
Hologram People identity. Do not publish if the reel fails this check.

## Gumroad steps

1. Create a new digital product with the exact title above.
2. Set the base price to €15 and do not add an artificial crossed-out price.
3. Upload the verified ZIP as the customer delivery file.
4. Upload `artwork/cover.png` as the product cover and `artwork/thumbnail.png` where a square image is requested.
5. Copy the public text from `LISTING.md`, excluding its internal verification checklist.
6. Add the MP3 audition reel as the public audio preview if Gumroad offers an audio-preview field.
7. Keep the product identity as Hologram People. Do not present it as a Fate Through release or a Lack of Fate product.
8. Publish, reload the product editor and confirm that the title, €15 price and ZIP attachment persisted.
9. Open the public product page signed out and confirm that checkout displays €15.
10. Complete a seller-side test delivery or Gumroad test purchase, download the delivered ZIP, and compare its SHA-256 value with `dist/SHA256SUMS.txt`.

The product is only “out for sale” after steps 8–10 succeed. A draft page or selected upload does not count.
