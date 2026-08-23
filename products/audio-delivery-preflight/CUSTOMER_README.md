# Audio Delivery Preflight 0.1.0

Audio Delivery Preflight is a local macOS application and command-line tool for checking an audio-delivery folder before handoff. It inventories the folder, inspects supported media properties, evaluates visible preset requirements, calculates SHA-256 checksums, and exports evidence-backed reports.

It performs technical checks only. A `ready` result is not an artistic judgment, mastering approval, rights review, or guarantee that a distributor will accept the delivery.

## Requirements

- macOS 14 or later
- Apple silicon (`arm64`) or Intel (`x86_64`) Mac
- Enough free local and temporary-disk space to inspect the selected delivery

The app does not require an account. Scans are designed to run locally without uploading source files. See [Privacy](PRIVACY.md) for the exact data and network boundaries.

## Read before opening: unsigned macOS build

This build has ad-hoc code signatures only. It is not signed with an Apple Developer ID certificate and is not notarized by Apple. An ad-hoc signature provides local integrity structure, but it does not establish a verified publisher identity or Apple trust. macOS Gatekeeper may therefore block or warn about the app.

Before opening it:

1. Download both the release ZIP and its `.sha256` sidecar.
2. Keep both files in the same directory and verify the ZIP in Terminal:

   ```bash
   shasum -a 256 -c "Audio-Delivery-Preflight-0.1.0-macOS-universal-unsigned.zip.sha256"
   ```

3. Continue only if Terminal reports `OK` for the ZIP.
4. Extract the ZIP and move `Audio Delivery Preflight.app` to Applications.
5. Try to open the app once. If macOS says the developer cannot be verified, open **System Settings > Privacy & Security**, scroll to **Security**, and use **Open Anyway** only if the checksum matched and you trust the download source.

Do not override a warning that the app “will damage your computer” or that the app is damaged. Delete that copy and obtain a fresh download or contact the seller through the Gumroad receipt.

Read [Unsigned installation notes](UNSIGNED.txt) for the complete disclosure and manual-opening instructions.

## Included files

- `Audio Delivery Preflight.app`: native macOS interface
- `audio-preflight`: optional command-line interface
- `Sample Delivery Package`: deterministic example for trying the Digital Release preset
- `PRIVACY.md`: local-processing, temporary-file, report, and network boundaries
- `LIMITATIONS.md`: unsupported judgments, formats, workflows, and platform boundaries
- `UNSIGNED.txt`: Developer-ID and notarization disclosure with safe opening guidance
- `PACKAGE-INFO.json` and `BUILD-EVIDENCE.txt`: machine- and human-readable build evidence
- `SHA256SUMS.txt`: checksums for files inside the extracted release folder

## Quick start in the app

1. Open `Audio Delivery Preflight.app`.
2. Choose or drop one delivery folder.
3. Select a built-in preset, or copy a preset into Custom and edit its visible requirements.
4. Review the resolved requirements before starting.
5. Start the scan.
6. Review the status, findings, measured evidence, and inventory.
7. Export HTML, JSON, or SHA-256 output to a new destination if needed.

Selecting a folder does not start a scan automatically. Reports are not exported automatically, and existing report files are not overwritten.

## Built-in presets

- **General Audio:** inventories and inspects a folder without imposing a universal sample rate or bit depth. It reports inconsistent inspected properties, ambiguous filenames, portable filename collisions, symbolic links, service files, and exact duplicates.
- **Stereo Premaster:** requires one readable lossless stereo premaster candidate with a proven Linear PCM, FLAC, or ALAC encoding.
- **Digital Release:** requires one readable lossless main master, one readable artwork candidate, and one metadata-or-credits document matched by the displayed filename patterns. The visible artwork rule requires a square image of at least 3000 by 3000 pixels.
- **Custom:** provides an in-memory editor for audio, artwork, filename, delivery-role, and finding-severity requirements. Custom edits are not saved automatically.

Digital Release checks package consistency. It is not a distributor certification.

## Command-line interface

In Terminal, change to the extracted release folder and use:

```text
./audio-preflight scan <folder> [--preset <id> | --preset-file <path>] [--report-html <path>] [--report-json <path>] [--checksums <path>]
./audio-preflight presets
./audio-preflight preset show <id>
./audio-preflight version
```

Examples:

```bash
./audio-preflight presets
./audio-preflight preset show digital-release
./audio-preflight scan "/path/to/delivery" --preset digital-release
./audio-preflight scan "/path/to/delivery" \
  --report-html "/path/to/new-report.html" \
  --report-json "/path/to/new-report.json" \
  --checksums "/path/to/new-SHA256SUMS.txt"
```

The default scan preset is `general-audio`. Report destinations must be distinct new files and must not traverse symbolic-link ancestors.

### Exit codes

| Code | Meaning |
|---:|---|
| `0` | Complete scan with no errors or warnings |
| `1` | Complete scan with warnings and no errors |
| `2` | Complete scan with one or more errors |
| `3` | Invalid command, preset, option, or report destination |
| `4` | Scan could not start or did not complete reliably |
| `5` | Internal failure or report-export failure |

## Supported candidate types

- Audio: `aif`, `aiff`, `flac`, `m4a`, `mp3`, `wav`
- Artwork: `gif`, `heic`, `jpeg`, `jpg`, `png`, `tif`, `tiff`, `webp`
- Inventoried documents: `csv`, `doc`, `docx`, `md`, `pdf`, `rtf`, `txt`

A filename extension is only a candidate classification. Successful inspection is the evidence that a media file is readable. Document contents are not parsed in version 0.1.0.

## Reports and privacy

Reports use relative source paths rather than the absolute selected-folder path. They can still contain sensitive filenames, checksums, measured properties, findings, requirements, and timestamps. Review reports before sharing them.

The scanner does not intentionally delete, move, rename, convert, normalize, rewrite, or upload source files. Exporting a report is a separate explicit write. Use a report destination outside the selected folder when preserving that folder exactly matters.

For the product’s exact boundaries, including unsupported artistic and audio-quality judgments, resource limits, temporary media copies, format caveats, and platform restrictions, read [Limitations](LIMITATIONS.md) and [Privacy](PRIVACY.md).
