# Matching terminal colors

Each of the 62 free themes (the 50 and Vol. 2) has a matched terminal color scheme here: its
background, foreground, cursor, selection and 16 ANSI colors, contrast-checked against that
background.

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
- **Install:** open the file (`open "iterm2/Gabs Deep Field.itermcolors"` or double-click it). iTerm2
  imports it as a color preset; the file can be deleted afterwards. Or: Settings → Profiles → Colors →
  **Color Presets…** → **Import…**
- **Activate:** Settings → Profiles → (your profile) → Colors → **Color Presets…** → `Gabs <Theme>`.
- Importing the same name again adds `Gabs <Theme> (2)`: delete the old preset first.

## Ghostty (macOS, Linux)

- **File:** `ghostty/Gabs <Theme>`. It has no extension.
- **Install:** copy it to `~/.config/ghostty/themes/`, on macOS too.
- **Activate:** add `theme = Gabs <Theme>` (no quotes) to your config: `~/.config/ghostty/config.ghostty`
  on Ghostty 1.3+, `~/.config/ghostty/config` before that (on macOS it can also be in
  `~/Library/Application Support/com.mitchellh.ghostty/`). Reload with `cmd+shift+,` (macOS) or
  `ctrl+shift+,` (Linux).
- `background`, `foreground` or `palette` lines in your config override the theme.

## kitty (macOS, Linux)

- **File:** `kitty/gabs-<slug>.conf`
- **Install:** copy it to `~/.config/kitty/themes/`.
- **Activate:** add `include themes/gabs-<slug>.conf` near the end of `~/.config/kitty/kitty.conf`.
  Reload with `ctrl+shift+F5` (macOS also `ctrl+cmd+,`).
- Color lines after the `include` win over it.

## Alacritty (macOS, Linux, Windows)

- **File:** `alacritty/gabs-<slug>.toml`
- **Install:** copy it to `~/.config/alacritty/themes/` (Windows: `%APPDATA%\alacritty\themes\`).
- **Activate:** add the file's path to the `import` list in `alacritty.toml`. On 0.14+ that list lives
  under `[general]`:

  ```toml
  [general]
  import = ["~/.config/alacritty/themes/gabs-deep-field.toml"]
  ```

  On 0.13, or if your file already has a top-level `import = [...]`, add the path to that list instead.
  Don't add a second `[general]` header. On Windows, use the full path with forward slashes
  (`C:/Users/<you>/AppData/Roaming/alacritty/themes/...`): Alacritty skips a missing import silently.
  It reloads by itself; a `[colors.*]` table in `alacritty.toml` wins over the import.

## WezTerm (macOS, Linux, Windows)

- **File:** `wezterm/Gabs <Theme>.toml`
- **Install:** copy it to `~/.config/wezterm/colors/` on every OS (Windows:
  `%USERPROFILE%\.config\wezterm\colors\`), or `$XDG_CONFIG_HOME/wezterm/colors/` if that is set.
- **Activate:** in `wezterm.lua` (or `~/.wezterm.lua`), set `config.color_scheme = 'Gabs <Theme>'` before
  `return config`, or `color_scheme = 'Gabs <Theme>',` inside a returned table. It reloads by itself.
  A `colors = {...}` table in the config overrides any scheme.

## Windows Terminal (Windows)

- **File:** `windows-terminal/gabs-<slug>.json`, a settings fragment holding one scheme.
- **Install:** copy it to `%LOCALAPPDATA%\Microsoft\Windows Terminal\Fragments\GabsThemes\` (create the
  folders), then restart Windows Terminal.
- **Activate:** Settings → (a profile, or *Defaults*) → Appearance → **Color scheme** → `Gabs <Theme>` →
  Save.
- Or paste the object inside `"schemes"` into the `"schemes"` array of `settings.json` and set
  `"colorScheme": "Gabs <Theme>"`. A profile's own `foreground`, `background` or `cursorColor` wins.

## VS Code and Cursor integrated terminal

- **File:** `vscode/gabs-<slug>.json`, a `"workbench.colorCustomizations"` object with the terminal color keys.
- **Install and activate:** Command Palette → *Preferences: Open User Settings (JSON)*, then add those
  keys inside `"workbench.colorCustomizations"` (create it if it is missing). They apply at once.
  Remove the keys to undo.

## Warp (macOS, Linux, Windows)

- **File:** `warp/gabs-<slug>.yaml`
- **Install:** copy it to `~/.warp/themes/` (macOS), `~/.local/share/warp-terminal/themes/` (Linux) or
  `%APPDATA%\warp\Warp\data\themes\` (Windows).
- **Activate:** Settings → Appearance → Themes → `Gabs <Theme>`. A brand-new themes folder can take a few
  minutes to show up; restart Warp if the theme isn't listed.

## Konsole (KDE)

- **File:** `konsole/Gabs <Theme>.colorscheme`
- **Install:** copy it to `~/.local/share/konsole/` (Flatpak: `~/.var/app/org.kde.konsole/data/konsole/`).
- **Activate:** Settings → Edit Current Profile… → Appearance → `Gabs <Theme>` → OK. If the built-in
  profile can't be edited, create a new profile, pick the scheme there and make it the default.
- In Konsole the cursor color belongs to the profile: set it under Appearance → Cursor if you want the
  theme's accent cursor.

## Terminal.app (macOS)

- **File:** `terminal-app/Gabs <Theme>.terminal`, a color-only profile: background, text, bold, cursor,
  selection and the 16 ANSI colors. No font, window size or keyboard settings.
- **Install:** Terminal → Settings → Profiles → the **⋯** menu below the list → **Import…** → the file.
- **Activate:** select `Gabs <Theme>` and click **Default**; new windows use it.
- It is a new profile, so it starts with Terminal's default font and window size. If you ran Claude Code's
  `/terminal-setup` in your old profile, run it again with the new one as the default.

## Color depth

Claude Code themes need a terminal with 24-bit color. The scheme itself shows exactly in every terminal
above, but Claude Code's own theme colors are exact only when it starts with 24-bit color; otherwise it
rounds them to 256 colors or fewer, and the tinted panels turn gray. Terminal.app shows the exact colors
only on macOS 26 or later, and Claude Code uses 24-bit there only when `COLORTERM=truecolor` is set.
Claude Code also limits the VS Code and Cursor terminals to 256 colors, and starts at 256 inside tmux, in
WSL under Windows Terminal and over SSH unless those are set up for 24-bit.

## Licence

MIT, the same as the rest of this repository: see [LICENSE](../LICENSE). By
[NotGabriels](https://github.com/notgabriels-sys/claude-code-50-dark-themes).

The paid [Claude Code Theme Setup Assistant](https://agensi.io/skills/claude-code-theme-setup-assistant)
(on Agensi) installs a theme and its scheme for you, fixes Claude Code's color depth where your terminal
allows it, and adds 12 exclusive themes.
