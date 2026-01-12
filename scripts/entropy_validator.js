// Entropy validation utilities ported from the Java validation system
// Provides Shannon entropy calculation and validation helpers

function log2(x) {
  return Math.log(x) / Math.log(2);
}

function calculateEntropy(freqMap) {
  if (!freqMap || Object.keys(freqMap).length === 0) return 0.0;
  const values = Object.values(freqMap).map(v => Number(v));
  const total = values.reduce((s, v) => s + v, 0);
  if (total === 0) return 0.0;
  let entropy = 0.0;
  for (const f of values) {
    if (f > 0) {
      const p = f / total;
      entropy -= p * (Math.log(p) / Math.log(2));
    }
  }
  return entropy;
}

function calculateWordEntropy(word) {
  if (!word || word.length === 0) return 0.0;
  const counts = Object.create(null);
  for (const ch of word) counts[ch] = (counts[ch] || 0) + 1;
  let entropy = 0.0;
  const len = word.length;
  for (const f of Object.values(counts)) {
    if (f > 0) {
      const p = f / len;
      entropy -= p * (Math.log(p) / Math.log(2));
    }
  }
  return entropy;
}

function getMaximumEntropy(vocabSize) {
  if (vocabSize <= 0) return 0.0;
  return Math.log(vocabSize) / Math.log(2);
}

function calculateNormalizedEntropy(freqMap) {
  if (!freqMap || Object.keys(freqMap).length <= 1) return 0.0;
  const entropy = calculateEntropy(freqMap);
  const max = getMaximumEntropy(Object.keys(freqMap).length);
  return max > 0 ? entropy / max : 0.0;
}

const EPSILON = 1e-10;

function validateEntropyBounds(entropy, vocabularySize) {
  const maxEntropy = getMaximumEntropy(vocabularySize);
  const metrics = {
    calculatedEntropy: entropy,
    vocabularySize,
    theoreticalMinimum: 0.0,
    theoreticalMaximum: maxEntropy
  };
  if (entropy < -EPSILON) return { valid: false, message: `Entropy cannot be negative. Got: ${entropy}`, metrics };
  if (entropy > maxEntropy + EPSILON) return { valid: false, message: `Entropy ${entropy} exceeds maximum possible entropy ${maxEntropy} for vocabulary size ${vocabularySize}`, metrics };
  return { valid: true, message: 'Entropy is within valid theoretical bounds', metrics };
}

function validateEntropyCalculation(freqMap, claimedEntropy) {
  const calculated = calculateEntropy(freqMap);
  const diff = Math.abs(calculated - claimedEntropy);
  const metrics = { claimedEntropy, recalculatedEntropy: calculated, absoluteDifference: diff, vocabularySize: Object.keys(freqMap).length };
  if (diff < EPSILON) return { valid: true, message: 'Entropy calculation is correct', metrics };
  return { valid: false, message: `Entropy mismatch: claimed=${claimedEntropy}, calculated=${calculated}, difference=${diff}`, metrics };
}

function validateUniformDistribution(freqMap, entropy) {
  const uniqueFreqs = new Set(Object.values(freqMap));
  const isUniform = uniqueFreqs.size === 1;
  const metrics = { isUniform, entropy, vocabularySize: Object.keys(freqMap).length };
  if (!isUniform) return { valid: true, message: 'Distribution is not uniform (no validation needed)', metrics };
  const expected = getMaximumEntropy(Object.keys(freqMap).length);
  const diff = Math.abs(entropy - expected);
  metrics.expectedEntropy = expected;
  metrics.difference = diff;
  if (diff < EPSILON) return { valid: true, message: 'Uniform distribution entropy is correct (equals log2(N))', metrics };
  return { valid: false, message: `Uniform distribution entropy mismatch: expected=${expected}, got=${entropy}`, metrics };
}

function validateLinguisticRange(entropy, isNaturalLanguage) {
  const metrics = { entropy, isNaturalLanguage };
  if (!isNaturalLanguage) return { valid: true, message: 'Non-natural language text (linguistic validation skipped)', metrics };
  const MIN = 6.0, MAX = 12.0;
  metrics.expectedMinimum = MIN;
  metrics.expectedMaximum = MAX;
  if (entropy < MIN) return { valid: false, message: `Entropy ${entropy} is unusually low for natural language (expected ${MIN}-${MAX} bits)`, metrics };
  if (entropy > MAX) return { valid: false, message: `Entropy ${entropy} is unusually high for natural language (expected ${MIN}-${MAX} bits)`, metrics };
  return { valid: true, message: 'Entropy is within expected range for natural language', metrics };
}

function comprehensiveValidation(freqMap, calculatedEntropy, isNaturalLanguage) {
  const results = [];
  results.push(validateEntropyBounds(calculatedEntropy, Object.keys(freqMap).length));
  results.push(validateEntropyCalculation(freqMap, calculatedEntropy));
  results.push(validateUniformDistribution(freqMap, calculatedEntropy));
  if (isNaturalLanguage) results.push(validateLinguisticRange(calculatedEntropy, true));
  return results;
}

module.exports = {
  calculateEntropy,
  calculateWordEntropy,
  getMaximumEntropy,
  calculateNormalizedEntropy,
  validateEntropyBounds,
  validateEntropyCalculation,
  validateUniformDistribution,
  validateLinguisticRange,
  comprehensiveValidation,
  EPSILON
};
