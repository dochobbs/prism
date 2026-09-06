# Live verification — September 5, 2026

Historical snapshot for the commits named below, not a current installation
guide or the latest packaged build. Original build paths and test counts are
retained as evidence. See [the README](../README.md) for current Prism setup.

App-owned runtime receipt, authenticated local service partitions. No question,
answer text, conversation URLs, credentials, or patient details recorded here.

## Observed live

Running build: `3cc9756`, packaged under `artifacts/session-reset-build`.
At 02:04:53 UTC September 6, session 1 had captured DOX and GPT while OE
reported generation activity. At 02:05:23 all three were captured and synthesis
was streaming. At 02:05:53 synthesis was complete and the combined view active.

| Provider | Extracted characters | Extracted links | Run phase |
| --- | ---: | ---: | --- |
| OE | 5,003 | 10 | captured |
| GPT | 1,373 | 5 | captured |
| DOX | 4,529 | 47 | captured |

These are adapter extraction counts, not independently verified citations or
evidence counts. The receipt proves the application captured all three and its
Gemini request completed. It does not validate clinical correctness or establish
that every captured link supports a claim. The app was left running to preserve
the user's in-memory result.

## Automated checks

At `10a1c95`, 13 unit tests and the Electron smoke flow pass. The smoke flow covers
one service without synthesis, adding second/third without resending, automatic
synthesis, focused tabs versus checkbox comparison, immediate page reset, a second
question, Ask during reset, and explicit two-service synthesis when one is unavailable.
These use synthetic provider pages, not authenticated live-site replicas.

## Remaining live checks

- A second user-driven New session and question, including immediate Ask during reset.
- Incremental one-to-two-to-three service use and explicit partial synthesis.
- User confirmation that GPT remains in the intended clinician workspace.
- Visual review of original-answer completeness and synthesized source attribution.

The quick-Ask fix (`10a1c95`) is packaged under `artifacts/reset-race-build` but
not launched over the completed live run. No native mobile host or Mac companion
network service has been deployed; only the shared responsive renderer exists.
