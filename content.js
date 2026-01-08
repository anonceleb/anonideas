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
        <button id="ws-refresh">Refresh wordlist</button>
        <button id="ws-clear" style="background:#ef4444;color:#fff;border-radius:6px;padding:6px 8px;border:none;margin-left:6px">Clear row</button>
      </div>
      <div style="margin-top:8px;font-size:12px;color:#444">Word list: <span id="ws-wordlist-count">unknown</span> words</div>
      <div id="wordle-solver-tilerow" aria-label="Manual input row" role="group"></div>
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
  const refreshBtn = root.querySelector('#ws-refresh');
  const clearBtn = document.createElement('button'); clearBtn.id = 'ws-clear'; clearBtn.textContent = 'Clear row';
  const wordlistCountEl = root.querySelector('#ws-wordlist-count');
  const attemptInput = root.querySelector('#ws-attempt');
  const optimizeCheckbox = root.querySelector('#ws-optimize');
  const tileRow = root.querySelector('#wordle-solver-tilerow');
  const results = root.querySelector('#wordle-solver-results');

  // Auto-refresh guard (refresh at most once per page session automatically)
  let autoRefreshed = false;

  // Tile state: each tile has { letter, color } color: 'absent' | 'present' | 'correct' | 'unknown'
  const tiles = Array.from({ length: 5 }, (_, i) => ({ letter: '', color: 'unknown' }));

  function renderTiles() {
    tileRow.innerHTML = '';
    tiles.forEach((t, i) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'ws-tile';
      wrapper.dataset.index = i;
      wrapper.setAttribute('data-color', t.color);

      const inp = document.createElement('input');
      inp.type = 'text'; inp.maxLength = 1; inp.className = 'ws-tile-input'; inp.value = t.letter ? t.letter.toUpperCase() : '';
      inp.autocomplete = 'off'; inp.spellcheck = false;
      inp.addEventListener('input', (ev) => {
        ev.stopPropagation();
        const v = (ev.target.value || '').toLowerCase().slice(0,1).replace(/[^a-z]/g,'');
        tiles[i].letter = v;
        ev.target.value = v ? v.toUpperCase() : '';
        // auto-focus next tile when a letter is entered
        if (v) {
          const next = tileRow.children[i+1];
          if (next) {
            const ni = next.querySelector('.ws-tile-input');
            if (ni) ni.focus();
          }
        }
      });
      inp.addEventListener('keydown', (ev) => {
        ev.stopPropagation();
        if (ev.code === 'Space') { ev.preventDefault(); cycleColor(i); updateTileColor(wrapper, i); }
        if (ev.key === 'Backspace') { tiles[i].letter = ''; setTimeout(() => { ev.target.value = ''; }, 0); }
      });

      const colorBtn = document.createElement('button');
      colorBtn.type = 'button'; colorBtn.className = 'ws-tile-colorbtn'; colorBtn.title = 'Cycle color';
      colorBtn.addEventListener('click', (ev) => { ev.stopPropagation(); ev.preventDefault(); cycleColor(i); updateTileColor(wrapper, i); });

      wrapper.appendChild(inp);
      wrapper.appendChild(colorBtn);
      tileRow.appendChild(wrapper);
      updateTileColor(wrapper, i);
    });
  }

  function updateTileColor(el, idx) {
    const c = tiles[idx].color;
    el.setAttribute('data-color', c);
    const btn = el.querySelector('.ws-tile-colorbtn');
    btn.textContent = '';
    const input = el.querySelector('.ws-tile-input');
    // visual styles are handled via CSS attribute selectors
  }

  function cycleColor(idx) {
    const order = ['unknown','absent','present','correct'];
    const cur = tiles[idx].color;
    const next = order[(order.indexOf(cur) + 1) % order.length];
    tiles[idx].color = next;
  }

  // initial render
  renderTiles();

  // add a short inline style for tiles
  const tileStyle = document.createElement('style');
  tileStyle.textContent = `
    .ws-tile { display:inline-flex; flex-direction:column; align-items:center; justify-content:center; width:48px; height:60px; margin-right:8px; border-radius:6px; border:2px solid transparent; background:#fff }
    .ws-tile-input { width:36px; height:36px; font-size:20px; text-align:center; border:none; background:transparent; outline:none }
    .ws-tile-colorbtn { width:28px; height:18px; font-size:11px; border-radius:4px; border:none; margin-top:4px; cursor:pointer }

    /* stronger color indication: tile background + prominent colored bottom stripe */
    .ws-tile[data-color="unknown"] { background:#f3f4f6; border-color:transparent; }
    .ws-tile[data-color="absent"] { background:#787c7e; color:#fff; border-color:#4b5563 }
    .ws-tile[data-color="present"] { background:#c9b458; color:#111; border-color:#a78b1a }
    .ws-tile[data-color="correct"] { background:#6aaa64; color:#fff; border-color:#4b9a4b }

    .ws-tile::after { content:''; display:block; width:100%; height:6px; border-radius:0 0 6px 6px; margin-top:4px; }
    .ws-tile[data-color="absent"]::after { background:#4b5563 }
    .ws-tile[data-color="present"]::after { background:#a78b1a }
    .ws-tile[data-color="correct"]::after { background:#4b9a4b }

    .ws-item { padding:6px 8px; border-bottom:1px solid #eee }
    .ws-word { font-weight:700 }
    .ws-meta { color:#666; font-size:12px }
    .ws-help { font-size:11px; color:#444; margin-top:8px }
  `;
  document.head.appendChild(tileStyle);
  toggle.addEventListener('click', async () => {
    const hidden = panel.getAttribute('aria-hidden') === 'true';
    panel.setAttribute('aria-hidden', String(!hidden));
    // Auto-refresh wordlist once when first opening the panel to avoid zero-match scenarios
    if (!hidden && !autoRefreshed) {
      try {
        wordlistCountEl.textContent = 'refreshing...';
        const r = await requestRefreshWordlist();
        if (r && r.ok) {
          wordlistCountEl.textContent = r.count || 'unknown';
          autoRefreshed = true;
        } else {
          wordlistCountEl.textContent = 'unknown';
        }
      } catch (e) {
        wordlistCountEl.textContent = 'unknown';
      }
    }
  });
  closeBtn.addEventListener('click', () => panel.setAttribute('aria-hidden', 'true'));

  // Request/response plumbing with solver (page context)
  const pending = new Map();
  const refreshPending = new Map();
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

      // refresh-wordlist response (from solver)
      if (d.type === 'refresh-wordlist-response' && d.id && refreshPending.has(d.id)) {
        refreshPending.get(d.id).resolve(d);
        refreshPending.delete(d.id);
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

  function requestRefreshWordlist() {
    return new Promise((resolve, reject) => {
      const id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
      refreshPending.set(id, { resolve, reject });
      window.postMessage({ source: 'wordle-solver-extension', type: 'refresh-wordlist', id }, '*');
      setTimeout(() => {
        if (refreshPending.has(id)) {
          refreshPending.get(id).reject(new Error('Timeout waiting for wordlist refresh'));
          refreshPending.delete(id);
        }
      }, 10000);
    });
  }

  // Hook refresh button
  refreshBtn.addEventListener('click', async () => {
    refreshBtn.disabled = true; refreshBtn.textContent = 'Refreshing...';
    try {
      const r = await requestRefreshWordlist();
      refreshBtn.disabled = false; refreshBtn.textContent = 'Refresh wordlist';
      if (r && r.ok) {
        wordlistCountEl.textContent = r.count || 'unknown';
        results.innerHTML = `<div style="color:#080">Wordlist refreshed from ${r.source || 'remote'}. Count: ${r.count || 'unknown'}</div>`;
      } else {
        results.innerHTML = `<div style="color:#900">Refresh failed: ${r && r.error ? r.error : 'unknown'}</div>`;
      }
    } catch (err) {
      refreshBtn.disabled = false; refreshBtn.textContent = 'Refresh wordlist';
      results.innerHTML = `<div style="color:#900">Refresh failed: ${err.message}</div>`;
    }
  });

  runBtn.addEventListener('click', async () => {
    results.innerHTML = '<div>Loading...</div>';
    const attemptNumber = Number(attemptInput.value) || undefined;
    const optimizeForStreak = optimizeCheckbox.checked;

    // Build constraints from manual tiles
    const constraints = { correct: {}, present: {}, absent: [] };
    tiles.forEach((t, i) => {
      const l = (t.letter || '').toLowerCase();
      if (!l) return;
      if (t.color === 'correct') {
        constraints.correct[i] = l;
      } else if (t.color === 'present') {
        if (!constraints.present[l]) constraints.present[l] = [];
        constraints.present[l].push(i);
      } else if (t.color === 'absent') {
        const usedElsewhere = tiles.some((t2, j) => j !== i && (t2.letter || '').toLowerCase() === l && (t2.color === 'present' || t2.color === 'correct'));
        if (!usedElsewhere) constraints.absent.push(l);
      }
    });

    // Debug: show constructed constraints in console so you can verify
    console.log('Wordle Solver: Posting constraints:', constraints);

    const payload = { guesses: [], constraints, options: { optimizeForStreak } };
    if (typeof attemptNumber === 'number' && attemptNumber >= 1 && attemptNumber <= 6) payload.attemptNumber = attemptNumber;

    try {
      const res = await requestSuggestions(payload);

      // If solver indicates there were very few or no possible words, suggest a refresh and show wordlist size
      if (res && typeof res.total === 'number' && res.total === 0) {
        results.innerHTML = `<div style="color:#900">No matches found (wordlist size: ${wordlistCountEl.textContent}).</div>` +
                            `<div style="color:#666;margin-top:6px;font-size:12px">Try <button id="ws-refresh-inline">Refresh wordlist</button></div>`;
        const refreshInline = document.getElementById('ws-refresh-inline');
        if (refreshInline) refreshInline.addEventListener('click', async () => {
          try {
            refreshBtn.disabled = true; refreshBtn.textContent = 'Refreshing...';
            const r = await requestRefreshWordlist();
            refreshBtn.disabled = false; refreshBtn.textContent = 'Refresh wordlist';
            if (r && r.ok) {
              wordlistCountEl.textContent = r.count || 'unknown';
              results.innerHTML = '<div style="color:#080">Wordlist refreshed — try again</div>';
            } else {
              results.innerHTML = `<div style="color:#900">Refresh failed: ${r && r.error ? r.error : 'unknown'}</div>`;
            }
          } catch (err) {
            refreshBtn.disabled = false; refreshBtn.textContent = 'Refresh wordlist';
            results.innerHTML = `<div style="color:#900">Refresh failed: ${err.message}</div>`;
          }
        });
        return;
      }

      displayResults(res);
      // If no matches and we haven't auto-refreshed yet, auto-refresh wordlist and retry once
      if (res && typeof res.total === 'number' && res.total === 0 && !autoRefreshed) {
        try {
          autoRefreshed = true;
          results.innerHTML = '<div style="color:#666">No matches found — auto-refreshing wordlist...</div>';
          refreshBtn.disabled = true; refreshBtn.textContent = 'Refreshing...';
          const r = await requestRefreshWordlist();
          refreshBtn.disabled = false; refreshBtn.textContent = 'Refresh wordlist';
          if (r && r.ok) {
            wordlistCountEl.textContent = r.count || 'unknown';
            // Retry same query
            const retry = await requestSuggestions(payload);
            displayResults(retry);
          } else {
            results.innerHTML = `<div style="color:#900">Refresh failed: ${r && r.error ? r.error : 'unknown'}</div>`;
          }
        } catch (err) {
          refreshBtn.disabled = false; refreshBtn.textContent = 'Refresh wordlist';
          results.innerHTML = `<div style="color:#900">Auto-refresh failed: ${err.message}</div>`;
        }
      }
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
            (s.depthEstimate !== undefined ? ` • Depth est: ${s.depthEstimate}` : '') +
            (s.chancesLeft !== undefined ? ` • Chances left: ${s.chancesLeft}` : '') +
          `</div>
        </div>
      `).join('') +
      `<div class="ws-help">Depth est = a cheap upper-bound of extra guesses needed (lower is better).</div>`;
  }

})();
