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
  it to `expectedPlugins` in `scripts/verify.mjs`.
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
   It ran and the suite passed; grep started calling the file binary. Check:
   `python3 -c "print(open('scripts/verify.mjs','rb').read().count(b'\x00'))"`.
8. **Control characters in a commit message** go through
   `git commit -F <file>` from the scratchpad.
9. **CI publishes a check run, not a commit status.** Read it with
   `get_check_runs`; `get_status` reports pending forever.
10. **A count in prose rots.** When something is added, `verify` fails on the
    stale sentence by design — fix the sentence, never the guard.
11. **Every skill in `.claude/skills/` ships to installers** through
    `berlin-studio-skills`. A repo-internal method belongs in this file, not
    in a skill.

## Payment surfaces — read before adding any buy button

**Never add a payment button from a description of an account, or from a
URL that looks correct.** Read the payment provider's actual objects —
link, amount, currency, tax treatment — and only add a button when what
you read matches the rate card below. A Stripe link that "looked right"
sat on the shop through two review rounds and was a live €1,200 charge
for the wrong service.

Current state of `index.html` (re-counted 2026-08-24, after `main` retired two
audio products, then restyled the storefront and retired `zvbti`):

- **15 distinct Gumroad products** across **18 link occurrences**, all on
  `notgabriel.gumroad.com/l/<slug>`: one free zip, ten product cards, the
  complete-kit bundle, two audio products, and a developer-picks row that
  repeats three of the products with `?utm_source=...` parameters. Each
  retirement was caught by the CI guard before the slug was dropped from the
  tables, deliberately rather than to silence a red build.
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

- any occurrence of `stripe` (case-insensitive) anywhere in `index.html`;
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
priced product states nothing, if the free zip grows a price, or if an
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

No Gumroad product's **price** has ever been read back by anyone working in this
repo. A price that was already wrong on the day it was recorded is copied
faithfully into the table and the build stays green forever. Adding or changing
a row silences the guard; it verifies nothing.

What the Gumroad guards do buy is real but bounded: a slug cannot silently
change, appear, disappear or point at another host, and no stated price can be
edited — in any of the three places the page states it — without the edit being
deliberate. That catches a stray keystroke or a bad merge. It is not
verification, and it must never be described as verification. The priced half
stays unbuilt until someone reads the 15 products in a signed-in browser.

`verify` also guards the plugin marketplace: it asserts both plugins are
registered with the right source paths, that every skill in `.claude/skills/`
is byte-identical to its packaged copy under
`plugins/berlin-studio-skills/skills/`, and that each skill has YAML
frontmatter with a name and description. Drift means an installer silently gets
a different skill than a contributor reads, so it fails the build — the same
contract the themes already had.

The Gumroad half now has structural guards, an existence-verified slug list and
a price-drift table — but no verified *price* for any product. See below.

## Gumroad — the unverified half of the shop

The PayPal links below were each read back from their own detail page before
going on the shop. **No Gumroad product's price has ever had that treatment.**
The 15 products are the larger half of the shop by count and carry the ordinary
sales income. `main` did confirm on 2026-08-24 that each product page loads a
published product — real, and worth having — but existence is not price, and
nothing in this repo records a single price being read off a Gumroad product.

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
