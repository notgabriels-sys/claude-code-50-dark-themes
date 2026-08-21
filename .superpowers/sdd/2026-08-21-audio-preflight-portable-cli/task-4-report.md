# Task 4 report: buyer-style local verification and release review

Date: 2026-08-22
Source revision: `dc49778`

## Local outcome

The private Apple Silicon candidate was extracted into a separate temporary
folder. Every file in `SHA256SUMS.txt` passed. The executable reported version
`1.0.0`, listed General Audio, Stereo Premaster, and Digital Release, and
scanned the extracted folder with General Audio as ready with zero findings.

A second scan was wrapped in full source-tree SHA-256 snapshots. The sorted
before and after snapshots were identical, confirming that the scan did not
modify the selected source. Focused valid/adversarial regressions passed for
required-role handling, header-only WAV and PNG rejection, truncated FLAC
rejection, stable privacy-safe reports, and regular-file-only portable
checksums.

All three target archives and sidecars passed independent verification. Two
fresh Apple Silicon builds compared byte-for-byte identical. The full normal
and race test suites, vet, formatting, and diff checks passed.

## Boundary

This is local evidence only. Remote CI, matching-host execution for Intel Mac
and Linux, accepted legal terms, payment-provider configuration, paid or
zero-charge checkout, customer download read-back, and publication remain
unverified. The private candidates are not customer-ready and were not
published.

## Independent whole-diff review

The complete Task 3 range through `dc49778` received final independent
verdicts of **Spec compliance APPROVED** and **Code quality APPROVED**, with no
remaining blocker. The review rechecked the prior documentation and executable
provenance findings, exact hashes, reproducibility, focused adversarial tests,
full quality gates, unchanged shop and Swift product surfaces, and absence of
publication actions.
