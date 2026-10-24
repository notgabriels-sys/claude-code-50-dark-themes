# Repository metadata — description and topics

GitHub's own search and the "Explore" surfaces rank on the repo description and
topics, not on README prose. Neither is stored in the repository, so they have
to be set by hand in **Settings → General** (description) and via the ⚙ next to
**About** (topics). This file is the reference for what to set, so the values
stay consistent and honest across edits.

## Description

One line, 350 characters max. Current recommended value:

```text
62 free MIT-licensed dark themes for the Claude Code CLI, installable as native plugins. Semantic status colors preserved; every palette verified against role-aware WCAG contrast floors.
```

Website field:

```text
https://gabs-utilities.com/
```

## Topics

All lowercase, hyphenated — GitHub normalises them anyway. These describe what
the repository actually contains:

```text
claude-code
themes
dark-theme
color-scheme
terminal
cli
claude-code-plugin
accessibility
wcag
developer-tools
```

## Live state, read 2026-10-24

Read through GitHub's API for this repository:

- Description: "50 hand-tuned dark themes for Claude Code, plus links into the
  Gabs Utilities ecosystem." It names one pack of two and not what the themes
  are checked against.
- Website: `https://gabs-utilities.com/` (matches).
- Topics, 20 of GitHub's maximum of 20: `accessibility`, `anthropic`,
  `claude-code`, `claude-code-plugin`, `claude-code-theme`,
  `claude-code-themes`, `cli`, `color-scheme`, `dark-mode`, `dark-theme`,
  `dark-themes`, `developer-tools`, `devtools`, `dotfiles`, `syntax-theme`,
  `terminal`, `terminal-theme`, `theme`, `theme-gallery`, `themes`.

Two topics do not describe the repository: the themes set no syntax colors
(syntax highlighting is a separate `/theme` toggle), and it is not a dotfiles
repository. `wcag` is missing, though every palette is checked against WCAG
floors. With 20 topics set, each addition needs a removal.

The edit, for the owner to run (it changes the live repository):

```bash
gh repo edit notgabriels-sys/claude-code-50-dark-themes \
  --description "62 free MIT-licensed dark themes for the Claude Code CLI, installable as native plugins. Semantic status colors preserved; every palette verified against role-aware WCAG contrast floors." \
  --remove-topic syntax-theme --remove-topic dotfiles --add-topic wcag
```

## Rules

- Only add a topic the repository genuinely matches. Topic-stuffing to catch
  unrelated searches is the GitHub equivalent of keyword spam.
- Do not put star counts, "popular", "best", or any adoption claim in the
  description — none of it is verified.
- Keep the theme count in the description accurate. It is 50 + 12 today; if a
  pack grows, update the description in the same change.
