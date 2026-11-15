# Dark Themes Gallery for Claude Code

A small, free Claude Code mod. Type `/themes` and a pane opens with all 62 free dark themes from
the **50 Dark Themes** and **Dark Themes Vol. 2** packs, each drawn in its own colors, so you can
compare them before you switch in `/theme`. In a wide fullscreen terminal the pane sits beside
the chat; in a narrower or non-fullscreen terminal it opens above the prompt. The VS Code
extension docks it beside the chat in a panel at least 800 pixels wide, and above the prompt in a
narrower one.

Each theme gets one row with its name and four swatches in the theme file's real colors:

1. accent (`claude`)
2. text (`text`)
3. panel (`userMessageBackground`)
4. second accent (`permission`)

The rows are grouped by pack. You can filter them by accent family (Warm, Cool, Green, Violet,
Neutral), using the same families as the repository's web gallery. The theme your settings
select is marked, and each row tells you how to use it. If a pack is missing from your plugin
settings, the pane shows the commands that install it.

The themes themselves change Claude Code's terminal interface. The desktop app and the VS Code
extension follow their own appearance settings, so there the gallery is a preview, and you switch
themes with `/theme` in a terminal session.

The mod is MIT licensed and contains no ads.

## What it reads, and what it never does

- It reads two keys from your Claude Code settings: `theme`, to mark the selected theme, and
  `enabledPlugins`, to see whether the two theme packs are installed. It reads no other setting.
- It keeps one value for the session: which family filter you picked. This value is gone when the
  session ends.
- It does not change your theme. To switch, use `/theme`.
- It writes no files, starts no processes and makes no network requests. It makes no model calls,
  collects no telemetry, and does not touch your tool calls, prompts or the rest of Claude Code's
  interface.

The theme colors are built into the mod. A script generates them from the packs' own theme
files, and the repository's tests fail if the two ever disagree. The mod's icon is drawn from the
same free theme colors, and the checks refuse any other color in it.

## Requirements

- Claude Code v2.1.299 or later, with mods turned on (the default). Tested in the terminal with
  v2.1.310; the desktop app and the VS Code extension were covered only by the mod's own tests.
- It draws in the terminal, the Code tab of the desktop app and the VS Code extension's chat
  panel. In VS Code, a session that doesn't fetch feature flags (for example on Amazon Bedrock)
  needs v2.1.304 or later. It doesn't run in the desktop app's WSL sessions, where plugins aren't
  available.
- To pick a theme in `/theme`, you need the theme packs themselves. Install them below, or copy
  the theme files into `~/.claude/themes` by hand.

## Install

Run these at the prompt of a Claude Code terminal session:

```text
/plugin marketplace add notgabriels-sys/claude-code-50-dark-themes
/plugin install theme-gallery@notgabriels-themes
```

Also install the themes, if you haven't yet:

```text
/plugin install 50-dark-themes@notgabriels-themes
/plugin install dark-themes-vol-2@notgabriels-themes
```

From a shell, use the same commands with `claude plugin` in place of `/plugin`, for example
`claude plugin marketplace add notgabriels-sys/claude-code-50-dark-themes` and then
`claude plugin install theme-gallery@notgabriels-themes`. If a session is already open, run
`/reload-plugins` in it to load the mod.

In the desktop app, where `/plugin` doesn't run: click **+** next to the prompt box, then
**Plugins**, **Add marketplace** with `notgabriels-sys/claude-code-50-dark-themes`, then
**Add plugin**.

The terminal, the desktop app's local sessions and the VS Code extension read the same settings
files, so a plugin installed for your user in one of them is there in the other two.

Restart Claude Code once after installing the theme packs, so `/theme` lists them.

## Use it

Run `/themes`. While the pane has the keyboard:

| Key | Action |
| --- | --- |
| `0` to `5` | Filter by family: All, Warm, Cool, Green, Violet, Neutral |
| `r` | Read the settings again, for example after you switched in `/theme` |
| `q` or `Esc` | Close the pane |
| Up, Down, Page Up, Page Down, Home, End | Scroll the list |

The pane takes the keyboard when it opens. If it doesn't have it, press `ctrl+x` then `Tab`, or
click it (in the terminal, clicking needs fullscreen rendering). In the desktop app you can also
click the filters and buttons. The VS Code extension has no hotkeys: click a button or press
Enter on it.

To switch themes, run `/theme`, move to the theme's name and press Enter.

## Use cases

- **Compare before you switch.** See every accent next to every other one. `/theme` shows only
  one theme at a time.
- **Find a theme by color.** Filter to Cool or Violet and scan only the themes that fit.
- **Check what is active.** The marked row and the first line of the pane name your current
  theme. When it is a theme file in `~/.claude/themes` named like one of the free themes, the
  first line says so. The mod matches that file by its name only, so an edited copy still shows
  the original colors.
- **Check your setup.** The pane says which packs are missing from your settings, with the
  exact commands to install them.

## Troubleshooting

- **`/themes` is not a command.** Work through these:
  - Run `claude plugin list` to check that `theme-gallery@notgabriels-themes` is installed and
    enabled. In a terminal session, `/plugin` shows a dim `mods active` line under its tabs, which
    names `theme-gallery` once the mod has loaded.
  - If you installed it from a shell while a session was open, run `/reload-plugins` in that
    session, or restart Claude Code.
  - Check the version. In a terminal, run `claude --version`, then `claude update`. The desktop
    app includes its own copy of Claude Code: in a local session in the Code tab, enter `/status`
    and read the **Claude Code** row, and update the app if it is older than v2.1.299.
  - Your own settings and flags can stop installed mods: `disableAllHooks` in your settings,
    starting Claude Code with `--safe-mode` or `--bare`, and a directory whose trust prompt you
    haven't accepted yet. An organization policy can turn mods off too; if so, ask whoever manages
    Claude Code for you.
  - To see whether mods can load at all, run `claude plugin test` in your shell from a directory
    that holds no mod. To see why Claude Code refused the mod, start it with `claude --debug` and
    look in the debug log for a line that starts with `hooks module`.
  - If another plugin already provides `/themes`, the gallery leaves that command alone and can't
    be opened. Disable the other plugin to use the gallery.
- **The pane says no pane can be shown.** A headless run (`claude -p`) has nowhere to draw a pane.
  Run `/themes` in an interactive session.
- **The swatches look washed out or wrong.** Your terminal isn't showing 24-bit color. This
  happens in Terminal.app before macOS 26, and in some tmux or SSH setups, where colors are
  approximated.
- **It says "none set in your settings files", but a theme is active.** Older Claude Code versions
  kept the theme in `~/.claude.json`, and the mod doesn't read that file, so it can't see the
  theme. The theme still applies.
- **A pack shows as not enabled, but its themes are in `/theme`.** The check only reads
  `enabledPlugins` in your settings. It can't see theme files you copied into `~/.claude/themes`
  by hand, or a pack loaded with `--plugin-dir`. Your themes still work. When your current theme
  is one of those copied files, the rows say "in /theme if copied" instead of telling you to
  install the pack.
- **The marked theme is out of date.** The pane reads your settings when it opens. Press `r`, or
  run `/themes` again, after you switch.
- **The hotkeys do nothing.** The pane needs the keyboard first: press `ctrl+x` then `Tab`, or
  click it. In the VS Code extension there are no hotkeys; click the buttons instead.

## Development

The theme data in `hooks/themes.ts` is generated; don't edit it by hand. From the repository
root:

```text
node scripts/build-gallery-data.mjs          # regenerate hooks/themes.ts from the theme files
node scripts/build-gallery-icon.mjs          # redraw logo.png from free theme colors
node --test scripts/*.test.mjs               # includes the check that the data matches the files
node scripts/verify.mjs
claude plugin test plugins/theme-gallery     # the mod's own tests
claude plugin validate plugins/theme-gallery
claude --plugin-dir plugins/theme-gallery    # try it in a session; reloads on save
tsc -p plugins/theme-gallery                 # type-check, once a session has loaded it
```

Loading the mod with `--plugin-dir` makes Claude Code write its type declarations into
`.claude-plugin/types/` (ignored by git). The mod's `tsconfig.json` extends them.

## Support

Questions and bugs: https://github.com/notgabriels-sys/claude-code-50-dark-themes/issues

## License

MIT. See `LICENSE`.
