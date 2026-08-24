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

1. One payment connector now answers — and answers about what looks like the
   wrong account.
2. Five skills are referenced as routing targets by installed skills but do
   not exist.
3. Around sixty installed plugins have no connection to any work done here,
   and they cost every turn.

## 1. PayPal — resolved, and now more dangerous, not less

`CLAUDE.md` recorded the PayPal MCP connector as permanently broken (a regex
in the tool manifest failing to compile). **That is fixed.** The tools load
and calls return data.

Two read-only calls, 2026-08-24:

| Call | Result |
|---|---|
| `list_payment_links` | **empty** — zero links |
| `list_transactions`, 31 days | 65 rows, all *outgoing* EUR wallet debits via billing agreements (−4.99, −48.73) |

Three browser-verified payment links are live on the shop right now. The
connector reports none, and the transactions look like personal subscription
charges rather than mixing and mastering income.

The likely explanation is that the token is bound to the **personal** account
rather than the Berlin **business** account — the exact two-account split
`CLAUDE.md` already warns about. The alternative is that `list_payment_links`
does not enumerate NCP no-code links. Neither is resolved.

**Operational rule, now written into `CLAUDE.md`:** do not create, edit, or
confirm a payment link through this connector, and never read an empty result
as evidence that a link is missing. A connector answering confidently about
the wrong account is the same failure mode that produced the €1,200 charge.
The browser route stays authoritative.

Stripe is also connected and authenticated. There is no Stripe link on the
shop and there should not be one. Worth knowing the surface is live.

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

Payments: **PayPal** and **Stripe** — connected, and per section 1, not to be
trusted as sources of truth here.

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

## What could not be done from this session

Connectors and plugins are claude.ai account settings. This session is
non-interactive and cannot run an OAuth flow or toggle an install, so nothing
in sections 4 and 5 could be actioned here — they need Gabriel in
claude.ai connector and plugin settings.

What was actioned: the five skills, and the `CLAUDE.md` correction.
