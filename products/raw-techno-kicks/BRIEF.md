# Raw Techno Kick Architecture — product brief

## Commercial position

- Identity: Hologram People
- Product: 40 original techno kick one-shots
- Buyer: intermediate and professional techno producers
- Sound: raw, industrial, hypnotic and functionally separated by low-end role
- Format: DAW-agnostic stereo WAV, 24-bit / 48 kHz
- Dependencies: none
- Store: Gumroad first, Bandcamp-ready archive
- Proposed price: €15

## Content contract

- `01_Deep`: 10 restrained foundational kicks
- `02_Punch`: 10 shorter transient-led kicks
- `03_Industrial`: 10 saturated kicks with metallic texture
- `04_Rumble`: 10 extended kicks with generated low-end tails
- Total: exactly 40 WAV files

## Design constraints

- Every sound is synthesized from scratch through deterministic oscillation, pitch envelopes, noise,
  saturation and generated delay structures.
- Deep and punch families remain sample-identical between left and right channels.
- Industrial and rumble families may carry restrained stereo texture while keeping the low-frequency
  foundation strongly centred.
- Preserve family-specific dynamics and processing headroom rather than forcing one common loudness.
- Use zero-valued beginning and ending boundaries, complete decay tails and no full-scale samples.
- Filenames identify function and variation without fabricated hardware or recording claims.

## Delivery gates

1. Verify exact filenames, family counts, manifest identity and ancillary files.
2. Verify codec, sample rate, bit depth, channels, duration and nonzero size.
3. Measure boundaries, clipping, DC offset, RMS, true peak, final-tail level, stereo correlation and
   low-band side-to-mid energy for every WAV.
4. Reopen the final ZIP and rerun the complete verifier against the extracted customer archive.
5. Audition the checksum-identified representative reel on trusted monitors or headphones.
6. Bind Gabriel's listening approval to the exact reel and archive SHA-256 values.
7. Publish only after price/refund approval, explicit action-time approval, provider read-back, public
   checkout inspection and a delivered-download checksum comparison.
