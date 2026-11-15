#!/usr/bin/env node
// Holds the READMEs' theme-page links to GitHub's own renderer (since 2026-11-15).
//
// verify.mjs reads each README offline (markdownFlow and themeLinkProblems in
// build-readme-theme-links.mjs) and refuses the Markdown shapes it knows swallow a
// link. That reader models CommonMark and GFM one shape at a time, so it can be
// wrong about a shape nobody has tried. This check asks GitHub instead: it fetches
// each README rendered by GitHub at the commit under test (the repository contents
// API with the html media type, which is the renderer github.com shows), and fails
// unless every theme-page link written in the source comes back as an anchor to
// that page with that text, and no other theme-page anchor appears.
//
//   node scripts/check-readme-render.mjs [ref]
//
// It needs GITHUB_REPOSITORY and reads the ref from its argument, else GITHUB_SHA.
// In CI it uses GITHUB_TOKEN; elsewhere, the gh CLI's own sign-in.
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { annotation } from "./github-annotations.mjs";
import { README_PATHS, THEME_PAGE_URL } from "./build-readme-theme-links.mjs";

const PAGE = "https://gabs-utilities\\.com/theme/(?:[a-z0-9]+(?:-[a-z0-9]+)*/)?";

// Each theme-page link the source writes, in order: `[text](address)`, as the
// generated lists and the README's link to the index are written (pageLink), or a
// bare address, which GFM links as itself (the 50-pack README's link to the index).
export function sourceLinks(markdown) {
  const written = new RegExp(`\\[([^\\]\\n]+)\\]\\((${PAGE})\\)`, "g");
  // A bare address, or one in angle brackets, which GFM turns into a link reading as itself.
  const bare = new RegExp(`(?<![\\w(\\[/"'=-])<?(${PAGE})(?=>|[\\s.,;:!?)]|$)`, "g");
  const text = String(markdown);
  const links = [...text.matchAll(written)].map((match) => ({ at: match.index, href: match[2], text: match[1] }));
  links.push(...[...text.matchAll(bare)].map((match) => ({ at: match.index, href: match[1], text: match[1] })));
  return links.sort((a, b) => a.at - b.at).map(({ href, text }) => ({ href, text }));
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", "#x27": "'" };
const decode = (text) => text.replace(/&(amp|lt|gt|quot|#39|#x27);/g, (_, name) => ENTITIES[name]);

// Every anchor in GitHub's HTML whose href is on the theme pages, with its text.
// An address that only starts like a theme page (a longer path, a query) counts too,
// so a link that rendered to the wrong place is reported rather than skipped.
export function renderedLinks(html) {
  const anchors = /<a\b([^>]*)>([\s\S]*?)<\/a>/g;
  const links = [];
  for (const [, attributes, inner] of String(html).matchAll(anchors)) {
    const href = /\bhref="([^"]*)"/.exec(attributes)?.[1];
    if (!href) continue;
    const address = decode(href);
    if (!address.startsWith(THEME_PAGE_URL)) continue;
    links.push({ href: address, text: decode(inner.replace(/<[^>]*>/g, "")).trim() });
  }
  return links;
}

// What GitHub rendered differently from what the source wrote, as sentences.
export function renderProblems(path, markdown, html) {
  const key = ({ href, text }) => `[${text}](${href})`;
  const remaining = new Map();
  for (const link of renderedLinks(html)) remaining.set(key(link), (remaining.get(key(link)) ?? 0) + 1);
  const missing = [];
  for (const link of sourceLinks(markdown)) {
    const count = remaining.get(key(link)) ?? 0;
    if (count) remaining.set(key(link), count - 1);
    else missing.push(key(link));
  }
  const extra = [...remaining].flatMap(([link, count]) => Array(count).fill(link));
  const problems = [];
  if (missing.length) {
    problems.push(
      `${path}: GitHub does not render ${missing.length} theme-page link${missing.length === 1 ? "" : "s"} the source writes, ` +
        `so a reader sees the Markdown, or nothing, instead of a link: ${missing.slice(0, 8).join(", ")}${missing.length > 8 ? ", …" : ""}. ` +
        `Something around the list (a fence, an HTML block, a quote or list marker, an unclosed code span) is swallowing it; ` +
        `the offline reader in verify did not see it, so look at the lines just above the list.`,
    );
  }
  if (extra.length) {
    problems.push(
      `${path}: GitHub renders ${extra.length} theme-page link${extra.length === 1 ? "" : "s"} the source does not write as a link: ` +
        `${extra.slice(0, 8).join(", ")}${extra.length > 8 ? ", …" : ""}. Write each theme-page link as [Name](address).`,
    );
  }
  return problems;
}

async function renderedReadme(repository, ref, path, token) {
  const endpoint = `repos/${repository}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref)}`;
  if (!token) {
    // Locally, the GitHub CLI's own sign-in is used when no token is set.
    const run = spawnSync("gh", ["api", "-H", "Accept: application/vnd.github.html+json", endpoint], { encoding: "utf8", maxBuffer: 1 << 26 });
    if (run.error || run.status !== 0) throw new Error(`GitHub did not render ${path} at ${ref} through the gh CLI: ${(run.stderr || String(run.error)).slice(0, 200)}`);
    return run.stdout;
  }
  const url = `https://api.github.com/${endpoint}`;
  const response = await fetch(url, {
    headers: { Accept: "application/vnd.github.html+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" },
  });
  if (!response.ok) throw new Error(`GitHub did not render ${path} at ${ref}: HTTP ${response.status} ${(await response.text()).slice(0, 200)}`);
  return response.text();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const token = process.env.GITHUB_ACTIONS === "true" ? process.env.GITHUB_TOKEN : undefined;
  const repository = process.env.GITHUB_REPOSITORY;
  const ref = process.argv[2] || process.env.GITHUB_SHA;
  if (!repository || !ref || (!token && process.env.GITHUB_ACTIONS === "true")) {
    console.error("check-readme-render needs GITHUB_REPOSITORY, a ref (an argument or GITHUB_SHA) and, in CI, GITHUB_TOKEN; locally it falls back to the gh CLI.");
    process.exit(2);
  }
  const root = new URL("../", import.meta.url);
  const problems = [];
  let checked = 0;
  for (const path of README_PATHS) {
    const markdown = await readFile(new URL(path, root), "utf8");
    let html;
    try {
      html = await renderedReadme(repository, ref, path, token);
    } catch (error) {
      problems.push(error.message);
      continue;
    }
    problems.push(...renderProblems(path, markdown, html));
    checked += sourceLinks(markdown).length;
  }
  if (problems.length) {
    for (const problem of problems) {
      console.error(problem);
      if (process.env.GITHUB_ACTIONS === "true") process.stdout.write(annotation({ title: "README render failed", message: problem }));
    }
    process.exit(1);
  }
  console.log(`GitHub renders all ${checked} theme-page links in ${README_PATHS.length} READMEs as written, at ${ref.slice(0, 12)}.`);
}
