#!/usr/bin/env node
// Renders the theme lists in the READMEs: every theme's name linked to its page
// on the site (theme/<slug>/, built from the same theme files). Each list sits
// between two HTML comments; verify.mjs renders the block again from today's
// theme files and fails when the README carries anything else between the
// markers, so a README can never name a theme the pack no longer has, leave one
// out, or send a name to another theme's page.
//
//   node scripts/build-readme-theme-links.mjs   rewrites the blocks in place
//
// README.md carries the list of the fifty and the list of the twelve Vol. 2
// themes, two names to a line. plugins/dark-themes-vol-2/README.md carries its
// table of the twelve with a one-line mood beside each; the moods are copy that
// lives only in that README, so the renderer carries them over from the rows
// already between the markers, and only the names, the links and the layout
// come from the theme files.
//
// The module also holds the two readers verify.mjs applies around the blocks:
// markdownFlow, which says whether a line of a README renders as an ordinary
// block or sits inside something that swallows link syntax, and
// themeLinkProblems, which holds every theme-page address in a README to one
// written form.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { loadThemes } from "./build-theme-pages.mjs";

export const THEME_PAGE_URL = "https://gabs-utilities.com/theme/";
export const README_PATHS = ["README.md", "plugins/50-dark-themes/README.md", "plugins/dark-themes-vol-2/README.md"];
export const THEME_LINK_BLOCKS = [
  { path: "README.md", key: "fifty", pack: "50-dark-themes", layout: "list" },
  { path: "README.md", key: "vol2", pack: "dark-themes-vol-2", layout: "list" },
  { path: "plugins/dark-themes-vol-2/README.md", key: "vol2-table", pack: "dark-themes-vol-2", layout: "table" },
];
export const startMarker = (key) => `<!-- theme-links:${key}:start -->`;
export const endMarker = (key) => `<!-- theme-links:${key}:end -->`;

// A name is written between [ and ], so it has to read as one: letters, digits,
// spaces and hyphens, nothing Markdown gives a meaning to. (slugOf turns such a
// name into a slug of lowercase letters, digits and hyphens, which is also the
// only slug shape the readers below accept.)
const NAME = /^[A-Za-z0-9][A-Za-z0-9 -]*$/;
export function pageLink(theme) {
  if (!NAME.test(theme.name)) {
    throw new Error(`${theme.name}: the name carries a character Markdown reads as syntax; a theme name is letters, digits, spaces and hyphens.`);
  }
  return `[${theme.name}](${THEME_PAGE_URL}${theme.slug}/)`;
}

// Lists are in code-point order of the name ("VU Meter" before "Velvet"): the
// same on every machine, which a locale-aware sort is not, and the block is
// compared byte for byte in CI.
export const byName = (themes) => [...themes].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

// Two names to a line, joined by " · ", every line but the last ending in " ·".
export function renderThemeList(themes) {
  const links = themes.map(pageLink);
  const lines = [];
  for (let index = 0; index < links.length; index += 2) lines.push(links.slice(index, index + 2).join(" · "));
  return lines.join(" ·\n");
}

// A mood is a table cell beside a link, so it is plain words: letters (the
// Latin-1 ones included, so "Dämmerung" reads), digits, spaces and sentence
// punctuation, dashes and the ampersand among it. A pipe, bracket, backtick,
// angle bracket, asterisk, underscore or hash in it would change what the row
// renders as, so none of those is allowed.
const MOOD = /^[A-Za-z0-9\u00C0-\u00FF"\u2018\u201C(][A-Za-z0-9\u00C0-\u00FF ,.;:!?&'"\u2018\u2019\u201C\u201D\u2026()\u2013\u2014-]*$/;
// Nothing GFM would turn into a link or a character the reader cannot see written.
const MOOD_ADDRESS = /www\.|:\/\/|@|&[#A-Za-z]/i;
// A row of two cells; the outer pipes are optional in GFM, so they are here.
const TABLE_ROW = /^\s*\|?\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|?\s*$/;
const DELIMITER_ROW = /^\s*\|?\s*:?-+:?\s*\|\s*:?-+:?\s*\|?\s*$/;

// The moods written between the markers of a table block, by theme name. The
// name cell may be written bare or as any link, so the renderer can pick the
// moods up from a table written before the links existed; what it writes back
// is the canonical link. The first row is the header when it names no theme,
// so a table without one still reads.
export function readMoods(block, themes, pack) {
  const names = new Set(themes.map((theme) => theme.name));
  const moods = new Map();
  let first = true;
  for (const rawLine of block.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (DELIMITER_ROW.test(line)) continue;
    const row = line.match(TABLE_ROW);
    if (!row) {
      // A line with a pipe that is not two cells is a row the renderer cannot read; skipping it
      // would drop a mood without a word.
      if (line.includes("|")) throw new Error(`the table row "${line.trim()}" is not two cells; a row is | theme | mood |.`);
      continue;
    }
    const [, cell, mood] = row;
    const header = first && !names.has(cell.match(/^\[([^\]]*)\]\(.*\)$/)?.[1] ?? cell);
    first = false;
    if (header) continue;
    const name = cell.match(/^\[([^\]]*)\]\(.*\)$/)?.[1] ?? cell;
    if (!names.has(name)) throw new Error(`the table has a row for "${name}", which is not a ${pack} theme.`);
    if (moods.has(name)) throw new Error(`the table has two rows for ${name}.`);
    if (!MOOD.test(mood) || MOOD_ADDRESS.test(mood)) {
      throw new Error(`${name}'s mood "${mood}" is not plain words (letters, digits, spaces and sentence punctuation).`);
    }
    moods.set(name, mood);
  }
  return moods;
}

export function renderThemeTable(themes, moods) {
  const rows = themes.map((theme) => {
    const mood = moods.get(theme.name);
    if (mood === undefined) {
      throw new Error(`the table has no row for ${theme.name}; add one as | ${pageLink(theme)} | <mood> | between the markers.`);
    }
    return `| ${pageLink(theme)} | ${mood} |`;
  });
  return ["| Theme | Mood |", "|---|---|", ...rows].join("\n");
}

// Where a block's markers sit in a README: the index of the start marker and
// the index just past the end marker. Throws when either is missing or doubled
// (a marker quoted elsewhere in the file would otherwise be taken for the
// block, and the text between would be overwritten).
export function findBlock(markdown, key) {
  const count = (marker) => markdown.split(marker).length - 1;
  const starts = count(startMarker(key));
  const ends = count(endMarker(key));
  if (starts === 0 || ends === 0) {
    throw new Error(`no ${startMarker(key)} … ${endMarker(key)} block; write both markers, each on a line of its own with a blank line around it.`);
  }
  if (starts > 1 || ends > 1) {
    throw new Error(`${startMarker(key)} appears ${starts} time(s) and ${endMarker(key)} ${ends}; each appears once, so there is one block to write.`);
  }
  const start = markdown.indexOf(startMarker(key));
  const end = markdown.indexOf(endMarker(key));
  if (end < start) throw new Error(`${endMarker(key)} comes before ${startMarker(key)}; the start marker goes first.`);
  return { start, end: end + endMarker(key).length };
}

// Replaces the block between the markers (markers included) with `rendered`.
export function placeBlock(markdown, key, rendered) {
  const { start, end } = findBlock(markdown, key);
  return markdown.slice(0, start) + rendered + markdown.slice(end);
}

// Two themes may not share a page address or a name: a name is lowercased and
// its spaces become hyphens to make the slug, so "Deep Field" and "Deep-Field"
// would both link theme/deep-field/, and a list would send one name to the
// other's page.
export function assertDistinctPages(themes) {
  const bySlug = new Map();
  const byLowerName = new Map();
  for (const theme of themes) {
    const sameSlug = bySlug.get(theme.slug);
    if (sameSlug) throw new Error(`"${sameSlug.name}" (${sameSlug.pack.id}) and "${theme.name}" (${theme.pack.id}) would share the page ${THEME_PAGE_URL}${theme.slug}/; rename one.`);
    const sameName = byLowerName.get(theme.name.toLowerCase());
    if (sameName) throw new Error(`"${sameName.name}" (${sameName.pack.id}) and "${theme.name}" (${theme.pack.id}) are the same name in another case; rename one.`);
    bySlug.set(theme.slug, theme);
    byLowerName.set(theme.name.toLowerCase(), theme);
  }
}

// Every block the READMEs must carry, rendered from today's theme files, with
// the themes they were rendered from.
export async function buildReadmeThemeLinks(root) {
  const themes = await loadThemes(root);
  assertDistinctPages(themes);
  const files = new Map();
  for (const path of new Set(THEME_LINK_BLOCKS.map((block) => block.path))) {
    files.set(path, await readFile(new URL(path, root), "utf8"));
  }
  const blocks = THEME_LINK_BLOCKS.map((block) => {
    const inPack = byName(themes.filter((theme) => theme.pack.id === block.pack));
    if (inPack.length === 0) throw new Error(`${block.path}: no ${block.pack} themes to list.`);
    let body;
    try {
      if (block.layout === "list") {
        body = renderThemeList(inPack);
      } else {
        const markdown = files.get(block.path);
        const { start, end } = findBlock(markdown, block.key);
        body = renderThemeTable(inPack, readMoods(markdown.slice(start, end), inPack, block.pack));
      }
    } catch (error) {
      throw new Error(`${block.path} (${block.key} block): ${error.message}`, { cause: error });
    }
    const start = startMarker(block.key);
    const end = endMarker(block.key);
    return { ...block, start, end, rendered: `${start}\n\n${body}\n\n${end}` };
  });
  return { themes, blocks };
}

// ---------------------------------------------------------------------------
// Readers for verify.mjs.
// ---------------------------------------------------------------------------

// Which lines of a Markdown document start in document flow, and which sit
// inside something that swallows link syntax: a fenced code block (``` or ~~~,
// closed by a fence of the same character at least as long), an indented code
// block (a line indented four columns or more, a tab counting as four, where
// no paragraph is open; it runs through blank lines to the first line indented
// less) or one of the seven kinds of HTML block CommonMark knows — <pre>, <script>, <style> and
// <textarea> to a closing tag of any of the four, a comment to -->, a
// processing instruction to ?>, a declaration to >, CDATA to ]]>, a
// block-level tag such as <div> or <p> to the next blank line, and any other
// complete tag alone on a line to the next blank line. That last kind cannot
// interrupt a paragraph, so it opens only when the line before it is not
// paragraph text: a blank line, a heading, a fence, a thematic break, a table
// row, a tag or marker line, indented code, a block quote, or a list item
// (which CommonMark would continue lazily; the walk does not). That reading
// is loose: a lone line with a pipe, a lone "---" or an indented continuation
// line is paragraph text to CommonMark, so the walk can open an HTML block
// CommonMark does not. For the marker check that fails closed (a marker in
// the block fails). For what the block would hide it does not: a fence or
// <pre>-style opener inside such a block is honoured by CommonMark when the
// block is really a paragraph, so the walk names those lines in `hidden` and
// themeLinkProblems fails them. The line that opens a block belongs to it:
// text after a block tag on its line (<div> [Name](...)), after <pre>, after
// <!-- or in a fence's info string is not Markdown, and a <!-- x --> or
// <pre>x</pre> that opens and closes on one line is a block of that line.
// Indented code opens under the same loose reading: after any line that is
// not paragraph text, a line indented four columns is code, where CommonMark
// may read it as a list item's own content (a nested list, a continuation
// paragraph) or as a lazy line of a paragraph the walk does not see (after a
// block quote, a lone pipe line, "<span>text"). Nor does the walk see
// indented code written after a block-quote or list marker (">     x",
// "-     x"), or the table row a line without a pipe can be. Read alone, that
// fails both ways: a line that is really the item's text can open a fence or
// an HTML block that runs on, and a code span can run across a line the walk
// calls code. So themeLinkProblems also fails every line indented four
// columns outside a fence or a <pre>-style, comment or declaration block, on
// its own or after its markers, and every code span that does not close on
// its own line (rule 4); the READMEs write neither. The walk's reading of
// indented code stands for what follows it (no fence or tag opens on such a
// line), not for whether a link in it is one.
//
// Container prefixes (list markers, "> ") are not tracked. A fence or tag
// opened inside a container closes with the container, before any column-0
// line, so the top-level walk gives the right answer at a marker line — with
// one rule CommonMark does not have: a closing fence must sit at the opener's
// exact indentation. A fence indented one to three spaces may be the content
// of a list item, and then a column-0 "```" does not close it: it ends the
// list and opens a new fence that swallows what follows. Holding the closer
// to the opener's indentation reads that shape as still open (and fails it),
// at the price of rejecting a top-level fence closed at a different
// indentation, which the READMEs do not write. A fence written on a list
// item's own line ("1. ```bash") opens at the item's content column. The
// same doubt cuts the other way when a non-blank line inside such a fence is
// indented less than the opener: in a list item the fence ends there and a
// later fence line opens another; at top level the fence runs on. The walk
// cannot tell which, so it reads on (the fence runs on) and names the line in
// `ambiguous`, which themeLinkProblems reports; a README that is to pass
// opens its fences at column 0 or indents their content as far as the
// opener. `open` names what is still open at the end of the document, if
// anything.
const BLOCK_TAGS =
  "address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h1|h2|h3|h4|h5|h6|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul";
const BLOCK_TAG_LINE = new RegExp(String.raw`^ {0,3}</?(?:${BLOCK_TAGS})(?=\s|/?>|$)`, "i");
const ANY_TAG_LINE = /^ {0,3}(?:<[A-Za-z][A-Za-z0-9-]*(?:\s+[A-Za-z_:][A-Za-z0-9_.:-]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*\s*\/?>|<\/[A-Za-z][A-Za-z0-9-]*\s*>)\s*$/;
const LIST_MARKER = String.raw`(?:[-+*]|\d{1,9}[.)])`;
const FENCE_OPEN = new RegExp(String.raw`^( {0,3}(?:${LIST_MARKER} {1,4})?)(\x60{3,}|~{3,})(.*)$`);
const FENCE_CLOSE = /^( {0,3})(`{3,}|~{3,})[ \t]*$/;
const RAW_TAG = /^ {0,3}<(pre|script|style|textarea)(?=[ \t>]|$)/i;
const RAW_TAG_CLOSE = /<\/(?:pre|script|style|textarea)>/i;
const isBlank = (line) => /^[ \t]*$/.test(line);
const indentOf = (line) => line.match(/^[ \t]*/)[0].replace(/\t/g, "    ").length;
// Lines after which no paragraph is open, read loosely: anything that is not
// plain paragraph text counts, so a lone tag after it starts an HTML block.
const NOT_PARAGRAPH = [
  /^ {0,3}#{1,6}(?:[ \t]|$)/,
  /^ {0,3}(?:`{3,}|~{3,})/,
  /^ {0,3}</,
  /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/,
  /^ {0,3}(?:=+|-+)[ \t]*$/,
  /\|/,
  /^ {0,3}>/,
  new RegExp(String.raw`^ {0,3}${LIST_MARKER}(?:[ \t]|$)`),
];
// How far a line's content sits past the block-quote and list markers it
// starts with, or 0 when it starts with none (or with nothing after them): GFM
// reads four columns there as indented code inside the quote or the item, and
// a list marker followed by five columns opens an item that starts with
// indented code. A tab counts as four columns, which can only over-count.
// Only a space or a tab is indentation to GFM: a no-break space, a form feed
// or any other character after the spaces is the first character of the
// content, so the lookahead names the space and nothing else.
const indentAfterMarkers = (line) => {
  let rest = line.replace(/\t/g, "    ");
  let marked = false;
  for (;;) {
    const quote = rest.match(/^ {0,3}> ?/);
    if (quote) {
      rest = rest.slice(quote[0].length);
      marked = true;
      continue;
    }
    const item = rest.match(new RegExp(String.raw`^ {0,3}${LIST_MARKER}( +)(?=[^ ])`));
    if (!item) break;
    if (item[1].length >= 5) return item[1].length - 1;
    rest = rest.slice(item[0].length);
    marked = true;
  }
  return marked && !isBlank(rest) ? indentOf(rest) : 0;
};
// Indented code is a matter of columns (a tab is four), not of characters.
const paragraphText =(line) => !isBlank(line) && indentOf(line) < 4 && !NOT_PARAGRAPH.some((rule) => rule.test(line));

export function markdownFlow(markdown) {
  const lines = markdown.split("\n");
  // Whether each line begins in flow: nothing opened on an earlier line is still open.
  const flow = [];
  // What each line belongs to: null in flow, else "fence", "indented", "html"
  // or "html-to-blank". The line that opens a block belongs to it, as does the
  // whole of a block that opens and closes on one line (<!-- x -->, <pre>x</pre>).
  const inside = [];
  // The block each line belongs to (kind, token and opening line), or null.
  const blocks = [];
  const ambiguous = [];
  const hidden = [];
  let state = null;
  // An HTML block that runs to a closing token; `closed` when that token sits on the start line.
  const htmlTo = (token, close, rest, index) => ({ kind: "html", token, close, line: index + 1, closed: close.test(rest) });
  const toBlank = (line, index) => ({ kind: "html-to-blank", token: `${line.trim().match(/^<\/?[A-Za-z0-9-]+/)[0]}>`, line: index + 1 });
  // What a line opens when nothing is open; null when it opens nothing.
  const opens = (line, index, previousInFlow) => {
    const fence = line.match(FENCE_OPEN);
    if (fence && !(fence[2][0] === "`" && fence[3].includes("`"))) return { kind: "fence", indent: fence[1].length, token: fence[2], line: index + 1 };
    const tag = line.match(RAW_TAG);
    if (tag) return htmlTo(`<${tag[1].toLowerCase()}>`, RAW_TAG_CLOSE, line.slice(tag[0].length), index);
    const comment = line.match(/^ {0,3}<!--/);
    if (comment) return htmlTo("<!--", /-->/, line.slice(comment[0].length), index);
    const instruction = line.match(/^ {0,3}<\?/);
    if (instruction) return htmlTo("<?", /\?>/, line.slice(instruction[0].length), index);
    const cdata = line.match(/^ {0,3}<!\[CDATA\[/);
    if (cdata) return htmlTo("<![CDATA[", /\]\]>/, line.slice(cdata[0].length), index);
    const declaration = line.match(/^ {0,3}<![A-Za-z]/);
    if (declaration) return htmlTo("<!", />/, line.slice(declaration[0].length), index);
    if (BLOCK_TAG_LINE.test(line)) return toBlank(line, index);
    if (ANY_TAG_LINE.test(line) && !(index > 0 && previousInFlow && paragraphText(lines[index - 1]))) return toBlank(line, index);
    // Indented code cannot interrupt a paragraph either.
    if (!isBlank(line) && indentOf(line) >= 4 && !(index > 0 && previousInFlow && paragraphText(lines[index - 1]))) return { kind: "indented", token: "indented", line: index + 1 };
    return null;
  };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (state?.kind === "fence" && state.indent > 0 && !isBlank(line) && indentOf(line) < state.indent) {
      ambiguous.push({ line: index + 1, fence: state });
    }
    // Indented code ends at the first line that is neither blank nor indented four columns; that line is read afresh.
    if (state?.kind === "indented" && !isBlank(line) && indentOf(line) < 4) state = null;
    flow.push(state === null);
    if (state === null) {
      const opened = opens(line, index, index > 0 && flow[index - 1]);
      inside.push(opened ? opened.kind : null);
      blocks.push(opened);
      if (opened && !opened.closed) state = opened;
      continue;
    }
    inside.push(state.kind);
    blocks.push(state);
    if (state.kind === "html-to-blank") {
      if (isBlank(line)) state = null;
      else {
        // The block may be paragraph text to CommonMark (see the header), in
        // which case an opener on this line takes effect and hides what follows.
        // (An indented line opens nothing: in a paragraph it is a lazy continuation.)
        const would = opens(line, index, false);
        if (would && !would.closed && would.kind !== "html-to-blank" && would.kind !== "indented") hidden.push({ line: index + 1, opens: would.token, inside: state });
      }
    } else if (state.kind === "fence") {
      const close = line.match(FENCE_CLOSE);
      if (close && close[1].length === state.indent && close[2][0] === state.token[0] && close[2].length >= state.token.length) state = null;
    } else if (state.kind === "indented") {
      // Runs on: this line is blank or indented four columns (anything else ended the block above).
    } else if (state.close.test(line)) {
      state = null;
    }
  }
  // A block that ends at a blank line or at a line indented less also ends at
  // the end of the document, so only one that waits for a closing token counts
  // as left open.
  return { flow, inside, blocks, ambiguous, hidden, open: state && state.kind !== "html-to-blank" && state.kind !== "indented" ? state : null };
}

const SITE = "https://gabs-utilities.com/";
const INDEX_LINK = `[gabs-utilities.com/theme/](${THEME_PAGE_URL})`;
const HOME_LINK = `[gabs-utilities.com](${SITE})`;
// A page on the site other than a theme page: the home page, a fragment on it,
// or one top-level file with an extension, such as an .html page or
// themes.json (with or without a fragment). A theme page is a directory under
// theme/, so it is never written this way; it is a theme's own link.
const SITE_PAGE = String.raw`(?:#[A-Za-z0-9-]+|[A-Za-z0-9-]+\.[a-z0-9]+(?:#[A-Za-z0-9-]+)?)?`;
// A link whose text is its own address without https://: the home page, the
// index, or another page on the site, such as
// [gabs-utilities.com/themes.json](https://gabs-utilities.com/themes.json).
const SELF_LINK = new RegExp(String.raw`\[gabs-utilities\.com(?:/(theme/|${SITE_PAGE}))?\]\(https://gabs-utilities\.com/\1\)`, "g");
// What link text may be made of: printable ASCII, the Latin-1 letters, and the
// punctuation these READMEs use (dashes, quotes, the arrow, the middle dot, the
// euro sign). Anything else — a zero-width or no-break space, a character from
// another script that looks like a Latin letter — could spell a theme name
// that the comparison below would not recognise, so it fails instead.
const LINK_TEXT_ALPHABET = /^[\x20-\x7E\u00C0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2026\u2192\u00B7\u20AC\n]*$/;
// What a link destination, an autolink or a bare address may be made of: the
// characters addresses are written with, in plain ASCII. No %XX escape, no
// backslash, no quote (a title), no angle bracket, no space, nothing from
// another script: each is a way to spell the site's host so that a browser
// reaches it while the text does not read gabs-utilities.com.
const ADDRESS_ALPHABET = /^[A-Za-z0-9._~:/?#@!$&*+,;=-]*$/;
// Entity references. GFM shows a numeric character reference as its character,
// so a reference for a letter, a digit or a character outside ASCII reads here
// as that character: none of those is Markdown syntax, so the text shows the
// same written either way (the reference's own & # ; are punctuation to the
// emphasis and link-label rules, which these rules do not depend on). Every
// other reference fails. A named one needs the HTML entity table to read, and
// the character itself can be written. One for ASCII punctuation or spacing
// exists to show a character without its Markdown meaning (&#91; shows a
// bracket that opens no link). One for nothing CommonMark shows (&#0;, a
// surrogate, past U+10FFFF) or with more digits than CommonMark reads (seven
// decimal, six hex; GitHub's renderer reads up to eight) is not written. A
// numeric reference without its semicolon is text to GFM but a character to a
// browser inside raw HTML, so it is not written either. And no reference of
// any kind sits inside an address: in an autolink or a bare address it breaks
// the link while the address still shows (<h&#116;tps://…> is text), and in a
// link destination it spells an address the raw text does not read.
const ENTITY = /&(#[0-9]+;?|#[xX][0-9a-fA-F]+;?|[A-Za-z][A-Za-z0-9]*;)/g;
const NUMERIC_ENTITY = /&#(?:(\d{1,7})|[xX]([0-9a-fA-F]{1,6}));/g;
const codePointOf = (decimal, hex) => (decimal === undefined ? parseInt(hex, 16) : Number(decimal));
const shownCharacter = (reference, decimal, hex) => {
  const code = codePointOf(decimal, hex);
  if (code < 0x80) return /[0-9A-Za-z]/.test(String.fromCharCode(code)) ? String.fromCharCode(code) : reference;
  if ((code >= 0xd800 && code < 0xe000) || code > 0x10ffff) return reference;
  return String.fromCodePoint(code);
};
// A line as the reader sees it. Only characters are substituted, never a line
// break, so line N of the file is line N of what is shown.
export const shownLine = (line) => line.replace(NUMERIC_ENTITY, shownCharacter);
const ESCAPE = /\\[!-/:-@[-`{-~]/g;
// What GFM reads as one tag, closing tag, comment or autolink on a line: only
// these hide an address from the bare-address check. A "<" that opens none of
// them (a space after it, a bracket inside) is text, and what follows it is
// checked as text.
const TAG_OR_AUTOLINK =
  /<(?:[A-Za-z][A-Za-z0-9-]*(?:\s+[A-Za-z_:][A-Za-z0-9_.:-]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*\s*\/?>|\/[A-Za-z][A-Za-z0-9-]*\s*>|!--[^\n]*?-->|[A-Za-z][A-Za-z0-9+.-]{1,31}:[^\s<>]*>)/g;
// Code spans as CommonMark pairs them: a run of backticks closes at the next
// run of exactly its length, or is text. A code span is inline content of
// one block, so it never crosses a blank line, a fence line, a line of indented
// code or a line of a <pre>-style, comment or declaration block; `segments` are the stretches of
// text between those, and backticks pair within one stretch. (A tag line the
// walk reads as an HTML block may be paragraph text to GFM, so it stays in
// its stretch.) Escaped backticks and backticks inside tags are rejected
// before this matters. Where a stretch really ends is a reading of block
// structure the walk makes only loosely — a heading, a table row or a list
// item ends a block it does not split at, and a line it calls indented code
// can be a paragraph's — so rule 4 also holds every code span to one line:
// when each line's backticks pair among themselves, where a stretch breaks
// changes nothing.
const codeSpans = (text, segments) => {
  const spans = [];
  for (const [start, end] of segments) {
    const runs = [...text.slice(start, end).matchAll(/`+/g)];
    for (let index = 0; index < runs.length; index++) {
      const length = runs[index][0].length;
      const closer = runs.findIndex((run, at) => at > index && run[0].length === length);
      if (closer === -1) continue;
      spans.push([start + runs[index].index, start + runs[closer].index + length]);
      index = closer;
    }
  }
  return spans;
};
// What the reader sees of a link text, for comparing with a theme name: images
// inside it, tags and emphasis marks dropped, every run of whitespace (a soft
// line break included) read as one space.
const shownText = (text) => text.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/<[^>]*>/g, "").replace(/[*_`~]/g, "").replace(/\s+/g, " ").trim();
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Everything wrong with how a README writes addresses on the site and theme
// names, each as one sentence that starts with the line it is on. The rules:
//
// 0. Every character means what it shows. A numeric character reference for a
//    letter, a digit or a character outside ASCII is read as that character;
//    no other entity reference, none inside an address, no & before letters
//    inside an HTML block (a browser reads legacy names there), no backslash
//    escape anywhere, no HTML comment inside a line (a comment is a line of
//    its own, like the markers), no bracket or backtick inside a tag, no
//    bracket inside a code span, and every link destination, autolink and
//    bare address is plain ASCII with no %XX escape. Each of those is a way to
//    write the site's host, or a theme's name, so that the reader sees one
//    thing and a text rule sees another. Addresses end at ASCII whitespace,
//    as GitHub's autolinks do, not at a Unicode separator. No carriage return
//    and no byte order mark: GFM reads CR LF as one line ending and skips a
//    mark at the start of the file, where this walk would read a blank line
//    as text and the first line's indentation or fence as text.
// 1. The site's host appears only in the forms these READMEs use: a theme's own
//    link, [Name](https://gabs-utilities.com/theme/<slug>/), written with the
//    page's own name; the index, [gabs-utilities.com/theme/](https://gabs-utilities.com/theme/)
//    or https://gabs-utilities.com/theme/ on its own; the home page,
//    [gabs-utilities.com](https://gabs-utilities.com/); and another page on the
//    site (the home page, a fragment on it, or a top-level file such as an
//    .html page or themes.json) as a link destination, an autolink, on its own,
//    or as a link whose text is its address. Anything else — http://,
//    www., a port, another case, a trailing dot, a slug no theme has, other
//    text on a theme link, a reference, a title, a code span — fails, because
//    a theme page can be reached through any spelling of the host, and
//    whatever the raw text renders as, a wrong address is wrong.
// 2. A theme's name in brackets is its link and nothing else: not a reference
//    ([Name][x], [Name]: …), not an image (![Name](…)), not another case, not
//    another address, not spelled with a line break or a doubled space, not
//    wrapped in emphasis or a code span. Brackets are paired as CommonMark
//    pairs them, and bracketed text may carry no HTML and no backslash, since
//    either can hide part of a name from this comparison while the reader sees
//    the whole of it. The name is compared as the reader sees it, so link text
//    is also held to a known alphabet.
// 3. No HTML comment is left open, and no code fence or <pre>-style block runs
//    to the end of the file; either hides whatever follows it. A fence or
//    <pre>-style opener inside an HTML block the walk opened loosely fails,
//    since CommonMark may honour it (see markdownFlow).
// 4. Nothing whose reading depends on block structure the walk does not
//    follow (see markdownFlow). No line outside a code fence or a
//    <pre>-style, comment or declaration block is indented four columns, on
//    its own or after its block-quote and list markers: at the top level
//    that is indented code, under a list item or a quote it is the item's
//    text, which can open a fence or an HTML block that runs on. And a code
//    span opens and closes on one line and holds no pipe: whether a backtick
//    pairs with one on the next line depends on whether a heading, a table
//    row or a list item ends the block between them, and a table row splits
//    at its pipes before code spans are read.
// Inside a code span, a code fence or an HTML block, Markdown is text: a
// theme link or the site's address written there fails, since the reader
// sees the raw syntax and no link. A line indented four columns fails by
// itself (rule 4), whatever it holds.
export function themeLinkProblems(markdown, themes) {
  const problems = [];
  const bySlug = new Map(themes.map((theme) => [theme.slug, theme]));
  const byLowerName = new Map(themes.map((theme) => [theme.name.toLowerCase(), theme]));
  // Blocks are read from the raw text, as GFM reads them: an entity is inline,
  // so &#49;. opens no list and &#60; opens no tag. Everything inline is read
  // from the shown text, where a reference for a letter is that letter.
  const rawLines = markdown.split("\n");
  const lines = rawLines.map(shownLine);
  const shown = lines.join("\n");
  const lineStarts = [];
  for (let at = 0, index = 0; index < lines.length; index++) {
    lineStarts.push(at);
    at += lines[index].length + 1;
  }
  const lineOf = (index) => {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (lineStarts[middle] <= index) low = middle;
      else high = middle - 1;
    }
    return low + 1;
  };
  const { inside, blocks, ambiguous, hidden, open } = markdownFlow(markdown);
  // The stretches of lines that can carry inline text (see codeSpans).
  const inlineLine = (index) => !isBlank(lines[index]) && inside[index] !== "fence" && inside[index] !== "indented" && inside[index] !== "html";
  const segments = [];
  for (let index = 0; index < lines.length; index++) {
    if (!inlineLine(index)) continue;
    const first = index;
    while (index + 1 < lines.length && inlineLine(index + 1)) index++;
    segments.push([lineStarts[first], lineStarts[index] + lines[index].length]);
  }
  const spans = codeSpans(shown, segments);
  const inCode = (index) => spans.some(([start, end]) => index >= start && index < end);
  // Where Markdown is text: a line of a fence or an HTML block (its opening
  // line included), or a code span. A line the walk reads as indented code is
  // not counted here: under a list item it can be the item's text, with its
  // links links, so rule 4 fails the line itself instead of naming a link in it.
  const literal = (index) => {
    const kind = inside[lineOf(index) - 1];
    return (kind !== null && kind !== "indented") || inCode(index);
  };
  // Names the text region an index sits in, for a message.
  const where = (index) => {
    const block = blocks[lineOf(index) - 1];
    if (!block) return "inside a code span";
    const begun = block.kind === "fence" ? `${block.token} code fence opened` : `${block.token} HTML block begun`;
    return `inside the ${begun} on line ${block.line}`;
  };
  const before = (index) => (index === 0 ? "" : shown[index - 1]);
  const covered = [];
  const cover = (start, length) => covered.push([start, start + length]);
  const report = (index, message) => problems.push({ index, message: `line ${lineOf(index)} ${message}` });
  const notALink = (index, written) => {
    if (before(index) === "!") report(index, `writes ${written} as an image (a ! before it), not a link; drop the !.`);
    else if (before(index) === "\\") report(index, `escapes ${written} with a backslash, so it renders as text; drop the backslash.`);
  };
  // On its own: preceded by the start of the line, a space or an opening
  // parenthesis (not a link's), followed by the end of the line or a space,
  // with the sentence punctuation GFM leaves out of an autolink in between.
  // Only ASCII whitespace or a line end bounds it, as in GitHub's autolinks: a
  // Unicode separator such as U+2028 is part of the address there.
  const bareForm = (pattern) => new RegExp(String.raw`(?<=^|\n|[ \t]|(?<!\])\()${pattern}(?=[.,;:)]{0,2}(?:[ \t]|\n|$))`, "g");

  // Rule 0: every character means what it shows.
  if (markdown.startsWith("\uFEFF")) {
    report(0, "starts with a byte order mark (U+FEFF). GitHub skips it, so the first line's indentation or fence reads there as it does not here; save the file without one.");
  }
  for (const [index, line] of lines.entries()) {
    const at = line.indexOf("\r");
    if (at !== -1) report(lineStarts[index] + at, "writes a carriage return. GFM reads CR LF as one line ending, so a line that is blank there is text here; save the file with LF line endings.");
  }
  const rawReferences = rawLines.map((rawLine) => new Set([...rawLine.matchAll(ENTITY)].map((match) => match[0])));
  for (const match of shown.matchAll(ENTITY)) {
    const [reference] = match;
    if (!rawReferences[lineOf(match.index) - 1].has(reference)) {
      report(match.index, `assembles an entity reference (${reference}) out of references for its letters; GFM shows that as text, which these rules cannot follow. Write the characters plainly.`);
      continue;
    }
    const complete = reference.endsWith(";");
    const body = match[1].replace(/;$/, "");
    const numeric = body.match(/^#(?:(\d{1,7})|[xX]([0-9a-fA-F]{1,6}))$/);
    const code = numeric ? codePointOf(numeric[1], numeric[2]) : NaN;
    // A reference for a letter, a digit or a character outside ASCII was read
    // as that character above, so what reaches here is named, incomplete,
    // malformed, for nothing CommonMark shows, or for an ASCII character that
    // has a Markdown meaning.
    const why =
      body[0] !== "#"
        ? "a named reference is not written here, since GFM reads only the HTML5 names and the character, if there is one, can be written itself"
        : !complete
          ? "without its semicolon it is text to GFM but a character to a browser inside raw HTML, so it is not written"
          : code === 0 || Number.isNaN(code) || (code >= 0xd800 && code < 0xe000) || code > 0x10ffff
            ? "it names nothing CommonMark shows as a character (U+0000, a surrogate, a code point past U+10FFFF) or carries more digits than CommonMark reads, which GitHub's renderer may still read, so it is not written"
            : "it shows an ASCII character without its Markdown meaning (punctuation, spacing or a control), and these READMEs write every character with its meaning";
    report(match.index, `writes an entity reference (${reference}); ${why}.`);
  }
  for (const [index, rawLine] of rawLines.entries()) {
    if (!rawLine.includes("&")) continue;
    if (inside[index] === "html" || inside[index] === "html-to-blank") {
      for (const match of rawLine.matchAll(/&[A-Za-z][A-Za-z0-9]*/g)) {
        report(lineStarts[index], `writes ${match[0]} inside an HTML block, where a browser may read a legacy entity name (&lt, &amp) even without a semicolon; inside raw HTML an ampersand is not written before letters.`);
      }
    }
    const pieces = [];
    for (const match of rawLine.matchAll(/\]\(([^)\n]*)\)/g)) pieces.push(["link destination", match[1]]);
    for (const match of rawLine.matchAll(/<([^>\n]*)>/g)) pieces.push(["angle brackets", match[0]]);
    const rawBlanked = rawLine.replace(/\]\([^)\n]*\)|<[^>\n]*>/g, (piece) => " ".repeat(piece.length));
    for (const match of rawBlanked.matchAll(/[^ \t\r\f\v]+/g)) {
      const token = match[0].replace(/^[([<`"'*_]+/, "").replace(/[.,;:)\]>`"'*_]+$/, "");
      // The whole token is read, since a reference may end it (…htm&#108;).
      if (/:\/\/|^www\./i.test(token)) pieces.push(["address", match[0]]);
    }
    for (const [what, piece] of pieces) {
      const [reference] = piece.match(ENTITY) ?? [];
      if (reference) report(lineStarts[index], `writes an entity reference (${reference}) inside the ${what} ${piece}; an address is written plainly, since a reference there can break the link while the address still shows.`);
    }
  }
  // Everywhere, not only in flow: the walk's reading of what is in flow is loose
  // (see markdownFlow), and an escape in a code block is harmless to reject.
  for (const match of shown.matchAll(ESCAPE)) {
    report(match.index, `writes a backslash escape (${match[0]}); the READMEs write every character plainly, since an escape can spell an address or a name that the reader sees and these rules do not.`);
  }
  for (const match of shown.matchAll(/<[^>\n]*>/g)) {
    if (/[[\]`]/.test(match[0])) report(match.index, `writes a bracket or a backtick inside ${match[0]}; to GitHub a bracket or backtick inside a tag is text, to these rules a delimiter, so none is written there.`);
  }
  for (const [start, end] of spans) {
    const span = shown.slice(start, end);
    if (/[[\]]/.test(span)) report(start, `writes a bracket inside the code span ${span.split("\n")[0]}; a bracket in these READMEs opens or closes a link, and inside a code span it is text.`);
  }
  for (const match of shown.matchAll(/<!--/g)) {
    if (!/^ {0,3}$/.test(shown.slice(lineStarts[lineOf(match.index) - 1], match.index))) {
      report(match.index, "writes an HTML comment inside a line; a comment in these READMEs is a line of its own, like the list markers.");
    }
  }
  const outsideAlphabet = (what, address) =>
    `writes the ${what} ${address} with a character outside the address alphabet (plain ASCII letters, digits and URL punctuation, with no %XX escape, backslash, quote, angle bracket or space); write the address plainly and without a title.`;
  for (const match of shown.matchAll(/\]\(([^)\n]*)\)/g)) {
    if (!ADDRESS_ALPHABET.test(match[1])) report(match.index, outsideAlphabet("link destination", match[1]));
  }
  for (const match of shown.matchAll(/<([A-Za-z][A-Za-z0-9+.-]*:[^>\n]*)>/g)) {
    if (!ADDRESS_ALPHABET.test(match[1])) report(match.index, outsideAlphabet("autolink", match[1]));
  }
  // Bare addresses: whatever carries a scheme or www. outside a destination, a
  // tag or an autolink. Tokens end at ASCII whitespace only, as GitHub's do.
  const blank = (piece) => piece.replace(/[^\n]/g, " ");
  const blanked = shown.replace(/\]\([^)\n]*\)/g, blank).replace(TAG_OR_AUTOLINK, blank);
  for (const match of blanked.matchAll(/[^ \t\r\n\f\v]+/g)) {
    const token = match[0].replace(/^[([<`"'*_]+/, "").replace(/[.,;:)\]>`"'*_]+$/, "");
    if (!/:\/\/|^www\./i.test(token)) continue;
    if (!ADDRESS_ALPHABET.test(token)) report(match.index, outsideAlphabet("address", token));
  }

  // Rule 1: the accepted forms, then every mention of the host.
  for (const match of shown.matchAll(/\[([^[\]\n]*)\]\(https:\/\/gabs-utilities\.com\/theme\/([a-z0-9-]+)\/\)/g)) {
    const [whole, text, slug] = match;
    if (literal(match.index)) {
      report(match.index, `writes the theme link ${whole} ${where(match.index)}, where it is text, not a link; a theme link is written in prose.`);
      continue;
    }
    cover(match.index, whole.length);
    const theme = bySlug.get(slug);
    if (!theme) {
      report(match.index, `links ${THEME_PAGE_URL}${slug}/, but no theme page has that address.`);
    } else if (text !== theme.name) {
      report(match.index, `links ${theme.name}'s page as "${text}"; that page is ${theme.name}'s, so the link reads ${pageLink(theme)}.`);
    } else {
      notALink(match.index, whole);
    }
  }
  for (const match of shown.matchAll(SELF_LINK)) {
    if (literal(match.index)) continue;
    cover(match.index, match[0].length);
    notALink(match.index, match[0]);
  }
  for (const match of shown.matchAll(bareForm(escapeRegExp(THEME_PAGE_URL)))) {
    if (!literal(match.index)) cover(match.index, THEME_PAGE_URL.length);
  }
  const sitePage = new RegExp(
    String.raw`\]\(https://gabs-utilities\.com/${SITE_PAGE}\)|<https://gabs-utilities\.com/${SITE_PAGE}>|(?<=^|\n|[ \t]|(?<!\])\()https://gabs-utilities\.com/${SITE_PAGE}(?=[.,;:)]{0,2}(?:[ \t]|\n|$))`,
    "g",
  );
  for (const match of shown.matchAll(sitePage)) {
    if (!literal(match.index)) cover(match.index, match[0].length);
  }
  for (const match of shown.matchAll(/gabs-utilities\.com/gi)) {
    if (literal(match.index)) {
      report(match.index, `writes the site's address ${where(match.index)}, where it is text, not a link; the address is written in prose, in one of the forms the READMEs use.`);
      continue;
    }
    if (covered.some(([start, end]) => match.index >= start && match.index < end)) continue;
    report(
      match.index,
      `writes the site's address in a form the READMEs do not use. A theme's page is linked as [Name](${THEME_PAGE_URL}<slug>/) with the page's own name; ` +
        `the index is ${INDEX_LINK} or ${THEME_PAGE_URL} on its own; the home page is ${HOME_LINK}; another page on the site is ${SITE}<file> (such as <page>.html or themes.json), ` +
        `with or without #fragment, as a link destination, an autolink, on its own or under its own address as the link text. Not http://, www., a port, another case, a trailing dot, other link text on a theme page, a reference, a title or a code span.`,
    );
  }

  // Rule 2: bracketed text, as the reader sees it.
  for (const match of shown.matchAll(/<a[\s>]/gi)) {
    report(match.index, "writes a raw <a> tag; links in these READMEs are written in Markdown, so the name beside the address can be read.");
  }
  const pairs = [];
  const openBrackets = [];
  for (let index = 0; index < shown.length; index++) {
    if (shown[index] === "[") openBrackets.push(index);
    else if (shown[index] === "]" && openBrackets.length) {
      const start = openBrackets.pop();
      pairs.push({ start, end: index, text: shown.slice(start + 1, index) });
    }
  }
  pairs.sort((a, b) => a.start - b.start);
  for (const { start, end, text } of pairs) {
    const label = `[${text.split("\n")[0]}${text.includes("\n") ? "…" : ""}]`;
    if (text.includes("<")) {
      report(start, `writes HTML (<) inside the bracketed text ${label}; link text in these READMEs is plain, since a tag or comment there can hide part of a name from the reader or from this check.`);
      continue;
    }
    if (text.includes("\\")) {
      report(start, `writes a backslash inside the bracketed text ${label}; link text in these READMEs is plain.`);
      continue;
    }
    if (!LINK_TEXT_ALPHABET.test(text)) {
      const stranger = [...text].find((ch) => !LINK_TEXT_ALPHABET.test(ch));
      report(start, `writes bracketed text with a character outside the READMEs' alphabet (U+${stranger.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}); plain Latin letters, digits and the usual punctuation only.`);
      continue;
    }
    const theme = byLowerName.get(shownText(text).toLowerCase());
    if (!theme) continue;
    const expected = pageLink(theme);
    if (literal(start)) {
      report(start, `writes ${theme.name}'s name in brackets ${where(start)}, where it is text, not a link; a theme name in brackets is its link, written in prose as ${expected}.`);
      continue;
    }
    const following = shown.slice(end + 1);
    // Followed by a theme-page address: rule 1 above has already read it.
    if (following.startsWith(`(${THEME_PAGE_URL}`) && text === theme.name) continue;
    const tail = following.startsWith("(") ? following.slice(0, following.indexOf(")") + 1 || undefined) : following.startsWith("[") ? following.slice(0, following.indexOf("]") + 1 || undefined) : following.startsWith(":") ? ":" : "";
    const written = (`[${text}]` + tail.split("\n")[0]).replace(/\n/g, "\\n");
    if (before(start) === "!") {
      report(start, `writes ${theme.name}'s name as an image's alt text, !${written}; a theme name in brackets is its link, written exactly ${expected}. Give the image other alt text.`);
    } else {
      report(start, `writes ${theme.name}'s name in brackets as ${written}; a theme name in brackets is its link, written exactly ${expected}. To link something else, put more than the bare name in the brackets.`);
    }
  }

  // Rule 3: nothing left open.
  for (const match of shown.matchAll(/<!--/g)) {
    const close = shown.indexOf("-->", match.index + 4);
    const next = shown.indexOf("<!--", match.index + 4);
    if (close === -1 || (next !== -1 && next < close)) {
      report(match.index, "opens an HTML comment (<!--) that is not closed before the next one; the README up to the next --> is hidden.");
    }
  }
  if (open) {
    const what = open.kind === "fence" ? `a code fence (${open.token}) that no fence at the same indentation closes` : `a ${open.token} block that never closes`;
    report(lineStarts[open.line - 1], `opens ${what}; the README from there on does not render as Markdown.`);
  }
  for (const { line, opens, inside: block } of hidden) {
    report(
      lineStarts[line - 1],
      `opens ${opens} inside the ${block.token} HTML block begun on line ${block.line}. If GitHub reads that block as HTML, the ${opens} is swallowed as text and whatever was to close it stands alone, opening a block of its own; if GitHub reads the block as paragraph text (that depends on the line before the tag), the ${opens} takes effect here and hides what follows. Put a blank line before the tag and move the ${opens} out of the block.`,
    );
  }
  for (const { line, fence } of ambiguous) {
    report(
      lineStarts[line - 1],
      `is indented less than the code fence opened on line ${fence.line} (${fence.indent} spaces in); if that fence sits in a list item it ends here and the next fence line opens another, hiding what follows. Open fences at column 0, or indent every line of the fence as far as its opener.`,
    );
  }

  // Rule 4: nothing whose reading depends on structure the walk does not follow.
  const indentRule =
    `This check does not follow list items and quotes, so no line of these READMEs is indented four columns outside a code fence: indent a nested item or a continuation line to its item's content column (two spaces under "- ", three under "1. "), and put code in a fence.`;
  for (const [index, rawLine] of rawLines.entries()) {
    if (isBlank(rawLine) || inside[index] === "fence" || inside[index] === "html") continue;
    const own = indentOf(rawLine);
    const afterMarkers = own >= 4 ? 0 : indentAfterMarkers(rawLine);
    if (own >= 4) {
      report(lineStarts[index], `is indented ${own} columns outside a code fence. At the top level that is indented code, where Markdown shows as text; under a list item or a block quote it is the item's own text, which can open a fence or an HTML block that runs on past it. ${indentRule}`);
    } else if (afterMarkers >= 4) {
      report(lineStarts[index], `is indented ${afterMarkers} columns after its block-quote or list marker, where GFM opens indented code inside the quote or the item and shows its Markdown as text. ${indentRule}`);
    }
  }
  for (const [index, line] of lines.entries()) {
    if (!inlineLine(index)) continue;
    const runs = [...line.matchAll(/`+/g)];
    for (let at = 0; at < runs.length; at++) {
      const [run] = runs[at];
      const closer = runs.findIndex((other, later) => later > at && other[0].length === run.length);
      if (closer === -1) {
        report(
          lineStarts[index] + runs[at].index,
          `writes ${run} with nothing after it on that line to close it. Whether it pairs with a backtick on another line depends on whether a heading, a table row or a list item ends the block between them, which this check does not follow, so a code span in these READMEs opens and closes on one line. Close it on its line, or put a lone backtick in a fence.`,
        );
        continue;
      }
      const span = line.slice(runs[at].index, runs[closer].index + run.length);
      if (span.includes("|")) {
        report(
          lineStarts[index] + runs[at].index,
          `writes a pipe inside the code span ${span}. In a table row GFM splits the cells at every pipe before it reads code spans, so the span does not hold there, and this check does not tell table rows from text: no code span in these READMEs holds a pipe.`,
        );
      }
      at = closer;
    }
  }

  return problems.sort((a, b) => a.index - b.index).map((problem) => problem.message);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = new URL("../", import.meta.url);
  const { blocks } = await buildReadmeThemeLinks(root);
  for (const path of new Set(blocks.map((block) => block.path))) {
    const target = new URL(path, root);
    let markdown = await readFile(target, "utf8");
    for (const block of blocks.filter((block) => block.path === path)) markdown = placeBlock(markdown, block.key, block.rendered);
    await writeFile(target, markdown);
  }
  console.log(`Wrote ${blocks.length} theme-link blocks into ${new Set(blocks.map((block) => block.path)).size} READMEs.`);
}
