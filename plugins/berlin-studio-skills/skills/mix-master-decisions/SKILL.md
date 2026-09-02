---
name: mix-master-decisions
description: >-
  Diagnose and fix mix and master problems by deciding what to change and why.
  Use whenever the user describes a mix that is wrong rather than a sound to
  build: "my mix is muddy", "it doesn't translate", "sounds thin in the club",
  "quiet compared to reference", "the kick and bass are fighting", "harsh",
  "no punch", "should I compress this", "how loud should I master", "is this
  ready to send", "my master is clipping", or asks whether a mix is finished.
  Covers gain staging, frequency conflicts, dynamics decisions, referencing,
  translation checks, and loudness targets. Does NOT cover creating a sound
  (sound-design-recipes) or writing the client-facing delivery note
  (mixing-mastering-reports).
---

# Mix and master decisions

## The rule that resolves most questions

**Fix it at the source before you fix it in the mix.** A kick that needs 6 dB
of corrective EQ is the wrong kick. Reaching for a new sample is usually faster
and always sounds better than rescuing the old one. Ask "can I change the
source?" before opening a plugin.

## Diagnose before treating

| Complaint | Look here first |
|---|---|
| Muddy | 200–500 Hz buildup, usually additive across many layers |
| Boxy | 300–600 Hz, often from untreated room or overlapping bodies |
| Harsh / fatiguing | 2–5 kHz, usually from distortion or stacked bright layers |
| Thin | Missing 100–250 Hz — the low-mid body, not the sub |
| No punch | Transients over-compressed, or attack times too fast |
| Doesn't translate | Decisions made too loud, on one system, in a bad room |
| Quiet vs reference | Dynamic-range and arrangement issue, not a limiter issue |
| Kick and bass fighting | Both occupying the same octave with no separation strategy |

## Gain staging

Mix at conservative levels — peaks well below 0 dBFS with real headroom on the
master bus. There is no tonal benefit to running hot in a floating-point DAW,
and the cost is that every plugin with drive-dependent behaviour lands in the
wrong place.

**Turn it down before you decide.** Loud always sounds better. Almost every bad
mix decision is made at high volume. Reference at a consistent, moderate level;
check occasionally at very quiet — the balance that survives a whisper is the
balance that translates.

## Kick and bass — pick one strategy, do not stack all of them

1. **Frequency split.** Kick owns the sub (say below 60 Hz), bass owns above —
   or the reverse. Decide which one is the sub, and commit.
2. **Sidechain ducking.** Bass ducks to the kick. Release timed to the tempo;
   too long and the groove drags, too short and it pumps audibly.
3. **Arrangement.** They do not play at the same instant.

Both fighting for the sub with no plan is the most common low-end failure. And
keep everything below roughly 100 Hz **mono** — stereo sub is the other one.

## Dynamics — decide the intent first

- **Compression for control** — an unruly level rides steady. Fast-ish attack,
  moderate ratio, a few dB of reduction.
- **Compression for character** — the pump and glue are the point. Slower
  attack to let the transient through, release in time with the track.
- **Compression because everyone does it** — do not. If you cannot say which of
  the two above you want, bypass it and move on.

A/B with the output level matched. Louder is not better; it just sounds better.

## Referencing

Pick two or three tracks you genuinely want to sit beside, in the same genre,
and **level-match them to your mix** before comparing. Comparing an unmastered
mix to a mastered release at face value tells you nothing except that mastering
raises level.

Compare specific things — low-end weight, top-end air, how wide the stereo
image is, how loud the vocal or lead sits — not "does it sound as good".

## Translation checks before you call it done

Monitors at moderate level · a single small speaker or phone in mono ·
headphones · in the car if it matters. Then **leave it and listen tomorrow**.
Ear fatigue makes a bad mix sound finished; a night's gap is the cheapest and
most reliable tool available.

Mono is not optional for club music. Sum to mono and check nothing disappears —
phase-cancelling wide low end vanishes on a mono club system.

## Mastering

If you mastered your own mix, at minimum take a break between the two, and
ideally open a fresh session. You are making a different set of decisions and
you cannot make them while you can still hear every mix choice you made.

**Loudness:** streaming platforms normalise, so a crushed master mostly gets
turned down and arrives squashed. Serve the music, not the number. For a club
master, headroom and impact beat raw level — a DJ turns it up.

**True peak: leave at least 1 dB.** Ceiling at or below **-1.0 dBTP**. Lossy
encoders overshoot the sample peak, so a master sitting at 0.0 dBFS distorts
after transcoding while looking clean in the DAW.

**Never dither twice**, and only when reducing bit depth at the final render.

## "Is it ready to send?"

- [ ] Balance holds at low volume
- [ ] Survives mono
- [ ] Survives a phone speaker
- [ ] Level-matched against references and holds up
- [ ] Heard with fresh ears at least a day later
- [ ] No clipping; ≥1 dB true-peak headroom
- [ ] Low end mono, no unintentional sub
- [ ] Nothing is fixable at the source that you papered over instead

If revisions keep circling the same 0.5 dB, the mix is done and the decision is
`track-finishing-system`, not another plugin.

## Placeholder — Gabriel's own setup

His monitoring chain, room treatment, and reference tracks are **not
recorded**. Ask rather than assuming a speaker, room, or target loudness, and
record the answers here once confirmed.

## Routing

- Creating or rebuilding the sound itself → `sound-design-recipes`
- Deciding whether the track is finished at all → `track-finishing-system`
- Writing the delivery note or revision reply to a client → `mixing-mastering-reports`
- What to charge for the work → `rate-cards-service-menus`
