# Audio Delivery Preflight CLI community response playbook

Last updated: 2026-08-24

Use this when replying to public feedback, Product Hunt comments, KVR questions,
DEV comments, emails, or GitHub issues. The goal is not to “win” every comment.
The goal is to be accurate, calm, useful, and easy to trust.

## Baseline tone

- Thank people for concrete critique.
- Answer the narrow question first.
- Do not argue with taste.
- Do not pretend the CLI is bigger than it is.
- Link the free checklist or sample report before the Gumroad page when the
  person is still evaluating fit.
- If someone points out a real issue, open or link a GitHub issue and say what
  will change.

## Safe short opener

```text
Thanks, that is useful feedback. The CLI is intentionally narrow: it is a local,
read-only delivery-folder preflight check, not mastering, loudness approval, a
DAW plug-in, or a distributor validator.
```

## Common replies

### “Is this just ffprobe / MediaInfo?”

```text
Adjacent, yes, but not exactly the same job.

Tools like ffprobe and MediaInfo are great for inspecting individual media
files. Audio Delivery Preflight is packaged around a delivery folder workflow:
expected roles, readable evidence, ambiguous version names, report output and
checksums. It is less about replacing those tools and more about making the
handoff check repeatable.

The sample report shows the intended scope:
https://gabs-utilities.com/audio-delivery-preflight-sample-report.html
```

### “Why would an engineer pay €19 for this?”

```text
Fair question. I do not think everyone needs it.

The paid version is for people who repeatedly send or receive delivery folders
and want a repeatable local check plus report/checksum output. If someone only
does this occasionally, the free checklist may be enough:
https://gabs-utilities.com/audio-delivery-checklist.html
```

### “Does this check loudness, true peak, clipping or mastering quality?”

```text
No. I am deliberately not claiming that.

It does not judge loudness, true peak, clipping, phase, tonal balance, mix
quality, mastering quality, rights, credit accuracy or distributor acceptance.
It checks mechanical delivery evidence and workflow hygiene around the folder.
Human listening and professional judgement remain required.
```

### “Why is there no GUI?”

```text
Version 1 is CLI-first because the first goal is repeatable local preflight and
report output, not a polished native app. A GUI could make sense later if enough
people want it, but I would rather keep the first release honest and narrow than
pretend it is a full production suite.
```

### “Why is the macOS build unsigned / not notarized?”

```text
Because this release is independently distributed without paid Apple Developer
membership, an installer, Developer ID signing or Apple notarization.

That is disclosed on the product page and in the package limitations. On macOS
13 or later, first launch may require a one-time user-approved Gatekeeper
action. If that is not acceptable for your workflow, I understand.
```

### “Why no Windows build?”

```text
Windows is not supported in version 1.0.0. The current customer package targets
macOS Apple Silicon, macOS Intel and Linux amd64.

I would rather be clear than ship an untested Windows binary. If there is real
interest, it can go on the roadmap after the current platforms are stable.
```

### “Can I try it for free?”

```text
There is no free binary trial right now, but there are free evaluation assets:

- Checklist: https://gabs-utilities.com/audio-delivery-checklist.html
- Handoff guide: https://gabs-utilities.com/audio-delivery-handoff-guide.html
- Sample report: https://gabs-utilities.com/audio-delivery-preflight-sample-report.html

Those should make the scope clear before anyone buys.
```

### “This should be open source.”

```text
I understand the preference. The public repo currently hosts the storefront,
docs, free checklists, sample report and feedback threads, while this CLI is a
small paid utility.

The free checklist and guide are public so people can still use the underlying
workflow even without buying the automation.
```

### “This will not catch the real problems in mastering delivery.”

```text
That may be true depending on the workflow, and I would genuinely like concrete
examples.

The CLI is not meant to replace mastering QC or listening. It catches a narrow
set of boring mechanical problems. If there are delivery checks that should be
represented in the free checklist or a future preset, please add them here:
https://github.com/notgabriels-sys/claude-code-50-dark-themes/issues/21
```

### “This feels too niche.”

```text
It is niche. That is intentional.

The first version is for people who repeatedly handle bounced WAV folders and
want a repeatable local preflight report. I would rather serve a narrow real
workflow than make a broad claim that does not hold up.
```

### “Where do I report bugs or missing checks?”

```text
Please use the public feedback thread:
https://github.com/notgabriels-sys/claude-code-50-dark-themes/issues/21

If it is a reproducible technical bug, include your platform, command, folder
shape, expected result and actual result. Do not upload private client audio.
```

## When to stop replying

Stop if:

- the other person is insulting rather than giving substance;
- the conversation becomes circular;
- answering would require private customer data;
- the reply would sound defensive;
- you cannot verify the claim yet.

Good closing line:

```text
I hear you. I am going to keep this narrow and use the concrete feedback to
improve the checklist/product notes rather than argue the point further.
```

