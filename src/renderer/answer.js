'use strict';
(() => {
  const rendered = new WeakMap();
  const names = { OE: 'OpenEvidence', GPT: 'GPT for Clinicians', DOX: 'Doximity Ask' };
  function badge(code) {
    const span = document.createElement('span');
    span.className = 'source-code source-' + code.toLowerCase();
    span.textContent = code; span.title = names[code] + ' · source attribution, not independent verification';
    return span;
  }
  window.renderCouncilAnswer = (target, text = '', openLink) => {
    if (rendered.get(target) === text) return;
    rendered.set(target, text);
    const opened = new Set([...target.querySelectorAll('details[open]')].map(el => el.dataset.title));
    // No remote images, HTML controls, inline styles, or model-authored attributes.
    const fragment = DOMPurify.sanitize(marked.parse(text, { gfm: true, breaks: false }), {
      RETURN_DOM_FRAGMENT: true,
      ALLOWED_TAGS: ['p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'del', 'ul', 'ol', 'li', 'a', 'blockquote', 'hr', 'pre', 'code', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'sup', 'sub'],
      ALLOWED_ATTR: ['href', 'start'],
      ALLOW_DATA_ATTR: false, ALLOW_ARIA_ATTR: false,
    });
    for (const link of fragment.querySelectorAll('a')) {
      let url;
      try { url = new URL(link.getAttribute('href')); } catch {}
      if (!url || url.protocol !== 'https:' || url.username || url.password) {
        link.replaceWith(document.createTextNode(link.textContent)); continue;
      }
      link.addEventListener('click', event => { event.preventDefault(); openLink(url.href); });
      if (names[link.textContent.trim()]) link.replaceChildren(badge(link.textContent.trim()));
    }
    const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      if (node.parentElement?.closest('a,code,pre,.source-code')) continue;
      const group = /\[((?:OE|GPT|DOX)(?:\s*[, +]\s*(?:OE|GPT|DOX))*)\]/;
      if (!group.test(node.textContent)) continue;
      const parts = node.textContent.split(/(\[(?:OE|GPT|DOX)(?:\s*[, +]\s*(?:OE|GPT|DOX))*\])/);
      node.replaceWith(...parts.map(part => {
        if (!group.test(part)) return document.createTextNode(part);
        const fragment = document.createDocumentFragment();
        for (const code of part.match(/OE|GPT|DOX/g)) fragment.append(badge(code), ' ');
        return fragment;
      }));
    }
    for (const table of fragment.querySelectorAll('table')) {
      const wrap = document.createElement('div'); wrap.className = 'answer-table'; wrap.tabIndex = 0;
      wrap.setAttribute('role', 'region'); wrap.setAttribute('aria-label', 'Comparison table');
      table.replaceWith(wrap); wrap.append(table);
    }
    const headings = [...fragment.children].filter(el => /^H[1-6]$/.test(el.tagName));
    const level = Math.min(...headings.map(el => Number(el.tagName[1])));
    const output = document.createDocumentFragment();
    const nav = document.createElement('nav'); nav.className = 'answer-nav'; nav.setAttribute('aria-label', 'Answer sections');
    let section = output;
    for (const node of [...fragment.childNodes]) {
      if (node.nodeType === 1 && node.tagName === 'H' + level) {
        const title = node.textContent.trim();
        const secondary = /^(references|merge note|evidence and detail)$/i.test(title);
        section = document.createElement(secondary ? 'details' : 'section');
        section.className = 'answer-section'; section.dataset.title = title;
        if (/^(meaningful differences|disagreements and gaps)$/i.test(title)) section.classList.add('answer-differences');
        if (/^unique contributions$/i.test(title)) section.classList.add('answer-unique');
        if (/^clinical pearls$/i.test(title)) section.classList.add('answer-pearls');
        const heading = document.createElement(secondary ? 'summary' : 'h2'); heading.append(...node.childNodes);
        section.append(heading); output.append(section);
        if (secondary) section.open = opened.has(title);
        else {
          const destination = section;
          const jump = document.createElement('button'); jump.textContent = title;
          jump.addEventListener('click', () => { destination.scrollIntoView({ block: 'start' }); });
          nav.append(jump);
        }
      } else section.append(node);
    }
    target.classList.add('formatted-answer');
    target.replaceChildren(...(nav.children.length > 1 ? [nav, output] : [output]));
  };
})();
