// Wordle Optimal Solver - Core Algorithm
(function() {
  'use strict';

  let wordList = [];
  let wordListLoaded = false;



  // Load word list (prefer bundled `data/wordlist.txt` inside the extension)
  const parseTextToWordList = (text) => text.split(/\r?\n/)
    .map(w => w.trim().toLowerCase())
    .filter(w => w.length === 5 && /^[a-z]+$/.test(w));

  const loadWordList = async () => {
    if (wordListLoaded) return wordList;
    try {
      // Try fetching the bundled file via the content script (requests extension resource)
      try {
        const id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
        const wordlistText = await new Promise((resolve, reject) => {
          const onMessage = (event) => {
            const d = event.data || {};
            if (d && d.source === 'wordle-solver-extension' && d.type === 'fetch-wordlist-response' && d.id === id) {
              window.removeEventListener('message', onMessage);
              if (d.ok) resolve(d.text); else reject(new Error(d.error || 'Failed to fetch bundled wordlist'));
            }
          };
          window.addEventListener('message', onMessage);
          try {
            window.postMessage({ source: 'wordle-solver-extension', type: 'fetch-wordlist', id }, '*');
          } catch (e) {
            window.removeEventListener('message', onMessage);
            reject(e);
          }
        });
        const parsed = parseTextToWordList(wordlistText);
        if (parsed && parsed.length > 0) {
          wordList = parsed;
          wordListLoaded = true;
          return wordList;
        }
      } catch (e) {
        console.warn('Wordle Solver: Bundled wordlist fetch via content script failed:', e.message || e);
      }

      // Try local relative fetch (useful for test pages serving files)
      try {
        const resLocal = await fetch('data/wordlist.txt');
        if (resLocal && resLocal.ok) {
          const text = await resLocal.text();
          wordList = parseTextToWordList(text);
          wordListLoaded = true;
          return wordList;
        }
      } catch (e) {
        // ignore and fall through
      }

      // Fallback to original gist remote source if available
      const response = await fetch('https://gist.githubusercontent.com/dracos/dd0668f281e685bad51479e5acaadb93/raw/valid-wordle-words.txt');
      const text = await response.text();
      wordList = parseTextToWordList(text);
      wordListLoaded = true;
      return wordList;
    } catch (error) {
      console.warn('Wordle Solver: Could not load word list from bundled or remote; using tiny fallback', error);
      wordList = ['crane', 'slate', 'trace', 'least', 'stale'];
      wordListLoaded = true;
      return wordList;
    }
  }; 

  // Check if word matches constraints
  const matchesConstraints = (word, constraints) => {
    for (const [pos, letter] of Object.entries(constraints.correct)) {
      if (word[parseInt(pos)] !== letter) return false;
    }
    for (const letter of constraints.absent) {
      if (word.includes(letter)) {
        let allowed = false;
        for (let i = 0; i < word.length; i++) {
          if (word[i] === letter && constraints.correct[i] === letter) {
            allowed = true;
            break;
          }
          if (constraints.present[letter] && !constraints.present[letter].has(i)) {
            allowed = true;
            break;
          }
        }
        if (!allowed) return false;
      }
    }
    for (const [letter, positions] of Object.entries(constraints.present)) {
      if (!word.includes(letter)) return false;
      for (let i = 0; i < word.length; i++) {
        if (word[i] === letter && positions.has(i)) return false;
      }
    }
    return true;
  };

  // Get possible words
  const getPossibleWords = (constraints) => {
    return wordList.filter(word => matchesConstraints(word, constraints));
  };

  // Calculate pattern for guess against solution
  const getPattern = (guess, solution) => {
    const pattern = new Array(5).fill('absent');
    const solutionCounts = {};
    const guessCounts = {};

    for (let i = 0; i < solution.length; i++) {
      solutionCounts[solution[i]] = (solutionCounts[solution[i]] || 0) + 1;
    }

    for (let i = 0; i < guess.length; i++) {
      if (guess[i] === solution[i]) {
        pattern[i] = 'correct';
        guessCounts[guess[i]] = (guessCounts[guess[i]] || 0) + 1;
      }
    }

    for (let i = 0; i < guess.length; i++) {
      if (pattern[i] !== 'correct') {
        const letter = guess[i];
        const solutionCount = solutionCounts[letter] || 0;
        const guessCount = guessCounts[letter] || 0;
        if (solutionCount > guessCount) {
          pattern[i] = 'present';
          guessCounts[letter] = (guessCounts[letter] || 0) + 1;
        }
      }
    }

    return pattern.join(',');
  };

  // Calculate expected information (entropy)
  const calculateExpectedInfo = (guess, possibleWords) => {
    if (possibleWords.length === 0 || possibleWords.length === 1) return 0;

    const patternCounts = {};
    for (const solution of possibleWords) {
      const pattern = getPattern(guess, solution);
      patternCounts[pattern] = (patternCounts[pattern] || 0) + 1;
    }

    let entropy = 0;
    const total = possibleWords.length;
    for (const count of Object.values(patternCounts)) {
      const p = count / total;
      if (p > 0) entropy -= p * Math.log2(p);
    }

    return entropy;
  };



  // Get suggestions
  const getSuggestions = async (gameState) => {
    console.log('Wordle Solver: getSuggestions called with constraints:', gameState.constraints);

    await loadWordList();
    console.log('Wordle Solver: Word list loaded,', wordList.length, 'words');

    const wordSet = new Set(wordList);

    const hasConstraints = Object.keys(gameState.constraints.correct).length > 0 ||
      Object.keys(gameState.constraints.present).length > 0 ||
      (gameState.constraints.absent && gameState.constraints.absent.size > 0);

    if (!hasConstraints) {
      console.log('Wordle Solver: No constraints, suggesting THRUM');
      return [{
        word: 'thrum',
        explanation: 'Good starting word with common letters (T, H, R, U, M).'
      }];
    }

    // Get possible words
    const possibleWords = getPossibleWords(gameState.constraints);
    console.log('Wordle Solver: Found', possibleWords.length, 'possible words matching constraints');

    const numKnownCorrect = Object.keys(gameState.constraints.correct || {}).length;

    // If constraints are very tight (many known correct letters) or possible candidates are few,
    // prefer returning actual possibleWords so the user gets relevant actionable suggestions.
    if (numKnownCorrect >= 4 || possibleWords.length <= 10) {
      console.log('Wordle Solver: Constraints tight or few possibilities; returning possible words');
      const scoredPossible = possibleWords.map(w => ({ word: w, entropy: calculateExpectedInfo(w, possibleWords) }));
      scoredPossible.sort((a, b) => b.entropy - a.entropy);
      return scoredPossible.slice(0, 5).map(item => ({
        word: item.word,
        entropy: item.entropy,
        explanation: `Entropy: ${item.entropy.toFixed(2)} bits — expected reduction ≈ ${Math.max(1, Math.round(Math.pow(2, item.entropy)))}×. One of ${possibleWords.length} remaining possibilities.`
      }));
    }

    // Fetch from API
    // Use the bundled word list as primary candidate source
    const sourceCandidates = wordList.slice(0, 200);

    // Ensure possibleWords are prioritized in the candidate set and cap size for performance
    const candidatesSet = new Set([...possibleWords, ...sourceCandidates]);
    let candidatesArr = Array.from(candidatesSet);

    // Prefilter strategy: if candidate set is large, use strategist to pick informative 'burner' words
    const PREFILTER_THRESHOLD = 100; // when to trigger strategist prefilter
    const BURNER_COUNT = 10; // number of burners to request
    const SAMPLE_SIZE = 200; // sample size from source candidates to include
    if (candidatesArr.length > PREFILTER_THRESHOLD) {
      let burners = [];
      try {
        if (typeof window.getBestBurnerWords === 'function') {
          burners = window.getBestBurnerWords(possibleWords, wordList).slice(0, BURNER_COUNT);
          console.log('Wordle Solver: Strategist burners:', burners);
        } else {
          console.log('Wordle Solver: Strategist not available; skipping prefilter');
        }
      } catch (e) {
        console.warn('Wordle Solver: Error running strategist prefilter', e);
      }

      // Sample additional candidates from sourceCandidates (exclude already included)
      const sample = (arr, n) => {
        const out = [];
        for (let i = 0; i < arr.length && out.length < n; i++) {
          if (!candidatesSet.has(arr[i])) out.push(arr[i]);
        }
        return out;
      };

      const sampled = sample(sourceCandidates, SAMPLE_SIZE);
      const poolSet = new Set([...possibleWords, ...burners, ...sampled]);
      candidatesArr = Array.from(poolSet).slice(0, 500);
      console.log('Wordle Solver: Using prefiltered pool of', candidatesArr.length, 'candidates after strategist');
    } else {
      candidatesArr = candidatesArr.slice(0, 500);
      console.log('Wordle Solver: Using', candidatesArr.length, 'candidates for entropy calculation');
    }

    // Filter candidate pool to respect confirmed positions and simple present/absent rules (soft constraints)
    const satisfiesSoft = (word) => {
      // enforce correct positions
      for (const [pos, letter] of Object.entries(gameState.constraints.correct || {})) {
        if (word[parseInt(pos)] !== letter) return false;
      }
      // enforce present forbidden positions
      for (const [letter, positions] of Object.entries(gameState.constraints.present || {})) {
        for (const pos of positions) {
          if (word[parseInt(pos)] === letter) return false;
        }
      }
      // enforce absent letters (unless they are also in present/correct)
      for (const letter of Array.from(gameState.constraints.absent || [])) {
        const isAlsoPresent = gameState.constraints.present && gameState.constraints.present[letter];
        const isAlsoCorrect = Object.values(gameState.constraints.correct || {}).includes(letter);
        if (!isAlsoPresent && !isAlsoCorrect && word.includes(letter)) return false;
      }
      return true;
    };

    const filteredCandidates = candidatesArr.filter(satisfiesSoft);
    if (filteredCandidates.length === 0) {
      console.log('Wordle Solver: No candidates left after applying soft constraints; falling back to full pool');
    }
    const poolForScoring = filteredCandidates.length > 0 ? filteredCandidates : candidatesArr;

    // Calculate entropy for each candidate
    console.log('Wordle Solver: Calculating entropy for candidates...');
    const scored = poolForScoring.map((word, idx) => {
      if (idx % 20 === 0) console.log('Wordle Solver: Progress:', Math.round((idx / poolForScoring.length) * 100) + '%');
      return {
        word,
        entropy: calculateExpectedInfo(word, possibleWords)
      };
    });

    // Sort by entropy and return top 3 (include numeric entropy in payload)
    scored.sort((a, b) => b.entropy - a.entropy);
    console.log('Wordle Solver: Top suggestions:', scored.slice(0, 3).map(s => s.word + ' (' + s.entropy.toFixed(2) + ' bits)'));

    return scored.slice(0, 5).map((item, i) => ({
      word: item.word,
      entropy: item.entropy,
      explanation: `Entropy: ${item.entropy.toFixed(2)} bits — expected reduction ≈ ${Math.max(1, Math.round(Math.pow(2, item.entropy)))}×. Narrows ${possibleWords.length} remaining possibilities.`
    }));
  };

  // Expose solver to window and set up message protocol
  console.log('Wordle Solver: solver.js executing, exposing window.wordleSolver');
  window.wordleSolver = { getSuggestions };
  console.log('Wordle Solver: window.wordleSolver set:', typeof window.wordleSolver);

  // Notify content script that solver is ready
  try {
    window.postMessage({ source: 'wordle-solver-extension', type: 'solver-ready' }, '*');
  } catch (e) {
    console.warn('Wordle Solver: Could not post solver-ready message', e);
  }

  // Helper to normalize serialized constraints (arrays) into Sets as expected by getSuggestions
  const normalizeConstraints = (c = {}) => {
    const normalized = {
      correct: { ...c.correct },
      present: {},
      absent: new Set(Array.isArray(c.absent) ? c.absent : (c.absent || []))
    };
    for (const [letter, positions] of Object.entries(c.present || {})) {
      normalized.present[letter] = new Set(Array.isArray(positions) ? positions : []);
    }
    return normalized;
  };

  // Listen for requests from the content script
  window.addEventListener('message', async (event) => {
    const data = event.data || {};
    if (data.source !== 'wordle-solver-extension') return;
    if (data.type === 'get-suggestions') {
      const id = data.id;
      const payload = data.payload || {};
      try {
        const gameState = {
          guesses: payload.guesses || [],
          constraints: normalizeConstraints(payload.constraints || {})
        };
        const suggestions = await getSuggestions(gameState);
        window.postMessage({ source: 'wordle-solver-extension', type: 'suggestions', id, payload: suggestions }, '*');
      } catch (err) {
        window.postMessage({ source: 'wordle-solver-extension', type: 'suggestions-error', id, error: err.message || String(err) }, '*');
      }
    } else if (data.type === 'wordlist-info') {
      const id = data.id;
      try {
        await loadWordList();
        window.postMessage({ source: 'wordle-solver-extension', type: 'wordlist-info-response', id, ok: true, count: wordList.length }, '*');
      } catch (e) {
        window.postMessage({ source: 'wordle-solver-extension', type: 'wordlist-info-response', id, ok: false, error: e.message || String(e) }, '*');
      }
    } else if (data.type === 'refresh-wordlist') {
      const id = data.id;
      try {
        // Attempt to fetch the remote gist to refresh in-memory list (session-only)
        const GIST_URL = 'https://gist.githubusercontent.com/dracos/dd0668f281e685bad51479e5acaadb93/raw/valid-wordle-words.txt';
        let refreshed = false;
        try {
          const resp = await fetch(GIST_URL);
          if (resp && resp.ok) {
            const txt = await resp.text();
            const parsed = parseTextToWordList(txt);
            if (parsed && parsed.length > 0) {
              wordList = parsed;
              wordListLoaded = true;
              refreshed = true;
              window.postMessage({ source: 'wordle-solver-extension', type: 'refresh-wordlist-response', id, ok: true, count: wordList.length, source: 'gist' }, '*');
            }
          }
        } catch (e) {
          // gist fetch failed; try bundled via content script
        }

        if (!refreshed) {
          // attempt to fetch bundled list via content script
          try {
            const id2 = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
            const wordlistText = await new Promise((resolve, reject) => {
              const onMessage = (event2) => {
                const d = event2.data || {};
                if (d && d.source === 'wordle-solver-extension' && d.type === 'fetch-wordlist-response' && d.id === id2) {
                  window.removeEventListener('message', onMessage);
                  if (d.ok) resolve(d.text); else reject(new Error(d.error || 'Failed to fetch bundled wordlist'));
                }
              };
              window.addEventListener('message', onMessage);
              try {
                window.postMessage({ source: 'wordle-solver-extension', type: 'fetch-wordlist', id: id2 }, '*');
              } catch (e) {
                window.removeEventListener('message', onMessage);
                reject(e);
              }
            });
            const parsed = parseTextToWordList(wordlistText);
            if (parsed && parsed.length > 0) {
              wordList = parsed;
              wordListLoaded = true;
              refreshed = true;
              window.postMessage({ source: 'wordle-solver-extension', type: 'refresh-wordlist-response', id, ok: true, count: wordList.length, source: 'bundled' }, '*');
            }
          } catch (e) {
            // fall through
          }
        }

        if (!refreshed) {
          window.postMessage({ source: 'wordle-solver-extension', type: 'refresh-wordlist-response', id, ok: false, error: 'Failed to refresh wordlist from remote or bundled sources' }, '*');
        }
      } catch (e) {
        window.postMessage({ source: 'wordle-solver-extension', type: 'refresh-wordlist-response', id, ok: false, error: e.message || String(e) }, '*');
      }
    }
  });
})();
