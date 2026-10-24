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
- A changed theme reaches people who already have the pack only under a new version: Claude Code
  updates an installed plugin only when its version moves forward. `node scripts/verify.mjs` fails on a
  changed theme until you bump the version, written MAJOR.MINOR.PATCH and newer than the one
  recorded, in `plugins/50-dark-themes/.claude-plugin/plugin.json`
  and its entry in `.claude-plugin/marketplace.json`, and record the digest it prints in
  `releasedPackages` in `scripts/verify.mjs`. It then names the storefront's `softwareVersion` and
  the release links that must move with it.

## Updating the gallery

The gallery data lives in the `THEMES` array near the bottom of `index.html`. A theme contribution
must add or update its matching gallery row. The verifier checks that all 50 JSON display names are
present in the gallery.

The final value in each gallery row is the recommended terminal background. Claude Code controls
its interface colours; the terminal application still owns the terminal background.

The gallery rows live inside the page's one inline script, which is reviewed by hash. Changing a row,
or the gallery code, changes that hash, and `node scripts/verify.mjs` fails with the new one. Read
your change, then make the one edit its message names: replace the old hash with the new one in
`reviewedInlineScripts` in `scripts/verify.mjs`, and paste the Content-Security-Policy meta it prints
over the one at the top of `index.html`. The browser runs no script the policy does not name.

The policy is compared byte for byte: one line, the directives in the printed order, the hashes in the
order the scripts appear, and nothing but whitespace between it and `meta charset`. Anything else there,
even a stray `>` or an invisible space, ends the page's head in a browser, and a policy outside the head
is ignored.

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
  a name used twice would be indistinguishable in `/theme`.
- The `VOL2_THEMES` row is part of the page's inline script, so it changes the script's hash: replace
  the hash `verify` prints in `reviewedInlineScripts`, and paste the policy it prints into `index.html`
  (see "Updating the gallery" above).
- Bump the version in `plugins/dark-themes-vol-2/.claude-plugin/plugin.json` and the matching entry
  in `.claude-plugin/marketplace.json` together, and record the digest the verifier prints in
  `releasedPackages` in `scripts/verify.mjs`. Claude Code updates an installed plugin only when its
  version moves forward, so a theme added under the old version never reaches anyone who has the pack.
- Update the numbers the public pages state, in the same change. A theme adds fourteen contrast
  comparisons, so the role-aware check count moves, and the share card names each pack's size. Both
  are CI-enforced — see "Numbers stated on public pages" below. Adding a theme and running
  `node scripts/verify.mjs` without this step fails with a message naming the page, the count it
  states and the count the verifier ran: `index.html claims <stated> role-aware checks; the verifier
  runs <ran>.`
- The pack's size is also stated in words, and those move too. The description in
  `plugins/dark-themes-vol-2/.claude-plugin/plugin.json` opens with the count ("Twelve new …"), the
  marketplace entry must repeat it exactly, and the pages say "twelve new atmospheres", "twelve
  additional themes", "twelve all-new palettes" — on the pages (in their text and in meta
  descriptions, titles and `alt` text), `llms.txt`, the READMEs, the promotion drafts and the skill
  that describes the storefront. The verifier reads the number back from what ships and names each
  stale sentence and its line, all of a file's at once, starting with
  `dark-themes-vol-2 describes itself as shipping 12 but 13 ship.`

`scripts/sync-plugin-themes.mjs` does not apply here — it mirrors the root fifty into their plugin,
and a Vol. 2 theme is authored in its plugin directly.

Regenerating the pack's preview image is optional, and only worth doing if the grid changed
noticeably: render `index.html` in a headless browser and screenshot the `#vol2Grid` element to
`plugins/dark-themes-vol-2/preview.png`.

## Theme pages

Every theme has a page under `theme/<slug>/`, plus the index at `theme/index.html` and
`sitemap.xml`. They are generated, never edited by hand: `scripts/build-theme-pages.mjs` renders
them from the theme files, the gallery's terminal backgrounds and `previews.json`, and the verifier
fails if a page on disk differs from that render, if a theme has no page, or if a page has no theme.
After changing a theme, a gallery terminal colour or a preview colour, run the builder and commit
what it writes:

```bash
node scripts/build-theme-pages.mjs
```

## Numbers stated on public pages

The storefront, the share card and the meta descriptions state a role-aware check count and theme
counts. These are claims to a reader, so the verifier ties them to the computed values: if a change
moves the number of contrast comparisons or the size of either pack, the stated numbers must be
updated in the same change or CI fails. Removing the role-aware claim from the storefront or the share
card fails too, so that guard cannot be silenced by deletion.

The files that state the packs' size to a reader are read for those counts: every page, and every
note and text file Pages serves — `llms.txt`, every README, the promotion drafts, and every file of
the skills that ship to installers — plus the plugin manifests' descriptions, which installers read.
`CLAUDE.md`, `CONTRIBUTING.md`, `docs/` and `products/` are not: they record history, and the product
notes describe audio packs. A page is read as a reader sees it, meta descriptions, titles, `alt` and
`aria-` text included: a count wrapped across two lines or a blockquote, inside `**emphasis**`, a
code span or a Markdown link, written with an entity, a hyphen ("12-theme"), a "+" or a pair ("50
and 12 themes"), or spelled out as a word ("seventy-four") is still a count. A theme, palette or
atmosphere count must be one pack's size or the two together. A sentence that counts something else
must not put a number within five words before "themes", "palettes" or "atmospheres", unless an
article, a quantifier, a demonstrative or possessive, a preposition or a month comes between ("one
of the themes", "two commands install these themes", "3 colours for your themes" and "19 October,
Vol. 2 themes" are fine); reword it rather than the check. A step badge ("04"), an ordinal ("2nd"),
a hex colour and "one theme pack" are not counts. A role-aware count is the total unless "per theme"
or "for each theme" follows it.

The share card is rendered from `assets/social-preview.html`, not screenshotted from the site. Edit
that source, then regenerate `preview.png` at 1280×720 — the declared `og:image:width` and
`og:image:height` depend on the size.

Every public page shipping an `og:image` must state `og:image:alt`, a `twitter:image` must state a
`twitter:image:alt` that agrees with it, and pages sharing one image must describe it identically.

## Test locally

```bash
node scripts/sync-plugin-themes.mjs
node scripts/build-theme-index.mjs
node scripts/build-theme-pages.mjs
node scripts/build-readme-theme-links.mjs
node scripts/verify.mjs
node --test scripts/*.test.mjs
claude plugin validate .
```

The test suite copies your working tree into its fixtures, so until `verify` is green every test
that expects a green tree fails with it (after a colour change, 107 of 523 on 2026-10-24); fix what
`verify` names first. After a colour change it names the gallery script's new hash, and then the
release the changed pack needs.

The command checks:

- exactly 50 root-level theme files, plus every packaged Vol. 2 theme;
- valid JSON, names unique across both packs, and the shared override-key contract;
- six-digit hex colours;
- role-aware contrast against each theme's recommended terminal background, for both packs;
- palette parity between theme files and gallery cards, for both packs;
- byte-for-byte parity between root themes and the installable plugin;
- the marketplace and all three plugin manifests, key for key, and that each plugin directory holds
  exactly the files it should ship — a stray hook, command, skill or MCP config fails, because
  Claude Code would load it for every installer, and so does a missing file, a symlink, a
  `.gitmodules` file or an empty directory under `plugins/` (the shape a git submodule takes);
- a fresh-machine-safe installation command;
- that each plugin's homepage, repository and author address is exactly the one `verify` pins (a
  theme pack's homepage is its gallery on the `CNAME` domain), that each plugin ships
  `.claude-plugin/icon.png` as a clean 1024×1024 8-bit PNG under 2 MB with no text, EXIF, time or
  colour-profile chunk (the plugin directory keeps the first icon it is given), that
  `previews.json` holds one row per shipped Vol. 2 theme and no other, and that a plugin's version
  only moves forward;
- the shop's payment surfaces: each PayPal card against the price read back off PayPal, and each
  Gumroad card against the list of published products and the prices the page recorded — drift
  only, not a check against Gumroad;
- that every link a browser can follow from a public page goes to a host in `reviewedLinkHosts`,
  spelled out as `https://<host>/`, and reaches PayPal or Gumroad only at a verified id or slug —
  a link to a new host is a deliberate edit to that list in `scripts/verify.mjs`;
- that every inline script a page runs is reviewed by hash in `reviewedInlineScripts`, and every
  served `.html` page carries one Content-Security-Policy, right after `meta charset`, naming exactly those hashes
  and turning off workers, plugins, frames, `base` and form posts;
- that every served page is one `verify` reads as a browser does: no NUL character, no attribute
  written twice on one tag, no inline `math`, an inline `svg` only of plain shapes (`svg`, `g`,
  `path`, `rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`, with geometry and paint
  attributes), no `noscript`, `template` or other inert
  container, and no comment opener inside a script. The inert-element and script-tag checks read the
  raw page, comments and attribute values included: to mention one of those elements, write its `<`
  as `&lt;`;
- that every Markdown note GitHub Pages serves as a page (any `.md` outside a `.` or `_` directory) links
  only to reviewed hosts and never to a payment host, sets no front matter beyond `name`,
  `title` and `description`, and holds no Liquid — and that the root has no `_config.yml` or other `_` entry;
- that every file GitHub Pages serves is a reviewed type: a page is `.html` and a note `.md`, SVG
  artwork and the sitemap stay inside element and attribute allowlists (export SVG with presentation
  attributes rather than CSS; `verify` lists every construct to change, with each tool's setting), every page opens with
  `<!doctype html>`, no `.mjs` sits at or above a page (keep scripts in `scripts/`), no script
  carries a `src`, no note holds a script, a handler or another active element (describe them in
  words), and no served file opens with front matter (a note's `name`/`title`/`description` aside), is a
  symlink or has a name starting `.htaccess` — a new type,
  element or attribute is a deliberate edit to `SERVED_TYPES`, `SVG_DOCUMENT` or
  `SITEMAP_DOCUMENT` in `scripts/verify.mjs`;
- valid 1280×720 PNG assets for the curated developer picks;
- that stated check and theme counts on public pages, plugin descriptions and the READMEs match the
  computed values, in digits or in words;
- that share images carry alternative text, and that one image is described one way.
- that every page under `theme/` is a fresh render of its theme file and `sitemap.xml` lists each one.

GitHub Actions runs the regression tests and the same repository check on every pull request, on every
push to `main`, and on demand from the repository's Actions tab.

For a visual check, copy the changed theme into `~/.claude/themes/`, run `/theme`, and inspect normal
text, user messages, tool calls, permission prompts and plan mode. If the themes directory did not
exist when Claude Code launched, restart Claude Code once after creating it.

## Pull request notes

Include:

1. What changed and why.
2. The terminal application and background colour used for the visual check.
3. A screenshot when colours or layout changed.
4. Confirmation that `node scripts/verify.mjs` passes.
