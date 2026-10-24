# Project notes

Repo: 50 dark themes for Claude Code. Shop surface is `index.html`
(GitHub Pages), products sold via Gumroad.

## Working agreement — act, don't ask

Standing instruction from Gabriel, 2026-08-24: **add, remove, create,
implement and install plugins, skills and tooling yourself.** Do not come back
with a list of things he should go and click. Build it.

What that reaches, and how it is done here:

- **Skills** → write them into `.claude/skills/<name>/SKILL.md`, then
  `node scripts/sync-plugin-skills.mjs` to mirror them into the installable
  plugin. CI fails on drift between the two. A skill there ships to
  everyone who installs `berlin-studio-skills`, so it must work outside this
  repo and for any user; a method that only makes sense here goes in this
  file or in `docs/`.
- **The storefront and SEO method** is `docs/STOREFRONT_EXPOSURE.md` (a skill
  until 2026-10-19). Read it before editing `index.html`, `llms.txt`,
  `sitemap.xml`, `robots.txt`, `themes.json`, the `theme/` pages or any
  JSON-LD block.
- **Plugins** → this repo *is* a Claude Code plugin marketplace
  (`.claude-plugin/marketplace.json`). Adding a plugin here makes it
  installable anywhere with `claude plugin install <name>`, which is the
  route around account-level settings. Register it in the marketplace and add
  it to `expectedPlugins`, `shippedCounts`, `expectedPackageFiles` and
  `releasedPackages` in `scripts/verify.mjs` — and to `themePluginNames` if it
  ships themes. A changed theme or skill ships only with a new version (see
  "A changed package needs a new version"). Never add a git submodule anywhere
  in this repo (see the CI-tripwire section).
- **Hooks, permissions, env** → `.claude/settings.json`.

What it genuinely cannot reach, so do not promise it: claude.ai **account-level**
connectors and plugins are toggled in claude.ai settings, and no tool in a
Claude Code session enables, disables, or authorizes one. `SuggestConnectors`
and `SuggestPluginInstall` only render cards. A non-interactive session also
cannot run an OAuth flow. When something needs that, say so once, in a line,
and then build whatever *is* buildable instead of stopping.

**This authorization does not extend to payment surfaces.** Everything under
"Payment surfaces" below still holds without exception: no price, link, slug or
currency changes from a description, and `create_payment_link` stays off limits.
Building tooling is authorized; moving money is not.

## Standard of work

Gabriel's standing bar, 2026-08-24: cutting edge, highest quality, deeply
studied, and performed well in practice. Stated as ambition; what follows is
the operational form, so it can be checked rather than felt. Every rule below
was earned by something that actually went wrong here — most of them in
Claude's own work.

**Read the real object. Never infer it.** A price, a link, a balance or a
status is a fact about a live system, not about this repo or a description of
it. The €1,200 charge came from a link that "looked right". The PayPal
connector returning zero links for a shop with three live ones is the same
trap wearing a different face — see "Reading the account".

**A passing test is not evidence. A failing one is.** Every guard here was
proven by deliberately breaking `index.html` and confirming the build goes red,
then restoring. A guard never seen to fire may not work at all. Two of them
did not: the allowlists silently truncated a tampered id to a known prefix and
passed a €1,200 lookalike link. That was found by attacking the guard, not by
reading it.

**Re-attack your own work before handing it over.** The uppercase-truncation
bug was fixed on the Gumroad side and left standing on the PayPal side three
commits later, because fixing it once felt like finishing. Assume the same
defect class exists everywhere you have not checked.

**Say exactly how strong a claim is.** `verifiedPayPalLinks` asserts a human
read the price back from the provider. `verifiedGumroadSlugs` asserts only that
a human loaded the product page and it is published — existence, not price.
`recordedGumroadPrices` asserts only what `index.html` itself said on the day it
was recorded. All three are useful; treating a weaker one as the strongest is
how an unverified price ships. Label the weaker one as weaker, in the code and
in this file.

**Do not record facts that rot.** Line numbers in this file went stale twice in
one day and were removed. Prefer counts, slugs, ids and commands that
re-derive the answer (`grep -n`) over a snapshot that quietly ages into a lie.

**Correct the record the moment it is wrong**, including your own earlier
statements in the same session. This file has retracted a wrong reading of the
PayPal account, a wrong link inventory, and a wrong line range. A document
nobody trusts is worse than no document.

**Finish to a verified state, not a plausible one.** Green CI, guards proven to
fire, the working tree restored, and the claim in the commit message matching
what the code does. "Should work" is not a result.

## Proving a guard — the working method, earned here

Every guard in `scripts/verify.mjs` was added by this loop, and every rule
below was paid for by a defect in Claude's own work in this repo. Recorded
2026-09-02 as commands and counts, not line numbers.

1. **Reproduce green first.** Break a copy of the tree under the scratchpad
   the way the defect would, run `node scripts/verify.mjs`, and watch it pass.
   A guard built without seeing the hole pass is guarding a guess.
2. **A fixture edit asserts its anchor.** Count the anchor string before
   replacing it and require exactly one match. A replace that matched zero or
   two times silently produced a fixture that tested nothing — twice.
3. **A control must fail for its own reason.** Read the error text, not the
   exit code. A thirteenth Vol. 2 theme first failed on a duplicate display
   name, which proved nothing about the count guard it was meant to prove.
4. **Run a new scan against the real tree before trusting it**, and treat
   every match as a finding. The prose-count scan found three false positives
   that way ("Vol. 2 themes", "70 VS Code themes", "one of my 50 themes") and
   one public page that stated a count nobody had listed. When a scan's
   pattern changes, diff what it reads against what the old one read, not
   only what it refuses: a stop-word rule written as a prefix read "all-new"
   as "all" and quietly stopped reading two real counts, and the listing of
   reads showed it, unnoticed, before the old tests did.
5. **Mutation-test every new test.** Gut the guard it covers and confirm that
   test, and only that test, fails. Reset the mutated file between mutations:
   a scratch copy with no commit cannot be checked out back, and two mutations
   stacked once without anyone noticing until the pass count looked wrong.
6. **Compose bad patterns from pieces** in tests (join `"[a-z0"` and
   `"-9-]+"`), so the self-check that scans every script for the truncating
   capture does not fire on the test that exercises it. It did, and took
   fifteen unrelated tests down with it.
7. **Escapes, not bytes.** Write `"\u0000"` in source, never a literal NUL.
   It ran and the suite passed; grep started calling the file binary. A
   literal byte-order mark slipped into a regex the same way on 2026-10-18,
   through an edit tool, and only a `sed` print showed it. Check both:
   `python3 -c "s=open('scripts/verify.mjs','rb').read(); print(s.count(b'\x00'), s.count(b'\xef\xbb\xbf'))"`.
8. **Control characters in a commit message** go through
   `git commit -F <file>` from the scratchpad.
9. **CI publishes a check run, not a commit status.** Read it with
   `get_check_runs`; `get_status` reports pending forever.
10. **A count in prose rots.** When something is added, `verify` fails on the
    stale sentence by design — fix the sentence, never the guard.
11. **Every skill in `.claude/skills/` ships to installers** through
    `berlin-studio-skills`. A repo-internal method belongs in this file or
    in `docs/`, not in a skill; `storefront-exposure` was one, and moved to
    `docs/STOREFRONT_EXPOSURE.md`.
12. **Distrust an expected value that comes from the code being checked.**
    `verify` compared `themes.json` and the crawlable ItemList in `index.html`
    only with what their generator produces now, so a generator bug
    regenerated into a file that agreed with itself — a one-key palette in
    one, a dropped theme and dead anchors in the other — and CI stayed green.
    A byte comparison catches hand edits; content needs a second source (the
    theme files, the page's canonical link, the plugin manifest).
13. **A guard that re-implements someone else's parser is tested against the
    real one, and the harness is proven before its silence counts.** The
    structured-data reader in `verify` is run differentially against Chromium:
    generated snippets go through both, and any page Chromium builds an
    `itemscope` element from while `verify` accepts it is a miss. The first
    random run reported zero misses on the reader that was then known broken
    (`<title>x<!--</title>`), so it proved nothing; a narrower vocabulary and
    then exhaustive enumeration were needed before a clean result on the fixed
    reader meant anything. Run the old code through the same harness first,
    and see it fail. The harness lives in the scratchpad, not here, because CI
    has no browser.

## Payment surfaces — read before adding any buy button

**Never add a payment button from a description of an account, or from a
URL that looks correct.** Read the payment provider's actual objects —
link, amount, currency, tax treatment — and only add a button when what
you read matches the rate card below. A Stripe link that "looked right"
sat on the shop through two review rounds and was a live €1,200 charge
for the wrong service.

Current state of `index.html` (re-counted 2026-08-24, after `main` retired two
audio products, then restyled the storefront and retired `zvbti`):

- **15 distinct Gumroad products** across **16 link occurrences** in
  `index.html` (re-counted 2026-10-18 after merging `main`, which withdrew the
  free zip `slhbym` in `6422979`; the morning's count of 16 across 17 lasted
  one merge, and the 2026-08-24 figure of 15 across 18 had gone stale before
  that, when `main` added `dark-invoice-business-documents`). All are on `notgabriel.gumroad.com/l/<slug>`; four
  carry `?utm_source=...`, and only `ckthsb` appears twice. Do not trust these
  numbers either — re-derive them: `node scripts/verify.mjs` prints the
  distinct-product count in its summary, and the occurrence count is
  `grep -o 'notgabriel.gumroad.com/l/' index.html | wc -l`. Each retirement
  was caught by the CI guard before the slug was dropped from the tables,
  deliberately rather than to silence a red build.
- **Prices are stated in three places** and the guard checks all three: an `<i>`
  on the grid cards, a `<span>` on the developer-picks cards, and words in those
  cards' `aria-label` ("for 12 euros"). A screen-reader label that disagrees
  with the visible price is a wrong price for the buyer who cannot see it.
- **3 PayPal NCP links** in "Mixing & mastering".
- **1 Agensi link** in the tools row (main's #58), to the setup-assistant
  skill; no price on the card. Reviewed 2026-10-19 on Gabriel's decision and
  held to that one page — see "`agensi.io`, one page" below.
- **No Stripe link anywhere.** `git log -S stripe` across all branches still
  returns nothing beyond this file and the CI guard itself, so the bad €1,200
  link never lived in this repo — it was on some other surface, and may still be.

**Line numbers are deliberately not recorded here.** They moved twice inside one
day. Re-derive them with `grep -n` and trust the counts and slugs instead.

The previous note here — "eleven Gumroad links … at lines 259–271" and "the
€39 bundle" — was written after `bf14643` and is now wrong on all three
counts: the number, the line range, and the bundle's currency. The shop grew
and the note did not. **Re-count before trusting any inventory line in this
file.**

## The CI tripwire — `scripts/verify.mjs`

Undocumented here until 2026-08-24, and it is the strongest protection this
repo has. `verify` runs on every pull request, on every push to `main` and on
demand, and **fails the build** on:

- any occurrence of `stripe` (case-insensitive) on any public page, in
  `README.md` or in `llms.txt` (until 2026-10-18 it read `index.html` alone);
- **(added 2026-10-18)** any link a browser can follow from a public page to a
  host outside `reviewedLinkHosts`, or to `www.paypal.com` or
  `notgabriel.gumroad.com` anywhere but a verified NCP id or Gumroad slug — see
  "Every link goes to a reviewed host" below;
- **(added 2026-10-18)** any file GitHub Pages serves whose type is not in
  `SERVED_TYPES`, an SVG or XML document outside its element and attribute
  allowlist (the reader's other refusals are listed there), a sitemap location
  off the site, front matter outside a note's `name`/`title`/`description`, a symlink
  anywhere Pages serves, a page without a doctype, a `.mjs` at or above a page,
  a script with a `src` on any page, an active element or handler in a note,
  and any name starting `.htaccess` — see "Every served file is one `verify`
  reads" below;
- **(added 2026-10-19)** an inline script whose hash is not in
  `reviewedInlineScripts`, a reviewed hash no page runs, and a page whose
  Content-Security-Policy is missing, misplaced, doubled or names anything but
  exactly those hashes, and a NUL or an attribute written twice on any served
  page — see "Every inline script is reviewed" below;
- **(added 2026-10-20)** a plugin's themes or skills that differ from the
  digest recorded for the version that ships them — see "A changed package
  needs a new version" below;
- the retired résumé checkout slug `notgabriel.gumroad.com/l/wmlrk`;
- any of the three verified PayPal links going missing;
- **(added 2026-08-24)** any of the three carrying a price other than its
  verified one — €45 / €160 / €190;
- **(added 2026-08-24)** *any* `paypal.com/ncp/payment/<ID>` on the page whose
  ID is not in the verified table in `scripts/verify.mjs`;
- **(added 2026-08-24)** any Gumroad card whose printed price differs from the
  one recorded in `recordedGumroadPrices` — drift only, see the warning below
  about how much weaker that table is than the PayPal one.

The two NCP checks above — a listed link's price, and any unlisted id — close
the hole that mattered. (This read "the last two" until 2026-10-19; the Gumroad
drift bullet had been added below them the same day it was written.) The original check only asserted the
three links were *present*, so a fourth, unverified, wrongly-priced link could
be added and CI would pass — which is the exact shape of the €1,200 charge. Now
an unlisted link cannot ship, and a listed one cannot drift off its price. Both
failure modes were tested by deliberately breaking the page and confirming the
build fails.

**(added 2026-08-24, found by reviewing the guards above) Capture to a
delimiter, never to a character class.** The first version of both allowlists
extracted the id with a permitted-character pattern — `([A-Z0-9]+)` for PayPal,
`([A-Za-z0-9_-]+)` for Gumroad. A tampered link then **truncated to a known
prefix and passed**: `.../ncp/payment/3SWZ64EXW9C8Wx` read as the verified id
`3SWZ64EXW9C8W`, so a €1,200 lookalike link sat alongside the real one and CI
went green. `gumroad.com/l/bqgfv.evil` did the same. Both were reproduced
against the live page, then fixed to capture `([^"'\s<>]+)` — everything up to
a quote, space or bracket. The PayPal presence check was also a bare substring
match, which a longer lookalike satisfies; it is now quote-exact. **Do not
narrow these patterns back to a character class.**

**This does not replace reading the payment provider's real objects.** CI can
only check the page against a table a human verified through the browser. A
wrong price in that table would sail through. Adding a link to
`verifiedPayPalLinks` is an assertion that you personally read it back from
`paypal.com/ncp/links/<ID>` — never do it to make the build pass.

**(added 2026-08-24) Gumroad structural guards.** `verify` fails on any Gumroad
link whose host is not exactly `notgabriel.gumroad.com` (a lookalike or a typo),
a slug not in `verifiedGumroadSlugs` — checked across `index.html`, every other
public page, and `README.md` — or a recorded slug that has vanished from the
page.

**(added 2026-08-24) Gumroad page-price drift.** `recordedGumroadPrices` records
what each product states, and `verify` fails if any stated amount changes, if a
priced product states nothing, if a no-price product grows a price (none is on the shop since the free zip
`slhbym` was withdrawn in `6422979`), or if an
`aria-label` reads out a number or a currency that disagrees with the visible
one. It matches on the *number*, not the markup: main restyled the cards to
"View product · €12" the same day, and a check pinned to `<i>€12</i>` would have
gone red for a wording change while still passing a card that showed a second,
wrong number elsewhere in the same anchor. The same change was made to the
PayPal card check for the same reason.

**Slugs are taken to a delimiter and then split on `?`/`#`.** The
developer-picks row legitimately carries `?utm_source=...`, and `?` genuinely
ends a URL path, so stripping it resolves the link to the product it names. That
is not the same as stopping at a permitted-character class, which would read
`bqgfvX` as `bqgfv` — the bypass this file already paid for. `bqgfvX?utm=x` is
still `bqgfvX` and still fails.

**A Gumroad URL outside an `<a>` fails the build too.** The price checks read
anchors, so a URL printed as plain text would slip past them; `verify` counts
raw Gumroad URLs against anchors found and fails on a mismatch.

**(added 2026-10-18) Every link goes to a reviewed host.** The checks above all
read text, so each saw only the spelling it was written for. Reproduced with
`verify` green: a Stripe link on `impressum.html`; `buy.&#115;tripe.com`,
`buy.%73tripe.com` and `buy&period;stripe.com` on `index.html`, which Chromium
all resolves to `https://buy.stripe.com/`; a checkout on another provider; a
PayPal.me link and a PayPal donate button, which are PayPal payment links
outside the NCP path the PayPal table guards; and an unverified NCP id and an
unverified, priced Gumroad slug behind `&period;`. Now every URL attribute on
every public page is read with `htmlTags`, resolved by the URL parser, and held
to `reviewedLinkHosts` — an allowlist, because a list of forbidden providers
goes stale and a custom checkout domain is on none. On `www.paypal.com` and
`notgabriel.gumroad.com` the path must be a verified NCP id or Gumroad slug. A
link off the site must be spelled `https://<host>/` exactly, with `&` written
`&amp;` and no other character reference, so the text checks above see every
payment link in the spelling a browser follows. A `base href` and a
`meta http-equiv` of `refresh` are refused, and every served `.html` page
carries exactly one Content-Security-Policy meta. **Linking a new host is a deliberate edit to
`reviewedLinkHosts`; a checkout host never goes there before its real object
has been read.** Inline `script` text, which can navigate without a link, is
held to reviewed hashes and enforced by a Content-Security-Policy — see "Every
inline script is reviewed" below. Not covered: CSS, which cannot navigate.

The review of that first version (same day, three lenses, findings re-run by
second reviewers) found the guard both too loose and too strict. Too loose,
each reproduced with `verify` green: a line break, backslash or `./` after
`https://notgabriel.gumroad.com/` still resolved to a verified slug while the
text price checks never saw the card — so a link off the site must now be
written exactly as the URL parser writes it back (`url.href`); a GET form or an
`<img ismap>` appended a query to a verified NCP link at click time; `onclick`
navigated and `attributionsrc` fetched anywhere; GitHub Sponsors is a checkout
for any account on `github.com`; a page opening with front matter goes through
Jekyll's Liquid on GitHub Pages, which assembled an unverified NCP link from
pieces `verify` read as a relative path; `assets/social-preview.html` is served
but was never scanned; and the PayPal price check read only the first card per
id, only on `index.html` (pre-existing). Forms, `formaction`, `ismap` and event
handlers are now refused, attributes are an allowlist (`OTHER_ATTRIBUTES`, plus
`data-*`/`aria-*`), `github.com` is held to `/notgabriels-sys/`, a reviewed host
on a payment domain must have a path rule, every served `.html` is scanned and
payment links may sit only on the root pages the price checks read, and every
PayPal card on every page is priced and counted. Too strict: every
`meta http-equiv` (now only `refresh`), `tel:`/`sms:`, inline `data:image`,
`base target`, and `srcset` split on every comma (now parsed as the HTML
spec does). `mailto:` stays exempt on purpose: it cannot take money, and
allowlisting the address would copy a contact email into another tracked file.

**(reviewed 2026-10-19, on Gabriel's decision) `agensi.io`, one page.** Main's
#58 linked the paid Claude Code Theme Setup Assistant on Agensi from the
storefront's tools row and `README.md`, and the link guard refused the host.
Reviewing a checkout host is a payment-surface decision, so it waited for
Gabriel, who approved it the same day, held to that one page. Read back first,
through Firecrawl, with a live fetch: HTTP 200 (`agensi.io` redirects to
`www.agensi.io`), the skill's own listing, $12, sold through Agensi's checkout
(Stripe behind it), with Agensi's money-back terms. The storefront card says
"Paid, on Agensi" and states no price, so `verify` checks none; the price is
set on Agensi and changes there. `agensi.io` is now a payment domain with a
path rule in `paymentPath`: only `/skills/claude-code-theme-setup-assistant`,
with no query or fragment, on the root pages and `README.md`, and never from
another note. `www.agensi.io` is not reviewed, so a link written with `www.`
fails, and listing it as an ordinary host fails too, because a reviewed host
on a payment domain needs its own path rule. The creator's name on that page
is not copied here. Linking another Agensi skill is a new review.
Mutation-tested (rule 5): any path allowed, a query allowed, a fragment
allowed and `agensi.io` dropped from the payment domains each turn exactly
their own tests red; dropping the path rule turns the real tree red, since
the storefront's link is then to an unreviewed host.

**Every note is a page on the shop's domain, and is now checked as one.** The
repo has no `.nojekyll`, so GitHub Pages renders every Markdown file outside a
`.` or `_` directory into an HTML page. Read back 2026-10-18 through the
Firecrawl connector (this session's proxy cannot reach the domain):
`https://gabs-utilities.com/CLAUDE.html` returns 200, generated by Jekyll
3.10.0 — these notes, served from `main`. Built locally with Jekyll 3.10.0,
kramdown's GFM parser and the Pages default plugins, the site is 52 pages, 47
of them notes (every product note, every packaged `SKILL.md`, the plugin
READMEs as directory index pages). Reproduced with `verify` green: a Markdown
link to an unverified NCP id, an autolink to another checkout and a raw-HTML
PayPal.me link in `PROMOTION_QUEUE.md` all rendered as live links.

`verify` cannot run Jekyll, so it reads each served note conservatively: every
destination a note could render — inline links and images, reference
definitions anywhere on a line, autolinks in angle brackets, URL attributes in raw
HTML or a kramdown `{: ...}` list — found anywhere in the text, code included,
must stay on the site or reach a reviewed host, and never a payment host
(`README.md` excepted: its prices are read line by line). Reading code as links
only adds candidates; it cannot hide one. The cost is that a note cannot quote
an angle-bracket autolink or a link destination even in code; describe it in
words, as this paragraph does. A served note may carry front matter
only as `name`, `title` and `description` (a `permalink` of `/index.html` would replace
the storefront), no Liquid delimiters, and the root no `_` entry
(`_config.yml`, `_layouts`, `_includes`) that would reshape the build.
Differentially tested against kramdown (rule 13): 18,900 generated notes — 23
link forms plus 21 spellings in which the URL never appears literally, in 20
contexts nested two deep — gave 0 misses; the same run against a check missing
only its autolink pattern gave 783, and one missing its reference-definition
pattern gave misses at the first depth. The harness lives in the scratchpad.

**Still Gabriel's call:** a `.nojekyll` would make Pages serve exactly the files
`verify` reads, and drop the default theme's scripts (anchor-js from cdnjs) from
every note page, but every rendered note would disappear from the live site.

**(added 2026-10-18) Every served file is one `verify` reads, or one no browser
opens as a page.** The link check read `.html` and the note check `.md`, and
Pages serves every file outside a `.` or `_` directory — and, through Jekyll's
default include, any file or directory whose name starts `.htaccess`, at any
depth, since that include is matched as a prefix. Reproduced with
`verify` green, each linking a checkout: `pay.htm`, `pay.xhtml` and `pay.HTML`;
`pay.markdown`, which Jekyll renders to `pay.html` (so do `.mkd`, `.mkdn`,
`.mkdown` and `.MD` — the match ignores case); `favicon.svg` holding a link or a
script; `sitemap.xml` turned into an HTML page by an XSLT processing
instruction; an XHTML page saved as `.xml`; and an SVG opening with front
matter, into which Liquid wrote a link — Jekyll runs Liquid on any file with
front matter, whatever its type. Read back through Firecrawl: Pages serves
`favicon.svg` as `image/svg+xml`, which a browser renders as a document with
live links and scripts; `install.sh` as `application/x-sh`,
`scripts/verify.mjs` as `text/javascript`, and `LICENSE` and the `.swift` file
as `application/octet-stream` (`CNAME` is not served).

So served types are an allowlist, `SERVED_TYPES`. `.html` and `.md` are read as
pages and notes; `.svg` is held to `SVG_DOCUMENT` and `.xml` to
`SITEMAP_DOCUMENT`, each an element and attribute allowlist; every other type
is one a browser shows as an image or as text, or saves. No served file may open
with front matter (a note is held to its own rule) or be a symlink, and a name
starting `.htaccess` is refused outright. Every served page must open with
`<!doctype html>`: in quirks mode Chromium applies a served `.txt` or `.json` as
a stylesheet. A `.mjs` is shown as text when opened, but a page's inline script
can load it as a module, a worker or a service worker, and a service worker
serves every URL under its script's directory from text `verify` never read —
reproduced: it kept serving every page a fake checkout after the registering
line and the script were both removed. So a served `.mjs` is refused in any
directory at or above a served page; `scripts/` holds none. The SVG and
XML reader does not parse. It refuses whatever lets a browser build markup the
text does not spell — another encoding, a doctype (since 2026-10-19, any but
the two public SVG ones, exactly), CDATA, a processing instruction, a character
reference — and then holds every element
name and every attribute name anywhere in the file to the allowlist, each
captured to a delimiter: Chromium runs a `script` element whose prefix is `ä`,
and a capture by character class reads straight past it. Differentially tested
against Chromium (rule 13): 8,008 generated SVG and sitemap documents — doctype
entities, stylesheets, other encodings, prefixed and non-ASCII names, handlers,
XHTML inside `foreignObject`, each in eight contexts — loaded with Pages'
content type; a miss is a document `verify` accepts while Chromium builds an
element, attribute or processing instruction outside the allowlist, or makes
any request. No check missed 6,293; a capture by character class, 250; this
reader before its `url()` rule, 30, Chromium fetching a paint server from
another file — so a `url()` may name only an element in the same file, and no
backslash is allowed, since CSS spells `url(` with escapes too. With that
rule, over 8,768 documents that add five more `url()` spellings (`URL(`, an
escape, quotes, a space, `stroke`), it missed none; the reader before the rule
missed 180 there, every one a fetch. The root element must also carry its
namespace, without which an SVG silently stops drawing: over 11,796 documents
that add roots with no namespace, or with it declared only below the root, the
final reader missed none and the one before that rule 208, every one a document
with no namespace. Mutation-tested (rule 5), through the review's fixes below:
of 42 branches, each gutted alone, 38 turn exactly their own tests red and four
turn the real tree red, so none is dead. A new type, element or
attribute is a deliberate edit, and never one that links, loads or runs script.

The review of 1cd3984 (five lenses; the first run lost five of its eight agents
to a session limit and was resumed) found the `.htaccess` names (high:
`.htaccess.svg` ran its script and `.htaccess.md` rendered a live link with
`verify` green), the service worker (medium), quirks-mode pages and documents
with no namespace (low). Each is fixed above. The gap it left, inline `script`
text, is closed below.

Its records lens, re-run after a session limit lifted, found more. The
script-tag check read only the root pages, so a page in a subdirectory loaded a
served script by `src` and Chromium followed it to a checkout; a script on any
served page may now carry no attribute but `type="application/ld+json"`. And a
note's raw HTML reaches the page as kramdown found it: a `script` element, an
`onerror` handler, a `meta` refresh, an iframe `srcdoc` and an `onclick` set by
a kramdown attribute list each sent Chromium from a rendered note to another
host, with `verify` green. A note may now hold none of the elements that run
script, refresh, rebase links, embed a document or carry foreign content, and no
attribute whose name starts `on`. That is a list, not an allowlist, on purpose:
HTML builds a name it does not know as an inert element, and notes write
placeholders such as `<id>` and `<name>`. It is read anywhere, code included, so
a note names those elements in words — this file writes `script`, not the tag —
and prose like a word starting "on" followed by an equals sign reads as a
handler. The lens also found five branches no test pinned — a capital `URL(`,
the exact XML declaration, the attribute-name capture, `<loc>` normalisation
and the `_` half of the segment rule — each now pinned by a test.

Its false-refusals lens found the check too strict in ways that would get it
weakened. It read files git ignores as served, so running a product's own
generator (which writes the ignored `products/*/pack/`) turned local `verify` and
the suite red; the served set is now what git would commit — tracked files and
untracked ones it does not ignore — read with `git ls-files`, falling back to a
walk where there is no repository, and the test fixtures copy only that set.
`.jpg`, `.jpeg`, `.webp`, `.gif`, `.ico` and `.mp3` are now inert like `.png`,
with an image's extension allowed in capitals (a page's or a note's still not);
the XML declaration may use either quote and `utf-8` in any case; a note may
set `title`, which the Pages SEO tag sanitises as it does `description`; and a
`.css` file gets its own refusal, because a page may load a stylesheet and CSS
makes requests — the generic message had asked only how a browser opens a file,
which would have let a contributor add `.css` as inert. The SVG allowlist,
which refused ordinary design-tool exports, was widened next; see below.

**(added 2026-10-19) A name from disk reaches a URL as text.** The scripts
turned file names into URLs with a bare `new URL(name, base)`, where a `#` or
`?` ends the path and a `%2e%2e` segment means `..`. Reproduced, each in a
scratch copy: a root page named `index.html#2.html`, `%69ndex.html` or
`index.html?.html` carried a EUR1 card for a EUR8 product with `verify` green,
because the price checks read `index.html` while the link check read the page;
the skills sync, given a stale packaged directory named `%2e%2e`, deleted the
whole `berlin-studio-skills` plugin directory; and a theme file with a `#` in
its name was indexed and contrast-checked as another file, or crashed the
theme sync. Every script now builds such a URL through a helper that encodes
each segment (`fileUrl` and `urlPath` in `verify.mjs`, a local `fileUrl` in the
others), and a name from disk never goes to `new URL` raw. Eight tests cover
it. Mutation-tested: `verify.mjs`'s helper made the identity, its Gumroad price
read reverted alone, and each of the seven sites in the other scripts reverted
alone each turn exactly their own tests red.

**(added 2026-10-19) SVG artwork from design tools.** The allowlist refused the
clip paths, filters, comments, public doctype and layer names that Figma,
Illustrator, Inkscape and potrace write, so an ordinary export failed and the
next contributor would have loosened it by hand. It now holds what those tools
export: clip paths, masks, patterns, every filter primitive but `feImage`
(which fetches), comments (the reader is stateless, so a comment hides nothing
from it), the public SVG 1.1 and 1.0 doctypes written exactly and with no
internal subset (one can declare entities and default an `onload`),
`xmlns:xlink` and `xmlns:svg` pinned to their namespaces, and presentation
attributes that take no URL, or only a `url()` naming the same file. Still
refused, with a remedy line naming each tool's setting: `style` elements and
attributes (CSS fetches through `@import` and `image-set()` without writing
`url(`), `use`, `image`, `feImage`, `foreignObject`, and editor namespaces such
as Inkscape's. Every refusal in a file is now listed in one run. Of 16 sample
exports — eight real files from public repositories, eight written to each
tool's documented format — 8 pass, up from 2, and each of the other eight needs
one of those refusals.

Checked against Chromium as rule 13 asks, the widened reader over 17,796
generated SVG and sitemap documents loaded with Pages' content types: 0 that
`verify` accepts while Chromium builds an element outside the allowlist or
makes a request, and 2,402 that `verify` refuses though Chromium does nothing
(an allowlist's cost). The harness was proven on a weakened reader first: one
that also let `href` and `feImage` through missed 36, every one a fetch.
Weakening only `feImage`, or only the doctype's no-internal-subset ending,
accepted nothing more, because an `feImage` fetches only through `href` and an
internal subset declares with `<!`, both refused elsewhere; the mutation run
agrees (nine branches, eight failing their own tests, the internal-subset
ending failing none). Those two stay as second walls and are recorded as
shadowed, not as pinned.

**(added 2026-10-19) Every inline script is reviewed, and the browser enforces
it.** The link check reads URLs, and a script navigates without one: a
`location.assign(...)` line added to the gallery script, or a second bare
`script` element, passed `verify` and sent Chromium to another host. Every
script a served page runs is now held to `reviewedInlineScripts` in
`scripts/verify.mjs` by the SHA-256 of its text, hashed as a browser hashes it,
and every served `.html` page carries exactly one Content-Security-Policy meta, right
after `meta charset`, naming exactly those hashes (`script-src 'none'` on a
page that runs none) and turning off workers, plugins, frames, `base` and form
posts. A changed or added script is then a deliberate edit to that table, like
a new host in `reviewedLinkHosts`, and the browser itself refuses a script
nobody reviewed. Reproduced with the policy in place and the reviewed hash
unchanged, as if `verify` had been skipped: Chromium refused the edited gallery
script (the gallery stopped rendering, so the edit shows at once) and refused
the added one, and neither navigated. Under the policy every page loads with no
violation, and the gallery behaves exactly as without it — search, filters,
both copy buttons and deep links, compared in Chromium. This reviews a script;
it does not read what it does. Editing the gallery code or a theme row in
`index.html` changes the hash, and `verify` prints the new one. Rendered notes
carry no policy, and a note cannot add one. Read back 2026-10-19 through
Firecrawl, Pages wraps each note in its default theme's layout, a head the
repo does not write, and puts the note's text in the body, where a policy meta
is ignored. That layout also runs the theme's own scripts — anchor-js from
cdnjs, pinned by an `integrity` hash, and one inline line — which `verify`
does not read; the note scan's refusal of scripts, handlers and other active
elements keeps a note's own text from adding any.

A review of that check (four lenses, every finding re-run by a second agent;
its bypass lens was stopped by a safety classifier before testing anything, so
its silence means nothing) found the browser layer could be
switched off with `verify` green: a stray `>` after `meta charset`, or a
no-break or zero-width space before the policy, ends the head in a browser, a
policy outside the head is ignored, and Chromium then ran an unreviewed script.
Nothing but whitespace may now come between `meta charset` and the policy, and
each tag's position is read rather than assumed. Its messages now say which of
the three rules failed — how many policies, what comes before the policy (an
invisible character spelled as an escape), or what it must read — and a changed
script's message says to replace the old hash and prints the policy to paste,
so one edit reaches green where following the old wording took three runs.

The same review's hashing lens ran 14,942 generated scripts and pages through
`verify` and Chromium, comparing each script's hash and each policy violation;
its harness was proven first by removing the CRLF step from a copy of `verify`,
which then missed 6 of 10 proof cases. It found three more holes, each
reproduced with `verify` green. A NUL in a script reaches it as U+FFFD, so
Chromium refused a gallery whose hash `verify` had accepted. An end tag such as
`</html>` before the policy, or a second `http-equiv` in front of it (a browser
reads the first), left Chromium with no policy, and a script hidden from
`htmlTags` inside a `noscript` ran and navigated to another host; a lone `<br>`
there, with no text at all, does the same. And the rules that keep `htmlTags`
reading what a browser builds (no inline `svg` or `math`, no comment opener
inside a script, no `noscript` or other inert container, two script spellings,
no microdata) held only on the root pages, while `assets/social-preview.html`
is served too: an entity in an SVG script, decoded before Chromium hashed it,
and a comment opener in a JSON-LD block, which ran on into a script `htmlTags`
never saw, both passed there. Now a NUL anywhere in a served page fails, an
attribute written twice on any tag fails, any end tag or body tag before the
policy fails, and those parser rules hold on every served page. The `src`
check b1efa3b added for pages in subdirectories became unreachable behind the
script-spelling rule, so the two are now one rule whose message gives both
reasons.

How strong the check now is. The hashing lens's generated differential,
re-run on 3a9b631 with the same harness (proven again first: a copy of `verify`
without its CRLF step missed 6 of 10 proof cases, the real one none), gives 0
misses in 14,942 cases, where 17e1cb7 gave 565 — every one a NUL, an SVG
script or a comment opener. It measures misses only: a case on which `verify`
and Chromium agree never runs `verify`, so false refusals are not counted.
Mutation runs over the check's 22 branches (seven in 17e1cb7, six in 9e8a147,
six in 27fd215, three pinned in 3a9b631) each turn their own tests red; the one
that failed none in 9e8a147's run, a tag before the policy with no text around
it, is now caught by the end-tag and body-tag tests. The review's first lens,
meant to search for pages `verify` accepts while Chromium runs something else,
was stopped by a safety classifier before it tested anything three times —
once in the review and twice re-worded as a coverage review. It has never run,
it is recorded here as unrun, and it is not retried in other words; the
generated differential above is the evidence instead, and it is narrower: it
varies a script's text and its context, not the whole head.

**(merged 2026-10-19) Main's #59, a page per theme.** #59 renders a page
for each of the 62 themes, and an index, under `theme/` with
`scripts/build-theme-pages.mjs`, and compares every page and `sitemap.xml`
with what the builder renders. Merged here, the 63 pages meet every guard a
served page meets, and four things were adapted so they pass for the right
reason. Each page runs one inline script, a copy button that writes a
button's `data-copy` text to the clipboard and loads or navigates nowhere: the
builder now writes each page's Content-Security-Policy from that script's
hash, and `verify` reviews the script once for every page the builder renders
(`reviewedThemePageScripts`). The builder writes the policy but not the
review, so a changed copy script is still a deliberate edit — a test changes
it in the builder, rebuilds, and sees `verify` refuse; with `verify` trusting
the builder's own hash instead, that test fails. The builder read every root
`.json` as a theme and threw on `themes.json`; it now uses `isThemeFile`.
Main's check of Gumroad links on the pages captured the slug with the
character class this file forbids; it now captures to a delimiter. And the
order: main's checks run before the guards every page meets, so a page the
builder does not render is reported as that. Moving them first also moved the
byte comparison of `sitemap.xml` ahead of the sitemap's own document checks,
and CI failed eight sitemap tests on it — every malformed sitemap read as
merely stale. `sitemap.xml` is now compared last. One control could no longer
hold as written, since the builder owns every byte of the sitemap: it now
changes only the declaration and expects "stale", which is reached only once
the document checks pass, and a reader requiring double quotes fails it.

**(added 2026-10-20) The cards print the terminal background.** The footer, the
install guide (its text and its HowTo structured data) and `README.md` told
readers to set the terminal to the surface hex shown in the gallery, and no
card printed it: each showed only its accent. Each card now ends with "Terminal
background #RRGGBB", linked to the theme's page, and the footer links the
theme-page index. The hex is the row's sixth value, the one the contrast checks
measure against, set in the theme's own inactive and text colours. A storefront
contract holds the template to it, and the gallery script's hash and the policy
moved with it. Checked in Chromium at 390 and 1280 px on all 62 cards: each
prints its row's hex (for Vol. 2, equal to `previews.json`), each link answers
200, nothing scrolls sideways, no policy violation; search, filters, copy and
deep links behave as before. Gutting the
contract line turns exactly its own test red (rule 5).

**Sixteen failure cases were proven** by breaking `index.html`, `README.md` and
`impressum.html` in turn and confirming the build goes red, then restoring:
grid price, developer-picks price, `aria-label` number, `aria-label` currency,
free zip gaining a price, bundle price, PayPal price, a €1,200 lookalike NCP id
added beside the real one, a lookalike Gumroad slug, the same slug hidden behind
a UTM query, a lookalike host, a card deleted, a bare URL outside an anchor, and
an unverified slug in the README and in another public page.

**Three assertions live in `verify.mjs` and they are not equally strong. Do not
promote one by reading it as another.**

| Table | Means | Does not mean |
|---|---|---|
| `verifiedPayPalLinks` | a human opened `paypal.com/ncp/links/<ID>` and read the price off PayPal's own object | — |
| `verifiedGumroadSlugs` | a human loaded the product page and it is a published product | anything about its price, currency or contents |
| `recordedGumroadPrices` | this is what `index.html` said on 2026-08-24 | anything at all about Gumroad |

Claude has read back no Gumroad product's **price** in this repo, and only one
product has any recorded read-back at all: `products/industrial-tension-fx/PUBLISHING.md`
records that product's €15 EUR price as checked after a provider reload on
2026-08-20 (clean checkout data `price_cents: 1500`, currency `eur`, and a
zero-charge creator test purchase). That is a record left by whoever published
the product — not a check `verify` can repeat — and it promotes nothing in the
tables above. The other fourteen have no record at all. (Corrected 2026-10-18:
this paragraph used to say no price had ever been read back, which that file has
contradicted since it arrived in `eabb06c`.) A price that was already wrong on the day it was recorded is copied
faithfully into the table and the build stays green forever. Adding or changing
a row silences the guard; it verifies nothing.

What the Gumroad guards do buy is real but bounded: a slug cannot silently
change, appear, disappear or point at another host, and no stated price can be
edited — in any of the three places the page states it — without the edit being
deliberate. That catches a stray keystroke or a bad merge. It is not
verification, and it must never be described as verification. The priced half
stays unbuilt until someone reads every product in a signed-in browser
(15 as of 2026-10-18 — the count in `verify`'s summary line is the live one).

`verify` also guards the plugin marketplace: it asserts all three plugins are
registered with the right source paths, that every field of each plugin's
`plugin.json` matches its marketplace entry, that each description's opening
count matches what ships, that every skill in `.claude/skills/`
is byte-identical to its packaged copy under
`plugins/berlin-studio-skills/skills/`, and that each skill has YAML
frontmatter with a name and description. Drift means an installer silently gets
a different skill than a contributor reads, so it fails the build — the same
contract the themes already had.

**(added 2026-10-19) The skills plugin works outside this repo, and its README
lists exactly what ships.** The tools-round audit found the shipped skills
written for one person in one repo: placeholders naming Gabriel and asking an
installer to edit the skill, pronouns for him, the shop's tax-inclusive rate
card as evidence in `freelance-admin-de`, generic triggers ("deadlines",
"invoice") that would fire for anyone anywhere, and 27 mentions of skills the
plugin does not ship, written as if they were installed. Now each skill speaks
of "the user" and asks instead of keeping a placeholder; `freelance-admin-de`'s
triggers are qualified to Germany; the unshipped names are gone from the
descriptions and from one checklist line, and the 18 other mentions are marked
"a separate skill, not part of this plugin", with a note that such a skill is
not published with this one and that the question is then outside the plugin.
`freelance-admin-de` says the whole skill was written from memory and not read
against the statutes, and `german-correspondence` says the same of its
Widerspruch paragraph. `storefront-exposure`, which is about this one site,
moved to `docs/STOREFRONT_EXPOSURE.md` with its stale lines fixed (the sitemap
is generated by the theme-page builder, the `theme/` pages exist, the test
command is `node --test`). The plugin ships five skills, and the manifests,
both READMEs and the plugin README's install line (now `@notgabriels-themes`)
say so.

Moving the skill out showed a hole: with its row left in the plugin README's
table, `verify` stayed green. A first guard, a line regex, was reviewed the
same day (four lenses, every finding re-run by a second agent; 16 of 22 held)
and was too narrow: ten ordinary spellings of the stale row passed it, and the
older check that every shipped skill is listed was an `includes()` over the
whole file, so once the new prose named four skills in backticks their rows
could be deleted with `verify` green. The plugin README's skill table is now
read as GitHub renders it — the first table whose header's first cell reads
"Skill", outside fenced code, its rows up to the first blank line — and must
list each shipped skill exactly once and nothing else, with a row's first cell
read as a reader sees it (links, emphasis, code marks, HTML and entities
resolved). A line straight after the table that renderers disagree on is
refused: cmark-gfm reads a pipe-less line as a row where pandoc ends the table,
and a quote or HTML line the other way round. Differentially tested (rule 13)
against cmark-gfm, GitHub's own renderer, and pandoc: 1,069 README variants,
none accepted while the rendered table listed anything but the shipped five;
the regex guard with the `includes()` check accepted 852 of them against
cmark-gfm and 859 against pandoc. The cost is 14 and 6 refusals, every one such
a disputed line. Mutation-tested (rule 5): of 17 branches of the reader and its
checks, each gutted alone with the suite re-run, 13 turned exactly their own
tests red and dropping the code and emphasis marks turned the real tree red;
the other three — the header and delimiter cell counts, an escaped pipe kept in
its cell, a backtick fence whose info string holds a backtick — failed nothing
at first and are now pinned by three tests, each confirmed against cmark-gfm,
that turn exactly themselves red when the branch is gutted again. Not covered:
a second table, or a list elsewhere in the README, naming a skill as if it
shipped.

**(added 2026-10-18) A plugin ships exactly its expected files and keys.**
`claude plugin install` copies a plugin's whole directory, and Claude Code loads
any hooks, commands, skills, agents or MCP servers it finds there, or that a
`plugin.json` or a marketplace entry declares inline. Before this guard a stray
SessionStart hook in a theme pack, or an `mcpServers` key in a marketplace entry
alone, shipped to installers with `verify` green — reproduced against the real
installer, which ran the hook. Now every `plugin.json` key and every
marketplace-entry key must be metadata, the theme plugins' `experimental` must
be exactly `{"themes": "./themes/"}`, and every file under `plugins/` must be in
a set built from the root themes, the Vol. 2 theme files and `.claude/skills`;
symlinks and unregistered plugin directories fail. Both are allowlists on
purpose: a list of forbidden component paths goes stale the day Claude Code adds
one. A new packaged file (a CHANGELOG, a second preview image) needs a
deliberate edit to `expectedPackageFiles`, and an untracked `.DS_Store` inside
`plugins/` fails a local run until it is deleted. Every expected file must also
be present, so a deleted LICENSE or preview fails too.

How strong that is. For Vol. 2 the `themes/` set is read from the packaged
directory itself, so it is only as strong as the theme validation,
`previews.json`, the gallery parity and the count checks applied to it. And the
walk reads the checkout, which is not what an installer fetches: CI's checkout
leaves a git submodule as an empty directory, while Claude Code's marketplace
clone runs `git submodule update --init` for any submodule under a plugin path.
The review of this guard reproduced that on 2026-10-18, offline against a local
git server: a submodule at `plugins/50-dark-themes/hooks` kept `verify` green on
a plain clone, and the installed plugin reported `Hooks (1) SessionStart`. So
`verify` fails on a `.gitmodules` file and on any empty directory under
`plugins/` — git checks out an empty directory only as a submodule placeholder.
The skills sync dereferences symlinks for the same reason the walk rejects them.

**(added 2026-10-20) A changed package needs a new version.** Claude Code
installs a plugin into a cache directory named for its version, and `claude
plugin update` compares versions only. Read back 2026-10-19 against Claude Code
2.1.303, installing from a copy of this marketplace served locally by git's own
HTTP backend: a skill changed under an unchanged version reached the
marketplace clone and never the installed copy ("already at the latest version
(1.0.0)"), and the same change under a bumped version installed at once. So
`verify` holds each package's payload — `themes/` for the two theme packs,
`skills/` for `berlin-studio-skills`, the directories Claude Code loads — to a
SHA-256 over its sorted paths and line-ending-normalised bytes, recorded in
`releasedPackages` beside the version that ships it, and fails a changed
payload until the version moves. The message names the new digest and, for a
theme pack, the release links that must follow; following its two messages
reaches green, and a test does exactly that. Nothing had slipped through: each
theme pack's payload last changed in the commit that set its version (`e4bebf2`
for 50-dark-themes 1.0.1, `4365c25` for Vol. 2 1.0.0), and the skills plugin
has never been on `main`, so 1.0.0 is what it first ships and its digest is
recorded under 1.0.0 without a bump. (Corrected the same day: Claude had told
Gabriel that people who installed the skills plugin had missed fixes since
August. Nobody has installed it.) The three digests were computed twice, by
`verify` and by a separate Python reading, and agree (rule 12). The message
allows one exception it cannot check: a version that was never released may
take a new digest unbumped, which is a fact about the default branch. READMEs
and previews sit outside the payload and need no release; a whitespace-only
change inside it does, which is the cost. Mutation-tested (rule 5), nine
branches each gutted alone: the names check, the CRLF step and each theme
pack's follow-up text turn exactly their own tests red, the version check only
the test that follows the messages to green, and the digest check its three
tests and the two skills-sync tests that expect its message; hashing without
the paths, or reading the version by position, turns the real tree red; and
sorting the paths fails nothing, because readdir returned names sorted on the
file system it ran on, so that branch is shadowed, not pinned. Not covered:
`plugin.json` metadata (a new description reaches no installed copy either, but
loads nothing), and whether the GitHub release a bumped theme pack's links name
exists.

**(added 2026-10-24) What `/plugin` shows an installer.** Each plugin's
homepage read the `github.io` project address; the two theme packs now name
their gallery on the domain `CNAME` serves (Vol. 2 at `#vol2`), and `verify`
fails a theme pack whose homepage is anywhere else. The skills plugin has no
gallery and names its README on GitHub. The theme packs gained the factual
keywords `color-theme`, `contrast`, `wcag` and `accessibility` (and the tags
`contrast` and `wcag`); none of this is in a payload, so no version moves.
Claude Code 2.1.310's `claude plugin validate --profile directory` warned
that no plugin had an icon, and that the official plugin directory keeps the
first icon it is given: each plugin now ships `.claude-plugin/icon.png`, a
1024 px square drawn from its own palettes (the 50 accents and the 12 as hue
rings, a meter in VU Meter's colours for the skills), and `verify` holds each
to a 1024 px PNG under 2 MB. All three plugins and the marketplace then pass
`claude plugin validate --strict`, the plugins with `--profile directory`
too; the directory's own safety scan and policy review are not run by it.
Mutation-tested (rule 5): the homepage rule, the icon's dimensions and its
size limit, each gutted alone, turn exactly their own tests red. Not covered:
whether the directory accepts these icons, which is read only on submission.

**(added 2026-10-24) What CI runs, said as it runs.** README, CONTRIBUTING,
this file and a test comment said `verify` runs "on every push"; the workflow
runs on pull requests and on pushes to `main`, and now on demand
(`workflow_dispatch`). CONTRIBUTING's "Test locally" block also lacked
`build-theme-index` and main's `build-readme-theme-links`: followed after a
colour change in a scratch copy (theme file and gallery row edited), the full
block now ends at exactly one failure, the reviewed-hash message the change
calls for. And `previews.json` was read only by theme name, so a row for a
theme the pack no longer ships passed; `verify` now names it. Reproduced green
first (rule 1), and gutting the check turns exactly its test red (rule 5).

**Generated surfaces are checked against their sources, not their generator.**
`themes.json` and the JSON-LD ItemList in `index.html` are both written by
`scripts/build-theme-index.mjs`. `verify` checks each twice: byte for byte
against a fresh build (which catches a hand edit), and by content against the
theme files, `CNAME` and the plugin manifest (which catches a generator bug).

The ItemList check's first version (2f70fbd) was reviewed the day it landed and
leaked in seven ways a crawler could see — a second list behind any other
script-tag spelling, a list nested under `hasPart` or typed as an IRI, extra
keys from the generator, microdata, a list on another page, the block hidden in
a moved `</style>` or a `<template>`, and a canonical link tied to nothing.
(This paragraph claimed "exactly one ItemList on the page" before that was
true.) It is now an allowlist across every public page: one script-tag
spelling, no microdata or inert containers, exactly one ItemList type in the
parsed JSON-LD and in the raw text (one catches `\u` escapes, the other
duplicate keys), exact keys on the list and its items, nothing left open
around the block, and the canonical link equal to the `CNAME` domain. A second
legitimate list, for Vol. 2 say, is a deliberate change to that check.

That allowlist was re-attacked the same day and leaked seven more ways, each a
second list a conformant reader saw (jsonld.js, Chromium's DOM, pyRdfa3) with
`verify` green: a JSON-LD context that builds the type from halves the text
never spells (`@vocab` ending in `Item` plus `"@type": "List"`, or a prefix
term), microdata after `/` attribute separators or after a quoted `>`, RDFa
through `rel`/`property`/`resource`, and a `<style>` strip fooled by two
attribute values; `&#76;` carried each past the raw count, which never decodes
character references. So tags are now read with the HTML tokenizer's own rules
(`htmlTags` in `verify.mjs`), microdata and RDFa attributes are refused
outright (`property` only as Open Graph on `meta`, `rel` only as plain link
types), inline `svg`/`math` elements are refused because a browser lifts tags out of
them that a raw-text reader skips, and every JSON-LD block must use exactly
`"https://schema.org"` as its only `@context` and write no key twice. A regex
over HTML is the defect class here.

**Corrected the same day:** the paragraph above first said the safe rule was
"where the reader and a browser can disagree, read more of the page as markup,
never less". That is wrong, and the review of 896c4b1 proved it: the reader
took `<title>` text as markup, so `<title>x<!--</title>` opened a comment that
hid a real microdata list after it (a regression; the regex had caught it).
Reading text as markup can hide markup. The reader now reads as a browser
does, including which elements hold text, and refuses what it cannot model:
inline `svg`/`math`, and `<!--` inside a `script`, where a browser's
escaped states run the script past its `</script>` and swallowed the theme
list (pre-existing). It is checked differentially against Chromium; see rule
13 above. That review's bypass lens was stopped by a safety classifier before
it tested anything, so it never ran; the exhaustive differential of rule 13 is
the evidence in its place.

**(measured 2026-10-19) The raw scans count a mention.** The script-spelling,
script end-tag and inert-element checks read the raw page rather than
`htmlTags`' tags, so a mistake in that reader cannot hide what they refuse;
reading text as markup only adds refusals there, which is the safe direction
the `title` lesson above leaves. The cost, measured on ordinary edits in a
scratch copy: a `noscript`, `iframe` or `template` named in an HTML comment, an
attribute value or a CSS comment, a commented-out script with a `src`, and a
commented-out script end tag with a space were each refused; the same element
written with `&lt;`, and a plain script start tag in a comment, were accepted.
The scans stay as they are. Their messages now give the line and say how to
write a mention: with `&lt;`, or in words; five mutations (no line, an empty
note, and the note dropped from each message) each fail their own tests.

**(checked 2026-10-19) The JSON-LD rules against jsonld.js.** Rule 13 again,
for the reader that counts ItemList types: jsonld.js 8.3.3, offline, with a
static copy of the schema.org context (3,103 terms, read back through
Firecrawl, because this session's proxy refuses schema.org), converted each
block to RDF. 9,200 generated blocks — 23 spellings of the type (compact and
full IRIs over http and https, JSON escapes in the value and in the key, case,
percent-encoding, a relative IRI, a subtype's name, a vocabulary or prefix that
completes the word), 7 ways to state it (`@type`, its `type` alias, an escaped
key, an array, `rdf:type` as a property), 8 placements (`@graph`, nesting,
`@included`, `@reverse`, `@list`, `@set`) and 7 contexts — gave 0 that `verify`
accepts while jsonld.js types a node `schema:ItemList`, and 0 even after
trimming, case-folding or percent-decoding the type. The harness saw misses
first on weakened readers: 32 without the context rule, 264 without the parsed
count, 336 counting only the exact word. Without the raw-text count it saw
none, so that count is a second wall behind the parsed one, recorded as
shadowed. On a 78-block sample the real `verify` agreed with the extracted
reader every time. The cost is 312 refusals of blocks that jsonld.js reads as
no list — a lowercase or uppercase spelling, a subtype's name, an unknown
prefix, a relative IRI — each of which spells the type in text. Not covered:
ItemList's own subtypes (`BreadcrumbList`, `OfferCatalog`, `HowToSection`,
`HowToStep`), which a crawler may read as lists. The harness lives in the
scratchpad.

**(measured 2026-10-19) Every stated count is read where Pages serves it.**
The theme-count scan read the root pages, `llms.txt` and three READMEs, and
the role-aware count was read on the storefront and the share card. Run over
every served page, note and text file (rule 4), the theme scan found 34
counts in seven notes it never read (corrected the same day: this said nine)
— the promotion drafts, a skill that ships to installers, a product's
publishing notes — and `PROMOTION_QUEUE.md`
states the role-aware count in the stat row it asks to be posted. All agreed
with what ships that day, and each could be edited to a wrong number with
`verify` green. So could counts on files it did read, spelled another way: a
count wrapped across two lines of `llms.txt`, a number in Markdown emphasis
or a code span, `&#160;` for the space, a digit before "skills" (the skills
scan read number words only), and any number word past sixty, though a third
pack would put the total past seventy. Both scans now read every served page,
note and text file as a reader sees it — tags, Markdown marks and no-break
spaces dropped, any whitespace between the words — and name the line. The
real tree had one sentence counting something else (a display name used by
both packs, in `CONTRIBUTING.md`), now worded without a number before the
noun, and one example message quoting that day's role-aware count, now
written with placeholders. Measured and left alone: the skills scan reads
only the two READMEs, the only files that state the count that ships; every
other number-before-"skills" on a served file counts another set, in the
dated tooling audit. The products' own counts — 64, 48, 48 and 40 WAV files,
10 templates and 2 examples — agree with the counts each product's
`verify-audio.mjs` expects of a rendered pack, or with its committed zip, and
a product does not grow the way a theme pack does. (Corrected the same day:
this said those files "pin" the counts; `verify-audio.mjs` checks a pack only
when someone runs it, and CI does not.) Mutation-tested (rule 5): of 14 branches, each
gutted alone, 13 turn red exactly the tests written for them — narrowing the
loop back to five files fails both note tests, a constant line fails both
line tests, and dropping the theme check fails every theme-count test — and
one fails none: the value of a compound word past sixty. It is shadowed until
a pack ships seventy or more, because reading such a number rightly or
wrongly both refuse a count no pack ships; it is recorded here, not claimed
as pinned. The review below found a fifteenth branch that run never cut: the
`.html` half of the loop's file filter, which no test pinned.

**(reviewed 2026-10-19) The count scan, re-read by three lenses.** An
independent review of 453ff81 — a coverage lens, a false-refusals lens and a
records lens, each reproducing every finding in its own scratch copy, then a
second agent re-running each one from a fresh copy — reproduced all 93 of its
findings and judged 50 real. It ran 275 experiments; no lens was stopped.
The extension above went too far: reading every served note, the scan refused
ordinary prose ("one of the themes", "one or more themes", "90 percent of
themes", "WCAG 2.1 role-aware", "the $9 palettes product", "sixty two themes"
misread as two) and an audio pack's own "8 evolving low atmospheres" in
`products/`. And it still missed counts a reader sees: meta descriptions,
og: titles and `alt` text, where 17 of the 28 real counts it left unread sat,
on three pages (the scan dropped every tag with its attributes, though
`CONTRIBUTING.md` said meta descriptions were tied to the shipped count); a lone `<` swallowing text
up to the next `>`; a count in quotation-mark entities, a Markdown link, a
hyphen ("12-theme"), a pair ("51 + 12 themes"), before an edition ("13 Vol. 2
themes"), with a "+" ("70+"), with four or five words or a comma between; a
role-aware count with a word between, a "+" or in another page's meta
description; and "seven-skill" or "[Seven](…) skills" in the READMEs. Each of
the 39 held reproductions with an edit was replayed on HEAD first (rule 1):
the 17 gaps passed and the 22 refusals failed.

Now the scan reads the files that state the packs' size to a reader: every
served page, the root text files, every README, the root notes written to be
posted, and the skills that ship — not `CLAUDE.md`, `CONTRIBUTING.md`,
`docs/` or `products/`, which record history or describe the audio packs.
Pages are read with their meta, title, `alt`, `aria-label` and placeholder
text, entities decoded, only a letter, `/`, `!` or `?` after `<` opening a
tag, style text left out and Markdown links read as their text. A count may
have up to five words between it and its noun, with commas, apostrophes and
an edition among them, a "+" after it, or a hyphen joining it ("12-theme",
"seven-skill"); "theme files", "theme packs" and "theme sets" are nouns too;
both numbers of a pair are checked. It is not read where an article, a
partitive or "all"/"every"/"each"/"across"/"per"/"percent" stands between it
and the noun, after a decimal point, ratio, thousands comma, path or
currency sign, or before ".json" and the like. A role-aware count needs
"checks" or "comparisons" after it and may have two words between, and the
storefront's own claim check now names its line. Every stale count in a file
is listed in one run, each README must state the skill count in a form the
scan reads, and "Vol 2", "Volume 2", a wrapped "VS Code" and "Visual Studio
Code" are skipped as the dotted forms were. Replayed against the fix, 15 of
the 17 gaps fail on their own messages — the other two are a comma after the
count and a line in `CONTRIBUTING.md`, now out of scope (the same form in
`README.md` is caught) — and 20 of the 22 refusals pass; the two kept on
purpose, "These two skills pair well" in a README and two other products'
counts in one draft, still fail, now with advice and both counts at once. Not covered, and recorded rather than chased: a count
separated from its noun by a comma ("all 51, plus …"; README's one such line
now names its noun), a count after its noun, more than five words between,
numbers above 999, and comparisons with other products, history and plans
inside the files that are read — on those, reword the sentence.

Mutation-tested (rule 5) from a snapshot of 3b34c52: of 36 branches, each
gutted alone with the full suite re-run, 33 turn red only tests of the scan.
Dropping the stop words also turns the real tree red — `verify` then refuses
the install guide's "one of the installed dark themes" — so the tree pins
that branch as well as its tests. Two turned nothing red. The line that drops
a soft hyphen character was never reached: the one soft-hyphen test wrote
`&shy;`, which the entity decoder already empties. And the "+" in the
storefront's own role-aware check was covered by the prose scan whenever
"checks" follows. Three tests in 7046aed reach them — a soft hyphen as
`&#173;` and as the character in a note, and "900+ role-aware contrast pairs"
on the storefront — and, gutted again, each branch turns exactly its new tests
red while the control passes all 343.

**(reviewed 2026-10-19) The rebuilt scan, re-attacked.** An independent
re-attack of 3b34c52 — four fresh lenses (coverage by spelling, coverage by
surface, false refusals in prose and in structure), 252 experiments, each
finding reproduced in its own scratch copy and re-run from a fresh one by a
second agent told to refute it — reported 49 findings. Its second readers were
capped at 30; all 30 held, and the other 19 were logged rather than dropped.
All 49 were then replayed mechanically on HEAD (rule 1): 45 reproduced as
reported; three failed there for another reason (an edit to the theme-index
generator, which the byte check catches, and two script edits, which the hash
check catches), and one replay wrote a literal no-break space where the finding
meant a JSON escape.

Fixed in 39616d3, each replayed red or green as it should be, and 33 tests,
each failing on the old reader for its own reason. Read more: a link's title,
alt or aria-label inside a phrase no longer cuts the count in two — attribute
text is a second text with the same lines, read on its own, not fenced into
the visible words; a quoted attribute value may hold a raw `>`; a tag opens
only with a name followed by a space, `/` or `>`, so `a<b` in Markdown code no
longer swallows the prose after it; a comment is skipped whole;
`aria-description` and `aria-roledescription` are read; a blockquote's `>`,
a reference-style link and a footnote mark drop out; `&` and accented words
may stand between; a pair may be joined by "and" and its message shows both
numbers; a word other than "contrast" may follow "role-aware"; and every
served note is read (a launch draft under `assets/`, a skill's own reference
files), as are the plugin manifests' descriptions. Refuse less: a
demonstrative, possessive, preposition, month, "another" or a plural pack word
between a number and the noun; "one theme pack"; a step badge ("04"), an
ordinal split by markup, a hex colour; an entity this reader does not know,
which now becomes a mark no count reads across instead of a space; a bare "-"
bullet; "1/" in a thread; "Vols. 1 and 2"; a clause comma before
"role-aware"; and a count "per theme". Measured first (rule 4): the old and
new readers read the same 148 counts on the real tree, none lost or gained.
One change was reverted on that evidence: leaving no space for an inline
element's tag joined the share card's `themes</span><span>894` and lost five
real counts, so every tag leaves a space again and an ordinal is skipped by
its suffix.

Not covered, and recorded rather than chased: text in SVG files,
`install.sh`'s help text, CSS generated content, Markdown link titles, a total
followed by its breakdown in parentheses or preceded by its sum, "or" between
adjectives (kept as a stop word for "one or more themes"), a singular noun used
as a modifier without a hyphen ("a 13 theme expansion", since "one theme" is
ordinary prose), a number hyphenated to another word ("63-piece"), "dozen",
JSON escapes inside JSON-LD, and punctuation other than "&" between the words.
`label` and `value` attributes are left unread on purpose: `OTHER_ATTRIBUTES`
allows them, but an option's or an input's value is rarely what a reader sees.
Kept refused: a part named before its count ("Each theme gets 14 role-aware
checks" — write "14 role-aware checks per theme"); the storefront's own
role-aware check, which reads any noun after "<n> role-aware" and the number
of a label-first stat, because it is the original guard and stays strict;
"atmospheres" in an audio card on the storefront, which calls its themes
atmospheres; and script text, which a script may render.

Mutation-tested (rule 5) from a snapshot of 39616d3: of 37 branches, each
gutted alone with the full suite re-run, 35 turned their own tests red and two
turned nothing red. The prepositions' test sentence also held "your", which
the possessives stop, and the tag-name rule's test had an apostrophe that the
quote-aware reader stopped at on its own. Each now has a sentence only it
reads correctly (08ff646, 132a417), and, gutted again against those, each
turns exactly its new test red.

The Gumroad half now has structural guards, an existence-verified slug list and
a price-drift table — but no check that reads any product's price from Gumroad.
See below.

## Gumroad — the unverified half of the shop

The PayPal links below were each read back from their own detail page before
going on the shop. **Only one Gumroad product's price has a recorded
read-back** (`industrial-tension-fx`, see the CI-tripwire section), and none
was read back by Claude.
The Gumroad products (15 as of 2026-10-18) are the larger half of the shop by count and carry the ordinary
sales income. `main` did confirm on 2026-08-24 that each product page loads a
published product — real, and worth having — but existence is not price, and
apart from that one publishing record nothing in this repo records a price being
read off a Gumroad product.

Two things found by static read on 2026-08-24, both needing Gabriel:

**1. The page mixes currencies.** Twelve products are priced in € (eleven when
this was written; `dark-invoice-business-documents` arrived at €12 the next
day, and the count went stale until 2026-10-19); three are priced in $ —
`cfcvmy` "Dark HTML Templates" at **$19**, `xcxeb` "50 Dark Palettes" at
**$9**, and the bundle `wuhehk` at **$39**. Re-derive the split rather than
trusting it:
`LC_ALL=C.UTF-8 grep -oE '\{ slug: "[^"]+", price: "(€|\$)' scripts/verify.mjs | LC_ALL=C.UTF-8 grep -oE '(€|\$)$' | sort | uniq -c`. Everything else on the
page, including the entire mixing and mastering rate card, is EUR. Either the Gumroad products really are priced in USD, in
which case the page is honest and inconsistent, or the page is misquoting
them, in which case a buyer is shown the wrong number. **Do not resolve this by
editing the page.** Read the products first.

**2. The bundle's contents are unverified.** The card once said "all of the
above"; main's restyle now reads "view bundle · $39" and makes no explicit
contents claim on the page. What the bundle actually contains is still a fact
about a Gumroad product, not about this file, and nobody here has read it.

**Found 2026-10-18, also needing Gabriel: a product file contradicts the shop.**
`products/raw-techno-kicks/PUBLISHING.md` opens with status `RENDERED — QC
INCOMPLETE`, says price and refund approval and every live-store gate remain,
and ends "No public product exists." Yet `raw-techno-kick-architecture` is
linked on `index.html` at €15 and sits in `verifiedGumroadSlugs`. One of the two
is out of date. Which one is a fact about the Gumroad product and Gabriel's
approvals, not about this repo — do not edit either to make them agree.
Re-read 2026-10-19: unchanged.

**Found 2026-10-19 by a read-only inventory of every stated price** (each of
the five product directories read in full, the customer zip included; the
storefront and the price tables; every other served file; each finding then
re-read at its cited lines by two agents told to refute it, and all held).
Where a product has a card, its notes agree with the page: €15 for
`industrial-tension-fx` and €15 for `raw-techno-kick-architecture`. The other
three state prices for products that are not on the shop — the workflow kit's
€12 "launch price" (`zvbti`, withdrawn), and €17 each, marked target or
proposed, for `hypnotic-percussion-grid` and `techno-low-end-architecture`.
Needing Gabriel:

- **Gumroad adds VAT on top of the card price.** The one recorded checkout,
  the creator's own signed-in zero-charge test from Germany
  (`products/industrial-tension-fx/PUBLISHING.md`), showed a €15 subtotal,
  €2.85 VAT and a €17.85 total, against "€15" on the card. The PayPal cards
  are tax-inclusive, and the "say nothing" decision of 2026-08-18 was made
  for them; nothing records whether it was meant to cover the Gumroad cards,
  where, in that one test, the card's number was not the cart's total.
- **Settled 2026-10-19 by main's #61, which Gabriel merged: the install
  guide's structured data offered the withdrawn free zip.** Its FAQ answer
  sent readers to the Gumroad archive at the free price after main's
  `6422979` had withdrawn that route from `index.html`, `README.md` and
  `PROMOTION_QUEUE.md`, in structured data the reader never saw. #61 points
  the answer, and two new visible links on the page, at the GitHub release
  zip, and `verify` now fails if the old wording returns or if the answer and
  the page stop naming the same zip. Merged here, one of its tests re-spelled
  the JSON-LD tag with extra attributes, which this branch's one-spelling rule
  refuses; the test keeps its other half, a single Question object.
- **The workflow kit's publishing notes are stale or unsupported.** Its
  `PUBLISHING.md` says, in the past tense, that the `zvbti` URL was added to
  the gallery and the README (true when written; it has been removed from
  both), and calls the URL "Verified" on an HTTP 200 while the same lines
  record `is_published: false`.
- **Two `industrial-tension-fx` notes disagree.** `LISTING.md` says the
  delivered-file checksum is pending a test purchase; `PUBLISHING.md` records
  the completed test purchase and a matching SHA-256.
- **Draft copy prices the catalog as free.** `DIRECTORY_SUBMISSION_PACK.md`'s
  DevHunt block gives "Pricing: Free" for the whole Gabs Utilities catalog,
  whose description, in the same file, lists the paid packs.
- `products/hypnotic-percussion-grid/BRIEF.md` calls "the two published
  packs" published without naming them; by their content they are the kicks
  and the FX packs, and the kicks' own notes say it is not published.

Fixed here, because they are claims about this repo: the storefront-exposure
skill (now `docs/STOREFRONT_EXPOSURE.md`) said no Gumroad price had ever been read back (the record above
contradicts it, and the skill then shipped to installers), and the currency count
in point 1. **No guard was added.** A check tying note prices to the page
would compare three pieces of unverified text, covers two of fifteen
products (only two have a directory), would pass the one real contradiction
found (the kicks: matching prices, contradictory status), and would refuse
proposals, VAT lines, cents fields and dated records. A status check would
fail at once on the kicks contradiction, which must not be resolved by
editing either file.

**(measured 2026-10-19) How strongly the files describe the tables.** A
read-only audit — three search modes over every tracked text file (by
keyword, page by page, and every code comment, failure message and test
name), then two refuters per suspect — found 185 sentences that state how
strong a Gumroad or PayPal assertion is: 134 accurate, 41 suspects refuted.
Fixed: `verify`'s own message for a Gumroad link off its product path called
a slug in `verifiedGumroadSlugs` "a verified payment object" and said the
account's other pages sell products "whose prices nobody has read back"
(one is recorded) — each payment host now names what its table actually
asserts, and five mutations of that wording (each host's object swapped,
the Gumroad price caveat dropped, the message ignoring the object) each
turn only the tests for that host red; `CONTRIBUTING.md` listed "the verified shop payment surfaces"
among the checks; `docs/TOOLING_AUDIT.md` said no Gumroad price had been
checked against anything but itself; a test name called a recorded price
"correct"; and in this file "the last two" pointed at the wrong bullets once
the drift bullet was added, and "no verified price for any product" now
names what is missing, a check that reads a price from Gumroad. Left for
Gabriel: the workflow kit's note calling its URL "Verified" (above). **No
lint was added.** Six candidate patterns run over the tree each caught at
most one of the ten flagged lines, and every pattern wide enough to catch
more matched accurate sentences — "verified Gumroad product page" is right
in the existence sense, and `verifiedGumroadSlugs` is a name. The
misstatements are semantic. The table of what each assertion means, and its
labels in `verify.mjs`, are the defence; an audit like this one is how they
are checked.

**Verification route, same discipline as PayPal:** sign in at `gumroad.com`,
open the products list, and read each product's own page — price, currency, and
for the bundle its contents. Only then reconcile `index.html`. Never adjust a
price, currency, or slug on this page from a description, from this file, or
from what looks consistent.

There is no Gumroad MCP connector, and none exists in the registry (nor
Bandcamp, Beatport, DistroKid, GEMA, Ableton or Bitwig). The routes available
are a signed-in browser or Zapier's Gumroad actions. Neither is a substitute
for reading the real product object.

## Mixing & mastering rate card

Verified 2026-08-18 against the live PayPal objects — prices, tier names,
currency and tax treatment all read back from the account, not from
Gabriel's description. (The earlier note that the account held no payment
objects was wrong: it was written while the account could not be read at
all. See "Reading the account" below.)

| Service | Price |
|---|---|
| Mastering | €45 |
| Mixing | €160 |
| Mixing + Mastering | €190 |

Tax-inclusive. No VAT added on top. Currency EUR.

## Accounts

The PayPal business account was verified 2026-08-18 by reading it in a
signed-in browser session (Kontoeinstellungen → Informationen zum
Kontoinhaber): business account, Berlin-registered, currency EUR, and the
sign-in landed on a merchant dashboard with Händler-Tools and a Business
Debit Card.

**The account-holder name and the two email addresses are deliberately
not recorded here — this repository is public.** They are Gabriel's to
keep or share. What matters operationally is only that the *business*
account (not the personal one) holds the payment links below; if a future
session needs the addresses, ask rather than guess, and do not write them
into a tracked file.

## Payment links — live, verified 2026-08-18

Created by Gabriel in the PayPal business account; each one read back
individually from its own detail page at `paypal.com/ncp/links/<ID>`
(not constructed from a URL pattern) before being written into
`index.html`:

| Service | Hosted ID | Price | Link |
|---|---|---|---|
| Mastering | `3SWZ64EXW9C8W` | €45.00 EUR | `paypal.com/ncp/payment/3SWZ64EXW9C8W` |
| Mixing | `6Z93DNS76PCGS` | €160.00 EUR | `paypal.com/ncp/payment/6Z93DNS76PCGS` |
| Mixing + Mastering | `QW8V53WWM2P7E` | €190.00 EUR | `paypal.com/ncp/payment/QW8V53WWM2P7E` |

All three: offer type "a fixed price", currency EUR, maximum quantity 1,
no automatic redirect URL, payment methods PayPal / Pay Later / Apple Pay
/ debit-credit card, and **delivery address collection off** (set
2026-08-18; "Lieferadresse erfassen: Nein" on each). All three match the rate card exactly. They are
live on the shop in a "Mixing & mastering" section, using the existing
`.tool` card styles.

## Open, needs Gabriel

**Tax is switched off on all three links** (Steuern toggle off), so
PayPal adds nothing on top of the stated price — consistent with the
tax-inclusive rate card. PayPal's own note: if your country requires tax
to be included, the "Preis" field must already contain it. It does.
Confirmed buyer-side 2026-08-18 by loading each checkout page: item price
and "Gesamt" are identical on all three (45,00 € / 160,00 € / 190,00 €),
with no VAT line. That is the customer-facing number, not just a merchant
toggle.

**No tax wording on the page — decided 2026-08-18.** Gabriel's call was
"say nothing". The page prints no tax statement at all. If that changes,
and this is Kleinunternehmerregelung under §19 UStG, convention is to say
so explicitly — but nothing goes on the page without his wording.

**Card copy written 2026-08-18** and shipped in `bf14643`. It describes
what each service is, and deliberately states no turnaround time and no
revision count — those are commitments to paying customers and are
Gabriel's to make, not Claude's. Add them when he decides them.

## Reading the account

**Superseded 2026-08-24.** The PayPal MCP connector now loads. The old
tool-schema failure is gone:

    claude.ai PayPal: https://mcp.paypal.com/mcp - ! Connected ·
    tools fetch failed — Invalid regular expression: invalid escaped
    character for Unicode pattern

That regex-manifest bug has been fixed on PayPal's side; the tools load
and calls return data. **This does not make the connector usable for
verifying anything on this shop, and the reason is worse than the old
one.**

Read back 2026-08-24 from the connector, all calls read-only:

- `list_payment_links` → **empty**. Zero links, one page. The three live
  NCP links in the table above were browser-verified and are on the shop
  right now.
- `list_invoices` → a real business invoice exists (status SENT).
- `list_transactions` → alongside outgoing subscription debits there is at
  least one **fee-bearing incoming EUR payment** (a merchant fee deducted,
  `protection_eligibility: 01`).

An account that receives fee-bearing payments and issues invoices **is the
merchant account.** The first reading of this data — that the token was bound
to the personal account — was wrong and is retracted.

The actual conclusion is narrower and more dangerous:

**`list_payment_links` cannot see NCP no-code links.** It enumerates a
different PayPal product. The three links under `paypal.com/ncp/links/<ID>`
exist, are live, and are invisible to this connector. The empty result is a
**false negative**, not a finding.

So the trap is specific. A future session checks the shop's payment links
through the connector, gets zero, concludes they are missing or broken, and
"helpfully" runs `create_payment_link` to restore them. That call would mint a
*different* kind of link — new ID, its own price and tax settings, none of it
matching the verified rate card — and put it on a public shop. That is the
€1,200 mistake with new packaging.

**Rules, unchanged in force and now for a known reason:**

- Never conclude a link is missing, changed, or dead from this connector.
- Never create, edit, or confirm a shop payment link through it.
  `create_payment_link` is off limits for this shop entirely.
- The browser route below remains the only way to verify an NCP link.

What the connector *is* good for: reading transactions and invoices on the
business account. That part is real and now verified. Keep it to reading.

**Use the browser instead.** The working route, and the one every
verification above was done through:

1. Sign in at `paypal.com` (passkey — Gabriel must do this himself; it is
   Face ID / Touch ID and cannot be automated).
2. Saved links list: `paypal.com/ncp/manage` — names, hosted IDs, prices.
3. Per-link detail: `paypal.com/ncp/links/<ID>` — offer type, quantity,
   tax toggle, redirect, address collection.
4. Buyer-facing check: `paypal.com/ncp/payment/<ID>` — what the customer
   actually sees and is charged. Read this too; it is the only place the
   final total is confirmed.

Dead ends, so nobody retries them: there are no `PAYPAL_*` env vars and
no local API credentials; and the OAuth token for the MCP endpoint cannot
practically be recovered from the Keychain — there are ~40 opaque
`Claude Code-credentials-<hash>` entries and no hash correlates to PayPal
or its URL, so finding it would mean dumping all of Gabriel's tokens.
Do not do that.

**Never substitute an analytics connector.** Windsor.ai can return Stripe
and PayPal transaction rows, but aggregated revenue is not a payment
object — inferring a checkout link from transaction data is the exact
mistake that produced the €1,200 charge.
