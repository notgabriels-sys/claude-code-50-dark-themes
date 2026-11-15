import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { addressProblems, breadcrumbProblems, expectedBreadcrumb, servedAddress, statedAddresses } from "./page-addresses.mjs";

const SITE = "https://gabs-utilities.com/";
const page = (slug) => `https://gabs-utilities.com/theme/${slug}/`;
const head = (canonical, ogUrl = canonical) =>
  `<!doctype html><head><link rel="canonical" href="${canonical}">\n<meta property="og:url" content="${ogUrl}"></head>`;
const webPage = (address) => ({ "@context": "https://schema.org", "@graph": [{ "@type": "WebPage", "@id": address, url: address }] });

test("page addresses: Pages serves a directory's index at the directory and any other page at its name", () => {
  assert.equal(servedAddress("index.html", SITE), SITE);
  assert.equal(servedAddress("theme/index.html", SITE), "https://gabs-utilities.com/theme/");
  assert.equal(servedAddress("theme/acid/index.html", SITE), page("acid"));
  assert.equal(servedAddress("familiars.html", SITE), "https://gabs-utilities.com/familiars.html");
  // A page whose name only ends like an index is served at its own name.
  assert.equal(servedAddress("theme/notindex.html", SITE), "https://gabs-utilities.com/theme/notindex.html");
  assert.throws(() => servedAddress("index.html", "https://gabs-utilities.com/sub/"), /bare origin/);
});

test("page addresses: a page whose canonical link, og:url and page node all name it passes", () => {
  const path = "theme/acid/index.html";
  assert.deepEqual(addressProblems(path, head(page("acid")), [webPage(page("acid"))], SITE), []);
  assert.deepEqual(addressProblems("index.html", head(SITE), [], SITE), []);
});

test("page addresses: another page's address, or this one spelled another way, is refused in each place", () => {
  const path = "theme/acid/index.html";
  for (const wrong of [page("afterglow"), "https://gabs-utilities.com/theme/acid", "http://gabs-utilities.com/theme/acid/", "https://gabs-utilities.com/theme/acid/index.html", "https://www.gabs-utilities.com/theme/acid/", "/theme/acid/"]) {
    const canonical = addressProblems(path, head(wrong, page("acid")), [], SITE);
    assert.equal(canonical.length, 1, wrong);
    assert.match(canonical[0], /gives its canonical link as .*but GitHub Pages serves it at https:\/\/gabs-utilities\.com\/theme\/acid\//);
    const og = addressProblems(path, head(page("acid"), wrong), [], SITE);
    assert.equal(og.length, 1, wrong);
    assert.match(og[0], /gives its og:url as/);
  }
  const node = addressProblems(path, head(page("acid")), [webPage(page("afterglow"))], SITE);
  assert.deepEqual(node.map((problem) => problem.match(/gives (\S+)/)[1]), ["@id", "url"]);
  const howTo = { "@context": "https://schema.org", "@type": "HowTo", url: SITE };
  assert.match(addressProblems("guide.html", head("https://gabs-utilities.com/guide.html"), [howTo], SITE).join("\n"), /HowTo node gives url "https:\/\/gabs-utilities\.com\/"/);
  // A thing the page is about, not the page itself, keeps its own address.
  // An equivalent spelling is the same address; a page node that names no address states nothing wrong.
  assert.deepEqual(addressProblems("index.html", head("https://gabs-utilities.com", "HTTPS://Gabs-Utilities.com/"), [{ "@type": "WebPage", name: "x" }], SITE), []);
  const plugin = { "@context": "https://schema.org", "@type": "SoftwareApplication", "@id": `${SITE}#plugin`, url: SITE };
  assert.deepEqual(addressProblems("theme/acid/index.html", head(page("acid")), [plugin], SITE), []);
});

test("page addresses: a missing or doubled canonical link or og:url is refused", () => {
  const path = "theme/acid/index.html";
  assert.match(addressProblems(path, `<meta property="og:url" content="${page("acid")}">`, [], SITE).join("\n"), /has no canonical link/);
  assert.match(addressProblems(path, `<link rel="canonical" href="${page("acid")}">`, [], SITE).join("\n"), /has no og:url/);
  assert.match(addressProblems(path, head(page("acid")) + `<link rel="canonical" href="${page("acid")}">`, [], SITE).join("\n"), /states 2 canonical links/);
});

test("page addresses: tags are read as a browser reads them, rel as a token list and comments skipped", () => {
  const stated = statedAddresses(
    `<!-- <link rel="canonical" href="https://elsewhere.example/"> --><LINK REL="alternate Canonical" HREF="${page("acid")}">` +
      `<meta property="OG:URL" content="${page("acid")}"><meta name="robots" content="noindex,follow">`,
  );
  assert.deepEqual(stated, { canonical: [page("acid")], ogUrl: [page("acid")], noindex: true });
  assert.deepEqual(statedAddresses('<link rel="canonicalx" href="x"><meta name="robots" content="index">'), { canonical: [], ogUrl: [], noindex: false });
  // Inside an <svg>, a link element is SVG's, not HTML's, and no crawler reads it as the page's canonical.
  assert.deepEqual(statedAddresses(`<svg><link rel="canonical" href="${page("afterglow")}"/></svg>`).canonical, []);
});

test("page addresses: an unindexed page or a screenshot asset may state none, but what it states is held", () => {
  const imprint = '<meta name="robots" content="noindex">';
  assert.deepEqual(addressProblems("impressum.html", imprint, [], SITE), []);
  assert.match(addressProblems("impressum.html", imprint + '<link rel="canonical" href="https://gabs-utilities.com/">', [], SITE).join("\n"), /gives its canonical link as "https:\/\/gabs-utilities\.com\/"/);
  assert.match(addressProblems("impressum.html", "<p>no robots meta</p>", [], SITE).join("\n"), /has no canonical link/);
  assert.deepEqual(addressProblems("assets/social-preview.html", "<p>card</p>", [], SITE), []);
  assert.match(addressProblems("assets/social-preview.html", '<meta property="og:url" content="https://gabs-utilities.com/">', [], SITE).join("\n"), /og:url as/);
});

test("page addresses: a theme page's breadcrumb is the site, the theme index and itself under the theme file's name", () => {
  const path = "theme/vu-meter/index.html";
  const trail = (items) => [{ "@context": "https://schema.org", "@graph": [webPage(page("vu-meter"))["@graph"][0], { "@type": "BreadcrumbList", itemListElement: items }] }];
  const right = expectedBreadcrumb(SITE, "VU Meter", page("vu-meter"));
  assert.deepEqual(breadcrumbProblems(path, trail(right), SITE, "VU Meter"), []);
  assert.deepEqual(right.map(({ item }) => item), [SITE, "https://gabs-utilities.com/theme/", page("vu-meter")]);

  const short = right.filter(({ position }) => position !== 2);
  assert.match(breadcrumbProblems(path, trail(short), SITE, "VU Meter")[0], /BreadcrumbList reads .*it must read the site, the theme index and the page itself/);
  const renamed = right.map((item) => (item.position === 3 ? { ...item, name: "Vu Meter" } : item));
  assert.equal(breadcrumbProblems(path, trail(renamed), SITE, "VU Meter").length, 1);
  const elsewhere = right.map((item) => (item.position === 3 ? { ...item, item: page("acid") } : item));
  assert.equal(breadcrumbProblems(path, trail(elsewhere), SITE, "VU Meter").length, 1);
  const extraKey = right.map((item) => ({ ...item, url: item.item }));
  assert.equal(breadcrumbProblems(path, trail(extraKey), SITE, "VU Meter").length, 1);

  assert.match(breadcrumbProblems(path, [], SITE, "VU Meter")[0], /carries 0 BreadcrumbLists/);
  const twice = [...trail(right), { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: right }];
  assert.match(breadcrumbProblems(path, twice, SITE, "VU Meter")[0], /carries 2 BreadcrumbLists/);
});

test("page addresses: verify holds every served page and every theme file's page to these rules", async () => {
  const source = await readFile(new URL("./verify.mjs", import.meta.url), "utf8");
  assert.match(source, /for \(const page of linkedPages\) \{\n  const markup = await readPage\(page\);\n  const blocks = ldJsonBlocks\(page, markup\)\.map\(\(block\) => block\.value\);\n  for \(const problem of pageAddresses\.addressProblems\(/);
  assert.match(source, /\[\[root, files\], \[vol2ThemesRoot, vol2Files\]\]/);
  assert.match(source, /pageAddresses\.breadcrumbProblems\(page, blocks, siteUrl, name\)/);
});
