# Repo audit checklist

Use this when starting work in an unfamiliar repository.

## Objective

Audit `[repo]` enough to make safe changes without guessing.

## Required read-only checks

- Current branch:
- Remote:
- Latest commits:
- Dirty files:
- Package/build system:
- Test commands:
- Deployment surface:
- Existing docs:
- Security-sensitive files:
- Payment or external-write paths:

## Questions to answer

1. What does this repo do?
2. What is the likely entry point?
3. How is it built and verified?
4. What files should not be touched?
5. What existing user changes are present?
6. What would make a change risky?

## Output format

```text
Repo state:
Main surfaces:
Verification commands:
Risks:
Suggested next action:
```

