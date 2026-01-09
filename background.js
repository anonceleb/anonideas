// Background service worker: support robust remote wordlist fetch
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { /* ready */ });

// Helper: fetch with timeout (AbortController)
async function fetchWithTimeout(url, timeoutMs = 12000) {
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

// Fetch remote wordlist with retries and backoff
async function fetchWordlistWithRetries(url, opts = {}) {
  const attempts = opts.attempts || 3;
  const timeoutMs = opts.timeoutMs || 12000;
  const baseBackoff = opts.baseBackoff || 800; // ms
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetchWithTimeout(url, timeoutMs);
      if (res && res.ok) {
        const text = await res.text();
        const count = text.split(/\r?\n/).filter(Boolean).length;
        return { ok: true, text, count, source: 'remote' };
      }
      throw new Error('HTTP ' + (res && res.status));
    } catch (err) {
      if (attempt === attempts) return { ok: false, error: err.message || String(err) };
      // exponential-ish backoff
      await new Promise(r => setTimeout(r, baseBackoff * attempt));
    }
  }
  return { ok: false, error: 'unknown' };
}

// Message handler: support 'fetch-wordlist-remote'
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'fetch-wordlist-remote') {
    // perform remote fetch and respond asynchronously
    (async () => {
      try {
        const url = msg.url || 'https://gist.githubusercontent.com/dracos/dd0668f281e685bad51479e5acaadb93/raw/valid-wordle-words.txt';
        const result = await fetchWordlistWithRetries(url, { attempts: 3, timeoutMs: 12000, baseBackoff: 800 });
        sendResponse(result);
      } catch (e) {
        sendResponse({ ok: false, error: e.message || String(e) });
      }
    })();
    return true; // will call sendResponse asynchronously
  }

  // Default echo for debugging
  sendResponse({ ok: true, echo: msg });
});
