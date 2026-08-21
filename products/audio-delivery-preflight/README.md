# Audio Delivery Preflight

Audio Delivery Preflight is a local macOS application and command-line tool for checking an audio-delivery folder before handoff. It inventories the folder, measures supported media properties, evaluates visible preset requirements, calculates SHA-256 checksums, and exports evidence-backed reports.

It performs technical checks only. A `ready` result is not an artistic judgment, mastering approval, rights review, or guarantee that a distributor will accept the delivery.

## Current status

Version `0.1.0` is a local development candidate. It is not signed, notarized, packaged for customer installation, or published for sale.

## Requirements

- macOS 14 or later
- Swift 6 toolchain for building from source
- Xcode command-line tools and the macOS media frameworks

Readable compressed formats can vary with the media frameworks installed on the Mac. A recognized filename extension is only a candidate classification; successful inspection is the evidence that a file is readable.

## What it checks

- Recursively inventories normal directories beneath the selected folder, up to 50,000 entries, 32 path components, 20,000 names in one directory, 4096 UTF-8 bytes per relative path, and 16 MiB of relative-path text in aggregate.
- Stops with an explicit `incomplete` result if an inventory budget is exceeded; it never truncates a folder and continues toward `ready`.
- Records symbolic links without following them.
- Rejects paths that cannot be opened safely beneath the selected root or represented without control characters.
- Classifies `.DS_Store` and AppleDouble `._*` files as service files.
- Calculates SHA-256 for regular delivery files and reports exact duplicates.
- Measures supported audio container, encoding, duration, channel count, sample rate, and PCM bit depth when those values are exposed reliably by AVFoundation.
- Deliberately does not request embedded metadata from AVFoundation in version 0.1.0 because that API materializes complete metadata collections and strings before this application can enforce a resource limit.
- Measures supported artwork dimensions, aspect ratio, format, color model, alpha presence, byte size, and readability when available from bounded ImageIO properties. It does not decode a full image merely to infer missing alpha state.
- Reports unreadable media, filename ambiguity, case-insensitive filename collisions, preset role failures, service files, symbolic links, and exact duplicates.
- Compares source fingerprints before and after a scan and refuses to call a changed or incomplete source `ready`.

Audio candidates are classified by these extensions: `aif`, `aiff`, `flac`, `m4a`, `mp3`, and `wav`.

Artwork candidates are classified by these extensions: `gif`, `heic`, `jpeg`, `jpg`, `png`, `tif`, `tiff`, and `webp`.

Documents are inventoried by these extensions: `csv`, `doc`, `docx`, `md`, `pdf`, `rtf`, and `txt`. Their contents are not parsed in version 0.1.0.

## Built-in presets

### General Audio (`general-audio`)

Inventories and inspects the folder without imposing a universal sample rate or bit depth. It warns when readable audio has inconsistent inspected sample rates, PCM bit depths, or channel counts, and when a required consistency measurement is unavailable. It also reports ambiguous version markers, portable filename collisions, symbolic links, service files, and exact duplicates.

### Stereo Premaster (`stereo-premaster`)

Requires one readable lossless stereo premaster candidate using `aif`, `aiff`, `flac`, `m4a`, or `wav`. The inspected encoding must prove Linear PCM, FLAC, or ALAC; AAC, MP3, and unknown encodings cannot satisfy the role even when renamed with a lossless-looking extension. More than one matching candidate is reported for review rather than silently choosing one.

### Digital Release (`digital-release`)

Requires one readable lossless main-master candidate with a proven Linear PCM, FLAC, or ALAC encoding, one readable artwork candidate, and one metadata-or-credits document matched through the displayed filename patterns. The document is checked as a package file; its contents are not parsed. The visible artwork rule requires square artwork of at least 3000 by 3000 pixels. This is a package-consistency preset, not a distributor certification.

### Custom (`custom`)

The native app exposes an in-memory Custom editor for audio filename formats and inspected encodings, numeric bounds and consistency, artwork, filename patterns, arbitrary delivery roles, and finding severities. Any built-in preset can be copied into Custom, so Digital Release artwork expectations remain visible and editable. Custom edits are not persisted automatically; the resolved definition is included in a completed JSON report.

Version `0.1.0` accepts at most 32 roles and 512 UTF-8 bytes per filename regular expression. Custom patterns use a conservative regular-expression subset: exact built-in patterns and ordinary literal, character-class, alternation, anchor, and simple repetition patterns are supported; backreferences, lookarounds, repeated quantifiers, quantified alternations, nested repetition, and multiple ambiguous variable repetitions are rejected before matching. Preset and role identifiers use normalized lowercase letters, digits, and single hyphens. Display names must be nonempty and trimmed. Actual control characters are rejected from displayed preset strings.

## Native app

From this product directory:

```bash
swift run AudioDeliveryPreflightApp
```

The app workflow is explicit:

1. Choose or drop one folder.
2. Choose a built-in preset or edit Custom.
3. Review the resolved requirements.
4. Start the scan.
5. Review status, findings, evidence, and inventory.
6. Export HTML, JSON, or SHA-256 output to a destination you choose.

Selecting a folder never starts a scan automatically, and reports are never exported automatically.

## Command-line interface

```text
audio-preflight scan <folder> [--preset <id> | --preset-file <path>] [--report-html <path>] [--report-json <path>] [--checksums <path>]
audio-preflight presets
audio-preflight preset show <id>
audio-preflight version
```

The default scan preset is `general-audio`.

`--preset` and `--preset-file` are mutually exclusive. A preset file must be a regular JSON file no larger than 1 MiB, must not be reached through a symbolic-link file or ancestor, must use schema version `1.0`, and must resolve successfully before folder access or scanning begins. Imported and app-authored presets share the same role, string, collection, identifier, name, and safe-pattern limits. Invalid imports are rejected without printing the private preset path.

Examples:

```bash
swift run audio-preflight presets
swift run audio-preflight preset show digital-release
swift run audio-preflight scan "/path/to/delivery" --preset digital-release
swift run audio-preflight scan "/path/to/delivery" --preset-file "/path/to/custom-preset.json"
swift run audio-preflight scan "/path/to/delivery" \
  --report-html "/path/to/new-report.html" \
  --report-json "/path/to/new-report.json" \
  --checksums "/path/to/new-SHA256SUMS.txt"
```

A minimal valid custom-preset file is:

```json
{
  "schemaVersion": "1.0",
  "identifier": "custom-stereo",
  "name": "Custom Stereo Delivery",
  "audio": {
    "allowedExtensions": ["wav", "aiff"],
    "allowedEncodings": ["Linear PCM"],
    "sampleRate": {"minimum": 48000, "maximum": 96000},
    "bitDepth": {"minimum": 24, "maximum": 32},
    "requireConsistentSampleRate": true,
    "requireConsistentBitDepth": true,
    "requireConsistentChannelCount": true,
    "severity": "error"
  },
  "artwork": null,
  "filename": {
    "ambiguousVersionPattern": "(?i)(final|version)\\s*\\d+",
    "ambiguousVersionSeverity": "warning"
  },
  "roles": [
    {
      "identifier": "premaster",
      "name": "Stereo premaster",
      "pattern": "(?i)(^|/).+\\.(aif|aiff|wav)$",
      "required": true,
      "category": "audio",
      "allowedExtensions": ["aif", "aiff", "wav"],
      "allowedEncodings": ["Linear PCM"],
      "channelCount": {"minimum": 2, "maximum": 2},
      "sampleRate": null,
      "bitDepth": null,
      "readability": "error",
      "severity": "error",
      "ambiguitySeverity": "warning"
    }
  ],
  "serviceFileSeverity": "information",
  "symbolicLinkSeverity": "warning",
  "exactDuplicateSeverity": "warning"
}
```

Constraint and indeterminate-measurement severities must be `error` or `warning`, so an unavailable required value cannot produce a false `ready` result.

Report destinations must be distinct, must not already exist, and must not traverse symbolic-link ancestors. A new destination inside the selected folder is allowed only when it does not collide with any inventoried source path. Prefer a separate report folder when source-folder immutability matters.

### Exit codes

| Code | Meaning |
|---:|---|
| `0` | Complete scan with no errors or warnings |
| `1` | Complete scan with warnings and no errors |
| `2` | Complete scan with one or more errors |
| `3` | Invalid command, preset, option, or report destination |
| `4` | Scan could not start or did not complete reliably |
| `5` | Internal failure or report-export failure |

## Reports

- **HTML:** A self-contained, accessible report with visible status, resolved requirements, relative inventory paths, measured media properties, checksum state, findings, successful role assignments, evidence, and limitations.
- **JSON:** Stable schema `1.0`, pretty-printed with sorted keys and ISO-8601 dates. It includes the resolved preset definition, explicit inspection and checksum states, inventory, measured evidence, successful role assignments, findings, versions, and scan status. The versioned media model retains a metadata field for compatibility, but production scans leave it empty in version 0.1.0.
- **SHA-256 manifest:** Lowercase SHA-256 values and relative paths for regular non-service files whose checksum state is explicitly successful. Generation is all-or-error: malformed successful-checksum evidence or a path that cannot be represented safely fails the export instead of silently omitting an eligible file.

Reports use relative source paths and the selected folder's final name, not its absolute source path. Checksums and filenames can still be sensitive, so review a report before sharing it.

Media inspection uses temporary stable snapshots. Audio sources larger than 4 GiB and image sources larger than 256 MiB are refused. Before each copy, the temporary volume must be able to retain at least the greater of 2 GiB or 10 percent of its then-available capacity after the copy. Artwork dimensions must be positive and no greater than 100,000,000 pixels in total. Resource refusals remain non-ready evidence.

## Build and verify

From this product directory:

```bash
swift test
swift build -c release --product audio-preflight
swift build -c release --product AudioDeliveryPreflightApp
```

From the repository root, run the deterministic product verifier:

```bash
products/audio-delivery-preflight/scripts/verify.sh
```

The verifier cleans SwiftPM state, runs the full test suite, builds both release products, and runs the version command. It also regenerates the original Digital Release fixture, compares its bytes with the committed fixture, scans it through the release CLI, validates all three report formats, compares source evidence before and after, and checks measured media properties with `afinfo` and `sips`.

See [PRIVACY.md](PRIVACY.md) for local-processing and report details. See [LIMITATIONS.md](LIMITATIONS.md) for the exact boundaries of version 0.1.0. See [VERIFICATION.md](VERIFICATION.md) for the evidence map and remaining release gates.
