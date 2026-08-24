# DEV Community article draft

Title:

```text
I made 50 free dark themes for Claude Code. Here is what I learned about semantic terminal colors.
```

Tags:

```text
claudecode, terminal, themes, opensource
```

Canonical URL:

```text
https://gabs-utilities.com/
```

Article:

```markdown
I made a set of 50 free dark themes for Claude Code:

https://gabs-utilities.com/

The repo is here:

https://github.com/notgabriels-sys/claude-code-50-dark-themes

This started as a small personal thing. I wanted Claude Code to feel more comfortable during long sessions, but I did not want a theme that only looked good in screenshots and then failed the moment real terminal UI appeared.

After making the set, the useful lesson was simple: dark themes are not just background colors.

## The main mistake: treating all accent colors the same

A lot of dark palettes look fine as static color cards, but developer tools need meaning. A warning, an error, a success state, a diff addition, a diff deletion, muted text, and a selected line should not collapse into the same “nice neon accent.”

If the palette is too decorative, the UI becomes slower to read.

For a code-assistant terminal, I found it more useful to preserve semantic roles:

- errors should still feel like errors
- warnings should remain visually distinct from errors
- success states should not look like generic decoration
- diff additions and deletions need enough contrast from each other
- muted text should be readable but not compete with primary output
- the background should support long sessions, not dominate them

## Contrast matters more than vibe

Some palettes looked great at first but became tiring after a few minutes. The problem was usually not the hue. It was contrast.

The themes that survived longer testing had:

- a calm dark surface
- foreground text that stayed readable
- muted text that did not disappear
- accents that worked in small UI labels, not only in big preview blocks

The funny part is that the “loudest” palettes often became less useful than the restrained ones.

## Terminal background matters

For the full effect, I set the terminal background to each theme’s surface hex. Without that, the palette can still work, but the theme does not feel integrated.

That is why the gallery shows the surface color clearly. The background is not just decoration; it is part of the reading environment.

## I kept the themes free

The 50 Claude Code themes are free and MIT licensed. I also ended up building a wider small catalog around the same dark developer-tool direction, including UI kits, templates, cheat sheets, workflow packs, palettes, wallpapers, and audio workflow utilities.

But the core theme set is free because it is the useful entry point.

If you use Claude Code and care about readable dark UI, I would genuinely like feedback:

- Which themes feel comfortable for long sessions?
- Which ones look good but fail in real use?
- What semantic color roles should be improved?
- Are there terminal/editor combinations where the contrast breaks?

Here is the gallery again:

https://gabs-utilities.com/

And the repo:

https://github.com/notgabriels-sys/claude-code-50-dark-themes
```

Posting notes:

- Do not ask for likes/upvotes.
- Reply to comments as a maker asking for useful critique.
- If someone criticizes the paid catalog, steer back to the free MIT theme set and accept useful feedback.
- Do not overclaim adoption, sales, or community approval.
