# Limitations: Audio Delivery Preflight CLI 1.0.0

Audio Delivery Preflight CLI reports the technical evidence its bounded parsers
can establish. It preserves unknown values rather than guessing.

## Not an audio-quality or rights decision

The CLI does not measure or judge loudness, true peak, clipping, phase, tonal
balance, dynamics, noise, distortion, codec audibility, arrangement, mix or
mastering quality, artistic readiness, rights, credit accuracy, artwork rights,
metadata correctness, or distributor acceptance. A `ready` result means only
that the implemented selected preset produced no warnings or errors.

## Supported evidence

The CLI inventories a finite set of audio, artwork, and document filename
extensions. It has bounded parsers for WAV/RF64, AIFF/AIFC, FLAC, MP3, M4A/MP4,
PNG, JPEG, GIF, and TIFF. It only records a measurement when that parser has
evidence for the value.

FLAC STREAMINFO can provide inventory measurements, but FLAC cannot satisfy a
required role in version 1.0.0 because complete frame, payload, and CRC
validation is not implemented. TIFF full-payload decoding is also unavailable,
so TIFF cannot satisfy required artwork. HEIC, HEIF, and WebP are inventoried
but unsupported for inspection. A parseable header alone does not satisfy a
required audio or artwork role.

## Filesystem and platform limits

The CLI does not follow symbolic links. Permission errors, disappearing files,
special files, media the CLI cannot prove readable, or source changes during a
scan can prevent a reliable result. SHA-256 finds exact duplicates only, not
near-duplicates or perceptually similar files.

Version 1.0.0 targets macOS 13 or later on Apple silicon and Intel, and
mainstream x86-64 Linux distributions. Windows is not supported. On macOS, an
independently distributed command-line executable can require a one-time
Gatekeeper approval by the user. There is no installer, signing, notarization,
or native macOS app in this CLI-only edition.
