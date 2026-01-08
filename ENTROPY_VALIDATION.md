# Word Entropy Validation System

This system provides tools to calculate word entropy scores and cross-check them against established metrics from information theory and natural language processing research.

## Overview

The system implements Shannon's entropy formula and provides comprehensive validation methods to ensure calculated entropy scores are correct.

## Components

### 1. WordEntropyCalculator.java

Calculates entropy scores for word distributions using Shannon's entropy formula:

```
H = -Σ p(x) * log₂(p(x))
```

**Key Methods:**
- `calculateEntropy(Map<String, Integer> wordFrequencies)` - Calculates entropy for a word frequency distribution
- `calculateWordEntropy(String word)` - Calculates character-level entropy for a single word
- `getMaximumEntropy(int vocabularySize)` - Returns maximum possible entropy (log₂(N))
- `calculateNormalizedEntropy(Map<String, Integer> wordFrequencies)` - Returns normalized entropy (0-1 scale)

### 2. EntropyValidator.java

Validates entropy scores against established metrics and theoretical bounds.

**Validation Methods:**

#### `validateEntropyBounds(double entropy, int vocabularySize)`
Validates that entropy is within theoretical bounds [0, log₂(N)].

**Metrics Checked:**
- Entropy ≥ 0 (entropy cannot be negative)
- Entropy ≤ log₂(vocabulary_size) (maximum entropy for given vocabulary)

#### `validateEntropyCalculation(Map<String, Integer> wordFrequencies, double claimedEntropy)`
Recalculates entropy and compares with claimed value to detect calculation errors.

**Metrics Checked:**
- Absolute difference between claimed and calculated entropy
- Uses epsilon tolerance for floating-point comparison

#### `validateUniformDistribution(Map<String, Integer> wordFrequencies, double entropy)`
For uniform distributions, validates that entropy equals log₂(N).

**Metrics Checked:**
- Distribution uniformity (all words have equal frequency)
- Entropy equals maximum possible entropy

#### `validateLinguisticRange(double entropy, boolean isNaturalLanguage)`
Validates against established natural language metrics.

**Metrics Checked:**
- Natural language word entropy typically ranges from 6-12 bits per word
- Based on research by Bentz et al. (arXiv:1606.06996)

#### `comprehensiveValidation(Map<String, Integer> wordFrequencies, double calculatedEntropy, boolean isNaturalLanguage)`
Runs all validation checks and returns detailed results.

## Established Metrics and Research

This validation system is based on the following established metrics:

### 1. Shannon's Entropy Formula (1948)
The fundamental formula for measuring information content:
- H = -Σ p(x) * log₂(p(x))
- Measures average information content in bits per word

### 2. Theoretical Bounds
- **Minimum Entropy:** 0 bits (deterministic distribution, single word)
- **Maximum Entropy:** log₂(N) bits (uniform distribution, N words equally likely)

### 3. Natural Language Entropy (Bentz et al., 2017)
Research on 1000+ languages found:
- Word-level entropy: typically 6-12 bits per word
- No natural language below 6 bits/word entropy
- Context reduces entropy by approximately 3 bits

**Reference:** "The Entropy of Words—Learnability and Expressivity across More than 1000 Languages"
- https://arxiv.org/abs/1606.06996
- https://www.mdpi.com/1099-4300/19/6/275

### 4. Information Theory Principles
- Uniform distributions maximize entropy
- Skewed distributions have lower entropy
- Adding context reduces entropy (conditional entropy)

## Usage Examples

### Basic Entropy Calculation

```java
WordEntropyCalculator calculator = new WordEntropyCalculator();

Map<String, Integer> wordFrequencies = new HashMap<>();
wordFrequencies.put("the", 50);
wordFrequencies.put("cat", 20);
wordFrequencies.put("sat", 15);

double entropy = calculator.calculateEntropy(wordFrequencies);
System.out.println("Entropy: " + entropy + " bits");
```

### Validation Example

```java
EntropyValidator validator = new EntropyValidator();

// Validate entropy bounds
ValidationResult result = validator.validateEntropyBounds(entropy, wordFrequencies.size());
System.out.println("Valid: " + result.isValid());
System.out.println("Message: " + result.getMessage());
System.out.println("Metrics: " + result.getMetrics());

// Comprehensive validation
List<ValidationResult> results = validator.comprehensiveValidation(
    wordFrequencies, entropy, false);
validator.printValidationReport(results);
```

### Error Detection

```java
// The validator can detect incorrect entropy calculations
double incorrectEntropy = 5.0;
ValidationResult check = validator.validateEntropyCalculation(
    wordFrequencies, incorrectEntropy);

if (!check.isValid()) {
    System.out.println("Error detected: " + check.getMessage());
    System.out.println("Metrics: " + check.getMetrics());
}
```

## Running the Demo

Compile and run the demonstration program:

```bash
javac WordEntropyCalculator.java EntropyValidator.java EntropyDemo.java
java EntropyDemo
```

The demo shows:
1. Uniform distribution (maximum entropy)
2. Skewed distribution (lower entropy)
3. Character-level entropy
4. Natural language simulation
5. Error detection capabilities

## Running Tests

Compile and run the test suite:

```bash
javac WordEntropyCalculator.java EntropyValidator.java EntropyTest.java
java EntropyTest
```

The test suite validates:
- Entropy calculations for various distributions
- Validation bounds checking
- Uniform distribution detection
- Linguistic range validation
- Error detection
- Edge cases (empty distributions, single words, zero frequencies)

## Key Features

✓ **Theoretical Validation:** Checks against mathematical bounds (0 to log₂(N))

✓ **Calculation Verification:** Recalculates entropy to detect errors

✓ **Uniform Distribution Detection:** Identifies when entropy should equal maximum

✓ **Linguistic Validation:** Compares against natural language research (6-12 bits)

✓ **Detailed Metrics:** Provides comprehensive diagnostic information

✓ **Error Detection:** Catches calculation mistakes and invalid values

## Validation Metrics Summary

| Validation Type | Metric | Range/Expected Value |
|----------------|--------|---------------------|
| Theoretical Bounds | Entropy | [0, log₂(N)] bits |
| Uniform Distribution | Entropy | = log₂(N) bits |
| Natural Language | Entropy | 6-12 bits/word |
| Normalized Entropy | Ratio | [0, 1] |

## References

1. Shannon, C.E. (1948). "A Mathematical Theory of Communication"
2. Bentz, C., et al. (2017). "The Entropy of Words—Learnability and Expressivity across More than 1000 Languages"
3. Cover, T.M. & Thomas, J.A. (2006). "Elements of Information Theory"

## Conclusion

This system provides a robust way to calculate word entropy and validate results against established metrics from information theory and linguistics research. The validation methods ensure that calculated entropy scores are mathematically correct and align with known properties of natural language distributions.
