# Storefront exposure

How the reach surfaces of this project fit together, and the one rule that has
nearly been broken twice. Read it before editing `index.html`, `llms.txt`,
`sitemap.xml`, `robots.txt`, `themes.json`, the generated pages under `theme/`
or any JSON-LD block: SEO and meta tags, structured data, the sitemap, the
machine-readable theme index, README and marketplace presentation, launch and
directory listings. It does not cover pricing, payment links or product copy
that states a price — those are payment surfaces, see `CLAUDE.md`.

This was a skill in `.claude/skills/` until 2026-10-19. Every skill there ships
to installers through `berlin-studio-skills`, and this one is about one site,
so it moved here (`CLAUDE.md`, "Proving a guard", rule 11).

## The hard rule: a machine-readable price is a published price

**Never put a product price into structured data, a feed, an API file or any
other machine-readable surface.** Not `schema.org/Offer`, not `themes.json`, not
an RSS or JSON feed, not a sitemap extension.

The reason is specific and not obvious. `index.html` states prices, and CI
guards them — but that guard only asserts the page has not *drifted* from what
it said when recorded. **Claude has read back no Gumroad product price in this
repo, and only one product has any recorded read-back** — a publishing record
left by whoever published it, not a check CI can repeat. See `CLAUDE.md`,
"Gumroad — the unverified half of the shop", and the table of what each
assertion actually means.

Printing an unverified price on a page a human reads is a mistake someone can
notice and report. Emitting it as a JSON-LD price hands it to Google for a rich
result, to aggregators, and to other agents, as a machine-checked fact. It then
propagates somewhere nobody in this repo controls. The repo has already paid
€1,200 once for a payment object that "looked right".

So: structured data describing the **free MIT-licensed plugin** is welcome and
already exists (`SoftwareApplication` with a genuinely free zero-price offer).
Structured data describing the **paid products** stays unbuilt until a human has
read those prices off Gumroad in a signed-in browser.

If asked for Product rich results, say this in a line, build everything else the
request needs, and leave the priced part for the browser pass.

This rule outranks tooling. An SEO plugin — `searchfit-seo`, with its
`generate-schema` command and `schema-markup` skill, is one — will happily emit
`Product`/`Offer` JSON-LD with prices filled in from the page. Its output is a
draft, not an authority: strip any price, `Offer`, or `priceCurrency` it
produces for the paid products before anything ships.

## The surfaces, and what each is for

| Surface | Serves | Guarded by |
|---|---|---|
| `index.html` head — meta, OG, Twitter, canonical | humans sharing links, social unfurls | `verify` requires share-image alt text, exactly one canonical link, equal to the `CNAME` domain, and a Content-Security-Policy right after `meta charset` naming the reviewed inline scripts |
| `index.html` JSON-LD | search engines; free plugin only | `verify` checks the plugin's version and download URL, allows one script-tag spelling and only the plain schema.org context, refuses microdata and RDFa, and requires exactly one ItemList on the site, checked against the theme files |
| `index.html` "Start here" row | a few picks, each chosen by a measured contrast ratio | written by `scripts/build-quick-picks.mjs` from the theme files; `verify` compares the block with a fresh build and checks each pick's theme page exists |
| `theme/` pages | one crawlable page per theme, and an index | written by `scripts/build-theme-pages.mjs` from the theme files; `verify` compares every page with a fresh build and reviews their one copy script by hash |
| `sitemap.xml` | crawler discovery of the public pages and the theme pages | written by the same builder, with a `<lastmod>` only on the two dated pages, read from each page's JSON-LD `dateModified`; `verify` holds it to a sitemap element allowlist, with no stylesheet, every `<loc>` to the site, compares it with a fresh build, and then reads it against the pages: every `<loc>` a served page with no robots `noindex`, listed once, every such page listed, and each `<lastmod>` equal to its page's `dateModified` |
| `robots.txt` | crawl permission; points at the sitemap | — |
| `llms.txt` | agents and LLM crawlers reading the catalog | `verify` reads the counts it states and the install commands it gives, requires a link to every root page a search engine may index and to the theme pages' index and address pattern, and refuses any address not on the site or not served, and any payment host named in it, linked or not |
| `themes.json` | tools, aggregators and agents consuming the original pack | `verify` rebuilds and byte-compares, and checks the content against the theme files |
| `README.md` | GitHub arrivals, the install path | `verify` checks the install commands and Gumroad slugs |
| `.claude-plugin/marketplace.json` | `claude plugin install` | `verify` checks every plugin: keys, manifests and the exact files each ships |
| Every link on every public page | visitors leaving the site | `verify` resolves each link as a browser does and holds its host to `reviewedLinkHosts`; PayPal, Gumroad and Agensi only at a verified id, slug or reviewed page |
| Every Markdown note (rendered by GitHub Pages as a page on the domain) | anyone who finds a note's URL | `verify` holds every link a note could render to `reviewedLinkHosts`, no payment host; front matter only `name`/`title`/`description`; no Liquid |
| Every other file Pages serves | anyone who opens its URL | `verify` allows only reviewed types (`SERVED_TYPES`); an SVG, opened directly, is a document, so SVG artwork is held to an element and attribute allowlist with no link, fetch or script (design-tool exports with presentation attributes pass); every page opens with `<!doctype html>` |

A directory badge, a launch-site link or any other link to a host the site has
not linked before fails `verify` until that host is added to `reviewedLinkHosts`
in `scripts/verify.mjs`. Add it deliberately, for an ordinary link only. A
checkout or payment host never goes on that list from exposure work; it is a
payment surface (see `CLAUDE.md`).

Adding a public page means adding it to `llms.txt` by hand and to
`FIXED_SITEMAP_PAGES` in `scripts/build-theme-pages.mjs`, then rebuilding.
`verify` fails on a served page a search engine may index that the sitemap
does not list, or, at the root, that `llms.txt` does not link, so a page that
should stay out of search carries a robots meta naming `noindex` instead, as
`impressum.html` and `assets/social-preview.html` do. Moving a dated page's `dateModified` moves its
`<lastmod>` too, so rebuild after it.

## themes.json — the pattern worth copying

`scripts/build-theme-index.mjs` generates it from the theme files; `verify`
rebuilds it and fails on any byte difference. Nothing in it is hand-written per
theme, so it cannot quietly disagree with what installs.

If you add another machine-readable feed, do it the same way: **generate it from
the real source and have CI rebuild and compare.** A feed maintained by hand is
a second copy of the truth, and the second copy is the one that goes stale. And
compare it with its source as well as with its generator: `verify` checks
`themes.json` against the theme files too, because a generator bug regenerates
into a file that agrees with itself.

One trap it already paid for: `themes.json` lives at the repo root, which makes
it the one root-level `.json` that is not a theme. Scripts that globbed root
`*.json` would each have counted it as one more theme — including
`sync-plugin-themes.mjs`, which would have shipped it *inside the installable
plugin*, and the theme-page builder, which threw on it. They now share the
`isThemeFile` predicate from `build-theme-index.mjs`. **Any new root-level data
file has the same problem.** Use that predicate; do not write a fresh
`.endsWith(".json")` filter.

## Editing index.html without touching the payment surface

The page is both the storefront and the theme gallery. Exposure work touches the
head, the copy and the gallery; it must not touch a Gumroad, PayPal or Agensi
anchor, a price, a slug, or an `aria-label` that states a price.

The gallery is the page's one inline script, reviewed by hash. Any change to it,
a theme row included, makes `verify` fail with the new hash: read the change,
then replace the old hash with it in `reviewedInlineScripts` in
`scripts/verify.mjs` and paste the policy `verify` prints over the page's own. The
policy is compared byte for byte and must follow `meta charset` with only
whitespace between: anything else there ends the head, and a browser ignores a
policy outside it. Never add a second script or loosen the policy to get green;
the browser enforces that policy too.

After any edit run `node scripts/verify.mjs` and `node --test scripts/*.test.mjs`.
If a payment check goes red on a change you believed was cosmetic, **the guard
is right and the edit was not cosmetic** — read what moved before touching the
tables.

The gallery renders from an inline JS array, so the storefront's own markup
carries no hand-written theme cards. Its crawlable per-theme content is
generated: the ItemList JSON-LD (a name and deep link per theme, from
`scripts/build-theme-index.mjs`), the "Start here" row of picks (from
`scripts/build-quick-picks.mjs`), and the `theme/` pages. Do not hand-write
cards into `index.html` markup — duplicated content that disagrees with the
array is worse than absent content; link to the generated pages instead.

## Standard of evidence

Same as the rest of the repo. A guard nobody has watched fail may not work: this
project has already shipped a check pinned to the wording `"for 12 euros"` that
went **silently inert** when the label was reworded, leaving a screen-reader
price unguarded with no error. When you add a check, break the page, watch it go
red, restore, and say which case you actually tested — and include a negative
control, because a check that fires on everything proves nothing.

## What needs Gabriel, and is not yours to decide

- Any price, currency, slug or payment link — read the provider's real object.
- Turnaround times and revision counts on the mixing and mastering cards: those
  are commitments to paying customers.
- Claims about reach, sales or customer counts. Do not invent social proof; if a
  number is wanted and nobody has measured it, say so and leave it out.
