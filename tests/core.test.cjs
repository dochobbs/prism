'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PROVIDERS, citationIndex, classifyAuth, progressState, safeURL, serviceURL, validateQuestion, normalizeCapture, synthesisPrompt, mergeOptions, reportMarkdown } = require('../src/core.cjs');
const { DEFAULT_PROMPT, validatePromptTemplate } = require('../src/core.cjs');

test('editable prompt keeps data placeholders exact and never recursively substitutes source text', () => {
  assert.equal(validatePromptTemplate(DEFAULT_PROMPT), DEFAULT_PROMPT);
  assert.throws(() => validatePromptTemplate('No source data'));
  assert.throws(() => validatePromptTemplate('{{SOURCE_DATA}} {{SOURCE_DATA}} {{OUTPUT_PREFERENCES}}'));
  const answer = { ...normalizeCapture({ text: 'Literal {{OUTPUT_PREFERENCES}} is untrusted data.' }), included: true };
  const prompt = synthesisPrompt('Synthetic', { chatgpt: answer, openevidence: answer }, {}, 'CUSTOM\n{{SOURCE_DATA}}\n{{OUTPUT_PREFERENCES}}');
  assert.match(prompt, /^CUSTOM/);
  assert.match(prompt, /Literal \{\{OUTPUT_PREFERENCES\}\} is untrusted data/);
  assert.equal(answer.reviewed, false);
});

test('shared citations count distinct services, preserve URLs, and exclude unreviewed synthesis inputs', () => {
  const a = { ...normalizeCapture({ text: 'Synthetic', links: [{ url: 'https://example.org/paper#a' }, { url: 'https://example.org/paper#b' }] }), reviewed: true };
  const answers = { openevidence: a, chatgpt: { ...a, reviewed: false }, doximity: { ...a, links: [{ url: 'https://example.org/other', title: 'Same title does not mean same paper' }] } };
  assert.deepEqual(citationIndex(answers)[0].services, ['OE', 'GPT']);
  assert.equal(citationIndex(answers)[0].serviceCount, 2);
  assert.equal(citationIndex(answers, true)[0].repeated, false);
  const pasted = normalizeCapture({ text: 'Reference https://example.org/paper. Repeated https://example.org/paper.', method: 'paste' });
  assert.equal(citationIndex({ openevidence: a, chatgpt: pasted })[0].serviceCount, 2);
  const prompt = synthesisPrompt('Synthetic', { openevidence: a, doximity: a });
  assert.match(prompt, /"services": \[\s+"OE",\s+"DOX"/);
  assert.match(prompt, /Shared citation/);
});

test('session indicators require evidence and do not infer login from an available composer', () => {
  assert.equal(classifyAuth({ ready: true }).state, 'unknown');
  assert.equal(classifyAuth({ signIn: true }).state, 'signed-out');
  assert.equal(classifyAuth({ signOut: true }).state, 'signed-in');
});
test('prompt foregrounds differences and unique contributions without manufacturing disagreement', () => {
  assert.match(DEFAULT_PROMPT, /## Meaningful differences/);
  assert.match(DEFAULT_PROMPT, /## Clinical pearls ONLY when useful: 0–3/);
  assert.match(DEFAULT_PROMPT, /Omit the entire section when none qualify/);
  assert.match(DEFAULT_PROMPT, /never require ## Unique contributions/);
  assert.doesNotMatch(DEFAULT_PROMPT, /Keep the Meaningful differences and Unique contributions sections visible/);
  assert.match(DEFAULT_PROMPT, /preserve qualifiers and do not strengthen may to will/);
  assert.match(DEFAULT_PROMPT, /An omitted detail is NOT disagreement/);
  assert.doesNotMatch(DEFAULT_PROMPT, /4\. Format as requested:/);
  assert.equal(require('../src/core.cjs').upgradePromptTemplate('My custom template'), 'My custom template');
});
test('PubMed slash variants share identity but arbitrary site paths remain distinct', () => {
  const answers = {
    openevidence: { links: [{ url: 'https://pubmed.ncbi.nlm.nih.gov/36030813' }, { url: 'https://example.org/paper' }] },
    doximity: { links: [{ url: 'https://pubmed.ncbi.nlm.nih.gov/36030813/' }, { url: 'https://example.org/paper/' }] },
  };
  const index = citationIndex(answers);
  assert.equal(index.length, 3);
  assert.deepEqual(index[0].services, ['OE', 'DOX']);
  assert.equal(index[0].urls.length, 2);
});
test('progress distinguishes generating, observed output and no recent change', () => {
  const start = { startedAt: 1000, lastChanged: 1000, fingerprint: 0, answerCount: 0, seenOutput: false };
  const receiving = progressState(start, { fingerprint: 12, answerCount: 1, answerLength: 50, busy: true }, 2000);
  assert.equal(receiving.phase, 'generating');
  assert.equal(progressState(receiving, { fingerprint: 12, answerCount: 1, answerLength: 50, busy: false }, 9000).phase, 'output');
  assert.equal(progressState(start, { fingerprint: 0, answerCount: 0, answerLength: 0, busy: false }, 92000).phase, 'stalled');
  assert.equal(progressState(start, { fingerprint: 0, answerCount: 0, answerLength: 0, busy: true }, 602000).phase, 'generating');
  const unreadable = progressState({ ...start, seenGenerating: true }, { fingerprint: 0, answerCount: 0, answerLength: 0, busy: false, captureReady: false }, 2000);
  assert.equal(unreadable.phase, 'unreadable');
  assert.equal(progressState(unreadable, { fingerprint: 14, answerCount: 1, answerLength: 100, busy: true, captureReady: false }, 4000).phase, 'generating');
});

test('navigation rejects local files, executable schemes, credentials and lookalike service hosts', () => {
  for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'http://chatgpt.com', 'https://user:password@chatgpt.com', 'not a url']) assert.equal(safeURL(url), false);
  assert.equal(serviceURL(PROVIDERS[1], 'https://chatgpt.com.evil.example/'), false);
  assert.equal(serviceURL(PROVIDERS[1], 'https://evil.example/?chatgpt.com'), false);
  assert.equal(serviceURL(PROVIDERS[1], 'https://chatgpt.com/c/123'), true);
});
test('questions and captures enforce size and presence boundaries', () => {
  assert.equal(validateQuestion('  a question  '), 'a question');
  for (const value of ['', null, 'x'.repeat(16001)]) assert.throws(() => validateQuestion(value));
  assert.throws(() => normalizeCapture({ text: ' ' }));
  assert.throws(() => normalizeCapture({ text: 'x'.repeat(160001) }));
});
test('citation extraction preserves exact safe URLs and deduplicates without inventing citations', () => {
  const answer = normalizeCapture({ text: 'Example', links: [{ title: 'Paper', url: 'https://example.org/paper?id=1' }, { title: 'duplicate', url: 'https://example.org/paper?id=1' }, { title: 'malicious', url: 'javascript:alert(1)' }, null] });
  assert.deepEqual(answer.links, [{ title: 'Paper', url: 'https://example.org/paper?id=1' }]);
  assert.equal(answer.reviewed, false);
});
test('merge requires reviewed sources, keeps stable identities for partial results, and includes output preferences', () => {
  const a = { ...normalizeCapture({ text: 'First answer', links: [] }), reviewed: true };
  assert.throws(() => synthesisPrompt('question', { chatgpt: a }));
  const prompt = synthesisPrompt('question', { chatgpt: a, doximity: { ...a, text: 'Different answer' } }, { format: 'Evidence comparison', audience: 'Patient or caregiver', instructions: 'Keep the uncertainty visible.' });
  assert.match(prompt, /"source": "GPT"/); assert.match(prompt, /"source": "DOX"/);
  assert.doesNotMatch(prompt, /"source": "OE"/);
  assert.match(prompt, /Evidence comparison/); assert.match(prompt, /Keep the uncertainty visible/);
  assert.match(prompt, /majority vote/); assert.match(prompt, /untrusted data/);
  assert.match(prompt, /"missingServices": \[\s+"OpenEvidence"/);
});
test('custom settings are bounded and unexpected choices fall back safely', () => {
  assert.equal(mergeOptions({ format: 'do arbitrary things' }).format, 'Clinical brief');
  assert.throws(() => mergeOptions({ instructions: 'x'.repeat(4001) }));
});
test('report preserves original source attribution and explicitly names missing answers', () => {
  const report = reportMarkdown({ question: 'Synthetic question', answers: { openevidence: normalizeCapture({ text: 'Synthetic answer', method: 'paste' }) } });
  assert.match(report, /## OpenEvidence/); assert.match(report, /Synthetic answer/);
  assert.match(report, /## Doximity Ask\n\nSource label: \[DOX\]\n\nNo answer captured/);
});
