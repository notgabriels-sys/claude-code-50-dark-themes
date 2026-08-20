# Publishing handoff

Status: `RENDERED — QC INCOMPLETE`. The final archive has been reopened and all automated technical,
manifest and signal-integrity checks pass. Checksum-bound representative listening approval and all
live-store gates remain.

## Product

- Name: Hypnotic Percussion Grid — 64 WAVs
- Identity: Hologram People
- Price: €17
- Customer archive: `dist/Hypnotic_Percussion_Grid_by_Hologram_People.zip`
- SHA-256: `65d9bd35d4c6e2a5cca24e75a488b8dcbb0e74394684709d0a0854238b556699`

## Verified technical state

- Exact content: 64 WAV files across four families, 16 files per family
- Format: stereo PCM WAV, 24-bit / 48 kHz
- Combined audio duration: 19.832 seconds
- True-peak range: -6.0 to -1.2 dBTP against the documented provisional -1 dBTP ceiling
- RMS range: -28.05 to -15.36 dBFS; category dynamics intentionally remain distinct
- Boundary samples: zero-valued on every file
- Full-scale samples: none
- Maximum measured absolute DC offset: 0.00073638
- Stereo correlation range: 0.992222 to 1.0; no severe anti-phase mono cancellation detected
- Final archive: 5,220,322 bytes on disk; 5,202,786-byte compressed payload; re-opened with no errors
- Manifest: exact product identity, Hologram People attribution, paths, family names and technical
  metadata verified against all 64 files
- Reports: `qa/QA_REPORT.json` and `qa/QA_REPORT_ARCHIVE.json`

## Upload assets

- Landscape cover: `artwork/cover.png` (1280 × 720)
- Square thumbnail: `artwork/thumbnail.png` (800 × 800)
- Audio preview: `qa/HPG_Audition_Reel.mp3` — public title
  `Hypnotic Percussion Grid — Audition Reel`, 8.085 seconds, 320 kbps stereo MP3 at 48 kHz
- Audio-preview SHA-256: `59cf389f142d86955e775aa3140644b869b611d3e7fd68934a48d4d4d5e3a2f6`
- Store copy: `LISTING.md`

## Human approval gate

The verifier accepts `--human-approved` only when `AUDIO_APPROVAL.json` records Gabriel's approval
and its stored SHA-256 values match both the exact audition reel and customer archive. Any regenerated
reel or ZIP invalidates that approval. No approval record exists yet, so the current defensible verdict
remains `RENDERED — QC INCOMPLETE`.

## Publication gate

1. Audition the checksum-identified representative reel on trusted monitors or headphones.
2. Confirm transient quality, family distinction, click-free presentation and Hologram People fit.
3. Record approval against the exact reel and customer-archive hashes, then rerun source and archive QA
   with `--human-approved`.
4. Confirm the Gumroad refund-policy selection; do not inherit the previous product's setting silently.
5. Create the Gumroad digital product with the exact title and €17 price.
6. Upload the verified ZIP, final cover, square thumbnail and preview reel using the exact preview title.
7. Reload the seller editor to prove that price, refund policy, media and customer file persisted.
8. Publish only after explicit action-time approval.
9. Inspect the live public page and a clean checkout, confirming the product identity and €17 base price.
10. Perform a zero-charge seller test, download the delivered ZIP and compare its SHA-256 value.

The product is not “for sale” until the public checkout and delivered archive have both been verified.
