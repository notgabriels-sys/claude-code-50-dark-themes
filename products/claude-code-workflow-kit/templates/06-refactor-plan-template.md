# Refactor plan template

## Goal

Improve `[area]` without changing user-visible behavior unless explicitly listed.

## Current pain

- Duplicated logic:
- Hard-to-test code:
- Naming confusion:
- Hidden coupling:
- Performance issue:

## Non-goals

- Do not:
- Do not:

## Safety plan

- Baseline tests:
- Snapshot/fixture needed:
- Files likely touched:
- Files to avoid:

## Proposed steps

1. Add/confirm tests around current behavior.
2. Make the smallest structural change.
3. Run focused verification.
4. Repeat in small commits if possible.
5. Run full verification at the end.

## Review checklist

- [ ] Behavior preserved
- [ ] Tests updated
- [ ] Names clearer
- [ ] Dead code removed
- [ ] No unrelated formatting churn
- [ ] Performance not worse

