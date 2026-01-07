// Background service worker for cross-origin fetches (used by content script)
'use strict';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return;

  if (message.type === 'fetch-url') {
    const url = message.url;
    fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    }).then(async (res) => {
      const text = await res.text();
      sendResponse({ ok: res.ok, status: res.status, statusText: res.statusText, text });
    }).catch((err) => {
      sendResponse({ ok: false, error: err.message || String(err) });
    });
    return true; // indicates we'll call sendResponse asynchronously
  }
});