# Examples

Run these commands from the extracted private candidate directory. Replace
`/path/to/delivery` with a real folder you are permitted to inspect. The CLI
does not modify that folder; reports must be explicit new paths outside it.

```sh
./audio-preflight presets
./audio-preflight preset show digital-release
./audio-preflight scan /path/to/delivery --preset digital-release \
  --report-json /path/outside/delivery/preflight-report.json \
  --report-html /path/outside/delivery/preflight-report.html \
  --checksums /path/outside/delivery/SHA256SUMS.txt
```

Exit code `0` means the selected preset found no warnings or errors. Exit code
`1` means warnings, `2` means requirements are not met, and `3` through `5`
mean configuration, scan-start, or internal failures. Read the included README
and limitations before treating any result as technical evidence.
