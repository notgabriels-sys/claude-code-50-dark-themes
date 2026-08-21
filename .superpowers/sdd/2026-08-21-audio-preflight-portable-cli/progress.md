# SDD ledger — plan: docs/plans/2026-08-21-audio-preflight-portable-cli.md

## Pre-flight review

Spec: the plan itself is the binding product contract; no separate spec file exists.

| Scope | Producer | Consumer | Finding |
|---|---|---|---|
| Task 1 -> Task 2 | Inventory and evidence types | Preset evaluation, findings, and reports | Interfaces must expose explicit available/unavailable/error evidence; clean dependency. |
| Task 2 -> Task 3 | CLI commands, version, report schemas | Packaging, docs, and archive verification | Packaging must invoke only documented stable commands; clean dependency. |
| Task 3 -> Task 4 | Platform archives and checksums | Buyer-style verification | CI-built non-macOS artifacts cannot be claimed locally verified; plan states this explicitly. |
| Task 1 internal | Media parsers and adversarial tests | Same task | Tests agree with bounded parsing and evidence-only claims. |
| Task 2 internal | CLI/report implementation and tests | Same task | Exit-code and no-overwrite requirements agree. |
| Task 3 internal | Packaging/docs/release checklist | Same task | Customer license cannot be called accepted until owner acceptance; package may include a clearly marked draft only in private candidates. |
| Task 4 internal | Verification and review | Same task | Publication is explicitly excluded. |

Ruling: use a new standalone Go module rather than modifying the Swift package — preserves the verified native candidate and prevents unsupported cross-platform claims — cost if wrong is duplicated domain logic.

Ruling: Task 3 may package a private candidate with a draft license, but a public customer archive remains blocked until Gabriel accepts final terms — prevents accidental legal-status claims — cost if wrong is one later archive rebuild.

Ruling: platform support is provisional until CI artifacts and platform-specific smoke evidence exist — prevents local macOS evidence being generalized — cost if wrong is delayed launch wording.

Ruling after Task 1 fix round 4: defer Windows from version 1 and target macOS plus Linux — safe Windows handle-relative traversal cannot be runtime-verified in the available environment and must not be represented as operational — cost if wrong is a smaller initial market and a later Windows engineering project.

Task 1: complete — commits `24d39ae`, `750c353`, `57f08e3`; final independent verdicts Spec compliance APPROVED and Code quality APPROVED; fresh controller tests/race/vet/format/Linux cross-compile/diff checks passed.

Task 2: complete — commits `4927bf2`, `3bc95d2`, `2e23d1d`, `cf3e952`, `99368af`; final breaker verdicts Spec compliance APPROVED and Code quality APPROVED; false-ready media, ambiguous-role, report auditability, transactional export, physical alias, exit-code, and PCM-only v1 contract regressions passed.

Task 3: complete — commits `a2663cc`, `d626840`, `3adb852`, `827e10b`, `27f8c11`, `dc49778`; final independent verdicts Spec compliance APPROVED and Code quality APPROVED with no remaining blocker; clean-source binary provenance, mode-specific documentation, adversarial archive verification, deterministic builds, and private-candidate boundaries passed.

Task 4: local portion complete — buyer-style Apple Silicon extraction, internal and external checksums, version/preset/scan smoke, before-after source hashes, focused adversarial scans, reproducibility, full tests/race/vet/format/diff checks, whole-diff review, and private artifact manifest passed. Remote CI and matching-host Intel/Linux execution remain external unverified gates; publication remains blocked by the plan's owner-controlled legal, payment, download, and smoke-test gates.
