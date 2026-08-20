# Publishing handoff

Status: `RENDERED — QC INCOMPLETE`. The unchanged final archive has been reopened and all automated
technical, manifest, low-band mono-safety and signal-integrity checks pass. Checksum-bound
representative listening approval, price/refund approval and all live-store gates remain. No public
product exists.

## Product

- Name: Raw Techno Kick Architecture — 40 WAVs
- Identity: Hologram People
- Proposed price: €15
- Customer archive: `dist/Raw_Techno_Kick_Architecture_by_Hologram_People.zip`
- SHA-256: `30d8f49026a2e3a8a417f1ce6e270b1dbb003505cddaceb50a8f525c5de4082e`

## Verified technical state

- Exact content: 40 WAV files across four families, 10 files per family, plus README, licence and manifest
- Format: stereo PCM WAV, 24-bit / 48 kHz
- Combined audio duration: 78.7 seconds
- True-peak range: -4.2 to -4.0 dBTP against the documented provisional -1 dBTP ceiling
- RMS range: -18.09 to -13.28 dBFS; family-specific dynamics remain distinct
- Deep and punch families: left and right channels are sample-identical
- Industrial and rumble families: below-120 Hz side energy measures 57.35 to 62.19 dB beneath the mid channel
- Stereo correlation range: 0.999962 to 1.0
- Boundary samples: zero-valued on every file; final 5 ms peaks range from -79.83 to -59.42 dBFS
- Full-scale samples: none
- Maximum measured absolute DC offset: 0.00001998
- Final archive: 13,902,225 bytes; reopened with no compressed-data errors and reverified from extraction
- Reports: `qa/QA_REPORT.json` and `qa/QA_REPORT_ARCHIVE.json`

## Upload assets

- Landscape cover: `artwork/cover.png` (1280 × 720)
- Square thumbnail: `artwork/thumbnail.png` (800 × 800)
- Audio preview: `qa/RTKA_Audition_Reel.mp3` — proposed public title
  `Raw Techno Kick Architecture — Audition Reel`, 19.42 seconds, 320 kbps stereo MP3 at 48 kHz
- Audio-preview SHA-256: `b16c4cf8e49960002622ab8af4f0f2a31b87e0d319fea4f4c564937dcf79e0c7`
- Store copy: `LISTING.md`

## Human approval gate

The verifier accepts `--human-approved` only when `AUDIO_APPROVAL.json` records Gabriel's approval
and its stored SHA-256 values match both the exact audition reel and customer archive. Any regenerated
reel or ZIP invalidates that approval. No approval record exists yet, so the current defensible verdict
remains `RENDERED — QC INCOMPLETE`.

## Publication gate

1. Audition the representative reel on trusted monitors or headphones.
2. Confirm transient quality, sub decay, family distinction, click-free boundaries and Hologram People fit.
3. Record approval against the exact reel and customer-archive hashes, then rerun source and archive QA
   with `--human-approved`.
4. Approve the final €15 price and Gumroad refund-policy selection.
5. Create the Gumroad digital product with the exact approved title and price.
6. Upload the verified ZIP, final cover, square thumbnail and preview reel.
7. Reload the seller editor to prove that price, policy, media and customer file persisted.
8. Publish only after explicit action-time approval.
9. Inspect the live public page and a clean checkout.
10. Perform a zero-charge seller test, download the delivered ZIP and compare its SHA-256 value.

The product is not “for sale” until the public checkout and delivered archive have both been verified.
