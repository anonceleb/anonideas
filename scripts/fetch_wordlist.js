#!/usr/bin/env node
// Fetch the canonical Wordle word list (from gist) and write to data/wordlist.txt for local testing
const https = require('https');
const fs = require('fs');
const url = 'https://gist.githubusercontent.com/dracos/dd0668f281e685bad51479e5acaadb93/raw/valid-wordle-words.txt';

console.log('Fetching wordlist from', url);
https.get(url, (res) => {
  if (res.statusCode !== 200) {
    console.error('Failed to fetch wordlist: status', res.statusCode);
    process.exit(1);
  }
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => {
    try {
      fs.mkdirSync('data', { recursive: true });
      fs.writeFileSync('data/wordlist.txt', data, 'utf8');
      console.log('Wrote data/wordlist.txt with', data.split(/\r?\n/).filter(Boolean).length, 'entries');
    } catch (e) {
      console.error('Failed to write file:', e.message);
      process.exit(1);
    }
  });
}).on('error', (e) => { console.error('Request failed:', e.message); process.exit(1); });
