# Privacy

Audio Delivery Preflight version 0.1.0 is designed for local processing. The scan engine contains no account, analytics, telemetry, cloud-sync, upload, or payment integration, and it makes no intended network request during a scan.

## Data read during a scan

The application reads the selected folder's filesystem metadata and regular delivery-file bytes needed to:

- build a bounded inventory;
- inspect supported audio and image properties;
- calculate SHA-256 checksums;
- evaluate the selected preset; and
- compare source evidence before and after the scan.

Version 0.1.0 deliberately does not request embedded metadata collections or strings from AVFoundation. Those APIs materialize complete values before the application can enforce a byte or memory limit. Credits and metadata documents can still be matched as package files by relative filename, but their contents are not parsed.

The inventory is bounded to 50,000 entries, depth 32, 20,000 names per directory, 4096 UTF-8 bytes per relative path, and 16 MiB of aggregate relative-path text. Exceeding any boundary produces a specific `incomplete` result with no truncated inventory. Relative paths and displayed preset strings containing actual control characters are rejected at their trust boundaries. Human-readable CLI output also escapes C0, DEL, and C1 control scalars defensively before writing to a terminal.

Preset processing is bounded to 32 roles, 512 UTF-8 bytes per regular expression, 4096 UTF-8 bytes per other configured string, 4096 configured collection values in aggregate, and 1,048,576 configured-string bytes in aggregate. Bounded regular-expression repetition cannot exceed 256. The only accepted two-variable Custom sequence is a parser-observed adjacent `\s*\d+` outside character classes, escaped literals, comments, and extended-mode constructs. The native editor checks raw role and string limits before retaining or preprocessing an edit, then parses comma-separated values incrementally against the shared aggregate value ceiling.

Symbolic links are recorded and are not followed. The selected root is opened component by component with no-follow semantics, and inventory traversal remains anchored to directory descriptors. A regular file is then opened through a descriptor-relative path beneath that root. Entries that cannot be proven safe are not treated as normal source files.

## Temporary media copies

Supported audio and image files are copied through bounded, descriptor-relative reads to uniquely named mode-`0600` files in the resolved macOS temporary directory before AVFoundation or ImageIO inspection. Audio staging is limited to 4 GiB per file and image staging to 256 MiB per file. Capacity arithmetic fails closed, and a copy starts only when the temporary volume can retain at least the greater of 2 GiB or 10 percent of its currently available bytes after that copy. This limits the media frameworks to a stable local snapshot rather than the live source path. The application attempts to remove each staging file immediately after successful or failed inspection.

Image inspection disables ImageIO caching, requires positive dimensions, rejects more than 100,000,000 pixels with overflow-safe arithmetic, and does not create a full decoded image merely to infer alpha. If bounded properties do not state alpha, the value remains unknown.

An unexpected process or operating-system termination can interrupt that cleanup. macOS may later clear its temporary directory, but users handling highly sensitive material should inspect their local temporary storage after a crash.

## Source files

Scanning does not intentionally delete, move, rename, convert, normalize, rewrite, or upload source files. The engine compares source fingerprints before and after scanning. If it observes a change or cannot complete the evidence check, the result is not `ready`.

This is observed evidence, not an operating-system guarantee that no other process changed a source and perfectly restored it.

Report export is a separate, explicit write. The CLI and app do not overwrite an existing report destination. If a user deliberately chooses a new report path inside the selected folder, that exported report changes the folder after the scan. Use a destination outside the selected folder when preserving the folder exactly matters.

## Data in exported reports

Reports contain the selected folder's final name, relative source paths, measured technical properties, findings, successful role assignments, resolved preset requirements, timestamps, application and engine versions, and checksums where available. The versioned media model retains a metadata field for compatibility, but production scans leave it empty in version 0.1.0.

Reports do not export the absolute selected-root path by default. They also reject unsafe absolute, parent-traversal, drive-qualified, control-bearing, or non-canonical source paths. A checksum manifest is generated atomically in memory and fails visibly rather than omitting a regular non-service entry whose checksum state says it succeeded but whose digest or path is not safely representable.

Relative filenames and SHA-256 checksums can still reveal information about a project or identify known files. Treat exported reports as project data and review them before sharing.

## Persistence

Recent source folders and Custom editor state are not saved or restored by default. Scan state remains in the running process unless the user explicitly exports a report. The CLI reads a requested custom preset through a bounded descriptor-anchored no-follow import and does not rewrite it.

## Network boundary

The code has no intended networking path, but a local build still runs within macOS and Apple's installed media frameworks. Release-candidate validation should include an offline or network-observed scan on each supported distribution build before a commercial privacy claim is finalized.
