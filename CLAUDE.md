# Project notes

Repo: 50 dark themes for Claude Code. Shop surface is `index.html`
(GitHub Pages), products sold via Gumroad.

## Payment surfaces — read before adding any buy button

**Never add a payment button from a description of an account, or from a
URL that looks correct.** Read the payment provider's actual objects —
link, amount, currency, tax treatment — and only add a button when what
you read matches the rate card below. A Stripe link that "looked right"
sat on the shop through two review rounds and was a live €1,200 charge
for the wrong service.

Current state of `index.html` (verified 2026-08-18, after `bf14643`):
eleven Gumroad links (ten products plus the €39 bundle) at lines 259–271,
and a "Mixing & mastering" section at lines 274–282 carrying the three
PayPal links below. No Stripe link anywhere. `git log -S stripe` across
all branches returns nothing, so the bad €1,200 link never lived in this
repo — it was on some other surface, and may still be.

## Stripe Checkout service — `checkout/`, added 2026-08-24

A standalone Node service that takes a one-time payment through Stripe
Checkout: `bin/onboard.js` creates the product and its default price for a
shop SKU, `POST /create-checkout-session` opens a hosted Checkout Session for
that SKU, and the `checkout.session.completed` webhook marks the order paid.
Stripe identifiers are stored per SKU in `checkout/data/` (git-ignored). Run
its tests with `cd checkout && npm test`; CI runs them too.

**It is not a payment surface yet, and it is deliberately not wired to the
shop.** `index.html` is untouched, no Stripe link is published anywhere, and
the `/stripe/i` guard in `scripts/verify.mjs` still fails the build if one
appears there. `checkout/README.md` lists what has to be read back from Stripe
before a button is added.

**No Stripe object was created.** The only Stripe account this repo's tooling
can reach is exposed in **live mode only** — the MCP connector offers no
test-mode context — so onboarding a product would have meant writing a real
product and a permanent price into Gabriel's merchant account. That is his
call, not Claude's, so `checkout/data/catalog.json` is empty and the onboard
CLI refuses a live secret key unless `--live-mode` is passed explicitly.

Read-only on 2026-08-24, the live Stripe account already held five active
products, all EUR one-time prices: "Mastering, one track" €45, "Mastering, 1
track" €45, "Mixing, one track" €160, "Mix + master, one track" €190 — those
match the rate card — plus "Engineering" €160. Two things for Gabriel, neither
touched: "Engineering" is priced **tax-exclusive** while every other object on
both providers is tax-inclusive, and the two €45 mastering products are
duplicates.

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

The claude.ai PayPal MCP connector does not work and cannot be used to
verify anything. It authenticates fine but the tool-schema fetch fails:

    claude.ai PayPal: https://mcp.paypal.com/mcp - ! Connected ·
    tools fetch failed — Invalid regular expression: invalid escaped
    character for Unicode pattern

A `pattern` in PayPal's published tool definitions will not compile as a
Unicode-mode regex, so the client rejects the whole manifest and zero
PayPal tools load. Re-authorizing does not help; this needs a fix from
PayPal. Check with `claude mcp list` — it is fixed when the line reads
`Connected` with no `tools fetch failed` suffix.

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
