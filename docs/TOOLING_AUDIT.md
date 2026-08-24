# Tooling audit — connectors, skills, plugins

Audited 2026-08-24 against the live session. Every claim below was read from
`ListConnectors`, `ListPlugins`, `ListSkills`, `SearchSkills`,
`SearchMcpRegistry`, or a read-only connector call — not from description.

## Headline

The request was to find what is crucial and then install all of it. The audit
does not support that shape. **Roughly 100 connectors and 100 plugins are
already installed**, plus 33 skills. Nothing meaningful is missing from the
catalogue.

The actual problems are three, and none of them is solved by installing more:

1. The payment connector now answers, and returns an empty link list for a
   shop that has three live links — a false negative that invites a very
   expensive "fix".
2. Five skills are referenced as routing targets by installed skills but do
   not exist.
3. Around sixty installed plugins have no connection to any work done here,
   and they cost every turn.

## 1. PayPal — the connector is fixed, and it lies by omission

`CLAUDE.md` recorded the PayPal MCP connector as permanently broken (a
`pattern` in the tool manifest not compiling as a Unicode regex). **That bug is
fixed upstream.** Tools load and calls return data.

Read-only calls, 2026-08-24:

| Call | Result |
|---|---|
| `list_payment_links` | **empty** — zero links |
| `list_invoices` | a real business invoice, status SENT |
| `list_transactions` | outgoing subscription debits **and** at least one fee-bearing incoming EUR payment |

An account that takes fee-bearing payments and issues invoices is the
**merchant account**. An earlier reading of this same data — that the token was
bound to the personal account — was wrong and is retracted.

The real finding is narrower and worse:

**`list_payment_links` cannot see NCP no-code links.** It enumerates a
different PayPal product. The three links under `paypal.com/ncp/links/<ID>`
are live on the shop and invisible to this connector. The empty result is a
**false negative**, not a finding.

The concrete trap: a future session checks the shop's links through the
connector, gets zero, concludes they are missing, and runs
`create_payment_link` to "restore" them. That mints a *different* kind of link
— new ID, its own price and tax settings, matching nothing on the verified rate
card — and puts it on a public shop. That is the €1,200 mistake with new
packaging.

Rules now written into `CLAUDE.md`: never conclude a link is missing from this
connector; never create, edit or confirm a shop link through it;
`create_payment_link` is off limits for this shop. The browser route stays the
only way to verify an NCP link.

What it *is* good for, now verified: reading transactions and invoices on the
business account. Keep it to reading.

Stripe is also connected and authenticated. There is no Stripe link on the shop
and there should not be one. Worth knowing the surface is live.

## 2. Five skills referenced but missing — created in this change

Installed skills route to these by name. Until now those routes went nowhere:

| Missing skill | Referenced by |
|---|---|
| `freelance-admin-de` | `music-rights-royalties` |
| `release-delivery` | `music-rights-royalties` |
| `german-correspondence` | `german-practice-drills` |
| `sound-design-recipes` | `track-finishing-system` |
| `mix-master-decisions` | `track-finishing-system` |

All five now exist under `.claude/skills/`. Each covers the domain properly
and routes back to its neighbours, closing the graph.

Where a skill would otherwise have needed a fact about how Gabriel personally
works — his monitoring chain, his reference tracks, his default synths, his
USt status — it says so and asks, rather than inventing one. Those are marked
placeholders, not gaps left by accident.

**These are repo-scoped.** They load in this repository. To get them in every
session they should be promoted to account-level skills.

## 3. Keep — the tools that actually carry the work

Shop and code: **github**, **Context7**, **browser-use**, **desktop-commander**.
The shop is GitHub Pages on a custom domain, so Netlify, Vercel, Railway,
Supabase, Cloudflare, Replit, v0, Lovable, Macaly and Wix are all solving a
problem this repo does not have.

Audio and release: **Splice**, **Spotify**, **Descript**, **Adobe for
creativity**, **Hugging Face** (relevant to the audio-eval contracting work).

Berlin admin and language: **DeepL**, **Gmail**, **Google Calendar**,
**Google Drive**.

Voice and continuity: **Idiolect** — writes in his real voice, which matters
given the voice rules in `gabriel-operating-profile`. **Unabyss** for
persistent context, though it overlaps with the skills already doing that job.

Payments: **PayPal** — good for reading transactions and invoices, and per
section 1, blind to the shop's NCP links. **Stripe** — connected, with nothing
on the shop that should use it.

## 4. Prune — the real optimisation

Four overlapping web-search connectors are installed: **Firecrawl, Tavily,
Nimble, Exa**, plus **brightdata** and **tinyfish** plugins. That is six ways
to fetch a web page. Keep one. Every extra one makes tool selection worse, not
better.

Around sixty installed plugins have no path to any work in evidence:

- Finance and capital markets — `carta-cap-table`, `carta-crm`,
  `carta-investors`, `investment-banking`, `lseg`, `sp-global`,
  `bigdata-com`, `daloopa`, `airwallex-agentos`
- Legal — eleven separate legal plugins plus `law-student` and `legal-clinic`
- Enterprise data and ops — `redshift`, `bigquery`, `salesforce`,
  `pagerduty`, `grafana`, `datadog`, `atlan`, `honeycomb`, `stackhawk`,
  `cockroachdb`, `prisma`
- Sales and prospecting — `apollo`, `zoominfo`, `common-room`,
  `vibe-prospecting`, `adspirer-ads-agent`
- Unrelated domains — `bio-research`, `consensus`, `qt-development-skills`,
  `claude-for-msft-365-install`

None of these is harmful on its own. Together they are the reason a session
carries thousands of tool definitions before any work starts.

## 5. Broken pairings — plugin enabled, connector not

These are installed but cannot function. Either fix the connector or drop
the plugin; leaving them half-connected is the worst of both.

| Plugin | Backing connector |
|---|---|
| `canva` | Canva — **needs authorization** |
| `datadog` | Datadog — not enabled in chat |
| `bigquery` | Google Cloud BigQuery — not enabled |
| `intercom` | Intercom — not enabled |
| `learn-with-coursera` | Coursera — not enabled |
| `slack-by-salesforce` | Slack — not enabled |
| `exa` | Exa — not enabled |

Also unauthorized: **Adobe Experience Manager** (enabled in chat but not
authorized) and **Macaly**.

## 6. The one real gap — and no connector exists for it

The shop sells through **Gumroad**. There is no Gumroad connector in the
registry. Searching for the rest of the music stack returns nothing either:
no Bandcamp, no Beatport, no DistroKid, no GEMA, no Ableton or Bitwig.

For a Berlin techno producer running a label and a digital shop, the entire
industry-specific layer is absent from the connector ecosystem. That is worth
knowing before spending time looking for it.

Coverable today by tools already installed:
- **browser-use** — read the Gumroad dashboard directly, the same way the
  PayPal links were verified.
- **Zapier** — has Gumroad actions, reachable via `discover_zapier_actions`.

Applying the payment-surface rule from `CLAUDE.md`: read Gumroad's real
objects before writing any Gumroad figure or link into `index.html`.

## 7. Execution checklist

Everything below is a claude.ai account setting. A non-interactive session has
no tool that can toggle an install or run an OAuth flow, so none of it could be
applied automatically — but it is listed exactly, so it is clicking rather than
deciding.

### 7a. Web fetch — keep one of six

Installed: **Firecrawl**, **Tavily**, **Nimble**, **Exa** (connectors) plus
`brightdata-plugin`, `tinyfish`, `nimble`, `exa` (plugins).

Keep **Firecrawl** — it covers plain web search plus research-paper and code
search, which the audio-eval contracting work actually uses. Disable the Tavily
and Nimble connectors, and the `brightdata-plugin`, `tinyfish`, `nimble` and
`exa` plugins.

### 7b. Plugins to disable — no path to any work in evidence

Finance and capital markets: `carta-cap-table` · `carta-crm` ·
`carta-investors` · `investment-banking` · `lseg` · `sp-global` ·
`bigdata-com` · `daloopa` · `airwallex-agentos` · `finance`

Legal: `ip-legal` · `legal-builder-hub` · `commercial-legal` · `product-legal` ·
`regulatory-legal` · `legal-clinic` · `employment-legal` ·
`ai-governance-legal` · `litigation-legal` · `corporate-legal` ·
`privacy-legal` · `law-student` · `legal`

Enterprise data and ops: `redshift` · `salesforce` · `pagerduty` · `grafana` ·
`datadog` · `atlan` · `honeycomb` · `stackhawk-api` · `cockroachdb` ·
`prisma` · `bigquery`

Sales and prospecting: `apollo` · `zoominfo` · `common-room` ·
`vibe-prospecting` · `adspirer-ads-agent` · `sales`

Unrelated domains: `bio-research` · `consensus` · `qt-development-skills` ·
`claude-for-msft-365-install` · `human-resources` · `product-management` ·
`customer-support`

### 7c. Plugins worth keeping

`techno-studio-ops` · `postiz` (release promo across 28+ social platforms) ·
`marketing` · `brand-voice` · `design` · `searchfit-seo` (the shop is a public
site that wants to be found) · `adobe-for-creativity` · `figma` ·
`pdf-viewer` · `browser-use` · `desktop-commander` · `modern-web-guidance` ·
`claude-tag-data-viz` · `zapier` (the only bridge to Gumroad) · `airtable` ·
`notion` · `linear`

### 7d. Broken pairings — fix or drop, do not leave half-connected

| Plugin | Backing connector | Action |
|---|---|---|
| `canva` | Canva — needs authorization | Authorize; it earns its place for release artwork |
| `exa` | Exa — not enabled | Drop, per 7a |
| `datadog` | Datadog — not enabled | Drop |
| `bigquery` | Google Cloud BigQuery — not enabled | Drop |
| `intercom` | Intercom — not enabled | Drop |
| `learn-with-coursera` | Coursera — not enabled | Drop |
| `slack-by-salesforce` | Slack — not enabled | Drop unless Slack is actually used |

Also unauthorized: **Adobe Experience Manager** (enabled in chat but not
authorized — authorize or disable) and **Macaly**.

### 7e. Promote the five new skills to account level

They live in `.claude/skills/` and load only in this repository. Recreating them
as account-level skills in claude.ai skill settings makes them available in
every session — where they belong, since four of the five have nothing to do
with this repo.

### 7f. Fill the marked placeholders

`sound-design-recipes` and `mix-master-decisions` each end with a placeholder
for facts that were deliberately not invented — monitoring chain, room,
reference tracks, default synths and racks in Bitwig. `freelance-admin-de`
leaves USt status open for the same reason. Ten minutes of answers turns three
good skills into three accurate ones.

## What could not be done from this session

Connectors and plugins are claude.ai account settings. This session is
non-interactive and has no tool that toggles an install or runs an OAuth flow,
so section 7 could not be applied here — it needs Gabriel in claude.ai
connector, plugin, and skill settings.

What was actioned: the five skills, the PayPal investigation, and the
`CLAUDE.md` correction.
