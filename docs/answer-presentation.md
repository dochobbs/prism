# Answer presentation

Combined answers render Markdown locally with bundled Marked and DOMPurify. Only
prose, heading, list, table, and link elements are allowed. Remote images, scripts,
forms, styles, and model-authored attributes are excluded. HTTPS links open through
the existing source-view action. See the [Marked security guidance](https://marked.js.org/#usage)
and [DOMPurify documentation](https://github.com/cure53/DOMPurify).

The direct answer comes first with a question-shaped outline, not seven mandatory
sections. Optional Clinical pearls follow: zero to three relevant insights, each
explaining why it matters with source attribution. No qualifying insight means no
pearls section. Pearls may be shared, unique, or a clearly labeled inference, but
never unsupported rules of thumb. Essential warnings remain in the direct answer.

Additional insights are organized by topic rather than provider. Material conflicts
stay prominent; no conflict merits a quiet note, not a padded comparison section.
Evidence and detail, References, and legacy Merge note sections are expandable.
Source labels denote provenance, never confidence.

Brief / Standard / Deep control explanation and supporting detail, not safety,
uncertainty, or action-changing conflicts. Existing stored Short / Detailed values
remain compatible. All generated detail is expandable without another API call.

Differences require actual differing positions in the supplied answers. Missing
detail is not disagreement. Unique contributions are useful additions from one
included service, preserving population, setting, and uncertainty; no provider is
favored. Outside medical knowledge must not manufacture a conflict or resolution.

New source captures retain original plain text and an additional Markdown version
derived from observed headings, emphasis, lists, and inline links. The synthesis
packet uses that structured version once, not duplicate copies. Original text and
links remain available. Hidden provider content is not claimed to be captured.

PubMed numeric record URLs differing only by a trailing slash are grouped while
preserving both original URLs. Other domains are not broadly slash-normalized;
shared paper identity is not independent evidence or verified claim support.

Unchanged previous default prompts upgrade automatically; user-customized
templates remain intact. The entire active prompt remains editable in Settings.

The source packet includes an as-of date. The prompt distinguishes publication
dates from season/edition ranges, checks attribution against actual source answers,
and requires preservation of qualifiers rather than turning tentative evidence
into definitive claims. These instructions are not an independent verifier.

Validation: 15 unit checks and the isolated Electron workflow pass, including
unsafe HTML rejection and source heading/list/link preservation. Desktop and phone
screenshots were inspected using synthetic content. New presentation and capture
structure still require verification in the authenticated live build.
