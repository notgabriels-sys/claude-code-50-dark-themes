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

- The flagship pack is intentionally fixed at 50 themes. A change here should replace an existing
  theme unless the product scope and gallery are deliberately changed together. A genuinely new
  theme belongs in Dark Themes Vol. 2 instead — see below.
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

## Adding a theme to Dark Themes Vol. 2

Vol. 2 is the expansion pack, and the place for a new theme. It is a second plugin in the same
marketplace, so it is not size-capped the way the flagship fifty are.

A Vol. 2 theme is the same file, held to the same rules above — same override-key contract, same
`dark` base, same six-digit hex colours, same contrast floors, same reserved `subtle`. What differs
is where the pieces live:

- The theme file goes in `plugins/dark-themes-vol-2/themes/`, and **only** there. Do not add it to
  the repository root; the root is the flagship fifty, and the verifier fails if that count moves.
- Add its recommended terminal background to `plugins/dark-themes-vol-2/previews.json`, keyed by
  display name. Without it the verifier has nothing to check the contrast floors against, and fails.
- Add a matching row to the `VOL2_THEMES` array near the bottom of `index.html`, in the same
  `[name, claude, claudeShimmer, text, inactive, terminal]` shape as the flagship gallery. The
  verifier requires the array, the packaged themes and `previews.json` to agree exactly.
- Display names must be unique across **both** packs. The two plugins can be installed together, so
  two themes named the same would be indistinguishable in `/theme`.
- Bump the version in `plugins/dark-themes-vol-2/.claude-plugin/plugin.json` and the matching entry
  in `.claude-plugin/marketplace.json` together; the verifier requires them to match.
- Update the numbers the public pages state, in the same change. A theme adds fourteen contrast
  comparisons, so the role-aware check count moves, and the share card names each pack's size. Both
  are CI-enforced — see "Numbers stated on public pages" below. Adding a theme and running
  `node scripts/verify.mjs` without this step fails with, for example,
  `index.html claims 894 role-aware checks; the verifier runs 908.`

`scripts/sync-plugin-themes.mjs` does not apply here — it mirrors the root fifty into their plugin,
and a Vol. 2 theme is authored in its plugin directly.

Regenerating the pack's preview image is optional, and only worth doing if the grid changed
noticeably: render `index.html` in a headless browser and screenshot the `#vol2Grid` element to
`plugins/dark-themes-vol-2/preview.png`.

## Numbers stated on public pages

The storefront, the share card and the meta descriptions state a role-aware check count and theme
counts. These are claims to a reader, so the verifier ties them to the computed values: if a change
moves the number of contrast comparisons or the size of either pack, the stated numbers must be
updated in the same change or CI fails. Removing a claim fails too, so the guard cannot be silenced
by deletion.

The share card is rendered from `assets/social-preview.html`, not screenshotted from the site. Edit
that source, then regenerate `preview.png` at 1280×720 — the declared `og:image:width` and
`og:image:height` depend on the size.

Every public page shipping an `og:image` must state `og:image:alt`, a `twitter:image` must state a
`twitter:image:alt` that agrees with it, and pages sharing one image must describe it identically.

## Test locally

```bash
node scripts/sync-plugin-themes.mjs
node --test scripts/*.test.mjs
node scripts/verify.mjs
claude plugin validate .
```

The command checks:

- exactly 50 root-level theme files, plus every packaged Vol. 2 theme;
- valid JSON, names unique across both packs, and the shared override-key contract;
- six-digit hex colours;
- role-aware contrast against each theme's recommended terminal background, for both packs;
- palette parity between theme files and gallery cards, for both packs;
- byte-for-byte parity between root themes and the installable plugin;
- the marketplace and both plugin manifests used by Claude Code;
- a fresh-machine-safe installation command;
- the verified shop payment surfaces;
- valid 1280×720 PNG assets for the curated developer picks;
- that stated check and theme counts on public pages match the computed values;
- that share images carry alternative text, and that one image is described one way.

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
