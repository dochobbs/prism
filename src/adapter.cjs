'use strict';

// Runs in a remote renderer's isolated world. No Node, private APIs, or storage access.
// Candidate selectors are provisional until checked against authenticated sites.
function pageOperation(operation, payload, provider) {
  provider ||= location.hostname.includes('openevidence') ? 'openevidence' : location.hostname.includes('doximity') ? 'doximity' : 'chatgpt';
  const visible = el => el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
  const matches = selector => [...document.querySelectorAll(selector)].filter(visible);
  const labelsOf = el => [el.getAttribute('aria-label'), el.getAttribute('data-testid'), el.getAttribute('title'), el.innerText].filter(Boolean).map(label => label.trim());
  const enabled = el => visible(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true';
  const buttons = matches('button,[role="button"]');
  const busy = matches('[aria-busy="true"],[data-is-streaming="true"],[data-streaming="true"],button[data-testid="stop-button"]').length > 0
    || buttons.some(el => labelsOf(el).some(label => /^(stop|stop generating|stop generation|stop response|stop streaming)$/i.test(label)));
  const exclude = 'nav,aside,form,[contenteditable="true"],[data-message-author-role="user"],[data-role="user"],[role="dialog"]';
  const providerSelectors = {
    chatgpt: '[data-message-author-role="assistant"]',
    openevidence: '.brandable--wrapper article,[data-testid="answer-content"],[data-testid="answer"],[data-role="assistant"],[data-message-author-role="assistant"],[data-testid="assistant-message"]',
    doximity: '.gpt-chat-response-history-responses > .gpt-answers-assistant-base,[data-testid="answer-content"],[data-testid="assistant-message"],[data-role="assistant"],[data-message-author-role="assistant"]',
  };
  const explicit = matches(providerSelectors[provider] || providerSelectors.chatgpt).filter(el => !el.closest(exclude));
  // A bounded rendered-answer fallback, never whole-page text (history and composers
  // can contain old questions). These selectors still require live-site verification.
  const content = matches('main .prose, [role="main"] .prose, main .markdown, [role="main"] .markdown, main [class*="markdown-body"], main [class*="answer-content"]')
    .filter(el => !el.closest(exclude));
  const outer = content.filter(el => !content.some(other => other !== el && other.contains(el)));
  // Multiple anonymous prose blocks may be separate answers, questions, or parts
  // of one answer. Never silently pick the last one. Explicit assistant messages
  // are ordered turns, so their latest item is unambiguous.
  const answers = explicit.length ? explicit : outer.length === 1 ? outer : [];
  const answer = answers.at(-1);
  const captureReason = answer ? '' : outer.length > 1 ? `Found ${outer.length} unlabelled response blocks; cannot safely identify the complete answer.` : 'No identifiable answer container yet.';
  const linksIn = node => [...node.querySelectorAll('a[href]')].filter(a => /^https:\/\//i.test(a.href)).map(a => ({ title: a.textContent.trim(), url: a.href }));
  const answerTextIn = (root, markdown = false) => {
    // Read the live rendered tree without mutating the service DOM. Detached
    // innerText loses layout; textContent merges paragraphs and includes controls.
    const read = node => {
      if (node.nodeType === 3) {
        const whiteSpace = getComputedStyle(node.parentElement).whiteSpace;
        const text = /^(pre|pre-wrap|break-spaces)$/.test(whiteSpace) ? node.textContent : node.textContent.replace(/\s+/g, ' ');
        return markdown ? text.replace(/([\\*_\[\]])/g, '\\$1') : text;
      }
      if (node.nodeType !== 1 || node.matches('script,style,nav,textarea,input,select')) return '';
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return '';
      if (node.matches('button,[role="button"]')) {
        // Citation chips are content, unlike Copy/feedback/action controls.
        const citation = node.closest('sup') || node.querySelector('a[href]')
          || /^[\[\(]?\d+(?:[\s,–-]+\d+)*[\]\)]?$/.test(node.textContent.trim())
          || labelsOf(node).some(label => /^(citation|reference|source)\s*\d/i.test(label));
        if (!citation) return '';
      }
      if (node.tagName === 'BR') return '\n';
      const text = [...node.childNodes].map(read).join('');
      if (markdown) {
        if (/^H[1-6]$/.test(node.tagName)) return '\n\n' + '#'.repeat(Number(node.tagName[1])) + ' ' + text.trim() + '\n\n';
        if (node.tagName === 'LI') {
          const marker = node.parentElement.tagName === 'OL' ? [...node.parentElement.children].indexOf(node) + 1 + '. ' : '- ';
          return '\n' + marker + text.trim().replace(/\n/g, '\n  ') + '\n';
        }
        if (node.matches('strong,b')) return '**' + text.trim() + '**';
        if (node.matches('em,i')) return '*' + text.trim() + '*';
        if (node.matches('a[href]') && /^https:\/\//i.test(node.href)) return '[' + text.trim() + '](<' + node.href.replace(/[<>]/g, ch => encodeURIComponent(ch)) + '>)';
      }
      if (style.display === 'table-cell') return text + '\t';
      const block = /^(block|flex|grid|list-item|table|table-row|flow-root)$/.test(style.display);
      return block ? '\n' + text + '\n' : text;
    };
    return root ? read(root).replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim() : '';
  };
  const editors = matches('textarea:not([readonly]):not([disabled]), [contenteditable="true"]:not([aria-disabled="true"])');
  const uniqueEditors = [...new Set(editors)].filter(el => !el.closest('[role="dialog"]'));
  const preferredEditors = uniqueEditors.filter(el => el.id === 'prompt-textarea' || el.matches('[data-testid="chat-input"],[data-testid="message-input"],[role="textbox"],.ProseMirror') || labelsOf(el).some(label => /^(ask a question|message|question|prompt)$/i.test(label)));
  const editor = preferredEditors.length === 1 ? preferredEditors[0] : uniqueEditors.length === 1 ? uniqueEditors[0] : null;
  // Only answer-local controls count. A Copy button on an older turn must never
  // end a new generation. A disappearing Stop signal is tracked by the caller.
  const completionScope = explicit.length ? answer?.closest('[data-testid^="conversation-turn-"],article') || answer : answer;
  const completionControls = completionScope ? [...completionScope.querySelectorAll('button,[role="button"]')].filter(visible)
    .filter(el => labelsOf(el).some(label => /^(copy response|copy answer|copy message|good response|bad response|read aloud)$/i.test(label))) : [];
  const completionObserved = Boolean(answer?.innerText?.trim() && !busy && (completionControls.length || answer.matches('[data-state="complete"],[data-status="complete"],[data-is-streaming="false"],[data-streaming="false"]')));
  if (operation === 'diagnose') {
    // No answer text, field values, account labels, cookies, or conversation URL.
    return { host: location.hostname, provider, answerCandidates: answers.length, anonymousCandidates: outer.length, captureReason, completionObserved, editorCount: uniqueEditors.length,
      elements: matches('main,[role="main"],article,section,form,textarea,[contenteditable="true"],button,div,p,ol,ul,[data-testid]')
        .filter(el => el.tagName !== 'DIV' || (el.innerText?.length || 0) >= 80 || el.hasAttribute('data-testid'))
        .slice(0, 1200).map(el => ({ tag: el.tagName, classes: typeof el.className === 'string' ? el.className.slice(0, 250) : '',
          role: el.getAttribute('role'), type: el.getAttribute('type'), testId: el.getAttribute('data-testid'),
          textLength: el.innerText?.length || 0, children: el.children.length,
          directTextLength: [...el.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).reduce((sum, node) => sum + node.textContent.length, 0),
          parentTag: el.parentElement?.tagName, parentClasses: String(el.parentElement?.className || '').slice(0, 250) })) };
  }
  if (operation === 'inspect') {
    const labels = matches('button,a,[role="button"],[role="menuitem"]').flatMap(el => [el.innerText?.trim(), el.getAttribute('aria-label')?.trim()]).filter(Boolean);
    const answerText = answerTextIn(answer);
    let fingerprint = 0;
    for (let i = 0; i < answerText.length; i++) fingerprint = (Math.imul(fingerprint, 31) + answerText.charCodeAt(i)) | 0;
    return { ready: Boolean(editor) && document.readyState !== 'loading', busy, answerCount: answers.length, answerLength: answerText.length, fingerprint,
      editorCount: uniqueEditors.length, editorEmpty: !editor || !(editor.tagName === 'TEXTAREA' ? editor.value : editor.innerText).trim(),
      captureReady: Boolean(answerText.trim()) && !busy, captureReason, completionObserved,
      completionSignal: completionObserved ? 'answer completion controls' : busy ? 'generation indicator' : '', authEvidence: {
      signOut: labels.some(label => /^(log out|logout|sign out)$/i.test(label)),
      signIn: labels.some(label => /^(log in|login|sign in|sign up|create account)$/i.test(label)),
      password: matches('input[type="password"]').length > 0,
    } };
  }
  if (operation === 'capture') {
    if (busy) throw new Error('This service still appears to be generating. Wait, then capture again.');
    const selection = window.getSelection();
    if (!payload?.ignoreSelection && selection && !selection.isCollapsed && selection.toString().trim()) {
      const fragment = selection.getRangeAt(0).cloneContents();
      return { text: selection.toString(), links: linksIn(fragment), url: location.href, method: 'selection' };
    }
    if (!answer) throw new Error(`Capture failed: ${captureReason} The answer may be visible; this is an app extraction error. Export page diagnostics to help repair it.`);
    return { text: answerTextIn(answer), markdown: answerTextIn(answer, true), links: linksIn(answer), url: location.href, method: 'adapter' };
  }
  if (operation === 'fill') {
    if (busy) throw new Error('The service is already generating an answer.');
    if (!editor) throw new Error('No unique question field found. Sign in, open a new question, and retry. You can also copy the shared question and paste it into the service.');
    const previous = editor.tagName === 'TEXTAREA' ? editor.value : editor.innerText;
    if (previous.trim()) throw new Error('The service has an unsent draft. Send or clear that draft before retrying.');
    editor.focus();
    if (editor.tagName === 'TEXTAREA') {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(editor, payload);
    } else {
      // Editing through the browser's own command path lets ProseMirror/Lexical
      // and other controlled contenteditables receive their normal transaction.
      const selection = window.getSelection();
      const range = document.createRange(); range.selectNodeContents(editor);
      selection.removeAllRanges(); selection.addRange(range);
      if (!document.execCommand('insertText', false, payload)) editor.textContent = payload;
    }
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: payload }));
    editor.dispatchEvent(new Event('change', { bubbles: true }));
    return { filled: true };
  }
  if (operation === 'submit') {
    if (!editor) throw new Error('Question field changed; check the service tab.');
    const actual = editor.tagName === 'TEXTAREA' ? editor.value : editor.innerText;
    if (actual.trim() !== payload.trim()) throw new Error('The question field did not retain the complete query. Check the service tab and send manually.');
    let candidates = matches('button').filter(button => {
      return labelsOf(button).some(label => /^(send|send message|send prompt|send question|submit|submit question|ask|ask question|send-button)$/i.test(label)) && enabled(button);
    });
    if (!candidates.length) {
      // An unnamed submit button is safe only inside this editor's own form.
      const form = editor.closest('form');
      if (form) candidates = [...form.querySelectorAll('button[type="submit"],input[type="submit"]')].filter(el => visible(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true');
    }
    if (!candidates.length) {
      // Some providers render an icon-only arrow beside a non-form editor.
      // Restrict this to the smallest bounded composer, never page-wide icons.
      let scope = editor.parentElement;
      for (let depth = 0; scope && depth < 4; depth++, scope = scope.parentElement) {
        if (scope.matches('main,body,article,[role="main"]') || scope.querySelectorAll('textarea,[contenteditable="true"]').length !== 1) break;
        const arrows = [...scope.querySelectorAll('button')].filter(enabled).filter(button =>
          labelsOf(button).some(label => /^(↑|send message button|submit prompt)$/i.test(label))
          || button.querySelector('svg.lucide-arrow-up,svg.lucide-send,[data-icon="arrow-up"],[data-icon="paper-plane"]'));
        if (arrows.length) { candidates = arrows; break; }
      }
    }
    if (candidates.length !== 1) throw new Error('The question is filled, but no unique Send button was found. Send it manually in this tab.');
    candidates[0].click();
    return { submitted: true };
  }
  if (operation === 'new-session' || operation === 'new-conversation') {
    if (busy) throw new Error('This service is still generating. Cancel or finish it before opening a new conversation.');
    if (editor && (editor.tagName === 'TEXTAREA' ? editor.value : editor.innerText).trim()) throw new Error('This service has an unsent draft; it was preserved. Send or clear it before starting a new session.');
    const candidates = matches('button,a,[role="button"]').filter(enabled).filter(el => labelsOf(el).some(label => /^(new chat|new conversation|new question|start new chat|start new conversation)(\s*\([^)]*\))?$/i.test(label)));
    if (!candidates.length) {
      if (!answers.length && editor) return { opened: false, alreadyEmpty: true };
      throw new Error('Could not find this service’s New conversation control. Open a fresh conversation in its tab; your workspace was not changed.');
    }
    candidates[0].click();
    return { opened: true };
  }
  throw new Error('Unsupported page operation.');
}

function scriptFor(operation, payload = '', provider = '') {
  return `(() => { try { return { ok: true, value: (${pageOperation.toString()})(${JSON.stringify(operation)}, ${JSON.stringify(payload)}, ${JSON.stringify(provider)}) }; } catch (error) { return { ok: false, error: error.message }; } })()`;
}

module.exports = { scriptFor };
