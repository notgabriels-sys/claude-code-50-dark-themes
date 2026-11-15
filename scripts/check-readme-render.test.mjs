import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { README_PATHS } from "./build-readme-theme-links.mjs";
import { renderProblems, renderedLinks, sourceLinks } from "./check-readme-render.mjs";

const page = (slug) => `https://gabs-utilities.com/theme/${slug}/`;
const anchor = (slug, text) => `<a href="${page(slug)}" rel="nofollow">${text}</a>`;

test("readme render: the source's theme-page links are read written, bare and in angle brackets, in order", () => {
  const links = sourceLinks(
    [
      "Every theme: https://gabs-utilities.com/theme/.",
      `[Acid](${page("acid")}) · [Amber Room](${page("amber-room")}) and <${page("acid")}>`,
      // Not theme-page links: another path under the page, an address inside a longer one, a code word.
      `[deeper](${page("acid")}x/) https://example.com/?u=https://gabs-utilities.com/theme/ \`gabs-utilities.com/theme/\``,
    ].join("\n"),
  );
  assert.deepEqual(links, [
    { href: "https://gabs-utilities.com/theme/", text: "https://gabs-utilities.com/theme/" },
    { href: page("acid"), text: "Acid" },
    { href: page("amber-room"), text: "Amber Room" },
    { href: page("acid"), text: page("acid") },
  ]);
});

test("readme render: GitHub's anchors are read with their text, entities decoded and inner tags dropped", () => {
  const html = [
    anchor("acid", "Acid"),
    `<a href="${page("vu-meter")}" rel="nofollow"><strong>VU</strong> Meter &amp; co</a>`,
    '<a href="https://example.com/">elsewhere</a>',
    '<a id="user-content-x" class="anchor" href="#x"></a>',
    // An address that only starts like a theme page still counts, so a wrong target is reported.
    `<a href="${page("acid")}more">Acid</a>`,
    `<a href="${page("clay")}?a=1&amp;b=2">Clay</a>`,
  ].join("\n");
  assert.deepEqual(renderedLinks(html), [
    { href: page("acid"), text: "Acid" },
    { href: page("vu-meter"), text: "VU Meter & co" },
    { href: `${page("acid")}more`, text: "Acid" },
    { href: `${page("clay")}?a=1&b=2`, text: "Clay" },
  ]);
});

test("readme render: a README GitHub renders as written passes", () => {
  const markdown = `[Acid](${page("acid")}) · [Clay](${page("clay")})\n\nSee https://gabs-utilities.com/theme/\n`;
  const html = `<p>${anchor("acid", "Acid")} · ${anchor("clay", "Clay")}</p><p>See <a href="https://gabs-utilities.com/theme/" rel="nofollow">https://gabs-utilities.com/theme/</a></p>`;
  assert.deepEqual(renderProblems("README.md", markdown, html), []);
});

test("readme render: links GitHub shows as code are reported, as captured from GitHub's own render", () => {
  // From GitHub's render (2026-11-15) of README.md with a bare ``` line above the Vol. 2 list:
  // the list landed in a code block, and its links in a copy button's attribute, as text.
  const markdown = `\`\`\`\n<!-- theme-links:vol2:start -->\n\n[Afterglow](${page("afterglow")}) · [Clay](${page("clay")})\n`;
  const html =
    '<div class="snippet-clipboard-content notranslate position-relative overflow-auto" data-snippet-clipboard-copy-content="&lt;!-- theme-links:vol2:start --&gt;\n\n' +
    `[Afterglow](${page("afterglow")}) · [Clay](${page("clay")})"><pre lang="text" class="notranslate"><code>&lt;!-- theme-links:vol2:start --&gt;\n\n` +
    `[Afterglow](${page("afterglow")}) · [Clay](${page("clay")})</code></pre></div>`;
  const [problem, ...rest] = renderProblems("README.md", markdown, html);
  assert.deepEqual(rest, []);
  assert.match(problem, /^README\.md: GitHub does not render 2 theme-page links the source writes/);
  assert.match(problem, /\[Afterglow\]\(https:\/\/gabs-utilities\.com\/theme\/afterglow\/\), \[Clay\]/);
});

test("readme render: a link written twice and rendered once, a changed text and an extra anchor are each reported", () => {
  const twice = `[Acid](${page("acid")}) [Acid](${page("acid")})`;
  assert.match(renderProblems("R.md", twice, anchor("acid", "Acid")).join("\n"), /does not render 1 theme-page link the source writes.*\[Acid\]/);

  const [missing, extra] = renderProblems("R.md", `[Acid](${page("acid")})`, anchor("acid", "Acid!"));
  assert.match(missing, /does not render 1 theme-page link/);
  assert.match(extra, /^R\.md: GitHub renders 1 theme-page link the source does not write as a link: \[Acid!\]/);

  const more = renderProblems("R.md", "", Array.from({ length: 10 }, (_, index) => anchor(`t${index}`, `T${index}`)).join(""));
  assert.match(more[0], /renders 10 theme-page links .*\[T7\]\([^)]*\), …\. Write each/);
});

test("readme render: every README the offline reader holds is one this check renders", async () => {
  const source = await readFile(new URL("./check-readme-render.mjs", import.meta.url), "utf8");
  assert.match(source, /for \(const path of README_PATHS\)/);
  assert.ok(README_PATHS.includes("README.md") && README_PATHS.length >= 3);
});
