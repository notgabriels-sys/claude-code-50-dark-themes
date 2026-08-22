# Privacy: Audio Delivery Preflight CLI 1.0.0

Audio Delivery Preflight CLI is designed to process a selected delivery folder
locally. It has no account, telemetry, analytics, cloud-sync, upload, payment,
or intended network feature. The shipped executable does not invoke external
media tools or runtimes.

## What a scan reads

The CLI reads filesystem metadata and regular-file bytes inside the selected
folder only as needed to build an inventory, inspect supported media evidence,
calculate SHA-256 digests, evaluate the selected preset, and compare source
evidence before and after its scan. It does not follow symbolic links.

The CLI does not intentionally edit, rename, move, delete, convert, upload, or
otherwise modify source files. If it cannot complete the implemented source
stability checks, it does not report a `ready` result.

## Reports and checksums

Report export is an explicit user choice. A report destination must be new,
distinct from other requested reports, and outside the selected source folder.
The CLI does not create parent directories or overwrite existing reports.

HTML and JSON reports, and checksum manifests, can contain a folder name,
relative filenames, technical measurements, findings, role assignments, and
SHA-256 values. Those details can be sensitive project data. Review them before
sharing. Absolute selected-folder paths are not included in normal reports.

## Limits of this statement

This describes the intended behavior of version 1.0.0. Release validation still
needs to confirm each final platform artifact behaves as documented. Operating
systems, endpoint tools, and other processes can independently access files or
networks outside the CLI's control.
