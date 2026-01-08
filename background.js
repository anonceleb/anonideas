// Minimal background service worker
self.addEventListener('install', (e) => {
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  // ready
});
// Accept simple messages for debug
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Echo message for now
  sendResponse({ ok: true, echo: msg });
});
