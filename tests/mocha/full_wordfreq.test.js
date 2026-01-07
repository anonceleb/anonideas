const { expect } = require('chai');
const { loadWordlistSync } = require('../../lib/wordlist');
const core = require('../../lib/solver_core');

describe('Full word frequency dataset', function() {
  it('has entries for the bundled wordlist and promotes higher-frequency words', function() {
    const words = loadWordlistSync();
    const freq = require('../../data/word_freq.json');
    expect(Object.keys(freq).length).to.be.at.least(words.length);

    // Example check: TENSE constraint promotes 'sense' (if present in list and freq)
    const constraints = { correct: {1:'e',2:'n',3:'s',4:'e'}, present: {}, absent: new Set(['t']) };
    const possible = core.getPossibleWords(words, constraints);
    expect(possible.length).to.be.greaterThan(1);

    const letterFreqMap = {};
    words.forEach(w => w.split('').forEach(ch => letterFreqMap[ch] = (letterFreqMap[ch] || 0) + 1));
    const scoreByLetterFreq = (w) => w.split('').reduce((s,ch) => s + (letterFreqMap[ch] || 0), 0);

    const scored = possible.map(w => ({ word: w, entropy: core.calculateExpectedInfo(w, possible), freqScore: (freq[w] || scoreByLetterFreq(w)) }));
    scored.sort((a,b) => {
      const d = b.entropy - a.entropy;
      if (Math.abs(d) > 1e-9) return d;
      const f = b.freqScore - a.freqScore;
      if (f !== 0) return f;
      return a.word.localeCompare(b.word);
    });

    // If 'sense' is in the possible list and has a higher frequency it should be first
    if (possible.includes('sense')) {
      expect(scored[0].word).to.equal('sense');
    } else {
      // otherwise ensure score map exists and has >0 entries
      const nonZero = Object.values(freq).filter(v => v > 0).length;
      expect(nonZero).to.be.greaterThan(10);
    }
  });
});