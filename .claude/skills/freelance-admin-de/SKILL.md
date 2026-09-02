---
name: freelance-admin-de
description: >-
  Invoicing, tax, and self-employment admin for a freelance audio engineer and
  musician registered in Berlin. Use whenever the user mentions Rechnung,
  invoice, Steuernummer, USt-IdNr, Umsatzsteuer, VAT, Kleinunternehmerregelung,
  §19 UStG, Umsatzsteuervoranmeldung, EÜR, Einkommensteuererklärung, Finanzamt,
  Künstlersozialkasse, KSK, Gewerbeanmeldung, Freiberufler vs Gewerbe, business
  expenses, Betriebsausgaben, deadlines, "do I charge VAT", "how do I invoice
  this client", "what can I write off", or reading a letter from the Finanzamt.
  Also trigger when a quote, rate, or payment surface is being priced and the
  tax treatment has not been settled. Does NOT cover rights income mechanics
  (music-rights-royalties) or the wording of the German letter itself
  (german-correspondence).
---

# Freelance admin (Germany / Berlin)

## Status of the user's own tax position — do not assume

His USt status is **not recorded** anywhere Claude can read. The shop's rate
card is tax-inclusive with no VAT added, which is *consistent with* §19
Kleinunternehmerregelung but does not prove it. Treat it as unknown.

- Never state on his behalf that he is or is not a Kleinunternehmer.
- Never put a tax statement on a customer-facing surface without his wording.
- When the answer depends on his status, give both branches and ask which applies.

This is practical orientation, not Steuerberatung. For anything binding —
an audit, a back-payment demand, a cross-border threshold — the answer is
"confirm with a Steuerberater", said once, without hedging every sentence.

## Invoice (Rechnung) — mandatory fields under §14 UStG

An invoice missing any of these is not deductible for the client, which is how
you find out you got it wrong:

1. Full name and address — yours and the client's
2. Your Steuernummer **or** USt-IdNr.
3. Invoice date (Rechnungsdatum)
4. Sequential, unique invoice number (fortlaufende Rechnungsnummer)
5. Quantity and plain description of the service ("Mastering, 1 Track")
6. Date of delivery / performance (Leistungsdatum) — separate from invoice date
7. Net amount per VAT rate
8. VAT rate and amount — **or** the §19 exemption sentence, never both
9. Any discount agreed in advance

Small invoices under €250 gross (Kleinbetragsrechnung, §33 UStDV) may omit the
client's address, the invoice number, and the net/VAT split.

### The two mutually exclusive footers

- **With VAT:** show net, rate (19% standard; 7% reduced applies to some
  artistic performance income, not to general mixing work), and VAT amount.
- **Under §19:** `Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.`
  No VAT line, no VAT amount, and you may not show VAT anywhere — showing it
  under §19 means you owe it.

## Kleinunternehmerregelung (§19 UStG)

Available while turnover stayed under the prior-year threshold and is not
expected to exceed the current-year one. **The thresholds have been revised in
recent years — look up the figures in force for the tax year in question rather
than reciting a number from memory.**

Trade-off, stated plainly:
- You do not charge VAT → cheaper for private clients, simpler filing.
- You cannot reclaim Vorsteuer on purchases → every monitor, interface, and
  plugin costs you the full gross.

Crossing the threshold flips you to regular taxation from the following year,
and it is not optional. Watch it before it happens.

## Cross-border clients (relevant: EU labels, UK/US clients)

- **B2B inside the EU:** reverse charge. No German VAT. Invoice needs both
  USt-IdNr. and the sentence `Steuerschuldnerschaft des Leistungsempfängers
  (Reverse Charge)`. You must file a Zusammenfassende Meldung.
- **B2C inside the EU:** generally German VAT.
- **Outside the EU:** generally not subject to German VAT.
- **Under §19:** you have no USt-IdNr. by default and reverse charge does not
  apply the same way — check before invoicing an EU label.

## Freiberufler vs. Gewerbe

Audio work sits on a genuine line. Artistic/creative output (composition,
performance, artistic sound design) tends toward **freiberuflich** — no
Gewerbeanmeldung, no Gewerbesteuer, EÜR only. Selling goods — sample packs,
theme licences, merch, digital products — tends toward **Gewerbe**.

Selling digital products alongside services can make him a mixed case. That is
a Steuerberater question, not a guess. Flag it when the shop side grows.

## Künstlersozialkasse (KSK)

For self-employed artists and publicists: KSK pays roughly the employer half of
health, nursing, and pension insurance. Materially cheaper than fully private
self-employed contributions.

- Application requires showing *artistic* income above a minimum, with an
  exception in the first years of self-employment.
- Predominantly technical service work (live sound engineering, straight
  mastering as a trade) is frequently rejected; composition, production, and
  artistic sound design are the qualifying framing.
- Membership does not stop him invoicing normally.

## Recurring deadlines

| What | When |
|---|---|
| Umsatzsteuervoranmeldung | Monthly or quarterly, 10th of the following month; a one-month Dauerfristverlängerung is available on request |
| Einkommensteuererklärung + EÜR + USt-Jahreserklärung | Annual; the statutory date is later when a Steuerberater files for you |
| Zusammenfassende Meldung | Only if he has EU B2B reverse-charge sales |

Exact dates shift year to year — confirm the current year's rather than
asserting one.

## Betriebsausgaben worth tracking

Studio rent and Nebenkosten · hardware and instruments (over the low-value
threshold these depreciate over a useful life rather than deducting in year
one) · software and subscriptions · sample and sound licences · promo and
distribution fees · travel to gigs and sessions · professional insurance ·
Steuerberater fees · a proportion of phone and internet · trade press and
training.

Keep receipts for the statutory retention period. Records must be
unalterable — an editable spreadsheet as the only ledger is a problem in an
audit.

## Routing

- Rights income, GEMA/GVL, splits → `music-rights-royalties`
- Writing the German letter or email → `german-correspondence`
- Setting the prices themselves → `rate-cards-service-menus`
- Quoting a specific job → `audio-client-proposals`
