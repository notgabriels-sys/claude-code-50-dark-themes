# Limitations

Audio Delivery Preflight version 0.1.0 is deliberately narrow. It reports evidence it can measure and preserves unknown values rather than guessing.

## It does not judge sound or release quality

The product does not measure or judge:

- integrated, short-term, or momentary loudness;
- loudness range;
- true peak or inter-sample peak;
- clipping or sample peak;
- phase, polarity, mono compatibility, stereo image, tonal balance, dynamics, noise, distortion, or codec audibility;
- musical edits, fades, sequencing, gaps, clicks, arrangement, mix balance, or mastering quality;
- rights, credits accuracy, metadata correctness, artwork rights, or distributor acceptance; or
- whether audio is professional, finished, commercially competitive, or suitable for a club.

`ready` means only that the selected implemented technical requirements produced no errors or warnings.

## Formats and measurements

- The scanner classifies a finite set of audio, artwork, and document filename extensions. Other files remain in the inventory as `other`.
- Actual compressed-media readability depends on the AVFoundation and ImageIO support installed with macOS.
- A filename extension is not trusted as proof of content. Unreadable or mismatched media can fail inspection.
- PCM bit depth is reported only when the inspected stream proves linear PCM and exposes a meaningful value.
- Missing framework measurements remain unknown.
- Document contents are not parsed. Version 0.1.0 optionally reads AVFoundation common text metadata when the framework exposes it reliably. The application retains at most 64 selected metadata-key groups and performs at most 64 string-value loads; keys are limited to 128 UTF-8 bytes, values to 4096 UTF-8 bytes, and the deterministic sorted-key JSON aggregate to 32768 UTF-8 bytes. AVFoundation may still provide no common metadata, may fail to load it, or may materialize its collection before the application's selection limits apply; those cases produce no metadata rather than a guessed value. The optional bounded metadata can appear in the app and HTML/JSON reports, but it is not parsed for correctness and is not a replacement for delivery metadata documents.
- Duration, channel count, sample rate, encoding, and PCM bit depth are container/framework observations, not listening judgments.
- Exact duplicates use SHA-256. Near-duplicates, alternate encodes, perceptually similar audio, and visually similar artwork are not detected.

## Presets and roles

- Version 0.1.0 exposes four presets: General Audio, Stereo Premaster, Digital Release, and Custom.
- The app Custom editor is in-memory only and does not save or restore preset files. The CLI can import one bounded, no-follow JSON schema-`1.0` preset with `--preset-file`; it does not export or migrate preset files.
- Delivery roles are matched from visible relative-filename regular expressions and file categories. The scanner does not infer intent from sound or document contents.
- Ambiguous matches are reported rather than resolved automatically.
- The Digital Release preset checks package consistency. It is not tailored to every distributor's changing requirements.

## Filesystem and reports

- The scanner does not follow symbolic links.
- A selected root or imported preset reached through any symbolic-link path component is rejected rather than followed. On macOS, use the real path instead of a compatibility alias such as `/tmp` when invoking the CLI directly.
- Permission failures, disappearing files, changing files, unsupported special entries, or incomplete post-scan evidence can prevent a reliable result.
- Source-change detection proves only that the compared evidence matched at the implemented checkpoints.
- Report destinations must be new files. Existing files are not overwritten.
- Reports use relative source paths by default, but filenames and SHA-256 values may still be sensitive.
- Checksumming large deliveries requires reading every eligible regular file and can take time.

## Platform and distribution

- The native app requires macOS 14 or later.
- There is no Windows, Linux, iOS, or web application in version 0.1.0.
- There is no DAW-project inspection, repair, renaming, conversion, metadata editing, publishing, cloud history, collaboration, or account system.
- The repository can assemble and verify an application bundle inside an explicitly unsigned customer-archive candidate. No valid Apple code-signing identity was available during the release audit, so the candidate is not Developer ID signed or notarized, Gatekeeper may block or warn about it, and it has not been verified across the full supported macOS range.
- Version 0.1.0 has no final application icon. Finder may display the generic application icon until a reviewed `.icns` asset is added and the bundle metadata is updated.
- A manual UI, VoiceOver, keyboard, increased-text, light/dark appearance, offline-network, oldest-supported-macOS, and copied-real-delivery release-candidate pass remains required before commercial distribution.
