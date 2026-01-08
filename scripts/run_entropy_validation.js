#!/usr/bin/env node
// Simple test runner for the entropy validator utilities
const assert = require('assert');
const v = require('./entropy_validator');

let testsRun = 0, testsPassed = 0, testsFailed = 0;

function ok(name, cond, message) {
  testsRun++;
  if (cond) { testsPassed++; console.log('✓', name); } else { testsFailed++; console.log('✗', name, '-', message || ''); }
}

function eq(name, expected, actual, delta = 1e-10) {
  testsRun++;
  if (Math.abs(expected - actual) <= delta) { testsPassed++; console.log('✓', name); } else { testsFailed++; console.log('✗', name, `Expected ${expected} but got ${actual}`); }
}

console.log('=== Running JS Entropy Validation Tests ===\n');

// Uniform distribution
(function testUniform() {
  console.log('\nTest: Uniform Distribution');
  const map = { a: 25, b: 25, c: 25, d: 25 };
  const entropy = v.calculateEntropy(map);
  eq('Uniform distribution entropy equals log2(N)', 2.0, entropy);
})();

// Skewed distribution
(function testSkewed() {
  console.log('\nTest: Skewed Distribution');
  const map = { a: 70, b: 20, c: 10 };
  const entropy = v.calculateEntropy(map);
  const p1 = 0.7, p2 = 0.2, p3 = 0.1;
  const expected = -(p1 * Math.log(p1) / Math.log(2) + p2 * Math.log(p2) / Math.log(2) + p3 * Math.log(p3) / Math.log(2));
  eq('Skewed distribution entropy calculation', expected, entropy);
  const maxEntropy = v.getMaximumEntropy(Object.keys(map).length);
  ok('Skewed entropy less than maximum', entropy < maxEntropy);
})();

// Single word
(function testSingle() {
  console.log('\nTest: Single Word');
  const m = { only: 100 };
  const entropy = v.calculateEntropy(m);
  eq('Single word entropy is zero', 0.0, entropy);
})();

// Empty distribution
(function testEmpty() {
  console.log('\nTest: Empty Distribution');
  const e = {};
  const entropy = v.calculateEntropy(e);
  eq('Empty distribution entropy is zero', 0.0, entropy);
})();

// Maximum entropy
(function testMax() {
  console.log('\nTest: Maximum Entropy');
  eq('Maximum entropy for 8 words', 3.0, v.getMaximumEntropy(8));
  eq('Maximum entropy for 16 words', 4.0, v.getMaximumEntropy(16));
  eq('Maximum entropy for 1024 words', 10.0, v.getMaximumEntropy(1024));
})();

// Normalized entropy
(function testNormalized() {
  console.log('\nTest: Normalized Entropy');
  const uniform = { a: 10, b: 10, c: 10 };
  const normalized = v.calculateNormalizedEntropy(uniform);
  eq('Normalized entropy for uniform distribution', 1.0, normalized);
  const skewed = { a: 90, b: 5, c: 5 };
  const skewedNormalized = v.calculateNormalizedEntropy(skewed);
  ok('Skewed distribution has lower normalized entropy', skewedNormalized < 1.0 && skewedNormalized > 0.0);
})();

// Character-level entropy
(function testCharEntropy() {
  console.log('\nTest: Character-level Entropy');
  const entropy1 = v.calculateWordEntropy('abcdef');
  eq('All unique characters entropy', Math.log(6) / Math.log(2), entropy1);
  const entropy2 = v.calculateWordEntropy('aaaa');
  eq('All same characters entropy', 0.0, entropy2);
  const entropy3 = v.calculateWordEntropy('');
  eq('Empty string entropy', 0.0, entropy3);
})();

// Validation bounds
(function testBounds() {
  console.log('\nTest: Validation Bounds');
  const res1 = v.validateEntropyBounds(2.0, 4);
  ok('Valid entropy within bounds', res1.valid === true);
  const res2 = v.validateEntropyBounds(-1.0, 4);
  ok('Negative entropy is invalid', res2.valid === false);
  const res3 = v.validateEntropyBounds(3.0, 4);
  ok('Entropy exceeding maximum is invalid', res3.valid === false);
})();

// Validation correctness
(function testValidationCorrectness(){
  console.log('\nTest: Validation Correctness');
  const words = { x: 10, y: 20, z: 30 };
  const correct = v.calculateEntropy(words);
  const r1 = v.validateEntropyCalculation(words, correct);
  ok('Correct entropy validates successfully', r1.valid === true);
  const r2 = v.validateEntropyCalculation(words, 5.0);
  ok('Incorrect entropy is detected', r2.valid === false);
})();

// Uniform validation
(function testUniformValidation() {
  console.log('\nTest: Uniform Distribution Validation');
  const u = { a: 15, b: 15, c: 15 };
  const ent = v.calculateEntropy(u);
  const r = v.validateUniformDistribution(u, ent);
  ok('Uniform distribution validates correctly', r.valid === true);
})();

// Linguistic range
(function testLinguisticRange() {
  console.log('\nTest: Linguistic Range Validation');
  const vld = v.validateLinguisticRange(8.5, true);
  ok('Entropy within linguistic range', vld.valid === true);
  const vlow = v.validateLinguisticRange(3.0, true);
  ok('Entropy below linguistic range detected', vlow.valid === false);
  const vhigh = v.validateLinguisticRange(15.0, true);
  ok('Entropy above linguistic range detected', vhigh.valid === false);
  const vskip = v.validateLinguisticRange(3.0, false);
  ok('Non-natural language skips linguistic validation', vskip.valid === true);
})();

// Zero frequencies
(function testZeros() {
  console.log('\nTest: Zero Frequencies');
  const w = { a: 0, b: 0, c: 0 };
  const ent = v.calculateEntropy(w);
  eq('All zero frequencies results in zero entropy', 0.0, ent);
})();

console.log('\n=== Test Results ===');
console.log('Total tests:', testsRun);
console.log('Passed:', testsPassed);
console.log('Failed:', testsFailed);

if (testsFailed === 0) {
  console.log('\n✓ All entropy validation tests passed!');
  // Run attempt-strategy tests as an additional safety check
  try {
    const { execSync } = require('child_process');
    console.log('\nRunning attempt strategy tests...');
    execSync('node scripts/test_attempt_strategy.js', { stdio: 'inherit' });
    console.log('\n✓ All strategy tests passed!');
    process.exit(0);
  } catch (e) {
    console.error('\n✗ Strategy tests failed or errored:', e && e.message ? e.message : e);
    process.exit(1);
  }
} else {
  console.log('\n✗ Some entropy validation tests failed!');
  process.exit(1);
}
