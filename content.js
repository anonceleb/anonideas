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
      <!-- Exclude letters input: free-form list of letters (e.g., "abcdf") -->
      <label style="margin-left:8px">Exclude letters: <input id="ws-exclude" type="text" maxlength="26" placeholder="e.g., abcdf" style="width:110px;" /></label>
      </div>
      <div id="ws-exclude-warning" style="margin-top:6px;color:#a44;font-size:12px;display:none">Warning: excluded letters conflict with present/correct tiles.</div>

      <!-- Auto-detect validated rows (opt-in) -->
      <div style="margin-top:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <label style="font-size:12px;margin-right:6px"><input id="ws-auto-detect" type="checkbox" /> Auto-detect validated rows</label>
        <button id="ws-detect-now" style="padding:4px 8px;border-radius:6px;border:1px solid #ddd;background:#fff;">Detect now</button>
        <label style="font-size:12px;margin-left:8px"><input id="ws-auto-suggest" type="checkbox" /> Auto-suggest on detect</label>
      </div>
      <div id="ws-detect-summary" style="margin-top:6px;font-size:12px;color:#333;display:none">
        <div id="ws-detect-summary-text" style="margin-bottom:6px"></div>
        <button id="ws-use-detection" style="padding:4px 8px;border-radius:6px;border:1px solid #ddd;background:#1f8feb;color:#fff">Use & Suggest</button>
      </div>

      
      <div id="ws-wordlist" style="margin-top:8px;font-size:12px;color:#444">Word list: <span id="ws-wordlist-count">unknown</span> words</div>
      <div id="wordle-solver-tilerow" aria-label="Manual input row" role="group"></div>
      <div id="wordle-solver-results"></div>
    </div>
  `;

  document.body.appendChild(root);

  // Load extension stylesheet (keeps content.js lean)
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = chrome.runtime.getURL('styles.css');
  (document.head || document.documentElement).appendChild(link);

  const toggle = root.querySelector('#wordle-solver-toggle');
  const panel = root.querySelector('#wordle-solver-panel');
  const closeBtn = root.querySelector('#wordle-solver-close');
  const runBtn = root.querySelector('#ws-run');
  const refreshBtn = root.querySelector('#ws-refresh');
  const clearBtn = root.querySelector('#ws-clear');
  const wordlistCountEl = root.querySelector('#ws-wordlist-count');
  const attemptInput = root.querySelector('#ws-attempt');
  const tileRow = root.querySelector('#wordle-solver-tilerow');
  const results = root.querySelector('#wordle-solver-results');
  const persistCheckbox = root.querySelector('#ws-persist-cache');
  const clearCacheBtn = root.querySelector('#ws-clear-cache');
  const wsExclude = root.querySelector('#ws-exclude');
  const wsExcludeWarning = root.querySelector('#ws-exclude-warning');
  const wsAutoDetect = root.querySelector('#ws-auto-detect');
  const wsDetectNow = root.querySelector('#ws-detect-now');
  const wsAutoSuggest = root.querySelector('#ws-auto-suggest');
  const wsDetectSummary = root.querySelector('#ws-detect-summary');
  const wsDetectSummaryText = root.querySelector('#ws-detect-summary-text');
  const wsUseDetection = root.querySelector('#ws-use-detection');
  const wsWordlist = root.querySelector('#ws-wordlist');

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

  // Initialize auto-detect preferences
  try {
    chrome.storage.local.get(['ws_auto_detect_enabled','ws_auto_suggest_enabled'], (items) => {
      try {
        const autoDetectEnabled = !!items.ws_auto_detect_enabled;
        const autoSuggestEnabled = !!items.ws_auto_suggest_enabled;
        if (wsAutoDetect) wsAutoDetect.checked = autoDetectEnabled;
        if (wsAutoSuggest) wsAutoSuggest.checked = autoSuggestEnabled;
        if (autoDetectEnabled) startAutoDetectObserver();
      } catch (e) { console.warn('Wordle Solver: Error initializing auto-detect prefs', e); }
    });
  } catch (e) { console.warn('Wordle Solver: storage not available for auto-detect prefs', e); }

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

  // Clear the manual tile row
  if (clearBtn) clearBtn.addEventListener('click', () => {
    try {
      tiles.forEach(t => { t.letter = ''; t.color = 'unknown'; });
      renderTiles();
      results.innerHTML = '';
      if (wsExclude) { wsExclude.value = ''; }
      if (wsExcludeWarning) { wsExcludeWarning.style.display = 'none'; }
      if (wsDetectSummary) { wsDetectSummary.style.display = 'none'; wsDetectSummaryText.textContent = ''; }
      // also clear detection state
      try { _lastDetectedRows = []; _lastDetectedRowsWords = new Set(); _lastDetectionSignature = ''; } catch (e) {}
    } catch (e) { console.warn('Wordle Solver: Error clearing tiles', e); }
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
  // Convenience helper: programmatically set exclude input from console (e.g., setExclude('abc'))
  window.setExclude = function(str) { if (wsExclude) { wsExclude.value = String(str || ''); wsExcludeWarning && (wsExcludeWarning.style.display = 'none'); } }

  // Convenience helpers to control auto-detect and auto-suggest from console
  window.setAutoDetect = function(enabled) { if (wsAutoDetect) { wsAutoDetect.checked = !!enabled; try { chrome.storage.local.set({ ws_auto_detect_enabled: !!enabled }); } catch (e) {} if (enabled) startAutoDetectObserver(); else stopAutoDetectObserver(); } }
  window.setAutoSuggest = function(enabled) { if (wsAutoSuggest) { wsAutoSuggest.checked = !!enabled; try { chrome.storage.local.set({ ws_auto_suggest_enabled: !!enabled }); } catch (e) {} } }
  window.runDetectNow = function() { try { const det = detectValidatedRowsFromPage(); showDetectionSummary(det); return det; } catch (e) { console.warn('runDetectNow failed', e); return null; } }

  // DOM detection helper: returns { success: Boolean, rows: Array, constraints: { correct, present, absent } }
  function detectValidatedRowsFromPage() {
    function normalizeState(raw) {
      if (!raw) return null;
      raw = String(raw).toLowerCase();
      if (raw.includes('correct') || raw.includes('green')) return 'correct';
      if (raw.includes('present') || raw.includes('yellow')) return 'present';
      if (raw.includes('absent') || raw.includes('gray') || raw.includes('grey') || raw.includes('black')) return 'absent';
      const m = raw.match(/(\d+),\s*(\d+),\s*(\d+)/);
      if (m) {
        const r = +m[1], g = +m[2], b = +m[3];
        if (g > r && g > b && g > 100) return 'correct';
        if (r > g && r > 100) return 'present';
        return 'absent';
      }
      return null;
    }

    // Try common selectors
    let tileEls = Array.from(document.querySelectorAll('[data-state]')).filter(el => /^[A-Za-z]$/.test((el.textContent || '').trim()));
    if (tileEls.length === 0) {
      for (const gr of Array.from(document.querySelectorAll('game-row'))) {
        try {
          const sr = gr.shadowRoot;
          if (!sr) continue;
          const tiles = Array.from(sr.querySelectorAll('.tile, [data-state], .letter')).filter(el => /^[A-Za-z]$/.test((el.textContent || '').trim()));
          tileEls = tileEls.concat(tiles);
        } catch (e) { /* ignore closed shadow roots */ }
      }
    }
    if (tileEls.length === 0) {
      tileEls = Array.from(document.querySelectorAll('div,span,button')).filter(el => /^[A-Za-z]$/.test((el.textContent || '').trim()));
    }

    if (!tileEls.length) return { success: false, rows: [] };

    const items = tileEls.map(el => {
      const rect = el.getBoundingClientRect();
      const rawState = el.getAttribute('data-state') || el.getAttribute('aria-label') || window.getComputedStyle(el).backgroundColor || '';
      return { el, letter: (el.textContent || '').trim().toLowerCase(), rawState, rect };
    });

    const rowsMap = new Map();
    for (const it of items) {
      const bucket = Math.round(it.rect.top / 5) * 5;
      if (!rowsMap.has(bucket)) rowsMap.set(bucket, []);
      rowsMap.get(bucket).push(it);
    }

    const rows = [];
    const sortedBuckets = Array.from(rowsMap.keys()).sort((a,b) => a-b);
    for (const b of sortedBuckets) {
      const rowItems = rowsMap.get(b).slice().sort((a,b) => a.rect.left - b.rect.left);
      if (rowItems.length < 5) continue;
      const rowTiles = rowItems.slice(0,5).map((t, idx) => ({ letter: t.letter || '', rawState: t.rawState || '', state: normalizeState(t.rawState), idx }));
      if (rowTiles.every(t => t.letter && t.state)) rows.push(rowTiles);
    }

    if (!rows.length) return { success: false, rows };

    const correct = {}, present = {}, absentSet = new Set();
    rows.forEach(row => {
      row.forEach(tile => {
        if (!tile.letter) return;
        if (tile.state === 'correct') correct[tile.idx] = tile.letter;
        else if (tile.state === 'present') {
          if (!present[tile.letter]) present[tile.letter] = new Set();
          present[tile.letter].add(tile.idx);
        } else if (tile.state === 'absent') {
          absentSet.add(tile.letter);
        }
      });
    });
    for (const l of Object.values(correct)) absentSet.delete(l);
    for (const l of Object.keys(present)) absentSet.delete(l);
    const presentObj = {};
    for (const k of Object.keys(present)) presentObj[k] = Array.from(present[k]);
    const constraints = { correct, present: presentObj, absent: Array.from(absentSet) };
    return { success: true, rows, constraints };
  }

  // UI helper to show detection summary and hook up 'Use & Suggest'
  function showDetectionSummary(result) {
    if (!wsDetectSummary || !wsDetectSummaryText) return;
    if (!result || !result.success) { wsDetectSummary.style.display = 'none'; wsDetectSummaryText.textContent = ''; return; }
    const c = result.constraints || { correct: {}, present: {}, absent: [] };

    // Friendly mini-tile renderer
    const colorMap = { correct: '#6aaa64', present: '#c9b458', absent: '#787c7e' };
    const rowsHtml = (result.rows || []).map(row => {
      const tiles = row.map(t => {
        const bg = colorMap[t.state] || '#f3f4f6';
        return `<span style="display:inline-block;width:20px;height:24px;line-height:24px;text-align:center;margin-right:4px;border-radius:4px;background:${bg};color:${t.state==='absent'?"#fff":"#000"};font-weight:700">${(t.letter||'').toUpperCase()}</span>`;
      }).join('');
      return `<div style="margin-bottom:6px">${tiles}</div>`;
    }).join('');

    // short summary text
    const presentList = Object.entries(c.present).map(([l,ps]) => `${l}: [${ps.join(',')}]`).join(', ');
    const excluded = (c.absent || []).join('');

    // Detect completed game (win if any fully correct row, loss if 6+ rows and no correct tiles)
    const gameCompleted = (function() {
      try {
        const rows = result.rows || [];
        if (!rows.length) return false;
        if (rows.some(r => r.every(t => t.state === 'correct'))) return true;
        if (rows.length >= 6 && !rows.some(r => r.some(t => t.state === 'correct'))) return true;
        return false;
      } catch (e) { return false; }
    })();

    // If completed, only show the tiles (no summary line) and hide the 'Use & Suggest' button
    if (gameCompleted) {
      wsDetectSummaryText.innerHTML = rowsHtml;
      if (wsUseDetection) try { wsUseDetection.style.display = 'none'; } catch (e) {}
      // Hide the word list summary when the game looks completed
      try { if (wsWordlist) wsWordlist.style.display = 'none'; } catch (e) {}
    } else {
      wsDetectSummaryText.innerHTML = `${rowsHtml}<div style="font-size:12px;color:#444">Detected — Present: ${presentList || '—'} &nbsp; Excluded: <strong>${excluded || '—'}</strong></div>`;
      if (wsUseDetection) try { wsUseDetection.style.display = ''; } catch (e) {}
      // Ensure the word list summary is visible when not completed
      try { if (wsWordlist) wsWordlist.style.display = ''; } catch (e) {}
    }
    wsDetectSummary.style.display = 'block';

    // wire Use & Suggest button to populate tiles and request suggestions
    if (wsUseDetection) {
      wsUseDetection.onclick = async () => {
        try {
          await applyDetection(result, { suggest: true });
        } catch (e) {
          results.innerHTML = `<div style="color:#900">Error: ${e.message}</div>`;
        }
      };
    }
  }

  // MutationObserver for auto-detect
  let _autoDetectObserver = null;
  let _lastDetectionSignature = '';
  // Last detected rows (array of rows) and quick set of played words to filter suggestions
  let _lastDetectedRows = [];
  let _lastDetectedRowsWords = new Set();

  function makeSignature(r) { try { return JSON.stringify(r.constraints || {}); } catch (e) { return ''; } }

  // Apply detection into UI (populate tiles) and optionally request suggestions
  async function applyDetection(det, opts = { suggest: false }) {
    try {
      if (!det || !det.success) return;
      const rows = det.rows || [];
      if (!rows.length) return;
      // Use the last validated row (most recent)
      const lastRow = rows[rows.length - 1];
      _lastDetectedRows = rows;
      _lastDetectedRowsWords = new Set(rows.map(r => r.map(t => t.letter).join('')));

      // Populate the manual tiles in the extension for visual confirmation
      tiles.forEach((t, i) => { t.letter = ''; t.color = 'unknown'; });
      lastRow.forEach((tile, i) => {
        tiles[i].letter = tile.letter || '';
        tiles[i].color = tile.state === 'correct' ? 'correct' : (tile.state === 'present' ? 'present' : (tile.state === 'absent' ? 'absent' : 'unknown'));
      });
      renderTiles();

      // Update the summary display so it stays in sync
      showDetectionSummary(det);

      if (opts.suggest) {
        try {
          const payload = { guesses: Array.from(_lastDetectedRowsWords), constraints: det.constraints };
          const res = await requestSuggestions(payload);
          displayResults(res);
        } catch (e) {
          results.innerHTML = `<div style="color:#900">Error: ${e.message}</div>`;
        }
      }
    } catch (e) { console.warn('applyDetection failed', e); }
  }

  function startAutoDetectObserver() {
    if (_autoDetectObserver) return;
    const rootEl = document.querySelector('game-app') || document.querySelector('main') || document.body;
    const debounced = debounce(async () => {
      try {
        const det = detectValidatedRowsFromPage();
        if (det && det.success) {
          const sig = makeSignature(det);
          if (sig !== _lastDetectionSignature) {
            _lastDetectionSignature = sig;
            showDetectionSummary(det);
            if (wsAutoSuggest && wsAutoSuggest.checked) {
              try { applyDetection(det, { suggest: true }); } catch (e) {}
            }
          }
        }
      } catch (e) { console.warn('Auto-detect debounce error', e); }
    }, 250);

    _autoDetectObserver = new MutationObserver((mutations) => { debounced(); });
    try { _autoDetectObserver.observe(rootEl, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-state','aria-label','class','style'] }); } catch (e) { try { _autoDetectObserver.observe(document.body, { subtree: true, childList: true, attributes: true }); } catch (e2) { console.warn('Auto-detect observer failed to attach', e2); _autoDetectObserver = null; } }
  }
  function stopAutoDetectObserver() { try { if (_autoDetectObserver) { _autoDetectObserver.disconnect(); _autoDetectObserver = null; } } catch (e) {} }

  // Debounce helper
  function debounce(fn, wait) { let t = null; return () => { if (t) clearTimeout(t); t = setTimeout(() => { t = null; fn(); }, wait); }; }

  // Wire up UI events for auto-detect controls
  if (wsDetectNow) wsDetectNow.addEventListener('click', () => { try { const det = detectValidatedRowsFromPage(); showDetectionSummary(det); } catch (e) { console.warn('Detect now failed', e); } });
  if (wsAutoDetect) wsAutoDetect.addEventListener('change', (ev) => {
    const enabled = !!ev.target.checked;
    try { chrome.storage.local.set({ ws_auto_detect_enabled: enabled }); } catch (e) {}
    if (enabled) startAutoDetectObserver(); else stopAutoDetectObserver();
  });
  if (wsAutoSuggest) wsAutoSuggest.addEventListener('change', (ev) => {
    const enabled = !!ev.target.checked;
    try { chrome.storage.local.set({ ws_auto_suggest_enabled: enabled }); } catch (e) {}
  });


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

    // Parse free-form Exclude letters input (if present) and merge into absent list
    if (wsExclude && wsExclude.value) {
      const raw = (wsExclude.value || '').toLowerCase();
      const letters = Array.from(new Set(raw.split('').filter(ch => /[a-z]/.test(ch))));
      for (const ch of letters) {
        // do not duplicate
        if (!constraints.absent.includes(ch)) constraints.absent.push(ch);
      }
      // Validate: if excluded letters conflict with present/correct letters, show warning
      let conflict = false;
      for (const ch of constraints.absent) {
        if (Object.values(constraints.correct).includes(ch)) { conflict = true; break; }
        if (constraints.present && constraints.present[ch]) { conflict = true; break; }
      }
      if (wsExcludeWarning) {
        wsExcludeWarning.style.display = conflict ? 'block' : 'none';
      }
    } else {
      if (wsExcludeWarning) { wsExcludeWarning.style.display = 'none'; }
    }

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
    const list = Array.isArray(obj.suggestions) ? obj.suggestions.slice() : (Array.isArray(obj) ? obj.slice() : []);
    const total = obj.total || list.length;

    // Filter out words that were already detected as played (e.g., last guess)
    const filtered = list.filter(s => !_lastDetectedRowsWords.has(s.word));
    const filteredCount = filtered.length;
    const filteredOut = list.length - filteredCount;

    if (filteredCount === 0) {
      // If all suggestions were filtered because they were already-played, surface which words were hidden
      const filteredOutWords = list.filter(s => _lastDetectedRowsWords.has(s.word)).map(s => s.word);

      // Detect if the game appears to be completed already (win: any fully-correct row, or loss: 6 rows with no correct)
      const gameCompleted = (function() {
        try {
          const rows = _lastDetectedRows || [];
          if (!rows.length) return false;
          // Win if any row is fully correct
          if (rows.some(r => r.every(t => t.state === 'correct'))) return true;
          // Loss if 6 (or more) validated rows and no correct tiles
          if (rows.length >= 6 && !rows.some(r => r.some(t => t.state === 'correct'))) return true;
          return false;
        } catch (e) { return false; }
      })();

      if (filteredOutWords.length > 0) {
        if (gameCompleted) {
          results.innerHTML = `<div style="font-size:12px;color:#333;margin-bottom:8px"><strong>Wordle completed for the day.</strong></div>`;
        } else {
          results.innerHTML = `<div style="font-size:12px;color:#333;margin-bottom:8px">No suggestions after filtering out already-played words (${filteredOut} filtered).</div>` +
            `<div style="font-size:12px;color:#333;margin-bottom:8px">Previously played matches: <strong>${filteredOutWords.join(', ').toUpperCase()}</strong></div>` +
            `<div class="ws-help">Try clearing the row or adjust excludes.</div>`;
        }
      } else {
        results.innerHTML = `<div style="font-size:12px;color:#333;margin-bottom:8px">No suggestions after filtering out already-played words (${filteredOut} filtered).</div>` +
          `<div class="ws-help">Try clearing the row or adjust excludes.</div>`;
      }
      return;
    }

    results.innerHTML = `<div style="font-size:12px;color:#333;margin-bottom:8px">Possible matches: ${filteredCount}` + (filteredOut ? ` <span style="color:#666;font-size:11px;">(${filteredOut} hidden as previously played)</span>` : '') + `</div>` +
      filtered.map(s => `
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

  // Expose some internals for testing in Node environments (non-browser)
  try {
    if (typeof module !== 'undefined' && module.exports) {
      module.exports = module.exports || {};
      module.exports._test = {
        // allow tests to set the detected words set
        setLastDetectedRowsWords: (arrOrSet) => { _lastDetectedRowsWords = (arrOrSet instanceof Set) ? new Set(Array.from(arrOrSet)) : new Set(arrOrSet || []); },
        // allow tests to set the detected rows (array of rows with tile state) so completion detection can be exercised
        setLastDetectedRows: (rows) => { _lastDetectedRows = Array.isArray(rows) ? rows : []; },
        // expose functions so tests can exercise UI detection summary and display logic
        showDetectionSummary: showDetectionSummary,
        displayResults: displayResults
      };
    }
  } catch (e) { /* ignore in browser */ }

})();
