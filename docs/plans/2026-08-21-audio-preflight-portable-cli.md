# Audio Delivery Preflight Portable CLI Release Plan

## Objective

Create a buyer-ready, zero-Apple-fee command-line edition of Audio Delivery Preflight for macOS and Linux. Preserve the existing Swift application as a private native-GUI candidate; do not include or advertise it in this edition. Windows is deferred until safe handle-relative traversal has been implemented and exercised on Windows.

## Product contract

- Product name: Audio Delivery Preflight CLI.
- Planned public version: 1.0.0; development builds remain private until every release gate passes.
- Price: EUR 19 one time, before location-dependent tax shown or collected by Gumroad.
- Platforms: macOS 13 or later on Apple silicon and Intel, and mainstream x86-64 Linux distributions.
- Distribution: per-platform archives containing one self-contained executable, documentation, license, examples, and SHA-256 checksum.
- No Apple Developer membership, Developer ID signature, notarization, installer, or native app is claimed or required for this CLI edition.
- The product must disclose that macOS may require a one-time user-approved Gatekeeper action for an independently distributed executable.
- The scanner is local and read-only with respect to the selected delivery tree. Reports are written only to explicit new destinations.
- Technical checks do not constitute artistic approval, rights review, mastering approval, or distributor acceptance.

## Global constraints

- Implement the portable CLI in Go using the standard library wherever practical.
- Do not invoke FFmpeg, ffprobe, Python, Swift, PowerShell, shell utilities, or another runtime from the shipped executable.
- Do not follow symbolic links.
- Do not modify source files or silently overwrite reports.
- Do not transmit files, metadata, telemetry, or usage data.
- Never advertise a format measurement unless the implementation has evidence for that exact property.
- Unsupported or unreadable required media must prevent a false ready result.
- Keep stable JSON output and deterministic checksum manifests.
- No Gumroad upload, public shop button, release publication, or real/zero-charge checkout in this implementation plan.

## Task 1: Portable inventory and evidence engine

Create `products/audio-delivery-preflight-cli/` as a standalone Go module. Implement safe recursive inventory, portable relative paths, service-file classification, symbolic-link recording without traversal, SHA-256 calculation, duplicate detection, source before/after fingerprints, and bounded media inspection.

Initial media evidence:

- WAV/RF64 and AIFF/AIFC: container, encoding where provable, channels, sample rate, PCM bit depth, and duration where provable.
- FLAC: container, FLAC encoding, channels, sample rate, bit depth, and duration from STREAMINFO.
- MP3: container/encoding and duration only when safely derivable; otherwise report the measurement as unavailable.
- M4A/MP4 audio: container and codec only when safely derivable from bounded atom parsing; other measurements may be unavailable.
- PNG, JPEG, GIF, and TIFF: format, dimensions, aspect ratio, and alpha/color evidence where the standard decoder exposes it.
- HEIC and WebP remain inventoried but unsupported for inspection in 1.0 unless implemented and tested without runtime dependencies.

Add table-driven and adversarial tests for path traversal, symlinks, malformed/truncated media, oversized metadata structures, deterministic output, and source immutability.

## Task 2: Presets, findings, reports, and CLI

Implement commands equivalent to the proven edition:

```
audio-preflight scan <folder> [--preset <id>] [--report-html <new-path>] [--report-json <new-path>] [--checksums <new-path>]
audio-preflight presets
audio-preflight preset show <id>
audio-preflight version
```

Ship General Audio, Stereo Premaster, and Digital Release presets. Preserve explicit ready/warnings/requirements-not-met/error exit codes. Generate accessible self-contained HTML, stable schema-versioned JSON, and deterministic SHA-256 manifests. Report destinations must be distinct, absent, and safe from symlink traversal.

Custom preset-file import is deferred unless its schema and adversarial behavior can be implemented and tested without weakening the release.

## Task 3: Cross-platform packaging and customer documentation

Add reproducible build scripts and GitHub Actions configuration for:

- `darwin/arm64`
- `darwin/amd64`
- `linux/amd64`

Each archive must contain the correct executable, README, privacy notice, limitations, accepted customer license, examples, and SHA-256 instructions. Add an archive verifier that rejects path traversal, links, missing files, wrong versions, wrong executable names/permissions, and checksum mismatches.

Revise product decisions and release checklist for the CLI-only EUR 19 offer. Keep seller legal identity, governing law, final license acceptance, Gumroad object creation, checkout verification, and publication as owner-controlled gates.

## Task 4: Buyer-style verification and release review

- Run the full Go test suite, race detector where supported, static analysis, and reproducible local builds.
- Run scans against generated valid and adversarial fixtures and compare source hashes before and after.
- Verify the local macOS archive from a separate location and run its key workflow.
- Let CI build and test Linux artifacts; do not claim those artifacts verified until CI and archive read-back pass.
- Perform an independent whole-diff review for correctness, security, documentation accuracy, and unsupported claims.
- Produce a private final artifact manifest. Do not publish it.

## Public-launch boundary

Publication remains blocked until Gabriel accepts the final customer license and seller information, the exact Gumroad product and attached archives are read back, a zero-charge purchase is explicitly confirmed at action time, and every downloaded artifact matches the approved checksums and passes the documented platform smoke test.
