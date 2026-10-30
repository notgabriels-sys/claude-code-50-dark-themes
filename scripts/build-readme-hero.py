#!/usr/bin/env python3
"""Render the README hero: a Claude Code session drawn in real theme colors.

    python3 scripts/build-readme-hero.py

writes two files from the theme JSON files, nothing typed by hand:

    assets/hero.gif   one frame per theme in HERO_THEMES, FRAME_DELAY_CS each (the first
                      FIRST_FRAME_DELAY_CS), looping
    assets/hero.png   the first frame on its own, the still fallback

Every color in a frame's session panel is a theme override (claude, text,
inactive, subtle, suggestion, promptBorder, userMessageBackground) or the
theme's recommended terminal background, read from the same places the theme
pages read them: index.html's THEMES array for the fifty, and
plugins/dark-themes-vol-2/previews.json for Vol. 2. Only the free themes (the
root *.json files and plugins/dark-themes-vol-2/themes/*.json) can be named.
The outer frame and the "Rendered preview" label are neutral and the same in
every frame.

Needs Python 3 (standard library only) and a headless Chromium. It uses
$CHROMIUM when set, then the Playwright headless shell under /opt/pw-browsers,
then chromium, chromium-browser, google-chrome or headless_shell on PATH.
Chromium is launched with TMPDIR and its profile in a short directory under
/tmp: a long TMPDIR pushes its socket paths past the 107-byte limit and the
launch fails. The text uses the DejaVu Sans Mono and Inter fonts when they are
installed; other fonts change the glyphs, not the colors.

    --frames DIR   also keep each rendered frame as DIR/NN-<slug>.png
"""

import argparse
import glob
import json
import os
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import zlib
from html import escape

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WIDTH, HEIGHT = 1200, 600
FRAME_DELAY_CS = 200  # GIF delays are in hundredths of a second: 2 s per theme,
FIRST_FRAME_DELAY_CS = 300  # and 3 s on the first, which is also the still image.
# Eight free themes, spread around the color wheel and alternating warm and
# cool, with two from Vol. 2. The first is also the still image.
HERO_THEMES = [
    "Deep Field",
    "Ember",
    "Aurora Borealis",
    "Neon Noir",
    "Lagoon",
    "Acid",
    "Ultraviolet",
    "Graphite",
]
BACKDROP = "#0C0D0F"  # neutral page around the terminal window, the same in every frame
LABEL = "#8A8F98"  # neutral label text, on BACKDROP
DOT_OFF = "#2B2D33"  # progress dots for the themes not on screen
CHROMIUM_CANDIDATES = [
    "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell",
    "chromium",
    "chromium-browser",
    "google-chrome",
    "headless_shell",
]

# The README shows the GIF, or the still under prefers-reduced-motion, behind one alt text.
README_ALT = (
    "Rendered preview of a Claude Code session in real theme colors: the welcome line in the theme's accent, "
    "a prompt, a reply, a tool result, the prompt box with /theme typed into it, and the theme's name, "
    "on its recommended terminal background. The animation cycles through eight of the free themes ("
    + ", ".join(HERO_THEMES[:-1])
    + " and "
    + HERO_THEMES[-1]
    + "); the still image shows "
    + HERO_THEMES[0]
    + "."
)
# For the still on its own, wherever it is used without the GIF.
PNG_ALT = (
    "Rendered preview of a Claude Code session in the "
    + HERO_THEMES[0]
    + " theme: the welcome line in its accent, a prompt, a reply, a tool result and the prompt box "
    "with /theme typed into it, on its recommended terminal background."
)


def fail(message):
    sys.exit(f"build-readme-hero: {message}")


# --------------------------------------------------------------------------
# Themes
# --------------------------------------------------------------------------


def load_free_themes():
    """Every free theme by name: its overrides, its terminal background, its pack."""
    with open(os.path.join(ROOT, "index.html"), encoding="utf-8") as handle:
        html = handle.read()
    match = re.search(r"const THEMES = (\[[\s\S]*?\n\]);", html)
    if not match:
        fail("could not find the THEMES array in index.html.")
    gallery_terminals = {row[0]: row[5] for row in json.loads(match.group(1))}
    with open(os.path.join(ROOT, "plugins/dark-themes-vol-2/previews.json"), encoding="utf-8") as handle:
        vol2_terminals = json.load(handle)

    packs = [
        ("50 Dark Themes", sorted(glob.glob(os.path.join(ROOT, "*.json"))), gallery_terminals),
        (
            "Dark Themes Vol. 2",
            sorted(glob.glob(os.path.join(ROOT, "plugins/dark-themes-vol-2/themes/*.json"))),
            vol2_terminals,
        ),
    ]
    themes = {}
    for pack, files, terminals in packs:
        for path in files:
            with open(path, encoding="utf-8") as handle:
                theme = json.load(handle)
            if not isinstance(theme, dict) or "overrides" not in theme:
                continue
            name = theme["name"]
            if name not in terminals:
                fail(f"{os.path.relpath(path, ROOT)}: no recommended terminal background for {name}.")
            themes[name] = {"name": name, "pack": pack, "overrides": theme["overrides"], "terminal": terminals[name]}
    return themes


HEX = re.compile(r"^#[0-9A-Fa-f]{6}$")


def colors_of(theme):
    o = theme["overrides"]
    colors = {
        "bg": theme["terminal"],
        "claude": o["claude"],
        "text": o["text"],
        "inactive": o["inactive"],
        "subtle": o["subtle"],
        "suggestion": o["suggestion"],
        "prompt": o["promptBorder"],
        "um": o["userMessageBackground"],
    }
    for key, value in colors.items():
        if not HEX.match(value):
            fail(f"{theme['name']}: {key} is {value!r}, not a #RRGGBB color.")
    return colors


# --------------------------------------------------------------------------
# One frame as HTML
# --------------------------------------------------------------------------

FRAME_CSS = """
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1200px;height:600px;overflow:hidden;background:BACKDROP}
body{position:relative;font-family:"DejaVu Sans Mono",Menlo,Consolas,monospace;font-size:18px;line-height:28px;color:var(--text);white-space:pre}
.win{position:absolute;left:40px;top:28px;width:1120px;height:494px;background:var(--bg);border-radius:14px;overflow:hidden;border:1px solid #23252A}
.bar{height:42px;border-bottom:1px solid var(--subtle);display:flex;align-items:center;padding:0 18px;position:relative}
.bar i{width:12px;height:12px;border-radius:50%;background:var(--subtle);margin-right:8px;display:block}
.bar b{position:absolute;left:0;right:0;text-align:center;font-weight:400;font-size:14px;color:var(--inactive)}
.body{padding:24px 32px}
.welcome{display:inline-block;border:1px solid var(--claude);border-radius:10px;padding:12px 26px 12px 18px}
.acc{color:var(--claude)}
.mut{color:var(--inactive)}
.gap{height:8px}
.user{margin-top:22px;background:var(--um);border-radius:4px;padding:4px 12px}
.reply{margin-top:16px}
.tool{margin-top:12px}
.elbow{display:inline-block;width:10px;height:14px;border-left:2px solid var(--inactive);border-bottom:2px solid var(--inactive);margin:0 12px 0 22px;vertical-align:4px}
.prompt{margin-top:22px;border:1px solid var(--prompt);border-radius:10px;padding:9px 16px}
.cursor{display:inline-block;width:11px;height:22px;background:var(--text);vertical-align:-5px;margin-left:1px}
.sugg{color:var(--suggestion);padding:6px 0 0 18px}
.foot{position:absolute;left:40px;right:40px;top:538px;height:40px;display:flex;align-items:center;justify-content:space-between;font-family:Inter,"DejaVu Sans",sans-serif;white-space:nowrap}
.label{font-size:17px;letter-spacing:.12em;text-transform:uppercase;color:LABEL;width:440px}
.dots{display:flex;gap:9px}
.dots i{width:8px;height:8px;border-radius:50%;background:DOT_OFF;display:block}
.dots i.on{background:var(--claude)}
.name{width:440px;text-align:right}
.name b{font-size:24px;font-weight:700;color:var(--claude)}
.name span{font-size:18px;color:LABEL;margin-left:14px}
""".replace("BACKDROP", BACKDROP).replace("LABEL", LABEL).replace("DOT_OFF", DOT_OFF)


def frame_html(theme, index, count):
    c = colors_of(theme)
    variables = ";".join(f"--{key}:{value}" for key, value in c.items())
    dots = "".join('<i class="on"></i>' if i == index else "<i></i>" for i in range(count))
    pack = "Vol. 2" if theme["pack"] == "Dark Themes Vol. 2" else "50 Dark Themes"
    # white-space:pre keeps the terminal's spacing, so the markup has no stray newlines inside lines.
    session = (
        '<div class="welcome">'
        '<div class="acc">✻ Welcome to Claude Code!</div>'
        '<div class="gap"></div>'
        '<div class="mut">  /help for help, /status for your current setup</div>'
        '<div class="mut">  cwd: ~/projects/app</div>'
        "</div>"
        '<div class="user"><span class="mut">&gt;</span> fix the flaky date test in utils</div>'
        '<div class="reply">● The test assumes UTC; I\'ll pin the timezone.</div>'
        '<div class="tool">● <b>Update</b>(src/utils/date.test.ts)</div>'
        '<div class="mut"><span class="elbow"></span>Updated <b>src/utils/date.test.ts</b> with 2 additions and 1 removal</div>'
        '<div class="prompt">&gt; /theme<span class="cursor"></span></div>'
        '<div class="sugg">/theme                  Change the theme</div>'
    )
    return (
        "<!doctype html><html><head><meta charset=\"utf-8\">"
        f"<style>{FRAME_CSS}</style></head>"
        f'<body style="{variables}">'
        '<div class="win"><div class="bar"><i></i><i></i><i></i><b>claude — ~/projects/app</b></div>'
        f'<div class="body">{session}</div></div>'
        '<div class="foot"><div class="label">Rendered preview</div>'
        f'<div class="dots">{dots}</div>'
        f'<div class="name"><b>{escape(theme["name"])}</b><span>{escape(pack)}</span></div></div>'
        "</body></html>"
    )


# --------------------------------------------------------------------------
# Chromium
# --------------------------------------------------------------------------


def find_chromium():
    explicit = os.environ.get("CHROMIUM")
    if explicit:
        if not os.access(explicit, os.X_OK):
            fail(f"$CHROMIUM is {explicit}, which is not an executable file.")
        return explicit
    for candidate in CHROMIUM_CANDIDATES:
        path = candidate if os.path.isabs(candidate) else shutil.which(candidate)
        if path and os.access(path, os.X_OK):
            return path
    fail("no headless Chromium found; set $CHROMIUM to one.")


def screenshot(chromium, html_path, png_path, work):
    profile = tempfile.mkdtemp(prefix="profile-", dir=work)
    env = dict(os.environ, TMPDIR=work)
    command = [
        chromium,
        "--headless",
        "--no-sandbox",
        "--disable-gpu",
        "--no-first-run",
        "--disable-extensions",
        "--hide-scrollbars",
        "--force-device-scale-factor=1",
        "--font-render-hinting=none",
        "--disable-lcd-text",
        "--force-color-profile=srgb",
        "--virtual-time-budget=1500",
        f"--user-data-dir={profile}",
        f"--window-size={WIDTH},{HEIGHT}",
        f"--screenshot={png_path}",
        "file://" + html_path,
    ]
    result = subprocess.run(command, env=env, capture_output=True, text=True, timeout=120)
    if result.returncode != 0 or not os.path.exists(png_path):
        fail(f"Chromium did not write {png_path}:\n{result.stderr[-2000:]}")


# --------------------------------------------------------------------------
# PNG in, GIF out (standard library only)
# --------------------------------------------------------------------------


def read_png_rgb(path):
    """Decode an 8-bit RGB or RGBA, non-interlaced PNG to (width, height, RGB bytes)."""
    with open(path, "rb") as handle:
        data = handle.read()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        fail(f"{path} is not a PNG.")
    pos, idat, header = 8, [], None
    while pos < len(data):
        (length,) = struct.unpack(">I", data[pos : pos + 4])
        kind = data[pos + 4 : pos + 8]
        body = data[pos + 8 : pos + 8 + length]
        pos += 12 + length
        if kind == b"IHDR":
            header = struct.unpack(">IIBBBBB", body)
        elif kind == b"IDAT":
            idat.append(body)
        elif kind == b"IEND":
            break
    width, height, depth, color_type, _, _, interlace = header
    if depth != 8 or color_type not in (2, 6) or interlace:
        fail(f"{path}: expected an 8-bit RGB(A) non-interlaced PNG, got depth {depth}, color type {color_type}.")
    bpp = 3 if color_type == 2 else 4
    raw = zlib.decompress(b"".join(idat))
    stride = width * bpp
    prev = bytearray(stride)
    rows = []
    pos = 0
    for _ in range(height):
        kind = raw[pos]
        line = bytearray(raw[pos + 1 : pos + 1 + stride])
        pos += 1 + stride
        if kind == 1:
            for i in range(bpp, stride):
                line[i] = (line[i] + line[i - bpp]) & 0xFF
        elif kind == 2:
            line = bytearray((a + b) & 0xFF for a, b in zip(line, prev))
        elif kind == 3:
            for i in range(stride):
                left = line[i - bpp] if i >= bpp else 0
                line[i] = (line[i] + ((left + prev[i]) >> 1)) & 0xFF
        elif kind == 4:
            for i in range(stride):
                a = line[i - bpp] if i >= bpp else 0
                b = prev[i]
                c = prev[i - bpp] if i >= bpp else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                line[i] = (line[i] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 0xFF
        elif kind != 0:
            fail(f"{path}: unknown PNG filter {kind}.")
        rows.append(bytes(line) if bpp == 3 else bytes(b for i, b in enumerate(line) if i % 4 != 3))
        prev = line
    return width, height, b"".join(rows)


def rgb_of(hex_color):
    return tuple(int(hex_color[i : i + 2], 16) for i in (1, 3, 5))


def quantize(rgb, seeds):
    """Up to 256 colors: the exact theme colors first, then the most frequent others.

    A frame is flat color plus antialiased text, so the exact colors and their most
    common blends cover it; each remaining color maps to its nearest palette entry.
    """
    pixels = list(zip(rgb[0::3], rgb[1::3], rgb[2::3]))
    counts = {}
    for pixel in pixels:
        counts[pixel] = counts.get(pixel, 0) + 1
    palette = []
    for color in seeds:
        if color not in palette:
            palette.append(color)
    for color, _ in sorted(counts.items(), key=lambda item: (-item[1], item[0])):
        if len(palette) >= 256:
            break
        if color not in palette:
            palette.append(color)
    lookup = {}
    exact = {color: index for index, color in enumerate(palette)}
    for color in counts:
        if color in exact:
            lookup[color] = exact[color]
            continue
        r, g, b = color
        best, best_distance = 0, None
        for index, (pr, pg, pb) in enumerate(palette):
            # Weighted RGB distance, close enough to perceptual for picking among blends.
            distance = 2 * (r - pr) ** 2 + 4 * (g - pg) ** 2 + 3 * (b - pb) ** 2
            if best_distance is None or distance < best_distance:
                best, best_distance = index, distance
        lookup[color] = best
    indices = bytes(lookup[pixel] for pixel in pixels)
    while len(palette) < 256:
        palette.append((0, 0, 0))
    return palette, indices


def lzw(indices, min_code_size=8):
    clear, end = 1 << min_code_size, (1 << min_code_size) + 1
    out = bytearray()
    state = {"buffer": 0, "bits": 0}
    code_size = min_code_size + 1

    def emit(code, size):
        state["buffer"] |= code << state["bits"]
        state["bits"] += size
        while state["bits"] >= 8:
            out.append(state["buffer"] & 0xFF)
            state["buffer"] >>= 8
            state["bits"] -= 8

    table = {}
    next_code = end + 1
    emit(clear, code_size)
    prefix = indices[0]
    for symbol in indices[1:]:
        key = (prefix << 8) | symbol
        code = table.get(key)
        if code is not None:
            prefix = code
            continue
        emit(prefix, code_size)
        if next_code < 4096:
            table[key] = next_code
            next_code += 1
            if next_code > (1 << code_size) and code_size < 12:
                code_size += 1
        else:
            emit(clear, code_size)
            table = {}
            next_code = end + 1
            code_size = min_code_size + 1
        prefix = symbol
    emit(prefix, code_size)
    # The decoder adds one more entry on reading that last code; match its code size for the end code.
    if next_code == (1 << code_size) and code_size < 12:
        code_size += 1
    emit(end, code_size)
    if state["bits"]:
        out.append(state["buffer"] & 0xFF)
    return bytes(out)


def sub_blocks(data):
    return b"".join(bytes([len(data[i : i + 255])]) + data[i : i + 255] for i in range(0, len(data), 255)) + b"\x00"


def write_gif(path, frames, width, height, delays_cs):
    """frames: [(palette of 256 RGB tuples, index bytes)], each with its own color table;
    delays_cs: each frame's delay in hundredths of a second."""
    out = bytearray(b"GIF89a")
    out += struct.pack("<HHBBB", width, height, 0x00, 0, 0)  # no global color table
    out += b"\x21\xff\x0bNETSCAPE2.0\x03\x01\x00\x00\x00"  # loop forever
    for (palette, indices), delay_cs in zip(frames, delays_cs, strict=True):
        out += b"\x21\xf9\x04" + struct.pack("<BHBB", 0x04, delay_cs, 0, 0)  # do not dispose, no transparency
        out += b"\x2c" + struct.pack("<HHHHB", 0, 0, width, height, 0x87)  # local table of 2^(7+1) colors
        out += bytes(channel for color in palette for channel in color)
        out += b"\x08" + sub_blocks(lzw(indices))
    out += b"\x3b"
    with open(path, "wb") as handle:
        handle.write(out)


# --------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--frames", help="also keep each rendered frame as a PNG in this directory")
    args = parser.parse_args()

    themes = load_free_themes()
    chosen = []
    for name in HERO_THEMES:
        if name not in themes:
            fail(f"{name} is not one of the free themes in this repository.")
        chosen.append(themes[name])

    chromium = find_chromium()
    work = tempfile.mkdtemp(prefix="hero-", dir="/tmp" if os.path.isdir("/tmp") else None)
    try:
        frames, first_png = [], None
        for index, theme in enumerate(chosen):
            slug = theme["name"].lower().replace(" ", "-")
            html_path = os.path.join(work, f"{index:02d}-{slug}.html")
            png_path = os.path.join(work, f"{index:02d}-{slug}.png")
            with open(html_path, "w", encoding="utf-8") as handle:
                handle.write(frame_html(theme, index, len(chosen)))
            screenshot(chromium, html_path, png_path, work)
            width, height, rgb = read_png_rgb(png_path)
            if (width, height) != (WIDTH, HEIGHT):
                fail(f"Chromium rendered {width}x{height}, not {WIDTH}x{HEIGHT}.")
            c = colors_of(theme)
            seeds = [rgb_of(BACKDROP), rgb_of(LABEL), rgb_of(DOT_OFF)] + [rgb_of(value) for value in c.values()]
            frames.append(quantize(rgb, seeds))
            if args.frames:
                os.makedirs(args.frames, exist_ok=True)
                shutil.copyfile(png_path, os.path.join(args.frames, f"{index:02d}-{slug}.png"))
            if first_png is None:
                first_png = png_path
            print(f"  {index + 1}/{len(chosen)} {theme['name']}: accent {c['claude']} on {c['bg']}")

        os.makedirs(os.path.join(ROOT, "assets"), exist_ok=True)
        gif_path = os.path.join(ROOT, "assets/hero.gif")
        png_path = os.path.join(ROOT, "assets/hero.png")
        delays = [FIRST_FRAME_DELAY_CS] + [FRAME_DELAY_CS] * (len(frames) - 1)
        write_gif(gif_path, frames, WIDTH, HEIGHT, delays)
        shutil.copyfile(first_png, png_path)
    finally:
        shutil.rmtree(work, ignore_errors=True)

    for path in (gif_path, png_path):
        print(f"wrote {os.path.relpath(path, ROOT)} ({os.path.getsize(path):,} bytes)")
    print(f"\nREADME alt text (GIF, still fallback):\n{README_ALT}\n\nAlt text for the still alone:\n{PNG_ALT}")


if __name__ == "__main__":
    main()
