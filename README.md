# Wordle Optimal Solver Chrome Extension

A Chrome Extension that analyzes your Wordle game and suggests the next 3 optimal words using information theory.

## Features

- 🎯 **Information Theory-Based Suggestions**: Uses entropy calculations to find words that maximize information gain
- 🤖 **AI Explanations**: Provides detailed explanations for why each word is suggested
- 🔍 **Real-Time Analysis**: Automatically reads your current game state from the Wordle website
- ✅ **Valid Word Verification**: Validates all suggestions against the official Wordle word list

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in the top right)
3. Click "Load unpacked"
4. Select the `wordle-solver-extension` folder
5. Navigate to [Wordle](https://www.nytimes.com/games/wordle) and start playing!

## How It Works

1. **Game State Extraction**: The extension reads the DOM of the Wordle page, including shadow DOM elements, to extract:
   - All your guesses
   - Tile colors (green = correct, yellow = present, gray = absent)

2. **Constraint Building**: Based on your guesses, it builds constraints:
   - **Correct**: Letters in their exact positions
   - **Present**: Letters that are in the word but in wrong positions
   - **Absent**: Letters that are not in the word

3. **Word Filtering**: Filters the valid Wordle word list to only words that match all constraints

4. **Information Theory Calculation**: For each candidate word, calculates the expected information (entropy) it would provide:
   - Simulates all possible outcomes (patterns of green/yellow/gray)
   - Calculates the entropy: -Σ(p × log₂(p))
   - Higher entropy = more information = better guess

5. **Suggestion Ranking**: Ranks words by expected information and suggests the top 3

## Usage

1. Go to [Wordle](https://www.nytimes.com/games/wordle)
2. Make at least one guess
3. The extension will automatically appear in the top-right corner
4. Click "Refresh" to update suggestions after each guess
5. Use "Hide" to minimize the panel

## Benchmarks & Tests

- Run the benchmark (Node 18+ required):

    node ./bench/benchmark.js

  This will fetch the official word list and run trials for different PREFILTER_THRESHOLD, BURNER_COUNT, and SAMPLE_SIZE options and print a summary table of overlap (vs full-entropy top3) and timings.

- Run simple unit tests (lightweight, no test framework required):

    npm test

  The tests validate `strategist` behavior, constraint filtering (`matchesConstraints` / `getPossibleWords`), and a basic prefilter overlap sanity check. If you want a more comprehensive test suite, I can add mocha/jest-based tests and CI configuration.

## Technical Details

- **Manifest Version**: 3 (latest Chrome extension format)
- **Word List Source**: [Valid Wordle Words](https://gist.githubusercontent.com/dracos/dd0668f281e685bad51479e5acaadb93/raw/valid-wordle-words.txt)
- **Algorithm**: Entropy-based information theory (similar to the approach used by optimal Wordle solvers)
- **Injection & Communication**: Uses a frame-targeted injection strategy and a `postMessage`-based protocol so the content script can reliably request suggestions from the injected page script even if the game runs inside an iframe.
- **Bundled wordlist & optional word frequencies**: The extension ships a bundled `data/wordlist.txt` and uses it by default. You can optionally include `data/word_freq.json` (a simple map of `{"word": numericScore}`) to bias suggestions toward more common words. If present, the solver uses `word_freq.json` to break ties and prefer popular words. This avoids CORS/scraping and is preferred for reliability, privacy, and store review friendliness.
- **Bridge API / Testing**: The content script exposes a `window.wordleSolverBridge` helper with `requestSuggestions`, `isReady`, and `inject` methods for debugging and automated testing. Messages serialize constraints (arrays) and the solver reconstructs Sets on receipt.

## Files

- `manifest.json`: Extension configuration
- `content.js`: Content script that reads DOM and displays UI
- `solver.js`: Core algorithm for word filtering and information theory calculations
- `styles.css`: Styling for the suggestion panel

## Privacy

This extension:
- Only runs on Wordle websites
- Does not collect or transmit any data
- All processing happens locally in your browser
- Only fetches the word list from the public GitHub Gist

## License

Free to use and modify.
