# Promotion queue — Gabs Utilities

Primary storefront:

```text
https://gabs-utilities.com/
```

Goal: earn developer/community trust first, then convert attention into Gumroad sales. Do not spam, do not fake traction, do not imply community approval before it exists, and do not post the same ad everywhere.

## Positioning

Gabs Utilities is a small catalog of dark, practical developer and creator tools:

- free Claude Code themes and plugins
- paid dark UI/template/productivity packs

Best single-line pitch:

> A small dark-themed toolbox for Claude Code users, developers, and technical creators.

## Safe launch order

1. X / build-in-public
   - Best for lightweight announcement and ongoing progress.
   - Tone: honest, maker-style, visual if possible.
   - Avoid: “everyone needs this”, “crucial”, “viral”, or sales pressure.

2. Hacker News / Show HN
   - Best only if framed as the free Claude Code theme/plugin project plus the public shop/catalog.
   - Tone: technical, transparent, no hype.
   - Do not ask for upvotes anywhere.
   - Be ready to answer comments calmly for 2 hours after posting.
   - Current state, 2026-08-24: blocked by HN's `showlim` restriction for newer / less-established accounts.
   - Do not bypass with a second account, repost as a fake question, or force a non-Show submission. Build normal HN participation first, then retry later.

3. Product Hunt
   - Best after the domain, images, and first comments are polished.
   - Tone: short, visual, maker story.
   - Use representative project screenshots.
   - Ask for feedback, not “please upvote”.
   - Current state: see the 2026-10-24 Product Hunt row in the channel status
     log. The storefront already links a Product Hunt product page; whether it
     exists and whether a launch ran is read from the signed-in dashboard, not
     assumed.

4. GitHub discovery
   - Keep README clear.
   - Use accurate topics.
   - Add working demo links and screenshots.
   - Submit only to relevant awesome lists when the repo genuinely fits.

5. Evergreen directories
   - Use after main launch copy is stable.
   - Prioritize directories that accept dev tools or indie products without spammy backlink demands.

## Not published — keep out of the copy

The **Claude Code Workflow Kit** (`products/claude-code-workflow-kit/`) is
built but not on sale. Its own `PUBLISHING.md` records that Gumroad reported
`is_published: false`, and it still lists the remaining upload steps. Its slug
`zvbti` was removed from the storefront and the README, and `verify.mjs` does
not carry it in `verifiedGumroadSlugs`.

Until it is actually published, it must not appear in any copy here. Every
description above previously said the catalog includes "workflow kits" — the
posts, the Product Hunt comment, and the directory descriptions — which would
have advertised a product nobody can buy. Those mentions are removed.

When the kit is published: verify the live product page buyer-side first, add
the slug to `verifiedGumroadSlugs`, then put it back in the copy.

## Ready-to-post copy

### X — Dark Themes Vol. 2 announcement (Vol. 2 is live; posting is Gabriel's)

A two-post thread. As one post it ran to 352 characters by X's count (a link
counts as 23), over the 280 limit, and its single command failed on any
machine that had not added the marketplace. Measured 2026-10-19: 268 and 184.

```text
Shipped a free expansion to my Claude Code theme pack: Dark Themes Vol. 2.

12 all-new dark themes — Afterglow, Neon Noir, Cryosleep, Biolume and more — with the same semantic status colors and WCAG contrast floors as the original 50.

Gallery: https://gabs-utilities.com/#vol2
```

```text
Install it from the same marketplace (add it once):

claude plugin marketplace add notgabriels-sys/claude-code-50-dark-themes
claude plugin install dark-themes-vol-2@notgabriels-themes
```

### GitHub release — Dark Themes Vol. 2 (Vol. 2 is on main since #46, 2026-08-31; creating it is Gabriel's)

Suggested tag: `dark-themes-vol-2-v1.0.0`. Do not reuse the `themes-plugin-v*`
namespace — those tags version the flagship 50-pack (currently
`themes-plugin-v1.0.1`, matching that plugin's manifest), and reusing them
would make the release history say the flagship shipped a version it did not.

The storefront's JSON-LD `downloadUrl` is **not** affected either way: it is
`…/archive/refs/heads/main.zip`, which tracks the default branch, not any tag.
So the download that link serves is whatever is on `main` at the time — since
`af24eb7` that includes Vol. 2. Tag freely; just do not point that URL at a tag
without deciding which pack it is then claiming to be.

Title:

```text
Dark Themes Vol. 2 — 12 new free themes
```

Body:

```text
The notgabriels-themes marketplace now carries a second free plugin: Dark Themes Vol. 2.

Twelve all-new dark themes for Claude Code — Afterglow, Aurora Borealis, Basalt, Biolume, Cryosleep, Darkroom, Gaslight, Heliotrope, Magnetite, Monsoon, Neon Noir, Ozone — with the same semantic status colors and the same verified contrast floors as the original 50 (AAA primary text, AA secondary, WCAG non-text floor for borders and indicators).

Install:

    claude plugin marketplace add notgabriels-sys/claude-code-50-dark-themes
    claude plugin install dark-themes-vol-2@notgabriels-themes

Preview every palette in its own colors: https://gabs-utilities.com/#vol2

The original 50-theme pack is unchanged and stays free and MIT licensed.
```

After publishing it, run the "Attach themes zip to a release" workflow from the
repository's Actions tab with the tag `dark-themes-vol-2-v1.0.0`. It builds a
zip of the Vol. 2 themes alone from the tagged files and attaches it, so the
release page delivers the pack and not only GitHub's whole-repository archive.

### Free Gumroad archive — held from acquisition

Do not link, promote, or update the legacy free Gumroad archive while its public
description and exact delivered files remain unreconciled. Use the verified
GitHub/native-plugin route instead:

https://github.com/notgabriels-sys/claude-code-50-dark-themes/releases/tag/themes-plugin-v1.0.1

This hold does not unpublish or delete the Gumroad product. Restoring that route
requires a separately approved, exact-version artifact and delivery read-back.

### X launch post

```text
I moved my Claude Code / dark dev tools catalog onto a proper domain:

https://gabs-utilities.com/

It started as 50 free dark themes for Claude Code, then grew into a small toolbox: UI kits, templates, cheat sheets, and wallpapers.

Feedback welcome.
```

### Hacker News

Title:

```text
Show HN: 50 dark themes for Claude Code, plus a small dev-tool catalog
```

URL:

```text
https://gabs-utilities.com/
```

Optional first comment:

```text
I built this because I wanted Claude Code themes that were dark, readable, and still preserved semantic colors for errors, warnings, success states, and diffs.

The themes are free/MIT. The same visual system later turned into a small catalog of paid template/tool packs, but the main Claude Code theme/plugin project remains free.

I’d especially like feedback on whether the install flow and theme gallery are clear enough for Claude Code users.
```

### Product Hunt maker comment

```text
Maker here.

This started as a practical thing for myself: I wanted a set of dark Claude Code themes that stayed readable and did not destroy semantic colors like errors, warnings, success states, and diffs.

I kept expanding it into a small catalog of dark developer/creator utilities: UI kits, HTML templates, email templates, cheat sheets, wallpapers, and palettes.

The core Claude Code themes are free and MIT licensed. The paid packs are there for people who want the broader toolkit.

I’d love feedback from developers, Claude Code users, and people who care about practical dark UI systems: what feels useful, what feels unclear, and what should be improved before I keep expanding it.
```

### Short directory description

```text
Gabs Utilities is a compact catalog of dark developer and creator tools: 50 free Claude Code themes plus a free 12-theme Vol. 2 expansion, UI/template packs, cheat sheets, wallpapers, and palettes.
```

### Social share assets

The link preview card that X, Slack, LinkedIn and Discord render for
`gabs-utilities.com` is `preview.png` at the repo root, referenced by
`og:image` and `twitter:image` and declared as 1280x720 in the meta tags.

It is **not** a screenshot. It is rendered from `assets/social-preview.html`,
a purpose-built 1280x720 card. To regenerate after editing that source, load
the file in a headless browser at a 1280x720 viewport and screenshot the page
to `preview.png` — keep the size, or the declared `og:image:width` /
`og:image:height` become wrong.

What the current card shows, regenerated 2026-08-30:

- Kicker: "Claude Code · a quiet terminal collection"
- Headline: "50 dark themes for Claude Code"
- Stat row: 50 + 12 themes · 894 role-aware checks · MIT licensed · Claude Code v2.1.118+
- A terminal panel with the two-line marketplace + install command
- A strip of the pack's accent colors

Anything stated on the card is a public claim, so it has to stay true: the
check count and theme counts were both stale before this regeneration (726
checks, 50 themes). When either changes, edit the source and regenerate in the
same change. The `og:image:alt` and `twitter:image:alt` text describes this
card — it previously described "a grid of theme previews", which the image has
never been.

### GitHub awesome lists — prepared entries

Entries only. Per the submission pack's rule, make at most one careful
submission per list, by the route its CONTRIBUTING file names, and only to
lists whose scope explicitly covers Claude Code, terminal or CLI themes, or
developer tooling. Read each list's CONTRIBUTING file first and match its
existing line format instead of pasting these verbatim — most lists sort
alphabetically and pin a specific dash/pipe style.

#### awesome-claude-code — web issue form only, never a PR

`hesreallyhim/awesome-claude-code` on GitHub, read in a clone of its
CONTRIBUTING.md (30a4c09) on 2026-10-19: every recommendation goes through the
web UI issue form and is made by a person. It says not to open a pull request,
that the `gh` CLI cannot submit one, and that other routes risk a restriction.
Eligibility is 14 days since the first commit with active development, or 100
stars: this repository's first commit is 38d4f82 (2026-08-14) and it is under
active development. One resource at a time.
Descriptions are "descriptive, not promotional", do not address the reader, and
run 10 to 500 characters. The repository was not listed in that clone. Re-read
the CONTRIBUTING file just before submitting; its rules change.

Form fields:

- Display Name: `50 Dark Themes for Claude Code`
- Category: `Configuration` (where that list files other theme tweaks;
  `Design & UI/UX` is the alternative — check the dropdown)
- Link: this repository's GitHub address
- Author Name: `notgabriels-sys`, Author Link: its GitHub profile
- Description (244 characters, measured 2026-10-24):

```text
Plugin marketplace with 62 dark themes in two packs (50 + 12) for the /theme picker. Each palette leaves success, error, warning and diff colors on the base dark preset and is checked in CI against role-aware WCAG contrast floors. MIT licensed.
```

Wait for the outcome before any other list, and add no "Mentioned in" badge
unless it is accepted.

#### Other lists — Markdown lines for lists that take a PR

Claude Code-focused lists (best fit):

```text
- [50 Dark Themes for Claude Code](https://github.com/notgabriels-sys/claude-code-50-dark-themes) - 50 free MIT-licensed dark themes installable as a native plugin, plus a 12-theme Vol. 2 expansion. Preserves semantic colors for errors, warnings, success states and diffs.
```

Terminal / dotfiles / color-scheme lists:

```text
- [Claude Code 50 Dark Themes](https://github.com/notgabriels-sys/claude-code-50-dark-themes) - 62 dark terminal palettes for the Claude Code CLI, each verified against role-aware WCAG contrast floors. MIT.
```

Short-form lists that allow only a clause:

```text
- [claude-code-50-dark-themes](https://github.com/notgabriels-sys/claude-code-50-dark-themes) - Dark theme packs for Claude Code.
```

Rules for this route:

- Do not claim stars, downloads, popularity, or "the best" anything.
- Do not open a PR to a list whose scope does not cover this project.
- One list at a time; wait for the outcome before opening the next.

### Longer directory description

```text
Gabs Utilities is a small, practical catalog for developers and technical creators who like dark, readable tools. The core project is 50 free MIT-licensed themes for Claude Code, built with semantic colors for errors, warnings, success states, diffs, and terminal UI clarity. The same marketplace carries Dark Themes Vol. 2, a free 12-theme expansion held to the same contrast standards.

The catalog also includes paid packs such as dark UI kits, HTML/email/social templates, developer cheat sheets, wallpapers, and palettes.
```

## Do not post

Avoid these:

- “This will make me rich”
- “Everybody needs this”
- “The best Claude Code themes”
- “Please upvote”
- “Support me”
- “Buy this now”
- Any claim about sales, popularity, users, or community approval unless verified.

## Tracking

Record every public action with:

- date/time
- platform
- URL
- exact copy used
- immediate result
- follow-up needed

Use the result to improve positioning before posting again elsewhere.

## Channel status log

| Date | Channel | Status | Next responsible action |
|---|---|---|---|
| 2026-08-24 | Custom domain | Live with HTTPS enforced | Use `https://gabs-utilities.com/` as the primary storefront URL |
| 2026-08-24 | Hacker News / Show HN | Blocked by HN `showlim` notice | Do not retry immediately; participate normally on HN first, then submit later when the account is less restricted |
| 2026-08-24 | GitHub topics | Updated toward Claude Code / themes / dev tools discovery | Keep audio/sample-pack promotion on audio-specific repos/pages, not this theme repo |
| 2026-08-24 | Owned install guide | `https://gabs-utilities.com/claude-code-theme-install-guide.html` is live with HTTP 200, linked from the homepage and sitemap, and submitted to IndexNow with the verified `79F35EFA-F66B-4757-848A-FB1A9029E1BA` key | Use it as the first support link when people ask how to install the free Claude Code themes; pair it with the semantic-colors article for DEV/community posts |
| 2026-08-24 | TheDevToolsDir | Initial read at 06:40 CEST returned 404 while publication was processing; at 06:57 CEST the exact listing URL returned HTTP 200 and the public title, description, website, Standard tier, categories and tags read back correctly | Listing is independently verified live; keep the required footer badge while the Standard listing remains active and monitor useful referral traffic |
| 2026-08-24 | DevHunt | The new-tool route redirected to “Log in to your account”; no DevHunt account email was found | Keep the prepared developer-tool fields, but do not create an account merely to add another listing |
| 2026-08-24 | DEV Community | Paste-ready article draft created in `DEV_COMMUNITY_ARTICLE_DRAFT.md`; browser path not signed in | Preview and publish manually from the owner's DEV account, or reopen when signed in for final action-time confirmation |
| 2026-10-24 | Product Hunt | The storefront footer has linked a Product Hunt product page, "50 Dark Themes for Claude Code", since 3fd0b55 (2026-08-24), and `verify` requires that link. This session cannot reach Product Hunt, so whether that page exists and whether a launch ran are unread; nothing here claims a launch | Gabriel reads the signed-in dashboard and records the page's state and any launch date here; if no product page exists, the footer link comes out (a deliberate edit to `verify`'s check) |
| 2026-10-24 | Dark Themes Vol. 2 announcement | Vol. 2 has been on main since #46 (af24eb7, 2026-08-31), which merged 4365c25. GitHub's releases, read 2026-10-24, are only `themes-plugin-v1.0.0` and `themes-plugin-v1.0.1`, so the prepared Vol. 2 release is not created; the prepared X thread is not recorded as posted | Gabriel creates the release from the prepared tag and body, attaches its zip with the release-zip workflow, posts the thread, and records both here |
| 2026-10-24 | GitHub description and topics | Live description, read 2026-10-24: "50 hand-tuned dark themes for Claude Code, plus links into the Gabs Utilities ecosystem." The topics include `syntax-theme` and `dotfiles`, which the repository does not match, and not `wcag` | Gabriel runs the edit command in `.github/REPO_METADATA.md` |
| 2026-10-24 | Anthropic plugin directory | Not submitted. Each plugin now ships a listing icon, and all three pass `claude plugin validate --strict --profile directory` (Claude Code 2.1.310) | Gabriel submits the two theme packs by the route in `DIRECTORY_SUBMISSION_PACK.md`; nothing is claimed until a listing appears in `/plugin` Discover |
| 2026-10-24 | awesome-claude-code | Not listed in a clone read 2026-10-19; the repository is eligible; recommendations go by web issue form only | Gabriel submits once through the form with the prepared block above and records the issue here |
