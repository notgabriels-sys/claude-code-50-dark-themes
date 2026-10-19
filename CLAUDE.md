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
  plugin. CI fails on drift between the two.
- **Plugins** → this repo *is* a Claude Code plugin marketplace
  (`.claude-plugin/marketplace.json`). Adding a plugin here makes it
  installable anywhere with `claude plugin install <name>`, which is the
  route around account-level settings. Register it in the marketplace and add
  it to `expectedPlugins`, `shippedCounts` and `expectedPackageFiles` in
  `scripts/verify.mjs` — and to `themePluginNames` if it ships themes. Never add
  a git submodule anywhere in this repo (see the CI-tripwire section).
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
   one public page that stated a count nobody had listed.
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
    `berlin-studio-skills`. A repo-internal method belongs in this file, not
    in a skill.
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
repo has. `verify` runs on every push and **fails the build** on:

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
  exactly those hashes — see "Every inline script is reviewed" below;
- the retired résumé checkout slug `notgabriel.gumroad.com/l/wmlrk`;
- any of the three verified PayPal links going missing;
- **(added 2026-08-24)** any of the three carrying a price other than its
  verified one — €45 / €160 / €190;
- **(added 2026-08-24)** *any* `paypal.com/ncp/payment/<ID>` on the page whose
  ID is not in the verified table in `scripts/verify.mjs`;
- **(added 2026-08-24)** any Gumroad card whose printed price differs from the
  one recorded in `recordedGumroadPrices` — drift only, see the warning below
  about how much weaker that table is than the PayPal one.

The last two close the hole that mattered. The original check only asserted the
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
payment link in the spelling a browser follows. A `base` element and
`meta http-equiv` are refused. **Linking a new host is a deliberate edit to
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
`verify` reads, but every rendered note would disappear from the live site.

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

**(added 2026-10-19) Every inline script is reviewed, and the browser enforces
it.** The link check reads URLs, and a script navigates without one: a
`location.assign(...)` line added to the gallery script, or a second bare
`script` element, passed `verify` and sent Chromium to another host. Every
script a served page runs is now held to `reviewedInlineScripts` in
`scripts/verify.mjs` by the SHA-256 of its text, hashed as a browser hashes it,
and every served page carries exactly one Content-Security-Policy meta, right
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
`index.html` changes the hash, and `verify` prints the new one.

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
13 above.

The Gumroad half now has structural guards, an existence-verified slug list and
a price-drift table — but no verified *price* for any product. See below.

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

**1. The page mixes currencies.** Eleven products are priced in €; three are
priced in $ — `cfcvmy` "Dark HTML Templates" at **$19**, `xcxeb` "50 Dark
Palettes" at **$9**, and the bundle `wuhehk` at **$39**. Everything else on the
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
