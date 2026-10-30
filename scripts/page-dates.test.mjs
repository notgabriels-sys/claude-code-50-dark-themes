import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { DATED_PAGES, dateMarker, isCalendarDate, lastContentChange, latestToday, longDate, pageDateProblems, statedDates } from "./page-dates.mjs";

const root = new URL("../", import.meta.url);
const projectRoot = fileURLToPath(root);
const TODAY = "2026-10-24";
const dayBefore = (iso) => new Date(Date.parse(`${iso}T00:00:00Z`) - 86400e3).toISOString().slice(0, 10);
const dayAfter = (iso) => new Date(Date.parse(`${iso}T00:00:00Z`) + 86400e3).toISOString().slice(0, 10);

// A page as the two dated pages are built: one dated JSON-LD entity, a FAQPage block beside it
// without dates, and the byline. Each field can be replaced to break one thing.
function page({ published = "2026-08-24", modified = "2026-10-24", byline, open = '<p class="byline">', close = "</p>", extraHead = "", faq = true } = {}) {
  const bylineHtml =
    byline ??
    (modified === published
      ? `By Gabs Utilities · published <time datetime="${published}">${longDate(published)}</time> · Free to read`
      : `By Gabs Utilities · published <time datetime="${published}">${longDate(published)}</time> · updated <time datetime="${modified}">${longDate(modified)}</time> · Free to read`);
  const entity = { "@context": "https://schema.org", "@type": "TechArticle", headline: "x", datePublished: published, dateModified: modified };
  const faqBlock = faq ? `<script type="application/ld+json">{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[]}</script>` : "";
  return `<!doctype html>\n<html>\n<head>\n<script type="application/ld+json">${JSON.stringify(entity)}</script>\n${faqBlock}\n${extraHead}\n</head>\n<body>\n${open}${bylineHtml}${close}\n<p>Install 62 themes; the August update ships 3 files and 1 guide.</p>\n</body>\n</html>\n`;
}
const problems = (html) => pageDateProblems(html, { today: TODAY });
const ok = (html, label) => assert.deepEqual(problems(html), [], label);
const bad = (html, pattern, label) => {
  const found = problems(html);
  assert.ok(found.length > 0, `${label}: a problem is reported`);
  assert.match(found[0], pattern, label);
};

test("dates: a calendar date is a real one written YYYY-MM-DD, its words are day, month, year, and today is the latest date anywhere", () => {
  assert.equal(isCalendarDate("2026-10-24"), true);
  assert.equal(isCalendarDate("2026-02-30"), false, "February has no 30th");
  assert.equal(isCalendarDate("2026-13-01"), false);
  assert.equal(isCalendarDate("2026-1-5"), false, "two digits each");
  assert.equal(isCalendarDate("24 October 2026"), false);
  assert.equal(isCalendarDate(undefined), false);
  assert.equal(longDate("2026-10-24"), "24 October 2026");
  assert.equal(longDate("2026-08-04"), "4 August 2026", "no leading zero on the day");
  const latest = latestToday();
  assert.match(latest, /^\d{4}-\d{2}-\d{2}$/);
  const utc = new Date().toISOString().slice(0, 10);
  assert.ok(latest >= utc, "the latest date in effect anywhere is today in UTC or the day after");
  assert.ok(Date.parse(latest) - Date.parse(utc) <= 86400e3, "and never more than one day after");
  assert.equal(latestToday(Date.parse("2026-10-24T09:59:59Z")), "2026-10-24", "before 10:00 UTC no zone has reached the next day");
  assert.equal(latestToday(Date.parse("2026-10-24T10:00:00Z")), "2026-10-25", "from 10:00 UTC the day after has begun at UTC+14");
  assert.equal(latestToday(Date.parse("2026-10-24T22:30:00Z")), "2026-10-25", "so a Berlin author's date after local midnight is not a future date");
});

test("pageDateProblems: a page whose schema and byline agree passes, modified or not, however the markup is written", () => {
  ok(page(), "published and later modified, both shown");
  ok(page({ published: "2026-08-24", modified: "2026-08-24" }), "never modified: one date, no update");
  ok(page({ published: TODAY, modified: TODAY }), "published today");
  ok(page({ modified: TODAY }), "modified today");
  ok(page({ faq: false }), "no FAQ block beside the entity");
  ok(page({ open: '<p class="byline" id="byline">' }), "a byline with another attribute");
  ok(page({ open: '<p class="lead byline">' }), "a byline with another class before");
  ok(page({ open: '<div class="byline small">', close: "</div>" }), "a byline that is a div with another class after");
  ok(page({ open: "<p class='byline'>" }), "a single-quoted class");
  ok(page({ open: "<P CLASS=byline>", close: "</P>" }), "an uppercase tag and an unquoted class");
  ok(page({ byline: `published <time datetime='2026-08-24'>24 August 2026</time> · updated <time datetime='2026-10-24'>24 October 2026</time>` }), "single-quoted datetime attributes");
  ok(page({ byline: `published <time itemprop="datePublished" datetime="2026-08-24">24 August 2026</time> · updated <time DATETIME=2026-10-24 itemprop="dateModified">24 October 2026</time>` }), "datetime after another attribute, in capitals, unquoted");
  ok(page({ byline: `published <time datetime="2026-08-24">\n  24 August 2026\n</time> · updated <time datetime="2026-10-24">24 October 2026</time>` }), "a formatter's line breaks inside <time>");
  ok(page({ byline: `published <time datetime="2026-08-24">24&nbsp;August&nbsp;2026</time> · updated <time datetime="2026-10-24">24\u00a0October\u00a02026</time>` }), "non-breaking spaces inside <time>, as an entity and as the character");
  ok(page({ byline: `published <time datetime="2026-08-24">24 August 2026</time> · Updated <time datetime="2026-10-24">24 October 2026</time>` }), "Updated with a capital");
  ok(page({ byline: `Published <time datetime="2026-08-24">24 August 2026</time> · updated <time datetime="2026-10-24">24 October 2026</time>` }), "Published with a capital, and no author");
  ok(page({ byline: `published <time datetime="2026-08-24">24 August 2026</time>&nbsp;·&nbsp;updated <time datetime="2026-10-24">24 October 2026</time>` }), "non-breaking spaces around the separator");
  ok(page({ extraHead: `<meta property="article:published_time" content="2026-08-24"><meta content="2026-10-24T09:30:00+02:00" property="article:modified_time">` }), "Open Graph dates that name the same days, in either attribute order");
  ok(page().replace("</body>", `<script>const d = "2026-08-24";</script><style>/* 24 August 2026 */</style></body>`), "a date in a script or a style sheet is not shown to anyone");
  ok(page().replace(/<script type="application\/ld\+json">\{[^<]*TechArticle[^<]*<\/script>\s*<script type="application\/ld\+json">\{[^<]*FAQPage[^<]*<\/script>/, (both) => {
    const [entity, faq] = [...both.matchAll(/<script[^>]*>([^<]*)<\/script>/g)].map((match) => match[1]);
    return `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[${entity},${faq}]}</script>`;
  }), "one block carrying both entities in a @graph");
  ok(page().replace(/<script type="application\/ld\+json">(\{[^<]*TechArticle[^<]*)<\/script>/, '<script type="application/ld+json">[$1]</script>'), "a top-level array");
});

test("pageDateProblems: the JSON-LD must carry one dated entity with possible dates, wherever and however the blocks are written", () => {
  bad(page({ extraHead: `<script type="application/ld+json">{"@type":"Article","dateModified":"2026-10-24"}</script>` }), /carries 2 JSON-LD entities with a datePublished or dateModified; exactly one/, "two dated blocks");
  bad(page({ extraHead: `<script type="application/LD+JSON">{"@type":"Article","dateModified":"2026-08-24"}</script>` }), /carries 2 JSON-LD entities/, "a second block with the MIME type in capitals");
  bad(page({ extraHead: `<SCRIPT TYPE="application/ld+json">{"@type":"Article","dateModified":"2026-08-24"}</SCRIPT>` }), /carries 2 JSON-LD entities/, "a second block with the tag in capitals");
  bad(page({ extraHead: `<script type=application/ld+json>{"@type":"Article","dateModified":"2026-08-24"}</script>` }), /carries 2 JSON-LD entities/, "a second block with the type unquoted");
  bad(page({ extraHead: `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Article","dateModified":"2026-08-24"}]}</script>` }), /carries 2 JSON-LD entities/, "a stale entity inside a @graph");
  bad(page({ extraHead: `<script type="application/ld+json">[{"@type":"Article","datePublished":"2026-08-24","dateModified":"2026-08-24"}]</script>` }), /carries 2 JSON-LD entities/, "a stale entity inside an array");
  bad(page().replace('"dateModified":"2026-10-24"', '"dateModified":"2026-10-24","mainEntity":{"@type":"Article","datePublished":"2026-08-24","dateModified":"2026-08-24"}'), /carries 2 JSON-LD entities/, "a stale entity nested in the page's own");
  bad(page().replace(/"datePublished":"[^"]*",/, "").replace(/"dateModified":"[^"]*"/, '"name":"x"'), /carries 0 JSON-LD entities with a datePublished or dateModified/, "no dated entity");
  bad(page().replace(/"dateModified":"[^"]*"/, '"dateModified":"2026-10-24", bad'), /carries JSON-LD that does not parse/, "unparseable JSON-LD");
  bad(page().replace(/"dateModified":"2026-10-24"/, '"dateModified":"24 October 2026"'), /JSON-LD dateModified is "24 October 2026"; this repository writes it as a calendar date, YYYY-MM-DD/, "a date in words in the schema");
  bad(page().replace(/"dateModified":"2026-10-24"/, '"dateModified":"2026-02-30"'), /JSON-LD dateModified is "2026-02-30"; this repository writes it as a calendar date/, "an impossible date");
  bad(page().replace(/"dateModified":"2026-10-24"/, '"dateModified":"2026-10-24T10:00:00Z"'), /JSON-LD dateModified is "2026-10-24T10:00:00Z"; this repository writes it as a calendar date, YYYY-MM-DD/, "a timestamp where this repository writes a date");
  bad(page().replace(/"datePublished":"2026-08-24",/, ""), /JSON-LD datePublished is null; this repository writes it as a calendar date/, "datePublished missing");
  bad(page({ modified: "2026-10-25" }), /JSON-LD dateModified 2026-10-25 is after 2026-10-24, the latest calendar date now in effect anywhere; a page is not published or modified in the future/, "modified tomorrow");
  bad(page({ published: "2026-10-25", modified: "2026-10-25" }), /JSON-LD datePublished 2026-10-25 is after 2026-10-24/, "published tomorrow");
  bad(page({ published: "2026-10-24", modified: "2026-08-24", byline: `published <time datetime="2026-10-24">24 October 2026</time> · updated <time datetime="2026-08-24">24 August 2026</time>` }), /JSON-LD dateModified 2026-08-24 is before datePublished 2026-10-24/, "modified before published");
});

test("pageDateProblems: the byline writes the same dates as <time> elements and nothing in figures beside them", () => {
  bad(page({ byline: "By Gabs Utilities · 24 August 2026 · Free to read" }), /byline writes "24" outside a <time> element \(the byline reads "By Gabs Utilities \\u00b7 24 August 2026 \\u00b7 Free to read"\); a date in the byline is a <time datetime="YYYY-MM-DD"> element, and nothing else in the byline is written in figures/, "the old plain-text byline");
  bad(page({ byline: `By Gabs Utilities · published <time datetime="2026-08-24">24 August 2026</time> · updated October 2026` }), /byline writes "2026" outside a <time> element/, "an update written in plain words");
  bad(page({ byline: `published <time datetime="2026-08-24">24 August 2026</time> · updated <time datetime="2026-10-24">24 October 2026</time> · 2026-10-24` }), /byline writes "2026-10-24" outside a <time> element/, "an ISO date as text");
  bad(page({ byline: `published <time datetime="2026-08-24">24 August 2026</time> · updated <time datetime="2026-10-24">24 October 2026</time> · reviewed 24&nbsp;Aug&nbsp;2026` }), /byline writes "24" outside a <time> element/, "an abbreviated date held together with entities");
  bad(page({ byline: `published <time datetime="2026-08-24">24 August 2026</time> · updated <time datetime="2026-10-24">24 October 2026</time> · reviewed 24.08.2026` }), /byline writes "24.08.2026" outside a <time> element/, "a date in figures with dots");
  bad(page({ byline: `published <time datetime="2026-08-24">24 August 2026</time> · updated <time datetime="2026-10-24">24 October 2026</time> · first draft 24 Au\u200bgust 2026` }), /byline writes "24" outside a <time> element/, "a month name split by an invisible character");
  bad(page({ byline: `published <time datetime="2026-08-24">24 August 2026</time> · updated <time datetime="2026-10-24">24 October 2026</time> · first published 2025` }), /byline writes "2025" outside a <time> element/, "a bare year");
  bad(page({ byline: `published <time datetime="2026-08-24">24 August 2026</time> · updated <time datetime="2026-10-24">24 October 2026</time> · you may 1-click install` }), /byline writes "1" outside a <time> element/, "a number that is not a date: the byline is for dates");
  bad(page({ byline: `published <time>24 August 2026</time> · updated <time datetime="2026-10-24">24 October 2026</time>` }), /byline has a <time> element with no datetime attribute; write datetime="YYYY-MM-DD"/, "a <time> without datetime");
  bad(page({ byline: `published <time datetime="August 2026">24 August 2026</time> · updated <time datetime="2026-10-24">24 October 2026</time>` }), /byline has a <time> element without a calendar date in datetime \("August 2026"\)/, "a datetime in words");
  bad(page({ byline: `published <time data-datetime="2026-08-24">24 August 2026</time> · updated <time datetime="2026-10-24">24 October 2026</time>` }), /byline has a <time> element with no datetime attribute; write datetime="YYYY-MM-DD"/, "data-datetime is not datetime");
  bad(page({ byline: `published <time datetime="2026-08-24">24 August 2026</time> · updated <time data-datetime="2026-10-24" datetime="2026-01-01">24 October 2026</time>` }), /byline <time datetime="2026-01-01"> shows "24 October 2026"; that date is written "1 January 2026"/, "a decoy attribute beside the real one");
  bad(page({ byline: `published <time datetime="2026-08-24">24 Aug 2026</time> · updated <time datetime="2026-10-24">24 October 2026</time>` }), /byline <time datetime="2026-08-24"> shows "24 Aug 2026"; that date is written "24 August 2026"/, "an abbreviated month");
  bad(page({ byline: `published <time datetime="2026-08-24">24 August 2026</time> · updated <time datetime="2026-10-24">24 october 2026</time>` }), /shows "24 october 2026"; that date is written "24 October 2026"/, "a lowercase month");
  bad(page({ byline: `published <time datetime="2026-08-24">24 August 2026</time> · updated <time datetime="2026-10-24">24 October 2025</time>` }), /shows "24 October 2025"; that date is written "24 October 2026"/, "words that disagree with datetime");
  ok(page({ byline: `published <time datetime="2026-08-24">24 August 2026</time> · updated <time datetime="2026-10-24">24 Octo\u00adber 2026</time>` }), "a soft hyphen inside the month is not shown, so the words still agree");
  bad(page({ byline: `published <time datetime="2026-08-24">24 August 2026</time> · updated <time datetime="2026-10-24">24 Oct\u043eber 2026</time>` }), /shows "24 Oct\\u043eber 2026"; that date is written "24 October 2026"/, "a look-alike letter is shown escaped, so the two strings do not read alike");
  bad(page({ byline: `published <time datetime="2026-10-24">24 October 2026</time> · updated <time datetime="2026-10-24">24 October 2026</time>` }), /byline's first date is 2026-10-24 where JSON-LD datePublished is 2026-08-24; the byline opens with the publication date/, "the modified date shown first");
  bad(page({ byline: "By Gabs Utilities · Free to read" }), /byline shows no <time> element; the publication date is written "published <time datetime="2026-08-24">24 August 2026<\/time>"/, "no date at all");
  bad(page({ byline: `<time datetime="2026-08-24">24 August 2026</time> · updated <time datetime="2026-10-24">24 October 2026</time>` }), /byline introduces the publication date with ""; the word before that date is "published", so a reader knows which date is which/, "no word before the publication date");
  bad(page({ byline: `By Gabs Utilities · <time datetime="2026-08-24">24 August 2026</time> · updated <time datetime="2026-10-24">24 October 2026</time>` }), /byline introduces the publication date with "By Gabs Utilities ·"; the word before that date is "published"/, "the publication date unlabelled after the author");
  bad(page({ byline: `posted <time datetime="2026-08-24">24 August 2026</time> · updated <time datetime="2026-10-24">24 October 2026</time>` }), /byline introduces the publication date with "posted"; the word before that date is "published"/, "another word for it");
  bad(page({ byline: `published: <time datetime="2026-08-24">24 August 2026</time> · updated <time datetime="2026-10-24">24 October 2026</time>` }), /byline introduces the publication date with "published:"/, "the word with a colon is another lead");
  bad(page({ byline: `published <time datetime="2026-08-24">24 August 2026</time> · Free to read` }), /byline shows no update although JSON-LD dateModified \(2026-10-24\) is after datePublished \(2026-08-24\); write "· updated <time datetime="2026-10-24">24 October 2026<\/time>"/, "an update in the schema the byline hides");
  bad(page({ published: "2026-08-24", modified: "2026-08-24", byline: `published <time datetime="2026-08-24">24 August 2026</time> · updated <time datetime="2026-08-24">24 August 2026</time>` }), /byline shows a second date \(2026-08-24\) although JSON-LD dateModified equals datePublished/, "an update the schema does not know");
  bad(page({ byline: `published <time datetime="2026-08-24">24 August 2026</time> · updated <time datetime="2026-10-19">19 October 2026</time>` }), /byline's update date is 2026-10-19 where JSON-LD dateModified is 2026-10-24; the two are one date/, "update dates that differ");
  bad(page({ byline: `published <time datetime="2026-08-24">24 August 2026</time> · <time datetime="2026-10-24">24 October 2026</time>` }), /byline introduces the update date with "·"; it is written "· updated "/, "an update date without the word");
  bad(page({ byline: `published <time datetime="2026-08-24">24 August 2026</time> · revised <time datetime="2026-10-24">24 October 2026</time>` }), /introduces the update date with "· revised"/, "another word for it");
  bad(page({ byline: `published <time datetime="2026-08-24">24 August 2026</time> · last updated <time datetime="2026-10-24">24 October 2026</time>` }), /introduces the update date with "· last updated"; it is written "· updated "/, "more words than the one");
  bad(page({ byline: `published <time datetime="2026-08-24">24 August 2026</time> updated <time datetime="2026-10-24">24 October 2026</time>` }), /introduces the update date with "updated"; it is written "· updated "/, "the separator dropped");
  bad(page({ byline: `published <time datetime="2026-08-24">24 August 2026</time> – updated <time datetime="2026-10-24">24 October 2026</time>` }), /introduces the update date with "– updated"; it is written "· updated "/, "another separator");
  bad(page({ byline: `published <time datetime="2026-08-24">24 August 2026</time> · Free to read · updated <time datetime="2026-10-24">24 October 2026</time>` }), /introduces the update date with "· Free to read · updated"; it is written "· updated "/, "text before the word");
  bad(page({ byline: `published <time datetime="2026-08-24">24 August 2026</time> · updated on <time datetime="2026-10-24">24 October 2026</time>` }), /introduces the update date with "· updated on"; it is written "· updated "/, "text after the word");
  bad(page({ byline: `published <time datetime="2026-08-24">24 August 2026</time> · updated <time datetime="2026-10-24">24 October 2026</time> · <time datetime="2026-10-24">24 October 2026</time>` }), /byline shows 3 dates; two at most/, "three dates");
  bad(page().replace('<p class="byline">', '<p class="byline">x</p><p class="byline">'), /has 2 elements of class "byline"; exactly one/, "two bylines");
  bad(page().replace("</body>", '<p class="byline small">Published 24 August 2026 · last updated 24 August 2026</p></body>'), /has 2 elements of class "byline"/, "a second byline styled by another class too");
  bad(page().replace("</body>", "<div class='byline'>Updated 24 August 2026</div></body>"), /has 2 elements of class "byline"/, "a second byline as a single-quoted div");
  bad(page().replace("</body>", '<span id="meta" class="byline">Updated 24 August 2026</span></body>'), /has 2 elements of class "byline"/, "a second byline with the class after another attribute");
  bad(page().replace('class="byline"', 'class="meta"'), /has 0 elements of class "byline"/, "no byline");
  bad(page().replace('class="byline"', 'class="bylines"'), /has 0 elements of class "byline"/, "a class that only begins with the word is another class");
});

test("pageDateProblems: no date lives anywhere on the page but the byline and the JSON-LD", () => {
  bad(page().replace("</body>", '<footer><p>Last updated <time datetime="2026-08-24">24 August 2026</time></p></footer></body>'), /writes a <time> element outside the byline \("<time datetime=\\"2026-08-24\\">24 August 2026<\/time>"\); the page's dates live in the byline/, "a <time> in the footer");
  bad(page().replace("</body>", '<footer><p class="fine">Last updated 24 August 2026.</p></footer></body>'), /writes a date in its text outside the byline \("24 August 2026"\); the page's dates live in the byline, where they are held to the JSON-LD, so move it there or take it out/, "a date in words in the footer");
  bad(page().replace("</body>", "<p>Since Aug 24, 2026 the pack is free.</p></body>"), /writes a date in its text outside the byline \("Aug 24, 2026"\)/, "month first, abbreviated");
  bad(page().replace("</body>", "<p>Stand 24.08.2026.</p></body>"), /writes a date in its text outside the byline \("24.08.2026"\)/, "figures with dots");
  bad(page().replace("</body>", "<p>Released 2026-08-24.</p></body>"), /writes a date in its text outside the byline \("2026-08-24"\)/, "an ISO date in text");
  bad(page().replace("</body>", "<p>Released 24&nbsp;August&nbsp;2026.</p></body>"), /writes a date in its text outside the byline \("24 August 2026"\)/, "a date held together with entities");
  bad(page({ extraHead: `<meta property="article:modified_time" content="2026-08-24">` }), /<meta property="article:modified_time"> says "2026-08-24" where JSON-LD dateModified is 2026-10-24; the two name one day, moved together/, "a stale Open Graph modified time");
  bad(page({ extraHead: `<meta property="article:published_time" content="2026-08-25T00:00:00Z">` }), /<meta property="article:published_time"> says "2026-08-25T00:00:00Z" where JSON-LD datePublished is 2026-08-24/, "an Open Graph published time a day off");
});

test("dateMarker: what makes a file a dated page, so a new one is held to the rule", () => {
  assert.equal(dateMarker(page()), "JSON-LD datePublished");
  assert.equal(dateMarker(`<html><body><p class="x byline">By us</p></body></html>`), 'an element of class "byline"');
  assert.equal(dateMarker(`<html><body><p>Posted <time datetime="2026-08-24">24 August 2026</time></p></body></html>`), "a <time> element");
  assert.equal(dateMarker(`<html><head><meta property="article:modified_time" content="2026-08-24"></head></html>`), "an Open Graph article:modified_time");
  assert.equal(dateMarker(`<html><head><script type="application/ld+json">{"@type":"WebSite","name":"x"}</script></head><body><p class="bylines">24 August 2026</p></body></html>`), null, "undated JSON-LD, another class, and a date in prose are not markers");
});

test("statedDates: the one pair of calendar dates a page states, or null", () => {
  assert.deepEqual(statedDates(page()), { published: "2026-08-24", modified: "2026-10-24" });
  assert.equal(statedDates(page({ extraHead: `<script type="application/ld+json">{"@type":"Article","dateModified":"2026-10-24"}</script>` })), null, "two dated entities");
  assert.equal(statedDates(page().replace(/"dateModified":"2026-10-24"/, '"dateModified":"24 October 2026"')), null, "a date in words");
  assert.equal(statedDates("<html></html>"), null, "no JSON-LD");
});

// A throwaway repository: commits dated as asked, so history can be read back.
function repository(dir) {
  const run = (args, date = "2026-01-01T12:00:00Z", committed = date) =>
    execFileSync("git", args, {
      cwd: dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: committed, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.invalid", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.invalid" },
    }).trim();
  run(["init", "-q", "-b", "main"]);
  return {
    run,
    async commit(message, date, files) {
      for (const [name, text] of Object.entries(files)) await writeFile(join(dir, name), text);
      run(["add", "-A"]);
      run(["commit", "-q", "--no-verify", "-m", message], date);
      return run(["rev-parse", "HEAD"]);
    },
  };
}

test("lastContentChange: the day the page last changed outside its date stamp, written as it was written, or null without usable history", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "gabs-page-history-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const repo = repository(dir);
  const stamped = (modified, body = "First body.") => page({ published: "2026-08-24", modified }).replace("Install 62 themes; the August update ships 3 files and 1 guide.", body);
  assert.deepEqual(lastContentChange("page.html", { cwd: dir }), { date: null, reason: "a repository with no commits yet" }, "before any commit, history says nothing");
  await repo.commit("publish", "2026-08-24T10:00:00+02:00", { "page.html": stamped("2026-08-24") });
  assert.deepEqual(lastContentChange("page.html", { cwd: dir }), { date: null, reason: "no commit in reach changes page.html outside its date stamp" }, "a first commit is the snapshot history starts from, not a change written that day");
  const second = await repo.commit("rewrite", "2026-09-10T23:30:00+02:00", { "page.html": stamped("2026-09-10", "Second body.") });
  assert.deepEqual(lastContentChange("page.html", { cwd: dir }), { date: "2026-09-10", sha: second }, "a later change to the text, dated as its author saw the day");
  await repo.commit("stamp only", "2026-10-24T10:00:00Z", { "page.html": stamped("2026-10-24", "Second body.") });
  assert.deepEqual(lastContentChange("page.html", { cwd: dir }), { date: "2026-09-10", sha: second }, "moving the dates and the byline alone is not a change");
  await repo.commit("another file", "2026-10-25T10:00:00Z", { "other.html": "<p>x</p>" });
  assert.deepEqual(lastContentChange("page.html", { cwd: dir }), { date: "2026-09-10", sha: second }, "nor is a change to another file");
  // A change written on a branch and merged days later is dated the day it was written.
  repo.run(["checkout", "-q", "-b", "topic"]);
  const written = await repo.commit("third body", "2026-10-02T09:00:00+02:00", { "page.html": stamped("2026-10-24", "Third body.") });
  repo.run(["checkout", "-q", "main"]);
  repo.run(["merge", "-q", "--no-ff", "--no-edit", "topic"], "2026-10-06T15:00:00Z");
  assert.deepEqual(lastContentChange("page.html", { cwd: dir }), { date: "2026-10-02", sha: written }, "the day the merged change was written, not the day it landed");
  repo.run(["checkout", "-q", "-b", "stamp"]);
  await repo.commit("stamp on a branch", "2026-10-27T09:00:00Z", { "page.html": stamped("2026-10-27", "Third body.") });
  repo.run(["checkout", "-q", "main"]);
  repo.run(["merge", "-q", "--no-ff", "--no-edit", "stamp"], "2026-10-28T15:00:00Z");
  assert.deepEqual(lastContentChange("page.html", { cwd: dir }), { date: "2026-10-02", sha: written }, "a merged stamp-only change is not a change either");
  // Written on a branch while main changed the page too, main pulled in before landing: the
  // page's latest writing is main's own, not the day main was pulled in.
  const base = stamped("2026-10-27", "Third body.");
  repo.run(["checkout", "-q", "-b", "upkeep"]);
  await repo.commit("fourth body", "2026-11-08T09:00:00+01:00", { "page.html": base.replace("Third body.", "Fourth body.") });
  repo.run(["checkout", "-q", "main"]);
  const onMain = await repo.commit("faq on main", "2026-11-09T09:00:00+01:00", { "page.html": base.replace('"mainEntity":[]', '"mainEntity":[{"@type":"Question","name":"x"}]') });
  repo.run(["checkout", "-q", "upkeep"]);
  repo.run(["merge", "-q", "--no-edit", "main"], "2026-11-11T09:00:00Z");
  repo.run(["checkout", "-q", "main"]);
  repo.run(["merge", "-q", "--no-ff", "--no-edit", "upkeep"], "2026-11-12T09:00:00Z");
  assert.deepEqual(lastContentChange("page.html", { cwd: dir }), { date: "2026-11-09", sha: onMain }, "the latest writing on either side, not the pull or the landing");
  // A change made and unmade on a branch never reaches the page.
  repo.run(["checkout", "-q", "-b", "twice"]);
  await repo.commit("fifth body", "2026-11-15T09:00:00Z", { "page.html": (await readFile(join(dir, "page.html"), "utf8")).replace("Fourth body.", "Fifth body.") });
  await repo.commit("fifth body undone", "2026-11-16T09:00:00Z", { "page.html": (await readFile(join(dir, "page.html"), "utf8")).replace("Fifth body.", "Fourth body.") });
  repo.run(["checkout", "-q", "main"]);
  repo.run(["merge", "-q", "--no-ff", "--no-edit", "twice"], "2026-11-17T09:00:00Z");
  assert.deepEqual(lastContentChange("page.html", { cwd: dir }), { date: "2026-11-09", sha: onMain }, "a change made and unmade before landing is no change");
  // A rebased or amended commit keeps the day it was written.
  const amended = await repo.commit("sixth body", "2026-11-20T09:00:00Z", { "page.html": (await readFile(join(dir, "page.html"), "utf8")).replace("Fourth body.", "Sixth body.") });
  repo.run(["commit", "-q", "--amend", "--no-edit", "--no-verify"], "2026-11-20T09:00:00Z", "2026-11-25T09:00:00Z");
  const rewritten = repo.run(["rev-parse", "HEAD"]);
  assert.notEqual(rewritten, amended);
  assert.equal(repo.run(["log", "-1", "--format=%cs"]), "2026-11-25", "the amended commit carries the later committer date");
  assert.deepEqual(lastContentChange("page.html", { cwd: dir }), { date: "2026-11-20", sha: rewritten }, "the day the change was written, not the day it was rewritten");
  // Inside a merge, the latest writing wins even when an older one was committed later (a rebase).
  repo.run(["checkout", "-q", "-b", "rebased"]);
  const newer = await repo.commit("seventh body", "2026-11-28T09:00:00Z", { "page.html": (await readFile(join(dir, "page.html"), "utf8")).replace("Sixth body.", "Seventh body.") });
  await repo.commit("faq again", "2026-11-27T09:00:00Z", { "page.html": (await readFile(join(dir, "page.html"), "utf8")).replace('"name":"x"', '"name":"y"') });
  repo.run(["commit", "-q", "--amend", "--no-edit", "--no-verify"], "2026-11-27T09:00:00Z", "2026-11-29T09:00:00Z");
  repo.run(["checkout", "-q", "main"]);
  repo.run(["merge", "-q", "--no-ff", "--no-edit", "rebased"], "2026-11-30T09:00:00Z");
  assert.deepEqual(lastContentChange("page.html", { cwd: dir }), { date: "2026-11-28", sha: newer }, "the latest writing among what a merge brought in, whatever order it was committed");
  assert.deepEqual(lastContentChange("missing.html", { cwd: dir }), { date: null, reason: "no commit in reach changes missing.html outside its date stamp" });
  // Without usable history the answer is null and says why.
  const plain = await mkdtemp(join(tmpdir(), "gabs-page-nohistory-"));
  t.after(() => rm(plain, { recursive: true, force: true }));
  assert.deepEqual(lastContentChange("page.html", { cwd: plain }), { date: null, reason: "not a git checkout" });
  const shallow = join(plain, "shallow");
  execFileSync("git", ["clone", "-q", "--depth", "1", `file://${dir}`, shallow], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  assert.deepEqual(lastContentChange("page.html", { cwd: shallow }), { date: null, reason: "a shallow clone, whose history stops short" });
});

test("lastContentChange: a branch that merged its base and kept its own page dates it as its merge into the base does", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "gabs-page-kept-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const repo = repository(dir);
  const body = (text) => page({ published: "2026-08-24", modified: "2026-08-24" }).replace("Install 62 themes; the August update ships 3 files and 1 guide.", text);
  await repo.commit("publish", "2026-08-24T10:00:00Z", { "page.html": body("First body.") });
  await repo.commit("second body", "2026-09-10T10:00:00Z", { "page.html": body("Second body.") });
  repo.run(["checkout", "-q", "-b", "topic"]);
  await repo.commit("branch body", "2026-10-02T10:00:00Z", { "page.html": body("Branch body.") });
  repo.run(["checkout", "-q", "main"]);
  const onMain = await repo.commit("main body", "2026-10-10T10:00:00Z", { "page.html": body("Main body.") });
  // The branch pulls main in and keeps its own page: main's change is read through the merge.
  repo.run(["checkout", "-q", "topic"]);
  repo.run(["merge", "-q", "-s", "ours", "--no-edit", "main"], "2026-10-12T10:00:00Z");
  assert.deepEqual(lastContentChange("page.html", { cwd: dir }), { date: "2026-10-10", sha: onMain }, "on the branch, the day of the base's change its merge kept its own page over");
  // Landed, the base reads the same day: the branch's page replaces main's, whose change was on the line.
  repo.run(["checkout", "-q", "main"]);
  repo.run(["merge", "-q", "--no-ff", "--no-edit", "topic"], "2026-10-14T10:00:00Z");
  assert.equal(await readFile(join(dir, "page.html"), "utf8"), body("Branch body."));
  assert.deepEqual(lastContentChange("page.html", { cwd: dir }), { date: "2026-10-10", sha: onMain }, "on the base after landing, the same day as on the branch");
  // A change made and unmade on a branch is still no change, though main's page moved meanwhile.
  repo.run(["checkout", "-q", "-b", "twice"]);
  repo.run(["checkout", "-q", "main"]);
  const moved = await repo.commit("main moves", "2026-10-15T10:00:00Z", { "page.html": body("Moved body.") });
  repo.run(["checkout", "-q", "twice"]);
  await repo.commit("made", "2026-10-16T10:00:00Z", { "page.html": body("Passing body.") });
  await repo.commit("unmade", "2026-10-17T10:00:00Z", { "page.html": body("Branch body.") });
  repo.run(["checkout", "-q", "main"]);
  repo.run(["merge", "-q", "--no-ff", "--no-edit", "twice"], "2026-10-19T10:00:00Z");
  assert.equal(await readFile(join(dir, "page.html"), "utf8"), body("Moved body."));
  assert.deepEqual(lastContentChange("page.html", { cwd: dir }), { date: "2026-10-15", sha: moved }, "a merge that kept its page over a side that changed nothing in sum reads nothing from it");
});

test("the dated pages on disk agree with themselves, and each is one of the two the verifier reads", async () => {
  assert.deepEqual(DATED_PAGES, ["claude-code-theme-install-guide.html", "semantic-terminal-colors.html"]);
  for (const path of DATED_PAGES) {
    const html = await readFile(new URL(path, root), "utf8");
    assert.deepEqual(pageDateProblems(html), [], path);
    assert.equal(dateMarker(html), "JSON-LD datePublished", `${path} is a dated page by the verifier's own test`);
    const { published, modified } = statedDates(html);
    assert.ok(published <= modified, `${path} states ${published} and ${modified}`);
    assert.match(html, new RegExp(`<p class="byline">By Gabs Utilities · published <time datetime="${published}">${longDate(published)}</time> · `), `${path} opens its byline with the publication date`);
    const update = new RegExp(`· updated <time datetime="${modified}">${longDate(modified)}</time>`);
    if (modified === published) assert.doesNotMatch(html, /· updated <time/, `${path} claims no update`);
    else assert.match(html, update, `${path} shows the update of ${longDate(modified)}`);
  }
});

// --- the verifier on the real files -----------------------------------------------------------

async function makeFixture(t) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "gabs-page-dates-"));
  const fixtureRoot = join(temporaryRoot, "repo");
  await cp(projectRoot, fixtureRoot, {
    recursive: true,
    filter(source) {
      const pathFromRoot = relative(projectRoot, source);
      return ![".git", ".worktrees", "node_modules"].some((directory) => pathFromRoot === directory || pathFromRoot.startsWith(`${directory}${sep}`));
    },
  });
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  return fixtureRoot;
}
function runVerifier(cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/verify.mjs"], { cwd });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}
async function editOnce(fixtureRoot, path, from, to) {
  const file = join(fixtureRoot, path);
  const text = await readFile(file, "utf8");
  assert.equal(text.split(from).length, 2, `${path} contains ${JSON.stringify(from)} exactly once`);
  await writeFile(file, text.replace(from, to));
}
async function expectRed(fixtureRoot, pattern) {
  const result = await runVerifier(fixtureRoot);
  assert.notEqual(result.code, 0, "the verifier fails");
  assert.match(result.stderr, pattern);
}
async function expectGreen(fixtureRoot) {
  const result = await runVerifier(fixtureRoot);
  assert.equal(result.code, 0, `the verifier passes:\n${result.stderr}`);
}
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test("the verifier fails the install guide's old byline, a date moved on one surface only, a future date and a new dated page it does not know, and passes the pages as they are", async (t) => {
  const fixtureRoot = await makeFixture(t);
  const path = "claude-code-theme-install-guide.html";
  const other = "semantic-terminal-colors.html";
  // The dates come from the pages, so the next honest bump of dateModified changes nothing here.
  const { published, modified } = statedDates(await readFile(join(fixtureRoot, path), "utf8"));
  assert.notEqual(published, modified, `${path} has been modified since it was published`);
  const update = `· updated <time datetime="${modified}">${longDate(modified)}</time>`;
  const byline = `published <time datetime="${published}">${longDate(published)}</time> ${update}`;
  await expectGreen(fixtureRoot);
  // The shape both pages had before this guard: the date in plain text, the schema never moved.
  await editOnce(fixtureRoot, path, byline, longDate(published));
  await editOnce(fixtureRoot, path, `"dateModified": "${modified}"`, `"dateModified": "${published}"`);
  await expectRed(fixtureRoot, new RegExp(`${escape(path)} byline writes "${longDate(published).split(" ")[0]}" outside a <time> element \\(the byline reads "By Gabs Utilities \\\\u00b7 ${escape(longDate(published))} \\\\u00b7 Free MIT theme pack"\\)`));
  await editOnce(fixtureRoot, path, longDate(published), byline);
  await expectRed(fixtureRoot, new RegExp(`byline shows a second date \\(${modified}\\) although JSON-LD dateModified equals datePublished \\(${published}\\)`));
  await editOnce(fixtureRoot, path, `"dateModified": "${published}"`, `"dateModified": "${modified}"`);
  await expectGreen(fixtureRoot);
  // The schema moved without the byline.
  const earlier = dayBefore(modified);
  await editOnce(fixtureRoot, path, `"dateModified": "${modified}"`, `"dateModified": "${earlier}"`);
  await expectRed(fixtureRoot, earlier === published ? new RegExp(`byline shows a second date \\(${modified}\\) although JSON-LD dateModified equals datePublished`) : new RegExp(`${escape(path)} byline's update date is ${modified} where JSON-LD dateModified is ${earlier}`));
  await editOnce(fixtureRoot, path, `"dateModified": "${earlier}"`, `"dateModified": "${modified}"`);
  // The byline moved without the schema, on the other page.
  const otherDates = statedDates(await readFile(join(fixtureRoot, other), "utf8"));
  assert.notEqual(otherDates.published, otherDates.modified, `${other} has been modified since it was published`);
  const otherEarlier = dayBefore(otherDates.modified);
  await editOnce(fixtureRoot, other, `updated <time datetime="${otherDates.modified}">${longDate(otherDates.modified)}</time>`, `updated <time datetime="${otherEarlier}">${longDate(otherEarlier)}</time>`);
  await expectRed(fixtureRoot, new RegExp(`${escape(other)} byline's update date is ${otherEarlier} where JSON-LD dateModified is ${otherDates.modified}`));
  await editOnce(fixtureRoot, other, `updated <time datetime="${otherEarlier}">${longDate(otherEarlier)}</time>`, `updated <time datetime="${otherDates.modified}">${longDate(otherDates.modified)}</time>`);
  // Tomorrow, the nearest future date, written consistently on both surfaces, fails today and every day.
  const tomorrow = dayAfter(latestToday());
  await editOnce(fixtureRoot, path, `"dateModified": "${modified}"`, `"dateModified": "${tomorrow}"`);
  await editOnce(fixtureRoot, path, update, `· updated <time datetime="${tomorrow}">${longDate(tomorrow)}</time>`);
  await expectRed(fixtureRoot, new RegExp(`${escape(path)} JSON-LD dateModified ${tomorrow} is after \\d{4}-\\d{2}-\\d{2}, the latest calendar date now in effect anywhere`));
  await editOnce(fixtureRoot, path, `"dateModified": "${tomorrow}"`, `"dateModified": "${modified}"`);
  await editOnce(fixtureRoot, path, `· updated <time datetime="${tomorrow}">${longDate(tomorrow)}</time>`, update);
  // A date far in the future, written consistently, still fails.
  await editOnce(fixtureRoot, path, `"dateModified": "${modified}"`, '"dateModified": "2099-01-01"');
  await editOnce(fixtureRoot, path, update, '· updated <time datetime="2099-01-01">1 January 2099</time>');
  await expectRed(fixtureRoot, /JSON-LD dateModified 2099-01-01 is after \d{4}-\d{2}-\d{2}, the latest calendar date now in effect anywhere; a page is not published or modified in the future/);
  await editOnce(fixtureRoot, path, '"dateModified": "2099-01-01"', `"dateModified": "${modified}"`);
  await editOnce(fixtureRoot, path, '· updated <time datetime="2099-01-01">1 January 2099</time>', update);
  await expectGreen(fixtureRoot);
  // A third page carrying dates, in the old shape, is caught although nothing lists it.
  const guide = await readFile(join(fixtureRoot, path), "utf8");
  await writeFile(join(fixtureRoot, "release-notes.html"), guide.replace(byline, longDate(published)).replace(`"dateModified": "${modified}"`, `"dateModified": "${published}"`));
  await expectRed(fixtureRoot, /release-notes\.html carries JSON-LD datePublished but is not one of the dated pages in scripts\/page-dates\.mjs/);
  await rm(join(fixtureRoot, "release-notes.html"));
  await expectGreen(fixtureRoot);
});

test("the verifier holds each page's dateModified to the day it last changed outside its stamp, where git history is in reach", async (t) => {
  const fixtureRoot = await makeFixture(t);
  const path = "claude-code-theme-install-guide.html";
  const guide = await readFile(join(fixtureRoot, path), "utf8");
  const { published, modified } = statedDates(guide);
  const update = `· updated <time datetime="${modified}">${longDate(modified)}</time>`;
  // The copy has no .git, so the verifier passes with a notice instead of a verdict.
  const notice = (reason) => new RegExp(`^${escape(path)}: dateModified ${modified} not held to git history \\(${escape(reason)}\\)\\.$`, "m");
  const unheld = await runVerifier(fixtureRoot);
  assert.equal(unheld.code, 0, unheld.stderr);
  assert.match(unheld.stdout, notice("not a git checkout"));
  // A repository with no commits yet, as another test's fixture may be, gets the same notice, not a crash.
  const repo = repository(fixtureRoot);
  const unborn = await runVerifier(fixtureRoot);
  assert.equal(unborn.code, 0, unborn.stderr);
  assert.match(unborn.stdout, notice("a repository with no commits yet"));
  // A first commit is the snapshot history starts from, whatever day it carries: still a notice.
  repo.run(["add", "-A"]);
  repo.run(["commit", "-q", "--no-verify", "-m", "import"], `${dayAfter(dayAfter(dayAfter(modified)))}T12:00:00Z`);
  const imported = await runVerifier(fixtureRoot);
  assert.equal(imported.code, 0, imported.stderr);
  assert.match(imported.stdout, notice(`no commit in reach changes ${path} outside its date stamp`));
  // A change to the page's text committed the day the pages say makes the verdict green.
  await editOnce(fixtureRoot, path, "</footer>", "<p>A sentence more.</p></footer>");
  repo.run(["commit", "-q", "--no-verify", "-a", "-m", "content"], `${modified}T12:00:00Z`);
  await expectGreen(fixtureRoot);
  // Moving the stamp alone to a later day, consistently on both surfaces, is red: nothing changed that day.
  const later = dayAfter(dayAfter(modified));
  await editOnce(fixtureRoot, path, `"dateModified": "${modified}"`, `"dateModified": "${later}"`);
  await editOnce(fixtureRoot, path, update, `· updated <time datetime="${later}">${longDate(later)}</time>`);
  repo.run(["commit", "-q", "--no-verify", "-a", "-m", "stamp only"], `${later}T12:00:00Z`);
  await expectRed(fixtureRoot, new RegExp(`${escape(path)} JSON-LD dateModified is ${later}, but the page last changed in anything other than its date stamp on ${modified} \\([0-9a-f]{7}\\); dateModified and the byline's update name the day of that change`));
  // A change to the page's text on that day makes the same stamp true.
  await editOnce(fixtureRoot, path, "</footer>", "<p>One more sentence.</p></footer>");
  repo.run(["commit", "-q", "--no-verify", "-a", "-m", "content"], `${later}T13:00:00Z`);
  await expectGreen(fixtureRoot);
  // And a stamp left behind by that change is red the other way.
  await editOnce(fixtureRoot, path, `"dateModified": "${later}"`, `"dateModified": "${published}"`);
  await editOnce(fixtureRoot, path, `· updated <time datetime="${later}">${longDate(later)}</time> `, "");
  repo.run(["commit", "-q", "--no-verify", "-a", "-m", "stamp back"], `${later}T14:00:00Z`);
  await expectRed(fixtureRoot, new RegExp(`${escape(path)} JSON-LD dateModified is ${published}, but the page last changed in anything other than its date stamp on ${later}`));
});
