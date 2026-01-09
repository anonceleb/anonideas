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
      <label>Guesses used: <input id="ws-attempt" type="number" min="0" max="5" value="0" /></label>
      <button id="ws-run">Get Suggestions</button>
      <label style="margin-left:8px"><input id="ws-persist-cache" type="checkbox" /> Persistent cache</label>
      <button id="ws-clear-cache" title="Clear persistent cache" style="margin-left:6px;padding:4px 6px">Clear cache</button>
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
  const tileRow = root.querySelector('#wordle-solver-tilerow');
  const results = root.querySelector('#wordle-solver-results');
  const persistCheckbox = root.querySelector('#ws-persist-cache');
  const clearCacheBtn = root.querySelector('#ws-clear-cache');

  // persistent cache state (in-memory mirror of chrome.storage entry)
  let persistEnabled = false;
  let persistCacheObj = Object.create(null);

  // Initialize persistent cache toggle from storage
  try {
    chrome.storage.local.get(['ws_persistent_cache_enabled','ws_entropy_cache'], (items) => {
      try {
        persistEnabled = !!items.ws_persistent_cache_enabled;
        if (persistCheckbox) persistCheckbox.checked = persistEnabled;
        persistCacheObj = items.ws_entropy_cache || {};
        if (persistEnabled && persistCacheObj && Object.keys(persistCacheObj).length > 0) {
          // send cache to solver to pre-populate
          try { window.postMessage({ source: 'wordle-solver-extension', type: 'entropy-cache-load', cache: persistCacheObj }, '*'); } catch (e) {}
        }
      } catch (e) { console.warn('Wordle Solver: Error initializing persistent cache toggle', e); }
    });
  } catch (e) { console.warn('Wordle Solver: storage not available', e); }

  if (persistCheckbox) persistCheckbox.addEventListener('change', (ev) => {
    persistEnabled = !!ev.target.checked;
    try { chrome.storage.local.set({ ws_persistent_cache_enabled: persistEnabled }); } catch (e) {}
    if (persistEnabled) {
      // load any existing cache and post to solver
      try {
        chrome.storage.local.get(['ws_entropy_cache'], (items) => {
          persistCacheObj = items.ws_entropy_cache || {};
          try { window.postMessage({ source: 'wordle-solver-extension', type: 'entropy-cache-load', cache: persistCacheObj }, '*'); } catch (e) {}
        });
      } catch (e) { console.warn('Wordle Solver: Could not load persistent cache', e); }
    } else {
      // notify solver to clear its in-memory cache
      try { window.postMessage({ source: 'wordle-solver-extension', type: 'entropy-cache-clear' }, '*'); } catch (e) {}
    }
  });

  if (clearCacheBtn) clearCacheBtn.addEventListener('click', () => {
    persistCacheObj = {};
    try { chrome.storage.local.set({ ws_entropy_cache: {} }); } catch (e) {}
    try { window.postMessage({ source: 'wordle-solver-extension', type: 'entropy-cache-clear' }, '*'); } catch (e) {}
    if (persistCheckbox) { persistCheckbox.checked = false; persistEnabled = false; chrome.storage.local.set({ ws_persistent_cache_enabled: false }); }
  });

  // Auto-refresh guard (refresh at most once per page session automatically)
  let autoRefreshed = false;

  // Minimum acceptable wordlist size for applying a list
  const MIN_WORDLIST_SIZE = 1000;

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

  });
  closeBtn.addEventListener('click', () => panel.setAttribute('aria-hidden', 'true'));

  // Silent background refresh once per page session (best-effort; no UI spinner)
  setTimeout(() => {
    if (!autoRefreshed) {
      performRefreshFromRemote().then(res => { if (res && res.ok) autoRefreshed = true; }).catch(() => {});
    }
  }, 600);

  // Request/response plumbing with solver (page context)
  const pending = new Map();
  const refreshPending = new Map();

  // Remote gist URL used for refresh
  const GIST_WORDLIST_URL = 'https://gist.githubusercontent.com/dracos/dd0668f281e685bad51479e5acaadb93/raw/valid-wordle-words.txt';

  // Helper: fetch with timeout
  async function fetchWithTimeout(url, timeoutMs = 8000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(id);
      return res;
    } catch (e) {
      clearTimeout(id);
      throw e;
    }
  }

  // Helper: send wordlist text to solver in chunks to avoid message size limits
  async function sendWordlistToSolver(text, source, count, providedId) {
    const CHUNK_SIZE = 32 * 1024; // 32KB
    const total = Math.max(1, Math.ceil((text || '').length / CHUNK_SIZE));
    const id = providedId || Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);

    console.log('Wordle Solver: sendWordlistToSolver starting', { id, total, source, count });
    try { window.postMessage({ source: 'wordle-solver-extension', type: 'apply-wordlist-start', id, source, count }, '*'); } catch (e) {}
    for (let i = 0; i < total; i++) {
      const chunk = (text || '').slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      try {
        window.postMessage({ source: 'wordle-solver-extension', type: 'apply-wordlist-chunk', id, idx: i, total, text: chunk }, '*');
        console.log('Wordle Solver: posted chunk', { id, idx: i, total });
      } catch (e) {
        console.warn('Wordle Solver: Failed to post chunk', i, e);
        throw e;
      }
      // small delay so the page can process incoming message events
      await new Promise(r => setTimeout(r, 8));
    }
    // signal completion
    try {
      window.postMessage({ source: 'wordle-solver-extension', type: 'apply-wordlist-chunk-done', id, source, count }, '*');
      console.log('Wordle Solver: posted chunk-done', { id, total });
    } catch (e) {
      console.warn('Wordle Solver: Failed to post final chunk-done message', e);
      throw e;
    }
    // Ask the solver explicitly for a verification in case its refresh response is missed
    try {
      setTimeout(() => {
        try {
          window.postMessage({ source: 'wordle-solver-extension', type: 'wordlist-info-request', id }, '*');
        } catch (e) { /* best-effort */ }
      }, 25);
    } catch (e) { /* best-effort */ }

    console.log('Wordle Solver: sendWordlistToSolver returning id', { id });
    return id;
  }

  // Perform refresh: try remote gist (up to 2 attempts with backoff), then fallback to bundled local file if it's large enough
  let refreshInProgress = false;
  async function performRefreshFromRemote() {
    if (refreshInProgress) {
      console.warn('Wordle Solver: Refresh already in progress; ignoring duplicate request');
      return { ok: false, error: 'refresh-in-progress' };
    }
    refreshInProgress = true;
    const MIN_WORDLIST_SIZE = 1000; // require at least this many words to consider a list valid

    // Helper: try remote fetch once and, if ok, attempt to apply and validate size
    async function tryRemoteOnce() {
      const remote = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'fetch-wordlist-remote', url: GIST_WORDLIST_URL }, (resp) => resolve(resp));
      });
      if (remote && remote.ok) {
        const text = remote.text;
        const count = remote.count;
        if (typeof count === 'number' && count >= MIN_WORDLIST_SIZE) {
          try {
            const id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
            const infoResp = await new Promise((resolve, reject) => {
              // register pending *before* sending chunks to avoid race
              const to = setTimeout(() => { if (refreshPending.has(id)) { try { refreshPending.get(id).reject(new Error('Timeout waiting for solver to apply wordlist')); } catch (e) {} finally { refreshPending.delete(id); } } }, 15000);
              const wrappedResolve = (v) => { clearTimeout(to); try { refreshPending.delete(id); } catch (e) {} resolve(v); };
              const wrappedReject = (err) => { clearTimeout(to); try { refreshPending.delete(id); } catch (e) {} reject(err); };
              refreshPending.set(id, { resolve: wrappedResolve, reject: wrappedReject });
              // start sending; ensure send errors reject the pending promise
              sendWordlistToSolver(text, 'remote', count, id).catch(err => { try { wrappedReject(err); } catch (e) {} });
            });
            if (infoResp && infoResp.ok && infoResp.count && infoResp.count >= MIN_WORDLIST_SIZE) return { ok: true, count: infoResp.count, source: infoResp.source || 'remote', text };
            return { ok: false, error: infoResp && infoResp.error ? infoResp.error : 'apply-failed', count: infoResp && infoResp.count };
          } catch (e) {
            return { ok: false, error: e.message || String(e), count };
          }
        }
        return { ok: false, error: 'remote-too-small', count };
      }
      return { ok: false, error: (remote && remote.error) || 'remote-failed' };
    }

    // Try remote up to 2 times with exponential-ish backoff
    try {
      let attempts = 0;
      let lastErr = null;
      const MAX_ATTEMPTS = 2;
      const BACKOFF_MS = 800;
      while (attempts < MAX_ATTEMPTS) {
        attempts++;
        try {
          const res = await tryRemoteOnce();
          if (res && res.ok) return res; // success
          lastErr = res;
          if (res && res.count && res.count < MIN_WORDLIST_SIZE) {
            // remote returned a small list; treat as failure and do not accept
            console.warn('Wordle Solver: Remote list too small:', res.count);
            break; // no point retrying if remote source itself is too small
          }
        } catch (e) {
          lastErr = { ok: false, error: e.message || String(e) };
        }
        // backoff before retrying
        await new Promise(r => setTimeout(r, BACKOFF_MS * attempts));
      }

      // Remote failed or was too small; try bundled local file
    } catch (e) {
      // proceed to bundled
    }

    // Fallback: bundled local data — only apply if big enough
    try {
      const local = await fetchWithTimeout(chrome.runtime.getURL('data/wordlist.txt'), 4000);
      if (local && local.ok) {
        const text = await local.text();
        const count = text.split(/\r?\n/).filter(Boolean).length;
        if (count >= MIN_WORDLIST_SIZE) {
          try {
            console.log('Wordle Solver: Applying bundled wordlist (count):', count);
            const id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
            // wait up to 12s for solver to confirm apply
            const infoResp = await new Promise((resolve, reject) => {
              const to = setTimeout(() => { if (refreshPending.has(id)) { try { refreshPending.get(id).reject(new Error('Timeout waiting for solver to apply bundled wordlist')); } catch (e) {} finally { refreshPending.delete(id); } } }, 12000);
              const wrappedResolve = (v) => { clearTimeout(to); try { refreshPending.delete(id); } catch (e) {} resolve(v); };
              const wrappedReject = (err) => { clearTimeout(to); try { refreshPending.delete(id); } catch (e) {} reject(err); };
              refreshPending.set(id, { resolve: wrappedResolve, reject: wrappedReject });
              // start sending; ensure send errors reject the pending promise
              sendWordlistToSolver(text, 'bundled', count, id).catch(err => { try { wrappedReject(err); } catch (e) {} });
            });
            if (infoResp && infoResp.ok) return { ok: true, count: infoResp.count || count, source: infoResp.source || 'bundled', text };
            return { ok: false, error: infoResp && infoResp.error ? infoResp.error : 'apply-failed', count };
          } catch (e) {
            return { ok: false, error: e.message || String(e), count };
          }
        }
        return { ok: false, error: 'bundled-too-small', count, text };
      }
      return { ok: false, error: 'bundled-not-found' };
    } catch (e) {
      return { ok: false, error: e.message || String(e) };
    } finally {
      refreshInProgress = false;
    }
  }
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

      // Progress ping from solver for long-running suggestion computation
      if (d.type === 'suggestions-progress' && d.id && pending.has(d.id)) {
        const entry = pending.get(d.id);
        try {
          const pct = Number.isFinite(d.progress) ? Math.max(0, Math.min(100, d.progress)) : undefined;
          console.log('Wordle Solver: Received progress ping', d.id, pct);
          if (typeof pct === 'number') runBtn.textContent = `Computing (${pct}%)`;
          // reset timer
          if (entry && typeof entry.resetTimer === 'function') entry.resetTimer();
        } catch (e) {
          // ignore progress errors
        }
        return;
      }

      if (d.type === 'suggestions-start' && d.id && pending.has(d.id)) {
        // minor UI tweak to indicate work started
        console.log('Wordle Solver: suggestions-start received', d.id);
        try { runBtn.textContent = 'Computing (0%)'; } catch (e) {}
        const entry = pending.get(d.id);
        if (entry && typeof entry.resetTimer === 'function') entry.resetTimer();
        return;
      }      if (d.type === 'solver-ready') {
        // indicate UI is ready
        toggle.title = 'Wordle Solver (ready)';
        return;
      }

      // refresh-wordlist response (from solver)
      if (d.type === 'refresh-wordlist-response') {
        // If this response matches a pending id, resolve that one
        if (d.id && refreshPending.has(d.id)) {
          refreshPending.get(d.id).resolve(d);
          refreshPending.delete(d.id);
          return;
        }

        // Otherwise, if the solver reports a sufficiently large list, treat that as a global success
        // and resolve any pending refresh verification requests (handles id mismatches/races).
        if (d.ok && typeof d.count === 'number' && d.count >= MIN_WORDLIST_SIZE) {
          console.log('Wordle Solver: Received global refresh-wordlist-response OK (count >= MIN_WORDLIST_SIZE); resolving pending verifications.');
          for (const [pid, p] of refreshPending.entries()) {
            try { p.resolve(d); } catch (e) {}
            refreshPending.delete(pid);
          }
          return;
        }
      }

      // wordlist-info response (from solver) - used to verify in-memory wordlist counts
      if (d.type === 'wordlist-info-response' && d.id && refreshPending.has(d.id)) {
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
        const url = chrome.runtime.getURL('data/word_freq.json');
        fetch(url).then(r => {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.text();
        }).then(text => {
          window.postMessage({ source: 'wordle-solver-extension', type: 'fetch-wordfreq-response', id: d.id, ok: true, text }, '*');
        }).catch(err => {
          console.warn('Wordle Solver: Could not load word_freq.json from', url, err);
          window.postMessage({ source: 'wordle-solver-extension', type: 'fetch-wordfreq-response', id: d.id, ok: false, error: err.message }, '*');
        });
        return;
      }

      // entropy cache put from solver (page context) — persist if enabled
      if (d.type === 'entropy-cache-put' && d.key) {
        try {
          if (persistEnabled) {
            persistCacheObj[d.key] = d.value;
            chrome.storage.local.set({ ws_entropy_cache: persistCacheObj });
          }
        } catch (e) {
          console.warn('Wordle Solver: Could not persist cache', e);
        }
        return;
      }

      // entropy cache load request (from page) - no-op in content (page should load), handled via initialization
      if (d.type === 'entropy-cache-load') return;

      if (d.type === 'entropy-cache-clear') {
        try { persistCacheObj = {}; chrome.storage.local.set({ ws_entropy_cache: {} }); } catch (e) {}
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
      console.log('Wordle Solver: Requesting suggestions (id):', id, payload);

      // Disable the Run button and show computing state while we wait
      const prevRunDisabled = runBtn.disabled;
      const prevRunText = runBtn.textContent;
      runBtn.disabled = true; runBtn.textContent = 'Computing...';

      // Manage timeout with ability to reset on progress
      let to = null;
      const timeoutMs = 20000;
      const startTimer = () => {
        if (to) clearTimeout(to);
        to = setTimeout(() => {
          if (pending.has(id)) {
            console.warn('Wordle Solver: Timeout waiting for suggestions (id):', id);
            pending.get(id).reject(new Error('Timeout waiting for suggestions'));
            pending.delete(id);
            // restore UI
            runBtn.disabled = prevRunDisabled; runBtn.textContent = prevRunText;
          }
        }, timeoutMs);
      };

      const origResolve = (val) => {
        if (to) clearTimeout(to);
        if (pending.has(id)) pending.delete(id);
        runBtn.disabled = prevRunDisabled; runBtn.textContent = prevRunText;
        resolve(val);
      };
      const origReject = (err) => {
        if (to) clearTimeout(to);
        if (pending.has(id)) pending.delete(id);
        runBtn.disabled = prevRunDisabled; runBtn.textContent = prevRunText;
        reject(err);
      };

      // store entry so progress messages can update timeout and UI
      pending.set(id, { resolve: origResolve, reject: origReject, resetTimer: startTimer });

      // send request
      try {
        window.postMessage({ source: 'wordle-solver-extension', type: 'get-suggestions', id, payload }, '*');
      } catch (e) {
        pending.delete(id);
        runBtn.disabled = prevRunDisabled; runBtn.textContent = prevRunText;
        reject(e);
        return;
      }

      startTimer();
    });
  }

  async function requestRefreshWordlist() {
    // Use content-script direct refresh (more reliable than roundtrips to solver)
    const r = await performRefreshFromRemote();
    if (r.ok) return r;
    throw new Error(r.error || 'Refresh failed');
  }



  runBtn.addEventListener('click', async () => {
    results.innerHTML = '<div>Loading...</div>';
    const attemptNumber = Number(attemptInput.value) || undefined;

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

    const payload = { guesses: [], constraints };
    // Interpret the input as 'guesses used' (0-5). Compute remaining attempts for filtering
    const guessesUsed = Number(attemptNumber) || 0;
    const remaining = Math.max(0, 6 - guessesUsed);
    payload.attemptNumber = guessesUsed; // name kept for backward compatibility

    try {
      const res = await requestSuggestions(payload);

      // If solver indicates there were very few or no possible words, suggest a refresh and show wordlist size
      if (res && typeof res.total === 'number' && res.total === 0) {
        results.innerHTML = `<div style="color:#900">No matches found (wordlist size: ${wordlistCountEl.textContent}).</div>`;
        return;
      }

      displayResults(res);
      // If no matches and we haven't auto-refreshed yet, auto-refresh wordlist and retry once
      if (res && typeof res.total === 'number' && res.total === 0 && !autoRefreshed) {
        try {
          autoRefreshed = true;
          results.innerHTML = '<div style="color:#666">No matches found — attempting background refresh and retrying once...</div>';
          const r = await requestRefreshWordlist();
          if (r && r.ok) {
            wordlistCountEl.textContent = r.count || 'unknown';
            // Retry same query
            const retry = await requestSuggestions(payload);
            displayResults(retry);
          } else {
            results.innerHTML = `<div style="color:#900">Refresh failed: ${r && r.error ? r.error : 'unknown'}</div>`;
          }
        } catch (err) {
          results.innerHTML = `<div style="color:#900">Auto-refresh failed: ${err.message}</div>`;
        }
      }
    } catch (e) {
      // Friendly guidance when the solver lacks a full wordlist
      if (e && (e.message === 'wordlist-missing' || e.message.includes('wordlist'))) {
        results.innerHTML = `<div style="color:#900">Wordlist missing or incomplete. Run <code>node scripts/fetch_wordlist.js</code> locally, then reload the extension.</div>`;
      } else {
        results.innerHTML = `<div style="color:#900">Error: ${e.message}</div>`;
      }
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
