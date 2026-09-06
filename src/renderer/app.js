'use strict';
const $ = id => document.getElementById(id);
let current;
let lastAnswers = '';
let settingsOpen = false;
let readyKey = '';
let seenSession = null;
let lastActive = null;
let hadSynthesis = false;
const selectedIds = () => [...document.querySelectorAll('[data-provider]:checked')].map(el => el.dataset.provider);
const readyIds = () => [...document.querySelectorAll('[data-ready]:checked')].map(el => el.dataset.ready);

function notice(text, error = false) { $('notice').textContent = text; $('notice').classList.toggle('error', error); }
async function action(name, payload) {
  try {
    const result = await window.council.invoke(name, payload);
    if (!result.ok) { notice(result.error, true); return false; }
    if (result.state) render(result.state);
    return true;
  } catch (error) { notice(error.message, true); return false; }
}
function button(text, fn, className = '') {
  const el = document.createElement('button'); el.textContent = text; el.className = className;
  el.addEventListener('click', fn); return el;
}
function references(target, links) {
  target.replaceChildren(...links.map(link => {
    const row = document.createElement('div'); row.className = 'citation-row';
    row.append(button(link.title || link.url, () => action('open-source', link.url)));
    const match = current.citations.find(c => c.urls.includes(link.url));
    if (match?.repeated) row.append(citationBadge(match));
    return row;
  }));
}
function citationBadge(c) {
  const badge = document.createElement('span'); badge.className = 'citation-badge';
  badge.textContent = `Shared citation · ${c.services.join(' + ')} · ${c.serviceCount} services`;
  badge.title = 'Matching URL or exact PubMed record, including trailing-slash variants. Not independent evidence or verified claim support.';
  return badge;
}
function renderAnswers(s) {
  const key = JSON.stringify([s.run.answers, s.run.combined, s.statuses]);
  if (key === lastAnswers) return;
  // Preserve a manual paste draft while service status updates arrive.
  const drafts = Object.fromEntries([...document.querySelectorAll('.paste-form textarea')].map(el => [el.dataset.provider, el.value]));
  const opened = new Set([...document.querySelectorAll('.source-entry details[open]')].map(el => el.dataset.provider));
  lastAnswers = key;
  $('answers').replaceChildren();
  const available = s.providers.filter(p => s.run.answers[p.id]);
  $('source-jumps').hidden = !available.length;
  $('source-jumps').replaceChildren(...available.map(p => button(`Read ${p.code}`, () => $(`answer-${p.id}`).scrollIntoView({ block: 'start' }))));
  s.providers.forEach((p, index) => {
    const answer = s.run.answers[p.id];
    const entry = document.createElement('article'); entry.id = `answer-${p.id}`; entry.className = `source-entry ${['oe', 'gpt', 'dox'][index]}`;
    const heading = document.createElement('div'); heading.className = 'source-heading';
    const title = document.createElement('h2');
    const code = document.createElement('span'); code.className = 'source-code'; code.textContent = p.code;
    title.append(code, p.name); heading.append(title, button('Open service', () => action('select', p.id), 'quiet'));
    const status = document.createElement('p'); status.className = 'source-status'; status.textContent = s.statuses[p.id];
    entry.append(heading, status);
    if (answer) {
      const text = document.createElement('div'); text.className = 'answer-text';
      if (answer.markdown || answer.method === 'paste') window.renderCouncilAnswer(text, answer.markdown || answer.text, url => action('open-source', url));
      else text.textContent = answer.text;
      entry.append(text);
      const referenceDetails = document.createElement('details');
      const referenceSummary = document.createElement('summary'); referenceSummary.textContent = 'Captured reference links (' + answer.links.length + ')';
      const links = document.createElement('div'); links.className = 'references'; references(links, answer.links);
      referenceDetails.append(referenceSummary, links); entry.append(referenceDetails);
      const method = document.createElement('p'); method.className = 'hint'; method.textContent = `${answer.method === 'paste' ? 'Pasted manually · include reference URLs in the text' : `Captured from ${answer.url}`} · ${new Date(answer.capturedAt).toLocaleTimeString()}`; entry.append(method);
    } else {
      const hint = document.createElement('p'); hint.className = 'hint'; hint.textContent = (s.run.requestedIds || []).includes(p.id) ? 'Waiting for this service. You can read its response as it arrives in the service tab.' : 'Not asked in this session. Select this service above, then add it to the same question.'; entry.append(hint);
    }
    const details = document.createElement('details'); details.dataset.provider = p.id; details.open = opened.has(p.id);
    const summary = document.createElement('summary'); summary.textContent = answer ? 'Replace with a pasted answer' : 'Paste an answer manually';
    const form = document.createElement('div'); form.className = 'paste-form';
    const field = document.createElement('textarea'); field.rows = 5; field.maxLength = 160000; field.dataset.provider = p.id; field.setAttribute('aria-label', `${p.name} answer including references`); field.placeholder = 'Paste the complete answer and its reference URLs.'; field.value = drafts[p.id] || '';
    form.append(field, button('Save source answer', () => action('paste', { id: p.id, text: field.value })));
    details.append(summary, form); entry.append(details); $('answers').append(entry);
  });
  $('combined-result').hidden = !s.run.combined;
  if (s.run.combined) { window.renderCouncilAnswer($('combined-text'), s.run.combined.text, url => action('open-source', url)); references($('combined-links'), s.run.combined.links); }
}
function resize() {
  if (!current || ['review', 'combined'].includes(current.active) || settingsOpen) return;
  const rect = $('browser-slot').getBoundingClientRect();
  window.council.invoke('bounds', { x: rect.x, y: rect.y, width: rect.width, height: rect.height });
}
function render(s) {
  current = s;
  if (seenSession !== s.run.id) { seenSession = s.run.id; readyKey = ''; if (!s.run.question) $('question').value = ''; }
  if (s.run.question) $('question').value = s.run.question;
  document.body.classList.toggle('session-started', Boolean(s.run.question));
  $('question-summary').textContent = s.run.question;
  $('question-full').textContent = s.run.question;
  document.querySelectorAll('[data-tab]').forEach(el => { const selected = el.dataset.tab === s.active; el.classList.toggle('active', selected); if (selected) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current'); });
  if (lastActive !== s.active) {
    lastActive = s.active;
    requestAnimationFrame(() => {
      const tab = document.querySelector('[data-tab].active');
      const strip = document.querySelector('.tabs');
      if (!tab || !strip) return;
      const target = tab.getBoundingClientRect(), viewport = strip.getBoundingClientRect();
      if (target.left < viewport.left) strip.scrollLeft += target.left - viewport.left;
      else if (target.right > viewport.right) strip.scrollLeft += target.right - viewport.right;
    });
  }
  $('review').hidden = settingsOpen || s.active !== 'review'; $('browser').hidden = settingsOpen || ['review', 'combined'].includes(s.active);
  $('synthesis-page').hidden = settingsOpen || s.active !== 'combined'; $('api-settings').hidden = !settingsOpen;
  $('service-status').textContent = s.statuses[s.active] || '';
  const live = s.active === 'workspace';
  $('service-controls').hidden = live;
  $('live-services').hidden = live || (s.run.requestedIds || []).length < 2;
  if (live) $('service-status').textContent = 'Checked services are shown together. Click a named tab to view only that service.';
  document.querySelectorAll('[data-session]').forEach(el => {
    const session = s.auth[el.dataset.session]; el.textContent = session.label; el.className = `session-status ${session.state}`; el.title = session.reason;
    let progress = el.parentElement.querySelector('.tab-activity');
    if (!progress) { progress = document.createElement('span'); el.parentElement.append(progress); }
    const activity = s.activity[el.dataset.session];
    progress.className = `tab-activity ${activity?.phase || ''}`; progress.textContent = activity?.label || '';
  });
  const currentAuth = s.auth[s.active];
  $('confirm-auth').hidden = !currentAuth || ['signed-in', 'confirmed'].includes(currentAuth.state);
  if (s.promptPreview) $('prompt-preview').textContent = s.promptPreview;
  renderAsk();
  $('question').readOnly = Boolean(s.run.question); $('question').disabled = s.busy && !s.run.question;
  ['capture', 'home', 'retry'].forEach(id => { $(id).disabled = s.busy; });
  $('retry').hidden = s.active === 'combined';
  const count = Object.keys(s.run.answers).length;
  $('count').textContent = s.run.question ? `${count} / ${(s.run.requestedIds || []).length || count} answers ready` : 'Choose services above';
  $('packet').disabled = s.busy || count < 2;
  renderReady(s);
  $('cancel-synthesis').hidden = !s.capturing && s.run.combined?.status !== 'streaming';
  $('cancel-synthesis').textContent = s.capturing ? 'Cancel waiting' : 'Cancel synthesis';
  $('synthesis-status').textContent = s.statuses.synthesis;
  $('synthesis-requirements').textContent = (s.run.requestedIds || []).length === 1 ? 'One service: read its answer directly in its tab. Add another service above whenever you want a comparison.' : `Selected services are collected automatically, then sent to Gemini for synthesis. No independent citation verification. ${s.api.configured ? '' : 'Add your API key in Synthesis settings.'}`;
  window.renderCouncilAnswer($('synthesis-output'), s.run.combined?.text || '', url => action('open-source', url));
  const hasSynthesis = Boolean(s.run.combined?.text);
  document.body.classList.toggle('has-synthesis', hasSynthesis);
  if (hasSynthesis !== hadSynthesis) { hadSynthesis = hasSynthesis; $('ready-controls').open = !hasSynthesis; }
  if (s.run.combined?.sourcesChanged) $('synthesis-status').textContent += ' Additional source ready; regenerate to include it.';
  const shared = (s.run.combined?.citations || []).filter(c => c.repeated);
  $('shared-citations').hidden = !shared.length;
  $('shared-citation-list').replaceChildren(...shared.map(c => {
    const row = document.createElement('div'); row.className = 'citation-row';
    row.append(button(c.title, () => action('open-source', c.urls[0])), citationBadge(c)); return row;
  }));
  $('key-status').textContent = s.api.configured ? `API key configured · ${s.api.model} · thinking: ${s.api.thinking}` : 'No Gemini API key configured.';
  if (s.run.combined?.status === 'incomplete') $('synthesis-status').textContent = `INCOMPLETE — ${s.statuses.synthesis}`;
  renderAnswers(s);
  requestAnimationFrame(resize);
}
function renderAsk() {
  if (!current) return;
  const requested = current.run.requestedIds || [];
  const ids = selectedIds().filter(id => !requested.includes(id));
  const started = Boolean(current.run.question);
  document.body.classList.toggle('can-add-services', started && ids.length > 0);
  $('ask').disabled = current.busy || !ids.length;
  $('ask').textContent = current.busy ? 'Working…' : started ? (ids.length ? `Add ${ids.length} service${ids.length === 1 ? '' : 's'}` : 'Selected services asked') : `Ask ${ids.length} service${ids.length === 1 ? '' : 's'}`;
  $('session-hint').textContent = started ? 'Same question, more perspectives: check another service and add it. Use New session for a different question.' : 'Choose one, two, or three services below. Two or more answers are combined automatically.';
}
function renderReady(s) {
  const providers = s.providers.filter(p => s.run.answers[p.id]);
  const key = JSON.stringify([s.run.id, providers.map(p => p.id)]);
  if (key !== readyKey) {
    const previous = new Map([...document.querySelectorAll('[data-ready]')].map(el => [el.dataset.ready, el.checked]));
    readyKey = key;
    $('ready-options').replaceChildren(...providers.map(p => {
      const label = document.createElement('label'); const check = document.createElement('input');
      check.type = 'checkbox'; check.dataset.ready = p.id; check.checked = previous.get(p.id) ?? true;
      check.addEventListener('change', () => renderReady(current)); label.append(check, p.code); return label;
    }));
  }
  $('ready-controls').hidden = !providers.length;
  const ids = readyIds();
  $('force-synthesis').disabled = s.busy || !ids.length;
  $('force-synthesis').textContent = ids.length === 1 ? `View ${s.providers.find(p => p.id === ids[0]).code} answer` : `Synthesize ${ids.length} ready answers`;
}
function options() { return Object.fromEntries(['format', 'length', 'audience', 'priority', 'instructions'].map(k => [k, $(k).value])); }
document.querySelectorAll('[data-tab]').forEach(el => el.addEventListener('click', () => { settingsOpen = false; action('select', el.dataset.tab); }));
$('ask').addEventListener('click', async () => {
  const ids = selectedIds().filter(id => !(current?.run.requestedIds || []).includes(id));
  notice('Sending to selected services…');
  if (await action('run', { question: current?.run.question || $('question').value, ids })) notice('Session started. Read each service in its tab; two or more answers combine automatically.');
});
document.querySelectorAll('[data-provider]').forEach(el => el.addEventListener('change', () => {
  renderAsk(); settingsOpen = false; action('select-providers', selectedIds());
}));
$('new-session').addEventListener('click', async () => {
  if (current?.run.question && !confirm('Start a new session? Current work will be cleared. Export the report first if you want to keep it. Service logins will stay signed in.')) return;
  if (await action('new-session', { discard: true })) { settingsOpen = false; $('question').value = ''; render(current); $('question').focus(); notice('New session ready. Logins are preserved.'); }
});
$('copy').addEventListener('click', async () => { if (await action('copy-question', $('question').value)) notice('Question copied.'); });
$('export').addEventListener('click', () => action('export'));
$('home').addEventListener('click', () => action('home', current.active));
$('live-services').addEventListener('click', () => action('select', 'workspace'));
$('reload').addEventListener('click', () => action('reload', current.active));
$('retry').addEventListener('click', () => action('retry', current.active));
$('capture').addEventListener('click', () => action('capture', current.active));
$('check-auth').addEventListener('click', () => action('check-auth', current.active));
$('confirm-auth').addEventListener('click', () => action('confirm-auth', current.active));
$('preview').addEventListener('click', () => action('preview-prompt', options()));
$('force-synthesis').addEventListener('click', () => readyIds().length === 1 ? action('select', readyIds()[0]) : action('synthesize-ready', { ids: readyIds() }));
$('return-review').addEventListener('click', () => action('select', 'review'));
$('cancel-synthesis').addEventListener('click', () => action('cancel-synthesis'));
$('settings').addEventListener('click', async () => {
  await action('select', 'review'); settingsOpen = true; $('api-model').value = current.api.model;
  for (const [key, value] of Object.entries(current.merge)) $(key).value = value;
  $('prompt-template').value = current.promptTemplate; $('system-instruction').value = current.systemInstruction;
  render(current);
});
$('save-prompt').addEventListener('click', async () => {
  if (await action('save-synthesis-settings', { merge: options(), promptTemplate: $('prompt-template').value, systemInstruction: $('system-instruction').value })) notice('Synthesis instructions saved locally.');
});
$('reset-prompt').addEventListener('click', () => { $('prompt-template').value = current.defaultPrompt; $('system-instruction').value = current.defaultSystem; notice('Default instructions restored in the editor. Save to apply.'); });
$('diagnose').addEventListener('click', () => action('diagnose-service', current.active));
$('close-settings').addEventListener('click', () => { settingsOpen = false; render(current); });
$('save-api').addEventListener('click', async () => { if (await action('configure-api', { model: $('api-model').value.trim(), key: $('api-key').value.trim() })) { $('api-key').value = ''; notice('Gemini synthesis settings saved.'); } });
$('packet').addEventListener('click', async () => { if (await action('copy-packet', options())) notice('Synthesis prompt copied, with source answers and your format preferences.'); });
window.addEventListener('resize', resize);
new ResizeObserver(resize).observe($('browser-slot'));
window.council.onState(render);
(async () => {
  await action('state');
})();
