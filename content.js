// Content script: inject solver into the page and provide a small UI to interact with it
(function(){
  'use strict';
  console.log('Wordle Solver content script loaded');

  // Inject solver script into page so it runs in page context
  const s = document.createElement('script');
  s.src = chrome.runtime.getURL('solver.js');
  s.onload = () => s.remove();
  (document.head || document.documentElement).appendChild(s);

  // Simple UI elements
  const root = document.createElement('div');
  root.id = 'wordle-solver-root';
  root.innerHTML = `
    <button id="wordle-solver-toggle" title="Open Wordle Solver">WS</button>
    <div id="wordle-solver-panel" aria-hidden="true">
      <div id="wordle-solver-header">
        <strong>Wordle Solver</strong>
        <button id="wordle-solver-close" aria-label="Close">×</button>
      </div>
      <div id="wordle-solver-controls">
        <label>Attempt #: <input id="ws-attempt" type="number" min="1" max="6" value="1" /></label>
        <label><input id="ws-optimize" type="checkbox" checked /> Optimize for streak</label>
        <button id="ws-run">Get Suggestions</button>
      </div>
      <div id="wordle-solver-results"></div>
    </div>
  `;
  Object.assign(root.style, { position: 'fixed', right: '12px', bottom: '12px', zIndex: 2147483647 });
  document.body.appendChild(root);

  // Styles (inlined minimal to ensure visible even if styles.css didn't load yet)
  const style = document.createElement('style');
  style.textContent = `
    #wordle-solver-toggle { background:#111827;color:#fff;border-radius:6px;padding:8px 12px;border:none;font-weight:bold;cursor:pointer }
    #wordle-solver-panel { display:none; width:320px; background: #fff; color:#111; border-radius:8px; box-shadow: 0 6px 20px rgba(0,0,0,.3); padding:12px; margin-top:8px }
    #wordle-solver-panel[aria-hidden="false"] { display:block }
    #wordle-solver-header { display:flex; justify-content:space-between; align-items:center }
    #wordle-solver-controls { margin-top:8px; display:flex; gap:8px; align-items:center }
    #wordle-solver-controls input[type="number"] { width:60px }
    #wordle-solver-results { margin-top:12px; max-height:320px; overflow:auto; font-size:13px }
    .ws-item { padding:6px 8px; border-bottom:1px solid #eee }
    .ws-word { font-weight:700 }
    .ws-meta { color:#666; font-size:12px }
  `;
  document.head.appendChild(style);

  const toggle = root.querySelector('#wordle-solver-toggle');
  const panel = root.querySelector('#wordle-solver-panel');
  const closeBtn = root.querySelector('#wordle-solver-close');
  const runBtn = root.querySelector('#ws-run');
  const attemptInput = root.querySelector('#ws-attempt');
  const optimizeCheckbox = root.querySelector('#ws-optimize');
  const results = root.querySelector('#wordle-solver-results');

  toggle.addEventListener('click', () => {
    const hidden = panel.getAttribute('aria-hidden') === 'true';
    panel.setAttribute('aria-hidden', String(!hidden));
  });
  closeBtn.addEventListener('click', () => panel.setAttribute('aria-hidden', 'true'));

  // Request/response plumbing with solver (page context)
  const pending = new Map();
  window.addEventListener('message', (ev) => {
    const d = ev.data || {};
    if (d && d.source === 'wordle-solver-extension') {
      if (d.type === 'suggestions' && d.id && pending.has(d.id)) {
        pending.get(d.id).resolve(d.payload);
        pending.delete(d.id);
        return;
      }
      if (d.type === 'suggestions-error' && d.id && pending.has(d.id)) {
        pending.get(d.id).reject(new Error(d.error || 'Unknown error'));
        pending.delete(d.id);
        return;
      }
      if (d.type === 'solver-ready') {
        // indicate UI is ready
        toggle.title = 'Wordle Solver (ready)';
        return;
      }

      // Support helper requests from solver for bundled resources
      if (d.type === 'fetch-wordlist') {
        // read bundled wordlist and post back
        fetch(chrome.runtime.getURL('data/wordlist.txt')).then(r => r.text()).then(text => {
          window.postMessage({ source: 'wordle-solver-extension', type: 'fetch-wordlist-response', id: d.id, ok: true, text }, '*');
        }).catch(err => {
          window.postMessage({ source: 'wordle-solver-extension', type: 'fetch-wordlist-response', id: d.id, ok: false, error: err.message }, '*');
        });
        return;
      }

      if (d.type === 'fetch-wordfreq') {
        // optional frequency JSON
        fetch(chrome.runtime.getURL('data/word_freq.json')).then(r => {
          if (!r.ok) throw new Error('not available');
          return r.text();
        }).then(text => {
          window.postMessage({ source: 'wordle-solver-extension', type: 'fetch-wordfreq-response', id: d.id, ok: true, text }, '*');
        }).catch(err => {
          window.postMessage({ source: 'wordle-solver-extension', type: 'fetch-wordfreq-response', id: d.id, ok: false, error: err.message }, '*');
        });
        return;
      }

      // For other messages, forward to extension runtime if needed
      try {
        chrome.runtime.sendMessage(d);
      } catch (e) {
        // runtime not available in some contexts; ignore
      }
    }
  });

  function requestSuggestions(payload) {
    return new Promise((resolve, reject) => {
      const id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
      pending.set(id, { resolve, reject });
      window.postMessage({ source: 'wordle-solver-extension', type: 'get-suggestions', id, payload }, '*');
      // timeout after 8s
      setTimeout(() => {
        if (pending.has(id)) {
          pending.get(id).reject(new Error('Timeout waiting for suggestions'));
          pending.delete(id);
        }
      }, 8000);
    });
  }

  runBtn.addEventListener('click', async () => {
    results.innerHTML = '<div>Loading...</div>';
    const attemptNumber = Number(attemptInput.value) || undefined;
    const optimizeForStreak = optimizeCheckbox.checked;
    const payload = { guesses: [], constraints: { correct: {}, present: {}, absent: [] }, options: { optimizeForStreak } };
    if (typeof attemptNumber === 'number' && attemptNumber >= 1 && attemptNumber <= 6) payload.attemptNumber = attemptNumber;
    try {
      const res = await requestSuggestions(payload);
      displayResults(res);
    } catch (e) {
      results.innerHTML = `<div style="color:#900">Error: ${e.message}</div>`;
    }
  });

  function displayResults(obj) {
    if (!obj) { results.innerHTML = '<div>No suggestions</div>'; return; }
    const list = obj.suggestions || obj;
    const total = obj.total || list.length;
    results.innerHTML = `<div style="font-size:12px;color:#333;margin-bottom:8px">Possible matches: ${total}</div>` +
      list.map(s => `
        <div class="ws-item">
          <div class="ws-word">${s.word}</div>
          <div class="ws-meta">Entropy: ${Number(s.entropy).toFixed(2)} bits` +
            (s.expectedRemaining !== undefined ? ` • Expected remaining: ${Number(s.expectedRemaining).toFixed(2)}` : '') +
            (s.winProbability !== undefined ? ` • Win prob: ${Number(s.winProbability).toFixed(3)}` : '') +
            (s.chancesLeft !== undefined ? ` • Chances left: ${s.chancesLeft}` : '') +
          `</div>
        </div>
      `).join('');
  }

})();
