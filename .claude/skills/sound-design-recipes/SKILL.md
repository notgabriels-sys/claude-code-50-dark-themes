---
name: sound-design-recipes
description: >-
  Build a specific sound from scratch — synthesis, sampling, processing chains,
  and movement — for techno and adjacent electronic music. Use whenever the
  user asks how to *make* a sound rather than what to work on: "how do I get
  that kick", "make a rumble", "design a hoover / stab / pad / drone", "this
  hi-hat sounds cheap", "how do I get that Berlin dub chord", "what chain for
  a metallic percussion hit", "recreate this sound", "my bass has no weight",
  or describes a texture they can hear but cannot build. Covers synthesis
  approach, sampling and resampling, effect chain order, and adding motion.
  Does NOT cover deciding what to work on (track-finishing-system) or fixing a
  full mix (mix-master-decisions).
---

# Sound design recipes

## Method — before reaching for a preset

A sound is four decisions, in this order. Answer them and the patch follows.

1. **Body** — what is the raw source? Oscillator, noise, sample, feedback,
   recorded object.
2. **Envelope** — the shape over time. This carries more identity than the
   waveform. A sine with a 40 ms decay and a sine with a 3 s decay are not the
   same instrument.
3. **Filter and saturation** — what is removed, and what is added by driving it.
4. **Space and motion** — what makes it move so the ear keeps listening.

Most "my sound is boring" problems are decision 2 or 4, and people try to fix
them at decision 1 by changing the oscillator. That rarely works.

## Core recipes

### Techno kick
Body: sine or triangle. Two envelopes are essential — one on **pitch**
(short, roughly 20–60 ms, dropping perhaps two octaves) and one on
**amplitude** (decay sets the genre — 200 ms tight, 600 ms+ rolling).

The pitch envelope is the click and the weight. Without it you have a tom.

Then: a transient layer on top (a short noise burst or a clicky sample,
high-passed so it does not fight the body), light saturation for harmonics that
survive on small speakers, and a high-pass around 25–30 Hz to remove subsonic
energy that eats headroom without being heard.

### Rumble
Not a bass part — a kick sent into a **reverb**, the reverb's output
**high-cut** hard (a few hundred Hz), and often compressed or ducked back
against the kick. Long decay, low diffusion. Sidechain the rumble to the kick
so the transient stays clean and the tail blooms between hits.

Mono the low end. A wide rumble is the most common reason a track falls apart
on a club system.

### Dub chord
Body: a short, dry stab — detuned saw or a sampled chord, minor 7th or
sus voicings.
Chain: **stab → filter → delay (dotted or triplet, with feedback) → reverb**,
with the delay feedback filtered so each repeat gets darker. Automate the
filter cutoff across the repeats.

The character is in the *degradation*, not the chord. If it sounds static, you
are not filtering the feedback path.

### Metallic percussion
Body: FM with inharmonic ratios, or ring modulation, or a noise source through
a resonator/comb. Short decay, bandpass sweep, a touch of distortion.
Resample the result, then pitch and reverse pieces of it — the second
generation is usually more interesting than the first.

### Pads and drones
Body: several detuned oscillators, or a granular/sampled source.
Motion is everything: slow LFOs on filter cutoff and detune, slight pitch
drift, and a reverb long enough to blur the boundary between notes. Automate
something over 16–32 bars so it never sits still.

### Hi-hats that do not sound cheap
Filtered noise alone reads as thin and synthetic. Layer noise with a metallic
FM component, vary the decay *per hit*, and vary the velocity. Then vary the
sample or the filter slightly between hits — machine-identical repeats are the
tell.

## Chain order — the part people get wrong

**Distortion before filter** = aggressive, harmonics then shaped.
**Filter before distortion** = the distortion reacts to what survived; usually
smoother and more controllable.

**Reverb before distortion** = the space itself is crushed; dense, dirty, glued.
**Distortion after reverb** is the classic industrial-techno texture.

Modulation last, generally — but a filter *inside* a delay feedback loop is
where dub techno lives.

## Resampling — the single highest-leverage habit

Bounce the sound to audio, then treat it as a new raw source: pitch it,
reverse it, chop it, run it through the chain again. Two or three generations
produce textures no single patch reaches, and it commits decisions instead of
leaving 40 tweakable parameters open. It also makes the session lighter and
faster to finish.

## When a sound is "not working"

| Symptom | Usual cause |
|---|---|
| Thin on club systems | No low-mid body (100–250 Hz); everything is sub or top |
| Muddy | Overlapping low-mids across layers; nothing high-passed |
| Lifeless | Static — no envelope or LFO movement over time |
| Harsh | Untamed 2–5 kHz from distortion; needs a dip or gentler drive |
| Buried | Competing with another element in the same band; one must move |
| Sounds like a preset | Envelope untouched; no resampling; no per-hit variation |

## Placeholder — Gabriel's own conventions

His default synths, sample library organisation, and go-to chains inside
Bitwig are **not recorded**. Ask before assuming a specific instrument or rack,
and add what he confirms here rather than guessing.

## Routing

- What to work on, finishing, session planning → `track-finishing-system`
- Mix balance, translation, master-bus problems → `mix-master-decisions`
- Packaging sounds as a sellable product → `sample-pack-creation`
