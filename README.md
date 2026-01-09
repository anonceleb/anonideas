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

## Attempt-aware recommendations (new)

The solver now uses the number of guesses already made to shape recommendations for late-game decisions. Key points:

- Input: pass `gameState.attemptNumber` **as the number of guesses already used** (0-5) to `getSuggestions`.
- Behavior: the solver computes `chancesLeft = 6 - guessesUsed`. When `chancesLeft <= 4` it prioritizes candidates with a smaller `depthEstimate` (an inexpensive worst-case bound) and will prefer feasible candidates whose `depthEstimate <= chancesLeft` when available; otherwise it remains entropy-first.

### Wordlist refresh policy
- The extension requires a sufficiently large canonical word list to provide reliable suggestions. The minimum acceptable list size is **1000** words.
- Refresh flow: the content script will try the remote gist up to **2** times (with backoff) and only apply remote lists that meet the size threshold. If remote fails or returns a too-small list, it will attempt to use the bundled `data/wordlist.txt` — but only if that file is also the required size; otherwise the refresh will fail with an actionable error.
- If you see the message "Wordlist appears incomplete", run `node scripts/fetch_wordlist.js` locally to populate `data/wordlist.txt`, then reload the extension and click **Refresh wordlist**.

### Persistent session caching (optional)
- The extension includes an **opt-in persistent cache** that stores computed entropy results to `chrome.storage.local` for faster subsequent runs across page reloads. Enabling the toggle in the panel will persist the in-memory memoization to the browser storage (requires the `storage` permission). Turning it off clears or pauses persistence — the in-memory cache remains session-only by default.
- Output: each suggestion includes these diagnostic fields:
  - `chancesLeft`: number of guesses remaining including the current one
  - `depthLeft`: number of guesses remaining after the current guess
  - `depthEstimate`: approximate worst-case additional guesses needed (ceil(log2(max bucket size)))

Performance note: calculating `depthEstimate` requires computing pattern buckets for each candidate, which is cheap and scaleable for typical word lists used by the extension.
