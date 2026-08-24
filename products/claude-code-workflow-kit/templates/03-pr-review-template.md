# PR review template

Review `[PR / branch / diff]` for correctness, risk, maintainability, and user impact.

## Review priorities

1. Bugs or broken behavior
2. Security / privacy / payment risks
3. Data loss or destructive operations
4. Test coverage and verification
5. Maintainability
6. UX and copy issues

## Required checks

- Read the diff before commenting.
- Check whether tests or verification were run.
- Distinguish blocking issues from suggestions.
- Avoid style nitpicks unless they affect clarity or maintainability.
- Do not invent requirements not present in the product.

## Output format

```text
Summary:
Blocking issues:
Non-blocking suggestions:
Verification gaps:
Merge recommendation:
```

## Inline comment format

```text
[P0/P1/P2/P3] Title
Why this matters:
Suggested fix:
```

