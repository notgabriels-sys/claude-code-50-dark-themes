# Matching terminal colors

Each of the 62 free themes (the 50 and Vol. 2) has a matched terminal color scheme here: its
background, foreground, cursor, selection and 16 ANSI colors, contrast-checked against that
background, except that Konsole's schemes set no cursor or selection color and Warp's no selection
color.

The Claude Code theme colors Claude Code only. The scheme colors the rest of the window: your shell
prompt, `git`, `ls`, test runners. Its background is the theme's recommended terminal background, so
installing the scheme also covers the background step in the [main README](../README.md#note-on-backgrounds).

## File names

One folder per terminal, one file per theme. Scheme names start with `Gabs `, file names with
`Gabs ` or `gabs-`: `Gabs Deep Field`, `gabs-deep-field.conf`. Ghostty and WezTerm bundle schemes
that share some of these theme names, and the prefix keeps yours from replacing theirs. `<slug>` below is
the theme's file name in this repository (`deep-field`), `<Theme>` its display name (`Deep Field`).

Install the files on the computer the terminal app runs on. Over SSH, that is your own machine, not the
server.

## iTerm2 (macOS)

- **File:** `iterm2/Gabs <Theme>.itermcolors`
- **Install:** double-click the file, or run `open "terminal-schemes/iterm2/Gabs Deep Field.itermcolors"`
  from the repository folder. iTerm2 imports it as a color preset; the file can be deleted afterwards.
  Or: Settings → Profiles → Colors → **Color Presets…** → **Import…**
- **Activate:** Settings → Profiles → (your profile) → Colors → **Color Presets…** → `Gabs <Theme>`.
- Importing the same name again adds `Gabs <Theme> (2)`: delete the old preset first.

## Ghostty (macOS, Linux)

- **File:** `ghostty/Gabs <Theme>`. It has no extension.
- **Install:** create `~/.config/ghostty/themes/` if it is missing (on macOS too), then copy the file into it.
- **Activate:** add `theme = Gabs <Theme>` (no quotes) to your config: `~/.config/ghostty/config.ghostty`
  on Ghostty 1.2.3+, `~/.config/ghostty/config` before that (on macOS it can also be in
  `~/Library/Application Support/com.mitchellh.ghostty/`). Ghostty reads every one of these that exists,
  the macOS ones last, and a later file's `theme` line wins, so keep only one. Reload with `cmd+shift+,`
  (macOS) or `ctrl+shift+,` (Linux).
- `background`, `foreground` or `palette` lines in your config override the theme.

## kitty (macOS, Linux)

- **File:** `kitty/gabs-<slug>.conf`
- **Install:** create `~/.config/kitty/themes/` if it is missing, then copy the file into it.
- **Activate:** add `include themes/gabs-<slug>.conf` near the end of `~/.config/kitty/kitty.conf`.
  Reload with `ctrl+shift+F5` (macOS also `ctrl+cmd+,`).
- If your `kitty.conf` is somewhere else (`$KITTY_CONFIG_DIRECTORY`, or `~/Library/Preferences/kitty` on
  macOS), use the `themes` folder next to it: the `include` path is relative to the folder that holds
  `kitty.conf`.
- Color lines after the `include` win over it.
- If `dark-theme.auto.conf`, `light-theme.auto.conf` or `no-preference-theme.auto.conf` sits next to
  `kitty.conf` (`kitten themes` writes them for automatic light/dark switching), kitty takes its colors from
  the one for your OS's current mode, over every color in `kitty.conf`, the `include` too, and switches
  file when the mode changes. Move all of them aside, or copy the scheme over each one (keep backups),
  then restart kitty.
- Each file also sets kitty's tab bar and window borders from the same palette: the active tab and border in
  the theme's accent, inactive tabs on its ANSI black (`color0`).

## Alacritty (macOS, Linux, Windows)

- **File:** `alacritty/gabs-<slug>.toml`
- **Install:** create the themes folder if it is missing, then copy the file into it:
  `~/.config/alacritty/themes/` (Windows: `%APPDATA%\alacritty\themes\`).
- **Activate:** add the file's path to the `import` list in `alacritty.toml`. Alacritty doesn't create
  that file: if you have none, make `~/.config/alacritty/alacritty.toml` (Windows:
  `%APPDATA%\alacritty\alacritty.toml`). On 0.14+ the list lives under `[general]`:

  ```toml
  [general]
  import = ["~/.config/alacritty/themes/gabs-deep-field.toml"]
  ```

  On 0.13, put `import = ["<path>"]` at the top level instead (no `[general]`). On any version, if the
  file already has a top-level `import = [...]`, add the path to that list: while it exists, Alacritty
  ignores `[general] import`. If the file already has a `[general]` table, put the `import` line under
  that header; a second `[general]` header makes the whole file invalid. On Windows, use the full path
  with forward slashes (`C:/Users/<you>/AppData/Roaming/alacritty/themes/...`): Alacritty skips a
  missing import, with no error from 0.14 on (0.13 reports one).
  It reloads by itself; a `[colors.*]` table in `alacritty.toml` wins over the import.

## WezTerm (macOS, Linux, Windows)

- **File:** `wezterm/Gabs <Theme>.toml`
- **Install:** create the colors folder if it is missing, then copy the file into it:
  `~/.config/wezterm/colors/` on Linux and macOS. On Windows, WezTerm looks for schemes in a `colors`
  folder next to `wezterm.exe`; to keep them in `%USERPROFILE%\.config\wezterm\colors\` instead, add
  `config.color_scheme_dirs = { wezterm.home_dir .. '/.config/wezterm/colors' }` to `wezterm.lua` before
  `return config` (or `color_scheme_dirs = { wezterm.home_dir .. '/.config/wezterm/colors' },` inside a
  returned table), with `local wezterm = require 'wezterm'` at the top of the file if it is not there.
- **Activate:** in `wezterm.lua` (or `~/.wezterm.lua`), set `config.color_scheme = 'Gabs <Theme>'` before
  `return config`, or `color_scheme = 'Gabs <Theme>',` inside a returned table. With no config file yet,
  create `~/.wezterm.lua` (Windows: `%USERPROFILE%\.wezterm.lua`) holding:

  ```lua
  local wezterm = require 'wezterm'
  local config = {}
  config.color_scheme = 'Gabs Deep Field'
  return config
  ```

  WezTerm reloads the file it loaded when that file changes; after creating a new one, restart WezTerm.
  A `colors = {...}` table in the config overrides any scheme.

## Windows Terminal (Windows)

- **File:** `windows-terminal/gabs-<slug>.json`, a settings fragment holding one scheme.
- **Install:** copy it to `%LOCALAPPDATA%\Microsoft\Windows Terminal\Fragments\GabsThemes\` (create the
  folders), then restart Windows Terminal.
- **Activate:** Settings → (a profile, or *Defaults*) → Appearance → **Color scheme** → `Gabs <Theme>` →
  Save.
- Or paste the object inside `"schemes"` into the `"schemes"` array of `settings.json` and set
  `"colorScheme": "Gabs <Theme>"`. A profile's own `foreground`, `background`, `cursorColor` or
  `selectionBackground` wins over the scheme's.

## VS Code and Cursor integrated terminal

- **File:** `vscode/gabs-<slug>.json`, a `"workbench.colorCustomizations"` object with the terminal color keys.
- **Install and activate:** Command Palette → *Preferences: Open User Settings (JSON)*, then add those
  keys inside `"workbench.colorCustomizations"` (create it if it is missing). If it already has any of
  them, replace those and keep a copy of your old values. Save the file; the colors apply at once.
- To undo, remove the keys and save: the terminal goes back to your color theme's colors, not to values
  you replaced.
- VS Code lightens or darkens text that falls below 4.5:1 against its background
  (`terminal.integrated.minimumContrastRatio`, 4.5 by default). Against the terminal background, only
  these schemes' ANSI black is below that; set the value to `1` to see every color exactly.

## Warp (macOS, Linux, Windows)

- **File:** `warp/gabs-<slug>.yaml`
- **Install:** create the themes folder if it is missing, then copy the file into it: `~/.warp/themes/`
  (macOS), `$XDG_DATA_HOME/warp-terminal/themes/` (Linux; `~/.local/share/warp-terminal/themes/` if
  `XDG_DATA_HOME` is not set) or `%APPDATA%\warp\Warp\data\themes\` (Windows). Warp Preview keeps its own:
  `~/.warp-preview/themes/`, `$XDG_DATA_HOME/warp-terminal-preview/themes/` and
  `%APPDATA%\warp\WarpPreview\data\themes\`.
- **Activate:** Settings → Appearance → Themes → `Gabs <Theme>`, then press the checkmark to save it (the X
  reverts). A brand-new themes folder can take a few minutes to show up; restart Warp if the theme isn't
  listed.

## Konsole (KDE)

- **File:** `konsole/Gabs <Theme>.colorscheme`
- **Install:** create the folder if it is missing, then copy the file into it: `~/.local/share/konsole/`
  (Flatpak: `~/.var/app/org.kde.konsole/data/konsole/`).
- **Activate:** Settings → Edit Current Profile… → Appearance → `Gabs <Theme>` → OK. If the built-in
  profile can't be edited, create a new profile, pick the scheme there and make it the default.
- In Konsole the cursor color belongs to the profile: set it under Appearance → Cursor if you want the
  theme's accent cursor.

## Terminal.app (macOS)

- **File:** `terminal-app/Gabs <Theme>.terminal`, a color-only profile: background, text, bold, cursor,
  selection and the 16 ANSI colors. No font, window size or keyboard settings.
- **Install:** Terminal → Settings → Profiles → the **⋯** menu below the list → **Import…** → the file.
- **Activate:** select `Gabs <Theme>` and click **Default**; new windows use it. The window Terminal opens at
  launch uses the startup profile instead: in Settings → General, set **On startup, open** → **New window
  with profile** to `Gabs <Theme>` too.
- It is a new profile, so it starts with Terminal's default font and window size, and without the Option as
  Meta key and bell settings Claude Code's terminal setup writes into a profile. That setup is
  `/terminal-setup`, or the "Use Claude Code's terminal setup?" question on first run. If you used either,
  run `/terminal-setup` again once the new profile is the default and startup profile (it changes those
  two), then restart Terminal.

## Color depth

Claude Code themes need a terminal with 24-bit color. The scheme itself shows exactly in every terminal
above (in VS Code and Cursor once `terminal.integrated.minimumContrastRatio` is `1`; see their section),
but Claude Code's own theme colors are exact only when it starts with 24-bit color; otherwise it
rounds them to 256 colors or fewer, and the tinted panels turn gray. Terminal.app has 24-bit color only
on macOS 26 or later, and Claude Code uses it there only when `COLORTERM=truecolor` is set. The scheme's
own colors are exact on any macOS version. Claude Code also limits the VS Code and Cursor terminals to
256 colors, and starts at 256 in WSL under Windows Terminal and over SSH unless those are set up for
24-bit. Inside tmux it stays at 256 even when tmux is set up for 24-bit and `COLORTERM=truecolor` is
set, until `CLAUDE_CODE_TMUX_TRUECOLOR=1` is set as well (after `set -ga terminal-overrides ',*:Tc'` in
`~/.tmux.conf`).

## Status lines

A Claude Code status line draws in its own colors. With the scheme installed, one that uses the
terminal's 16 colors follows the scheme by itself. claude-hud (the Claude Code plugin) already does;
three other tools need one setting:

- **ccstatusline:** set `"colorLevel": 1` in `~/.config/ccstatusline/settings.json` (or the file passed to
  its `--config` flag). Level 0 turns colors off, and colors written as `hex:` or `ansi256:`, and
  gradients, show plain at level 1.
- **@fbincon/claude-code-statusline:** run `claude-statusline config set theme terminal`, or, once it has
  written `~/.claude/claude-statusline.json` (under `$CLAUDE_CONFIG_DIR` if set), set the top-level
  `"theme": "terminal"` there; the file is checked strictly, so change only that value. If you set your
  own item colors, or chose a Quick setup scheme that adds a background gradient (Powerline Daily, Agent
  Workbench, Quota Cost or Light Readable), also set `"palette": "ansi"`.
- **@owloops/claude-powerline:** set `"colorCompatibility": "ansi"` under `display` in the config file it
  reads: `~/.claude/claude-powerline.json`, or `~/.config/claude-powerline/config.json` if you keep it
  there, or the file named by `CLAUDE_POWERLINE_CONFIG` or `--config`. Unless `CLAUDE_POWERLINE_CONFIG` or
  `--config` names a file, a project's `.claude-powerline.json` replaces the home one completely, so it
  needs the key too. Text then uses only the scheme's foreground, red, green, blue, white and gray, and
  segment backgrounds are dropped.
- **claude-hud:** its documented default colors are named terminal colors, except `colors.custom`
  (256-color 208), which only the optional custom line uses.

Read from ccstatusline 2.2.33, @fbincon/claude-code-statusline 3.16.0, @owloops/claude-powerline 1.32.5
and the claude-hud README; later versions may move these settings.

## Licence

MIT, like the themes, the plugins and the installer: see [LICENSE](../LICENSE). The product folders
under `products/` carry their own licences. By
[NotGabriels](https://github.com/notgabriels-sys/claude-code-50-dark-themes).

The paid Claude Code Theme Setup Assistant (on Agensi; the [repository README](../README.md) links it)
installs a theme for you, sets up its matching scheme in most of the terminals above, and
adds 12 exclusive themes.
