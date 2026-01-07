const fs = typeof require !== 'undefined' && require && require('fs');

function parseWordlistText(text) {
  return text
    .split(/\r?\n/)
    .map(s => s.trim().toLowerCase())
    .filter(s => s.length === 5 && /^[a-z]{5}$/.test(s));
}

async function loadWordlist() {
  // Browser (extension) path
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL && typeof fetch !== 'undefined') {
    const url = chrome.runtime.getURL('data/wordlist.txt');
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch bundled wordlist: ' + res.status);
    const text = await res.text();
    return parseWordlistText(text);
  }

  // Generic fetch if available (e.g., test harness serving files)
  if (typeof fetch !== 'undefined') {
    try {
      const url = 'data/wordlist.txt';
      const res = await fetch(url);
      if (res.ok) {
        const text = await res.text();
        return parseWordlistText(text);
      }
    } catch (e) {
      // fallthrough to node reader
    }
  }

  // Node.js fallback
  if (fs && fs.readFileSync) {
    const text = fs.readFileSync(require('path').join(__dirname, '..', 'data', 'wordlist.txt'), 'utf8');
    return parseWordlistText(text);
  }

  throw new Error('No method available to load bundled wordlist');
}

function loadWordlistSync() {
  if (fs && fs.readFileSync) {
    const text = fs.readFileSync(require('path').join(__dirname, '..', 'data', 'wordlist.txt'), 'utf8');
    return parseWordlistText(text);
  }
  throw new Error('Synchronous load not available in this environment');
}

module.exports = { parseWordlistText, loadWordlist, loadWordlistSync };
