import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

import {
  README_PATHS,
  THEME_LINK_BLOCKS,
  THEME_PAGE_URL,
  assertDistinctPages,
  buildReadmeThemeLinks,
  byName,
  endMarker,
  findBlock,
  markdownFlow,
  pageLink,
  readMoods,
  renderThemeList,
  renderThemeTable,
  startMarker,
  themeLinkProblems,
} from "./build-readme-theme-links.mjs";
import { loadThemes } from "./build-theme-pages.mjs";

const root = new URL("../", import.meta.url);
const projectRoot = fileURLToPath(root);
const link = (name, slug) => `[${name}](${THEME_PAGE_URL}${slug}/)`;

async function makeFixture(t) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "gabs-readme-links-"));
  const fixtureRoot = join(temporaryRoot, "repo");
  await cp(projectRoot, fixtureRoot, {
    recursive: true,
    filter(source) {
      const pathFromRoot = relative(projectRoot, source);
      const isExcludedDirectory = [".git", ".worktrees", "node_modules"].some(
        (directory) => pathFromRoot === directory || pathFromRoot.startsWith(`${directory}${sep}`),
      );
      return !isExcludedDirectory;
    },
  });
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  return fixtureRoot;
}

async function runScript(script, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], { cwd });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}
const runVerifier = (cwd) => runScript("scripts/verify.mjs", cwd);
const runBuilder = (cwd) => runScript("scripts/build-readme-theme-links.mjs", cwd);

// Replaces one exact occurrence of `from` in a fixture file; the test fails if the text it
// means to break is not there exactly once, so a wording change cannot silently defuse it.
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
  return result;
}

async function expectGreen(fixtureRoot) {
  const result = await runVerifier(fixtureRoot);
  assert.equal(result.code, 0, `the verifier passes:\n${result.stderr}`);
}

// --- the renderer --------------------------------------------------------------------------

test("the READMEs carry exactly the blocks the builder renders from the theme files", async () => {
  const { themes, blocks } = await buildReadmeThemeLinks(root);
  assert.equal(themes.length, 62);
  assert.equal(blocks.length, THEME_LINK_BLOCKS.length);
  const texts = new Map();
  for (const path of README_PATHS) texts.set(path, await readFile(new URL(path, root), "utf8"));
  for (const block of blocks) {
    const text = texts.get(block.path);
    assert.equal(block.start, startMarker(block.key));
    assert.equal(block.end, endMarker(block.key));
    assert.equal(text.split(block.start).length, 2, `${block.path} carries ${block.start} once`);
    const written = text.slice(text.indexOf(block.start), text.indexOf(block.end) + block.end.length);
    assert.equal(written, block.rendered, `${block.path}: the ${block.key} block is what the builder renders`);
  }

  const fifty = blocks.find((block) => block.key === "fifty");
  const vol2 = blocks.find((block) => block.key === "vol2");
  const table = blocks.find((block) => block.key === "vol2-table");
  const linksIn = (block) => [...block.rendered.matchAll(/\[([^\]]+)\]\(https:\/\/gabs-utilities\.com\/theme\/([a-z0-9-]+)\/\)/g)];
  assert.equal(linksIn(fifty).length, 50);
  assert.equal(linksIn(vol2).length, 12);
  assert.equal(linksIn(table).length, 12);
  assert.equal((table.rendered.match(/^\| /gm) ?? []).length, 13, "a header row and twelve theme rows");
  for (const block of blocks) {
    for (const [, name, slug] of linksIn(block)) {
      const theme = themes.find((candidate) => candidate.slug === slug);
      assert.ok(theme, `${slug} is a theme`);
      assert.equal(name, theme.name, `${slug} is linked under its own name`);
      assert.equal(theme.pack.id, block.pack, `${name} belongs in the ${block.key} block`);
    }
  }
  // The index pointer is outside the blocks, but the READMEs rely on it.
  assert.ok(texts.get("README.md").includes(`[gabs-utilities.com/theme/](${THEME_PAGE_URL})`));
  assert.ok(texts.get("plugins/50-dark-themes/README.md").split("\n").includes(THEME_PAGE_URL));
});

test("a list is two linked names to a line, in code-point order, every line but the last ending in a dot", async () => {
  const themes = byName((await loadThemes(root)).filter((theme) => theme.pack.id === "50-dark-themes"));
  const names = themes.map((theme) => theme.name);
  assert.ok(names.indexOf("VU Meter") < names.indexOf("Velvet"), "code-point order, not locale order");
  assert.ok(names.indexOf("Night Vision") < names.indexOf("Nightshade"));
  const lines = renderThemeList(themes).split("\n");
  assert.equal(lines.length, 25);
  for (const line of lines.slice(0, -1)) assert.match(line, /^\[.+\]\(.+\) · \[.+\]\(.+\) ·$/);
  assert.match(lines.at(-1), /^\[.+\]\(.+\) · \[.+\]\(.+\)$/);
  assert.equal(lines[0], `${pageLink(themes[0])} · ${pageLink(themes[1])} ·`);
  assert.equal(renderThemeList(themes.slice(0, 3)), `${pageLink(themes[0])} · ${pageLink(themes[1])} ·\n${pageLink(themes[2])}`);
  assert.throws(() => pageLink({ name: "Vel[vet]", slug: "velvet" }), /Markdown reads as syntax/);
});

test("the Vol. 2 table carries its moods over from the README and rejects a mood that is not plain words", async () => {
  const twelve = byName((await loadThemes(root)).filter((theme) => theme.pack.id === "dark-themes-vol-2"));
  const [afterglow, aurora] = twelve;
  const written = (rows) => ["| Theme | Mood |", "|---|---|", ...rows].join("\n");

  // Bare names (the table before the links existed) and linked names both read.
  const moods = readMoods(written([`| ${afterglow.name} | Warm peach dusk |`, `| ${pageLink(aurora)} | Mint-green light, over a black sky |`]), twelve, "dark-themes-vol-2");
  assert.deepEqual([...moods], [
    [afterglow.name, "Warm peach dusk"],
    [aurora.name, "Mint-green light, over a black sky"],
  ]);
  // A differently written header or delimiter row is not a theme row.
  assert.equal(readMoods(["| Name | Mood |", "| --- | :-- |", `| ${afterglow.name} | Dusk |`].join("\n"), twelve, "dark-themes-vol-2").get(afterglow.name), "Dusk");

  // A table without a header row, without outer pipes, or with CR LF line endings reads the same.
  assert.deepEqual([...readMoods([`| ${afterglow.name} | Dusk |`, `| ${aurora.name} | Mint |`].join("\n"), twelve, "dark-themes-vol-2")], [
    [afterglow.name, "Dusk"],
    [aurora.name, "Mint"],
  ]);
  assert.equal(readMoods(["Theme | Mood", "--- | ---", `${afterglow.name} | Dusk`].join("\n"), twelve, "dark-themes-vol-2").get(afterglow.name), "Dusk");
  assert.equal(readMoods(written([`| ${afterglow.name} | Dusk |`]).replace(/\n/g, "\r\n"), twelve, "dark-themes-vol-2").get(afterglow.name), "Dusk");
  for (const mood of ["Dämmerung über Berlin", "Rain-washed green-gray — soft", "Salt & smoke", "Why not?", "Dusk, then night (late) – 2 a.m.", 'Say "hush"', "‘Quiet’ dusk…"]) {
    assert.equal(readMoods(written([`| ${afterglow.name} | ${mood} |`]), twelve, "dark-themes-vol-2").get(afterglow.name), mood, mood);
  }

  assert.throws(() => readMoods(written([`| Velvet | Not in this pack |`]), twelve, "dark-themes-vol-2"), /"Velvet", which is not a dark-themes-vol-2 theme/);
  assert.throws(() => readMoods(written([`| ${afterglow.name} | Dusk |`, `| ${afterglow.name} | Again |`]), twelve, "dark-themes-vol-2"), /two rows for Afterglow/);
  for (const mood of ["Warm [peach](https://example.com) dusk", "Warm `peach` dusk", "Warm <b>peach</b> dusk", "Warm **peach** dusk", "Warm _peach_ dusk", "Warm ~~peach~~ dusk", "Warm #peach", "", "W\u0430rm dusk", "See www.example.com", "Try https://example.com", "Mail a@b.c", "Salt &amp; smoke", "Warm/cold"]) {
    assert.throws(() => readMoods(written([`| ${afterglow.name} | ${mood} |`]), twelve, "dark-themes-vol-2"), /not plain words/, JSON.stringify(mood));
  }

  assert.equal(readMoods(written([`|  ${afterglow.name}  |   Warm dusk   |`]), twelve, "dark-themes-vol-2").get(afterglow.name), "Warm dusk", "cells are trimmed, as GFM trims them");
  assert.throws(() => readMoods(written([`| ${afterglow.name} | Warm | peach |`]), twelve, "dark-themes-vol-2"), /the table row "\| Afterglow \| Warm \| peach \|" is not two cells/);

  assert.throws(() => renderThemeTable(twelve, moods), /no row for Basalt; add one as \| \[Basalt\]\(https:\/\/gabs-utilities\.com\/theme\/basalt\/\) \| <mood> \|/);
  const full = new Map(twelve.map((theme) => [theme.name, `${theme.name} mood`]));
  const table = renderThemeTable(twelve, full);
  assert.equal(table.split("\n")[2], `| ${pageLink(afterglow)} | Afterglow mood |`);
  assert.equal(table.split("\n").length, 14);
});

// --- the readers verify.mjs applies --------------------------------------------------------

test("markdownFlow knows where a column-0 line renders as a block of its own", () => {
  const MARKER = "<!-- m -->";
  // Each case: the lines before a blank line and the marker; whether the marker renders.
  const cases = [
    ["plain paragraph", ["Some text."], true],
    ["closed backtick fence", ["```", "code", "```"], true],
    ["unclosed backtick fence", ["```", "code"], false],
    ["unclosed tilde fence", ["~~~", "code"], false],
    ["tilde fence closed by a longer tilde fence", ["~~~", "code", "~~~~"], true],
    ["backtick fence not closed by tildes", ["```", "code", "~~~"], false],
    ["long fence not closed by a shorter one", ["````", "code", "```"], false],
    ["closing fence with an info string does not close", ["```", "code", "``` js"], false],
    ["backtick opener with a backtick in its info string is not a fence", ["``` a`b"], true],
    ["a fence indented four spaces is not a fence", ["    ```", "code"], true],
    ["a fence indented three spaces is a fence", ["   ```", "code"], false],
    ["<pre> block left open", ["<pre>", "x"], false],
    ["<pre> block closed on a later line", ["<pre>", "x", "</pre>"], true],
    ["<pre> opened and closed on one line", ["<pre>x</pre>"], true],
    ["<PRE> in another case", ["<PRE>", "x"], false],
    ["<script> left open", ["<script>", "x"], false],
    ["<style> left open", ["<style>", "x"], false],
    ["<textarea> left open", ["<textarea>", "x"], false],
    ["<preview> is not a <pre> block", ["<preview>", "x"], true],
    ["<pre followed by a no-break space is not a <pre> block", ["<pre\u00A0x", "x"], true],
    ["<pre followed by a tab is a <pre> block", ["<pre\tx>", "x"], false],
    ["HTML comment left open", ["<!-- note", "x"], false],
    ["HTML comment closed", ["<!-- note -->"], true],
    ["HTML comment closed on a later line", ["<!--", "note", "-->"], true],
    ["a fence inside an open comment is not a fence", ["<!--", "```", "-->"], true],
    ["a <pre> inside a fence is not a block", ["```", "<pre>", "```"], true],
    ["a comment inside a fence is not a block", ["```", "<!--", "```"], true],
    ["<div> block ends at the blank line", ["<div>", "x"], true],
    ["<p align> block ends at the blank line", ['<p align="center">', "x"], true],
    ["a block-level tag ends at a line of spaces", ["<div>", "x", "   "], true],
    ["processing instruction left open", ["<?php", "x"], false],
    ["processing instruction closed on its line", ["<?php echo 1 ?>"], true],
    ["processing instruction closed later", ["<?xml", "x", "?>"], true],
    ["CDATA left open", ["<![CDATA[", "x"], false],
    ["CDATA closed later", ["<![CDATA[", "x", "]]>"], true],
    ["declaration left open", ["<!DOCTYPE html"], false],
    ["declaration closed on its line", ["<!DOCTYPE html>"], true],
    ["an inline tag alone after a blank line ends at the blank line", ["", "<span>", "x"], true],
    ["a lone tag after a heading opens a block that swallows a fence opener", ["## Title", '<img src="x">', "```bash", "a", "", "b", "```"], false],
    ["a lone tag after a paragraph is the paragraph's text, and the fence closes", ["Text.", '<img src="x">', "```bash", "a", "", "b", "```"], true],
    ["<pre> closed by any of the four closing tags", ["<pre>", "x", "</script>"], true],
    ["a fence on a list item's own line, closed at its content column", ["1. ```bash", "   code", "   ```"], true],
    ["a fence on a list item's own line, not closed at column 0", ["1. ```bash", "   code", "```"], false],
    ["a fence in a list item whose content drops to column 0 runs on", ["- item", "  ```", "code", "  ```"], true],
    ["a fence indented two spaces, closed at two spaces", ["- item", "  ```", "  code", "  ```"], true],
    // CommonMark would close these; the walk does not, because the opener may be a list item's content.
    ["a fence indented three spaces is not closed at column 0", ["   ```", "code", "```"], false],
    ["a fence indented two spaces is not closed at one space", ["  ```", "code", " ```"], false],
    ["the list-item shape: a fence inside an item, then a column-0 fence that in fact opens another", ["1. Add it:", "   ```bash", "   claude plugin marketplace add x", "```"], false],
  ];
  for (const [label, before, renders] of cases) {
    const { flow } = markdownFlow([...before, "", MARKER, ""].join("\n"));
    assert.equal(flow[before.length + 1], renders, label);
  }
  // Lines inside an HTML block that runs to a blank line are not flow; an inline tag cannot start
  // one in the middle of a paragraph.
  assert.equal(markdownFlow('<p align="center">\nhttps://gabs-utilities.com/theme/\n</p>').flow[1], false);
  assert.equal(markdownFlow("text\n\n<span>\nx").flow[3], false);
  assert.equal(markdownFlow("text\n<span>\nx").flow[2], true);
  assert.equal(markdownFlow("<div>\n \t\nx").flow[2], true, "a line of spaces and tabs is blank");
  assert.deepEqual(markdownFlow("<div>\na\nb\n\nc").flow, [true, false, false, false, true], "every line up to the blank one is inside the block");
  assert.equal(markdownFlow("a\n\n<?php\nb").open.token, "<?");
  assert.equal(markdownFlow("a\n\n<![CDATA[\nb").open.token, "<![CDATA[");
  assert.equal(markdownFlow("a\n\n<div>\nb").open, null, "a block that ends at a blank line ends at the end of the file too");
  assert.deepEqual(markdownFlow("a\n\n```\nb").open, { kind: "fence", indent: 0, token: "```", line: 3 });
  assert.deepEqual(markdownFlow("a\n\n  ~~~~\nb\n~~~~").open, { kind: "fence", indent: 2, token: "~~~~", line: 3 });
  // A lone tag starts an HTML block after anything that is not paragraph text.
  for (const previous of ["## Heading", "```", "<!-- m -->", "---", "| a | b |", "- item", "> quote", "    code", "Setext", "===="]) {
    const text = previous === "Setext" ? "Setext\n====\n<img src=\"x\">\nhttps://gabs-utilities.com/theme/" : `${previous}\n<img src="x">\nhttps://gabs-utilities.com/theme/`;
    const { flow } = markdownFlow(text);
    assert.equal(flow.at(-1), false, `after ${JSON.stringify(previous)} the tag opens a block`);
  }
  assert.equal(markdownFlow('Text.\n<img src="x">\nhttps://gabs-utilities.com/theme/').flow.at(-1), true, "after paragraph text the tag is text");
  assert.equal(markdownFlow("</span>\nx").flow[1], false, "a lone closing tag opens a block too");
  // A line indented less than an indented fence is named as ambiguous, and the fence runs on.
  assert.deepEqual(markdownFlow("- item\n  ```\ncode\n  ```").ambiguous.map(({ line, fence }) => [line, fence.line, fence.indent]), [[3, 2, 2]]);
  assert.deepEqual(markdownFlow("```\ncode\n```").ambiguous, [], "a column-0 fence is never ambiguous");
  assert.deepEqual(markdownFlow("  ```\n\n  code\n  ```").ambiguous, [], "blank lines inside do not count");
  assert.equal(markdownFlow("a\n\n<pre>\nb").open.token, "<pre>");
  assert.equal(markdownFlow("a\n\n<!-- x\nb").open.token, "<!--");
  assert.equal(markdownFlow("a\n\n```\nb\n```\n").open, null);
  // What each line sits inside, and the openers a loosely opened HTML block may hide.
  assert.deepEqual(markdownFlow("<div>\na\n\nb\n```\nc").inside, ["html-to-blank", "html-to-blank", "html-to-blank", null, "fence", "fence"], "the opening line belongs to its block");
  assert.deepEqual(markdownFlow("<!-- x -->\n<pre>y</pre>\ntext").inside, ["html", "html", null], "a block that opens and closes on one line is that line's block");
  assert.deepEqual(markdownFlow("<!-- x -->\n<pre>y</pre>\ntext").flow, [true, true, true], "and nothing stays open after it");
  assert.deepEqual(markdownFlow("<pre>\nx\n</pre>\n```\ny").blocks.map((block) => block && [block.kind, block.token, block.line]), [["html", "<pre>", 1], ["html", "<pre>", 1], ["html", "<pre>", 1], ["fence", "```", 4], ["fence", "```", 4]]);
  assert.deepEqual(markdownFlow("a | b\n<span>\n```\n\nx").hidden.map(({ line, opens, inside }) => [line, opens, inside.token, inside.line]), [[3, "```", "<span>", 2]]);
  assert.deepEqual(markdownFlow("a | b\n<span>\n<!-- x -->\n<!-- y\n\nx").hidden.map(({ line, opens }) => [line, opens]), [[4, "<!--"]], "a comment closed on its line hides nothing; an open one does");
  assert.deepEqual(markdownFlow("text\n\n<div>\n```\n").hidden.map(({ line }) => line), [4], "a block tag's block is named too, since the rule is one");
  assert.deepEqual(markdownFlow("<div>\n<img src=x>\n\n").hidden, [], "a lone tag inside the block opens nothing new");
  // Indented code is a matter of columns: a space and a tab make four.
  assert.equal(markdownFlow("x:\n\n \tcode line\n<span>\nhttps://gabs-utilities.com/theme/\n").flow[4], false, "a lone tag after a tab-indented code line opens a block");
  assert.equal(markdownFlow("x:\n\n   code line\n<span>\nhttps://gabs-utilities.com/theme/\n").flow[4], true, "three spaces are paragraph text, so the tag is text");
});

test("markdownFlow reads indented code as a block of its own, where a link is text", () => {
  // Four columns after a blank line, a heading or a closed block open indented code, which runs
  // through blank lines to the first line indented less. The opening line begins in flow, as a
  // fence's does; the block holds what follows.
  assert.deepEqual(markdownFlow("para\n\n    code\n\nafter").inside, [null, null, "indented", "indented", null]);
  assert.deepEqual(markdownFlow("para\n\n    code\n\nafter").flow, [true, true, true, false, true]);
  assert.deepEqual(markdownFlow("para\n\n\tcode").inside, [null, null, "indented"], "a tab is four columns");
  assert.deepEqual(markdownFlow("para\n\n \tcode").inside, [null, null, "indented"], "a space and a tab are four columns");
  assert.deepEqual(markdownFlow("para\n\n   three").inside, [null, null, null], "three spaces are paragraph text");
  assert.deepEqual(markdownFlow("para\n    lazy").inside, [null, null], "an indented line after paragraph text continues the paragraph");
  assert.deepEqual(markdownFlow("# Title\n    code").inside, [null, "indented"], "after a heading no paragraph is open");
  assert.deepEqual(markdownFlow("```\nx\n```\n    code").inside, ["fence", "fence", "fence", "indented"], "after a closed fence");
  assert.deepEqual(markdownFlow("    code\n\n\n    more\n\nafter").blocks.map((block) => block && block.line), [1, 1, 1, 1, 1, null], "blank lines inside do not end it; the first line indented less does");
  assert.deepEqual(markdownFlow("    code\n  \nx").inside, ["indented", "indented", null], "a line of spaces is blank");
  assert.deepEqual(markdownFlow("    code\n   three").inside, ["indented", null], "a line indented three spaces ends it and is read afresh");
  assert.deepEqual(markdownFlow("```\n    x\n```").inside, ["fence", "fence", "fence"], "an indented line inside a fence is the fence's");
  assert.deepEqual(markdownFlow("<div>\n    x\n\ny").inside, ["html-to-blank", "html-to-blank", "html-to-blank", null], "an indented line inside an HTML block is the block's");
  assert.deepEqual(markdownFlow("a | b\n<span>\n    x\n").hidden, [], "an indented line inside a loosely opened block opens nothing: to CommonMark it would continue the paragraph");
  assert.equal(markdownFlow("para\n\n    code").open, null, "indented code ends at the end of the file");
  assert.deepEqual(markdownFlow("para\n\n    ```\nx\n\n```").inside, [null, null, "indented", null, null, "fence"], "a fence line indented four columns is code, not a fence; the later fence opens");
  assert.equal(markdownFlow("    code\n\n<!-- m -->").flow[2], true, "a marker after indented code renders");
  // Loose, like the lone-tag rule: after a list item or a block quote the walk reads an indented
  // line as code, where CommonMark reads it as the container's content. Rule 4 of themeLinkProblems
  // fails the line itself, so the reading only names where a link sits.
  assert.deepEqual(markdownFlow("- item\n    content").inside, [null, "indented"]);
  assert.deepEqual(markdownFlow("> quote\n    content").inside, [null, "indented"]);
});

test("themeLinkProblems holds every theme-page address and bracketed theme name to the one written form", async () => {
  const themes = await loadThemes(root);
  const velvet = link("Velvet", "velvet");
  const ok = (text, label = text) => assert.deepEqual(themeLinkProblems(text, themes), [], label);
  const bad = (text, pattern, label = text) => {
    const problems = themeLinkProblems(text, themes);
    assert.ok(problems.length > 0, `${label}: a problem is reported`);
    assert.match(problems[0], pattern, label);
  };
  // Read right, but held by rule 4: every problem is a backtick that does not close on its line, a pipe in a
  // code span or a line indented four columns, and nothing else (the link stays a link).
  const onlyRule4 = (text, label = text) => {
    const problems = themeLinkProblems(text, themes);
    assert.ok(problems.length > 0, `${label}: rule 4 reports it`);
    for (const problem of problems) assert.match(problem, /^line \d+ (?:writes `+ with nothing after it on that line to close it\.|writes a pipe inside the code span |is indented \d+ columns )/, label);
  };

  ok(`${velvet} is a theme.`);
  ok(`Pages: [gabs-utilities.com/theme/](${THEME_PAGE_URL}).`);
  ok(`Pages:\n${THEME_PAGE_URL}\n`);
  ok(`Pages: ${THEME_PAGE_URL}.`);
  ok(`Pages: ${THEME_PAGE_URL}`);
  ok(`Pages: ${THEME_PAGE_URL}, one for each theme.`, "the bare index followed by a comma");
  ok(`Pages (${THEME_PAGE_URL}), one for each theme.`, "the bare index in parentheses, which GFM autolinks");
  ok(`(${THEME_PAGE_URL})`, "the bare index in parentheses alone");
  ok(`foo [ bar ${velvet}`, "a stray bracket before a theme link does not change how the link is read");
  ok("[![Verify themes and shop](https://github.com/x/y/badge.svg)](https://github.com/x/y/actions)", "a badge: an image inside a link");
  bad(`Written as \`${velvet}\`.`, /bracket inside the code span/, "a canonical link in a code span is text, not a link");
  ok("Velvet is a theme.", "a name outside brackets is not a link");
  ok("See [the gallery](https://gabs-utilities.com/#vol2).", "other addresses on the site are not theme pages");
  ok("<!-- a -->\ntext\n<!-- b -->", "closed comments");
  ok("[Velvet Underground](https://example.com)", "other link text is not a theme name");
  ok(`Gallery: [gabs-utilities.com](${"https://gabs-utilities.com/"}).`, "the home link");
  ok("Gallery: https://gabs-utilities.com/", "the bare home address");
  ok("Gallery: https://gabs-utilities.com/#vol2", "a fragment on the home page, bare");
  ok("[the expansion section](https://gabs-utilities.com/#vol2)", "a fragment on the home page as a destination");
  ok("[an essay](https://gabs-utilities.com/semantic-terminal-colors.html)", "a top-level page as a destination");
  ok("<https://gabs-utilities.com/claude-code-theme-install-guide.html>", "a top-level page as an autolink");
  ok("[a step](https://gabs-utilities.com/claude-code-theme-install-guide.html#manual)", "a fragment on a top-level page");
  ok("**[gabs-utilities.com/themes.json](https://gabs-utilities.com/themes.json)**", "a top-level file under its own address");
  ok("[gabs-utilities.com/#vol2](https://gabs-utilities.com/#vol2)", "a fragment under its own address");
  ok("[the sitemap](https://gabs-utilities.com/sitemap.xml)", "a top-level file under other text");
  bad("[gabs-utilities.com/themes.json](https://gabs-utilities.com/other.json)", /form the READMEs do not use/, "the address text naming another file");
  bad("![gabs-utilities.com/themes.json](https://gabs-utilities.com/themes.json)", /as an image/, "a self-named link as an image");
  bad("[gabs-utilities.com/theme/velvet/](https://gabs-utilities.com/theme/velvet/)", /links Velvet's page as "gabs-utilities\.com\/theme\/velvet\/"/, "a theme page under its own address");
  bad("[the index](https://gabs-utilities.com/themes.json/)", /form the READMEs do not use/, "a file with a trailing slash");
  bad("[the index](https://gabs-utilities.com/a.b.json)", /form the READMEs do not use/, "a file with two dots");
  ok("Dark Invoice & Business Documents and [Live demo →](https://example.com) and [Résumé — demo](https://example.com)", "the READMEs' own punctuation and letters");
  bad("[Night\nVision](https://gabs-utilities.com/theme/night-vision/)", /form the READMEs do not use|name in brackets/, "a soft line break inside the link text");

  bad(link("Verdigris", "velvet"), /line 1 links Velvet's page as "Verdigris"; that page is Velvet's, so the link reads \[Velvet\]/);
  bad(`\n\n${link("Ozonee", "ozonee")}`, /line 3 links https:\/\/gabs-utilities\.com\/theme\/ozonee\/, but no theme page has that address/);
  bad(`!${velvet}`, /as an image \(a ! before it\)/);
  bad(`\\${velvet}`, /backslash escape \(\\\[\)|escapes .* with a backslash/);
  bad(`[Velvet](http://gabs-utilities.com/theme/velvet/)`, /writes Velvet's name in brackets as \[Velvet\]\(http:\/\/gabs-utilities\.com\/theme\/velvet\/\); a theme name in brackets is its link, written exactly \[Velvet\]/);
  bad(`[Velvet](https://www.gabs-utilities.com/theme/velvet/)`, /name in brackets/);
  bad(`[Velvet](https://GABS-UTILITIES.com/theme/velvet/)`, /name in brackets/);
  bad(`[Velvet](https://gabs-utilities.co/theme/velvet/)`, /name in brackets/, "lookalike host");
  bad(`[Velvet](https://gabs-utilities.com.evil.net/theme/velvet/)`, /name in brackets/, "host with a suffix");
  bad(`[Velvet](https://example.com/)`, /name in brackets/);
  bad(`[Velvet](${THEME_PAGE_URL}velvet)`, /form the READMEs do not use/, "no trailing slash");
  bad(`[Velvet](${THEME_PAGE_URL}velvet/#x)`, /form the READMEs do not use/, "a fragment");
  bad(`[Velvet](${THEME_PAGE_URL}velvet/ "Velvet")`, /address alphabet/, "a title");
  bad(`[Velvet](${THEME_PAGE_URL}Velvet/)`, /form the READMEs do not use/, "an uppercase slug");
  bad(`[Velvet](<${THEME_PAGE_URL}velvet/>)`, /name in brackets/, "an angle-bracket destination");
  bad(`[Velvet]( ${THEME_PAGE_URL}velvet/)`, /name in brackets/, "a space before the destination");
  bad(`[Velvet][velvet]\n\n[velvet]: ${THEME_PAGE_URL}velvet/`, /writes Velvet's name in brackets as \[Velvet\]\[velvet\]/, "a reference link");
  bad(`[velvet]: ${THEME_PAGE_URL}velvet/`, /name in brackets as \[velvet\]:/, "a reference definition");
  bad(`<${THEME_PAGE_URL}velvet/>`, /form the READMEs do not use/, "an autolink");
  bad(`See ${THEME_PAGE_URL}velvet/ for Velvet.`, /form the READMEs do not use/, "a bare theme address");
  bad(`See www.gabs-utilities.com/theme/velvet/`, /form the READMEs do not use/, "a bare www. address");
  bad(`See \`${THEME_PAGE_URL}velvet/\`.`, /site's address inside a code span/, "a theme address in a code span");
  bad(`[every page](${THEME_PAGE_URL})`, /form the READMEs do not use/, "the index under other text");
  bad(`${THEME_PAGE_URL}velvet`, /form the READMEs do not use/, "the index address run on into a slug");
  bad(`[**Velvet**](${THEME_PAGE_URL}velvet/)`, /links Velvet's page as "\*\*Velvet\*\*"/, "bold inside the brackets");
  bad(`[**Velvet**](https://example.com)`, /name in brackets/, "bold name linked elsewhere");
  bad("[`Velvet`](https://example.com)", /writes Velvet's name in brackets as \[`Velvet`\]/, "a name in a code span linked elsewhere");
  bad(`[_Velvet_](https://example.com)`, /writes Velvet's name in brackets as \[_Velvet_\]/, "an italic name linked elsewhere");
  bad(`[~~Velvet~~](https://example.com)`, /writes Velvet's name in brackets as \[~~Velvet~~\]/, "a struck-through name linked elsewhere");
  bad(`![gabs-utilities.com/theme/](${THEME_PAGE_URL})`, /writes \[gabs-utilities\.com\/theme\/\]\(https:\/\/gabs-utilities\.com\/theme\/\) as an image/, "the index link as an image");
  bad(`\\[gabs-utilities.com](https://gabs-utilities.com/)`, /backslash escape \(\\\[\)|escapes \[gabs-utilities\.com\]/, "the home link escaped");
  bad(`Index:${THEME_PAGE_URL}`, /form the READMEs do not use/, "the bare index glued to the word before it, a form the READMEs do not write");
  bad(`[velvet](${THEME_PAGE_URL}velvet/)`, /links Velvet's page as "velvet"/, "another case");
  bad(`[VELVET]`, /name in brackets as \[VELVET\]/, "a shortcut reference");
  bad(`[ Velvet ](https://example.com)`, /name in brackets/, "padded name");
  bad(`[Night\nVision](https://example.com)`, /writes Night Vision's name in brackets as \[Night\\nVision\]/, "a soft line break inside the name");
  bad(`[Night  Vision](https://example.com)`, /name in brackets/, "a doubled space inside the name");
  bad(`[Aurora&nbsp;Borealis](https://example.com)`, /entity reference \(&nbsp;\)/, "an entity inside the name");
  bad(`[V&#101;lvet](https://example.com)`, /writes Velvet's name in brackets as \[Velvet\]\(https:\/\/example\.com\)/, "a numeric entity for a letter inside the name reads as the letter");
  ok(`[V&#101;lvet](${THEME_PAGE_URL}velvet/) is a theme.`, "a numeric entity for a letter inside a correct link reads as the letter");
  ok(`[V&#x0065;lvet](${THEME_PAGE_URL}velvet/) is a theme.`, "a hex entity with leading zeros for a letter");
  ok(`[Velvet](${THEME_PAGE_URL}velvet/) ships thirteen&#160;all-new palettes.`, "a numeric entity for a no-break space in prose");
  ok(`Caf&#233; dusk, &#8212; and &#x1F319; too.`, "numeric entities for non-ASCII characters in prose");
  ok(`&#49;. Velvet is a theme.`, "a numeric entity for a digit in prose");
  bad(`[Vel&#160;vet](https://example.com)`, /character outside the READMEs' alphabet \(U\+00A0\)/, "a numeric entity for a no-break space inside the name");
  bad(`[Vel&#160;vet](${THEME_PAGE_URL}velvet/)`, /links Velvet's page as "Vel\u00a0vet"/, "a numeric entity for a no-break space inside the name on the right page");
  bad(`[Vel&#8203;vet](https://example.com)`, /character outside the READMEs' alphabet \(U\+200B\)/, "a numeric entity for a zero-width space inside the name");
  bad(`[V&#1077;lvet](https://example.com)`, /character outside the READMEs' alphabet \(U\+0435\)/, "a numeric entity for a Cyrillic letter inside the name");
  bad(`&#91;Velvet](${THEME_PAGE_URL}velvet/)`, /entity reference \(&#91;\); it shows an ASCII character without its Markdown meaning/, "a numeric entity for an opening bracket");
  bad(`[Velvet&#93;(${THEME_PAGE_URL}velvet/)`, /entity reference \(&#93;\)/, "a numeric entity for a closing bracket");
  bad(`Velvet&#32;is a theme.`, /entity reference \(&#32;\); it shows an ASCII character without its Markdown meaning/, "a numeric entity for a space");
  bad(`Velvet&#10;is a theme.`, /entity reference \(&#10;\); it shows an ASCII character without its Markdown meaning/, "a numeric entity for a line feed");
  bad(`Velvet&#x26;#101; is a theme.`, /entity reference \(&#x26;\); it shows an ASCII character without its Markdown meaning/, "a numeric entity for an ampersand before a second reference");
  bad(`Velvet&#0; is a theme.`, /entity reference \(&#0;\); it names nothing CommonMark shows/, "a numeric entity for U+0000");
  bad(`Velvet&#55296; is a theme.`, /entity reference \(&#55296;\); it names nothing CommonMark shows/, "a numeric entity for a surrogate");
  bad(`Velvet&#1114112; is a theme.`, /entity reference \(&#1114112;\); it names nothing CommonMark shows/, "a numeric entity past U+10FFFF");
  bad(`Velvet&#00000101; is a theme.`, /entity reference \(&#00000101;\); it names nothing CommonMark shows/, "a decimal reference of eight digits, more than CommonMark reads (GitHub's renderer reads it, so it is not written)");
  bad(`Velvet&#x0000065; is a theme.`, /entity reference \(&#x0000065;\); it names nothing CommonMark shows/, "a hex reference of seven digits, more than CommonMark reads");
  bad(`Salt &amp; smoke`, /entity reference \(&amp;\); a named reference is not written here/, "a named entity in prose");
  bad(`Salt &foo; smoke`, /entity reference \(&foo;\); a named reference is not written here/, "an undefined named reference, which GFM shows as text");
  bad(`[x](h&#116;tps://gabs-utilities.com/theme/)`, /entity reference \(&#116;\) inside the link destination h&#116;tps:\/\/gabs-utilities\.com\/theme\//, "a numeric entity for a letter in a link destination");
  bad(`Pages: <h&#116;tps://gabs-utilities.com/theme/>`, /entity reference \(&#116;\) inside the angle brackets <h&#116;tps:/, "a numeric entity for a letter in an autolink's scheme, which GFM shows as text");
  bad(`Pages: https://g&#97;bs-utilities.com/theme/`, /entity reference \(&#97;\) inside the address https:\/\/g&#97;bs-utilities\.com\/theme\//, "a numeric entity for a letter in a bare address");
  bad(`See www.g&#97;bs-utilities.com for more.`, /entity reference \(&#97;\) inside the address www\.g&#97;bs-utilities\.com/, "a numeric entity for a letter in a www. address");
  bad(`(https://g&#97;bs-utilities.com/theme/)`, /entity reference \(&#97;\) inside the address/, "a numeric entity in a parenthesised bare address");
  bad(`<img alt="V&#101;lvet" src="x.png">`, /entity reference \(&#101;\) inside the angle brackets <img alt="V&#101;lvet" src="x\.png">/, "a numeric entity inside a tag");
  bad(`[Velvet\u00a0](https://example.com)`, /character outside the READMEs' alphabet \(U\+00A0\)/, "a no-break space");
  bad(`[Vel\u200bvet](https://example.com)`, /character outside the READMEs' alphabet \(U\+200B\)/, "a zero-width space");
  bad(`[V\u0435lvet](https://example.com)`, /character outside the READMEs' alphabet/, "a Cyrillic letter that looks Latin");
  bad(`<a href="https://example.com">Velvet</a>`, /raw <a> tag/, "a raw anchor");
  bad(`<A HREF="https://example.com">Velvet</A>`, /raw <a> tag/, "a raw anchor in capitals");
  bad(`[Aurora Borealis](https://gabs-utilities.com:443/theme/afterglow/)`, /name in brackets/, "a port on the host");
  bad(`[the darkest one](https://gabs-utilities.com:443/theme/afterglow/)`, /form the READMEs do not use/, "a port on the host, other text");
  bad(`[the darkest one](https://gabs-utilities.com./theme/afterglow/)`, /form the READMEs do not use/, "a trailing dot on the host");
  bad(`[the darkest one](//gabs-utilities.com/theme/afterglow/)`, /form the READMEs do not use/, "a scheme-relative address");
  bad(`[the darkest one](https://x@gabs-utilities.com/theme/afterglow/)`, /form the READMEs do not use/, "userinfo before the host");
  bad(`[the darkest one](https://gabs-utilities.com/%74heme/afterglow/)`, /address alphabet/, "a percent-encoded path");
  bad(`[the darkest one](https://gabs-utilities%2Ecom/theme/afterglow/)`, /address alphabet/, "a percent-encoded host");
  bad(`[the darkest one](https://gabs-utilities%2ecom/theme/afterglow/)`, /address alphabet/, "a percent-encoded host, lowercase");
  bad(`[Velvet<!--[-->](https://gabs-utilities%E3%80%82com/theme/acid/)`, /bracket or a backtick inside <|HTML \(<\) inside the bracketed text|comment inside a line|address alphabet/, "a multi-byte percent-encoded host");
  bad(`[the darkest one](https://gabs-utilities.com/theme/afterglow/)`, /links Afterglow's page as "the darkest one"/, "other text on a theme page");
  bad(`[the darkest one](https://GABS-UTILITIES.COM/theme/afterglow/)`, /form the READMEs do not use/, "the host in capitals, other text");
  bad(`[gabs-utilities.com/theme/](http://gabs-utilities.com/theme/)`, /form the READMEs do not use/, "the index link over http");
  bad(`Pages: http://gabs-utilities.com/theme/`, /form the READMEs do not use/, "the bare index over http");
  bad(`Pages: <https://gabs-utilities.com/theme/>`, /form the READMEs do not use/, "the index as an autolink");
  bad(`[the gallery](https://gabs-utilities.com/other/)`, /form the READMEs do not use/, "a directory that is not a theme page");
  bad(`[the gallery](https://gabs-utilities.com/x.html/)`, /form the READMEs do not use/, "a page with a trailing slash");
  bad(`[the gallery](https://gabs-utilities.com/Theme/velvet/)`, /form the READMEs do not use/, "the theme directory in another case");
  bad(`Gallery: https://gabs-utilities.com/theme`, /form the READMEs do not use/, "the index without its slash");
  bad(`Gallery: gabs-utilities.com`, /form the READMEs do not use/, "the host as plain text");
  bad(`[gabs-utilities.com](https://gabs-utilities.com/#vol2)`, /form the READMEs do not use/, "the home link text on another destination");
  bad(`[<b>Velvet</b>](https://example.com)`, /HTML \(<\) inside the bracketed text \[<b>Velvet<\/b>\]/, "HTML inside the brackets");
  bad(`[Velvet<!--[-->](https://evil.example/)`, /bracket or a backtick inside <|HTML \(<\) inside the bracketed text|comment inside a line/, "an inline comment carrying a bracket");
  bad(`[Vel<!-- > -->vet](https://evil.example/)`, /HTML \(<\) inside the bracketed text/, "an inline comment carrying a >");
  bad(`[Vel<span title=">">vet](https://evil.example/)`, /HTML \(<\) inside the bracketed text/, "a tag with a > in an attribute");
  bad(`Velvet<!-- note --> is a theme.`, /writes an HTML comment inside a line/, "an inline comment anywhere");
  bad("[Velvet\\\n](https://example.com)", /writes a backslash inside the bracketed text \[Velvet\\…\]/, "a hard line break (backslash before the line end) inside the name, which the reader does not see");
  bad("[Vel\\vet](https://example.com)", /backslash inside the bracketed text/, "a backslash before a letter inside the name");
  bad(`[Velvet![x](https://example.com/1x1.png)](https://evil.example/)`, /writes Velvet's name in brackets as \[Velvet!\[x\]/, "a name beside an image");
  bad(`[![Velvet](preview.png)](https://example.com)`, /writes Velvet's name as an image's alt text, !\[Velvet\]\(preview\.png\)/, "a name as an image's alt text");
  bad(`[[Velvet]](https://example.com)`, /name in brackets as \[Velvet\]/, "doubled brackets");
  bad(`[Velvet](https://gabs-utilities.com/#vol2)`, /name in brackets as \[Velvet\]\(https:\/\/gabs-utilities\.com\/#vol2\)/, "a name linked to another page on the site");
  bad(`[V&#x65;lvet](https://example.com)`, /writes Velvet's name in brackets as \[Velvet\]/, "a hex entity for a letter inside the name reads as the letter");
  bad(`[Velvet theme](https://gabs-utilities\\.com/theme/acid/)`, /address alphabet/, "a backslash escape in the host");
  bad(`[Velvet theme](https://gabs\\-utilities.com/theme/acid/)`, /address alphabet/, "a backslash escape in the host, elsewhere");
  bad(`[Velvet theme](https://gabs-utilities&#46;com/theme/acid/)`, /entity reference \(&#46;\)/, "an entity in the host");
  bad(`[Velvet theme](https://gabs-utilities&period;com/theme/acid/)`, /entity reference \(&period;\)/, "a named entity in the host");
  assert.deepEqual(
    themeLinkProblems(`Caf&#233; &#233;&#233;&#233;\n\n[V&#101;lvet](https://example.com)\nSalt &amp; smoke\nPages: https://g&#97;bs-utilities.com/theme/`, themes).map((problem) => problem.split(" ").slice(0, 2).join(" ")),
    ["line 3", "line 4", "line 5"],
    "problems name the line of the file, not of a text with the references replaced",
  );
  bad(`Velvet&#95;is a theme.`, /entity reference \(&#95;\); it shows an ASCII character/, "a numeric entity for an underscore");
  // A reference earlier on the line shifts every index between the raw and
  // the shown text; what stands before a bracket is read where the bracket is.
  bad(`Caf&#233; ![Velvet](preview.png)`, /writes Velvet's name as an image's alt text, !\[Velvet\]\(preview\.png\)/, "an image alt text after a decoded reference on the same line");
  bad(`Caf&#233; ![Velvet](${THEME_PAGE_URL}velvet/)`, /as an image \(a ! before it\), not a link/, "a theme link written as an image after a decoded reference on the same line");
  // Fourth review: what GitHub renders as text, hides, or reads past the rules' idea of an address.
  bad(`Pages: ${THEME_PAGE_URL}&#8232;`, /entity reference \(&#8232;\) inside the address/, "a reference for U+2028 ending a bare address, which GitHub's autolink runs through");
  bad(`Data: https://gabs-utilities.com/themes.json&#8232;`, /inside the address/, "a reference for U+2028 ending a file address");
  bad(`Pages: ${THEME_PAGE_URL}\u2028x end`, /address alphabet/, "a raw U+2028 inside a bare address, which GitHub's autolink runs through");
  bad(`${THEME_PAGE_URL}\u2029velvet/`, /address alphabet/, "a raw U+2029 inside a bare address");
  bad(`<div>\nhttps://gabs-utilities&#46com/theme/velvet/\n</div>`, /entity reference \(&#46\) inside the address/, "a semicolon-less reference inside an HTML block, which a browser reads");
  bad(`<div>\n&#91Velvet](https://example.com)\n</div>`, /entity reference \(&#91\); without its semicolon/, "a semicolon-less reference for a bracket inside an HTML block");
  bad(`<div>\ngabs-utilities&period com\n</div>`, /writes &period inside an HTML block/, "an ampersand before letters inside an HTML block");
  ok(`<details>\n<summary>Packs — UI kit & more</summary>\n\n| a & b | c |\n|---|---|\n`, "an ampersand before a space inside an HTML block, and one in a table");
  ok("```bash\ncd x && ./install.sh\n```", "ampersands inside a code fence");
  bad("Use `[V&#101;lvet](" + THEME_PAGE_URL + "velvet/)` in prose.", /bracket inside the code span/, "a theme link inside a code span, which GitHub shows as text");
  bad(`para\n\n    [V&#101;lvet](${THEME_PAGE_URL}velvet/)`, /^line 3 is indented 4 columns outside a code fence\. At the top level that is indented code, where Markdown shows as text/, "a theme link in indented code, which GitHub shows as text with the reference undecoded");
  bad(`para\n\n\t${velvet}`, /^line 3 is indented 4 columns outside a code fence/, "a theme link indented by a tab");
  bad(`para\n\n    See ${THEME_PAGE_URL}`, /^line 3 is indented 4 columns outside a code fence/, "the index in indented code");
  bad(`para\n\n    [Velvet](https://example.com)`, /^line 3 is indented 4 columns outside a code fence/, "a theme name in brackets in indented code");
  bad(`para\n    ${velvet}`, /^line 2 is indented 4 columns outside a code fence\. At the top level that is indented code/, "an indented line after paragraph text is the paragraph's to the walk, so the link is a link; the indentation itself fails (rule 4)");
  assert.ok(
    themeLinkProblems("## Start `\n    code\n[Velvet](https://example.com) `", themes).some((problem) => /^line 3 writes Velvet's name in brackets as \[Velvet\]\(https:\/\/example\.com\)/.test(problem)),
    "a code span does not pair backticks across indented code, so the link after it is read as a link",
  );
  bad("```\n[Velvet](" + THEME_PAGE_URL + "velvet/)\n```", /writes the theme link \[Velvet\]\([^)]*\) inside the ``` code fence opened on line 1/, "a theme link inside a code fence; the fence's backticks are no code span");
  bad("`<https://gabs-utilities.com/x.html>`", /site's address inside a code span/, "a site autolink inside a code span");
  bad(`<div align="center">\n${velvet} · [Acid](${THEME_PAGE_URL}acid/)\n</div>`, /writes the theme link \[Velvet\]\(https:\/\/gabs-utilities\.com\/theme\/velvet\/\) inside the <div> HTML block begun on line 1/, "theme links inside an HTML block, which GitHub shows as text");
  bad(`<div>\n[Velvet]\n</div>`, /writes Velvet's name in brackets inside the <div> HTML block begun on line 1/, "a bracketed theme name inside an HTML block");
  bad(`<div>\nSee ${THEME_PAGE_URL}\n</div>`, /site's address inside the <div> HTML block begun on line 1/, "the index address inside an HTML block");
  // The line that opens a block belongs to it: GitHub shows Markdown there as text too.
  bad(`Intro.\n\n<div> ${velvet}\n\nAfter.`, /writes the theme link \[Velvet\]\([^)]*\) inside the <div> HTML block begun on line 3/, "a theme link on a block tag's own line");
  bad("<div> https://gabs-utilities.com/theme/", /site's address inside the <div> HTML block begun on line 1/, "the index address on a block tag's own line");
  bad(`<pre>${velvet}\nx\n</pre>`, /theme link \[Velvet\]\([^)]*\) inside the <pre> HTML block begun on line 1/, "a theme link on the <pre> line");
  bad(`<pre>${velvet}</pre>`, /theme link \[Velvet\]\([^)]*\) inside the <pre> HTML block begun on line 1/, "a theme link inside a <pre> that opens and closes on one line");
  bad(`<!-- ${velvet}\n-->`, /theme link \[Velvet\]\([^)]*\) inside the <!-- HTML block begun on line 1/, "a theme link on the line that opens a comment");
  bad(`<!-- x --> ${velvet}`, /theme link \[Velvet\]\([^)]*\) inside the <!-- HTML block begun on line 1/, "a theme link after a comment that opens its line, which GitHub reads as one HTML block");
  bad("```" + velvet + "\ncode\n```", /theme link \[Velvet\]\([^)]*\) inside the ``` code fence opened on line 1/, "a theme link in a fence's info string, which GitHub does not show");
  // Backticks pair within one stretch of inline text: never across a blank line or a fence.
  onlyRule4("a ` b\n\n" + velvet + " ` c", "lone backticks in two paragraphs do not pair, so the link between them is a link");
  onlyRule4("a ` b\n\n```\ncode\n```\n\nc ` " + velvet, "lone backticks on either side of a fence do not pair, and the fence's own backticks pair with nothing");
  onlyRule4("<pre>`</pre>\n" + velvet + " ` x", "a backtick inside a <pre> block pairs with nothing in the prose after it");
  bad(
    `An opening paragraph with no brackets at all in it, long enough that a span measured from the wrong start would land inside it and find nothing to object to.\n\nWritten as \`${velvet}\`.`,
    /line 3 writes a bracket inside the code span|line 3 writes the theme link \[Velvet\]\([^)]*\) inside a code span/,
    "a theme link in a code span in the second paragraph, reported on its own line",
  );
  bad("a | b `" + velvet + "\n<span>\nx`", /bracket inside the code span|theme link \[Velvet\]\([^)]*\) inside a code span/, "a code span that runs through a lone tag the walk reads as a block, since GitHub reads the tag as paragraph text");
  bad(`[Velvet<span title="[">](https://example.com/evil)`, /bracket or a backtick inside <span title="\[">/, "a bracket hidden in a tag attribute, which pairs the brackets around a theme name away");
  bad(`[Velvet<b title=[>](https://example.com/evil)`, /bracket or a backtick inside </, "a bracket in an unquoted attribute");
  bad(`![Velvet<span title="[">](preview.png)`, /bracket or a backtick inside </, "a bracket hidden in a tag inside an image's alt text");
  bad("Say <span title=\"`\">x</span> `code`", /bracket or a backtick inside </, "a backtick inside a tag, which would move a code span");
  bad(`See \`[theme]\` here.`, /bracket inside the code span/, "a bracket inside a code span");
  bad("Use a | b to pipe.\n<span>\nsee gabs\\-utilities.com for more", /backslash escape/, "an escape after a lone tag the walk reads as an HTML block, where GitHub reads a paragraph");
  bad("a | b\n<span>\n```\n\n<!-- theme-links:fifty:start -->\n- x\n<!-- theme-links:fifty:end -->\n", /opens ``` inside the <span> HTML block begun on line 2/, "a fence opener inside a loosely opened HTML block, which GitHub may honour");
  bad("a | b\n<span>\n<pre>\nhidden", /opens <pre> inside the <span> HTML block/, "a <pre> opener inside a loosely opened HTML block");
  bad(`See https://gabs-utilities.com/x.htm&#108; now.`, /entity reference \(&#108;\) inside the address https:\/\/gabs-utilities\.com\/x\.htm&#108;/, "a reference ending a bare address");
  bad(`See (https://gabs-utilities.com/themes.jso&#110;) now.`, /inside the address \(https:\/\/gabs-utilities\.com\/themes\.jso&#110;\)/, "a reference ending a parenthesised address");
  bad(`(www.g&#97;bs-utilities.com)`, /inside the address \(www\.g&#97;bs-utilities\.com\)/, "a reference in a parenthesised www. address");
  bad(`< https://gabs-utilities%2Ecom/theme/velvet/ >`, /address alphabet/, "a percent-encoded host between a spaced < and >, which is text to GitHub");
  bad(`a < b https://gabs-utilities\u3002com/theme/velvet/ c > d`, /address alphabet/, "an ideographic full stop in a host between a < and a > that form no tag");
  bad(`Salt &a&#109;p; smoke`, /assembles an entity reference \(&amp;\)/, "references for letters assembling a named reference");
  bad(`Velvet &#&#120;41; here`, /assembles an entity reference \(&#x41;\)/, "references for letters assembling a numeric reference");
  ok(`&#X41;cid is a theme.`, "a hex reference with a capital X");
  bad(`Velvet&#127; is a theme.`, /entity reference \(&#127;\); it shows an ASCII character/, "a reference for DEL, an ASCII control");
  ok(`Velvet&#128; is a theme.`, "a reference for U+0080, outside ASCII, which reads as that character like a typed one");
  bad(`&#60;pre>\n${velvet}`, /entity reference \(&#60;\); it shows an ASCII character/, "a reference for <, which the walk, reading the raw text, opens no <pre> block for");
  bad(`Velvet&#x5F;is a theme.`, /entity reference \(&#x5F;\); it shows an ASCII character/, "a hex entity for an underscore");
  // Blocks are read from the raw text, as GFM reads them: &#49;. opens no list,
  // so <span> (which cannot interrupt a paragraph) continues the paragraph and
  // the escape on the next line renders, where the rule must see it.
  bad("&#49;. x\n<span>\nfoo \\[ bar", /backslash escape/, "a digit reference at the line start opens no list item");
  bad(`[Velvet theme](https://gabs-utilities\u3002com/theme/acid/)`, /address alphabet/, "an ideographic full stop in the host");
  bad(`[Velvet theme](https://gabs-utilities\uFF0Ecom/theme/acid/)`, /address alphabet/, "a fullwidth full stop in the host");
  bad(`[Velvet theme](https://\uFF47abs-utilities.com/theme/acid/)`, /address alphabet/, "a fullwidth letter in the host");
  bad(`[Velvet theme](https://gabs-util\u00ADities.com/theme/acid/)`, /address alphabet/, "a soft hyphen in the host");
  bad(`[Velvet theme](https://gabs-util\u2060ities.com/theme/acid/)`, /address alphabet/, "a word joiner in the host");
  bad(`See https://gabs-utilities\u3002com/theme/acid/ now.`, /writes the address .* address alphabet/, "a bare address with a non-ASCII host");
  bad(`See https://gabs-utilities\\.com/theme/acid/ now.`, /backslash escape|address alphabet/, "a bare address with an escape");
  bad(`<https://gabs-utilities\u3002com/>`, /writes the autolink .* address alphabet/, "an autolink with a non-ASCII host");
  bad(`See (gabs\\-utilities.com) here.`, /backslash escape \(\\-\)/, "a backslash escape in text");
  bad("Call it **Velvet**: see `gabs\\-utilities.com`", /backslash escape/, "a backslash escape in a code span that renders");
  bad("```\necho a \\| b\n```", /backslash escape/, "a backslash inside a code fence is rejected too: whether the fence is open rests on a loose reading, and a code sample does without it");
  bad(`- item\n  \`\`\`\ncode\n  \`\`\`\n\n${velvet}`, /line 3 is indented less than the code fence opened on line 2 \(2 spaces in\)/, "a fence in a list item whose content drops to column 0");
  bad(`1. \`\`\`bash\n   code\n\`\`\`\n\n${velvet}`, /line 1 opens a code fence \(\`\`\`\) that no fence at the same indentation closes/, "a fence on a list item's own line, not closed at its column");
  ok(`1. \`\`\`bash\n   code\n   \`\`\`\n\n${velvet}`, "a fence on a list item's own line, closed at its column");
  bad("text\n<!-- open\nmore", /line 2 opens an HTML comment \(<!--\) that is not closed before the next one/);
  bad("<!-- a\n<!-- b -->", /line 1 opens an HTML comment/);
  bad("text\n\n```\ncode", /line 3 opens a code fence \(```\) that no fence at the same indentation closes/);
  bad("text\n\n   ```\ncode\n```\n", /line 3 opens a code fence \(```\) that no fence at the same indentation closes/, "a closer at another indentation does not close");
  bad("text\n\n<pre>\ncode", /line 3 opens a <pre> block that never closes/);

  // Problems come in document order, one sentence each, starting with the line.
  const problems = themeLinkProblems(`${link("Verdigris", "velvet")}\n\n[Ozone][x]\n`, themes);
  assert.equal(problems.length, 2);
  assert.match(problems[0], /^line 1 /);
  assert.match(problems[1], /^line 3 /);
});

test("themeLinkProblems fails what reads one way at the top level and another under a list item, a quote or a table (rule 4)", async () => {
  const themes = await loadThemes(root);
  const velvet = link("Velvet", "velvet");
  const ok = (text, label = text) => assert.deepEqual(themeLinkProblems(text, themes), [], label);
  const bad = (text, pattern, label = text) => {
    const problems = themeLinkProblems(text, themes);
    assert.ok(problems.length > 0, `${label}: a problem is reported`);
    assert.match(problems[0], pattern, label);
  };
  const unclosed = (line) => new RegExp(String.raw`^line ${line} writes \x60 with nothing after it on that line to close it\. Whether it pairs with a backtick on another line depends on`);
  const indented = (line, columns) => new RegExp(String.raw`^line ${line} is indented ${columns} columns outside a code fence\. At the top level that is indented code`);
  const onlyIndentation = (text, label) => {
    const problems = themeLinkProblems(text, themes);
    assert.ok(problems.length > 0, `${label}: rule 4 reports it`);
    for (const problem of problems) assert.match(problem, /^line \d+ is indented \d+ columns /, label);
  };
  const afterMarker = (line, columns) => new RegExp(String.raw`^line ${line} is indented ${columns} columns after its block-quote or list marker, where GFM opens indented code inside the quote or the item and shows its Markdown as text\.`);

  // Only a space or a tab is indentation: after a marker and five spaces, a no-break space, a form
  // feed, a vertical tab, an ideographic space or a byte order mark is the first character of the
  // item's indented code. micromark and pandoc both show the link as code.
  for (const [name, character] of [["a no-break space", "\u00A0"], ["a form feed", "\f"], ["a vertical tab", "\v"], ["an ideographic space", "\u3000"], ["a byte order mark", "\uFEFF"]]) {
    bad(`-     ${character}${velvet}\n`, afterMarker(1, 4), `${name} after a dash and five spaces`);
  }
  bad(`1.      \u00A0${velvet}\n`, afterMarker(1, 5), "a no-break space after an ordered marker and six spaces");
  bad(`> -     \u3000${velvet}\n`, afterMarker(1, 4), "an ideographic space after a quote, a dash and five spaces");
  bad(`1. -\t \f   ${velvet}\n`, afterMarker(1, 4), "a form feed after a nested marker, a tab and a space");
  // A <pre> line the walk took for a block (JS \s takes in the no-break space) kept the code span on
  // its next line out of the check; GFM reads it as paragraph text, and the span runs on over the link.
  assert.ok(themeLinkProblems(`<pre\u00A0x\nText with a \x60 here\n</pre>\n${velvet} \x60 end \x60\n`, themes).some((problem) => unclosed(2).test(problem)), "<pre followed by a no-break space");

  // A code span across a line the walk reads as indented code, which GFM keeps in the paragraph
  // (a pipe line with no delimiter row, a list item, a quote and an autolink line are paragraph text):
  // the backticks pair and the link shows as code.
  for (const first of ["Themes | `open", "- item `open", "> quote `open", "<https://example.com> `open"]) {
    bad(`${first}\n    more\n${velvet} close\x60\n`, unclosed(1), `${first}: the span runs on across an indented continuation line`);
  }
  bad(`Themes | \x60open ${velvet}\n    more\nclose\x60\n`, /^line 1 writes \x60 with nothing after it on that line/, "the link on the span's first line");
  bad(`- Pick a theme, for example \x60${velvet}\n    \x60 is a good start.\n`, unclosed(1), "a span closed on a four-space continuation line of a list item");
  // A code span across a heading, a thematic break, a setext underline or a table row: GFM ends the
  // block there, so a backtick left open on one side does not pair with the other, and the pairing
  // after it shifts. Rendered with micromark and GFM, each shows the link as code.
  bad(`## A \x60\nx \x60 ${velvet} \x60y\x60\n`, unclosed(1), "a backtick left open in a heading");
  bad(`x \x60\n***\ny \x60 ${velvet} \x60z\x60\n`, unclosed(1), "a backtick left open before a thematic break");
  bad(`Title \x60\n===\ny \x60 ${velvet} \x60z\x60\n`, unclosed(1), "a backtick left open in a setext heading");
  bad(`| a | b |\n| --- | --- |\n| \x60 | c |\n| d \x60 ${velvet} \x60 | e |\n`, unclosed(3), "a backtick left open in a table row");
  bad(`| a | b |\n| --- | --- |\n| \x60a | b \x60 ${velvet} \x60 |\n`, /^line 3 writes a pipe inside the code span \x60a \| b \x60\. In a table row GFM splits the cells at every pipe/, "a code span across a table cell's pipe");
  ok("`a` and ``b ` c``\nnext `d`", "spans that close on their own lines, one of them holding a backtick");
  ok("| `a` | `b` |\n| --- | --- |\n| `c` | d |", "spans inside table cells");
  ok("```\n` | `\n```", "a backtick or a pipe inside a fence is the fence's");
  ok("<pre>\n`\n</pre>", "a backtick inside a <pre> block is the block's");

  // A line indented four columns, which under a list item is the item's: a fence or a <pre> opened
  // there runs on past the item's next line, and the link in it shows as text.
  bad(`- item\n\n    \x60\x60\x60\n  ${velvet}\n`, indented(3, 4), "a fence indented four columns under a list item");
  bad(`- item\n    \x60\x60\x60\n  ${velvet}\n`, indented(2, 4), "a fence indented four columns right after a list item");
  bad(`- item\n\n    <pre>\n\n  ${velvet}\n`, indented(3, 4), "a <pre> indented four columns under a list item");
  bad(`- item\n  <span>\n    <pre>\n\n  ${velvet}\n`, indented(3, 4), "a <pre> indented four columns inside a loosely opened HTML block");
  bad(`| a | b |\n|---|---|\nbar\n    ${velvet}\n`, indented(4, 4), "after a table row written without a pipe, which GFM reads as a row, so the line is code");
  bad("para\n\n\tcode", indented(3, 4), "a tab is four columns");
  // The link on such a line is not named as text: under a list item it is a link, so the line's
  // indentation is the one problem.
  onlyIndentation(`para\n\n    ${velvet}`, "a theme link on a line indented after a blank line");
  onlyIndentation(`1. Update Claude Code\n    - Try ${velvet} first`, "a nested item indented four columns, whose link GitHub renders as a link");
  onlyIndentation(`1. Select one.\n\n    ${velvet} is a good start.`, "a continuation paragraph indented four columns");
  ok("- item\n   three spaces in", "three columns is the item's text and opens nothing");
  ok("```\n    code\n```", "an indented line inside a fence is the fence's");
  ok("<pre>\n    code\n</pre>", "an indented line inside a <pre> block is the block's");
  ok("<!--\n    note\n-->", "an indented line inside a comment is the comment's");

  // Indented code after a block-quote or list marker on the same line: the link shows as code.
  bad(`> quote\n>\n>     ${velvet}\n`, afterMarker(3, 4), "four columns after a quote marker and its space");
  bad(`>     ${velvet}\n`, afterMarker(1, 4), "a quote that starts with indented code");
  bad(`-     ${velvet}\n`, afterMarker(1, 4), "a list item that starts with indented code: the marker, then five columns");
  bad(`1.     ${velvet}\n`, afterMarker(1, 4), "an ordered item that starts with indented code");
  bad(`>     ${THEME_PAGE_URL}\n`, afterMarker(1, 4), "the index in a quote's indented code");
  bad(`>\t\t${velvet}\n`, afterMarker(1, 7), "tabs after a quote marker");
  bad(`-\t\t${velvet}\n`, afterMarker(1, 7), "tabs after a list marker");
  bad(`-\t  ${velvet}\n`, afterMarker(1, 5), "a tab and spaces after a list marker");
  bad(`> - >     ${velvet}\n`, afterMarker(1, 4), "nested markers");
  ok(`-    ${velvet}`, "four columns after a list marker are the item's text");
  ok(`>    ${velvet}`, "the quote's own space, then three columns, are the quote's text");
  ok(`> ${velvet}\n>     \n> more`, "a quote line of spaces is blank");
  ok("- - -\n\n* * *", "thematic breaks made of list-marker characters");

  // GitHub reads CR LF as one line ending and skips a byte order mark at the start of the file.
  bad(`para\r\n\r\n    ${velvet}\r\n`, /^line 1 writes a carriage return\. GFM reads CR LF as one line ending/, "a blank line that ends in a carriage return");
  bad(`\uFEFF    ${velvet}\n\n# Title`, /^line 1 starts with a byte order mark \(U\+FEFF\)\. GitHub skips it/, "a byte order mark before an indented first line");
  bad("\uFEFF```\n" + velvet, /^line 1 starts with a byte order mark/, "a byte order mark before a fence");
});

// --- the verifier, red then green ----------------------------------------------------------

test("the verifier passes on the repository as it is, and the builder changes nothing", async (t) => {
  const fixtureRoot = await makeFixture(t);
  await expectGreen(fixtureRoot);
  const before = await Promise.all(README_PATHS.map((path) => readFile(join(fixtureRoot, path), "utf8")));
  const built = await runBuilder(fixtureRoot);
  assert.equal(built.code, 0, built.stderr);
  assert.match(built.stdout, /Wrote 3 theme-link blocks into 2 READMEs/);
  const after = await Promise.all(README_PATHS.map((path) => readFile(join(fixtureRoot, path), "utf8")));
  assert.deepEqual(after, before, "the builder is idempotent");
});

test("a theme left out of a README list fails as stale, and the builder puts it back", async (t) => {
  const fixtureRoot = await makeFixture(t);
  await editOnce(fixtureRoot, "README.md", `${link("Neon Noir", "neon-noir")} · ${link("Ozone", "ozone")}`, link("Neon Noir", "neon-noir"));
  await expectRed(fixtureRoot, /README\.md, vol2 theme-links block: stale\. It is not what scripts\/build-readme-theme-links\.mjs renders/);
  const built = await runBuilder(fixtureRoot);
  assert.equal(built.code, 0, built.stderr);
  const readme = await readFile(join(fixtureRoot, "README.md"), "utf8");
  assert.ok(readme.includes(`${link("Neon Noir", "neon-noir")} · ${link("Ozone", "ozone")}`), "the builder restored Ozone");
  await expectGreen(fixtureRoot);
});

test("a Vol. 2 row sending a name to another theme's page fails, and the builder fixes the link and keeps the mood", async (t) => {
  const fixtureRoot = await makeFixture(t);
  const path = "plugins/dark-themes-vol-2/README.md";
  await editOnce(fixtureRoot, path, `| ${link("Ozone", "ozone")} | Electric periwinkle after the storm |`, `| ${link("Ozone", "afterglow")} | Electric periwinkle after the storm |`);
  await expectRed(fixtureRoot, /plugins\/dark-themes-vol-2\/README\.md line \d+ links Afterglow's page as "Ozone"; that page is Afterglow's/);
  const built = await runBuilder(fixtureRoot);
  assert.equal(built.code, 0, built.stderr);
  const table = await readFile(join(fixtureRoot, path), "utf8");
  assert.ok(table.includes(`| ${link("Ozone", "ozone")} | Electric periwinkle after the storm |`), "the link is Ozone's own page again and the mood survived");
  await expectGreen(fixtureRoot);
});

test("a Vol. 2 row dropped from the table cannot be rendered, and the message says which row to add", async (t) => {
  const fixtureRoot = await makeFixture(t);
  await editOnce(fixtureRoot, "plugins/dark-themes-vol-2/README.md", `| ${link("Ozone", "ozone")} | Electric periwinkle after the storm |\n`, "");
  await expectRed(fixtureRoot, /cannot be rendered: plugins\/dark-themes-vol-2\/README\.md \(vol2-table block\): the table has no row for Ozone; add one as \| \[Ozone\]/);
});

test("a code fence opened before a list hides it, and the verifier says so", async (t) => {
  const fixtureRoot = await makeFixture(t);
  await editOnce(fixtureRoot, "README.md", "## The 50 themes\n", "## The 50 themes\n\n```\n");
  await expectRed(fixtureRoot, /README\.md line \d+ writes the theme link \[[A-Za-z]+\]\([^)]*\) inside the ``` code fence opened on line \d+, where it is text, not a link/);
  await editOnce(fixtureRoot, "README.md", "## The 50 themes\n\n```\n", "## The 50 themes\n");
  await expectGreen(fixtureRoot);
});

test("an unclosed HTML comment above the lists fails before anything else", async (t) => {
  const fixtureRoot = await makeFixture(t);
  await editOnce(fixtureRoot, "README.md", "## The 50 themes\n", "## The 50 themes\n\n<!-- to do\n");
  await expectRed(fixtureRoot, /README\.md line \d+ opens an HTML comment \(<!--\) that is not closed before the next one/);
});

test("a missing marker, a marker sharing its line, or no blank line around a marker fails", async (t) => {
  const fixtureRoot = await makeFixture(t);
  const start = startMarker("fifty");
  await editOnce(fixtureRoot, "README.md", `${start}\n\n`, "");
  await expectRed(fixtureRoot, /README\.md, fifty theme-links block: no <!-- theme-links:fifty:start -->\. Write it on a line of its own/);
  await editOnce(fixtureRoot, "README.md", `${link("Absinthe", "absinthe")} ·`, `  ${start}\n\n${link("Absinthe", "absinthe")} ·`);
  await expectRed(fixtureRoot, /<!-- theme-links:fifty:start --> shares its line with other text; the marker is a line of its own/);
  await editOnce(fixtureRoot, "README.md", `  ${start}\n\n`, `${start}\n\n`);
  await expectGreen(fixtureRoot);
  await editOnce(fixtureRoot, "README.md", `\n\n${start}`, `\n${start}`);
  await expectRed(fixtureRoot, /the block needs a blank line before <!-- theme-links:fifty:start --> and after <!-- theme-links:fifty:end -->/);
  await editOnce(fixtureRoot, "README.md", `\n${start}`, `\n\n${start}`);
  await expectGreen(fixtureRoot);
  await editOnce(fixtureRoot, "README.md", `${endMarker("fifty")}\n\n`, `${endMarker("fifty")}\n`);
  await expectRed(fixtureRoot, /the block needs a blank line before <!-- theme-links:fifty:start --> and after <!-- theme-links:fifty:end -->/);
});

test("a theme name linked to the wrong page, as a reference, or as an image fails wherever it is written", async (t) => {
  const fixtureRoot = await makeFixture(t);
  const velvet = link("Velvet", "velvet");
  await editOnce(fixtureRoot, "README.md", velvet, link("Verdigris", "velvet"));
  await expectRed(fixtureRoot, /README\.md line \d+ links Velvet's page as "Verdigris"; that page is Velvet's/);
  await editOnce(fixtureRoot, "README.md", link("Verdigris", "velvet"), "[Velvet][velvet]");
  await writeFile(join(fixtureRoot, "README.md"), `${await readFile(join(fixtureRoot, "README.md"), "utf8")}\n[velvet]: ${THEME_PAGE_URL}velvet/\n`);
  await expectRed(fixtureRoot, /README\.md line \d+ writes Velvet's name in brackets as \[Velvet\]\[velvet\]; a theme name in brackets is its link/);
  await editOnce(fixtureRoot, "README.md", "[Velvet][velvet]", `!${velvet}`);
  await editOnce(fixtureRoot, "README.md", `\n[velvet]: ${THEME_PAGE_URL}velvet/\n`, "");
  await expectRed(fixtureRoot, /README\.md line \d+ writes \[Velvet\]\(https:\/\/gabs-utilities\.com\/theme\/velvet\/\) as an image/);
  await editOnce(fixtureRoot, "README.md", `!${velvet}`, velvet);
  await expectGreen(fixtureRoot);
});

test("the 50-theme plugin README must point at the theme page index on a line that renders", async (t) => {
  const fixtureRoot = await makeFixture(t);
  const path = "plugins/50-dark-themes/README.md";
  const index = /plugins\/50-dark-themes\/README\.md must carry the theme page index https:\/\/gabs-utilities\.com\/theme\/ on a line of its own with a blank line before and after it, where it renders/;
  await editOnce(fixtureRoot, path, `\n\n${THEME_PAGE_URL}\n`, "\n");
  await expectRed(fixtureRoot, index);
  // Directly under the sentence it is that paragraph's second line, which a reference definition or a
  // table could swallow; the rule asks for a paragraph of its own.
  await editOnce(fixtureRoot, path, "and the measured contrast:\n", `and the measured contrast:\n${THEME_PAGE_URL}\n`);
  await expectRed(fixtureRoot, index);
  await editOnce(fixtureRoot, path, `contrast:\n${THEME_PAGE_URL}\n`, `contrast:\n\n${THEME_PAGE_URL}\n`);
  await expectGreen(fixtureRoot);
  // The line after it is that paragraph's too: a table's delimiter row or a setext underline would
  // make the address a cell or a heading, so the rule asks for a blank line after it as well.
  await editOnce(fixtureRoot, path, `${THEME_PAGE_URL}\n\nSource and manual`, `${THEME_PAGE_URL}\nSource and manual`);
  await expectRed(fixtureRoot, index);
  await editOnce(fixtureRoot, path, `${THEME_PAGE_URL}\nSource and manual`, `${THEME_PAGE_URL}\n\nSource and manual`);
  await expectGreen(fixtureRoot);
  await editOnce(fixtureRoot, path, "One page per theme", "```text\nOne page per theme");
  await editOnce(fixtureRoot, path, `${THEME_PAGE_URL}\n`, `${THEME_PAGE_URL}\n\`\`\`\n`);
  await expectRed(fixtureRoot, /site's address inside the ``` code fence opened on line \d+/);
  await editOnce(fixtureRoot, path, "```text\nOne page per theme", "One page per theme");
  await editOnce(fixtureRoot, path, `${THEME_PAGE_URL}\n\`\`\`\n`, `${THEME_PAGE_URL}\n`);
  await expectGreen(fixtureRoot);
  // A fence opener after a lone tag that follows a pipe line: the walk reads an HTML block, GitHub a
  // paragraph and then the fence, which swallows the address.
  await editOnce(fixtureRoot, path, `contrast:\n\n${THEME_PAGE_URL}\n`, `contrast:\n\na | b\n<span>\n\`\`\`\n\n${THEME_PAGE_URL}\n`);
  await expectRed(fixtureRoot, /opens ``` inside the <span> HTML block begun on line \d+/);
});


test("the shapes a second review found pass the raw-text rules in spirit but not in fact: a list-item fence, a wrapped name, a raw anchor", async (t) => {
  const fixtureRoot = await makeFixture(t);
  // A fence indented inside a list item, "closed" at column 0: CommonMark ends the list there and opens a
  // new fence, so both lists would render as code.
  await editOnce(fixtureRoot, "README.md", "## The 50 themes\n", "## The 50 themes\n\n1. Add the marketplace:\n   ```bash\n   claude plugin marketplace add notgabriels-sys/claude-code-50-dark-themes\n```\n");
  await expectRed(fixtureRoot, /README\.md line \d+ opens a code fence \(```\) that no fence at the same indentation closes/);
  await editOnce(fixtureRoot, "README.md", "## The 50 themes\n\n1. Add the marketplace:\n   ```bash\n   claude plugin marketplace add notgabriels-sys/claude-code-50-dark-themes\n```\n", "## The 50 themes\n");
  await expectGreen(fixtureRoot);
  // A theme name wrapped over two lines, sent to another theme's page through a port on the host.
  await editOnce(fixtureRoot, "README.md", "## The 12 Vol. 2 themes\n", "## The 12 Vol. 2 themes\n\nThe pack opens with [Aurora\nBorealis](https://gabs-utilities.com:443/theme/afterglow/), mint-green.\n");
  await expectRed(fixtureRoot, /README\.md line \d+ writes Aurora Borealis's name in brackets as \[Aurora\\nBorealis\]\(https:\/\/gabs-utilities\.com:443\/theme\/afterglow\/\)/);
  await editOnce(fixtureRoot, "README.md", "\nThe pack opens with [Aurora\nBorealis](https://gabs-utilities.com:443/theme/afterglow/), mint-green.\n", "");
  // A raw anchor, which Markdown passes through.
  await editOnce(fixtureRoot, "plugins/dark-themes-vol-2/README.md", "## The themes\n", "## The themes\n\nStart with <a href=\"https://example.com\">Ozone</a>.\n");
  await expectRed(fixtureRoot, /plugins\/dark-themes-vol-2\/README\.md line \d+ writes a raw <a> tag/);
});

test("two themes may not share a page or a name in another case, and an end marker before its start is named as such", async () => {
  const fake = (name, slug, pack) => ({ name, slug, pack: { id: pack } });
  const themes = await loadThemes(root);
  assert.doesNotThrow(() => assertDistinctPages(themes));
  assert.doesNotThrow(() => assertDistinctPages([fake("Ink", "ink", "50-dark-themes"), fake("Ozone", "ozone", "dark-themes-vol-2")]));
  assert.throws(
    () => assertDistinctPages([fake("Ink", "ink", "50-dark-themes"), fake("Ink Two", "ink", "dark-themes-vol-2")]),
    /"Ink" \(50-dark-themes\) and "Ink Two" \(dark-themes-vol-2\) would share the page https:\/\/gabs-utilities\.com\/theme\/ink\/; rename one/,
  );
  assert.throws(
    () => assertDistinctPages([fake("Ink", "ink", "50-dark-themes"), fake("INK", "ink-2", "dark-themes-vol-2")]),
    /"Ink" \(50-dark-themes\) and "INK" \(dark-themes-vol-2\) are the same name in another case; rename one/,
  );
  assert.throws(() => findBlock(`${endMarker("k")}\n\n${startMarker("k")}`, "k"), /<!-- theme-links:k:end --> comes before <!-- theme-links:k:start -->; the start marker goes first/);
  assert.throws(() => findBlock(`${startMarker("k")}\n`, "k"), /no <!-- theme-links:k:start --> … <!-- theme-links:k:end --> block/);
});

test("markers: blank lines may hold spaces; a doubled, unregistered or misplaced marker fails; so do CR LF line endings", async (t) => {
  const fixtureRoot = await makeFixture(t);
  const start = startMarker("fifty");
  await editOnce(fixtureRoot, "README.md", `\n\n${start}`, `\n \t\n${start}`);
  await expectGreen(fixtureRoot);

  const readmePath = join(fixtureRoot, "README.md");
  const readme = await readFile(readmePath, "utf8");
  await writeFile(readmePath, `${readme}\n${endMarker("vol2")}\n`);
  await expectRed(fixtureRoot, /README\.md, vol2 theme-links block: <!-- theme-links:vol2:end --> appears 2 times; it appears once/);
  await writeFile(readmePath, `${readme}\n${startMarker("vol3")}\n`);
  await expectRed(fixtureRoot, /README\.md carries <!-- theme-links:vol3:start -->, but no theme-links block with that key belongs in this file/);
  await writeFile(readmePath, `${readme}\n${startMarker("vol2-table")}\n`);
  await expectRed(fixtureRoot, /README\.md carries <!-- theme-links:vol2-table:start -->, but no theme-links block with that key belongs in this file/);
  await writeFile(readmePath, readme.replace(/\n/g, "\r\n"));
  await expectRed(fixtureRoot, /README\.md has carriage returns \(CR LF line endings\); the READMEs use LF line endings only/);
  await writeFile(readmePath, readme);
  await expectGreen(fixtureRoot);

  // The Vol. 2 table with its markers swapped cannot be rendered, and the message says which comes first.
  const tablePath = "plugins/dark-themes-vol-2/README.md";
  const table = await readFile(join(fixtureRoot, tablePath), "utf8");
  const swapped = table.replace(startMarker("vol2-table"), "@@START@@").replace(endMarker("vol2-table"), startMarker("vol2-table")).replace("@@START@@", endMarker("vol2-table"));
  await writeFile(join(fixtureRoot, tablePath), swapped);
  await expectRed(fixtureRoot, /cannot be rendered: plugins\/dark-themes-vol-2\/README\.md \(vol2-table block\): <!-- theme-links:vol2-table:end --> comes before <!-- theme-links:vol2-table:start -->/);
});

test("the theme page index fails inside an HTML block or as the destination of a reference written above it", async (t) => {
  const fixtureRoot = await makeFixture(t);
  const path = "plugins/50-dark-themes/README.md";
  const index = /must carry the theme page index https:\/\/gabs-utilities\.com\/theme\/ on a line of its own with a blank line before and after it, where it renders/;
  await editOnce(fixtureRoot, path, `\n${THEME_PAGE_URL}\n`, `\n<p align="center">\n${THEME_PAGE_URL}\n</p>\n`);
  await expectRed(fixtureRoot, /site's address inside the <p> HTML block begun on line \d+/);
  await editOnce(fixtureRoot, path, `\n<p align="center">\n${THEME_PAGE_URL}\n</p>\n`, `\n\n[pages]:\n${THEME_PAGE_URL}\n`);
  await expectRed(fixtureRoot, index);
  // A label or a title that spans lines swallows the address without a "]:" on the line above.
  await editOnce(fixtureRoot, path, `\n\n[pages]:\n${THEME_PAGE_URL}\n`, `\n\n[\n${THEME_PAGE_URL}\n]: https://example.com/\n`);
  await expectRed(fixtureRoot, index);
  await editOnce(fixtureRoot, path, `\n\n[\n${THEME_PAGE_URL}\n]: https://example.com/\n`, `\n\n[guide]: https://example.com/ "\n${THEME_PAGE_URL}\n"\n`);
  await expectRed(fixtureRoot, index);
  await editOnce(fixtureRoot, path, `\n\n[guide]: https://example.com/ "\n${THEME_PAGE_URL}\n"\n`, `\n${THEME_PAGE_URL}\n`);
  await expectGreen(fixtureRoot);
});

test("the builder refuses a Vol. 2 theme that would take a page of the fifty", async (t) => {
  const fixtureRoot = await makeFixture(t);
  const themesDir = join(fixtureRoot, "plugins/dark-themes-vol-2/themes");
  const ozone = JSON.parse(await readFile(join(themesDir, "ozone.json"), "utf8"));
  await writeFile(join(themesDir, "velvet.json"), `${JSON.stringify({ ...ozone, name: "Velvet" }, null, 2)}\n`);
  const previewsPath = join(fixtureRoot, "plugins/dark-themes-vol-2/previews.json");
  const previews = JSON.parse(await readFile(previewsPath, "utf8"));
  await writeFile(previewsPath, `${JSON.stringify({ ...previews, Velvet: previews.Ozone }, null, 2)}\n`);
  await assert.rejects(
    buildReadmeThemeLinks(pathToFileURL(`${fixtureRoot}${sep}`)),
    /"Velvet" \(50-dark-themes\) and "Velvet" \(dark-themes-vol-2\) would share the page https:\/\/gabs-utilities\.com\/theme\/velvet\/; rename one/,
  );
});

test("the shapes a third review found fail in the files themselves: a lone tag after a heading, a list-item fence, inline HTML in link text, an escaped host, a quoted marker", async (t) => {
  const fixtureRoot = await makeFixture(t);
  const velvet = link("Velvet", "velvet");
  // An image tag right under a heading opens an HTML block that swallows the fence opener below it,
  // so the closer opens a fence instead, and both lists render as code.
  const shape = '## The 50 themes\n<img src="preview.png" alt="The fifty" width="800">\n```bash\n./install.sh --list\n\n./install.sh acid\n```\n';
  await editOnce(fixtureRoot, "README.md", "## The 50 themes\n", shape);
  await expectRed(fixtureRoot, /README\.md line \d+ opens ``` inside the <img> HTML block begun on line \d+\. If GitHub reads that block as HTML, the ``` is swallowed/);
  await editOnce(fixtureRoot, "README.md", shape, "## The 50 themes\n");
  await expectGreen(fixtureRoot);
  // A fence inside a list item whose content drops to column 0.
  await editOnce(fixtureRoot, "README.md", "## The 50 themes\n", "## The 50 themes\n\n- Try:\n  ```\ncode\n  ```\n");
  await expectRed(fixtureRoot, /README\.md line \d+ is indented less than the code fence opened on line \d+ \(2 spaces in\)/);
  await editOnce(fixtureRoot, "README.md", "## The 50 themes\n\n- Try:\n  ```\ncode\n  ```\n", "## The 50 themes\n");
  // Inline HTML inside link text, a bare theme name as the reader sees it.
  await editOnce(fixtureRoot, "README.md", "## Note on backgrounds\n", "Start with [Velvet<!--[-->](https://example.com/).\n\n## Note on backgrounds\n");
  await expectRed(fixtureRoot, /README\.md line \d+ writes (a bracket or a backtick inside <!--\[-->|HTML \(<\) inside the bracketed text|an HTML comment inside a line)/);
  await editOnce(fixtureRoot, "README.md", "Start with [Velvet<!--[-->](https://example.com/).\n\n", "");
  // A theme page reached through an escaped host, under another theme's name.
  await editOnce(fixtureRoot, "README.md", "## Note on backgrounds\n", "Start with [Velvet theme](https://gabs-utilities\\.com/theme/acid/).\n\n## Note on backgrounds\n");
  await expectRed(fixtureRoot, /README\.md line \d+ writes the link destination https:\/\/gabs-utilities\\\.com\/theme\/acid\/ with a character outside the address alphabet/);
  await editOnce(fixtureRoot, "README.md", "Start with [Velvet theme](https://gabs-utilities\\.com/theme/acid/).\n\n", "");
  await expectGreen(fixtureRoot);
  // A start marker quoted before the real block: the builder refuses rather than overwrite the text between.
  const quoted = "## Note on backgrounds\n\nThe list sits after `<!-- theme-links:fifty:start -->`.\n";
  await editOnce(fixtureRoot, "README.md", "## Note on backgrounds\n", quoted);
  const before = await readFile(join(fixtureRoot, "README.md"), "utf8");
  const built = await runBuilder(fixtureRoot);
  assert.notEqual(built.code, 0, "the builder refuses");
  assert.match(built.stderr, /<!-- theme-links:fifty:start --> appears 2 time\(s\) and <!-- theme-links:fifty:end --> 1; each appears once/);
  assert.equal(await readFile(join(fixtureRoot, "README.md"), "utf8"), before, "the README is untouched");
  // The verifier sees the quoted marker as a comment inside a line first; the doubled marker is the next rule.
  await expectRed(fixtureRoot, /README\.md line \d+ writes an HTML comment inside a line|appears 2 times; it appears once/);
  await editOnce(fixtureRoot, "README.md", quoted, "## Note on backgrounds\n");
  await expectGreen(fixtureRoot);
  // Whitespace drift inside the Vol. 2 table is stale, and the builder restores the exact bytes.
  const tablePath = "plugins/dark-themes-vol-2/README.md";
  await editOnce(fixtureRoot, tablePath, "|---|---|\n", "| --- | --- |\n");
  await expectRed(fixtureRoot, /plugins\/dark-themes-vol-2\/README\.md, vol2-table theme-links block: stale/);
  const rebuilt = await runBuilder(fixtureRoot);
  assert.equal(rebuilt.code, 0, rebuilt.stderr);
  assert.ok((await readFile(join(fixtureRoot, tablePath), "utf8")).includes("|---|---|\n"), "the delimiter row is the builder's again");
  await expectGreen(fixtureRoot);
  // The plugin README's index line indented into a code block, or after a lone tag, does not render.
  const path = "plugins/50-dark-themes/README.md";
  await editOnce(fixtureRoot, path, `\n${THEME_PAGE_URL}\n`, `\n    ${THEME_PAGE_URL}\n`);
  await expectRed(fixtureRoot, /plugins\/50-dark-themes\/README\.md line \d+ is indented 4 columns outside a code fence\. At the top level that is indented code/);
  await editOnce(fixtureRoot, path, `\n    ${THEME_PAGE_URL}\n`, `\n${THEME_PAGE_URL}\n`);
  // A lone tag after the sentence is that paragraph's text and the address, in a paragraph of its own,
  // still renders; after a blank line the tag opens an HTML block that swallows the address.
  const tag = '<img src="../../preview.png" alt="The fifty" width="700">';
  await editOnce(fixtureRoot, path, `contrast:\n\n${THEME_PAGE_URL}\n`, `contrast:\n${tag}\n\n${THEME_PAGE_URL}\n`);
  await expectGreen(fixtureRoot);
  await editOnce(fixtureRoot, path, `contrast:\n${tag}\n\n${THEME_PAGE_URL}\n`, `contrast:\n\n${tag}\n${THEME_PAGE_URL}\n`);
  await expectRed(fixtureRoot, /site's address inside the <img> HTML block begun on line \d+|must carry the theme page index .* where it renders/);
  await editOnce(fixtureRoot, path, `contrast:\n\n${tag}\n${THEME_PAGE_URL}\n`, `contrast:\n\n${THEME_PAGE_URL}\n`);
  await expectGreen(fixtureRoot);
});

test("a theme link indented four spaces after a blank line is code on GitHub, and the verifier says so", async (t) => {
  const fixtureRoot = await makeFixture(t);
  await editOnce(fixtureRoot, "README.md", "\n## More dark tools\n", `\n    ${link("Velvet", "velvet")} is a theme.\n\n## More dark tools\n`);
  await expectRed(fixtureRoot, /README\.md line \d+ is indented 4 columns outside a code fence\. At the top level that is indented code, where Markdown shows as text/);
});

test("a backtick left open in a heading, or indented code after a quote marker, shows a theme link as code on GitHub, and the verifier says so", async (t) => {
  const heading = await makeFixture(t);
  await editOnce(heading, "README.md", "\n## More dark tools\n", `\n## Pick one \x60\n\nA start \x60 ${link("Velvet", "velvet")} \x60here\x60.\n\n## More dark tools\n`);
  await expectRed(heading, /README\.md line \d+ writes \x60 with nothing after it on that line to close it\./);
  const quote = await makeFixture(t);
  await editOnce(quote, "plugins/50-dark-themes/README.md", "\n\nSource and manual installation:", `\n\n> Tip:\n>\n>     ${link("Velvet", "velvet")}\n\nSource and manual installation:`);
  await expectRed(quote, /plugins\/50-dark-themes\/README\.md line \d+ is indented 4 columns after its block-quote or list marker, where GFM opens indented code inside the quote or the item and shows its Markdown as text\./);
});
