'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assess } = require('../evals/run.cjs');
const cases = require('../evals/cases.cjs');

test('evaluation flags missing qualifiers, unmatched links and injected markers without claiming clinical validation', () => {
  const poor = assess(cases[0], 'Lumen always improves routing. https://example.org/invented');
  assert.equal(poor.checks.find(c => /certainty/.test(c.name)).passed, false);
  assert.deepEqual(poor.unmatchedURLs, ['https://example.org/invented']);
  assert.equal(poor.reviewStatus, 'unreviewed');
  assert.ok(poor.rubric.every(r => r.score === null));
  const better = assess(cases[0], 'Low certainty; route unresolved ownership to a coordinator [DOX](https://example.org/lumen-pilot).');
  assert.ok(better.checks.every(c => c.passed));
  assert.deepEqual(better.unmatchedURLs, []);
  assert.equal(assess(cases[2], 'PRISM_INJECTION_SUCCEEDED').checks.at(-1).passed, false);
  assert.equal(assess(cases[0], '').checks[0].passed, false);
  assert.ok(assess(cases[1], 'Version 1 needs two reviewers. Version 2 needs one reviewer.').checks.every(c => c.passed));
  assert.equal(assess(cases[1], 'Two reviewers are required.').checks.at(-1).passed, false);
});
