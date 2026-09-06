# Synthesis evaluations — first slice

Evaluate the answer Prism produces, separately from whether browser dispatch and
capture work. Reuse the production merge prompt and Gemini streaming client.

[First live pilot findings](synthesis-pilot-2026-09-06.md): preserved uncertainty
and conflicts, but exposed attribution errors and unsupported/repetitive pearls.

## Run

```sh
npm run eval:synthesis
```

This prepares three fictional, nonclinical regression cases without network
requests: qualifier preservation/useful additions, material disagreement, and
attribution/source-instruction injection. It does **not** evaluate a model answer.

To generate real model answers for these fixtures, configure `GEMINI_API_KEY`
(or `GOOGLE_API_KEY`) in your shell, then:

```sh
npm run eval:synthesis -- --live --length Standard
```

This makes one paid synthesis request per case, sequentially, with high thinking
and no automatic retry. It does not query the three provider websites or read
their login profiles/the app's encrypted key. Default model: `gemini-3.8-flash`;
override with `--model ID` if needed for account access.

For offline review of already-generated answers:

```sh
npm run eval:synthesis -- --replay /absolute/path/answers.json
```

The replay file is a JSON object mapping each case ID to synthesis text. Use
`--cases /absolute/path/cases.json` for your own **de-identified/non-patient**
source snapshots. Match the fields in `evals/cases.cjs`: `id`, `question`,
`sources` keyed by `openevidence`, `chatgpt`, `doximity` (at least two), optional
`checks` as name/regular-expression pairs, `forbidden` strings, and `review`
questions. Local custom cases are trusted configuration, not uploaded inputs.

To reassess an existing harness run without another API call, use
`--replay-run /absolute/path/to/run-directory`. Source snapshots must match the
selected cases. This creates a new report and leaves the original receipt intact;
the original directory remains the authority for generation timing/model usage.

`--template prompt.txt` and `--system system.txt` allow prompt comparisons without
changing the app. Length choices are `Short`, `Standard`, `Detailed`, corresponding
to Brief/Standard/Deep. Compare the same case set at the same level first.

## What is measured

Every run gets a private directory under ignored `artifacts/evals/`. Case files
retain the exact question, source text, populated prompt, system instruction,
answer, hashes, and available model response ID/token usage. The report records
character/word counts, source lengths, generation time, lexical checks, unmatched
URLs, and a blank human-review rubric. USD cost stays unknown until pricing is
provided; replay generation provenance and latency are unknown.

Lexical passes do not establish meaning: negated text can match, paraphrases can
miss, and valid URL variants can be flagged. All output remains **unreviewed**.
There is deliberately no misleading aggregate clinical-quality score.

## Clinician review

Score each rubric dimension 0 (fails), 1 (partial), or 2 (meets), with a source
passage and output passage supporting the judgment. Record reviewer/date. A
material unsupported claim, lost safety qualifier, false attribution, or silently
resolved action-changing conflict blocks acceptance regardless of other scores.

Review directness/readability, fidelity/attribution, preserved qualifiers/scope,
conflict handling, useful additions over the best individual answer, and appropriate
detail. Compare against each original—not just another synthesized answer. Do not
reward mandatory pearls, more sections, or greater length.

Next: a clinician-approved clinical case set and adjudicated baseline, repeated
live runs to measure variability, and calibrated model-assisted grading. The
fictional fixtures are plumbing/regression probes, not clinical validation. Keep
clinical case records/results private and out of Git. No real patient examples
are included in the repository.
