#!/usr/bin/env node
// Reads the deployed site back after every push to main (since 2026-11-15).
//
// Runs on push to main (.github/workflows/live-check.yml): once GitHub Pages has deployed the
// commit, it fetches every address in sitemap.xml and the site's root text files from the
// domain in CNAME, each with a query naming the commit so no cache answers for it, and fails
// unless each body is byte for byte the file at that commit. A page that differs is reported
// with its first differing line. The runner reaches the domain; a lane session behind a proxy
// does not, so this check run is how a merge is confirmed live.
//
//   node scripts/check-live-site.mjs [--after-pages <commit>]
//
// --after-pages waits for the "pages build and deployment" run on that commit to succeed
// (GITHUB_TOKEN and GITHUB_REPOSITORY needed). LIVE_SITE_ORIGIN fetches the same addresses
// from another origin, and LIVE_CHECK_INTERVAL_MS sets the wait between reads of a stale page
// (the tests point it at a local server and wait 0).
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { waitForPages } from "./submit-indexnow.mjs";

// Served beside the pages and read the same way; the sitemap lists pages only.
export const ROOT_FILES = ["sitemap.xml", "robots.txt", "llms.txt", "assets/site.css"];

// The file in the repository that Pages serves at an address on the site.
export function servedFile(address, origin) {
  const url = new URL(address);
  if (url.origin !== new URL(origin).origin) throw new Error(`${address} is not on ${origin}; the live check reads one site.`);
  if (url.search || url.hash) throw new Error(`${address} carries a query or fragment; list the page itself.`);
  const path = decodeURIComponent(url.pathname).replace(/^\//, "");
  if (path.split("/").some((segment) => segment === ".." || segment === ".")) throw new Error(`${address} has a dot segment.`);
  return path === "" || path.endsWith("/") ? `${path}index.html` : path;
}

// Every address the check reads: each <loc> in the sitemap, then the root files.
export function addresses(sitemap, origin) {
  const locs = [...String(sitemap).matchAll(/<loc>([^<]*)<\/loc>/g)].map(([, loc]) => loc.trim());
  if (!locs.length) throw new Error("sitemap.xml lists no <loc>; there is nothing to read back.");
  return [...new Set([...locs, ...ROOT_FILES.map((file) => new URL(file, `${origin}/`).href)])];
}

// The first line on which the served body leaves the committed file, for the message.
export function firstDifference(expected, served) {
  if (expected === served) return null;
  const [want, got] = [expected.split("\n"), served.split("\n")];
  for (let line = 0; line < Math.max(want.length, got.length); line += 1) {
    if (want[line] !== got[line]) {
      const show = (text) => (text === undefined ? "(no line)" : JSON.stringify(text.length > 120 ? `${text.slice(0, 120)}…` : text));
      return `line ${line + 1}: committed ${show(want[line])}, served ${show(got[line])}`;
    }
  }
  return "the bytes differ (line endings or encoding)";
}

// Reads each address and compares it with the committed file. A page served stale is read
// again (Pages can take a moment after its deploy reports success) before it counts.
// fetchText(url) returns { status, text }; readFile(path) returns the committed text.
export async function checkLive(list, origin, commit, { fetchText, readCommitted, attempts = 6, sleep = (ms) => new Promise((done) => setTimeout(done, ms)), interval = 20000 } = {}) {
  const problems = [];
  for (const address of list) {
    const file = servedFile(address, origin);
    const expected = await readCommitted(file);
    let result = "";
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const url = new URL(address);
      url.searchParams.set("live-check", commit);
      const { status, text } = await fetchText(url.href);
      result = status !== 200 ? `HTTP ${status}` : firstDifference(expected, text);
      if (!result) break;
      if (attempt + 1 < attempts) await sleep(interval);
    }
    if (result) problems.push(`${address} (${file}) is not the committed file: ${result}`);
  }
  return problems;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = new URL("../", import.meta.url);
  const origin = `https://${(await readFile(new URL("CNAME", root), "utf8")).trim()}`;
  const fetchFrom = process.env.LIVE_SITE_ORIGIN || origin;
  const list = addresses(await readFile(new URL("sitemap.xml", root), "utf8"), origin);
  const after = process.argv.indexOf("--after-pages");
  const commit = after >= 0 ? process.argv[after + 1] : "local";
  if (after >= 0) {
    const { GITHUB_TOKEN: token, GITHUB_REPOSITORY: repository } = process.env;
    if (!commit || !token || !repository) throw new Error("--after-pages needs a commit, GITHUB_TOKEN and GITHUB_REPOSITORY.");
    await waitForPages(commit, async (sha) => {
      const response = await fetch(`https://api.github.com/repos/${repository}/actions/runs?head_sha=${sha}&per_page=50`, {
        headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" },
      });
      if (!response.ok) throw new Error(`Could not read the runs of ${sha}: HTTP ${response.status}`);
      return (await response.json()).workflow_runs ?? [];
    }, { consequence: "the live site was not read" });
  }
  const interval = Number(process.env.LIVE_CHECK_INTERVAL_MS ?? 20000);
  const problems = await checkLive(list, origin, commit, {
    interval,
    fetchText: async (url) => {
      const response = await fetch(fetchFrom + url.slice(origin.length), { headers: { "Cache-Control": "no-cache" } });
      return { status: response.status, text: await response.text() };
    },
    readCommitted: (file) => readFile(new URL(file.split("/").map(encodeURIComponent).join("/"), root), "utf8"),
  });
  for (const problem of problems) console.log(`::error::${problem}`);
  if (problems.length) {
    console.error(`${problems.length} of ${list.length} addresses on ${origin} are not the committed files.`);
    process.exit(1);
  }
  console.log(`All ${list.length} addresses on ${origin} serve the files at ${commit}.`);
}
