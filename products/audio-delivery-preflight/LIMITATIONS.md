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
- Audio files larger than 4 GiB and image files larger than 256 MiB are not staged for inspection. The temporary volume must also retain at least the greater of 2 GiB or 10 percent of its currently available capacity after each staging copy.
- Artwork dimensions must be positive and at most 100,000,000 pixels in total. Alpha remains unknown when bounded ImageIO properties do not expose it; version 0.1.0 does not decode a full image only to infer alpha.
- Document contents are not parsed. Version 0.1.0 also does not request embedded metadata from AVFoundation because that API materializes complete metadata collections and strings before the application can enforce a resource limit. The versioned media model retains an empty metadata field for report compatibility.
- Duration, channel count, sample rate, encoding, and PCM bit depth are container/framework observations, not listening judgments.
- Exact duplicates use SHA-256. Near-duplicates, alternate encodes, perceptually similar audio, and visually similar artwork are not detected.

## Presets and roles

- Version 0.1.0 exposes four presets: General Audio, Stereo Premaster, Digital Release, and Custom.
- The app Custom editor is in-memory only and does not save or restore preset files. The CLI can import one bounded, no-follow JSON schema-`1.0` preset with `--preset-file`; it does not export or migrate preset files.
- A preset can contain at most 32 roles. Each filename regular expression is limited to 512 UTF-8 bytes; every other configured string is limited to 4096 UTF-8 bytes; all configured strings together are limited to 1,048,576 bytes; and all configured collections together are limited to 4096 values. The native editor applies the same raw-input ceilings before retaining or preprocessing an edit. Identifiers use normalized lowercase letters/digits/single hyphens, and names must be nonempty and trimmed.
- Delivery roles are matched from visible relative-filename regular expressions and file categories. Custom expressions use a conservative subset that rejects backreferences, lookarounds, repeated quantifiers, quantified alternations, nested repetition, bounded repetition above 256, and multiple variable repetitions. The sole two-variable exception is an adjacent parser-observed `\s*\d+` sequence outside character classes, escaped literals, comments, and extended-mode syntax. Only an explicit reviewed set of exact built-in expressions bypasses the Custom subset. The scanner does not infer intent from sound or document contents.
- Ambiguous matches are reported rather than resolved automatically.
- The Digital Release preset checks package consistency. It is not tailored to every distributor's changing requirements.

## Filesystem and reports

- The scanner does not follow symbolic links.
- Inventory is limited to 50,000 entries, depth 32, 20,000 names per directory, 4096 UTF-8 bytes per relative path, and 16 MiB of aggregate relative-path text. Exceeding a boundary returns `incomplete`; it does not return a truncated result.
- Relative paths containing C0, DEL, or C1 control characters cannot become normal inventory entries or portable report paths. CLI terminal output escapes those controls defensively.
- A selected root or imported preset reached through any symbolic-link path component is rejected rather than followed. On macOS, use the real path instead of a compatibility alias such as `/tmp` when invoking the CLI directly.
- Permission failures, disappearing files, changing files, unsupported special entries, or incomplete post-scan evidence can prevent a reliable result.
- Source-change detection proves only that the compared evidence matched at the implemented checkpoints.
- Report destinations must be new files. Existing files are not overwritten.
- SHA-256 manifest generation fails visibly and atomically if a supposedly successful eligible checksum lacks a valid digest or safe portable path; it never silently drops that entry.
- Reports use relative source paths by default, but filenames and SHA-256 values may still be sensitive.
- Checksumming large deliveries requires reading every eligible regular file and can take time.

## Platform and distribution

- The native app requires macOS 14 or later.
- There is no Windows, Linux, iOS, or web application in version 0.1.0.
- There is no DAW-project inspection, repair, renaming, conversion, metadata editing, publishing, cloud history, collaboration, or account system.
- The repository can assemble and verify an application bundle inside a Developer-ID-unsigned customer-archive candidate. Its ad-hoc signature permits local execution but establishes no publisher identity or Apple trust. The candidate is not notarized, Gatekeeper may block or warn about it, and it has not been verified across the full supported macOS range.
- Version 0.1.0 has no final application icon. Finder may display the generic application icon until a reviewed `.icns` asset is added and the bundle metadata is updated.
- A manual UI, VoiceOver, keyboard, increased-text, light/dark appearance, offline-network, oldest-supported-macOS, and copied-real-delivery release-candidate pass remains required before commercial distribution.
