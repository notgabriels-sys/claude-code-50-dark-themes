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

Run `/theme` and select any theme from the pack. Plugin themes are read-only; press `Ctrl+E` on one
to copy it into `~/.claude/themes/` for editing.

Set your terminal's background to the theme's terminal background, the hex printed on its gallery
card and its page, so the colors read as they were measured.

The plugin adds theme files and nothing else: it runs no code, hooks, commands or servers, and
sends nothing anywhere.

Visual gallery: https://gabs-utilities.com/

One page per theme, with a specimen, the install commands, its palette and the measured contrast:

https://gabs-utilities.com/theme/

Source and manual installation: https://github.com/notgabriels-sys/claude-code-50-dark-themes
