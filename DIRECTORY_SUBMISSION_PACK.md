# Directory submission pack — Gabs Utilities

Primary URL:

```text
https://gabs-utilities.com/
```

## Product identity

Product name:

```text
Gabs Utilities
```

Short tagline:

```text
Dark developer tools for Claude Code users and technical creators.
```

260-character Product Hunt description:

```text
A compact catalog of dark developer tools: 50 free Claude Code themes plus a free 12-theme Vol. 2 expansion, UI kits, templates, cheat sheets, palettes, and wallpapers.
```

Long description:

```text
Gabs Utilities is a small, practical catalog for developers and technical creators who like dark, readable tools. The core project is 50 free MIT-licensed themes for Claude Code, built with semantic colors for errors, warnings, success states, diffs, and terminal UI clarity. The same marketplace carries Dark Themes Vol. 2, a free 12-theme expansion held to the same contrast standards.

The catalog also includes paid packs such as dark UI kits, HTML/email/social templates, developer cheat sheets, wallpapers, and palettes.
```

Category fit:

- Developer Tools
- Design Tools / Design Resources
- Productivity
- IDEs & Editors
- UI Library
- Documentation / Helpers

Tags:

```text
Claude Code, themes, dark mode, developer tools, terminal, UI kit, templates, accessibility
```

Maker note:

```text
Built under the Gabs Utilities developer-product identity.
```

Developer-specific supporting asset:

```text
Claude Code Theme Install Guide — native plugin install, manual JSON fallback, terminal background setup and troubleshooting:
https://gabs-utilities.com/claude-code-theme-install-guide.html
```

Developer-specific evergreen article:

```text
Semantic Terminal Colors — design notes from building 50 free Claude Code themes while preserving status meaning:
https://gabs-utilities.com/semantic-terminal-colors.html
```

## Product Hunt

Use Product Hunt only when signed in and the product page/dashboard is accessible.

Current state: the storefront footer links a Product Hunt product page named
"50 Dark Themes for Claude Code"; whether it exists and whether a launch ran are
unread (see the 2026-10-24 row in `PROMOTION_QUEUE.md`'s status log). Use the
signed-in dashboard as the source of truth; do not create a second account, pay
a hunter, or ask people for upvotes.

Product Hunt names the product the storefront links, not the catalog, so a post
uses this identity rather than "Gabs Utilities" above (use it only after the
live page is read):

- Name: `50 Dark Themes for Claude Code`
- Tagline (56 characters; launch guides put the cap at 60, so check on the form):

```text
Free dark themes for Claude Code that keep status colors
```

- Description: lead with the 50 + 12 free themes and how they are checked;
  mention the paid packs only as "also from the maker".

Official Product Hunt guidance says:

- use a personal account, not a company account
- submit the direct product URL
- include the maker
- prepare a first comment
- Product Hunt community quality depends on real comments and feedback, not generic or mass comments

Sources checked 2026-08-24:

- <https://help.producthunt.com/en/articles/479557-how-to-post-a-product>
- <https://www.producthunt.com/launch/preparing-for-launch>

Prepared first comment:

```text
Maker here.

This started as a practical thing for myself: I wanted a set of dark Claude Code themes that stayed readable and did not destroy semantic colors like errors, warnings, success states, and diffs.

I kept expanding it into a small catalog of dark developer/creator utilities: UI kits, HTML templates, email templates, cheat sheets, wallpapers, and palettes.

The core Claude Code themes are free and MIT licensed, and the same marketplace now carries Dark Themes Vol. 2, a free 12-theme expansion held to the same contrast floors. The paid packs are there for people who want the broader toolkit.

I’d love feedback from developers, Claude Code users, and people who care about practical dark UI systems: what feels useful, what feels unclear, and what should be improved before I keep expanding it. If a theme is hard to read in your terminal, the repository's issue form "Theme readability report" asks for exactly what I need to fix it.
```

## DevHunt

Fit: good, but position this as the free Claude Code themes and developer-tool catalog, not as a generic Gumroad shop.

Current status:

```text
The new-tool route currently redirects to “Log in to your account.” No DevHunt
account email was found. The fields below are prepared, but no account or
submission should be created merely to increase a directory count.
```

Use this route when DevHunt is open manually:

```text
https://devhunt.org/account/tools/new
```

Suggested fields:

```text
Name:
Gabs Utilities

Website:
https://gabs-utilities.com/

Short description:
Dark developer tools for Claude Code users and technical creators.

Long description:
Gabs Utilities is a compact catalog of dark developer tools built around 50
free MIT-licensed Claude Code themes plus a free 12-theme Vol. 2 expansion.
It also links to related dark UI kits, templates, cheat sheets, palettes,
wallpapers, and audio utilities. The theme sets
preserve semantic colors for errors, warnings, success states, diffs, and
terminal UI clarity.

Pricing:
Free

Tags:
Claude Code, themes, dark mode, terminal, developer tools, UI kit
```

Suggested category:

```text
IDE
```

Alternative categories:

```text
Design
Helpers
UI Library
```

Submission copy:

```text
Gabs Utilities is a small dark-tool catalog built around 50 free Claude Code themes and a free 12-theme Vol. 2 expansion. It includes a visual theme gallery, plugin install flow, and related dark UI and template packs for developers and technical creators.
```

## Uneed

Fit: medium. It can provide discovery and a backlink, but current public guidance says the free queue is several months out as of August 2026, while faster options are paid.

Do not pay without the owner's explicit approval.

Use the same Product name, URL, tagline, and long description above.

## TheDevToolsDir

Live listing:

```text
https://thedevtoolsdir.com/product/gabs-utilities/
```

Status:

```text
The provider confirmation page said the dofollow badge was verified. The first
independent request at 06:40 CEST returned HTTP 404 while publication was still
processing. A second read-back at 06:57 CEST returned HTTP 200 and verified the
public title, description, outbound site URL, 2026-08-24 publication date,
Standard tier, categories and tags.
```

The listing is now independently verified as public. Keep the required badge
while the Standard listing is active, and recheck the target before using it in
future campaigns.

Suggested category:

```text
IDEs & Editors
```

Alternative category:

```text
Other
```

Tags:

```text
Claude Code, themes, dark mode, developer tools, terminal, UI kit
```

## Anthropic plugin directory

Anthropic's directory lists plugins people add from claude.ai; a listed theme
pack reaches Claude Code users who never find this marketplace. Read 2026-10-24
from Anthropic's pages "Publish to the directory", "Submit your plugin" and
"Plugin pre-submission checklist" on claude.com's docs. Nothing is submitted,
and nothing is claimed until a listing appears.

Route: the developer portal at `claude.ai/directory/manage`, then **Submit new**
and **Plugin bundle**. It needs a paid plan (Pro or Max submit from their own
account; on Team and Enterprise, an Owner), and the GitHub account connected on
claude.ai must be able to push to this repository. The first organization to
submit a folder holds its listing, so submit from the account that should own
it. The data handling questions and the compliance step (a contact email and
four acknowledgements) are the owner's to answer.

Submit each plugin folder on its own: the portal refuses a repository root that
holds several plugins ("Pick one plugin first"). On the **Source** step:

- Repository: `notgabriels-sys/claude-code-50-dark-themes`
- Plugin path: `plugins/50-dark-themes`, then, as a second submission,
  `plugins/dark-themes-vol-2`
- Branch or tag: empty, to follow `main`

Submit the two theme packs. Hold `berlin-studio-skills` until its German tax
skill has been read against the statutes (`freelance-admin-de` says it was
written from memory); a directory listing would put it before every Claude user.

What the portal reads, and where it stands here:

- **Listing details** come from `plugin.json` and the README, and the README is
  the listing's description: both theme READMEs say what the pack does, how it
  treats status colors, how it is checked, and that it runs and sends nothing,
  which is what the security scan looks for.
- **README** of at least 40 words outside code blocks, and a **LICENSE** in the
  plugin folder: both present in each plugin.
- **Icon**: `logo.png`, a 1024 px square in each plugin, named by
  `plugin.json`'s `icon`: for both theme packs the shop's square logo, drawn
  in the colours of Petrol, one of the 50 (`assets/theme-packs-icon.svg`).
  Claude Code's own validator says an icon may become the listing icon only
  once, the first time the plugin is saved or submitted in the portal.
- **Files**: images, JSON and text only; none near the 256 KiB limit for
  non-image files, and no `.DS_Store`, symlink or submodule (`verify` refuses
  those under `plugins/`).
- **Version**: the portal asks that `version` move with every release, which
  `verify`'s release check already enforces for a changed payload.
- **Possible holds, not blocks**: a name made only of generic words, and a
  display name that names Claude Code, can be held for a reviewer.

Before submitting, run from the repository root:

```bash
claude plugin validate --strict .
claude plugin validate --strict --profile directory plugins/50-dark-themes
claude plugin validate --strict --profile directory plugins/dark-themes-vol-2
```

All three passed on 2026-10-24 (Claude Code 2.1.310). The portal's own
**Validate** runs more checks; fix anything it marks **Blocking** and validate
again. After a listing goes live, each merge to `main` is scanned as a new
version. Passing is not publishing: by default the owner asks to publish each
passing version and an Anthropic reviewer publishes it, and an auto-publish
setting can publish later passing versions by themselves. Until then the
listing keeps the last published version (Anthropic's "Submit your plugin"
page, as read for the 2026-10-24 review; search results the same day agreed
that a passing version is not necessarily live).

## Next exposure queue

Use this order. It favors relevance and avoids low-quality spam-directory energy.

1. DEV Community article
   - Strongest immediate community-safe fit because it teaches from the free,
     MIT-licensed theme project instead of leading with a shop.
   - Use the prepared article draft and include real screenshots or a concise
     theme JSON example before publishing.
   - Draft is saved in `DEV_COMMUNITY_ARTICLE_DRAFT.md`.
   - Support link: `https://gabs-utilities.com/claude-code-theme-install-guide.html`.

2. Anthropic plugin directory
   - Reaches Claude Code users inside Claude's own catalog; see the section
     above. Submit the two theme packs, one folder at a time.

3. Product Hunt
   - Higher reach. The storefront already links a Product Hunt product page;
     read its state on the signed-in dashboard first (see the 2026-10-24 row in
     `PROMOTION_QUEUE.md`'s status log).
   - Use the prepared first comment above.
   - Do not ask for upvotes or mass-comment.

4. DevHunt
   - Good developer-tool fit for the free themes and catalog.
   - Requires an existing signed-in account; do not create one only to add a
     listing count.

5. GitHub awesome lists
   - Only submit to lists that explicitly accept Claude Code, terminal themes, CLI themes, or developer tooling.
   - Make one careful submission per relevant list, by the route its CONTRIBUTING file names;
     awesome-claude-code takes its web issue form only, never a PR (block in `PROMOTION_QUEUE.md`).

6. Launch/startup directories
   - Use only if they have a clear developer-tools category and a free submission path.
   - Avoid paid placement unless the owner explicitly approves the exact price and benefit.
   - Avoid adding multiple directory badges to the storefront footer unless the directory is genuinely relevant.

## Not suitable right now

- Hacker News / Show HN: currently blocked by HN `showlim`.
- Reddit: the owner's account is permanently banned, and circumventing that would be wrong.
- Paid directory fast-tracks: no purchase without explicit approval.
- Generic SaaS review sites: weak fit until there are users/customers and a clearer SaaS-style product.

## Responsible launch principles

- Ask for feedback before asking for money.
- Lead with the free Claude Code themes because that is most community-safe.
- Mention paid packs only as optional extensions.
- Do not claim popularity, revenue, or user counts unless verified.
- Do not use AI-generated generic comments on Product Hunt or elsewhere.
- Do not mass comment across launches just to farm attention.
