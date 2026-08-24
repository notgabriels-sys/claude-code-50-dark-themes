# The palettes in Apple Mail

Short version: **Apple Mail cannot be skinned.** There is no theme file, no user
stylesheet, no accent override inside the app. Mail bundles — the old plugin
format that could restyle the UI — were locked out in macOS Catalina, and the
MailKit extensions that replaced them can filter content, act on messages and
hook compose, but they cannot repaint a single pixel of Mail's chrome. So the
toolbar, sidebar and message list stay Apple's system dark grey. You will not
get `#141724` behind your inbox, and anything that claims otherwise on a
current macOS is selling you a screenshot.

What follows is the honest maximum: five settings that genuinely take a colour
or a font, wired to the theme's own palette. It is not a skin. It is enough
that Mail stops looking like the one app that never got the memo.

Worked example below is **Deep Field**. The mapping table at the bottom lets you
run any of the fifty.

---

## 1. Dark message bodies

`Mail ▸ Settings ▸ Viewing ▸ Use dark backgrounds for messages`

This checkbox only appears when `System Settings ▸ Appearance` is set to **Dark**
— in Light mode the control is absent and message bodies are always white. Turn
it on. It darkens the reading pane and the compose window, which is the largest
surface in the app and the only one Mail lets you flip.

Per-message override, when a badly built HTML mail needs a white background:
`View ▸ Message ▸ Show with Light Background`.

## 2. Quoted text

`Mail ▸ Settings ▸ Fonts & Colors ▸ Color quoted text`

Three levels, each with a colour pop-up. Choose **Other…** on each to open the
colour picker and enter the hex.

| Level | Theme key | Deep Field | Contrast on Mail's dark body |
|---|---|---|---|
| One | `claude` | `#7A8CFF` | 5.6:1 |
| Two | `permission` | `#B7C1FF` | 9.6:1 |
| Three | `inactive` | `#9DA0AF` | 6.4:1 |

Level one carries the theme accent, so the message you are actually answering
reads as Deep Field. Deeper levels drain toward neutral as the quote gets older.
All three clear the 4.5:1 body-text floor against Apple's dark message
background (`#1E1E1E`), which is the background they are actually drawn on — not
the theme's `bg`, because that one is not ours to set.

**These are tuned for dark message bodies.** With step 1 off, quoted text is
drawn on white and level one drops to 3.0:1. Turn one on or leave the other
alone.

## 3. Selection colour

`System Settings ▸ Appearance ▸ Highlight colour ▸ Other…`

Enter `#7A8CFF`. This is the one system colour that takes an arbitrary value,
and it is what tints the selected row in Mail's message list and mailbox list.

The same thing, scriptable. `AppleHighlightColor` takes four space-separated
components — the three channels as floats, then a label — so `#7A8CFF` becomes
122/255, 140/255, 255/255 and a name of your choosing:

```bash
defaults write -g AppleHighlightColor -string "0.478431 0.549020 1.000000 Deep Field"
```

It needs a log out, or at least a relaunch of Mail, before it takes. Confirm it
landed by reading the value back rather than by trusting the write:

```bash
defaults read -g AppleHighlightColor
```

The four-component shape is documented behaviour, not a guess — but the
round-trip above is the only thing that proves it on *your* macOS, and it costs
one line. The GUI route is given first for the same reason.

**Accent colour is a separate setting and it is not ours.** On the macOS
versions that ship the classic swatch row it is preset-only, and `#7A8CFF` is
not one of the presets — Purple is the nearest. If your version offers **Other…**
under Accent colour, use the same hex there and the match gets noticeably
closer. Check yours rather than trusting this paragraph; Apple has moved this
control more than once.

## 4. Typography parity

`Mail ▸ Settings ▸ Fonts & Colors`

- **Fixed-width font** — set it to the same face and size you run in VS Code and
  the terminal, then tick *Use fixed-width font for plain text messages*. Plain
  text mail then renders in your editor font, which is most of the felt
  difference.
- **Message list font** — optional, but it is the other place Mail lets you pick.

No colour here, only shape. It costs nothing and it is the change you notice.

## 5. Signature

[`signature-deep-field.html`](signature-deep-field.html) — a signature that uses
the accent without breaking on the recipient's end.

Open it in a browser, select all, copy, and paste into
`Mail ▸ Settings ▸ Signatures`. Mail keeps pasted rich text with inline styles.
(The `.mailsignature` file route exists, but its path moves between macOS
versions and Mail rewrites the file unless you lock it — the paste is the
version-proof way in.)

The file **sets no text colour**, deliberately. No single colour clears 4.5:1
against both a white and a dark recipient background — the arithmetic rules it
out, since passing on white needs a relative luminance ≤ 0.183 and passing on
dark needs ≥ 0.233. So the accent is used only on the rule, where it carries no
text and owes no contrast floor, and the words inherit whatever the reading
client is already using. That is the only version of this that is readable for
everyone you send to.

---

## Running one of the other forty-nine

Every value above comes from the theme's own JSON. Take the keys, not the hexes:

| Mail setting | Theme key |
|---|---|
| Quoted text, level one | `claude` |
| Quoted text, level two | `permission` |
| Quoted text, level three | `inactive` |
| Highlight colour | `claude` |
| Signature rule | `claude` |

`text` has no home here — Mail owns its foreground colour. `bg`, `subtle` and
`userMessageBackground` have nowhere to go at all, which is the whole limitation
restated in table form. `claudeShimmer` earns its place below.

### Eleven of them need a substitute first

The quote levels are drawn on Apple's `#1E1E1E`, which is *lighter* than most of
the fifty backgrounds — Deep Field's own `bg` is `#141724`. An accent tuned
against the theme's darker ground loses margin on Apple's, and eleven palettes
drop a level under the 4.5:1 body-text floor because of it.

It is never level three: `inactive` clears the floor on all fifty, worst case
Iris at 6.25:1. The failures are level one (`claude`, two themes) and level two
(`permission`, nine).

**The fix is `claudeShimmer`**, the theme's own lighter partner to the accent. It
clears 4.5:1 on all fifty, weakest Nightshade at 6.42:1, so a failing level can
always be swapped for it without stepping outside the palette.

| Theme | Level | Is | Swap to (`claudeShimmer`) |
|---|---|---|---|
| Acid | two | `#8A38D8` 2.89:1 | `#DBEF77` 13.20:1 |
| Amber Room | two | `#8A6E3C` 3.47:1 | `#EBC782` 10.34:1 |
| Coral | two | `#C05840` 3.74:1 | `#F7BCAB` 10.11:1 |
| Hearth | two | `#75706A` 3.40:1 | `#EBAA86` 8.44:1 |
| Nightshade | one | `#976ECE` 4.32:1 | `#B293DB` 6.42:1 |
| Oxide | two | `#8C7A6E` 4.07:1 | `#D59481` 6.65:1 |
| Plasma | two | `#7A58E8` 3.48:1 | `#F2A0E0` 8.64:1 |
| Signal Red | one | `#E64F54` 4.45:1 | `#EF8F92` 7.16:1 |
| Sonar | two | `#257363` 2.95:1 | `#86EBD7` 11.81:1 |
| Undertow | two | `#3E7A9E` 3.56:1 | `#E9F5F9` 15.00:1 |
| VU Meter | two | `#E5484D` 4.26:1 | `#87E198` 10.52:1 |

Worth knowing where those two level-one failures come from. `scripts/verify-contrast.mjs`
holds every theme's `claude` to 4.5:1 against its *own* terminal background, and
several palettes were retuned to clear it. Passing there does not carry over to
here: **Nightshade** (`#976ECE`, 4.32:1) and **Signal Red** (`#E64F54`, 4.45:1)
both clear their own ground and still miss Apple's, because Apple's is lighter.
Two checks, two backgrounds, and only one of them is ours to choose.

## Checking it yourself

```bash
node mail/quote-contrast.mjs             # all fifty, with ratios
node mail/quote-contrast.mjs --failing   # just the eleven and their swaps
```

The script self-tests its contrast maths against the WCAG reference values before
printing anything and exits non-zero if a substitution still fails. That guard is
not decoration: the first version of it linearised two of the three sRGB channels
and left blue raw, which reported Deep Field's level one as 8.39:1 instead of
5.58:1 — wrong, and wrong in the flattering direction.

For the themes themselves, rather than their behaviour in Mail, the general tool
still applies:

```bash
python3 theme_contrast.py themes/
```

([theme-contrast](https://github.com/notgabriels-sys/theme-contrast) — one Python
file, no dependencies, same floors.)
