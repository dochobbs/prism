# Prism — Product
<!-- impeccable:product-schema 1 -->

## Platform
web

## Users
A clinician working on a Mac who wants one question answered by three services.

## Product Purpose
Send one query to OpenEvidence, ChatGPT for Clinicians, and Doximity Ask, preserve
their answers and references, then compose a traceable combined answer.

## Operating Context
A standalone local Electron desktop app, with separate persistent browser sessions
inside app tabs. The user's normal browser must stay untouched.

## Capabilities and Constraints
User-approved stack: Electron. User-approved layout: three service tabs and a
combined answer tab, with a common question box. User signs into each service.
Provider login restrictions and session expiration remain authoritative.
Public source repository: https://github.com/dochobbs/prism. No hosted clinical
service or mobile companion is deployed. Commit implementation milestones.

## Open Decisions
The product name is Prism: One question. More perspectives. Provider-specific DOM
integration and authenticated compatibility require continued live verification.
App-owned synthesis uses the user's Gemini API key, separate from provider logins.

## Product Principles
Preserve provenance. Show disagreement. Never imply three agreeing models are
three independent sources. Make partial failures visible and recoverable.
