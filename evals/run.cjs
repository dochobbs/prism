'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { normalizeCapture, synthesisPrompt, DEFAULT_PROMPT, mergeOptions, validateQuestion, PROVIDERS } = require('../src/core.cjs');
const { synthesize, DEFAULT_SYSTEM } = require('../src/synthesis.cjs');
const builtins = require('./cases.cjs');

const rubric = [
  'Directness and readability', 'Claim fidelity and source attribution',
  'Safety qualifiers, uncertainty, population and scope preservation',
  'Meaningful conflict handling without majority vote',
  'Useful added information compared with the best individual source',
  'Appropriate detail without repetition or forced pearls',
];
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

function assess(testCase, text) {
  const allowed = new Set(Object.values(testCase.sources).flatMap(s => (s.match(/https:\/\/[^\s<>]+/g) || []).map(u => u.replace(/[.,;]+$/, ''))));
  const urls = [...new Set((text.match(/https?:\/\/[^\s<>\])]+/g) || []).map(u => u.replace(/[.,;]+$/, '')))];
  return {
    characters: [...text].length, words: text.trim() ? text.trim().split(/\s+/).length : 0,
    sourceCharacters: Object.fromEntries(Object.entries(testCase.sources).map(([id, s]) => [id, [...s].length])),
    checks: [
      { name: 'Nonempty answer', passed: Boolean(text.trim()) },
      ...(testCase.checks || []).map(([name, pattern]) => ({ name, passed: new RegExp(pattern, 'i').test(text) })),
      ...(testCase.forbidden || []).map(value => ({ name: `No forbidden fixture marker: ${value}`, passed: !text.includes(value) })),
    ],
    // Exact URL differences are review flags, not proof of invented citations.
    unmatchedURLs: urls.filter(url => !allowed.has(url)),
    reviewStatus: 'unreviewed', rubric: rubric.map(dimension => ({ dimension, score: null, evidence: null })),
    reviewQuestions: testCase.review || [],
  };
}

async function main(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--live') args.live = true;
    else if (['--replay', '--replay-run', '--cases', '--length', '--model', '--template', '--system'].includes(flag) && argv[i + 1] && !argv[i + 1].startsWith('--')) args[flag.slice(2)] = argv[++i];
    else throw new Error('Usage: npm run eval:synthesis -- [--live | --replay answers.json] [--cases cases.json] [--length Short|Standard|Detailed] [--model ID] [--template prompt.txt] [--system system.txt]');
  }
  if ([args.live, args.replay, args['replay-run']].filter(Boolean).length > 1) throw new Error('Choose only one generation/replay mode.');
  if (args.length && !['Short', 'Standard', 'Detailed'].includes(args.length)) throw new Error('Length must be Short, Standard, or Detailed.');
  const cases = args.cases ? JSON.parse(await fs.readFile(args.cases, 'utf8')) : builtins;
  if (!Array.isArray(cases) || !cases.length) throw new Error('Cases must be a nonempty array.');
  const ids = new Set();
  for (const c of cases) {
    if (!/^[a-z0-9-]{1,80}$/.test(c.id) || ids.has(c.id) || !c.sources || Object.values(c.sources).some(s => typeof s !== 'string')) throw new Error('Each case needs a unique safe ID and string-valued sources.');
    ids.add(c.id);
    validateQuestion(c.question);
    if (Object.keys(c.sources).some(id => !PROVIDERS.some(p => p.id === id))) throw new Error('Unknown source provider ID.');
    for (const [, pattern] of c.checks || []) new RegExp(pattern, 'i');
  }
  const replay = args.replay ? JSON.parse(await fs.readFile(args.replay, 'utf8')) : args['replay-run'] ? {} : null;
  if (args['replay-run']) {
    for (const c of cases) {
      const saved = JSON.parse(await fs.readFile(path.join(args['replay-run'], `${c.id}.json`), 'utf8'));
      if (saved.case.question !== c.question || JSON.stringify(saved.case.sources) !== JSON.stringify(c.sources)) throw new Error('Replay source snapshots do not match.');
      replay[c.id] = saved.result?.text;
    }
  }
  if (replay && cases.some(c => typeof replay[c.id] !== 'string')) throw new Error('Replay must map every case ID to its answer text.');
  const key = args.live ? process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY : null;
  if (args.live && !key) throw new Error('Live eval requires GEMINI_API_KEY or GOOGLE_API_KEY; no app key/profile is read.');
  const template = args.template ? await fs.readFile(args.template, 'utf8') : DEFAULT_PROMPT;
  const system = args.system ? await fs.readFile(args.system, 'utf8') : DEFAULT_SYSTEM;
  if (!system.trim() || system.length > 12000) throw new Error('Invalid system instruction length.');
  const model = args.model || 'gemini-3.8-flash';
  const options = mergeOptions({ length: args.length || 'Standard' });
  // Validate every prompt before any paid API request.
  const prepared = cases.map(c => {
    const answers = Object.fromEntries(Object.entries(c.sources).map(([id, text]) => [id, { ...normalizeCapture({ text, method: 'paste' }), included: true }]));
    return { c, prompt: synthesisPrompt(c.question, answers, options, template) };
  });
  const root = path.resolve(__dirname, '../artifacts/evals');
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  const dir = await fs.mkdtemp(path.join(root, 'run-'));
  const report = { createdAt: new Date().toISOString(), mode: args.live ? 'live' : replay ? 'replay' : 'prepare',
    model: args.live ? model : null, intendedModel: model, thinking: 'high', options, replayOf: args['replay-run'] ? path.resolve(args['replay-run']) : null,
    templateHash: hash(template), systemHash: hash(system), casesHash: hash(JSON.stringify(cases)),
    warning: 'Lexical checks are not semantic or clinical validation. Human review is required. Replay generation provenance is unknown.', cases: [] };
  for (const { c, prompt } of prepared) {
    const started = Date.now();
    const item = { id: c.id, status: 'prepared', promptHash: hash(prompt) };
    let result;
    try {
      result = args.live ? await synthesize({ key, model, prompt, systemInstruction: system }) : replay ? { text: replay[c.id] } : null;
      if (result) Object.assign(item, { status: 'completed', assessment: assess(c, result.text), usage: result.usage || null, responseId: result.responseId || null });
    } catch {
      // Never echo source content, credentials, or arbitrary API exception bodies.
      item.status = 'failed'; item.error = 'Generation failed; inspect API access, quota, model and transport. No retry made.';
      process.exitCode = 1;
    }
    item.generationMs = args.live ? Date.now() - started : null;
    item.costUSD = null; // No pricing assumptions; usage retained for later costing.
    await fs.writeFile(path.join(dir, `${c.id}.json`), JSON.stringify({ case: c, prompt, system, result, ...item }, null, 2), { mode: 0o600 });
    report.cases.push(item);
    console.log(`${c.id}: ${item.status}`);
  }
  await fs.writeFile(path.join(dir, 'report.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(`Local evaluation artifacts: ${dir}`);
  if (!args.live && !replay) console.log('Prepared only: no model called, no answer quality evaluated.');
}

if (require.main === module) main(process.argv.slice(2)).catch(() => {
  console.error('Evaluation setup failed. Check arguments, case/replay schema, prompt placeholders, and environment key for --live. No exception content is printed to protect local data.');
  process.exitCode = 1;
});
module.exports = { assess };
