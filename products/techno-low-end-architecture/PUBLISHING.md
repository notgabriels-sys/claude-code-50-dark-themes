# Publishing handoff

Status: `RENDERED — QC INCOMPLETE`. The final archive has been reopened and all automated technical,
manifest, low-band mono-safety and signal-integrity checks pass. Checksum-bound representative
listening approval, price/refund approval and all live-store gates remain. No public product exists.

## Product

- Name: Techno Low-End Architecture — 48 WAVs
- Identity: Hologram People
- Proposed price: €17
- Customer archive: `dist/Techno_Low_End_Architecture_by_Hologram_People.zip`
- SHA-256: `eb6a9f49fe3a82da92cbe8498790a189af4e0b6578005792775cabf2b96bd16b`

## Verified technical state

- Exact content: 48 WAV files across four families, 12 files per family, plus README, licence and manifest
- Tonal map: every family runs chromatically from C1 through B1 and the manifest matches every filename
- Format: stereo PCM WAV, 24-bit / 48 kHz
- Combined audio duration: 111.36 seconds
- True-peak range: -7.1 to -5.1 dBTP against the documented provisional -1 dBTP ceiling
- RMS range: -20.48 to -10.64 dBFS; family-specific dynamics remain distinct
- Sub pulses: left and right channels are sample-identical
- Other families: below-120 Hz side energy measures 32.21 to 58.22 dB beneath the mid channel
- Stereo correlation range: 0.995938 to 1.0
- Boundary samples: zero-valued on every file; final 5 ms peaks range from -128.93 to -56.85 dBFS
- Full-scale samples: none
- Maximum measured absolute DC offset: 0.00005064
- Final archive: 28,458,886 bytes; reopened with no compressed-data errors and reverified from extraction
- Reports: `qa/QA_REPORT.json` and `qa/QA_REPORT_ARCHIVE.json`

## Upload assets

- Landscape cover: `artwork/cover.png` (1280 × 720)
- Square thumbnail: `artwork/thumbnail.png` (800 × 800)
- Audio preview: `qa/TLEA_Audition_Reel.mp3` — proposed public title
  `Techno Low-End Architecture — Audition Reel`, 14.4 seconds, 320 kbps stereo MP3 at 48 kHz
- Audio-preview SHA-256: `5587f5df20e9dd234a572d6d91c8a8250dafb0fd9eb66e21eac5cf783929dafe`
- Store copy: `LISTING.md`

## Human approval gate

The final verifier will accept `--human-approved` only when `AUDIO_APPROVAL.json` records Gabriel's
approval and its stored SHA-256 values match both the exact audition reel and customer archive. Any
regenerated reel or ZIP invalidates that approval. No approval record exists yet, so the current
defensible verdict remains `RENDERED — QC INCOMPLETE`.

## Publication gate

1. Audition the checksum-identified representative reel on trusted monitors or headphones.
2. Confirm sub translation, transient shape, distortion quality, category distinction, mono behaviour
   and Hologram People fit.
3. Record approval against the exact reel and customer-archive hashes, then rerun source and archive QA
   with `--human-approved`.
4. Approve the final €17 price and Gumroad refund-policy selection.
5. Create the Gumroad digital product with the exact approved title and price.
6. Upload the verified ZIP, final cover, square thumbnail and preview reel.
7. Reload the seller editor to prove that price, policy, media and customer file persisted.
8. Publish only after explicit action-time approval.
9. Inspect the live public page and a clean checkout.
10. Perform a zero-charge seller test, download the delivered ZIP and compare its SHA-256 value.

The product is not “for sale” until the public checkout and delivered archive have both been verified.
