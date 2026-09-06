# Capture and synthesize — September 5, 2026

Current workflow supersedes the original manual-review-first prototype:

1. Sign in within each isolated service tab and select services using the tab checkboxes.
2. Ask the shared question. Tabs show sending, waiting, generation, answer availability, or an explicit failure.
3. Finished answers are captured automatically. One requested service stays a direct answer; two or three automatically call Gemini once all requested answers are captured and an API key is configured. The explicit synthesis control can use a ready subset without waiting for the remaining service.
4. Review the generated result and retained source record. Capturing is not independent verification or clinician review.

## Slow responses

Waiting for source answers has no automatic short timeout. Every selected service
is observed separately, with elapsed time and an activity indicator. Capture
uses answer-local completion controls or, without detected generation, a
two-second text-stability fallback. This is a DOM heuristic, not a provider completion API.
An answer unchanged from the pre-send baseline is not automatically consumed.
Cancel waiting leaves provider generation alone and retains captured originals.
Gemini's separate API request still has a three-minute transport timeout.

The background observer continues watching long pauses rather than declaring
failure at 90 seconds. Explicit busy signals remain Generating even after a long
pause. Unsupported extraction is not treated as a successful empty answer.

## Prompt editing

Synthesis settings contains Shape the answer, the editable system instruction,
and the complete editable merge template. Keep exactly one
`{{OUTPUT_PREFERENCES}}` and `{{SOURCE_DATA}}` placeholder. Save synthesis
instructions to apply and persist locally. Restore defaults changes the editor;
save to apply the reset. API credentials are configured separately.

The merge template and system instruction are recorded with synthesis provenance.
The source data is populated at invocation, not persisted in the settings file.
Do not put patient information in reusable instructions.

## Session controls

Checkboxes choose providers; a service tab focuses only that service. Live services
shows selected services side by side. Add providers to the same question without
resending to completed or in-flight providers. New session clears the in-memory
source record and resets provider conversations while retaining login profiles.
Export before resetting or quitting if you need to retain the answers.

## Verification and limitations

The unit and synthetic Electron checks cover dispatch, capture, incremental
providers, session resets, prompt editing, and source isolation. They do not prove
compatibility with every current authenticated service page. The historical
[live verification receipt](live-verification-2026-09-05.md) records a real
three-provider capture and completed synthesis, not clinical correctness or
complete capture of every hidden citation. Provider DOM changes and background
generation behavior remain integration risks.

To obtain the evidence needed for a precise adapter fix, the service toolbar has
Export page diagnostics. It exports rendered structural tags/classes/roles,
test IDs, lengths and counts, without field values, answer text, account labels,
cookies or conversation URLs. Review the JSON before sharing because page-defined
attribute values are not guaranteed free of identifying information.

No everyday browser sessions were accessed and no login controls were bypassed.
