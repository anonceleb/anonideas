const { expect } = require('chai');
const { loadWordlistSync } = require('../../lib/wordlist');
const core = require('../../lib/solver_core');

describe('Tie-breaker behavior', function() {
  it('prefers sense for TENSE constraints when entropies tie', function() {
    const words = loadWordlistSync();
    const constraints = { correct: {1:'e',2:'n',3:'s',4:'e'}, present: {}, absent: new Set(['t']) };
    const possible = core.getPossibleWords(words, constraints);
    expect(possible.length).to.be.greaterThan(1);

    // compute letter frequency map
    const freq = {};
    words.forEach(w => w.split('').forEach(ch => freq[ch] = (freq[ch] || 0) + 1));
    const score = (w) => w.split('').reduce((s,ch)=> s + (freq[ch] || 0), 0);

    const scored = possible.map(w => ({ word: w, entropy: core.calculateExpectedInfo(w, possible), freqScore: score(w) }));
    scored.sort((a,b) => {
      const d = b.entropy - a.entropy;
      if (Math.abs(d) > 1e-9) return d;
      const f = b.freqScore - a.freqScore;
      if (f !== 0) return f;
      return a.word.localeCompare(b.word);
    });

    expect(scored[0].word).to.equal('sense');
  });

  it('prefers most common final letter for PLANE constraints when entropies and scores tie', function() {
    const words = loadWordlistSync();
    const constraints = { correct: {0:'p',1:'l',2:'a',3:'n'}, present: {}, absent: new Set(['e']) };
    const possible = core.getPossibleWords(words, constraints);
    expect(possible.length).to.be.greaterThan(1);

    // compute global letter frequency map for freqScore
    const freq = {};
    words.forEach(w => w.split('').forEach(ch => freq[ch] = (freq[ch] || 0) + 1));
    const score = (w) => w.split('').reduce((s,ch)=> s + (freq[ch] || 0), 0);

    // compute last-letter frequency among remaining possible words
    const lastCounts = {};
    possible.forEach(w => { const ch = w[4]; lastCounts[ch] = (lastCounts[ch] || 0) + 1; });
    const mostCommonLast = Object.keys(lastCounts).sort((a,b) => lastCounts[b] - lastCounts[a])[0];

    const scored = possible.map(w => ({ word: w, entropy: core.calculateExpectedInfo(w, possible), freqScore: score(w), posScore: lastCounts[w[4]] || 0 }));
    scored.sort((a,b) => {
      const d = b.entropy - a.entropy;
      if (Math.abs(d) > 1e-9) return d;
      const f = b.freqScore - a.freqScore;
      if (f !== 0) return f;
      const p = b.posScore - a.posScore;
      if (p !== 0) return p;
      return a.word.localeCompare(b.word);
    });

    // top suggestion should have the final letter that is most common among remaining possibilities
    expect(scored[0].word[4]).to.equal(mostCommonLast);
  });

  it('prefers most common middle letter for P L A _ E constraints when entropies tie', function() {
    const words = loadWordlistSync();
    const constraints = { correct: {0:'p',1:'l',2:'a',4:'e'}, present: {}, absent: new Set(['n']) };
    const possible = core.getPossibleWords(words, constraints);
    expect(possible.length).to.be.greaterThan(1);

    // compute global letter frequency map for freqScore
    const freq = {};
    words.forEach(w => w.split('').forEach(ch => freq[ch] = (freq[ch] || 0) + 1));
    const score = (w) => w.split('').reduce((s,ch)=> s + (freq[ch] || 0), 0);

    // compute middle-letter (index 3) frequency among remaining possible words
    const midCounts = {};
    possible.forEach(w => { const ch = w[3]; midCounts[ch] = (midCounts[ch] || 0) + 1; });
    const mostCommonMid = Object.keys(midCounts).sort((a,b) => midCounts[b] - midCounts[a])[0];

    const scored = possible.map(w => ({ word: w, entropy: core.calculateExpectedInfo(w, possible), freqScore: score(w), posScore: midCounts[w[3]] || 0 }));
    scored.sort((a,b) => {
      const d = b.entropy - a.entropy;
      if (Math.abs(d) > 1e-9) return d;
      const f = b.freqScore - a.freqScore;
      if (f !== 0) return f;
      const p = b.posScore - a.posScore;
      if (p !== 0) return p;
      return a.word.localeCompare(b.word);
    });

    // top suggestion should have the middle (index 3) letter that is most common among remaining possibilities
    expect(scored[0].word[3]).to.equal(mostCommonMid);
  });
});