# Berlin Studio Skills

Six Claude Code skills for running a techno studio and a freelance audio
practice in Berlin.

```
claude plugin marketplace add notgabriels-sys/claude-code-50-dark-themes
claude plugin install berlin-studio-skills
```

| Skill | Use it for |
|---|---|
| `sound-design-recipes` | Building a specific sound — kick, rumble, dub chord, metallic percussion, pads |
| `mix-master-decisions` | Diagnosing a mix that is muddy, thin, harsh, or does not translate |
| `release-delivery` | Master specs, ISRC/UPC, artwork, metadata, distributor lead times |
| `german-correspondence` | Formal German letters and email — Kündigung, Widerspruch, Mahnung |
| `freelance-admin-de` | Rechnung, §14 UStG fields, Kleinunternehmerregelung, KSK, deadlines |
| `storefront-exposure` | SEO, structured data, sitemap, llms.txt, directory listings — and the price-in-structured-data trap |

They route to one another, so asking "what do I do with this track" lands in the
right one without naming it.

## What these skills will not do

Three of them end in a marked placeholder rather than a guess. `mix-master-decisions`
and `sound-design-recipes` do not assume a monitoring chain, room, reference
tracks, or a default synth. `freelance-admin-de` does not assert a USt status —
a tax-inclusive rate card is consistent with §19 but does not prove it.

They ask instead of inventing. Fill the placeholders in with real answers and
they get sharper; leave them and the skills stay honest.

Nothing here is tax or legal advice.

## Source

These are mirrored from `.claude/skills/` in the repository root, which is the
source of truth. Run `node scripts/sync-plugin-skills.mjs` after editing; CI
fails if the two copies drift.
