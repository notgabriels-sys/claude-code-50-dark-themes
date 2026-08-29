---
name: storefront-exposure
description: >-
  Discoverability and reach work on gabs-utilities.com, the Gumroad shop and the
  GitHub repo — SEO and meta tags, structured data, sitemap, robots, llms.txt,
  the machine-readable theme index, README and marketplace presentation, launch
  and directory listings. Use whenever the task is to make something easier to
  find, index, share, cite or install: "improve SEO", "add structured data",
  "rich results", "schema.org", "open graph", "social preview", "sitemap",
  "llms.txt", "make this linkable", "backlinks", "launch on Product Hunt",
  "submit to a directory", "get more traffic", "make the repo more
  discoverable", or adding any machine-readable feed. Read it BEFORE editing
  index.html, llms.txt, sitemap.xml, robots.txt, themes.json or any JSON-LD
  block. Does NOT cover pricing, payment links or product copy that states a
  price — those are payment surfaces, see CLAUDE.md.
---

# Storefront exposure

How the reach surfaces of this project fit together, and the one rule that has
nearly been broken twice.

## The hard rule: a machine-readable price is a published price

**Never put a product price into structured data, a feed, an API file or any
other machine-readable surface.** Not `schema.org/Offer`, not `themes.json`, not
an RSS or JSON feed, not a sitemap extension.

The reason is specific and not obvious. `index.html` states prices, and CI
guards them — but that guard only asserts the page has not *drifted* from what
it said when recorded. **No Gumroad product price in this repo has ever been
read back from Gumroad.** See CLAUDE.md, "Gumroad — the unverified half of the
shop", and the table of what each assertion actually means.

Printing an unverified price on a page a human reads is a mistake someone can
notice and report. Emitting it as `"price": "12"` in JSON-LD hands it to Google
for a rich result, to aggregators, and to other agents, as a machine-checked
fact. It then propagates somewhere nobody in this repo controls. The repo has
already paid €1,200 once for a payment object that "looked right".

So: structured data describing the **free MIT-licensed plugin** is welcome and
already exists (`SoftwareApplication` with a genuinely free `price: "0"` offer).
Structured data describing the **paid products** stays unbuilt until a human has
read those prices off Gumroad in a signed-in browser.

If asked for Product rich results, say this in a line, build everything else the
request needs, and leave the priced part for the browser pass.

## The surfaces, and what each is for

| Surface | Serves | Guarded by |
|---|---|---|
| `index.html` head — meta, OG, Twitter, canonical | humans sharing links, social unfurls | — |
| `index.html` JSON-LD | search engines; free plugin only | — |
| `sitemap.xml` | crawler discovery of the four public pages | — |
| `robots.txt` | crawl permission; points at the sitemap | — |
| `llms.txt` | agents and LLM crawlers reading the catalog | — |
| `themes.json` | tools, aggregators and agents consuming the 50 themes | `verify` rebuilds and byte-compares |
| `README.md` | GitHub arrivals, the install path | `verify` checks the install command and Gumroad slugs |
| `.claude-plugin/marketplace.json` | `claude plugin install` | `verify` checks both plugins are registered |

Adding a public page means adding it to **both** `sitemap.xml` and `llms.txt`.
Neither is generated, so neither notices a page that was never listed.

## themes.json — the pattern worth copying

`scripts/build-theme-index.mjs` generates it from the theme files; `verify`
rebuilds it and fails on any byte difference. Nothing in it is hand-written per
theme, so it cannot quietly disagree with what installs.

If you add another machine-readable feed, do it the same way: **generate it from
the real source and have CI rebuild and compare.** A feed maintained by hand is
a second copy of the truth, and the second copy is the one that goes stale.

One trap it already paid for: `themes.json` lives at the repo root, which makes
it the one root-level `.json` that is not a theme. Three scripts globbed root
`*.json` and would each have counted it as a 51st theme — including
`sync-plugin-themes.mjs`, which would have shipped it *inside the installable
plugin*. They now share the `isThemeFile` predicate from
`build-theme-index.mjs`. **Any new root-level data file has the same problem.**
Use that predicate; do not write a fresh `.endsWith(".json")` filter.

## Editing index.html without touching the payment surface

The page is both the storefront and the theme gallery. Exposure work touches the
head, the copy and the gallery; it must not touch a Gumroad or PayPal anchor,
a price, a slug, or an `aria-label` that states a price.

`verify` enforces that, so after any edit run `node scripts/verify.mjs` and
`node scripts/verify.test.mjs`. If a payment check goes red on a change you
believed was cosmetic, **the guard is right and the edit was not cosmetic** —
read what moved before touching the tables.

The gallery renders from an inline JS array, so theme content is not in
crawlable HTML. That is a known limit, not an oversight to silently "fix" by
duplicating 50 cards into the markup — duplicated content that disagrees with
the array is worse than absent content. If crawlable per-theme content is
wanted, generate it from the same source the array comes from.

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
