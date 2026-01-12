// Node test for content.js displayResults behavior using a minimal DOM shim
// Run: node scripts/test_displayResults.js

const path = require('path');

// Minimal DOM shim sufficient for content.js initialization and displayResults
(function setupMinimalDOM() {
  const elementsById = Object.create(null);

  function createElement(tag) {
    const el = {
      tagName: tag.toUpperCase(),
      children: [],
      className: '',
      style: {},
      attributes: Object.create(null),
      _innerHTML: '',
      textContent: '',
      value: '',
      disabled: false,
      remove: () => {},
      dataset: Object.create(null),
      focus: function() {},
      setAttribute: function(n, v) { this.attributes[n] = v; },
      addEventListener: function() {},
      appendChild: function(c) { this.children.push(c); return c; },
      className: '',
      querySelector: function(sel) {
        if (!sel) return null;
        if (sel.startsWith('#')) return elementsById[sel.slice(1)] || null;
        if (sel.startsWith('.')) {
          const cls = sel.slice(1);
          for (const c of this.children) {
            if (c && c.className && String(c.className).split(/\s+/).includes(cls)) return c;
          }
        }
        return null;
      }
    };

    // expose id property to map placeholders
    Object.defineProperty(el, 'id', {
      get: function() {
        for (const k of Object.keys(elementsById)) {
          if (elementsById[k] === el) return k;
        }
        return '';
      },
      set: function(v) { elementsById[v] = el; }
    });

    // define innerHTML getter/setter so setting it can create placeholders
    Object.defineProperty(el, 'innerHTML', {
      get: function() { return this._innerHTML; },
      set: function(html) {
        this._innerHTML = html || '';
        const idRegex = /id=\"([^\"]+)\"/g; let m;
        while ((m = idRegex.exec(this._innerHTML))) {
          const id = m[1];
          if (!elementsById[id]) {
            const placeholder = createElement('div');
            placeholder.id = id;
            elementsById[id] = placeholder;
          }
        }
      }
    });

    // For script elements, support src, onload
    if (tag === 'script') {
      el.src = '';
      el.onload = null;
    }

    return el;
  }

  // document-like object
  global.document = {
    body: { appendChild: (el) => { /* attach root */ global._root = el; } },
    head: { appendChild: (el) => { /* simulate script load */ if (el && typeof el.onload === 'function') { try { el.onload(); } catch(e) {} } } },
    documentElement: { appendChild: () => {} },
    createElement: createElement,
    querySelector: function(sel) {
      if (!sel) return null;
      if (sel.startsWith('#')) return elementsById[sel.slice(1)] || null;
      return null;
    }
  };

  global.window = global;
  global.navigator = { userAgent: 'node' };
  // minimal event system so content script can listen for messages
  global.addEventListener = global.window.addEventListener = function(name, cb) { global._listeners = global._listeners || {}; global._listeners[name] = cb; };
  global.removeEventListener = global.window.removeEventListener = function(name) { if (global._listeners) delete global._listeners[name]; };
  global.postMessage = global.window.postMessage = function(data, origin) { if (global._listeners && typeof global._listeners['message'] === 'function') { try { global._listeners['message']({ data: data }); } catch (e) {} } };

  // Minimal chrome stub used by content.js
  global.chrome = {
    runtime: { getURL: (p) => p },
    storage: { local: { get: (keys, cb) => cb({}), set: (obj) => {} } }
  };

})();

// Require the content script which will run against the minimal DOM
const content = require(path.resolve(__dirname, '..', 'content.js')) || {};

if (!content._test) {
  console.error('Test hook not available (content._test missing)');
  process.exit(2);
}

const t = content._test;

// Set the detected rows words to include 'quark'
t.setLastDetectedRowsWords(['quark']);

// Prepare a suggestions response where the only suggestion is 'quark'
const suggestions = { suggestions: [ { word: 'quark', entropy: 1.23 } ], total: 1 };

// Call displayResults and inspect the DOM
try {
  t.displayResults(suggestions);
  const resultsEl = document.querySelector('#wordle-solver-results');
  const html = resultsEl && resultsEl.innerHTML ? resultsEl.innerHTML : '';
  // Expect to see a line that indicates Previously played matches: QUARK
  if (html.toUpperCase().includes('PREVIOUSLY PLAYED MATCHES') && html.includes('QUARK')) {
    console.log('TEST PASSED: QUARK is listed as previously-played (filtered)');
  } else {
    console.error('TEST FAILED: Expected QUARK to be shown as previously-played. DOM output:');
    console.error(html);
    process.exit(1);
  }
} catch (e) {
  console.error('TEST ERROR', e);
  process.exit(3);
}

// --- New test: when the detected rows show a completed game, we should show a concise completion message ---
try {
  // Simulate a winning row (all tiles correct)
  const winRow = [ { letter: 'q', state: 'correct', idx: 0 }, { letter: 'u', state: 'correct', idx: 1 }, { letter: 'a', state: 'correct', idx: 2 }, { letter: 'r', state: 'correct', idx: 3 }, { letter: 'k', state: 'correct', idx: 4 } ];
  t.setLastDetectedRows([ winRow ]);
  // still mark quark as previously played
  t.setLastDetectedRowsWords(['quark']);

  // Re-render display results (should show completion message)
  t.displayResults(suggestions);
  const resultsEl2 = document.querySelector('#wordle-solver-results');
  const html2 = resultsEl2 && resultsEl2.innerHTML ? resultsEl2.innerHTML : '';
  if (html2.toUpperCase().includes('WORDLE COMPLETED')) {
    console.log('TEST PASSED: Completed-game message displayed');
  } else {
    console.error('TEST FAILED: Expected completed-game message. DOM output:');
    console.error(html2);
    process.exit(2);
  }

  // Now exercise the detection summary UI: call showDetectionSummary with a detection object
  try {
    const det = { success: true, rows: [ winRow ], constraints: { correct: {0:'q',1:'u',2:'a',3:'r',4:'k' }, present: {}, absent: [] } };
    t.showDetectionSummary(det);
    const summaryText = document.querySelector('#ws-detect-summary-text');
    const useBtn = document.querySelector('#ws-use-detection');
    const summaryHtml = summaryText && summaryText.innerHTML ? summaryText.innerHTML : '';

    // Summary HTML should not include the 'Detected — Present' line and Use & Suggest button should be hidden
    const wlParent = document.querySelector('#ws-wordlist');
    if (!summaryHtml.toUpperCase().includes('DETECTED — PRESENT') && useBtn && useBtn.style && useBtn.style.display === 'none' && wlParent && wlParent.style && wlParent.style.display === 'none') {
      console.log('TEST PASSED: Detection summary hidden and Use & Suggest button hidden on completed game');
      console.log('TEST PASSED: Word list hidden on completed game');
      process.exit(0);
    } else {
      console.error('TEST FAILED: Detection summary, Use button, or Word list not correctly hidden.');
      console.error('summaryHtml:', summaryHtml);
      console.error('useBtn.style.display:', useBtn && useBtn.style && useBtn.style.display);
      console.error('wlParent.style.display:', wlParent && wlParent.style && wlParent.style.display);
      process.exit(3);
    }
  } catch (e) {
    console.error('TEST ERROR', e);
    process.exit(3);
  }
} catch (e) {
  console.error('TEST ERROR', e);
  process.exit(3);
}
