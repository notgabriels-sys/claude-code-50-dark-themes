# 50 dark themes for Claude Code

Custom themes for the Claude Code CLI. The chat app (claude.ai / desktop) only supports
Light / Dark / System, so these install into Claude Code, which does support custom themes.

**→ Visual gallery: [open `index.html`](index.html)** (all 50 previewed in their own colors).

Prefer a zip to a `git clone`? The same 50 themes are a **free download** here:
**[get the pack →](https://notgabriel.gumroad.com/l/slhbym)** (name your price, $0 is fine).

## Quick install

```bash
git clone https://github.com/notgabriels-sys/claude-code-50-dark-themes
cp claude-code-50-dark-themes/*.json ~/.claude/themes/
```

Then run `/theme` in Claude Code and pick one.

## Install (step by step)

1. Copy any (or all) of the .json files into `~/.claude/themes/`
2. In Claude Code, run `/theme` — each file appears in the list by name
3. Select one. Edits to the files hot-reload; no restart needed
   (if `~/.claude/themes/` didn't exist before, restart Claude Code once)

## What each file sets

- `claude` + shimmer: brand accent (spinner, assistant label) = theme accent
- `text` / `inactive` / `subtle`: foreground, secondary text, faint borders
- `promptBorder`, `suggestion`, `rate_limit_fill`: accent-matched
- `permission`, `planMode`: second accent where the theme has one
- `userMessageBackground` (+hover): raised surface, one step above the theme `bg`

Left at the base `dark` preset on purpose: `success`, `error`, `warning`, diff colors —
so status colors stay semantically green/red/yellow in every theme.

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

Same palettes and the same care, applied elsewhere. All one-time purchases, no subscriptions.

| | |
|---|---|
| **[Dark UI Kit](https://notgabriel.gumroad.com/l/ckthsb)** — one CSS file, no build step | buttons, forms, cards, tabs, modal · €12 |
| **[Dark HTML Templates](https://notgabriel.gumroad.com/l/cfcvmy)** — 8 single-file pages | portfolio, SaaS, docs, pricing · $19 |
| **[Dark Email Templates](https://notgabriel.gumroad.com/l/xjcbji)** — transactional email | welcome, receipt, reset, OTP · €9 |
| **[Social & OG Templates](https://notgabriel.gumroad.com/l/bunkhy)** — exact-size share images | OG cards, X header, thumbnails · €9 |
| **[Résumé & CV Templates — live demo](https://notgabriels-sys.github.io/dark-html-templates-demo/resume/)** — prints clean to PDF | 5 layouts + cover letter · checkout temporarily withheld |
| **[Dev Cheatsheets](https://notgabriel.gumroad.com/l/kxsfa)** + **[Vol. 2](https://notgabriel.gumroad.com/l/kykega)** | git, vim, tmux, SQL, CSS, HTTP · €7 each |
| **[Keyboard Shortcuts](https://notgabriel.gumroad.com/l/wgtbkq)** — keycap reference cards | VS Code, macOS, Vim, tmux · €7 |
| **[Dark Wallpapers](https://notgabriel.gumroad.com/l/bqgfv)** + **[Vol. 2 · Aurora](https://notgabriel.gumroad.com/l/jqrdfy)** | 4K, desktop & mobile · from €6 |
| **[50 Dark Palettes](https://notgabriel.gumroad.com/l/xcxeb)** — for designers & devs | CSS, SCSS, Tailwind, .ase, .gpl · $9 |

**[Everything Dark — the complete kit →](https://notgabriel.gumroad.com/l/wuhehk)** (all of the above, $39)

### See them running first

**[Live demos →](https://notgabriels-sys.github.io/dark-templates-demo/)** — business documents,
slide decks and app screens, running in your browser. No signup, nothing to download.
The [HTML templates demo](https://notgabriels-sys.github.io/dark-html-templates-demo/) is separate.

---

Themes in this repo are free and stay free — MIT. If they saved you some fiddling,
a ⭐ helps other people find them.
