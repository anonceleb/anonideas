// Wordle Optimal Solver - Content Script
(function() {
  'use strict';

  // Inject solver script with error handling into accessible frames
  const injectedDocs = new WeakSet();
  const injectScriptToDocument = (doc, label) => {
    try {
      if (!doc || injectedDocs.has(doc)) return false;

      // Remove any previous solver/strategist scripts
      const prevSolver = doc.querySelector('script[src*="solver.js"]');
      if (prevSolver) prevSolver.remove();
      const prevStrategist = doc.querySelector('script[src*="strategist.js"]');
      if (prevStrategist) prevStrategist.remove();

      // Inject strategist first so helper is available, then solver
      const toInject = ['strategist.js', 'solver.js'];
      for (const file of toInject) {
        const scriptUrl = chrome.runtime.getURL(file);
        console.log('Wordle Solver: Injecting', file, 'into', label, 'from:', scriptUrl);
        const script = doc.createElement('script');
        // If the page uses a CSP nonce on existing scripts, mirror it to avoid inline/script-src violations where possible
        try {
          const existingScriptWithNonce = doc.querySelector('script[nonce]');
          const nonceVal = existingScriptWithNonce && existingScriptWithNonce.getAttribute && existingScriptWithNonce.getAttribute('nonce');
          if (nonceVal) {
            script.setAttribute('nonce', nonceVal);
          }
        } catch (e) {
          // ignore any access errors
        }

        script.src = scriptUrl;
        script.onload = function() {
          console.log('Wordle Solver:', file, 'loaded in', label);
          this.remove();
        };
        script.onerror = function(error) {
          console.error('Wordle Solver: Failed to load', file, 'in', label, error);
        };
        (doc.head || doc.documentElement).appendChild(script);
      }

      injectedDocs.add(doc);
      console.log('Wordle Solver: Script tags appended to', label);
      return true;
    } catch (error) {
      // Could be cross-origin access denied
      return false;
    }
  };

  const traverseAndInject = (win, depth = 0) => {
    try {
      if (!win || !win.document) return;
      injectScriptToDocument(win.document, depth === 0 ? 'top' : 'iframe depth ' + depth);
      for (let i = 0; i < win.frames.length; i++) {
        try {
          traverseAndInject(win.frames[i], depth + 1);
        } catch (e) {
          // cross-origin frame, skip
        }
      }
    } catch (e) {
      // cross-origin or other error
    }
  };

  const injectSolver = () => {
    try {
      traverseAndInject(window);
    } catch (error) {
      console.error('Wordle Solver: Error during frame-targeted injection', error);
    }
  };

  // Inject immediately
  injectSolver();
  
  // Make injectSolver available globally for retry
  window.injectWordleSolver = injectSolver;

  // Message-based protocol between content script and page script
  const solverProtocol = {
    ready: false,
    pending: new Map(), // id => {resolve, reject, timeout}
    nextId: () => Date.now().toString(36) + '-' + Math.random().toString(36).slice(2),
    timeoutMs: 10000
  };

  // Track current in-flight request so we can cancel it from the UI
  let currentRequestId = null;

  const startRequestSuggestions = (constraints) => {
    const id = solverProtocol.nextId();
    const promise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        solverProtocol.pending.delete(id);
        if (currentRequestId === id) currentRequestId = null;
        reject(new Error('Solver did not respond in time'));
      }, solverProtocol.timeoutMs);
      solverProtocol.pending.set(id, {resolve, reject, timeout});
      try {
        window.postMessage({ source: 'wordle-solver-extension', type: 'get-suggestions', id, payload: { constraints } }, '*');
      } catch (e) {
        clearTimeout(timeout);
        solverProtocol.pending.delete(id);
        if (currentRequestId === id) currentRequestId = null;
        reject(e);
      }
    });
    return { id, promise };
  };

  const cancelRequest = (id, reason = 'Cancelled by user') => {
    const record = solverProtocol.pending.get(id);
    if (record) {
      clearTimeout(record.timeout);
      solverProtocol.pending.delete(id);
      try { record.reject(new Error(reason)); } catch (e) {}
    }
    if (currentRequestId === id) currentRequestId = null;
  };

  window.addEventListener('message', (event) => {
    const data = event.data || {};
    if (data.source !== 'wordle-solver-extension') return;
    if (data.type === 'solver-ready') {
      solverProtocol.ready = true;
      console.log('Wordle Solver: solver-ready received from page script');
    } else if (data.type === 'suggestions' || data.type === 'suggestions-response') {
      const id = data.id;
      const record = solverProtocol.pending.get(id);
      if (record) {
        clearTimeout(record.timeout);
        solverProtocol.pending.delete(id);
        record.resolve(data.payload);
      }
    } else if (data.type === 'suggestions-error') {
      const id = data.id;
      const record = solverProtocol.pending.get(id);
      if (record) {
        clearTimeout(record.timeout);
        solverProtocol.pending.delete(id);
        record.reject(new Error(data.error || 'Unknown error from solver'));
      }
    } else if (data.type === 'fetch-url-response') {
      // responses for fetch-url requests from the page
      const id = data.id;
      const record = solverProtocol.pending.get(id);
      if (record) {
        clearTimeout(record.timeout);
        solverProtocol.pending.delete(id);
        if (data.ok) record.resolve(data.text); else record.reject(new Error(data.error || data.statusText || 'Fetch failed'));
      }
    }

    // handle fetch-url requests coming from page -> content script -> background
    if (data && data.type === 'fetch-url' && data.id && data.url) {
      // forward to background
      chrome.runtime.sendMessage({ type: 'fetch-url', url: data.url }, (resp) => {
        try {
          if (resp && resp.ok) {
            window.postMessage({ source: 'wordle-solver-extension', type: 'fetch-url-response', id: data.id, ok: true, status: resp.status, text: resp.text }, '*');
          } else {
            window.postMessage({ source: 'wordle-solver-extension', type: 'fetch-url-response', id: data.id, ok: false, status: resp && resp.status, error: resp && resp.error ? resp.error : resp && resp.statusText }, '*');
          }
        } catch (e) {
          window.postMessage({ source: 'wordle-solver-extension', type: 'fetch-url-response', id: data.id, ok: false, error: e.message }, '*');
        }
      });
    }

    // handle requests to fetch the bundled wordlist from the extension package
    if (data && data.type === 'fetch-wordlist' && data.id) {
      const id = data.id;
      try {
        const url = chrome.runtime.getURL('data/wordlist.txt');
        chrome.runtime.sendMessage({ type: 'fetch-url', url }, (resp) => {
          try {
            if (resp && resp.ok) {
              window.postMessage({ source: 'wordle-solver-extension', type: 'fetch-wordlist-response', id, ok: true, text: resp.text }, '*');
            } else {
              window.postMessage({ source: 'wordle-solver-extension', type: 'fetch-wordlist-response', id, ok: false, error: resp && resp.error ? resp.error : resp && resp.statusText }, '*');
            }
          } catch (e) {
            window.postMessage({ source: 'wordle-solver-extension', type: 'fetch-wordlist-response', id, ok: false, error: e.message }, '*');
          }
        });
      } catch (e) {
        window.postMessage({ source: 'wordle-solver-extension', type: 'fetch-wordlist-response', id, ok: false, error: e.message }, '*');
      }
    }

    // handle requests to fetch an optional bundled word-frequency JSON
    if (data && data.type === 'fetch-wordfreq' && data.id) {
      const id = data.id;
      try {
        const url = chrome.runtime.getURL('data/word_freq.json');
        chrome.runtime.sendMessage({ type: 'fetch-url', url }, (resp) => {
          try {
            if (resp && resp.ok) {
              window.postMessage({ source: 'wordle-solver-extension', type: 'fetch-wordfreq-response', id, ok: true, text: resp.text }, '*');
            } else {
              window.postMessage({ source: 'wordle-solver-extension', type: 'fetch-wordfreq-response', id, ok: false, error: resp && resp.error ? resp.error : resp && resp.statusText }, '*');
            }
          } catch (e) {
            window.postMessage({ source: 'wordle-solver-extension', type: 'fetch-wordfreq-response', id, ok: false, error: e.message }, '*');
          }
        });
      } catch (e) {
        window.postMessage({ source: 'wordle-solver-extension', type: 'fetch-wordfreq-response', id, ok: false, error: e.message }, '*');
      }
    }
  });

  const requestSuggestions = (constraints) => {
    return new Promise((resolve, reject) => {
      const id = solverProtocol.nextId();
      const timeout = setTimeout(() => {
        solverProtocol.pending.delete(id);
        reject(new Error('Solver did not respond in time'));
      }, solverProtocol.timeoutMs);
      solverProtocol.pending.set(id, {resolve, reject, timeout});
      try {
        window.postMessage({ source: 'wordle-solver-extension', type: 'get-suggestions', id, payload: { constraints } }, '*');
      } catch (e) {
        clearTimeout(timeout);
        solverProtocol.pending.delete(id);
        reject(e);
      }
    });
  };

  // Public test/bridge helpers for debugging and integration tests
  window.wordleSolverBridge = {
    requestSuggestions: async (constraints) => requestSuggestions(constraints),
    isReady: () => solverProtocol.ready,
    inject: () => injectSolver(),
    hide: () => hideContainer(),
    show: () => {
      const cont = document.getElementById('wordle-solver-container');
      if (cont) cont.style.display = 'block';
      const activ = document.getElementById('wordle-solver-activator');
      if (activ) activ.remove();
    },
    cancelCurrent: () => { if (currentRequestId) cancelRequest(currentRequestId); }
  };

  // Hide/minimize helper - hides the main panel and provides a small activator to re-open
  const hideContainer = () => {
    const container = document.getElementById('wordle-solver-container');
    if (container) container.style.display = 'none';
    // cancel any in-flight request
    if (currentRequestId) cancelRequest(currentRequestId);

    if (!document.getElementById('wordle-solver-activator')) {
      const activator = document.createElement('button');
      activator.id = 'wordle-solver-activator';
      activator.textContent = 'Open Solver';
      Object.assign(activator.style, {position:'fixed', right:'12px', bottom:'12px', zIndex: 2147483647, padding:'8px 10px', borderRadius:'6px', background:'#2b7a78', color:'#fff', border:'none', cursor:'pointer'});
      activator.addEventListener('click', () => {
        const cont = document.getElementById('wordle-solver-container');
        if (cont) cont.style.display = 'block';
        activator.remove();
      });
      document.body.appendChild(activator);
    }
  };

  // Create UI
  const createUI = () => {
    const existing = document.getElementById('wordle-solver-container');
    if (existing) existing.remove();

    const container = document.createElement('div');
    container.id = 'wordle-solver-container';
    container.innerHTML = `
      <div class="wordle-solver-header" style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
        <h3 style="margin:0">🎯 Wordle Solver</h3>
        <div style="display:flex;gap:8px;align-items:center;">
          <button id="wordle-solver-settings-toggle" title="Settings" class="get-suggestions-btn">⚙</button>
          <button id="wordle-solver-hide-toggle" title="Hide Solver" class="get-suggestions-btn">Hide</button>
        </div>
      </div>
      <div id="wordle-solver-content">
        <div class="manual-input-section">
          <div class="manual-input-header">Enter your guess and mark results:</div>
          <div class="word-input-container">
            <input type="text" id="word-input" maxlength="5" placeholder="Enter up to 5 letters (leave blank for unknowns)" autocomplete="off">
          </div>
          <div id="wordle-solver-tiles" class="manual-tiles-container"></div>
          <div class="manual-input-help">
            Click letters: <span class="color-gray">Gray</span> → <span class="color-yellow">Yellow</span> → <span class="color-green">Green</span>
          </div>
          <div style="display:flex;gap:8px;">
            <button id="wordle-solver-get-suggestions" class="get-suggestions-btn">Get Suggestions</button>
            <button id="wordle-solver-clear" class="get-suggestions-btn">Clear</button>
          </div>
        </div>
        <div id="wordle-solver-results" style="display: none;"></div>
        <div id="wordle-solver-settings" style="display:none;padding:8px;border-top:1px solid rgba(0,0,0,0.06);margin-top:8px;background:#fafafa;font-size:13px;">
          <div id="wordle-solver-settings-provenance">Wordlist: bundled <code>data/wordlist.txt</code></div>
          <div style="margin-top:8px;display:flex;gap:8px;align-items:center;">
            <button id="wordle-solver-refresh" class="get-suggestions-btn">Refresh wordlist (session)</button>
            <div id="wordle-solver-refresh-status" style="color:#666;font-size:12px;"></div>
          </div>
        </div>
      </div>
    `;
    
    if (!document.body) {
      setTimeout(createUI, 100);
      return;
    }
    document.body.appendChild(container);

    // Event listeners
    setTimeout(() => {
      const wordInput = document.getElementById('word-input');
      const getSuggestionsBtn = document.getElementById('wordle-solver-get-suggestions');
      const toggleBtn = document.getElementById('wordle-solver-toggle');
      
      if (wordInput) {
        wordInput.addEventListener('input', (e) => {
          const word = e.target.value.toLowerCase().replace(/[^a-z]/g, '').slice(0, 5);
          e.target.value = word;
          createTiles(word);
        });
        // ensure tiles are present when focusing even if input is empty
        wordInput.addEventListener('focus', (e) => {
          const word = e.target.value.toLowerCase().replace(/[^a-z]/g, '').slice(0, 5);
          createTiles(word);
        });
      }
      
      if (getSuggestionsBtn) getSuggestionsBtn.addEventListener('click', getSuggestions);
      const clearBtn = document.getElementById('wordle-solver-clear');
      if (clearBtn) clearBtn.addEventListener('click', () => {
        const wordInput = document.getElementById('word-input');
        if (wordInput) wordInput.value = '';
        const tiles = document.getElementById('wordle-solver-tiles');
        if (tiles) tiles.innerHTML = '';
        const results = document.getElementById('wordle-solver-results');
        if (results) { results.style.display = 'none'; results.innerHTML = ''; }
        const inputSection = document.querySelector('.manual-input-section');
        if (inputSection) inputSection.style.display = 'block';
      });

      // Hide/minimize toggle
      const hideToggle = document.getElementById('wordle-solver-hide-toggle');
      if (hideToggle) hideToggle.addEventListener('click', () => hideContainer());

      // Settings toggle and handlers
      const settingsToggle = document.getElementById('wordle-solver-settings-toggle');
      const settingsPanel = document.getElementById('wordle-solver-settings');
      if (settingsToggle && settingsPanel) {
        settingsToggle.addEventListener('click', async () => {
          const isVisible = settingsPanel.style.display === 'block';
          if (isVisible) { settingsPanel.style.display = 'none'; return; }
          settingsPanel.style.display = 'block';
          const statusEl = document.getElementById('wordle-solver-refresh-status');
          statusEl.textContent = 'Loading...';
          // Request wordlist info from page script
          try {
            const id = Math.random().toString(36).slice(2);
            const info = await new Promise((resolve, reject) => {
              const to = setTimeout(() => reject(new Error('Timeout')), 5000);
              const onMessage = (ev) => {
                const d = ev.data || {};
                if (d && d.source === 'wordle-solver-extension' && d.type === 'wordlist-info-response' && d.id === id) {
                  clearTimeout(to);
                  window.removeEventListener('message', onMessage);
                  resolve(d);
                }
              };
              window.addEventListener('message', onMessage);
              window.postMessage({ source: 'wordle-solver-extension', type: 'wordlist-info', id }, '*');
            });
            if (info && info.ok) {
              statusEl.textContent = `${info.count} words loaded`;
            } else {
              statusEl.textContent = `Error: ${info && info.error ? info.error : 'unknown'}`;
            }
          } catch (e) {
            statusEl.textContent = 'Error fetching info';
          }
        });
      }

      const refreshBtn = document.getElementById('wordle-solver-refresh');
      if (refreshBtn) refreshBtn.addEventListener('click', async () => {
        const statusEl = document.getElementById('wordle-solver-refresh-status');
        statusEl.textContent = 'Refreshing...';
        try {
          const id = Math.random().toString(36).slice(2);
          const resp = await new Promise((resolve, reject) => {
            const to = setTimeout(() => reject(new Error('Timeout')), 15000);
            const onMessage = (ev) => {
              const d = ev.data || {};
              if (d && d.source === 'wordle-solver-extension' && d.type === 'refresh-wordlist-response' && d.id === id) {
                clearTimeout(to);
                window.removeEventListener('message', onMessage);
                resolve(d);
              }
            };
            window.addEventListener('message', onMessage);
            window.postMessage({ source: 'wordle-solver-extension', type: 'refresh-wordlist', id }, '*');
          });
          if (resp && resp.ok) {
            statusEl.textContent = `Refreshed (${resp.count} words) from ${resp.source || 'unknown'}`;
          } else {
            statusEl.textContent = `Refresh failed: ${resp && resp.error ? resp.error : 'unknown'}`;
          }
        } catch (e) {
          const statusEl = document.getElementById('wordle-solver-refresh-status');
          statusEl.textContent = 'Refresh error';
        }
      });
    }, 100);

    // Initialize blank editable tiles so users can immediately type or toggle colors
    createTiles('');
  };

  // Create tiles for word (editable single-letter fields). Passing empty string creates 5 blank tiles.
  const createTiles = (word = '') => {
    const tilesContainer = document.getElementById('wordle-solver-tiles');
    if (!tilesContainer) return;

    tilesContainer.innerHTML = '';

    for (let i = 0; i < 5; i++) {
      const letter = (word[i] || '').toLowerCase();
      const tile = document.createElement('div');
      tile.className = 'manual-tile manual-tile-gray';
      tile.dataset.letter = letter;
      tile.dataset.state = 'absent';

      // input for the letter (single character)
      const input = document.createElement('input');
      input.type = 'text';
      input.maxLength = 1;
      input.className = 'tile-letter-input';
      input.value = (letter || '').toUpperCase();

      input.addEventListener('input', (e) => {
        const val = e.target.value.toLowerCase().replace(/[^a-z]/g, '').slice(0, 1);
        e.target.value = val.toUpperCase();
        tile.dataset.letter = val;
      });

      // Keep dataset in sync on deletions
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' || e.key === 'Delete') {
          setTimeout(() => { tile.dataset.letter = (input.value || '').toLowerCase(); }, 0);
        }
      });

      // cycle color when clicking tile but not when focusing or typing in the input
      tile.addEventListener('click', (ev) => {
        if (ev.target === input) return; // don't cycle when user is editing the letter
        const states = ['absent', 'present', 'correct'];
        const classes = ['manual-tile-gray', 'manual-tile-yellow', 'manual-tile-green'];
        const currentIdx = states.indexOf(tile.dataset.state);
        const nextIdx = (currentIdx + 1) % 3;
        tile.dataset.state = states[nextIdx];
        tile.className = 'manual-tile ' + classes[nextIdx];
      });

      tile.appendChild(input);
      tilesContainer.appendChild(tile);
    }
  }; 

  // Get suggestions from API
  const getSuggestions = async () => {
    let tiles = document.querySelectorAll('#wordle-solver-tiles .manual-tile');
    if (!tiles || tiles.length === 0) {
      // ensure tiles exist even if the user hasn't typed anything
      createTiles('');
      tiles = document.querySelectorAll('#wordle-solver-tiles .manual-tile');
    }

    const constraints = { correct: {}, present: {}, absent: new Set() };
    
    tiles.forEach((tile, index) => {
      // read letter from the embedded input if present (supports editable/blank tiles)
      const input = tile.querySelector('input.tile-letter-input');
      const letter = (input ? (input.value || '') : (tile.dataset.letter || '')).toLowerCase();
      const state = tile.dataset.state;

      // skip blank tiles -- they represent unknown letters
      if (!letter) return;

      if (state === 'correct') {
        constraints.correct[index] = letter;
      } else if (state === 'present') {
        if (!constraints.present[letter]) constraints.present[letter] = new Set();
        constraints.present[letter].add(index);
      } else if (state === 'absent') {
        let isPresentElsewhere = false;
        for (let i = 0; i < tiles.length; i++) {
          if (i !== index) {
            const otherInput = tiles[i].querySelector('input.tile-letter-input');
            const otherLetter = (otherInput ? (otherInput.value || '') : (tiles[i].dataset.letter || '')).toLowerCase();
            if (otherLetter === letter && (tiles[i].dataset.state === 'correct' || tiles[i].dataset.state === 'present')) {
              isPresentElsewhere = true;
              break;
            }
          }
        }
        if (!isPresentElsewhere) constraints.absent.add(letter);
      }
    });


    
    const resultsDiv = document.getElementById('wordle-solver-results');
    const inputSection = document.querySelector('.manual-input-section');
    if (resultsDiv) {
      resultsDiv.style.display = 'block';
      resultsDiv.innerHTML = '<div class="wordle-solver-loading">Getting suggestions...</div>';
    }
    if (inputSection) inputSection.style.display = 'none';

    // First, try the new message-based protocol to request suggestions
    try {
      // Serialize constraints for cross-frame messaging (avoid Sets)
      const serializedConstraints = {
        correct: { ...constraints.correct },
        present: Object.fromEntries(Object.entries(constraints.present || {}).map(([letter, set]) => [letter, Array.from(set)])),
        absent: Array.from(constraints.absent || [])
      };
      console.log('Wordle Solver: Requesting suggestions via message protocol:', serializedConstraints);

      const { id, promise } = startRequestSuggestions(serializedConstraints);
      currentRequestId = id;

      // Show a cancel button during the wait
      if (resultsDiv) {
        resultsDiv.innerHTML = '<div class="wordle-solver-loading">Getting suggestions... <button id="wordle-solver-cancel" class="get-suggestions-btn" style="margin-left:8px;">Cancel</button></div>';
        const cancelBtn = resultsDiv.querySelector('#wordle-solver-cancel');
        if (cancelBtn) cancelBtn.addEventListener('click', () => {
          cancelRequest(id);
          if (resultsDiv) { resultsDiv.style.display = 'none'; resultsDiv.innerHTML = ''; }
          if (inputSection) inputSection.style.display = 'block';
        });
      }

      const resp = await promise;
      currentRequestId = null;
      const suggestionsArr = Array.isArray(resp) ? resp : (resp && Array.isArray(resp.suggestions) ? resp.suggestions : null);
      const total = resp && typeof resp.total === 'number' ? resp.total : (suggestionsArr ? suggestionsArr.length : 0);
      if (!Array.isArray(suggestionsArr)) throw new Error('Invalid suggestions response');
      console.log('Wordle Solver: Received', suggestionsArr.length, 'suggestions via protocol (total possible:', total, ')');
      displaySuggestions(resp);
      return;
    } catch (err) {
      if (err && err.message && err.message.includes('Cancelled by user')) {
        // user cancelled; return quietly to input
        return;
      }
      console.warn('Wordle Solver: Message protocol failed or timed out, attempting direct call as fallback:', err.message || err);
    }

    // Fallback: attempt direct call into page-exposed API if available in this frame
    if (window.wordleSolver && typeof window.wordleSolver.getSuggestions === 'function') {
      try {
        console.log('Wordle Solver: Calling direct getSuggestions fallback with constraints:', constraints);
        const suggestions = await window.wordleSolver.getSuggestions({ guesses: [], constraints });
        displaySuggestions(suggestions);
        return;
      } catch (error) {
        console.error('Wordle Solver: Error getting suggestions directly:', error);
        if (resultsDiv) {
          resultsDiv.innerHTML = `<div class="wordle-solver-error">Error: ${error.message}</div><div style="margin-top:8px;display:flex;gap:8px;"><button id="wordle-solver-back" class="get-suggestions-btn">Enter New Guess</button><button id="wordle-solver-hide" class="get-suggestions-btn">Hide Solver</button></div>`;
          resultsDiv.style.display = 'block';
        }
        setTimeout(() => {
          const backBtn = document.getElementById('wordle-solver-back');
          if (backBtn) backBtn.addEventListener('click', () => {
            if (resultsDiv) { resultsDiv.style.display = 'none'; resultsDiv.innerHTML = ''; }
            if (inputSection) inputSection.style.display = 'block';
          });
          const hideBtn = document.getElementById('wordle-solver-hide');
          if (hideBtn) hideBtn.addEventListener('click', () => hideContainer());
        }, 50);
        return;
      }
    }

    // If we get here, no solver was available
    console.error('Wordle Solver: No solver available; attempting re-inject and showing error');
    if (window.injectWordleSolver) window.injectWordleSolver();
    if (resultsDiv) {
      resultsDiv.innerHTML = '<div class="wordle-solver-error">Solver not loaded. Please refresh the page or try again in a moment.</div><div style="margin-top:8px;display:flex;gap:8px;"><button id="wordle-solver-back" class="get-suggestions-btn">Enter New Guess</button><button id="wordle-solver-hide" class="get-suggestions-btn">Hide Solver</button></div>';
      resultsDiv.style.display = 'block';
    }
    // wire back/hide after DOM insert
    setTimeout(() => {
      const backBtn = document.getElementById('wordle-solver-back');
      if (backBtn) backBtn.addEventListener('click', () => {
        if (resultsDiv) { resultsDiv.style.display = 'none'; resultsDiv.innerHTML = ''; }
        if (inputSection) inputSection.style.display = 'block';
      });
      const hideBtn = document.getElementById('wordle-solver-hide');
      if (hideBtn) hideBtn.addEventListener('click', () => hideContainer());
    }, 50);
  };

  // Display suggestions
  const displaySuggestions = (payload) => {
    const content = document.getElementById('wordle-solver-content');
    if (!content) return;

    // payload may be either an array (legacy) or an object { suggestions: [...], total: N }
    const suggestions = Array.isArray(payload) ? payload : (payload && Array.isArray(payload.suggestions) ? payload.suggestions : []);
    const total = payload && typeof payload.total === 'number' ? payload.total : suggestions.length;

    if (suggestions.length === 0) {
      const resultsDiv = document.getElementById('wordle-solver-results');
      const inputSection = document.querySelector('.manual-input-section');
      if (resultsDiv) {
        resultsDiv.innerHTML = '<div class="wordle-solver-error">No suggestions found.</div><div style="margin-top:12px;display:flex;gap:8px;"><button id="wordle-solver-back" class="get-suggestions-btn">Enter New Guess</button><button id="wordle-solver-hide" class="get-suggestions-btn">Hide Solver</button></div>';
        resultsDiv.style.display = 'block';
      }
      if (inputSection) inputSection.style.display = 'none';
      setTimeout(() => {
        const backBtn = document.getElementById('wordle-solver-back');
        if (backBtn) backBtn.addEventListener('click', () => {
          if (resultsDiv) { resultsDiv.style.display = 'none'; resultsDiv.innerHTML = ''; }
          if (inputSection) inputSection.style.display = 'block';
        });
        const hideBtn = document.getElementById('wordle-solver-hide');
        if (hideBtn) hideBtn.addEventListener('click', () => hideContainer());
      }, 50);
      return;
    }

    let html = `<div class="wordle-solver-summary">Possible matches: <strong>${total}</strong></div><div class="wordle-solver-suggestions">`;
    suggestions.forEach((s, i) => {
      const entropyText = (typeof s.entropy === 'number') ? (s.entropy.toFixed(2) + ' bits') : '';
      html += `
        <div class="wordle-solver-suggestion">
          <div class="suggestion-rank">#${i + 1}</div>
          <div style="display:flex;align-items:center;gap:12px;"><div class="suggestion-word">${s.word.toUpperCase()}</div><div class="suggestion-entropy" style="color:#666;font-size:12px;">${entropyText}</div></div>
        </div>
      `;
    });
    html += '</div><div style="margin-top:12px;display:flex;gap:8px;"><button id="wordle-solver-back" class="get-suggestions-btn">Enter New Guess</button><button id="wordle-solver-copy" class="get-suggestions-btn">Copy Top</button></div>';

    const resultsDiv = document.getElementById('wordle-solver-results');
    const inputSection = document.querySelector('.manual-input-section');
    if (resultsDiv) {
      resultsDiv.innerHTML = html;
      resultsDiv.style.display = 'block';
    }
    if (inputSection) inputSection.style.display = 'none';

    const backBtn = document.getElementById('wordle-solver-back');
    if (backBtn) backBtn.addEventListener('click', () => {
      // Show the input again and clear results
      if (resultsDiv) { resultsDiv.style.display = 'none'; resultsDiv.innerHTML = ''; }
      if (inputSection) inputSection.style.display = 'block';
    });

    const copyBtn = document.getElementById('wordle-solver-copy');
    if (copyBtn) copyBtn.addEventListener('click', () => {
      // Copy the top suggestion to clipboard for convenience
      try {
        const top = (suggestions[0] && suggestions[0].word) ? suggestions[0].word : '';
        if (top && navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(top);
      } catch (e) {
        // ignore
      }
    });
  };

  // Initialize
  const init = () => {
    createUI();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
