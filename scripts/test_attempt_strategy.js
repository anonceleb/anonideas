#!/usr/bin/env node
const { compareCandidates } = require('./attempt_strategy');

function expectOrder(a, b, chancesLeft, expected) {
  const res = compareCandidates(a, b, chancesLeft);
  const ok = (res < 0 && expected === -1) || (res > 0 && expected === 1) || (res === 0 && expected === 0);
  console.log(`${ok ? '✓' : '✗'} compare ${a.word} vs ${b.word} at chancesLeft=${chancesLeft} => ${res} (expected ${expected})`);
  if (!ok) process.exitCode = 1;
}

console.log('=== Running attempt strategy tests ===');

// Higher winProbability should win on last attempts
const a = { word: 'alpha', entropy: 2.0, expectedRemaining: 3, winProbability: 0.2, freqScore: 10, posScore: 5 };
const b = { word: 'bravo', entropy: 3.0, expectedRemaining: 2, winProbability: 0.0, freqScore: 8, posScore: 4 };
expectOrder(a, b, 1, -1); // a should be preferred because higher winProbability

// If equal winProbability, smaller expectedRemaining wins
const c = { word: 'char', entropy: 2.5, expectedRemaining: 2, winProbability: 0.0, freqScore: 5, posScore: 3 };
const d = { word: 'delta', entropy: 2.5, expectedRemaining: 4, winProbability: 0.0, freqScore: 7, posScore: 3 };
expectOrder(c, d, 1, -1);

// When chances are high, entropy dominates
const e = { word: 'echo', entropy: 4.0, expectedRemaining: 10, winProbability: 0.0, freqScore: 1, posScore: 1 };
const f = { word: 'foxtrot', entropy: 2.0, expectedRemaining: 2, winProbability: 0.0, freqScore: 20, posScore: 10 };
expectOrder(e, f, 5, -1);

console.log('If no errors above, attempt strategy tests completed.');
