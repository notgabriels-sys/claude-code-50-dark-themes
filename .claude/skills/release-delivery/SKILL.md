---
name: release-delivery
description: >-
  The logistics of getting a finished release out the door — master file specs,
  metadata, ISRC and UPC codes, artwork requirements, distributor and label
  delivery packages, release-date lead times, and pre-release checklists. Use
  whenever the user says "deliver the masters", "what specs does the label
  want", "prepare the release package", "distributor", "DistroKid /
  Bandcamp / Beatport upload", "ISRC", "UPC", "artwork size", "when should I
  set the release date", "what do I send them", or is assembling files and
  metadata for an upcoming release. Does NOT cover promotion or press timing
  (release-campaigns), the artistic concept and texts
  (release-concept-architecture), or ownership and registration
  (music-rights-royalties).
---

# Release delivery

The job here is that nothing bounces. A release fails on delivery for boring
reasons — a clipping master, a missing ISRC, artwork 100px short — and each one
costs a release cycle.

## Order of operations

Lock these in sequence; going backwards is expensive.

1. Final masters approved → 2. ISRCs assigned → 3. Metadata frozen →
4. Artwork finalised → 5. Delivered to distributor/label →
6. Release date set with lead time → 7. Promo assets cut from locked masters

Once step 5 happens, a change to the audio usually means a new ISRC and a
re-delivery. Do not send masters you are still deciding about.

## Master file specs

**Digital distribution — the safe default:**
- WAV or AIFF, 24-bit, at the session sample rate (44.1 or 48 kHz). Do not
  upsample. If the session is 48 kHz, deliver 48 kHz and let the platform
  convert.
- No dither when delivering 24-bit. Dither only when you yourself render to
  16-bit.
- True-peak ceiling at or below **-1.0 dBTP**. Lossy encoding overshoots the
  sample peak; a master at 0.0 dBFS will distort after transcoding even though
  it looked clean in the DAW.
- Loudness: platforms normalise, so a hyper-loud master mostly buys you a
  turned-down, squashed version. Target the density the track wants and let
  normalisation happen.

**Vinyl — different rules, ask the cutting engineer first:**
- Separate cut, not the digital master. No limiting to the ceiling.
- De-essing and control of hot, out-of-phase high frequencies matters; wide
  stereo bass causes cutting problems — keep low end mono or near-mono.
- Sequenced with side lengths and level per side agreed in advance; longer
  sides mean lower level.

**Stems / parts** (when a label or remixer asks): consistent start point at
bar 1, no master-bus processing unless explicitly requested, named clearly,
same sample rate and bit depth as the master.

## Metadata — freeze it once, use it everywhere

Inconsistent metadata is what splits an artist page in two.

- **Artist name:** one exact spelling and capitalisation, everywhere, forever.
- **Track title:** decide the treatment of remixes and edits up front —
  `Title (Artist Remix)` is the convention platforms parse.
- **Release title**, **label name**, **catalogue number**
- **Genre**, **release date**, **℗ and © lines** (year + owner)
- **Contributor credits:** composer, producer, mixer, mastering engineer.
  These feed rights matching downstream — see `music-rights-royalties`.

**ISRC** — one per unique recording. A remix, a radio edit, and a re-master are
each a new recording and each need their own. Reissuing the identical recording
keeps the original ISRC. A distributor will issue them free if he has none of
his own.

**UPC/EAN** — one per release (the product), not per track. Distributors issue
these too.

## Artwork

- Square, **3000 × 3000 px** minimum, RGB, JPG or PNG.
- No URLs, no social handles, no pricing, no "out now" text — most stores
  reject those outright.
- Text must be legible at 100px. Check it at thumbnail size before shipping.
- Every element must be cleared for use. A stock or AI-generated image with an
  unclear licence is a takedown waiting to happen.

## Lead times

| Path | Deliver by |
|---|---|
| Digital distributor, no pitching | 2–3 weeks before release |
| With editorial playlist pitching | 4+ weeks — the pitch window closes early |
| Vinyl | Months, plant-dependent; set the digital date around the pressing, not the reverse |
| Bandcamp only | Days, but the promo cycle still wants lead time |

Set the date backwards from the *promo* plan, not from when the audio is
finished. Hand off to `release-campaigns` once the date is fixed.

## Pre-delivery checklist

- [ ] Masters render correctly from a fresh session open — no missing plugins
- [ ] True peak ≤ -1.0 dBTP on every track
- [ ] Listened start to finish, in one pass, on the final files
- [ ] No silence at the head; intentional, consistent tail lengths
- [ ] Track order and gaps agreed
- [ ] Filenames consistent: `01 Artist - Title.wav`
- [ ] ISRC per recording, UPC per release
- [ ] Artwork meets spec and is cleared
- [ ] Splits documented before release, not after (`music-rights-royalties`)
- [ ] Anything sampled is cleared or replaced

## Routing

- What the release *means*, titles, tracklist logic → `release-concept-architecture`
- Promo, press, playlist and social timing → `release-campaigns`
- Splits, GEMA/GVL registration, clearance → `music-rights-royalties`
- Client-facing delivery notes for paid mix/master work → `mixing-mastering-reports`
