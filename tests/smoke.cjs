'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { PROVIDERS } = require('../src/core.cjs');
const apiFixture = require('./synthesis-fixture.cjs');

// Synthetic structure, not a claim to mirror authenticated service DOM.
function fixture(name, broken = false) {
  return `<!doctype html><html><body><h1>Synthetic ${name}</h1>
    ${broken ? '<a href="/login">Sign in</a>' : `<button id="new" aria-label="New chat">New chat</button>
    <form><textarea aria-label="Question"></textarea><button type="submit" aria-label="Send">↑</button></form><div id="thread" class="brandable--wrapper gpt-chat-response-history-responses"></div>
    <script>
      window.sendCount = 0;
      document.getElementById('new').onclick = () => { document.getElementById('thread').replaceChildren(); document.querySelector('textarea').value = ''; };
      document.querySelector('form').onsubmit = event => {
        event.preventDefault(); window.sendCount++;
        const question = document.querySelector('textarea').value;
        const main = document.getElementById('thread');
        const user = document.createElement('div'); user.dataset.messageAuthorRole = 'user'; user.textContent = question; main.append(user);
        const answer = document.createElement('${name}' === 'Doximity Ask' ? 'div' : 'article');
        if ('${name}' === 'Doximity Ask') answer.className = 'gpt-answers-assistant-base';
        else if ('${name}' !== 'OpenEvidence') answer.dataset.messageAuthorRole = 'assistant';
        main.append(answer);
        main.setAttribute('aria-busy', 'true'); document.querySelector('textarea').value = '';
        setTimeout(() => {
          answer.textContent = 'Synthetic answer from ${name}. Question: ' + question;
          const link = document.createElement('a'); link.href = 'https://example.org/fixture-paper'; link.textContent = 'Synthetic reference'; answer.append(link);
          const heading = document.createElement('h3'); heading.textContent = 'Synthetic details'; answer.append(heading);
          const list = document.createElement('ul'); const item = document.createElement('li'); item.textContent = 'Preserve the complete source detail'; list.append(item); answer.append(list);
          const copy = document.createElement('button'); copy.setAttribute('aria-label', 'Copy answer'); copy.textContent = 'Copy'; answer.append(copy);
          main.removeAttribute('aria-busy');
        }, 150);
      };
    </script>`}</body></html>`;
}

exports.run = async ({ app, win, getView, dispatch, state, operate, LOCAL }) => {
  const out = path.join(app.getAppPath(), 'artifacts'); await fs.mkdir(out, { recursive: true });
  const waitFor = async (predicate, label, timeout = 12000) => {
    const start = Date.now();
    while (!predicate()) {
      if (Date.now() - start > timeout) throw new Error(`Timed out: ${label}; ${JSON.stringify(state().statuses)}`);
      await new Promise(resolve => setTimeout(resolve, 30));
    }
  };
  const screenshot = async name => {
    await win.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    await fs.writeFile(path.join(out, name), (await win.webContents.capturePage()).toPNG());
  };
  assert.equal(win.webContents.getURL(), LOCAL + 'index.html');
  const renderCheck = await win.webContents.executeJavaScript(`(() => {
    const target = document.createElement('div');
    renderCouncilAnswer(target, '## Bottom line\\n\\n**Bold** [OE](https://example.org/paper)\\n\\n<img src=x onerror=alert(1)><script>alert(1)</script>\\n\\n[bad](javascript:alert(1))\\n\\n## References\\n\\nReference text', () => {});
    return { heading: !!target.querySelector('h2'), bold: !!target.querySelector('strong'), badge: !!target.querySelector('.source-oe'), unsafe: !!target.querySelector('img,script,[onerror],a[href^="javascript:"]'), folded: !!target.querySelector('details:not([open])') };
  })()`);
  assert.deepEqual(renderCheck, { heading: true, bold: true, badge: true, unsafe: false, folded: true });
  for (const p of PROVIDERS) {
    const view = getView(p.id);
    view.webContents.session.protocol.handle('https', () => new Response(fixture(p.name), { headers: { 'Content-Type': 'text/html' } }));
    await view.webContents.loadURL(p.url);
    assert.equal(await view.webContents.executeJavaScript('typeof require'), 'undefined');
    assert.equal(await view.webContents.executeJavaScript('typeof window.council'), 'undefined');
    assert.equal(view.webContents.session.isPersistent(), true);
    assert.equal(typeof view.getVisible(), 'boolean');
  }
  assert.equal(new Set(PROVIDERS.map(p => getView(p.id).webContents.session)).size, 3);
  await dispatch('select-providers', ['openevidence', 'doximity']);
  assert.equal(getView('openevidence').getVisible(), true);
  assert.equal(getView('doximity').getVisible(), true);
  assert.equal(getView('chatgpt').getVisible(), false);
  await dispatch('select', 'openevidence');
  assert.equal(getView('doximity').getVisible(), false);
  await dispatch('select-providers', ['chatgpt']);
  assert.equal(getView('chatgpt').getVisible(), true);
  assert.equal(getView('openevidence').getVisible(), false);
  await dispatch('select', 'review');
  await screenshot('desktop-empty.png');
  await dispatch('save-synthesis-settings', { merge: { format: 'Evidence comparison', length: 'Short' }, promptTemplate: state().promptTemplate, systemInstruction: state().systemInstruction });

  await dispatch('run', { question: 'Synthetic comparison question', ids: ['openevidence'] });
  await waitFor(() => Boolean(state().run.answers.openevidence), 'single source auto-capture');
  assert.equal(state().run.combined, null);
  assert.equal(apiFixture.calls.length, 0);
  assert.equal(state().run.answers.openevidence.reviewed, false);
  assert.doesNotMatch(state().run.answers.openevidence.text, /Copy/);
  assert.match(state().run.answers.openevidence.markdown, /### Synthetic details/);
  assert.match(state().run.answers.openevidence.markdown, /- Preserve the complete source detail/);
  assert.match(state().run.answers.openevidence.markdown, /\[Synthetic reference\]\(<https:\/\/example.org\/fixture-paper>\)/);
  const firstSession = state().run.id;

  await dispatch('run', { question: state().run.question, ids: ['openevidence', 'chatgpt'] });
  await waitFor(() => state().run.combined?.status === 'complete', 'two-source auto-synthesis');
  assert.equal(state().run.id, firstSession);
  assert.equal(await getView('openevidence').webContents.executeJavaScript('window.sendCount'), 1);
  assert.equal(state().run.combined.provenance.sources.length, 2);
  await dispatch('run', { question: state().run.question, ids: PROVIDERS.map(p => p.id) });
  await waitFor(() => state().run.combined?.status === 'complete' && state().run.combined.provenance.sources.length === 3, 'add third source');
  assert.deepEqual(state().run.combined.citations[0].services, ['OE', 'GPT', 'DOX']);
  assert.equal(state().run.combined.provenance.thinking, 'high');
  for (const p of PROVIDERS) assert.equal(await getView(p.id).webContents.executeJavaScript('window.sendCount'), 1);
  await dispatch('select', 'combined'); await screenshot('combined-answer.png');
  await dispatch('select', 'review'); await screenshot('desktop-results.png');
  await dispatch('select', 'workspace'); await screenshot('live-services.png');
  win.setSize(920, 760); await dispatch('select', 'review'); await screenshot('compact-results.png');
  win.setMinimumSize(360, 600); win.setSize(390, 844); await screenshot('phone-source-record.png');
  await dispatch('select', 'combined'); await screenshot('phone-combined-answer.png');
  await win.webContents.executeJavaScript('document.getElementById("settings").click()');
  await new Promise(resolve => setTimeout(resolve, 100)); await screenshot('phone-settings.png');
  win.setSize(1320, 920);

  await dispatch('new-session', { discard: true });
  assert.notEqual(state().run.id, firstSession);
  assert.deepEqual(state().run.answers, {});
  await waitFor(() => PROVIDERS.every(p => state().statuses[p.id] === 'Fresh conversation ready'), 'all provider pages reset immediately');
  for (const p of PROVIDERS) assert.equal((await operate(p.id, 'inspect')).answerCount, 0);
  await dispatch('run', { question: 'Fresh session regression question', ids: PROVIDERS.map(p => p.id) });
  await waitFor(() => state().run.combined?.status === 'complete', 'all three receive the next session question');
  for (const p of PROVIDERS) assert.match(state().run.answers[p.id].text, /Fresh session regression question/);
  await dispatch('new-session', { discard: true });
  const resettingSession = state().run.id;
  await dispatch('run', { question: 'Ask immediately during reset', ids: PROVIDERS.map(p => p.id) });
  assert.equal(state().run.id, resettingSession, 'Ask must join the session being reset, not invalidate it');
  await waitFor(() => state().run.combined?.status === 'complete', 'immediate Ask waits for reset');
  for (const p of PROVIDERS) assert.match(state().run.answers[p.id].text, /Ask immediately during reset/);
  await dispatch('new-session', { discard: true });
  await waitFor(() => PROVIDERS.every(p => state().statuses[p.id] === 'Fresh conversation ready'), 'reset before unavailable-provider scenario');
  const dox = getView('doximity').webContents;
  await dox.session.protocol.unhandle('https');
  dox.session.protocol.handle('https', () => new Response(fixture('Doximity Ask', true), { headers: { 'Content-Type': 'text/html' } }));
  await dox.loadURL(PROVIDERS[2].url);
  await dispatch('run', { question: 'Second synthetic question', ids: PROVIDERS.map(p => p.id) });
  await waitFor(() => Boolean(state().run.answers.openevidence && state().run.answers.chatgpt), 'two completed despite unavailable third');
  assert.equal(state().run.combined, null);
  await dispatch('synthesize-ready', { ids: ['openevidence', 'chatgpt'] });
  await waitFor(() => state().run.combined?.status === 'complete', 'explicit partial synthesis');
  assert.equal(state().run.combined.provenance.sources.length, 2);
  await dispatch('cancel-synthesis');
  await getView('openevidence').webContents.loadURL('https://example.org/other');
  await assert.rejects(() => operate('openevidence', 'fill', 'not sent'), /sign|service/i);
  console.log('PASS: one source without API, add second and third without resending, automatic capture/synthesis, new session, explicit partial synthesis, isolated source viewing and sandbox.');
  console.log(`Screenshots: ${out}`);
};
