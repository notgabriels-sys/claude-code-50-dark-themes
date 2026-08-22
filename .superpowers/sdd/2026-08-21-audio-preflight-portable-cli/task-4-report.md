# Task 4 report: buyer-style local verification and release review

Date: 2026-08-22
Source revision: `c04f227`

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

Remote CI is now green at this revision (see below). Matching-host execution of
the packaged Intel Mac and Linux executables, accepted legal terms,
payment-provider configuration, paid or zero-charge checkout, customer download
read-back, and publication all remain unverified. The private candidates are not
customer-ready and were not published.

## Independent whole-diff review

The complete Task 3 range through `dc49778` received final independent
verdicts of **Spec compliance APPROVED** and **Code quality APPROVED**, with no
remaining blocker. The review rechecked the prior documentation and executable
provenance findings, exact hashes, reproducibility, focused adversarial tests,
full quality gates, unchanged shop and Swift product surfaces, and absence of
publication actions.

## Remote CI and the packaging-location fix

The first PR run failed because six tests hard-coded macOS-only `/private/tmp`;
that was fixed in `269671f`. The second run then failed only in the second
reproducibility build:

    release packaging failed: release packaging requires a clean source tree

The workflow created `private-candidates`, `repro-a` and `repro-b` inside the
checked-out source tree, so the first build left untracked directories behind and
the tree was no longer clean for the second. The packager was correct and was not
weakened; `requireCleanSourceTree` is untouched and no generated directory was
added to `.gitignore`. Commit `c04f227` moves every candidate and reproducibility
directory under `${RUNNER_TEMP}` and quotes the absolute paths through
`package.sh`, `verify-archive.sh` and `cmp`. Both scripts `cd` to the module root
before running, so absolute paths are unambiguous where the previous relative
ones were not.

The fix was reproduced locally before pushing: running the exact step against a
clean tree completed both reproducibility builds, both `cmp` comparisons passed,
and the source tree stayed clean.

GitHub Actions run `32571165222` on `c04f227` is green in both jobs — the
existing theme/shop `verify` job, and the CLI job covering formatting, Linux
tests, the Linux race detector, vet, and the build and independent verification
of all three private candidates plus the Apple Silicon reproducibility
comparison.

## Candidate hashes at this revision

The three candidates were rebuilt from clean `c04f227` and re-verified:
external sidecars, internal `SHA256SUMS.txt`, version, presets, a ready-status
scan, before/after source immutability, and two byte-identical Apple Silicon
builds. The exact hashes are recorded in `private-artifact-manifest.md`. The
previously recorded `dc49778` hashes no longer describe any current candidate
and were replaced, not amended.
