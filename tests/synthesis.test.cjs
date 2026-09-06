'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { synthesize, eventDecoder, DEFAULT_SYSTEM, upgradeSystemInstruction } = require('../src/synthesis.cjs');
const { fetcher } = require('./synthesis-fixture.cjs');

test('Prism upgrades only the exact legacy system instruction', () => {
  assert.match(DEFAULT_SYSTEM, /Prism synthesis engine/);
  assert.equal(upgradeSystemInstruction(DEFAULT_SYSTEM.replace('Prism synthesis engine', 'Clinical Council synthesis engine')), DEFAULT_SYSTEM);
  const custom = 'Clinical Council: use my custom preferences.';
  assert.equal(upgradeSystemInstruction(custom), custom);
});

test('Gemini API request pins model and high thinking, disables interaction storage, and streams final answer', async () => {
  const chunks = [];
  const result = await synthesize({ key: 'synthetic-key', model: 'gemini-3.8-flash', prompt: 'Evidence comparison', onDelta: text => chunks.push(text), fetcher: async (url, options) => {
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/interactions?alt=sse');
    assert.equal(options.headers['x-goog-api-key'], 'synthetic-key');
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'gemini-3.8-flash'); assert.equal(body.store, false);
    assert.equal(body.generation_config.thinking_level, 'high');
    return fetcher(url, options);
  } });
  assert.equal(chunks.length, 2); assert.match(result.text, /Evidence comparison/);
});
test('SSE decoder accepts split CRLF delimiters and chunked JSON', () => {
  const events = []; const parse = eventDecoder(e => events.push(e));
  parse('data: {"event_type":"example"}\r'); parse('\n\r'); parse('\n');
  assert.deepEqual(events, [{ event_type: 'example' }]);
});
test('failed and truncated synthesis cannot be reported as complete', async () => {
  await assert.rejects(() => synthesize({ key: 'fixture', model: 'gemini-3.8-flash', prompt: 'test', fetcher: async () => new Response('denied', { status: 403 }) }), /HTTP 403/);
  await assert.rejects(() => synthesize({ key: 'fixture', model: 'gemini-3.8-flash', prompt: 'test', fetcher: async () => new Response('data: {"event_type":"step.delta","delta":{"type":"text","text":"Partial"}}\n\n') }), /without a complete answer/);
});
