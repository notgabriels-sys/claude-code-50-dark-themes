// Renders one landing page per theme under theme/<slug>/, an index at
// theme/index.html, and sitemap.xml. Every value on a page (hex values,
// contrast ratios, commands) is read from the theme files, the gallery's
// terminal backgrounds and the plugin manifests, never typed by hand, and
// scripts/verify.mjs fails when a page on disk differs from this render.
//
//   node scripts/build-theme-pages.mjs
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const SITE = "https://gabs-utilities.com";
const REPO = "https://github.com/notgabriels-sys/claude-code-50-dark-themes";
const RAW = "https://raw.githubusercontent.com/notgabriels-sys/claude-code-50-dark-themes/main";
const MARKETPLACE_COMMAND = "claude plugin marketplace add notgabriels-sys/claude-code-50-dark-themes";
const SHARE_IMAGE = `${SITE}/preview.png`;
// One image, one description: this string must stay identical to the alt text
// the other public pages give preview.png, or the verifier fails the page.
const SHARE_IMAGE_ALT =
  "Title card: 50 dark themes for Claude Code, with the plugin install command and a strip of the site&#39;s interface colors";

// The sitemap entries that exist independently of the theme pages, verbatim.
const FIXED_SITEMAP_ENTRIES = [
  `  <url><loc>${SITE}/</loc><changefreq>monthly</changefreq><priority>1.0</priority></url>`,
  `  <url><loc>${SITE}/claude-code-theme-install-guide.html</loc><changefreq>monthly</changefreq><priority>0.82</priority></url>`,
  `  <url><loc>${SITE}/semantic-terminal-colors.html</loc><changefreq>monthly</changefreq><priority>0.78</priority></url>`,
  `  <url><loc>${SITE}/impressum.html</loc><changefreq>yearly</changefreq><priority>0.3</priority></url>`,
];

const PACKS = [
  {
    id: "50-dark-themes",
    label: "50 Dark Themes",
    shortLabel: "The fifty",
    themesDir: "",
    rawDir: "",
    previewsFrom: "gallery",
    galleryAnchor: "#themes",
  },
  {
    id: "dark-themes-vol-2",
    label: "Dark Themes Vol. 2",
    shortLabel: "Vol. 2",
    themesDir: "plugins/dark-themes-vol-2/themes/",
    rawDir: "plugins/dark-themes-vol-2/themes/",
    previewsFrom: "plugins/dark-themes-vol-2/previews.json",
    galleryAnchor: "#vol2",
  },
];

// Mirrors scripts/verify-contrast.mjs: the same tokens, surfaces and floors,
// so a page states exactly what the verifier enforces. verify.mjs fails if
// the two lists drift apart.
export const CONTRAST_CHECKS = [
  { token: "text", floor: 7, surfaces: ["terminal", "userMessageBackground"], standard: "WCAG AAA, normal text" },
  { token: "inactive", floor: 4.5, surfaces: ["terminal", "userMessageBackground"], standard: "WCAG AA, normal text" },
  { token: "claude", floor: 4.5, surfaces: ["terminal"], standard: "WCAG AA, normal text" },
  { token: "claudeShimmer", floor: 4.5, surfaces: ["terminal"], standard: "WCAG AA, normal text" },
  { token: "suggestion", floor: 4.5, surfaces: ["terminal"], standard: "WCAG AA, normal text" },
  // Held to the non-text floor like the verifier, though Claude Code also draws
  // text in both (README's contrast paragraph says how many themes fall below AA).
  { token: "permission", floor: 3, surfaces: ["terminal"], standard: "WCAG AA non-text floor; also colours text" },
  { token: "planMode", floor: 3, surfaces: ["terminal"], standard: "WCAG AA non-text floor; also colours text" },
  { token: "promptBorder", floor: 3, surfaces: ["terminal"], standard: "WCAG AA, non-text" },
  { token: "promptBorderShimmer", floor: 3, surfaces: ["terminal"], standard: "WCAG AA, non-text" },
  { token: "rate_limit_fill", floor: 3, surfaces: ["terminal"], standard: "WCAG AA, non-text" },
];

// Each role in the words of Claude Code's token reference (code.claude.com,
// terminal-config, "Color token reference").
const ROLES = {
  claude: "Claude's mark and accent",
  claudeShimmer: "Accent highlight while Claude works",
  text: "Primary text",
  inactive: "Secondary text",
  subtle: "Faint borders and de-emphasised secondary text (not contrast-checked)",
  suggestion: "Autocomplete suggestions",
  permission: "Dialog borders and titles, permission prompts and pickers",
  promptBorder: "Input prompt border",
  promptBorderShimmer: "Lighter partner of promptBorder in animated gradients",
  planMode: "Plan mode indicator",
  userMessageBackground: "Surface behind your messages",
  userMessageBackgroundHover: "That surface, hovered",
  rate_limit_fill: "Usage meter fill",
};
const TOKEN_ORDER = [
  "claude",
  "claudeShimmer",
  "text",
  "inactive",
  "subtle",
  "suggestion",
  "permission",
  "promptBorder",
  "promptBorderShimmer",
  "planMode",
  "userMessageBackground",
  "userMessageBackgroundHover",
  "rate_limit_fill",
];
const SURFACE_LABELS = { terminal: "terminal background", userMessageBackground: "your-message surface" };

function rgb(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`Invalid six-digit hex colour: ${hex}`);
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
}
function luminance(hex) {
  const [red, green, blue] = rgb(hex).map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}
export function contrast(first, second) {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
// Ratios are truncated, not rounded, so a printed figure is never above the
// measured one.
function ratioText(ratio) {
  return `${(Math.floor(ratio * 100) / 100).toFixed(2)}:1`;
}

// Same classification the gallery's finder uses.
function familyOf(hex) {
  const [r, g, b] = hex.match(/[a-f\d]{2}/gi).map((value) => parseInt(value, 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta < 0.12) return "neutral";
  let hue = 0;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  hue = Math.round(hue * 60);
  if (hue < 0) hue += 360;
  if (hue < 85 || hue >= 330) return "warm";
  if (hue < 170) return "green";
  if (hue < 255) return "cool";
  return "violet";
}
const FAMILY_WORDS = { neutral: "neutral", warm: "warm", green: "green", cool: "cool", violet: "violet" };

export const slugOf = (name) => name.toLowerCase().replace(/ /g, "-");
const installCommandFor = (packId) => `claude plugin install ${packId}@notgabriels-themes`;
const esc = (value) => String(value).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export async function loadThemes(root) {
  const html = await readFile(new URL("index.html", root), "utf8");
  const galleryMatch = html.match(/const THEMES = (\[[\s\S]*?\n\]);/);
  if (!galleryMatch) throw new Error("Could not find the THEMES array in index.html.");
  const galleryTerminals = new Map(JSON.parse(galleryMatch[1]).map((row) => [row[0], row[5]]));
  const marketplace = JSON.parse(await readFile(new URL(".claude-plugin/marketplace.json", root), "utf8"));

  const themes = [];
  for (const pack of PACKS) {
    const entry = marketplace.plugins.find((plugin) => plugin.name === pack.id);
    if (!entry) throw new Error(`Marketplace does not list ${pack.id}.`);
    const themesRoot = new URL(pack.themesDir || "./", root);
    const files = (await readdir(themesRoot)).filter((file) => file.endsWith(".json")).sort();
    const previews =
      pack.previewsFrom === "gallery"
        ? galleryTerminals
        : new Map(Object.entries(JSON.parse(await readFile(new URL(pack.previewsFrom, root), "utf8"))));
    const packThemes = [];
    for (const file of files) {
      const theme = JSON.parse(await readFile(new URL(file, themesRoot), "utf8"));
      const slug = slugOf(theme.name);
      if (`${slug}.json` !== file) {
        throw new Error(`${pack.themesDir}${file}: file name does not match the slug of "${theme.name}" (${slug}).`);
      }
      const terminal = previews.get(theme.name);
      if (!terminal) throw new Error(`${pack.themesDir}${file}: no recommended terminal background for ${theme.name}.`);
      packThemes.push({
        name: theme.name,
        slug,
        file,
        pack: { ...pack, version: entry.version, installCommand: installCommandFor(pack.id) },
        overrides: theme.overrides,
        terminal,
        family: familyOf(theme.overrides.claude),
      });
    }
    packThemes.forEach((theme, index) => {
      theme.position = index + 1;
      theme.packSize = packThemes.length;
      theme.prev = packThemes[(index - 1 + packThemes.length) % packThemes.length];
      theme.next = packThemes[(index + 1) % packThemes.length];
    });
    themes.push(...packThemes);
  }
  return themes;
}

function contrastRows(theme) {
  const surfaces = { terminal: theme.terminal, userMessageBackground: theme.overrides.userMessageBackground };
  const rows = [];
  for (const check of CONTRAST_CHECKS) {
    for (const surface of check.surfaces) {
      rows.push({
        label: `${check.token} on ${SURFACE_LABELS[surface]}`,
        foreground: theme.overrides[check.token],
        background: surfaces[surface],
        ratio: contrast(theme.overrides[check.token], surfaces[surface]),
        floor: check.floor,
        standard: check.standard,
      });
    }
  }
  rows.push({
    label: "your-message surface against the terminal",
    foreground: theme.overrides.userMessageBackground,
    background: theme.terminal,
    ratio: contrast(theme.overrides.userMessageBackground, theme.terminal),
    floor: 1.08,
    standard: "visibly distinct surface",
  });
  rows.push({
    label: "hovered surface against the resting one",
    foreground: theme.overrides.userMessageBackgroundHover,
    background: theme.overrides.userMessageBackground,
    ratio: contrast(theme.overrides.userMessageBackgroundHover, theme.overrides.userMessageBackground),
    floor: 1.08,
    standard: "visibly distinct surface",
  });
  // The page says every row meets its floor. Refuse to render one that does
  // not, rather than print a claim the verifier would also reject.
  for (const row of rows) {
    if (row.ratio + Number.EPSILON < row.floor) {
      throw new Error(`${theme.name}: ${row.label} is ${ratioText(row.ratio)}; needs ${row.floor}:1. Fix the theme before rendering its page.`);
    }
  }
  return rows;
}

const PAGE_CSS = `
  :root{--ground:#0d0e0f;--ground-2:#131416;--hair:#292b2f;--ink:#e9eaec;--mute:#a0a3aa;--faint:#858991;--accent:#c9cfd6;--accent-dim:#5f646c;--radius:10px;
    --mono:ui-monospace,"SF Mono",SFMono-Regular,"JetBrains Mono","Menlo",Consolas,monospace;
    --display:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}
  *{box-sizing:border-box}
  html{-webkit-text-size-adjust:100%}
  body{margin:0;background:var(--ground);color:var(--ink);font-family:var(--mono);line-height:1.55;-webkit-font-smoothing:antialiased;padding:0 clamp(18px,4vw,48px) 72px}
  .wrap{max-width:1080px;margin:0 auto}
  .skip-link{position:fixed;left:12px;top:12px;z-index:100;color:var(--ground);background:var(--ink);border-radius:6px;padding:8px 12px;font-size:12px;font-weight:700;text-decoration:none;transform:translateY(calc(-100% - 16px));transition:transform .15s ease}
  .skip-link:focus{transform:translateY(0);outline:2px solid var(--accent);outline-offset:2px}
  a{color:var(--ink);text-underline-offset:3px}
  a:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
  .jumpnav{min-height:42px;display:flex;align-items:center;justify-content:space-between;gap:24px;margin:22px 0 clamp(40px,6vw,72px);padding-bottom:14px;border-bottom:1px solid var(--hair)}
  .site-mark{color:var(--ink);font-size:10px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;text-decoration:none}
  .jumpnav-links{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px 24px}
  .jumpnav-links a{min-height:44px;display:inline-flex;align-items:center;color:var(--faint);font-size:11px;text-decoration:none}
  .jumpnav-links a:hover{color:var(--ink)}
  .kicker{color:var(--faint);letter-spacing:.28em;text-transform:uppercase;font-size:10px;margin:0 0 18px;display:flex;align-items:center;gap:10px}
  .kicker::before{content:"";width:30px;height:1px;background:var(--accent-dim)}
  h1{font-family:var(--display);font-size:clamp(40px,6.5vw,76px);line-height:.95;letter-spacing:-.05em;font-weight:520;margin:0}
  .lede{color:var(--mute);max-width:60ch;margin:22px 0 0;font-size:clamp(13px,1.4vw,15px);line-height:1.75}
  .lede b{color:var(--ink);font-weight:600}
  .hero{display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,420px);gap:clamp(28px,5vw,64px);align-items:start}
  @media (max-width:760px){.hero{grid-template-columns:1fr}}
  h2{font-family:var(--display);font-size:clamp(22px,3vw,30px);letter-spacing:-.03em;font-weight:520;margin:clamp(44px,7vw,72px) 0 14px}
  p{margin:0 0 12px;color:var(--mute);font-size:13px;line-height:1.7;max-width:76ch}
  code{font-family:var(--mono);font-size:.95em;color:var(--ink)}
  .card{--a:var(--accent);border:1px solid color-mix(in srgb,var(--a) 22%,transparent);border-radius:var(--radius);background:var(--bg,#111);overflow:hidden;display:flex;flex-direction:column}
  .card .titlebar{display:flex;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid color-mix(in srgb,var(--a) 14%,transparent)}
  .card .dots{display:flex;gap:5px}
  .card .dots i{width:9px;height:9px;border-radius:50%;display:block;opacity:.7}
  .card .tname{margin:0 0 0 4px;font-size:12px;font-weight:600;letter-spacing:.02em;color:var(--fg)}
  .card .hex{margin-left:auto;font-size:10.5px;color:var(--sh);letter-spacing:.04em}
  .term{padding:13px 14px 15px;font-size:12px;line-height:1.75;flex:1}
  .term .row{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .term .acc{color:var(--a)}.term .sh{color:var(--sh)}.term .fg{color:var(--fg)}.term .mut{color:var(--mut)}
  .prompt-box{margin-top:10px;display:flex;align-items:center;gap:8px;border:1px solid color-mix(in srgb,var(--a) 45%,transparent);border-radius:8px;padding:7px 10px;min-height:44px}
  .prompt-box .gt{color:var(--a);font-weight:700}
  .prompt-box .txt{color:var(--fg);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .caret{width:7px;height:15px;background:var(--a);display:inline-block;margin-left:1px;vertical-align:-3px;opacity:.8}
  .term .hint{margin-top:8px;font-size:10.5px;color:var(--mut)}
  .usermsg{margin-top:10px;padding:8px 10px;border-radius:6px;background:var(--um);color:var(--fg);font-size:12px}
  .cmd{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:12px;margin:0 0 8px;padding:10px 12px;border:1px solid var(--hair);border-radius:8px;background:var(--ground-2);font-size:12.5px}
  .cmd>span{min-width:0;overflow:auto;white-space:nowrap;padding-bottom:3px}
  .cmd .prompt{color:var(--faint)}
  .copy{flex:none;min-height:34px;padding:0 10px;border:1px solid var(--accent-dim);border-radius:6px;background:transparent;color:var(--ink);font:inherit;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;cursor:pointer}
  .copy:hover{border-color:var(--accent)}
  .copy:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  .note{color:var(--faint);font-size:12px}
  table{width:100%;min-width:620px;border-collapse:collapse;font-size:12.5px}
  th,td{padding:9px 10px;border-top:1px solid var(--hair);text-align:left;vertical-align:top}
  th{color:var(--faint);font-weight:600;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase}
  td.num{font-variant-numeric:tabular-nums;white-space:nowrap}
  .sw{display:inline-block;width:14px;height:14px;border-radius:4px;vertical-align:-2px;margin-right:8px;border:1px solid var(--hair)}
  .ok{color:var(--mute)}
  .table-wrap{overflow:auto}
  .neighbours{display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px;margin-top:clamp(40px,6vw,64px);padding-top:18px;border-top:1px solid var(--hair);font-size:12px}
  .neighbours a{color:var(--mute);text-decoration:none;min-height:44px;display:inline-flex;align-items:center}
  .neighbours a:hover{color:var(--ink)}
  footer{margin-top:clamp(56px,9vw,100px);padding-top:24px;border-top:1px solid var(--hair);display:flex;flex-wrap:wrap;gap:10px 28px;color:var(--faint);font-size:11px}
  footer a{color:var(--faint)}
  .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
  .index-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:4px 24px;margin:0 0 8px}
  .index-grid a{display:flex;align-items:center;gap:10px;min-height:44px;padding:4px 0;color:var(--ink);text-decoration:none;border-top:1px solid var(--hair);font-size:13px}
  .index-grid a:hover{color:var(--accent)}
  .index-grid .dot{width:12px;height:12px;border-radius:50%;flex:none}
  .index-grid .hexv{margin-left:auto;color:var(--faint);font-size:11px}
`;

// The buttons' aria-label outlasts their visible "Copied", so the outcome is
// also announced through the page's live region.
const COPY_SCRIPT = `
const copyStatus = document.getElementById("copyStatus");
document.querySelectorAll("[data-copy]").forEach((button) => {
  button.addEventListener("click", async () => {
    const text = button.getAttribute("data-copy");
    const original = button.textContent;
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = "Copied";
      copyStatus.textContent = "Copied to clipboard: " + text;
    } catch {
      button.textContent = "Select and copy";
      copyStatus.textContent = "Could not copy. Select the command and copy it: " + text;
    }
    setTimeout(() => { button.textContent = original; }, 1400);
  });
});
`;

function head({ title, description, canonical, themeColor, jsonLd }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="index,follow,max-image-preview:large">
<meta name="theme-color" content="${themeColor}">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="canonical" href="${canonical}">
<link rel="license" href="https://opensource.org/license/mit">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${SHARE_IMAGE}">
<meta property="og:image:width" content="1280">
<meta property="og:image:height" content="720">
<meta property="og:image:alt" content="${SHARE_IMAGE_ALT}">
<meta property="og:site_name" content="Gabs Utilities">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${SHARE_IMAGE}">
<meta name="twitter:image:alt" content="${SHARE_IMAGE_ALT}">
<script type="application/ld+json">
${JSON.stringify(jsonLd, null, 2)}
</script>
<style>${PAGE_CSS}</style>
</head>
<body>
<a class="skip-link" href="#main-content">Skip to content</a>
<div class="wrap">
  <nav class="jumpnav" aria-label="Site">
    <a class="site-mark" href="/">Gabs Utilities</a>
    <span class="jumpnav-links">
      <a href="/theme/">All themes</a>
      <a href="/#themes">Gallery</a>
      <a href="/claude-code-theme-install-guide.html">Install guide</a>
    </span>
  </nav>
  <main id="main-content">
`;
}

function foot() {
  return `    <p class="sr-only" id="copyStatus" aria-live="polite"></p>
  </main>
  <footer>
    <span>50 dark themes for Claude Code · Gabs Utilities</span>
    <span>Free, <a href="https://opensource.org/license/mit">MIT licensed</a></span>
    <span><a href="${REPO}">Source on GitHub</a></span>
    <span><a href="/impressum.html">Impressum</a></span>
  </footer>
</div>
<script>${COPY_SCRIPT}</script>
</body>
</html>
`;
}

// The prompt glyph says where the command runs: "$ " in a shell, "> " in
// Claude Code.
function commandPanel(command, label, prompt = "$ ") {
  return `      <div class="cmd"><span><span class="prompt">${esc(prompt)}</span><code>${esc(command)}</code></span><button class="copy" type="button" data-copy="${esc(command)}" aria-label="Copy: ${esc(label)}">Copy</button></div>\n`;
}

export function renderThemePage(theme) {
  const { name, slug, pack, overrides, terminal } = theme;
  const canonical = `${SITE}/theme/${slug}/`;
  const rows = contrastRows(theme);
  const textRatio = rows.find((row) => row.label.startsWith("text on terminal"));
  const inactiveRatio = rows.find((row) => row.label.startsWith("inactive on terminal"));
  const familyWord = FAMILY_WORDS[theme.family];
  const title = `${name} — dark theme for Claude Code`;
  const description =
    `${name}: a free dark theme for Claude Code with a ${familyWord} ${overrides.claude} accent on a ${terminal} terminal. ` +
    `Palette roles, measured contrast and the one-line install.`;
  const rawUrl = `${RAW}/${pack.rawDir}${theme.file}`;
  const blobUrl = `${REPO}/blob/main/${pack.rawDir}${theme.file}`;
  const manualCommand = `mkdir -p ~/.claude/themes && curl -fsSL ${rawUrl} -o ~/.claude/themes/${theme.file}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": canonical,
        url: canonical,
        name: title,
        description,
        isPartOf: { "@type": "WebSite", "@id": `${SITE}/#website`, name: "Gabs Utilities", url: `${SITE}/` },
        // index.html's #plugin is the 50-theme plugin; a Vol. 2 theme is not in it.
        ...(pack.id === "50-dark-themes" ? { about: { "@id": `${SITE}/#plugin` } } : {}),
        author: { "@type": "Organization", name: "Gabs Utilities", url: SITE },
        license: "https://opensource.org/license/mit",
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Gabs Utilities", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: "Themes", item: `${SITE}/theme/` },
          { "@type": "ListItem", position: 3, name, item: canonical },
        ],
      },
    ],
  };

  const paletteRows = TOKEN_ORDER.map(
    (token) =>
      `          <tr><td><span class="sw" style="background:${overrides[token]}"></span><code>${overrides[token]}</code></td><td><code>${token}</code></td><td>${esc(ROLES[token])}</td></tr>`,
  ).join("\n");
  const contrastRowsHtml = rows
    .map(
      (row) =>
        `          <tr><td>${esc(row.label)}</td><td class="num"><code>${row.foreground}</code> on <code>${row.background}</code></td><td class="num">${ratioText(row.ratio)}</td><td class="num">${row.floor}:1</td><td class="ok">${esc(row.standard)}</td></tr>`,
    )
    .join("\n");

  return (
    head({ title, description, canonical, themeColor: terminal, jsonLd }) +
    `    <div class="hero">
      <div>
        <p class="kicker">${esc(pack.label)} · ${theme.position} / ${theme.packSize}</p>
        <h1>${esc(name)}</h1>
        <p class="lede">A ${familyWord} accent, <b>${overrides.claude}</b>, on a <b>${terminal}</b> terminal. Primary text reads at
          <b>${ratioText(textRatio.ratio)}</b> and secondary text at <b>${ratioText(inactiveRatio.ratio)}</b>, measured against that
          background. Free and MIT licensed, one of the ${esc(pack.label)} for Claude Code.</p>
      </div>
      <article class="card" aria-label="${esc(name)} theme specimen" style="--bg:${terminal};--a:${overrides.claude};--sh:${overrides.claudeShimmer};--fg:${overrides.text};--mut:${overrides.inactive};--um:${overrides.userMessageBackground}">
        <div class="titlebar">
          <div class="dots"><i style="background:${overrides.claude}"></i><i style="background:${overrides.inactive};opacity:.4"></i><i style="background:${overrides.inactive};opacity:.25"></i></div>
          <p class="tname">${esc(name)}</p>
          <span class="hex">${overrides.claude}</span>
        </div>
        <div class="term">
          <div class="row"><span class="acc">✻</span> <span class="sh">Claude Code</span> <span class="mut">· ${esc(name.toLowerCase())}</span></div>
          <div class="row"><span class="acc">●</span> <span class="fg">Applied theme &ldquo;${esc(name)}&rdquo;</span></div>
          <div class="row"><span class="mut">&nbsp;&nbsp;3 files changed · staged</span></div>
          <div class="usermsg">&gt; show me the diff</div>
          <div class="prompt-box"><span class="gt">&gt;</span><span class="txt">/theme</span><span class="caret" aria-hidden="true"></span></div>
          <div class="hint">then choose &ldquo;${esc(name)}&rdquo;</div>
        </div>
      </article>
    </div>

    <section aria-labelledby="install-title">
      <h2 id="install-title">Install ${esc(name)}.</h2>
      <p>Requires Claude Code v2.1.118 or later. The marketplace command is needed once per machine; the plugin command installs the whole ${esc(pack.label)} pack. Then run <code>/theme</code> in Claude Code and choose &ldquo;${esc(name)}&rdquo; from the list.</p>
${commandPanel(MARKETPLACE_COMMAND, "marketplace command")}${commandPanel(pack.installCommand, `${pack.label} install command`)}      <p class="note">If Claude Code was open while you installed, restart it: plugin themes load when it starts.</p>
${commandPanel("/theme", `the /theme command, then choose ${name} in Claude Code`, "> ")}      <p class="note">Plugin themes are read-only. Press <code>Ctrl+E</code> on one in <code>/theme</code> for an editable copy in <code>~/.claude/themes/</code>.</p>
    </section>

    <section aria-labelledby="manual-title">
      <h2 id="manual-title">Or copy just this file.</h2>
      <p>One theme, no plugin: fetch <a href="${blobUrl}"><code>${esc(pack.rawDir)}${esc(theme.file)}</code></a> from the repository into your themes folder. If that folder did not exist when Claude Code started, restart it once.</p>
${commandPanel(manualCommand, `copy ${name} manually`)}    </section>

    <section aria-labelledby="terminal-title">
      <h2 id="terminal-title">Terminal background: <code>${terminal}</code>.</h2>
      <p>Claude Code colours its own interface; the terminal application owns the canvas behind it. The terminal rows below are measured against <code>${terminal}</code>, so set that as the terminal background for the result the numbers describe; on a different background they move. The rest compare text with the surface behind your messages, and that surface with its hovered state.</p>
    </section>

    <section aria-labelledby="palette-title">
      <h2 id="palette-title">Palette.</h2>
      <p>The thirteen overrides Claude Code reads from the theme file. Success, error, warning and diff colours are deliberately not overridden, so status meaning stays the same across every theme in the pack.</p>
      <div class="table-wrap">
        <table>
          <thead><tr><th scope="col">Colour</th><th scope="col">Token</th><th scope="col">Role</th></tr></thead>
          <tbody>
${paletteRows}
          </tbody>
        </table>
      </div>
    </section>

    <section aria-labelledby="contrast-title">
      <h2 id="contrast-title">Measured contrast.</h2>
      <p>Computed from the hex values above with the WCAG 2 relative-luminance formula, against the same floors <code>scripts/verify-contrast.mjs</code> checks on every pull request. Figures are truncated, never rounded up. Each row meets its floor.</p>
      <div class="table-wrap">
        <table>
          <thead><tr><th scope="col">Pair</th><th scope="col">Colours</th><th scope="col">Ratio</th><th scope="col">Floor</th><th scope="col">Standard</th></tr></thead>
          <tbody>
${contrastRowsHtml}
          </tbody>
        </table>
      </div>
    </section>

    <nav class="neighbours" aria-label="Neighbouring themes">
      <a href="/theme/${theme.prev.slug}/" rel="prev">&larr; ${esc(theme.prev.name)}</a>
      <a href="/theme/">All themes</a>
      <a href="/theme/${theme.next.slug}/" rel="next">${esc(theme.next.name)} &rarr;</a>
    </nav>
` +
    foot()
  );
}

export function renderIndexPage(themes) {
  const canonical = `${SITE}/theme/`;
  const title = `Every theme — ${themes.length} dark themes for Claude Code`;
  const description =
    `One page per theme: ${themes.length} free dark themes for Claude Code, each with its palette, measured contrast, ` +
    `recommended terminal background and install command.`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": canonical,
    url: canonical,
    name: title,
    description,
    isPartOf: { "@type": "WebSite", "@id": `${SITE}/#website`, name: "Gabs Utilities", url: `${SITE}/` },
    author: { "@type": "Organization", name: "Gabs Utilities", url: SITE },
  };
  const sections = PACKS.map((pack) => {
    const packThemes = themes.filter((theme) => theme.pack.id === pack.id);
    const links = packThemes
      .map(
        (theme) =>
          `        <a href="/theme/${theme.slug}/"><span class="dot" style="background:${theme.overrides.claude}"></span>${esc(theme.name)}<span class="hexv">${theme.overrides.claude}</span></a>`,
      )
      .join("\n");
    return `    <section aria-labelledby="${pack.id}-title">
      <h2 id="${pack.id}-title">${esc(pack.label)} · ${packThemes.length}</h2>
      <p>Installs as one plugin: <code>${esc(installCommandFor(pack.id))}</code>. If Claude Code was open while you installed, restart it: plugin themes load when it starts. Previewed in colour in the <a href="/${pack.galleryAnchor}">gallery</a>.</p>
      <div class="index-grid">
${links}
      </div>
    </section>
`;
  }).join("\n");
  return (
    head({ title, description, canonical, themeColor: "#0f1011", jsonLd }) +
    `    <p class="kicker">Claude Code · ${themes.length} themes</p>
    <h1>Every theme,<br>one page each.</h1>
    <p class="lede">Each page shows the palette and what each colour does, the contrast measured against the recommended terminal background, and the install commands. The <a href="/#themes">gallery</a> previews them all in their own colours.</p>
${commandPanel(MARKETPLACE_COMMAND, "marketplace command")}
${sections}` +
    foot()
  );
}

export function renderSitemap(themes) {
  const entries = [
    ...FIXED_SITEMAP_ENTRIES,
    `  <url><loc>${SITE}/theme/</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>`,
    ...themes.map(
      (theme) => `  <url><loc>${SITE}/theme/${theme.slug}/</loc><changefreq>monthly</changefreq><priority>0.6</priority></url>`,
    ),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>\n`;
}

// Every file this builder owns, keyed by repository-relative path.
export async function buildThemePages(root) {
  const themes = await loadThemes(root);
  const files = new Map();
  for (const theme of themes) files.set(`theme/${theme.slug}/index.html`, renderThemePage(theme));
  files.set("theme/index.html", renderIndexPage(themes));
  files.set("sitemap.xml", renderSitemap(themes));
  return files;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = new URL("../", import.meta.url);
  const files = await buildThemePages(root);
  for (const [path, content] of files) {
    const target = new URL(path, root);
    await mkdir(new URL("./", target), { recursive: true });
    await writeFile(target, content);
  }
  console.log(`Wrote ${files.size - 2} theme pages, theme/index.html and sitemap.xml.`);
}
