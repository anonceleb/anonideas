const { expect } = require('chai');
const path = require('path');
const { loadWordlistSync, loadWordlist } = require('../../lib/wordlist');

describe('Bundled wordlist', function() {
  it('sync loads and has valid words', function() {
    const words = loadWordlistSync();
    expect(words).to.be.an('array');
    expect(words.length).to.be.at.least(100);
    for (const w of words) {
      expect(w).to.match(/^[a-z]{5}$/);
    }
    // no duplicates
    const set = new Set(words);
    expect(set.size).to.equal(words.length);
  });

  it('async loads and returns same content', async function() {
    const asyncWords = await loadWordlist();
    const syncWords = loadWordlistSync();
    expect(asyncWords.length).to.equal(syncWords.length);
    expect(asyncWords[0]).to.equal(syncWords[0]);
  });
});
