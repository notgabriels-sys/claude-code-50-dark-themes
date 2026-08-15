# 50 dark themes for Claude Code

Custom themes for the Claude Code CLI. The chat app (claude.ai / desktop) only supports
Light / Dark / System, so these install into Claude Code, which does support custom themes.

**→ Visual gallery: [open `index.html`](index.html)** (all 50 previewed in their own colors).

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

## The 50 themes

Absinthe · Acid · Amber Room · Anaglyph · Blackout · Blueprint · Cassette · Clay ·
Cobalt Hour · Concrete · Coral · Crossfade · Deep Field · Dubplate · Ember · Fathom ·
Fjord · Furnace · Glacier · Graphite · Greenhouse · Harbor · Hearth · Ink · Iris ·
Lagoon · Lichen · Moss · Mulberry · Nachtschicht · Night Vision · Nightshade · Off Air ·
Orchid · Oxide · Petrol · Plasma · Signal Red · Sonar · Soot · Static · Terminal ·
Tidepool · Tungsten · Ultraviolet · Undergrowth · Undertow · VU Meter · Velvet · Verdigris
