#!/usr/bin/env node
// Tells search engines through IndexNow that the site's pages changed (since 2026-11-15).
//
// Runs on every push to main (.github/workflows/indexnow.yml): it waits until GitHub Pages
// has deployed that commit, then sends every address in sitemap.xml to the IndexNow
// endpoint with the site's key. The key is public by design: the engines confirm it by
// fetching https://<host>/<key>.txt, which must hold the key itself, so the file at the
// repository root and this constant are checked against each other before anything is sent.
//
//   node scripts/submit-indexnow.mjs [--after-pages <commit>]
//
// --after-pages waits for the "pages build and deployment" run on that commit to succeed
// (GITHUB_TOKEN and GITHUB_REPOSITORY needed), and sends nothing if it fails.
// INDEXNOW_ENDPOINT overrides the endpoint (the tests point it at a local server).
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const INDEXNOW_KEY = "79F35EFA-F66B-4757-848A-FB1A9029E1BA";
export const DEFAULT_ENDPOINT = "https://api.indexnow.org/indexnow";
export const PAGES_WORKFLOW = "pages build and deployment";

// The body IndexNow takes: every <loc> in the sitemap, all on the one host the key file is on.
export function indexNowPayload(sitemap, host, key = INDEXNOW_KEY) {
  const urlList = [...String(sitemap).matchAll(/<loc>([^<]*)<\/loc>/g)].map(([, loc]) => loc.trim());
  if (!urlList.length) throw new Error("sitemap.xml lists no <loc>; there is nothing to send.");
  for (const url of urlList) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`sitemap.xml lists ${JSON.stringify(url)}, which is not an address.`);
    }
    if (parsed.protocol !== "https:" || parsed.host !== host) {
      throw new Error(`sitemap.xml lists ${url}, which is not on https://${host}/; IndexNow takes one host per submission.`);
    }
  }
  return { host, key, keyLocation: `https://${host}/${key}.txt`, urlList: [...new Set(urlList)] };
}

// The key file must be named for the key and hold exactly it, or the engines reject it.
export function keyFileProblem(text, key = INDEXNOW_KEY) {
  if (String(text).trim() !== key) return `${key}.txt must hold the key ${key} and nothing else; IndexNow fetches it to confirm the submission.`;
  return null;
}

// Waits for the Pages run of a commit. getRuns(commit) returns that commit's workflow runs
// ({ name, status, conclusion }); sleep is injected so the tests do not wait.
export async function waitForPages(commit, getRuns, { attempts = 40, sleep = (ms) => new Promise((done) => setTimeout(done, ms)), interval = 15000 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const run = (await getRuns(commit)).find((candidate) => candidate.name === PAGES_WORKFLOW);
    if (run?.status === "completed") {
      if (run.conclusion === "success") return;
      throw new Error(`The Pages deploy of ${commit.slice(0, 12)} ended "${run.conclusion}"; nothing was sent to IndexNow.`);
    }
    await sleep(interval);
  }
  throw new Error(`The Pages deploy of ${commit.slice(0, 12)} did not finish in time; nothing was sent to IndexNow.`);
}

// IndexNow answers 200 (received) or 202 (received, key check pending); anything else is a failure.
export async function submit(payload, endpoint = DEFAULT_ENDPOINT) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  });
  if (response.status !== 200 && response.status !== 202) {
    throw new Error(`IndexNow answered HTTP ${response.status} for ${payload.urlList.length} addresses: ${(await response.text()).slice(0, 300)}`);
  }
  return response.status;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = new URL("../", import.meta.url);
  const host = (await readFile(new URL("CNAME", root), "utf8")).trim();
  const problem = keyFileProblem(await readFile(new URL(`${INDEXNOW_KEY}.txt`, root), "utf8"));
  if (problem) throw new Error(problem);
  const payload = indexNowPayload(await readFile(new URL("sitemap.xml", root), "utf8"), host);

  const after = process.argv.indexOf("--after-pages");
  if (after >= 0) {
    const commit = process.argv[after + 1];
    const { GITHUB_TOKEN: token, GITHUB_REPOSITORY: repository } = process.env;
    if (!commit || !token || !repository) throw new Error("--after-pages needs a commit, GITHUB_TOKEN and GITHUB_REPOSITORY.");
    await waitForPages(commit, async (sha) => {
      const response = await fetch(`https://api.github.com/repos/${repository}/actions/runs?head_sha=${sha}&per_page=50`, {
        headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" },
      });
      if (!response.ok) throw new Error(`Could not read the runs of ${sha}: HTTP ${response.status}`);
      return (await response.json()).workflow_runs ?? [];
    });
  }
  const status = await submit(payload, process.env.INDEXNOW_ENDPOINT || DEFAULT_ENDPOINT);
  console.log(`IndexNow answered HTTP ${status} for ${payload.urlList.length} addresses on ${host}.`);
}
