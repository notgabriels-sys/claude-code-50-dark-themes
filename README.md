# 50 dark themes for Claude Code

[![Verify themes and shop](https://github.com/notgabriels-sys/claude-code-50-dark-themes/actions/workflows/verify.yml/badge.svg)](https://github.com/notgabriels-sys/claude-code-50-dark-themes/actions/workflows/verify.yml)

Custom themes for the Claude Code CLI. The chat app (claude.ai / desktop) only supports
Light / Dark / System, so these install into Claude Code, which does support custom themes.

Requires **Claude Code v2.1.118 or later**, the release that introduced named custom themes.

**→ Visual gallery and storefront: [gabs-utilities.com](https://gabs-utilities.com/)** (all 50 previewed in their own colors).

Prefer a zip to a `git clone`? The same 50 themes are a **free download** here:
**[get the pack →](https://notgabriel.gumroad.com/l/slhbym)** (name your price, $0 is fine).

## Quick install — Claude Code plugin

Run these in your terminal:

```bash
claude plugin marketplace add notgabriels-sys/claude-code-50-dark-themes
claude plugin install 50-dark-themes@notgabriels-themes
```

Then run `/theme` in Claude Code and pick one. The plugin keeps the pack together and makes updates
available through the marketplace. Press `Ctrl+E` on a plugin theme if you want an editable copy in
`~/.claude/themes/`.

Step-by-step install, terminal background and troubleshooting guide:
<https://gabs-utilities.com/claude-code-theme-install-guide.html>

### Also in this marketplace — Berlin Studio Skills

```bash
claude plugin install berlin-studio-skills@notgabriels-themes
```

Five skills for running a techno studio and a freelance audio practice in Berlin: building a
specific sound, diagnosing a mix that will not translate, getting masters and metadata out the
door, formal German correspondence, and German freelance invoicing and tax admin. They route to
one another, so you rarely have to name one. See
[the plugin README](plugins/berlin-studio-skills/README.md).

## Manual install

```bash
git clone https://github.com/notgabriels-sys/claude-code-50-dark-themes
mkdir -p ~/.claude/themes
cp claude-code-50-dark-themes/*.json ~/.claude/themes/
```

Then run `/theme` in Claude Code and pick one.

## Install with one command

```bash
git clone https://github.com/notgabriels-sys/claude-code-50-dark-themes
cd claude-code-50-dark-themes && ./install.sh
```

Then run `/theme` in Claude Code and pick one.

```bash
./install.sh --list            # show the 50 names
./install.sh acid deep-field   # install only those
./install.sh --uninstall       # remove them again
```

It copies into `~/.claude/themes/`, and if a file of the same name is already there with
different contents it is backed up once as `<name>.json.bak` before being replaced.
`--uninstall` removes the themes and leaves the backups alone.

## Install (step by step)

1. Update Claude Code to v2.1.118 or later
2. Create `~/.claude/themes/` if needed, then copy any (or all) of the `.json` files into it
3. In Claude Code, run `/theme` — each file appears in the list by name
4. Select one. Edits to the files hot-reload; no restart needed
   (if `~/.claude/themes/` didn't exist before, restart Claude Code once)

## What each file sets

- `claude` + shimmer: brand accent (spinner, assistant label) = theme accent
- `text` / `inactive` / `subtle`: foreground, readable secondary text, non-essential faint hairlines
- `promptBorder`, `suggestion`, `rate_limit_fill`: accent-matched
- `permission`, `planMode`: second accent where the theme has one
- `userMessageBackground` (+hover): raised surface, one step above the theme `bg`

Left at the base `dark` preset on purpose: `success`, `error`, `warning`, diff colors —
so status colors stay semantically green/red/yellow in every theme.

The repository verifier checks each palette against its recommended terminal background:
AAA contrast for primary text, AA for foreground accents and readable secondary text, and the
WCAG non-text floor for functional borders and indicators. `subtle` is reserved for decorative
hairlines; it is never used as the readable secondary-text color.

## Note on backgrounds

Claude Code cannot set your terminal's background color — the terminal app owns that.
For the full effect, set your terminal background to the theme's `bg` hex
(listed in the gallery page, e.g. Graphite = #1D1E20).

### Transparent terminals

Claude Code paints `userMessageBackground` opaquely — it does not inherit your terminal's
transparency. So these themes set it one step *above* the theme `bg` rather than equal to it.
On a transparent terminal the user-message block then reads as a deliberately raised panel,
instead of an opaque patch in the exact color of the background you can otherwise see through.
On an opaque terminal it just reads as a subtle raised surface.

## Same palettes, on the web

These 50 palettes also ship as a set of dark website templates — portfolio, SaaS landing,
docs, pricing, changelog, waitlist, link-in-bio and a résumé, each a single `index.html`
with no build step. **[Live demo →](https://notgabriels-sys.github.io/dark-html-templates-demo/)**

## The 50 themes

Absinthe · Acid · Amber Room · Anaglyph · Blackout · Blueprint · Cassette · Clay ·
Cobalt Hour · Concrete · Coral · Crossfade · Deep Field · Dubplate · Ember · Fathom ·
Fjord · Furnace · Glacier · Graphite · Greenhouse · Harbor · Hearth · Ink · Iris ·
Lagoon · Lichen · Moss · Mulberry · Nachtschicht · Night Vision · Nightshade · Off Air ·
Orchid · Oxide · Petrol · Plasma · Signal Red · Sonar · Soot · Static · Terminal ·
Tidepool · Tungsten · Ultraviolet · Undergrowth · Undertow · VU Meter · Velvet · Verdigris


## More dark tools

Same palettes and the same care, applied elsewhere. All one-time purchases, no
subscriptions, and none of it needed to use the themes above.

<details>
<summary>Nine published packs plus one résumé demo — UI kit, HTML templates, app screens, email, social, cheatsheets, keycaps, wallpapers, palettes</summary>

| | |
|---|---|
| **[Dark UI Kit](https://notgabriel.gumroad.com/l/ckthsb)** — one CSS file, no build step | buttons, forms, cards, tabs, modal · €12 |
| **[Dark HTML Templates](https://notgabriel.gumroad.com/l/cfcvmy)** — 8 single-file pages | portfolio, SaaS, docs, pricing · $19 |
| **[Dark App Screens](https://notgabriel.gumroad.com/l/dark-app-screens)** — 6 product screens + 50 themes | sign-in, dashboard, data table, settings, inbox, error pages · €14 |
| **[Dark Email Templates](https://notgabriel.gumroad.com/l/xjcbji)** — transactional email | welcome, receipt, reset, OTP · €9 |
| **[Social & OG Templates](https://notgabriel.gumroad.com/l/bunkhy)** — exact-size share images | OG cards, X header, thumbnails · €9 |
| **[Résumé & CV Templates — live demo](https://notgabriels-sys.github.io/dark-html-templates-demo/resume/)** — prints clean to PDF | 5 layouts + cover letter · checkout temporarily withheld |
| **[Dev Cheatsheets](https://notgabriel.gumroad.com/l/kxsfa)** + **[Vol. 2](https://notgabriel.gumroad.com/l/kykega)** | git, vim, tmux, SQL, CSS, HTTP · €7 each |
| **[Keyboard Shortcuts](https://notgabriel.gumroad.com/l/wgtbkq)** — keycap reference cards | VS Code, macOS, Vim, tmux · €7 |
| **[Dark Wallpapers](https://notgabriel.gumroad.com/l/bqgfv)** + **[Vol. 2 · Aurora](https://notgabriel.gumroad.com/l/jqrdfy)** | 4K, desktop & mobile · from €6 |
| **[50 Dark Palettes](https://notgabriel.gumroad.com/l/xcxeb)** — for designers & devs | CSS, SCSS, Tailwind, .ase, .gpl · $9 |

</details>

**[Everything Dark — the complete kit →](https://notgabriel.gumroad.com/l/wuhehk)** (published dark-asset bundle, $39)

### More free things

- **[Lowlight — 70 VS Code themes](https://github.com/notgabriels-sys/lowlight-themes)** — fifty dark, twenty light, same contrast discipline. MIT.
- **[Dark Terminal Themes](https://github.com/notgabriels-sys/dark-terminal-themes)** — the same fifty for Alacritty, kitty, Ghostty, WezTerm, iTerm2 and Windows Terminal. MIT.
- **[Deep Field for Obsidian](https://github.com/notgabriels-sys/obsidian-deep-field)** — one of the fifty, free and standalone. MIT.

### The contrast tool, free

**[theme-contrast](https://github.com/notgabriels-sys/theme-contrast)** — one Python file, no
dependencies, checks any theme against WCAG floors and exits non-zero in CI. It knows the
difference between body text, accents, UI marks and surfaces, so it does not bury the real
failures under false positives. MIT.

```bash
python3 theme_contrast.py themes/
```

### How these are built

**[What 50 dark Claude Code themes taught me about semantic terminal colors](https://gabs-utilities.com/semantic-terminal-colors.html)**
— why decorative accents can move while errors, warnings, success states and diffs keep their meaning.

**[Every one of my 50 themes failed a contrast check](https://notgabriels-sys.github.io/dark-templates-demo/writing/contrast-floors.html)**
— what the floors are, why a naive check is worse than none, and the fix.

### See them running first

**[Live demos →](https://notgabriels-sys.github.io/dark-templates-demo/)** — business documents,
slide decks and app screens, running in your browser. No signup, nothing to download.
The [HTML templates demo](https://notgabriels-sys.github.io/dark-html-templates-demo/) is separate.

---

Themes in this repo are free and stay free — MIT. If they saved you some fiddling,
a ⭐ helps other people find them.

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before adding or changing a theme;
the repository verifies the theme schema, gallery parity, installation command and payment links on every push.

---

**[Gabriel — Audio Tools + Code →](https://gabriel-tools-and-code.notgabriels960914.chatgpt.site)**
