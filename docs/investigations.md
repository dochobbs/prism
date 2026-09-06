# Prism investigation backlog

Recorded September 5, 2026. These are investigations, not committed architecture
choices or implemented capabilities. Order follows the clinician's requested list.

## 1. Mobile experience

Status: [architecture investigation started](mobile-direction.md); waiting on
whether a Mac-backed companion is acceptable before enabling remote access.

- Compare a PWA connected to the Mac app, a standalone mobile app, and other viable approaches. Do not assume another Electron build solves mobile execution.
- Determine where authenticated provider sessions, answer capture, and synthesis run; a phone-sized interface alone is not the complete mobile experience.
- Investigate provider login compatibility, background generation, connection loss, secure pairing, API-key storage, and whether the Mac must remain open and online.
- Deliverable: a recommended architecture and a small end-to-end phone prototype, with explicit privacy, latency, and installation tradeoffs.

## 2. Additional CDS providers

- Candidates: UpToDate, Glass, AMBOSS, and Vera. Confirm the exact product intended by Vera before integration work.
- Assess supported APIs or permitted web integration, account/subscription requirements, authentication, question dispatch, completion detection, answer/citation capture, and terms of use.
- Explore an adapter interface that can add providers without hardcoding three services throughout the session, selection, attribution, and synthesis UI.
- Deliverable: a feasibility matrix and one narrowly scoped integration recommendation. Do not assume these services are free or authorize access-control bypasses.

## 3. Automated evaluations

Status: [initial synthesis replay/live harness](synthesis-evals.md) implemented.
Fictional regression probes are not yet a clinician-approved clinical benchmark.

- Start with a small, clinician-reviewed synthetic/non-patient question set covering definitions, management decisions, dosing, ambiguity, conflicting sources, and useful unique contributions.
- Separate provider automation reliability, capture completeness, and synthesis quality. Record source snapshots, prompt/model versions, detail level, latency, and API cost so regressions are traceable.
- Use deterministic checks where possible, model-assisted grading where useful, and clinician adjudication for clinical quality; do not treat a model judge as ground truth.
- Compare the synthesis against each individual source: does it answer directly, preserve safety qualifiers and uncertainty, correctly attribute claims, avoid unsupported additions, and add useful information without unnecessary length?
- Investigate repeatable live-provider runs separately from offline replay; respect provider limits and permissions. Keep sensitive outputs and credentials out of Git.
- Deliverable: a lightweight replay harness, baseline scorecard, and a repeatable comparison of prompt/model changes—not a large testing framework before useful results.

Related groundwork: [architecture](architecture.md) and
[answer presentation](answer-presentation.md).
