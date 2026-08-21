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

- Recursively inventories normal directories beneath the selected folder.
- Records symbolic links without following them.
- Rejects paths that cannot be opened safely beneath the selected root.
- Classifies `.DS_Store` and AppleDouble `._*` files as service files.
- Calculates SHA-256 for regular delivery files and reports exact duplicates.
- Measures supported audio container, encoding, duration, channel count, sample rate, and PCM bit depth when those values can be proven.
- Measures supported artwork dimensions, aspect ratio, format, color model, alpha presence, byte size, and readability when available.
- Reports unreadable media, filename ambiguity, case-insensitive filename collisions, preset role failures, service files, symbolic links, and exact duplicates.
- Compares source fingerprints before and after a scan and refuses to call a changed or incomplete source `ready`.

Audio candidates are classified by these extensions: `aif`, `aiff`, `flac`, `m4a`, `mp3`, and `wav`.

Artwork candidates are classified by these extensions: `gif`, `heic`, `jpeg`, `jpg`, `png`, `tif`, `tiff`, and `webp`.

Documents are inventoried by these extensions: `csv`, `doc`, `docx`, `md`, `pdf`, `rtf`, and `txt`. Their contents are not parsed in version 0.1.0.

## Built-in presets

### General Audio (`general-audio`)

Inventories and inspects the folder without imposing a universal sample rate or bit depth. It reports ambiguous version markers, case-insensitive collisions, symbolic links, service files, and exact duplicates.

### Stereo Premaster (`stereo-premaster`)

Requires one readable lossless stereo premaster candidate using `aif`, `aiff`, `flac`, or `wav`. More than one matching candidate is reported for review rather than silently choosing one.

### Digital Release (`digital-release`)

Requires one readable lossless main-master candidate, one readable artwork candidate, and one metadata-or-credits document matched through the displayed filename patterns. This is a package-consistency preset, not a distributor certification.

The core preset schema supports programmatic custom definitions. Version 0.1.0 does not provide custom-preset import or editing in the app or CLI.

## Native app

From this product directory:

```bash
swift run AudioDeliveryPreflightApp
```

The app workflow is explicit:

1. Choose or drop one folder.
2. Choose a built-in preset.
3. Review the resolved requirements.
4. Start the scan.
5. Review status, findings, evidence, and inventory.
6. Export HTML, JSON, or SHA-256 output to a destination you choose.

Selecting a folder never starts a scan automatically, and reports are never exported automatically.

## Command-line interface

```text
audio-preflight scan <folder> [--preset <id>] [--report-html <path>] [--report-json <path>] [--checksums <path>]
audio-preflight presets
audio-preflight preset show <id>
audio-preflight version
```

The default scan preset is `general-audio`.

Examples:

```bash
swift run audio-preflight presets
swift run audio-preflight preset show digital-release
swift run audio-preflight scan "/path/to/delivery" --preset digital-release
swift run audio-preflight scan "/path/to/delivery" \
  --report-html "/path/to/new-report.html" \
  --report-json "/path/to/new-report.json" \
  --checksums "/path/to/new-SHA256SUMS.txt"
```

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

- **HTML:** A self-contained, accessible report with visible status, resolved requirements, relative inventory paths, checksums, findings, evidence, and limitations.
- **JSON:** Stable schema `1.0`, pretty-printed with sorted keys and ISO-8601 dates. It includes the resolved preset definition, inventory, measured evidence, findings, versions, and scan status.
- **SHA-256 manifest:** Lowercase SHA-256 values and relative paths for regular non-service files with known checksums.

Reports use relative source paths and the selected folder's final name, not its absolute source path. Checksums and filenames can still be sensitive, so review a report before sharing it.

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
