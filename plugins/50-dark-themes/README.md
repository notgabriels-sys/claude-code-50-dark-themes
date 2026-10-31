# 50 Dark Themes for Claude Code

This plugin adds all 50 themes to Claude Code's `/theme` picker. Each one recolors the accent, the
text and the surfaces around them, and leaves the success, error, warning and diff colors to
Claude Code's own dark preset, so a failing test still reads as one. Every palette is checked in CI
against role-aware contrast floors: WCAG AAA for primary text, AA for secondary text, and the
non-text floor for borders and indicators. The themes are free and MIT licensed.

```text
/plugin marketplace add notgabriels-sys/claude-code-50-dark-themes
/plugin install 50-dark-themes@notgabriels-themes
```

Then restart Claude Code: plugin themes load when it starts, so the session you installed from
won't list them. Run `/theme` and select any theme from the pack. Plugin themes are read-only; press
`Ctrl+E` on one to copy it into `~/.claude/themes/` for editing.

Set your terminal's background to the theme's terminal background, the hex printed on its gallery
card and its page, so the colors read as they were measured.

The plugin adds theme files and nothing else: it runs no code, hooks, commands or servers, and
sends nothing anywhere.

Visual gallery: https://gabs-utilities.com/

One page per theme, with a specimen, the install commands, its palette and the measured contrast:

https://gabs-utilities.com/theme/

Source and manual installation: https://github.com/notgabriels-sys/claude-code-50-dark-themes

## Use it

1. **Pick a theme.** Run `/theme`, move through the list and press Enter on the one you want.
   Switch again at any time the same way.
2. **Make it your own.** Plugin themes are read-only. Press `Ctrl+E` on one in `/theme` to copy it
   into `~/.claude/themes/`, then edit the copy's colors.
3. **Match your terminal.** Set your terminal's background to the theme's background color, listed
   on each theme's page, so panels and text look as designed. Step-by-step for each terminal, with a
   matching color scheme:
   https://github.com/notgabriels-sys/claude-code-50-dark-themes/tree/main/terminal-schemes
4. **Remove it.** Run `claude plugin uninstall 50-dark-themes@notgabriels-themes`, restart Claude
   Code (an open session keeps listing the pack until it restarts), then pick another theme in
   `/theme`.

## Troubleshooting

- **The themes aren't in `/theme`.** Custom themes need Claude Code v2.1.118 or later
  (`claude --version`, then `claude update`). Restart Claude Code after installing the plugin.
- **Colors look washed out or gray.** Your terminal background doesn't match the theme, or the
  terminal isn't showing 24-bit color (Terminal.app before macOS 26, and some SSH setups). Inside tmux,
  Claude Code draws in 256 colors at most, even with `COLORTERM=truecolor`, until
  `CLAUDE_CODE_TMUX_TRUECOLOR=1` is set too (after `set -ga terminal-overrides ',*:Tc'` in `~/.tmux.conf`).
- **"Auto (match terminal)" doesn't pick these themes.** Expected: Auto only switches between
  Claude Code's built-in light and dark themes. Pick a custom theme in `/theme` and it stays selected.

## Support

Questions, bugs and theme requests: https://github.com/notgabriels-sys/claude-code-50-dark-themes/issues

