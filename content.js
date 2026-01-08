// Minimal content script stub — injects solver into the page context and forwards messages
(function(){
  'use strict';
  // Inject solver script into page so it runs in page context
  const s = document.createElement('script');
  s.src = chrome.runtime.getURL('solver.js');
  s.onload = () => s.remove();
  (document.head || document.documentElement).appendChild(s);

  // Relay messages between page and extension (pass-through for tests)
  window.addEventListener('message', (ev) => {
    const d = ev.data || {};
    if (d && d.source === 'wordle-solver-extension') {
      // Forward to extension (if needed)
      chrome.runtime.sendMessage(d);
    }
  });
})();
