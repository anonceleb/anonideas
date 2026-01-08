# anonideas

## Word Entropy Validation System

This repository includes a comprehensive system for calculating and validating word entropy scores against established metrics from information theory and natural language processing research.

### Features

- **Entropy Calculation**: Calculate Shannon entropy for word frequency distributions
- **Validation Against Established Metrics**: Cross-check entropy scores using:
  - Theoretical bounds (0 to log₂(N))
  - Uniform distribution properties
  - Natural language entropy ranges (6-12 bits per word)
  - Calculation verification through recalculation
- **Character-Level Entropy**: Analyze individual words at the character level
- **Comprehensive Testing**: Full test suite validating all calculations

### Quick Start

```bash
# Compile the entropy validation system
javac WordEntropyCalculator.java EntropyValidator.java EntropyDemo.java EntropyTest.java

# Run the demo to see validation in action
java EntropyDemo

# Run tests to verify correctness
java EntropyTest
```

### Documentation

See [ENTROPY_VALIDATION.md](ENTROPY_VALIDATION.md) for detailed documentation including:
- How to use the system
- Established metrics and research references
- Validation methods explained
- Usage examples

### Components

1. **WordEntropyCalculator.java** - Calculates entropy scores using Shannon's formula
2. **EntropyValidator.java** - Validates entropy against established metrics
3. **EntropyDemo.java** - Demonstration of the validation system
4. **EntropyTest.java** - Comprehensive test suite

### Research References

The validation system is based on established research:
- Shannon's Information Theory (1948)
- "The Entropy of Words" by Bentz et al. (2017) - arXiv:1606.06996
- Natural language entropy typically ranges from 6-12 bits per word

---

## Streak-aware recommendations (new)

The solver now accepts the player's current attempt number and adjusts recommendations to prioritize saving a streak when attempts are limited. Key points:

- Input: pass `gameState.attemptNumber` (1-6) to `getSuggestions`.
- Behavior: when the remaining attempts are low (2 or fewer), the solver prioritizes words that maximize the immediate chance of success and minimize expected remaining candidates. For earlier attempts the solver keeps the entropy-first strategy.
- Opt-out / Rollback: set `gameState.options = { optimizeForStreak: false }` to restore legacy behavior (entropy-first sorting). If a revert is necessary, run `git revert <commit>` for the change commit.
- Output: each suggestion now includes additional diagnostic fields:
  - `chancesLeft`: number of guesses remaining including the current one
  - `depthLeft`: number of guesses remaining after the current guess
  - `expectedRemaining`: estimated expected number of remaining candidate words after making the guess
  - `winProbability`: estimated probability the guess is the solution (uniform assumption over possible words)

Performance note: the new calculations compute pattern distributions to calculate expected remaining candidates — this can add CPU overhead for large candidate pools. Use `optimizeForStreak: false` to skip the streak-aware sorting if you notice performance impact.
