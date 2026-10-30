// The two dated pages (the install guide and the semantic-colors article) state when they were
// published and last modified twice over: in their schema.org JSON-LD, one of the signals a
// search engine weighs for the date it may show beside the result, and in the byline a reader
// sees. The two must say the same thing, and what they say must be possible. These rules hold a
// page to that:
//
// 1. Across the page's JSON-LD, exactly one entity carries datePublished and dateModified: the
//    page's own. A FAQPage beside it, and anything nested in @graph, mainEntity or an array,
//    carries neither. Both are calendar dates written YYYY-MM-DD, this repository's house style
//    (schema.org also allows a full timestamp; writing the day alone keeps the comparison with
//    the byline plain). datePublished is not after dateModified, and neither is after the latest
//    calendar date in effect anywhere on Earth (UTC+14), so a date written late at night in
//    Berlin is not a future date to a verifier running in UTC.
// 2. One element of class "byline" carries the page's dates, as <time datetime="YYYY-MM-DD">
//    elements each showing its date in words ("24 August 2026"). Outside those elements the
//    byline carries no digit, so no date can hide in it in another shape. Its first <time> is
//    datePublished, introduced by the word "published". When dateModified differs from
//    datePublished, a second <time> follows, introduced by "· updated ", and is dateModified;
//    when the two are equal there is no second one. So each date says which it is, the byline
//    never claims an update that did not happen, and never hides one.
// 3. Nowhere else on the page: no other <time> element, no date written in words or figures in
//    the page's text, and an Open Graph article:published_time or article:modified_time, where
//    present, names the same day as the JSON-LD.
// 4. In the verifier: every other HTML file in the repository carries none of these date
//    markers (dateMarker below), so a new dated page is held to the rule from its first commit,
//    or is added to DATED_PAGES on purpose.
// 5. In the verifier, where git history is in reach: dateModified is the day the page last
//    changed in anything but its date stamp (lastContentChange below), a day apart at most for
//    time zones. The stamp is the JSON-LD date lines and the byline; an edit to those alone is
//    not a modification, so the day the stamp was written never becomes the page's date.
//
// What cannot pass is a byline and a schema that disagree, a date the page's own history does
// not bear out, a future date, or a date written anywhere the rule cannot hold to the schema.
import { execFileSync } from "node:child_process";

export const DATED_PAGES = ["claude-code-theme-install-guide.html", "semantic-terminal-colors.html"];

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

// A real date of the calendar, written YYYY-MM-DD: 2026-02-30 is not one.
export const isCalendarDate = (value) => {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
// The date as the byline writes it: day without a leading zero, the month in English, the year.
export const longDate = (iso) => {
  const [, year, month, day] = iso.match(ISO_DATE);
  return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`;
};
// The latest calendar date in effect anywhere at `now` (UTC+14). No page is dated after it.
export const latestToday = (now = Date.now()) => new Date(now + 14 * 3600e3).toISOString().slice(0, 10);

const SCRIPT_OR_STYLE = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const JSON_LD = /<script\b[^>]*\btype\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script\s*>/gi;
const TIME = /<time\b([^>]*)>([\s\S]*?)<\/time\s*>/gi;
const META = /<meta\b([^>]*)>/gi;
const TAG = /<([a-z][a-z0-9-]*)\b([^>]*)>/gi;
// A date written in the page's text, in any of the shapes a person writes one.
const MONTH = `(?:${MONTHS.join("|")}|${MONTHS.map((month) => month.slice(0, 3)).join("|")}|Sept)\\.?`;
const TEXT_DATE = new RegExp(
  String.raw`\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}(?:st|nd|rd|th)?\s+${MONTH}\s+\d{4}\b|\b${MONTH}\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}\b|\b\d{1,2}[./]\d{1,2}[./]\d{4}\b|\b\d{4}[./]\d{1,2}[./]\d{1,2}\b`,
  "i",
);

// The value of one attribute in a tag's attribute text, however it is quoted; undefined when
// the attribute is absent. "data-datetime" is not "datetime".
const attribute = (attributes, name) => {
  const match = attributes.match(new RegExp(String.raw`(?:^|\s)${name}\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))`, "i"));
  return match ? (match[1] ?? match[2] ?? match[3]) : undefined;
};
// Text as a reader sees it: character references resolved, invisible characters dropped,
// whitespace collapsed.
const visible = (text) =>
  text
    .replace(/&(?:nbsp|#160|#x0*a0);/gi, " ")
    .replace(/&#(\d+);/g, (_, code) => (Number(code) <= 0x10ffff ? String.fromCodePoint(Number(code)) : ""))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => (parseInt(code, 16) <= 0x10ffff ? String.fromCodePoint(parseInt(code, 16)) : ""))
    .replace(/\u00a0/g, " ")
    .replace(/[\u00ad\u200b\u200c\u200d\u2060\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
// A string quoted for a message, with anything that is not plain printable ASCII escaped, so
// that two strings that differ invisibly do not read as the same.
const show = (text) => JSON.stringify(text).replace(/[^\x20-\x7e]/g, (character) => `\\u${character.codePointAt(0).toString(16).padStart(4, "0")}`);
// Every object in a parsed JSON-LD value: the value itself, members of arrays, and whatever is
// nested in @graph, mainEntity or any other key.
const entitiesOf = (value) => (Array.isArray(value) ? value.flatMap(entitiesOf) : value && typeof value === "object" ? [value, ...Object.values(value).flatMap(entitiesOf)] : []);
// Every element whose class list holds `token`, with where it starts and ends and its inner HTML.
function elementsWithClass(html, token) {
  const found = [];
  for (const match of html.matchAll(TAG)) {
    const classes = attribute(match[2], "class");
    if (classes === undefined || !classes.split(/\s+/).includes(token)) continue;
    const open = match.index + match[0].length;
    const closing = html.slice(open).match(new RegExp(String.raw`</${match[1]}\s*>`, "i"));
    const end = closing ? open + closing.index + closing[0].length : html.length;
    found.push({ start: match.index, end, inner: html.slice(open, closing ? open + closing.index : html.length) });
  }
  return found;
}

// Every object in the page's JSON-LD that carries a datePublished or dateModified, in document
// order; unparseable blocks are reported by name.
function datedEntities(html) {
  const dated = [];
  const broken = [];
  for (const [, json] of html.matchAll(JSON_LD)) {
    try {
      dated.push(...entitiesOf(JSON.parse(json)).filter((entity) => "datePublished" in entity || "dateModified" in entity));
    } catch (error) {
      broken.push(error.message);
    }
  }
  return { dated, broken };
}
// The dates a page states, { published, modified }, when it states exactly one pair of calendar
// dates; null otherwise (pageDateProblems says what is wrong).
export function statedDates(html) {
  const { dated } = datedEntities(html);
  if (dated.length !== 1 || !isCalendarDate(dated[0].datePublished) || !isCalendarDate(dated[0].dateModified)) return null;
  return { published: dated[0].datePublished, modified: dated[0].dateModified };
}

// A line of the page that is its date stamp: the JSON-LD date lines and the byline. A change to
// these alone is not a change to the page.
const STAMP_LINE = /"date(?:Published|Modified)"\s*:|class\s*=\s*["'][^"']*\bbyline\b/;
// The day a page last changed in anything but its date stamp, read from git: the latest day on
// which a commit on the first-parent line (the line the live site follows) wrote a change to the
// page outside the stamp. A commit's day is its author date (the day the change was written,
// which does not move while a pull request waits or is rebased); for a merge it is the latest
// author date among the commits it brought in that changed content, and a merge that kept its own
// page over a change its other side made reads that change's day as well. { date, sha }, or
// { date: null, reason } when history is out of reach: not a git checkout, a shallow clone, a
// repository with no commits yet, or no such commit.
export function lastContentChange(path, { cwd = process.cwd() } = {}) {
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  const exists = (revision) => {
    try {
      git("rev-parse", "-q", "--verify", revision);
      return true;
    } catch {
      return false;
    }
  };
  // Whether a commit changes the page in anything but the stamp, against its first parent or
  // another commit. A commit without a parent is the snapshot a repository starts from, not a
  // change written that day, so it dates nothing.
  const changesContent = (sha, from = `${sha}^`) =>
    exists(from) &&
    git("diff", from, sha, "--", path)
      .split("\n")
      .some((row) => /^[+-]/.test(row) && !/^(\+\+\+|---)/.test(row) && !STAMP_LINE.test(row));
  // [sha, author date, committer date] for every commit in reach that changes the page.
  const commits = (...args) =>
    git("log", "--format=%H\t%as\t%cs", ...args, "--", path)
      .split("\n")
      .filter(Boolean)
      .map((line) => line.split("\t"));
  const latest = (changes) => changes.reduce((best, change) => (!best || change.date > best.date ? change : best), null);
  let shallow;
  try {
    shallow = git("rev-parse", "--is-shallow-repository");
  } catch {
    return { date: null, reason: "not a git checkout" };
  }
  if (shallow === "true") return { date: null, reason: "a shallow clone, whose history stops short" };
  if (!exists("HEAD")) return { date: null, reason: "a repository with no commits yet" };
  // A merge on the line that kept its own page over a change its second side made since the two
  // parted still read that change. A branch does this when it merges its base and keeps its
  // version; merged into the base, the base's change is on the live line after all, so the branch
  // dates the page as its pull request's merge does. `--first-parent` lists only a merge whose page
  // differs from its first parent, so these are found among every merge whose page differs from
  // either.
  const line = git("rev-list", "--first-parent", "HEAD").split("\n");
  const position = new Map(line.map((sha, index) => [sha, index]));
  const listed = commits("--first-parent");
  const known = new Set(listed.map(([sha]) => sha));
  const kept = commits("--merges", "--full-history").filter(([sha]) => position.has(sha) && !known.has(sha));
  const onLine = [...listed, ...kept].sort(([a], [b]) => position.get(a) - position.get(b));
  // Where a merge's two sides parted, or null for histories that never shared a commit.
  const parted = (sha) => {
    try {
      return git("merge-base", `${sha}^1`, `${sha}^2`);
    } catch {
      return null;
    }
  };
  // A change lands no earlier than it was written, so once a landing is older than the best day
  // found, nothing older can beat it.
  let best = null;
  for (const [sha, written, landed] of onLine) {
    if (best && landed <= best.date) break;
    let change = null;
    if (known.has(sha)) {
      if (!changesContent(sha)) continue;
      change = { date: written, sha };
    } else {
      const base = parted(sha);
      if (base && !changesContent(`${sha}^2`, base)) continue;
    }
    if (exists(`${sha}^2`)) {
      const inside = latest(commits("--no-merges", `${sha}^1..${sha}^2`).filter(([inner]) => changesContent(inner)).map(([inner, day]) => ({ date: day, sha: inner })));
      if (inside) change = inside;
    }
    best = latest([best, change].filter(Boolean));
  }
  return best ?? { date: null, reason: `no commit in reach changes ${path} outside its date stamp` };
}

// The first date marker in an HTML file, as words for a message, or null when it carries none:
// what makes a file a dated page, so that every page carrying one is held to the rules above.
export function dateMarker(html) {
  const key = html.match(/"(datePublished|dateModified)"\s*:/);
  if (key) return `JSON-LD ${key[1]}`;
  if (elementsWithClass(html, "byline").length > 0) return 'an element of class "byline"';
  if (/<time\b/i.test(html)) return "a <time> element";
  const graph = html.match(/article:(published|modified)_time/i);
  if (graph) return `an Open Graph article:${graph[1].toLowerCase()}_time`;
  return null;
}

// Every problem with a page's dates, each a sentence that starts with what is wrong and ends
// with what to write. An empty list means the page's dates agree with themselves.
export function pageDateProblems(html, { today = latestToday() } = {}) {
  const problems = [];
  const { dated, broken } = datedEntities(html);
  for (const message of broken) problems.push(`carries JSON-LD that does not parse: ${message}.`);
  if (dated.length !== 1) {
    problems.push(`carries ${dated.length} JSON-LD entities with a datePublished or dateModified; exactly one, the page's own, carries both.`);
    return problems;
  }
  const [entity] = dated;
  const dates = {};
  for (const key of ["datePublished", "dateModified"]) {
    if (!isCalendarDate(entity[key])) {
      problems.push(`JSON-LD ${key} is ${JSON.stringify(entity[key] ?? null)}; this repository writes it as a calendar date, YYYY-MM-DD.`);
      continue;
    }
    dates[key] = entity[key];
    if (entity[key] > today) problems.push(`JSON-LD ${key} ${entity[key]} is after ${today}, the latest calendar date now in effect anywhere; a page is not published or modified in the future.`);
  }
  const { datePublished: published, dateModified: modified } = dates;
  if (published && modified && modified < published) {
    problems.push(`JSON-LD dateModified ${modified} is before datePublished ${published}; a page is modified after it is published, or on the same day.`);
  }

  const markup = html.replace(SCRIPT_OR_STYLE, " ");
  const bylines = elementsWithClass(markup, "byline");
  if (bylines.length !== 1) {
    problems.push(`has ${bylines.length} elements of class "byline"; exactly one, carrying the page's dates as <time> elements.`);
    return problems;
  }
  const [{ start, end, inner }] = bylines;
  const figures = visible(inner.replace(TIME, " ")).match(/\d(?:[\d.,/:-]*\d)?/);
  if (figures) {
    problems.push(`byline writes "${figures[0]}" outside a <time> element (the byline reads ${show(inner)}); a date in the byline is a <time datetime="YYYY-MM-DD"> element, and nothing else in the byline is written in figures, so every date it shows is held to the JSON-LD.`);
  }
  const times = [];
  for (const [, attributes, text] of inner.matchAll(TIME)) {
    const datetime = attribute(attributes, "datetime");
    if (!isCalendarDate(datetime)) {
      problems.push(datetime === undefined ? `byline has a <time> element with no datetime attribute; write datetime="YYYY-MM-DD".` : `byline has a <time> element without a calendar date in datetime (${JSON.stringify(datetime)}); write datetime="YYYY-MM-DD".`);
      continue;
    }
    if (visible(text) !== longDate(datetime)) problems.push(`byline <time datetime="${datetime}"> shows ${show(text)}; that date is written "${longDate(datetime)}".`);
    times.push(datetime);
  }

  // The rest of the page: no date lives anywhere but the byline and the JSON-LD.
  const rest = `${markup.slice(0, start)} ${markup.slice(end)}`;
  const stray = rest.match(TIME);
  if (stray) problems.push(`writes a <time> element outside the byline (${show(stray[0])}); the page's dates live in the byline, where they are held to the JSON-LD.`);
  for (const [, attributes] of rest.matchAll(META)) {
    const property = attribute(attributes, "property")?.toLowerCase();
    const key = property === "article:published_time" ? "datePublished" : property === "article:modified_time" ? "dateModified" : null;
    if (!key || !dates[key]) continue;
    const content = attribute(attributes, "content") ?? "";
    if (content.slice(0, 10) !== dates[key]) problems.push(`<meta property="${property}"> says ${JSON.stringify(content)} where JSON-LD ${key} is ${dates[key]}; the two name one day, moved together.`);
  }
  const written = visible(rest.replace(/<[^>]*>/g, " ")).match(TEXT_DATE);
  if (written) problems.push(`writes a date in its text outside the byline ("${written[0]}"); the page's dates live in the byline, where they are held to the JSON-LD, so move it there or take it out.`);

  if (!published || !modified) return problems;
  if (times.length === 0) {
    problems.push(`byline shows no <time> element; the publication date is written "published <time datetime="${published}">${longDate(published)}</time>".`);
    return problems;
  }
  if (times[0] !== published) {
    problems.push(`byline's first date is ${times[0]} where JSON-LD datePublished is ${published}; the byline opens with the publication date, "published <time datetime="${published}">${longDate(published)}</time>".`);
  }
  const opening = visible(inner.replace(TIME, "\u0000").split("\u0000")[0]);
  if (!/\bpublished$/i.test(opening)) {
    problems.push(`byline introduces the publication date with "${opening}"; the word before that date is "published", so a reader knows which date is which.`);
  }
  if (modified === published) {
    if (times.length > 1) {
      problems.push(`byline shows a second date (${times[1]}) although JSON-LD dateModified equals datePublished (${published}); either the page was modified, so set dateModified, or it was not, so drop the second date.`);
    }
    return problems;
  }
  if (times.length < 2) {
    problems.push(`byline shows no update although JSON-LD dateModified (${modified}) is after datePublished (${published}); write "· updated <time datetime="${modified}">${longDate(modified)}</time>" after the publication date.`);
    return problems;
  }
  if (times.length > 2) problems.push(`byline shows ${times.length} dates; two at most, the publication date and the update.`);
  if (times[1] !== modified) {
    problems.push(`byline's update date is ${times[1]} where JSON-LD dateModified is ${modified}; the two are one date, moved together.`);
  }
  const lead = visible(inner.replace(TIME, "\u0000").split("\u0000")[1] ?? "");
  if (!/^·\s*updated$/i.test(lead)) {
    problems.push(`byline introduces the update date with "${lead}"; it is written "· updated " so a reader knows which date is which.`);
  }
  return problems;
}
