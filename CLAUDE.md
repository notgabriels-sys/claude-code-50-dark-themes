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

Current state of `index.html` (verified 2026-08-18): ten Gumroad product
links plus the €39 bundle, at lines 256–269. No Stripe link. No PayPal
button. No mixing/mastering listing of any kind. `git log -S stripe`
across all branches returns nothing, so the bad €1,200 link never lived
in this repo — it was on some other surface, and may still be.

## Mixing & mastering rate card

Prices and tier names both stated by Gabriel; not yet verified against a
payment provider (the PayPal account holds no payment objects at all —
see below).

| Service | Price |
|---|---|
| Mastering | €45 |
| Mixing | €160 |
| Mixing + Mastering | €190 |

Tax-inclusive. No VAT added on top. Currency EUR.

## Accounts

**Verified 2026-08-18** by reading the PayPal business account in a
signed-in browser session (Kontoeinstellungen → Informationen zum
Kontoinhaber):

- Account holder: Gabriel Garcia Alonso, business account, Berlin, EUR.
- Email shows masked as `ho•••••••••••••••••@gmail.com` — prefix `ho`
  plus exactly 19 characters before the `@`, which matches
  `hologrampeoplemusic` (19 chars). Consistent with
  `hologrampeoplemusic@gmail.com` being the business account.
- `notgabriels@gmail.com` as the personal account remains Gabriel's
  statement; not independently verified.

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

**Card copy is placeholder.** Each card reads "One track, fixed price."
That is derived only from the links' maximum quantity of 1 — it is not a
description of what the service actually includes. Replace with real
scope (what the customer sends, what they get back, revisions,
turnaround).

**Tax is switched off on all three links** (Steuern toggle off), so
PayPal adds nothing on top of the stated price — consistent with the
tax-inclusive rate card. PayPal's own note: if your country requires tax
to be included, the "Preis" field must already contain it. It does.

**No tax wording appears on the page, deliberately.** The rate card says
tax-inclusive with no VAT added, but no tax statement is printed on the
public page because the correct German wording was never confirmed. If
this is Kleinunternehmerregelung under §19 UStG, convention is to say so
explicitly. Decide the wording before adding any tax claim.

