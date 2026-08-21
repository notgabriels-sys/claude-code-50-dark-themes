# Audio Delivery Preflight CLI

Audio Delivery Preflight CLI is a local, read-only technical inventory and delivery-package check for macOS and Linux. It does not upload source files, make network requests, edit delivery files, assess artistic quality, replace professional listening, or guarantee distributor acceptance.

## Commands

```text
audio-preflight scan <folder> [--preset <id>] [--report-html <new-path>] [--report-json <new-path>] [--checksums <new-path>]
audio-preflight presets
audio-preflight preset show <id>
audio-preflight version
```

`scan` defaults to `general-audio`. Custom preset-file import is intentionally unavailable in version 1.0.0.

Built-in presets are:

- `general-audio`: inventories available technical evidence and warns about inconsistent inspected audio properties, duplicates, links, and ambiguous version names. It does not require a sample rate or bit depth.
- `stereo-premaster`: requires one readable PCM or FLAC stereo audio file. It does not impose loudness, peak, headroom, or artistic targets.
- `digital-release`: requires one visibly named lossless main master, one readable square artwork file at least 3000 × 3000 pixels, and one visibly named metadata or credits document. It checks package consistency, not a distributor's current acceptance rules.

## Reports

Every report contains root-relative inventory paths only. The JSON report declares `schema_version: "1.0"`; its field names and finding identifiers are stable within this major schema version. The HTML report is self-contained, uses semantic headings and tables, and prints text severity labels. The checksum manifest is a deterministic, newline-terminated list of SHA-256 digests and regular-file paths in portable path order.

Report destinations must be explicit, distinct, previously absent, and **outside the selected source folder**. Invalid preset and report-destination configuration is rejected before the CLI attempts to open the selected folder. Existing files are rejected without replacement. On macOS and Linux, every existing destination-parent component is opened once without following symbolic links; those held directory handles are used for the final write. Multi-report export is transactional: it either publishes every requested report or removes every artifact it created. The CLI does not create destination directories.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Complete scan with no warnings or errors (`ready`). |
| `1` | Complete scan with warnings and no errors. |
| `2` | Complete scan with one or more requirements not met. |
| `3` | Invalid command or configuration. |
| `4` | The selected-tree scan could not start or could not complete reliably, including root access and source-stability failures. |
| `5` | Unexpected internal failure, including a non-configuration report write, sync, or finalization failure. |

## Evidence limits

The CLI uses bounded, built-in parsers for WAV/RF64, AIFF/AIFC, FLAC, MP3, M4A/MP4, PNG, JPEG, GIF, and TIFF. It only reports a property when the parser provides evidence for that property. Required audio and artwork roles also require positive readable-payload or full-decode evidence; a parseable header alone never satisfies a required role. TIFF full-payload decoding remains unavailable in this edition and therefore cannot satisfy required artwork. HEIC, HEIF, and WebP are inventoried but inspection remains unsupported. Loudness, true peak, phase, tonal balance, conversion, metadata editing, automatic renaming, cloud history, accounts, and AI sonic advice are deliberately out of scope.

## Build and test

```bash
go test ./...
go test -race ./...
go vet ./...
GOOS=linux GOARCH=amd64 go build -trimpath -o audio-preflight-linux-amd64 ./cmd/audio-preflight
```
