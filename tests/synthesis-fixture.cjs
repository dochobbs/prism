'use strict';
exports.calls = [];
exports.fetcher = async (_url, options) => {
  const body = JSON.parse(options.body);
  exports.calls.push(body);
  const data = body.input.includes('SOURCE DATA (JSON):\n') ? JSON.parse(body.input.split('SOURCE DATA (JSON):\n').at(-1)) : { sources: [] };
  const labels = data.sources.map(s => '[' + s.source + ']').join(' ');
  const text = [
    '## Bottom line',
    '**Synthetic design fixture — not clinical guidance.** The services supply a shared starting point, while their extra details should remain easy to compare. ' + labels,
    'No material disagreement identified in these synthetic answers.',
    '## Clinical pearls',
    '- **Keep the qualifier with the claim.** A concise answer can still explain the limits of the evidence; this helps prevent a tentative finding from reading as a firm conclusion. [OE, GPT, DOX]',
    '## Additional insights',
    '- **DOX only** — Illustrative additional operational detail, placed here so the reader can find it immediately. [DOX](https://example.org/fixture-paper)',
    '- **OE only** — Illustrative context preserved separately from the shared summary. Unique does not mean independently verified. [OE]',
    '## Evidence and detail',
    '### Read each original',
    '- **Source attribution:** Colored labels identify the contributing service, not a confidence score.',
    '- **Keep the limits:** A useful detail should retain its population, setting, and uncertainty.',
    '## Gaps and limitations',
    'This fixture tests API streaming and display, not clinical quality. Preferences received: ' + (body.input.includes('Evidence comparison') ? 'Evidence comparison' : 'Clinical brief') + '.',
    '## References',
    '- [DOX](https://example.org/fixture-paper) Synthetic reference.',
    '## Merge note',
    'Repeated descriptions were consolidated. No independent verification performed.',
  ].join('\n\n');
  return new Response(new ReadableStream({ start(controller) {
    const encode = event => new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
    controller.enqueue(encode({ event_type: 'step.delta', delta: { type: 'text', text: text.slice(0, 70) } }));
    controller.enqueue(encode({ event_type: 'step.delta', delta: { type: 'text', text: text.slice(70) } }));
    controller.enqueue(encode({ event_type: 'interaction.completed', interaction: { status: 'completed', id: 'synthetic-response', model: body.model, usage: { total_tokens: 0 } } }));
    controller.close();
  } }), { headers: { 'Content-Type': 'text/event-stream' } });
};
