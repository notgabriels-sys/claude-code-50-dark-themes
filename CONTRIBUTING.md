# Contributing

Thanks for improving the theme pack. Keep contributions narrow: one theme or one clearly related
site/documentation change per pull request.

## Prerequisites

- Claude Code v2.1.118 or later
- Node.js 22 or later for the repository verifier

## Changing a theme

Every root-level `.json` file is one named Claude Code theme. Keep this exact structure:

```json
{
  "name": "Theme Name",
  "base": "dark",
  "overrides": {
    "claude": "#AABBCC",
    "claudeShimmer": "#DDEEFF",
    "text": "#E9EAEC",
    "inactive": "#A0A4AB",
    "subtle": "#2E2F33",
    "suggestion": "#AABBCC",
    "permission": "#DDEEFF",
    "promptBorder": "#AABBCC",
    "promptBorderShimmer": "#DDEEFF",
    "planMode": "#DDEEFF",
    "userMessageBackground": "#27282B",
    "userMessageBackgroundHover": "#313236",
    "rate_limit_fill": "#AABBCC"
  }
}
```

Rules:

- The pack is intentionally fixed at 50 themes. A new-theme proposal should replace an existing
  theme unless the product scope and gallery are deliberately changed together.
- Use a unique display name and a lowercase kebab-case filename.
- Keep `base` set to `dark`.
- Use six-digit hex colours (`#RRGGBB`) for every override.
- Keep success, error, warning and diff colours out of the file. The base theme owns those semantic
  states so an error never becomes green because of a palette choice.
- `userMessageBackground` and its hover state should be visibly above the intended terminal
  background, including on transparent terminals.
- Keep primary text at 7:1, foreground accents and readable secondary text at 4.5:1,
  and functional borders or indicators at 3:1 against the matching gallery background.
- Reserve `subtle` for non-essential decorative hairlines. Use `inactive` for readable secondary
  text; do not place meaningful text or required control boundaries in `subtle`.
- Do not invent new override keys. Claude Code silently discards unknown keys.

## Updating the gallery

The gallery data lives in the `THEMES` array near the bottom of `index.html`. A theme contribution
must add or update its matching gallery row. The verifier checks that all 50 JSON display names are
present in the gallery.

The final value in each gallery row is the recommended terminal background. Claude Code controls
its interface colours; the terminal application still owns the terminal background.

## Test locally

```bash
node scripts/sync-plugin-themes.mjs
node --test scripts/*.test.mjs
node scripts/verify.mjs
claude plugin validate .
```

The command checks:

- exactly 50 root-level theme files;
- valid JSON, unique names and the shared override-key contract;
- six-digit hex colours;
- role-aware contrast against each theme's recommended terminal background;
- palette parity between theme files and gallery cards;
- byte-for-byte parity between root themes and the installable plugin;
- the marketplace and plugin manifests used by Claude Code;
- a fresh-machine-safe installation command;
- the verified shop payment surfaces.
- valid 1280×720 PNG assets for the curated developer picks.

GitHub Actions runs the regression tests and the same repository check on every push and pull request.

For a visual check, copy the changed theme into `~/.claude/themes/`, run `/theme`, and inspect normal
text, user messages, tool calls, permission prompts and plan mode. If the themes directory did not
exist when Claude Code launched, restart Claude Code once after creating it.

## Pull request notes

Include:

1. What changed and why.
2. The terminal application and background colour used for the visual check.
3. A screenshot when colours or layout changed.
4. Confirmation that `node scripts/verify.mjs` passes.
