import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { INDEXNOW_KEY, PAGES_WORKFLOW, indexNowPayload, keyFileProblem, submit, waitForPages } from "./submit-indexnow.mjs";

const sitemap = (...locs) => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset>${locs.map((loc) => `<url><loc>${loc}</loc></url>`).join("")}</urlset>\n`;

// A stand-in IndexNow endpoint that records what it was sent and answers with the given status.
async function endpoint(status) {
  const received = [];
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      received.push({ method: request.method, type: request.headers["content-type"], body: JSON.parse(body) });
      response.writeHead(status).end(status >= 400 ? "Forbidden: key not valid" : "");
    });
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  return { url: `http://127.0.0.1:${server.address().port}/indexnow`, received, close: () => new Promise((done) => server.close(done)) };
}

test("indexnow: the payload is every sitemap address on the one host, with the key and where it lives", () => {
  const payload = indexNowPayload(sitemap("https://example.org/", "https://example.org/theme/acid/", "https://example.org/"), "example.org", "KEY1");
  assert.deepEqual(payload, {
    host: "example.org",
    key: "KEY1",
    keyLocation: "https://example.org/KEY1.txt",
    urlList: ["https://example.org/", "https://example.org/theme/acid/"],
  });
});

test("indexnow: a sitemap address off the host, not https, or not an address stops the submission", () => {
  assert.throws(() => indexNowPayload(sitemap("https://example.org/", "https://other.example/x"), "example.org"), /https:\/\/other\.example\/x, which is not on https:\/\/example\.org\//);
  assert.throws(() => indexNowPayload(sitemap("http://example.org/"), "example.org"), /not on https:\/\/example\.org\//);
  assert.throws(() => indexNowPayload(sitemap("not an address"), "example.org"), /"not an address", which is not an address/);
  assert.throws(() => indexNowPayload("<urlset></urlset>", "example.org"), /lists no <loc>/);
});

test("indexnow: the key file must hold the key and nothing else", () => {
  assert.equal(keyFileProblem(`${INDEXNOW_KEY}\n`), null);
  assert.match(keyFileProblem("something else"), /must hold the key/);
  assert.match(keyFileProblem(`${INDEXNOW_KEY} ${INDEXNOW_KEY}`), /must hold the key/);
});

test("indexnow: the repository's key file, sitemap and domain make a valid submission", async () => {
  const root = new URL("../", import.meta.url);
  assert.equal(keyFileProblem(await readFile(new URL(`${INDEXNOW_KEY}.txt`, root), "utf8")), null);
  const host = (await readFile(new URL("CNAME", root), "utf8")).trim();
  const payload = indexNowPayload(await readFile(new URL("sitemap.xml", root), "utf8"), host);
  assert.ok(payload.urlList.includes(`https://${host}/`));
  assert.ok(payload.urlList.length > 60);
});

test("indexnow: it waits for the Pages deploy of the commit, and sends nothing when that deploy fails or never ends", async () => {
  const sleep = async () => {};
  const sequence = [[], [{ name: "Verify themes and shop", status: "completed", conclusion: "failure" }, { name: PAGES_WORKFLOW, status: "in_progress" }], [{ name: PAGES_WORKFLOW, status: "completed", conclusion: "success" }]];
  let calls = 0;
  await waitForPages("abc123", async () => sequence[Math.min(calls++, sequence.length - 1)], { sleep });
  assert.equal(calls, 3, "it read the runs until the Pages run succeeded, ignoring other workflows");

  await assert.rejects(waitForPages("abc123", async () => [{ name: PAGES_WORKFLOW, status: "completed", conclusion: "failure" }], { sleep }), /ended "failure"; nothing was sent/);
  await assert.rejects(waitForPages("abc123", async () => [], { sleep, attempts: 3 }), /did not finish in time/);
});

test("indexnow: 200 and 202 are success, anything else fails with IndexNow's own answer", async () => {
  for (const status of [200, 202]) {
    const server = await endpoint(status);
    try {
      assert.equal(await submit({ host: "h", key: "k", keyLocation: "https://h/k.txt", urlList: ["https://h/"] }, server.url), status);
      assert.equal(server.received[0].method, "POST");
      assert.match(server.received[0].type, /^application\/json/);
    } finally {
      await server.close();
    }
  }
  const refusing = await endpoint(403);
  try {
    await assert.rejects(submit({ host: "h", key: "k", keyLocation: "https://h/k.txt", urlList: ["https://h/"] }, refusing.url), /HTTP 403 for 1 addresses: Forbidden: key not valid/);
  } finally {
    await refusing.close();
  }
});

test("indexnow: run as a command, it sends the repository's sitemap to the endpoint it is given", async () => {
  const server = await endpoint(202);
  try {
    const script = fileURLToPath(new URL("./submit-indexnow.mjs", import.meta.url));
    const child = spawn(process.execPath, [script], { env: { ...process.env, INDEXNOW_ENDPOINT: server.url }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    const code = await new Promise((done) => child.on("close", done));
    assert.equal(code, 0);
    assert.match(stdout, /IndexNow answered HTTP 202 for \d+ addresses on gabs-utilities\.com\./);
    const [{ body }] = server.received;
    assert.equal(body.key, INDEXNOW_KEY);
    assert.equal(body.keyLocation, `https://gabs-utilities.com/${INDEXNOW_KEY}.txt`);
    assert.ok(body.urlList.includes("https://gabs-utilities.com/theme/"));
  } finally {
    await server.close();
  }
});
