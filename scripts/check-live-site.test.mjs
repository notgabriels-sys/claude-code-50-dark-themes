import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { ROOT_FILES, addresses, checkLive, firstDifference, servedFile } from "./check-live-site.mjs";
import { PAGES_WORKFLOW, waitForPages } from "./submit-indexnow.mjs";

const root = new URL("../", import.meta.url);
const site = "https://example.org";
const sitemap = (...locs) => `<urlset>${locs.map((loc) => `<url><loc>${loc}</loc></url>`).join("")}</urlset>`;

test("live check: each address is the file Pages serves there", () => {
  assert.equal(servedFile("https://example.org/", site), "index.html");
  assert.equal(servedFile("https://example.org/theme/", site), "theme/index.html");
  assert.equal(servedFile("https://example.org/theme/acid/", site), "theme/acid/index.html");
  assert.equal(servedFile("https://example.org/familiars.html", site), "familiars.html");
  assert.equal(servedFile("https://example.org/assets/site.css", site), "assets/site.css");
  assert.throws(() => servedFile("https://other.example/", site), /is not on https:\/\/example\.org; the live check reads one site/);
  assert.throws(() => servedFile("https://example.org/a.html?x=1", site), /carries a query or fragment/);
  assert.throws(() => servedFile("https://example.org/a%2F..%2Fb.html", site), /has a dot segment/);
});

test("live check: it reads every sitemap address once, then the root files", () => {
  const list = addresses(sitemap("https://example.org/", "https://example.org/theme/", "https://example.org/"), site);
  assert.deepEqual(list, ["https://example.org/", "https://example.org/theme/", ...ROOT_FILES.map((file) => `${site}/${file}`)]);
  assert.throws(() => addresses("<urlset></urlset>", site), /lists no <loc>/);
});

test("live check: a difference names its first line", () => {
  assert.equal(firstDifference("a\nb\nc", "a\nb\nc"), null);
  assert.equal(firstDifference("a\nb\nc", "a\nB\nc"), 'line 2: committed "b", served "B"');
  assert.equal(firstDifference("a\nb", "a\nb\nc"), 'line 3: committed (no line), served "c"');
  assert.equal(firstDifference("a\n", "a\r\n"), 'line 1: committed "a", served "a\\r"');
});

test("live check: a stale page is read again, and still stale it fails with the address, the file and the line", async () => {
  const committed = { "index.html": "<p>new</p>\n", "theme/index.html": "<p>list</p>\n" };
  const served = { "/": ["<p>old</p>\n", "<p>new</p>\n"], "/theme/": ["<p>old list</p>\n", "<p>old list</p>\n", "<p>old list</p>\n"] };
  const asked = [];
  const options = {
    readCommitted: async (file) => committed[file],
    fetchText: async (url) => {
      asked.push(url);
      const { pathname } = new URL(url);
      return { status: 200, text: served[pathname].shift() };
    },
    attempts: 3,
    sleep: async () => {},
  };
  const problems = await checkLive(["https://example.org/", "https://example.org/theme/"], site, "abc123", options);
  assert.deepEqual(problems, ['https://example.org/theme/ (theme/index.html) is not the committed file: line 1: committed "<p>list</p>", served "<p>old list</p>"']);
  assert.ok(asked.every((url) => new URL(url).searchParams.get("live-check") === "abc123"), "every read names the commit, so no cache answers");
  assert.equal(asked.length, 5, "the root read twice, the stale index three times");
  const missing = await checkLive(["https://example.org/"], site, "abc123", { ...options, fetchText: async () => ({ status: 404, text: "" }) });
  assert.deepEqual(missing, ["https://example.org/ (index.html) is not the committed file: HTTP 404"]);
});

// The script itself against a local server that serves this checkout, then the same with one page changed.
async function serve(change) {
  const server = createServer(async (request, response) => {
    const path = decodeURIComponent(new URL(request.url, "http://x").pathname).replace(/^\//, "");
    const file = path === "" || path.endsWith("/") ? `${path}index.html` : path;
    try {
      const text = await readFile(new URL(file, root), "utf8");
      response.writeHead(200).end(change?.[file] ? change[file](text) : text);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((done) => server.close(done)) };
}
const run = (origin) =>
  new Promise((done) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL("scripts/check-live-site.mjs", root))], { env: { ...process.env, LIVE_SITE_ORIGIN: origin, LIVE_CHECK_INTERVAL_MS: "0" } });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("close", (code) => done({ code, output }));
  });

test("live check: the script passes a site serving this checkout and fails one serving an older storefront", async () => {
  const same = await serve();
  try {
    const { code, output } = await run(same.origin);
    assert.equal(code, 0, output);
    assert.match(output, /All \d+ addresses on https:\/\/gabs-utilities\.com serve the files at local\./);
  } finally {
    await same.close();
  }
  const stale = await serve({ "index.html": (text) => text.replace("<title>", "<title>Old ") });
  try {
    const { code, output } = await run(stale.origin);
    assert.equal(code, 1, output);
    assert.match(output, /::error::https:\/\/gabs-utilities\.com\/ \(index\.html\) is not the committed file: line \d+: committed "[^"]*<title>/);
    assert.match(output, /1 of \d+ addresses on https:\/\/gabs-utilities\.com are not the committed files\./);
  } finally {
    await stale.close();
  }
});

test("live check: a failed deploy stops it, and the message says the site was not read", async () => {
  const runs = async () => [{ name: PAGES_WORKFLOW, status: "completed", conclusion: "failure" }];
  await assert.rejects(waitForPages("0123456789abcdef", runs, { consequence: "the live site was not read" }), /ended "failure"; the live site was not read\./);
  await assert.rejects(waitForPages("0123456789abcdef", runs), /ended "failure"; nothing was sent to IndexNow\./);
});
