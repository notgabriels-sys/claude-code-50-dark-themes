# Berlin Studio Skills

Five Claude Code skills for running a techno studio and a freelance audio
practice in Berlin.

```
claude plugin marketplace add notgabriels-sys/claude-code-50-dark-themes
claude plugin install berlin-studio-skills@notgabriels-themes
```

| Skill | Use it for |
|---|---|
| `sound-design-recipes` | Building a specific sound — kick, rumble, dub chord, metallic percussion, pads |
| `mix-master-decisions` | Diagnosing a mix that is muddy, thin, harsh, or does not translate |
| `release-delivery` | Master specs, ISRC/UPC, artwork, metadata, distributor lead times |
| `german-correspondence` | Formal German letters and email — Kündigung, Widerspruch, Mahnung |
| `freelance-admin-de` | Rechnung, §14 UStG fields, Kleinunternehmerregelung, KSK, deadlines |

The audio pair — `sound-design-recipes` and `mix-master-decisions` — and the
admin pair — `freelance-admin-de` and `german-correspondence` — hand questions to
each other, so asking "why does this kick sound thin" lands in the right one
without naming it. Each skill also names the skills it would hand a question
on to that are not in this plugin (rights and royalties, rate cards, release
campaigns and the like), marks them as separate, and says so when one is not
installed rather than acting as if it were there.

## What these skills will not do

`mix-master-decisions` and `sound-design-recipes` do not assume a monitoring
chain, room, reference tracks, DAW or default synth, and `freelance-admin-de`
does not assume a USt status: prices that show no VAT are consistent with §19
but do not prove it. They ask instead of inventing, and use your answers for
the rest of the conversation.

`freelance-admin-de`'s §19 section, invoice footers and deadlines have not been
checked against the current statute, and the skill says so before you rely on
them.

Nothing here is tax or legal advice.

## Source

These are mirrored from `.claude/skills/` in the repository root, which is the
source of truth. Run `node scripts/sync-plugin-skills.mjs` after editing; CI
fails if the two copies drift.
