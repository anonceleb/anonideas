// Build a 5-letter word frequency JSON filtered to the extension's bundled word list
const https = require('https');
const fs = require('fs');
const path = require('path');

// Source: Hermit Dave FrequencyWords (https://github.com/hermitdave/FrequencyWords)
const SOURCE_URL = 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_50k.txt';

console.log('Fetching frequency source:', SOURCE_URL);
https.get(SOURCE_URL, (res) => {
  if (res.statusCode !== 200) {
    console.error('Failed to fetch source:', res.statusCode);
    process.exit(1);
  }
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const listLines = data.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      // parse lines like: word frequency
      const freq = Object.create(null);
      for (const line of listLines) {
        const parts = line.split(/\s+/);
        if (parts.length >= 2) {
          const w = parts[0].toLowerCase();
          const n = Number(parts[1].replace(/,/g, '')) || 0;
          freq[w] = n;
        }
      }

      // load bundled wordlist
      const wordlistText = fs.readFileSync(path.join(__dirname, '..', 'data', 'wordlist.txt'), 'utf8');
      const words = wordlistText.split(/\r?\n/).map(s => s.trim().toLowerCase()).filter(s => s.length === 5 && /^[a-z]{5}$/.test(s));

      const out = Object.create(null);
      for (const w of words) {
        out[w] = freq[w] || 0;
      }

      const outPath = path.join(__dirname, '..', 'data', 'word_freq.json');
      fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
      console.log('Wrote', outPath, 'with', Object.keys(out).length, 'entries');
    } catch (e) {
      console.error('Error building wordfreq:', e);
      process.exit(1);
    }
  });
}).on('error', (err) => {
  console.error('Failed to fetch:', err);
  process.exit(1);
});