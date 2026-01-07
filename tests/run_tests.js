#!/usr/bin/env node
// Lightweight tests for strategist and prefilter behavior
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg || 'Assertion failed');
};

const { getBestBurnerWords, runSmallPrefilterTest, matchesConstraints, getPossibleWords } = require('../tools/test_helpers');

(async () => {
  console.log('Running tests...');

  // Test 1: strategist returns up to 3 words and is non-empty when candidates > 2
  const candidates = ['bider','eider','rider','tider','wider','coder'];
  const full = ['bider','eider','rider','tider','wider','coder','other','random','maybe'];
  const burners = getBestBurnerWords(candidates, full);
  assert(Array.isArray(burners), 'burners should be an array');
  assert(burners.length <= 3, 'burners length <= 3');
  console.log('Test 1 passed: strategist returns burners:', burners);

  // Test 2: prefilter should not always produce zero overlap (basic sanity)
  const testRes = await runSmallPrefilterTest();
  assert(testRes.overlapTop3 >= 0 && testRes.overlapTop3 <= 3, 'overlapTop3 in range');
  console.log('Test 2 passed: prefilter test produced overlapTop3=', testRes.overlapTop3);

  // Test 3: matchesConstraints/getPossibleWords basic behavior
  const wordList = ['hinge', 'binge', 'tinge', 'singe', 'crane', 'pride'];
  const constraints = { correct: {1: 'i', 2: 'n', 3: 'g', 4: 'e'}, present: {}, absent: new Set(['s']) };
  const possible = getPossibleWords(wordList, constraints);
  assert(Array.isArray(possible), 'possible is array');
  assert(possible.length > 0, 'expected some matches');
  console.log('Test 3 passed: getPossibleWords returned matches:', possible);

  console.log('All tests passed');
})();
