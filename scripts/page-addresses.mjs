// Every page names the address it is served at, the same way everywhere (since 2026-11-15).
//
// A page states its own address three times: the canonical link, which tells a search engine
// which address to index; og:url, which a share preview links to; and the WebPage or
// CollectionPage node of its JSON-LD (or the url of the article or how-to it holds). Each
// theme page also states where it sits, in a BreadcrumbList. verify compares the theme pages with what their builder renders, which
// catches a hand edit but not a builder bug: a builder that wrote another page's address, or
// a breadcrumb one level short, would regenerate into pages that agree with themselves. So
// these checks take the expected address from where GitHub Pages serves the file (the domain
// in CNAME and the file's own path) and the expected name from the theme file itself.
//
// A page that sets none of the three and asks not to be indexed (the imprint) or that is an
// asset rendered for screenshots (assets/) is left alone; any address it does state must
// still be its own.
import { htmlTags } from "./html-tags.mjs";

// The address GitHub Pages serves a file at: a directory's index.html is served at the
// directory, every other page at its own name.
export function servedAddress(path, site) {
  const base = new URL(site);
  if (base.pathname !== "/" || base.search || base.hash) throw new Error(`The site address ${site} must be a bare origin.`);
  const directory = path === "index.html" ? "" : path.endsWith("/index.html") ? path.slice(0, -"index.html".length) : null;
  return new URL(directory ?? path, base).href;
}

// An address as a browser or crawler resolves it: absolute, and written any equivalent way
// ("https://gabs-utilities.com" is "https://gabs-utilities.com/"). A relative one resolves
// against wherever it is read from, so it names no one address and never matches.
const absolute = (value) => {
  try {
    return new URL(String(value)).href;
  } catch {
    return null;
  }
};

const relTokens = (value) => String(value).toLowerCase().split(/[\t\n\f\r ]+/).filter(Boolean);

// The page's own address as each place states it, read as the browser's tokenizer reads tags.
export function statedAddresses(markup) {
  const canonical = [];
  const ogUrl = [];
  let noindex = false;
  for (const tag of htmlTags(markup)) {
    if (tag.closing || tag.foreign) continue;
    const attribute = (name) => tag.attributes.find((entry) => entry.name === name)?.value;
    if (tag.name === "link" && relTokens(attribute("rel") ?? "").includes("canonical")) canonical.push(attribute("href") ?? "");
    if (tag.name === "meta" && String(attribute("property") ?? "").toLowerCase() === "og:url") ogUrl.push(attribute("content") ?? "");
    if (tag.name === "meta" && String(attribute("name") ?? "").toLowerCase() === "robots" && relTokens(String(attribute("content") ?? "").replace(/,/g, " ")).includes("noindex")) noindex = true;
  }
  return { canonical, ogUrl, noindex };
}

const PAGE_TYPES = new Set(["WebPage", "CollectionPage"]);
const CONTENT_TYPES = new Set(["Article", "TechArticle", "BlogPosting", "HowTo"]);
const nodesOf = (value) => (Array.isArray(value) ? value : value && typeof value === "object" ? [value, ...(Array.isArray(value["@graph"]) ? value["@graph"] : [])] : []);
const typesOf = (node) => (Array.isArray(node?.["@type"]) ? node["@type"] : [node?.["@type"]]);

// What a page says about its own address that is not its served address, as sentences.
// jsonLd is the page's parsed JSON-LD blocks.
export function addressProblems(path, markup, jsonLd, site) {
  const served = servedAddress(path, site);
  const { canonical, ogUrl, noindex } = statedAddresses(markup);
  const pageNodes = jsonLd.flatMap(nodesOf).filter((node) => typesOf(node).some((type) => PAGE_TYPES.has(type)));
  const exempt = path.startsWith("assets/") || (noindex && !canonical.length && !ogUrl.length && !pageNodes.length);
  const problems = [];
  for (const [label, found] of [["canonical link", canonical], ["og:url", ogUrl]]) {
    if (found.length > 1) problems.push(`${path} states ${found.length} ${label}s; it may state one, its own address ${served}.`);
    else if (!found.length && !exempt) {
      problems.push(`${path} has no ${label}. Every indexed page names its own address, ${served}, so a search engine and a share preview both land on it.`);
    }
    for (const value of found) {
      if (absolute(value) !== served) {
        problems.push(
          `${path} gives its ${label} as ${JSON.stringify(value)}, but GitHub Pages serves it at ${served} ` +
            `(the domain in CNAME and the file's own path). Write that address, in full.`,
        );
      }
    }
  }
  for (const node of pageNodes) {
    for (const key of ["@id", "url"]) {
      if (key in node && absolute(node[key]) !== served) {
        problems.push(`${path}'s ${typesOf(node).join("/")} node gives ${key} ${JSON.stringify(node[key])}; the page is served at ${served}.`);
      }
    }
  }
  // An article or a how-to is the page's own content, so its url, where it gives one, is the page.
  for (const node of jsonLd.flatMap(nodesOf).filter((node) => typesOf(node).some((type) => CONTENT_TYPES.has(type)))) {
    if ("url" in node && absolute(node.url) !== served) {
      problems.push(`${path}'s ${typesOf(node).join("/")} node gives url ${JSON.stringify(node.url)}; the page is served at ${served}.`);
    }
  }
  return problems;
}

// A theme page's trail: the site, the theme index, then the page itself under its theme's name.
export function expectedBreadcrumb(site, themeName, served) {
  const origin = new URL(site).href;
  return [
    { "@type": "ListItem", position: 1, name: "Gabs Utilities", item: origin },
    { "@type": "ListItem", position: 2, name: "Themes", item: new URL("theme/", origin).href },
    { "@type": "ListItem", position: 3, name: themeName, item: served },
  ];
}

export function breadcrumbProblems(path, jsonLd, site, themeName) {
  const served = servedAddress(path, site);
  const lists = jsonLd.flatMap(nodesOf).filter((node) => typesOf(node).includes("BreadcrumbList"));
  if (lists.length !== 1) return [`${path} carries ${lists.length} BreadcrumbLists; a theme page carries exactly one, ending at itself.`];
  const expected = expectedBreadcrumb(site, themeName, served);
  const actual = lists[0].itemListElement;
  if (JSON.stringify(actual) === JSON.stringify(expected)) return [];
  return [
    `${path}'s BreadcrumbList reads ${JSON.stringify(actual)}; it must read the site, the theme index and the page ` +
      `itself under the theme file's name: ${JSON.stringify(expected)}.`,
  ];
}
