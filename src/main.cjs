'use strict';
const { app, BrowserWindow, WebContentsView, ipcMain, session, protocol, Menu, dialog, clipboard, safeStorage } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const { PROVIDERS, DEFAULT_PROMPT, validatePromptTemplate, citationIndex, classifyAuth, progressState, DEFAULT_MERGE, mergeOptions, safeURL, serviceURL, validateQuestion, normalizeCapture, synthesisPrompt, reportMarkdown } = require('./core.cjs');
const { scriptFor } = require('./adapter.cjs');
const { synthesize, DEFAULT_SYSTEM, upgradeSystemInstruction } = require('./synthesis.cjs');

const smoke = process.argv.includes('--smoke-test');
const persistence = process.argv.find(arg => ['--persistence-write', '--persistence-read'].includes(arg));
// Keep the legacy internal name for profile paths and macOS safe-storage identity.
// User-facing window, menu, About panel, and bundle names are Prism.
app.setName('Clinical Council');
app.setAboutPanelOptions({ applicationName: 'Prism' });
if (smoke) app.setPath('userData', path.join(os.tmpdir(), `council-smoke-${process.pid}`));
if (persistence && process.env.COUNCIL_TEST_PROFILE) app.setPath('userData', process.env.COUNCIL_TEST_PROFILE);
protocol.registerSchemesAsPrivileged([{ scheme: 'council', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
const LOCAL = 'council://app/';
let win;
const views = new Map();
const popups = new Set();
let bounds = { x: 0, y: 300, width: 1100, height: 450 };
let active = 'review';
let generation = 0;
let busy = false;
let merge = { ...DEFAULT_MERGE };
let synthesisSnapshot = null;
let promptTemplate = DEFAULT_PROMPT;
let systemInstruction = DEFAULT_SYSTEM;
let apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
let apiModel = 'gemini-3.8-flash';
let synthesisAbort = null;
let captureAbort = null;
const activity = {};
let polling = false;
let run = { id: 0, question: '', requestedIds: [], answers: {}, combined: null };
let serviceLocations = {};
let selectedProviders = PROVIDERS.map(p => p.id);
let autoSynthesisPaused = false;
let autoSynthesisSignature = '';
const freshConversations = new Set(PROVIDERS.map(p => p.id));
const conversationResets = new Map();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const statuses = Object.fromEntries(PROVIDERS.map(p => [p.id, 'Open tab to sign in']));
const auth = Object.fromEntries(PROVIDERS.map(p => [p.id, { state: 'unknown', label: 'Not checked', reason: 'Open the service tab to check your session.' }]));
statuses.synthesis = 'Two or three requested services synthesize automatically when their answers are ready';

const providerFor = id => PROVIDERS.find(p => p.id === id);
function state() { return { active, busy, capturing: Boolean(captureAbort), run, promptTemplate, systemInstruction, defaultPrompt: DEFAULT_PROMPT, defaultSystem: DEFAULT_SYSTEM, citations: citationIndex(run.answers), merge, statuses, auth, activity, api: { configured: Boolean(apiKey), model: apiModel, thinking: 'high' }, providers: PROVIDERS.map(({ id, code, name }) => ({ id, code, name })) }; }
function publish() { if (win && !win.isDestroyed()) win.webContents.send('state', state()); }
function status(id, message) { statuses[id] = message; publish(); }
async function writeRuntimeReceipt() {
  if (smoke || !win) return;
  const providers = await Promise.all(PROVIDERS.map(async p => {
    const view = views.get(p.id);
    if (!view || view.webContents.isDestroyed()) return { id: p.id, loaded: false };
    const wc = view.webContents;
    const inspection = await operate(p.id, 'inspect').catch(() => null);
    const extracted = inspection?.captureReady ? await operate(p.id, 'capture', { ignoreSelection: true }).catch(() => null) : null;
    if (inspection?.ready && !inspection.busy && !inspection.answerLength && p.id !== 'chatgpt') {
      const structure = await operate(p.id, 'diagnose').catch(() => null);
      if (structure) await fs.writeFile(path.join(app.getPath('userData'), `diagnostics-${p.id}.json`), JSON.stringify({ observedAt: new Date().toISOString(), ...structure }), { mode: 0o600 });
    }
    const visibility = await wc.executeJavaScriptInIsolatedWorld(999, [{ code: '({ visibility: document.visibilityState, focused: document.hasFocus() })' }]).catch(() => ({}));
    return { id: p.id, loaded: !wc.isLoadingMainFrame(), serviceHost: serviceURL(p, wc.getURL()), visible: view.getVisible(), ...visibility,
      ready: Boolean(inspection?.ready), generating: Boolean(inspection?.busy), answerDetected: Boolean(inspection?.answerLength), completionObserved: Boolean(inspection?.completionObserved), capturedCharacters: extracted?.text?.length || 0, capturedLinks: extracted?.links?.length || 0, phase: activity[p.id]?.phase || 'idle' };
  }));
  await fs.writeFile(path.join(app.getPath('userData'), 'runtime-status.json'), JSON.stringify({ observedAt: new Date().toISOString(), active, sessionId: run.id, capturedServices: Object.keys(run.answers), synthesisStatus: run.combined?.status || (busy ? 'working' : 'idle'), providers }), { mode: 0o600 });
}
async function pollProgress() {
  if (polling || !win) return;
  polling = true;
  const token = generation;
  try {
    await Promise.all(Object.keys(activity).map(async id => {
      const previous = activity[id];
      if (!previous || !['waiting', 'generating', 'stalled', 'output', 'unreadable', 'error'].includes(previous.phase)) return;
      if (!Number.isFinite(previous.startedAt)) return;
      if (previous.phase === 'error' && (previous.initialFingerprint === undefined || previous.initialAnswerCount === undefined)) return;
      try {
        const observation = await operate(id, 'inspect');
        if (token !== generation || previous !== activity[id]) return;
        activity[id] = progressState(previous, observation);
        status(id, activity[id].phase === 'unreadable'
          ? 'No active generation signal, but the app cannot identify a readable answer. The service may already be done. Export page diagnostics from this tab.'
          : activity[id].label);
        const fresh = observation.answerCount !== previous.initialAnswerCount || observation.fingerprint !== previous.initialFingerprint;
        const settled = Date.now() - activity[id].lastChanged >= 2000;
        if (fresh && !observation.busy && (observation.completionObserved || (settled && observation.captureReady !== false)) && observation.answerLength > 0) {
          try {
            await capture(id, { internal: true, navigate: false, ignoreSelection: true });
          } catch (error) {
            if (token === generation) status(id, `Answer visible; reading source · ${error.message}`);
          }
        }
      } catch (error) {
        if (token !== generation) return;
        activity[id] = { ...previous, phase: 'waiting', label: 'Reconnecting to service · still watching' };
        status(id, `${error.message} Check the service tab.`);
      }
    }));
  } finally { polling = false; }
  if (token === generation) maybeSynthesize();
}
function maybeSynthesize() {
  if (busy || autoSynthesisPaused || !run.requestedIds.length) return;
  const ready = run.requestedIds.filter(id => run.answers[id]);
  if (ready.length !== run.requestedIds.length) {
    const unreadable = run.requestedIds.filter(id => activity[id]?.phase === 'unreadable').map(id => providerFor(id).code);
    status('synthesis', unreadable.length
      ? `${ready.length} / ${run.requestedIds.length} answers ready · app cannot read ${unreadable.join(', ')}; completion is unknown`
      : `${ready.length} / ${run.requestedIds.length} answers ready · waiting for remaining services`);
    return;
  }
  if (ready.length === 1) { status('synthesis', 'Single-service answer ready · no synthesis needed'); return; }
  const signature = `${run.id}:${ready.map(id => `${id}:${run.answers[id].capturedAt}`).join('|')}`;
  if (signature === autoSynthesisSignature) return;
  if (!apiKey) { status('synthesis', 'Answers ready · add a Gemini key in Synthesis settings'); return; }
  autoSynthesisSignature = signature;
  dispatch('synthesize-ready', { ids: ready }).catch(error => status('synthesis', error.message));
}
async function awaitReady(id, token) {
  const start = Date.now();
  while (token === generation) {
    const wc = getView(id).webContents;
    if (!wc.isLoadingMainFrame() && serviceURL(providerFor(id), wc.getURL())) {
      const observation = await operate(id, 'inspect').catch(() => null);
      if (token !== generation) throw new Error('Session changed.');
      if (observation?.ready && !observation.busy) return observation;
    }
    if (Date.now() - start > 60000) throw new Error('Service is not ready to receive a question. Open it to finish sign-in or loading, then Retry.');
    status(id, `Preparing service · ${Math.floor((Date.now() - start) / 1000)}s`);
    await pause(500);
  }
  throw new Error('Session changed.');
}
async function newConversation(id, token) {
  const existing = conversationResets.get(id);
  if (existing?.token === token) return existing.promise;
  const promise = (async () => {
    if (token !== generation) throw new Error('Session changed.');
    status(id, 'Opening a fresh conversation…');
    // These providers have dedicated public entry pages. Navigating within the
    // existing partition keeps authentication and avoids fragile sidebar labels.
    // GPT must use its own control so the selected clinician workspace survives.
    if (id === 'chatgpt') {
      await awaitReady(id, token);
      if (token !== generation) throw new Error('Session changed.');
      await operate(id, 'new-conversation');
    } else {
      await getView(id).webContents.loadURL(providerFor(id).url);
    }
    const start = Date.now();
    while (token === generation) {
      const observation = await awaitReady(id, token);
      if (!observation.answerCount && observation.editorEmpty) {
        freshConversations.delete(id);
        status(id, 'Fresh conversation ready');
        return;
      }
      if (Date.now() - start > 15000) throw new Error('The service did not open an empty conversation; the new question was not sent into the old conversation.');
      await pause(250);
    }
    throw new Error('Session changed.');
  })();
  conversationResets.set(id, { token, promise });
  try { await promise; }
  finally { if (conversationResets.get(id)?.promise === promise) conversationResets.delete(id); }
}
async function checkAuth(id) {
  const p = providerFor(id);
  if (!p || !views.has(id)) return;
  try {
    const inspection = await operate(id, 'inspect');
    const detected = classifyAuth(inspection.authEvidence);
    if (detected.state !== 'unknown' || auth[p.id].state !== 'confirmed') auth[p.id] = detected;
  } catch {
    auth[p.id] = { state: 'unknown', label: 'Check session', reason: 'Finish loading or signing in, then check again.' };
  }
  publish();
}
function secureSession(id) {
  const ses = session.fromPartition(`persist:council-${id}`);
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);
  ses.on('will-download', event => event.preventDefault());
  return ses;
}
function preferences(ses) { return { session: ses, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, backgroundThrottling: false }; }
function guardRemote(wc, ses) {
  wc.on('will-navigate', (event, url) => { if (!safeURL(url)) event.preventDefault(); });
  wc.on('will-redirect', (event, url) => { if (!safeURL(url)) event.preventDefault(); });
  wc.setWindowOpenHandler(({ url }) => {
    if (!safeURL(url)) return { action: 'deny' };
    return { action: 'allow', overrideBrowserWindowOptions: { width: 900, height: 760, autoHideMenuBar: true, webPreferences: preferences(ses) } };
  });
  wc.on('did-create-window', popup => {
    popups.add(popup);
    guardRemote(popup.webContents, ses);
    popup.on('closed', () => popups.delete(popup));
  });
  wc.on('will-attach-webview', event => event.preventDefault());
}
function getView(id) {
  if (!providerFor(id)) throw new Error('Unknown service.');
  if (views.has(id)) return views.get(id);
  const p = providerFor(id);
  const ses = secureSession(p.id);
  const view = new WebContentsView({ webPreferences: preferences(ses) });
  view.setBackgroundColor('#ffffff');
  guardRemote(view.webContents, ses);
  view.webContents.on('did-finish-load', () => { if (!activity[id]) status(id, 'Page loaded · check sign-in'); checkAuth(id); });
  view.webContents.on('did-navigate-in-page', () => checkAuth(id));
  const saveLocation = () => {
    const url = view.webContents.getURL();
    if (smoke || !serviceURL(p, url)) return;
    serviceLocations[id] = url;
    fs.writeFile(path.join(app.getPath('userData'), 'service-locations.json'), JSON.stringify(serviceLocations), { mode: 0o600 }).catch(() => {});
  };
  view.webContents.on('did-navigate', saveLocation);
  view.webContents.on('did-navigate-in-page', saveLocation);
  view.webContents.on('did-fail-load', (_event, code, description, _url, mainFrame) => {
    if (mainFrame && code !== -3) status(id, `Could not load: ${description}. Use Reload to retry.`);
  });
  view.webContents.on('render-process-gone', () => status(id, 'Page stopped. Use Reload to recover.'));
  view.webContents.on('context-menu', (_event, params) => {
    const template = [{ role: 'copy' }, { role: 'paste' }, { type: 'separator' }, {
      label: 'Capture selected answer', enabled: Boolean(params.selectionText.trim()) && !busy && Boolean(run.question),
      click: () => capture(id).catch(error => status(id, error.message)),
    }];
    Menu.buildFromTemplate(template).popup({ window: win });
  });
  views.set(id, view);
  win.contentView.addChildView(view);
  view.setVisible(false);
  if (!smoke) view.webContents.loadURL(serviceURL(p, serviceLocations[id]) ? serviceLocations[id] : p.url).catch(() => {});
  return view;
}
function layout() {
  const paneIds = active === 'workspace' ? selectedProviders : providerFor(active) ? [active] : [];
  for (const [id, view] of views) {
    const index = paneIds.indexOf(id);
    view.setVisible(index !== -1);
    if (index !== -1) {
      const width = Math.floor(bounds.width / paneIds.length);
      view.setBounds({ ...bounds, x: bounds.x + index * width, width: index === paneIds.length - 1 ? bounds.width - index * width : width });
    }
  }
}
function select(id) { if (!['review', 'combined', 'workspace'].includes(id)) getView(id); active = id; layout(); publish(); if (providerFor(id)) checkAuth(id); }
async function operate(id, operation, payload) {
  const wc = getView(id).webContents;
  if (!serviceURL(providerFor(id), wc.getURL())) throw new Error('Finish signing in on the service website before using this action.');
  const result = await wc.executeJavaScriptInIsolatedWorld(999, [{ code: scriptFor(operation, payload, id) }], true);
  if (!result?.ok) throw new Error(result?.error || 'Could not read this service page.');
  return result.value;
}
async function send(id, question, token) {
  try {
    activity[id] = { phase: 'preparing', label: 'Preparing service…', startedAt: Date.now() };
    if (freshConversations.has(id)) await newConversation(id, token);
    const baseline = await awaitReady(id, token);
    if (token !== generation) return;
    activity[id] = { phase: 'sending', label: 'Sending…', initialFingerprint: baseline.fingerprint, initialAnswerCount: baseline.answerCount, fingerprint: baseline.fingerprint, answerCount: baseline.answerCount, startedAt: Date.now(), lastChanged: Date.now(), seenOutput: false };
    status(id, 'Finding question field…');
    await operate(id, 'fill', question);
    await new Promise(resolve => setTimeout(resolve, 400));
    if (token !== generation) return;
    await operate(id, 'submit', question);
    if (token !== generation) return;
    activity[id].phase = 'waiting'; activity[id].label = 'Waiting for output…';
    status(id, 'Send clicked · waiting for output');
  } catch (error) { if (token === generation) { activity[id] = { ...activity[id], phase: 'error', label: 'Send failed · open service' }; status(id, error.message); } }
}
async function capture(id, { internal = false, navigate = true, ignoreSelection = false } = {}) {
  if (busy && !internal) throw new Error('Wait for the current operation to finish.');
  if (!run.question) throw new Error('Record your shared question first.');
  const token = generation;
  const value = normalizeCapture(await operate(id, 'capture', { ignoreSelection }));
  if (token !== generation) throw new Error('The question changed. Capture again.');
  value.included = true;
  run.answers[id] = value;
  if (run.combined) run.combined.sourcesChanged = true;
  status(id, 'Answer ready · source not independently verified');
  activity[id] = { phase: 'captured', label: 'Captured' };
  layout();
  if (navigate) select('review');
  return state();
}
async function dispatch(action, payload) {
  switch (action) {
    case 'state': return state();
    case 'select-providers': {
      if (!Array.isArray(payload) || payload.some(id => !providerFor(id))) throw new Error('Unknown service selection.');
      selectedProviders = [...new Set(payload)];
      for (const id of selectedProviders) getView(id);
      select('workspace'); break;
    }
    case 'check-auth': await checkAuth(payload); break;
    case 'confirm-auth': {
      const p = providerFor(payload);
      if (!p || !views.has(payload) || !serviceURL(p, getView(payload).webContents.getURL())) throw new Error('Open the service page and finish signing in first.');
      auth[p.id] = { state: 'confirmed', label: 'Signed in*', reason: 'Confirmed by you this session; not automatically verified. A detected sign-in page clears this confirmation.' };
      publish(); break;
    }
    case 'preview-prompt': return { ...state(), promptPreview: synthesisPrompt(run.question, run.answers, payload || merge, promptTemplate) };
    case 'save-synthesis-settings': {
      if (busy) throw new Error('Wait for the current operation to finish.');
      const template = validatePromptTemplate(payload.promptTemplate);
      if (typeof payload.systemInstruction !== 'string' || !payload.systemInstruction.trim() || payload.systemInstruction.length > 12000) throw new Error('System instruction must contain 1–12,000 characters.');
      const settings = mergeOptions(payload.merge);
      await fs.writeFile(path.join(app.getPath('userData'), 'synthesis-settings.json'), JSON.stringify({ promptTemplate: template, systemInstruction: payload.systemInstruction, merge: settings }), { mode: 0o600 });
      promptTemplate = template; systemInstruction = payload.systemInstruction; merge = settings;
      publish(); break;
    }
    case 'diagnose-service': {
      if (!providerFor(payload)) throw new Error('Select a service first.');
      const diagnostic = await operate(payload, 'diagnose');
      const { canceled, filePath } = await dialog.showSaveDialog(win, { defaultPath: 'prism-page-structure.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
      if (!canceled && filePath) await fs.writeFile(filePath, JSON.stringify(diagnostic, null, 2), { mode: 0o600 });
      break;
    }
    case 'configure-api': {
      if (busy) throw new Error('Wait for the current operation to finish.');
      if (!payload || !/^[a-zA-Z0-9._:-]{1,100}$/.test(payload.model || '')) throw new Error('Enter a valid API model ID.');
      if (payload.key) {
        if (typeof payload.key !== 'string' || payload.key.length > 1000 || /\s/.test(payload.key)) throw new Error('Enter a valid API key without whitespace.');
        if (!safeStorage.isEncryptionAvailable()) throw new Error('macOS credential encryption is unavailable; the key was not saved.');
        await fs.writeFile(path.join(app.getPath('userData'), 'gemini-key.bin'), safeStorage.encryptString(payload.key), { mode: 0o600 });
        apiKey = payload.key;
      }
      apiModel = payload.model;
      await fs.writeFile(path.join(app.getPath('userData'), 'gemini-settings.json'), JSON.stringify({ model: apiModel }), { mode: 0o600 });
      publish(); break;
    }
    case 'cancel-synthesis': autoSynthesisPaused = true; synthesisAbort?.abort(); captureAbort?.abort(); status('synthesis', 'Automatic synthesis paused · service answers continue collecting'); break;
    case 'select': if (!['review', 'combined', 'workspace'].includes(payload) && !providerFor(payload)) throw new Error('Unknown tab.'); select(payload); break;
    case 'bounds': {
      if (!payload || !['x', 'y', 'width', 'height'].every(k => Number.isFinite(payload[k]))) throw new Error('Invalid view bounds.');
      const [w, h] = win.getContentSize();
      const x = Math.max(0, Math.min(w, Math.round(payload.x)));
      const y = Math.max(0, Math.min(h, Math.round(payload.y)));
      bounds = { x, y, width: Math.max(0, Math.min(w - x, Math.round(payload.width))), height: Math.max(0, Math.min(h - y, Math.round(payload.height))) };
      layout(); break;
    }
    case 'reload': if (!providerFor(payload)) throw new Error('Select a service tab.'); getView(payload).webContents.reload(); break;
    case 'home': if (busy) throw new Error('Wait for dispatch to finish.'); await newConversation(payload, generation); break;
    case 'copy-question': clipboard.writeText(validateQuestion(payload)); break;
    case 'merge-options': merge = mergeOptions(payload); publish(); break;
    case 'open-source': {
      if (!safeURL(payload)) throw new Error('Only secure web references can be opened.');
      const popup = new BrowserWindow({ width: 1000, height: 800, webPreferences: preferences(session.fromPartition('council-references')) });
      const ses = popup.webContents.session;
      ses.setPermissionRequestHandler((_wc, _p, callback) => callback(false));
      ses.setPermissionCheckHandler(() => false);
      guardRemote(popup.webContents, ses); popups.add(popup);
      popup.on('closed', () => popups.delete(popup));
      await popup.loadURL(payload); break;
    }
    case 'run': {
      if (busy) throw new Error('A dispatch is already in progress.');
      const question = validateQuestion(payload.question);
      const ids = [...new Set(payload.ids)];
      if (!ids.length || ids.some(id => !PROVIDERS.some(p => p.id === id))) throw new Error('Select at least one service.');
      selectedProviders = [...new Set([...run.requestedIds, ...ids])];
      if (run.question && question !== run.question) throw new Error('Start a New session before changing the question.');
      if (!run.question) {
        // New session already owns a generation, including pending page resets.
        // Only the first question after application launch needs an ID here.
        if (generation === 0) generation += 1;
        run = { id: generation, question, requestedIds: [], answers: {}, combined: null };
      }
      const token = generation;
      const additions = ids.filter(id => !run.requestedIds.includes(id));
      run.requestedIds.push(...additions);
      autoSynthesisPaused = false;
      for (const id of additions) { getView(id); activity[id] = { phase: 'preparing', label: 'Preparing service…', startedAt: Date.now() }; }
      select(run.requestedIds.length === 1 ? run.requestedIds[0] : 'workspace');
      Promise.all(additions.map(id => send(id, question, token))).then(() => { if (token === generation) { publish(); maybeSynthesize(); } }).catch(error => status('synthesis', error.message));
      break;
    }
    case 'new-session': {
      const inFlight = busy || Object.values(activity).some(value => ['preparing', 'sending', 'waiting', 'generating', 'stalled', 'output', 'unreadable'].includes(value.phase));
      if (inFlight && !payload?.discard) throw new Error('Work is still running. Confirm starting a new session to abandon this run.');
      synthesisAbort?.abort(); captureAbort?.abort(); synthesisAbort = null; captureAbort = null; generation += 1;
      for (const p of PROVIDERS) freshConversations.add(p.id);
      run = { id: generation, question: '', requestedIds: [], answers: {}, combined: null };
      for (const id of Object.keys(activity)) delete activity[id];
      for (const p of PROVIDERS) statuses[p.id] = 'Opening a fresh conversation…';
      busy = false; synthesisSnapshot = null; autoSynthesisPaused = false; autoSynthesisSignature = '';
      status('synthesis', 'Ask one service directly, or combine two or three'); select('review');
      const resetToken = generation;
      for (const p of PROVIDERS) newConversation(p.id, resetToken).catch(error => {
        if (resetToken === generation) status(p.id, error.message);
      });
      break;
    }
    case 'retry': {
      if (busy || !run.question || !PROVIDERS.some(p => p.id === payload)) throw new Error('Start a question first and wait for dispatch.');
      if (run.answers[payload] || ['preparing', 'sending', 'waiting', 'generating', 'output', 'unreadable'].includes(activity[payload]?.phase)) throw new Error('This service is already running or has answered; it will not be sent twice.');
      if (!run.requestedIds.includes(payload)) run.requestedIds.push(payload);
      send(payload, run.question, generation).catch(error => status(payload, error.message));
      break;
    }
    case 'capture': {
      try { return await capture(payload); }
      catch (error) {
        if (providerFor(payload)) {
          activity[payload] = { ...activity[payload], phase: 'error', label: 'Capture failed' };
          status(payload, error.message);
        }
        throw error;
      }
    }
    case 'capture-all': {
      if (busy || !run.question) throw new Error('Send a shared question first.');
      for (const p of PROVIDERS) {
        if (!views.has(p.id)) continue;
        try { await capture(p.id); } catch (error) { status(p.id, error.message); }
      }
      select('review'); break;
    }
    case 'paste': {
      if (busy || !run.question) throw new Error('Record a shared question first and wait for dispatch.');
      if (!PROVIDERS.some(p => p.id === payload.id)) throw new Error('Unknown source.');
      run.answers[payload.id] = normalizeCapture({ text: payload.text, links: [], method: 'paste' });
      run.combined = null;
      synthesisSnapshot = null;
      status(payload.id, 'Pasted · review for completeness'); break;
    }
    case 'review': {
      if (busy || !run.answers[payload.id]) throw new Error('Capture an answer first and wait for dispatch.');
      run.answers[payload.id].included = Boolean(payload.reviewed);
      run.combined = null;
      synthesisSnapshot = null;
      publish(); break;
    }
    case 'capture-synthesize': {
      autoSynthesisPaused = false;
      if (!run.question) throw new Error('Ask a question first.');
      select(run.requestedIds.length === 1 ? run.requestedIds[0] : 'workspace');
      await pollProgress(); maybeSynthesize(); break;
    }
    case 'synthesize-ready': {
      if (busy) throw new Error('Synthesis is already running.');
      const ids = [...new Set(payload?.ids || [])];
      if (!ids.length || ids.some(id => !providerFor(id) || !run.answers[id])) throw new Error('Choose completed answers.');
      if (ids.length === 1) { select(ids[0]); break; }
      for (const p of PROVIDERS) if (run.answers[p.id]) run.answers[p.id].included = ids.includes(p.id);
      autoSynthesisPaused = ids.length !== run.requestedIds.length;
      return dispatch('combine', merge);
    }
    case 'combine': {
      if (busy) throw new Error('Wait for dispatch to finish.');
      if (!apiKey) throw new Error('Configure your API key in Synthesis settings before combining.');
      merge = mergeOptions(payload || merge);
      const prompt = synthesisPrompt(run.question, run.answers, merge, promptTemplate);
      synthesisSnapshot = { settings: { ...merge }, promptTemplate, systemInstruction, model: apiModel, thinking: 'high', sources: PROVIDERS.filter(p => (run.answers[p.id]?.included ?? run.answers[p.id]?.reviewed)).map(p => ({ id: p.id, capturedAt: run.answers[p.id].capturedAt })), createdAt: new Date().toISOString() };
      const synthesisToken = generation;
      const controller = new AbortController();
      synthesisAbort = controller;
      busy = true;
      run.combined = { text: '', links: [], citations: citationIndex(run.answers, true), status: 'streaming', provenance: synthesisSnapshot, model: apiModel };
      const start = Date.now();
      const heartbeat = setInterval(() => { if (synthesisToken === generation) status('synthesis', `Synthesizing · ${Math.floor((Date.now() - start) / 1000)}s${run.combined?.text ? ' · receiving output' : ' · waiting for model'}`); }, 1000);
      select('combined');
      status('synthesis', 'Sending captured sources to the synthesis API…');
      try {
        let lastPublish = 0;
        const result = await synthesize({ key: apiKey, model: apiModel, prompt, systemInstruction, signal: controller.signal,
          ...(smoke ? { fetcher: require('../tests/synthesis-fixture.cjs').fetcher } : {}),
          onDelta: text => { if (synthesisToken !== generation) return; run.combined.text = text; if (Date.now() - lastPublish > 150) { publish(); lastPublish = Date.now(); } },
        });
        if (synthesisToken !== generation) return state();
        run.combined = { ...run.combined, ...result, status: 'complete', capturedAt: new Date().toISOString() };
        status('synthesis', 'Synthesis complete · review source attributions');
      } catch (error) {
        if (synthesisToken !== generation) return state();
        run.combined.status = 'incomplete';
        status('synthesis', controller.signal.aborted ? 'Synthesis canceled · any displayed text is partial' : error.message);
        throw error;
      } finally { clearInterval(heartbeat); if (synthesisToken === generation) { synthesisAbort = null; busy = false; publish(); } }
      break;
    }
    case 'copy-packet': {
      merge = mergeOptions(payload || merge);
      clipboard.writeText(synthesisPrompt(run.question, run.answers, merge, promptTemplate));
      synthesisSnapshot = { settings: { ...merge }, sources: PROVIDERS.filter(p => (run.answers[p.id]?.included ?? run.answers[p.id]?.reviewed)).map(p => ({ id: p.id, capturedAt: run.answers[p.id].capturedAt })), createdAt: new Date().toISOString(), method: 'copied-prompt' };
      break;
    }
    case 'export': {
      if (!run.question) throw new Error('Start a question before exporting.');
      const report = reportMarkdown(run);
      const { canceled, filePath } = await dialog.showSaveDialog(win, { defaultPath: 'prism.md', filters: [{ name: 'Markdown', extensions: ['md'] }] });
      if (!canceled && filePath) await fs.writeFile(filePath, report, { mode: 0o600 });
      break;
    }
    default: throw new Error('Unknown application action.');
  }
  return state();
}

async function createWindow() {
  win = new BrowserWindow({ width: 1320, height: 920, minWidth: 900, minHeight: 700, title: 'Prism', backgroundColor: '#f3f5f6', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.on('resize', layout);
  win.on('closed', () => {
    for (const view of views.values()) if (!view.webContents.isDestroyed()) view.webContents.close();
    for (const popup of popups) if (!popup.isDestroyed()) popup.close();
    views.clear(); win = null;
  });
  await win.loadURL(LOCAL + 'index.html');
  if (!smoke) for (const p of PROVIDERS) getView(p.id);
}

app.whenReady().then(async () => {
  if (!smoke && !persistence) {
    try { serviceLocations = JSON.parse(await fs.readFile(path.join(app.getPath('userData'), 'service-locations.json'), 'utf8')); } catch {}
    try {
      const saved = JSON.parse(await fs.readFile(path.join(app.getPath('userData'), 'synthesis-settings.json'), 'utf8'));
      promptTemplate = validatePromptTemplate(require('./core.cjs').upgradePromptTemplate(saved.promptTemplate));
      if (typeof saved.systemInstruction === 'string' && saved.systemInstruction.trim() && saved.systemInstruction.length <= 12000) systemInstruction = upgradeSystemInstruction(saved.systemInstruction);
      merge = mergeOptions(saved.merge);
    } catch {}
    try { apiModel = JSON.parse(await fs.readFile(path.join(app.getPath('userData'), 'gemini-settings.json'), 'utf8')).model || apiModel; } catch {}
    if (!apiKey && safeStorage.isEncryptionAvailable()) {
      try { apiKey = safeStorage.decryptString(await fs.readFile(path.join(app.getPath('userData'), 'gemini-key.bin'))); } catch {}
    }
    if (process.argv.includes('--configure-api-from-env')) {
      if (!apiKey || !safeStorage.isEncryptionAvailable()) throw new Error('Gemini API key or macOS encryption unavailable.');
      await fs.writeFile(path.join(app.getPath('userData'), 'gemini-key.bin'), safeStorage.encryptString(apiKey), { mode: 0o600 });
      console.log('API key saved with macOS-backed encryption; no key printed.'); app.exit(0); return;
    }
  }
  if (smoke) apiKey = 'synthetic-fixture-key';
  if (persistence) {
    await require('../tests/persistence.cjs').stage({ app, session, write: persistence === '--persistence-write' });
    app.exit(0); return;
  }
  protocol.handle('council', async request => {
    const url = new URL(request.url);
    const vendor = { '/vendor/marked.js': 'marked/lib/marked.umd.js', '/vendor/purify.js': 'dompurify/dist/purify.min.js' }[url.pathname];
    if (url.hostname === 'app' && vendor) return new Response(await fs.readFile(path.join(app.getAppPath(), 'node_modules', vendor)), { headers: { 'Content-Type': 'text/javascript' } });
    const file = ({ '/index.html': 'index.html', '/style.css': 'style.css', '/app.js': 'app.js', '/answer.js': 'answer.js', '/assets/openevidence.ico': 'assets/openevidence.ico', '/assets/chatgpt.png': 'assets/chatgpt.png', '/assets/doximity.ico': 'assets/doximity.ico' })[url.pathname];
    if (url.hostname !== 'app' || !file) return new Response('Not found', { status: 404 });
    return new Response(await fs.readFile(path.join(__dirname, 'renderer', file)), { headers: { 'Content-Type': file.endsWith('.ico') ? 'image/x-icon' : file.endsWith('.png') ? 'image/png' : file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'text/html', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-src 'none'" } });
  });
  ipcMain.handle('council', async (event, action, payload) => {
    if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame || event.senderFrame.url !== LOCAL + 'index.html') throw new Error('Untrusted IPC sender.');
    try { return { ok: true, state: await dispatch(action, payload) }; }
    catch (error) { return { ok: false, error: error.message }; }
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Prism', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }] },
    { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' },
  ]));
  await createWindow();
  if (!smoke) {
    setInterval(() => { if (win && !['review', 'combined'].includes(active) && !busy) checkAuth(active); }, 15000).unref();
    setInterval(() => writeRuntimeReceipt().catch(() => {}), 10000).unref();
  }
  setInterval(pollProgress, smoke ? 100 : 1000).unref();
  if (smoke) {
    try { await require('../tests/smoke.cjs').run({ app, win, getView, dispatch, state, operate, LOCAL }); app.exit(0); }
    catch (error) { console.error(error); app.exit(1); }
  }
}).catch(error => { console.error(error); app.exit(1); });
app.on('window-all-closed', () => app.quit());
