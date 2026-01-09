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
          if (parsed.length < 1000) throw new Error('bundled-too-small');
          wordList = parsed;
          wordListLoaded = true;
          return wordList;
        }
      } catch (e) {
        console.warn('Wordle Solver: Bundled wordlist fetch via content script failed or too small:', e.message || e);
      }

      // Try local relative fetch (useful for test pages serving files)
      try {
        const resLocal = await fetch('data/wordlist.txt');
        if (resLocal && resLocal.ok) {
          const text = await resLocal.text();
          const parsed = parseTextToWordList(text);
          if (!parsed || parsed.length < 1000) throw new Error('local-too-small');
          wordList = parsed;
          wordListLoaded = true;
          return wordList;
        }
      } catch (e) {
        console.warn('Wordle Solver: Local relative fetch failed or too small:', e.message || e);
      }

      // Fallback to original gist remote source if available
      const response = await fetch('https://gist.githubusercontent.com/dracos/dd0668f281e685bad51479e5acaadb93/raw/valid-wordle-words.txt');
      const text = await response.text();
      const parsed = parseTextToWordList(text);
      if (!parsed || parsed.length < 1000) throw new Error('remote-too-small');
      wordList = parsed;
      wordListLoaded = true;
      return wordList;
    } catch (error) {
      console.warn('Wordle Solver: Could not load a sufficiently large word list; please refresh the wordlist (or run scripts/fetch_wordlist.js)', error);
      // Do not silently fall back to a tiny list — signal failure to caller
      throw new Error('wordlist-missing');
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

  // Simple session cache to avoid recomputing entropy/depth for the same guess + candidate signature
  const _entropyCache = new Map();
  const _makeCandidatesKey = (possibleWords) => {
    if (!possibleWords || possibleWords.length === 0) return '0';
    const n = possibleWords.length;
    // include length and a few sample words (first 3 and last 2) to make the signature cheap but reasonably unique
    const s0 = possibleWords[0] || '';
    const s1 = possibleWords[1] || '';
    const s2 = possibleWords[2] || '';
    const sl1 = possibleWords[Math.max(0, n-1)] || '';
    const sl2 = possibleWords[Math.max(0, n-2)] || '';
    return `${n}:${s0}:${s1}:${s2}:${sl2}:${sl1}`;
  };

  // Calculate expected information (entropy) and a cheap depth estimate for a guess
  // Returns an object: { entropy: Number, depthEstimate: Number }
  const calculateExpectedInfo = (guess, possibleWords) => {
    if (!possibleWords || possibleWords.length === 0 || possibleWords.length === 1) return { entropy: 0, depthEstimate: 0 };

    const key = guess + '|' + _makeCandidatesKey(possibleWords);
    if (_entropyCache.has(key)) return _entropyCache.get(key);

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

    // depthEstimate: cheap worst-case estimate based on largest bucket size
    let maxCount = 0;
    for (const count of Object.values(patternCounts)) {
      if (count > maxCount) maxCount = count;
    }
    const depthEstimate = maxCount <= 1 ? 0 : Math.ceil(Math.log2(maxCount));

    const out = { entropy, depthEstimate };
    try { _entropyCache.set(key, out); } catch (e) { /* ignore cache set errors */ }
    // Notify content script so it may optionally persist this entry
    try { window.postMessage({ source: 'wordle-solver-extension', type: 'entropy-cache-put', key, value: out }, '*'); } catch (e) {}
    return out;
  };



  // Get suggestions
  const getSuggestions = async (gameState, reqId) => {
    console.log('Wordle Solver: getSuggestions called with constraints:', gameState.constraints, 'id:', reqId);

    // signal start to the UI (if an id is provided)
    try { if (reqId) window.postMessage({ source: 'wordle-solver-extension', type: 'suggestions-start', id: reqId }, '*'); } catch (e) {}

    await loadWordList();
    console.log('Wordle Solver: Word list loaded,', wordList.length, 'words');

    const wordSet = new Set(wordList);

    const hasConstraints = Object.keys(gameState.constraints.correct).length > 0 ||
      Object.keys(gameState.constraints.present).length > 0 ||
      (gameState.constraints.absent && gameState.constraints.absent.size > 0);

    if (!hasConstraints) {
      console.log('Wordle Solver: No constraints, suggesting THRUM');
      return { suggestions: [{
        word: 'thrum',
        entropy: 0,
        explanation: 'Good starting word with common letters (T, H, R, U, M).'
      }], total: wordList.length };
    }

    // Get possible words
    const possibleWords = getPossibleWords(gameState.constraints);
    console.log('Wordle Solver: Found', possibleWords.length, 'possible words matching constraints');

    if (possibleWords.length === 0) {
      // Diagnostic: sample why common candidate words were rejected
      try {
        console.warn('Wordle Solver: No possible words matching constraints. Constraints:', JSON.stringify(gameState.constraints));
        const sample = [];
        for (const w of wordList.slice(0, 200)) {
          let reason = null;
          // correct mismatch
          for (const [pos, letter] of Object.entries(gameState.constraints.correct || {})) {
            if (w[parseInt(pos)] !== letter) { reason = `correct-mismatch pos ${pos} expected ${letter} got ${w[parseInt(pos)]}`; break; }
          }
          if (!reason) {
            // absent conflict
            for (const letter of Array.from(gameState.constraints.absent || [])) {
              if (w.includes(letter)) {
                let allowed = false;
                for (let i = 0; i < w.length; i++) {
                  if (w[i] === letter && gameState.constraints.correct[i] === letter) { allowed = true; break; }
                  if (gameState.constraints.present && gameState.constraints.present[letter] && !gameState.constraints.present[letter].has(i)) { allowed = true; break; }
                }
                if (!allowed) { reason = `absent-conflict letter ${letter}`; break; }
              }
            }
          }
          if (!reason) {
            // present checks
            for (const [letter, positions] of Object.entries(gameState.constraints.present || {})) {
              if (!w.includes(letter)) { reason = `present-missing letter ${letter}`; break; }
              for (let i = 0; i < w.length; i++) {
                if (w[i] === letter && positions.has(i)) { reason = `present-forbidden-pos ${letter} at ${i}`; break; }
              }
              if (reason) break;
            }
          }
          if (!reason) reason = 'unknown';
          sample.push({ word: w, reason });
          if (sample.length >= 10) break;
        }
        console.warn('Wordle Solver: Diagnostic sample (first 10 words):', sample);
      } catch (e) {
        console.warn('Wordle Solver: Diagnostic error', e);
      }
    }

    const numKnownCorrect = Object.keys(gameState.constraints.correct || {}).length;

    // If constraints are very tight (many known correct letters) or possible candidates are few,
    // prefer returning actual possibleWords so the user gets relevant actionable suggestions.
    if (numKnownCorrect >= 4 || possibleWords.length <= 10) {
      console.log('Wordle Solver: Constraints tight or few possibilities; returning possible words');

      // When candidate set is small or many correct letters are known, compute
      // tie-breaker scores (frequency and positional) so we don't fall back to
      // lexicographic ordering on ties.
      const computeLetterFreqMap = (list) => {
        const m = Object.create(null);
        list.forEach(w => {
          for (const ch of w) m[ch] = (m[ch] || 0) + 1;
        });
        return m;
      };
      const letterFreqMapLocal = computeLetterFreqMap(wordList);
      const scoreByLetterFreqLocal = (w) => {
        let s = 0;
        for (const ch of w) s += (letterFreqMapLocal[ch] || 0);
        return s;
      };

      const computePositionalFreq = (list) => {
        const arr = Array.from({ length: 5 }, () => Object.create(null));
        list.forEach(w => {
          for (let i = 0; i < 5; i++) {
            const ch = w[i];
            arr[i][ch] = (arr[i][ch] || 0) + 1;
          }
        });
        return arr;
      };
      const posFreqArrLocal = computePositionalFreq(possibleWords);

      const scoredPossible = possibleWords.map((w, idx) => {
        // small progress notifications for very small candidate sets
        if (idx % 10 === 0) {
          const pct = Math.round((idx / possibleWords.length) * 100);
          try { if (reqId) window.postMessage({ source: 'wordle-solver-extension', type: 'suggestions-progress', id: reqId, progress: pct }, '*'); } catch (e) {}
        }
        // compute positional score (only count unknown positions)
        let posScore = 0;
        for (let i = 0; i < 5; i++) {
          const isKnown = gameState && gameState.constraints && Object.prototype.hasOwnProperty.call(gameState.constraints.correct, i);
          if (!isKnown) posScore += (posFreqArrLocal[i][w[i]] || 0);
        }
        const { entropy, depthEstimate } = calculateExpectedInfo(w, possibleWords);
        return {
          word: w,
          entropy,
          depthEstimate,
          freqScore: scoreByLetterFreqLocal(w),
          posScore
        };
      });

      // Use attemptNumber as the number of guesses ALREADY USED (0-5). Compute remaining attempts accordingly.
      if (typeof gameState.attemptNumber === 'number') {
        const guessesUsed = gameState.attemptNumber;
        const remaining = Math.max(0, 6 - guessesUsed);

        // Sort: if few remaining attempts (<= threshold), prefer words with small depthEstimate
        scoredPossible.sort((a, b) => {
          if (remaining <= 4) {
            if (a.depthEstimate !== b.depthEstimate) return a.depthEstimate - b.depthEstimate;
            const d = b.entropy - a.entropy; if (Math.abs(d) > 1e-9) return d;
            const f = b.freqScore - a.freqScore; if (f !== 0) return f;
            const p = b.posScore - a.posScore; if (p !== 0) return p;
            return a.word.localeCompare(b.word);
          }
          // otherwise fallback to entropy, freq, pos, lexicographic
          const d = b.entropy - a.entropy; if (Math.abs(d) > 1e-9) return d;
          const f = b.freqScore - a.freqScore; if (f !== 0) return f;
          const p = b.posScore - a.posScore; if (p !== 0) return p;
          return a.word.localeCompare(b.word);
        });

        // Prefer feasible candidates within remaining depth when possible
        const feasible = scoredPossible.filter(s => (s.depthEstimate || 0) <= remaining);
        if (feasible.length > 0) scoredPossible.splice(0, scoredPossible.length, ...feasible);

        return { suggestions: scoredPossible.slice(0, 5).map(item => ({
          word: item.word,
          entropy: item.entropy,
          explanation: `Entropy: ${item.entropy.toFixed(2)} bits — narrows to ${possibleWords.length} remaining possibilities.`,
          chancesLeft: remaining,
          depthLeft: Math.max(0, remaining - 1),
          depthEstimate: item.depthEstimate
        })), total: possibleWords.length };
      }

      // legacy ordering
      scoredPossible.sort((a, b) => {
        const d = b.entropy - a.entropy;
        if (Math.abs(d) > 1e-9) return d;
        const f = b.freqScore - a.freqScore;
        if (f !== 0) return f;
        const p = b.posScore - a.posScore;
        if (p !== 0) return p;
        return a.word.localeCompare(b.word);
      });

      return { suggestions: scoredPossible.slice(0, 5).map(item => ({
        word: item.word,
        entropy: item.entropy,
        explanation: `Entropy: ${item.entropy.toFixed(2)} bits — narrows to ${possibleWords.length} remaining possibilities.`,
        chancesLeft: undefined,
        depthLeft: undefined,
        depthEstimate: item.depthEstimate
      })), total: possibleWords.length };
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

    // Precompute letter-frequency map (used for tie-breaking)
    const computeLetterFreqMap = (list) => {
      const m = Object.create(null);
      list.forEach(w => {
        for (const ch of w) m[ch] = (m[ch] || 0) + 1;
      });
      return m;
    };

    const letterFreqMap = computeLetterFreqMap(wordList);
    const scoreByLetterFreq = (w) => {
      let s = 0;
      for (const ch of w) s += (letterFreqMap[ch] || 0);
      return s;
    };

    // Compute positional letter frequency map derived from the remaining possible words
    // This helps prefer candidates whose letters are more common in each unknown position
    const computePositionalFreq = (list) => {
      const arr = Array.from({ length: 5 }, () => Object.create(null));
      list.forEach(w => {
        for (let i = 0; i < 5; i++) {
          const ch = w[i];
          arr[i][ch] = (arr[i][ch] || 0) + 1;
        }
      });
      return arr;
    };

    const posFreqArr = computePositionalFreq(possibleWords);

    // Attempt to load optional bundled word frequency JSON (word -> numeric score)
    let wordFreqMap = null;
    try {
      const idFreq = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
      const freqText = await new Promise((resolve, reject) => {
        const to = setTimeout(() => reject(new Error('Timeout loading word freq')), 3000);
        const onMessage = (ev) => {
          const d = ev.data || {};
          if (d && d.source === 'wordle-solver-extension' && d.type === 'fetch-wordfreq-response' && d.id === idFreq) {
            clearTimeout(to);
            window.removeEventListener('message', onMessage);
            if (d.ok) resolve(d.text); else reject(new Error(d.error || 'no data'));
          }
        };
        window.addEventListener('message', onMessage);
        try {
          window.postMessage({ source: 'wordle-solver-extension', type: 'fetch-wordfreq', id: idFreq }, '*');
        } catch (e) {
          window.removeEventListener('message', onMessage);
          reject(e);
        }
      });
      try {
        const parsed = JSON.parse(freqText || '{}');
        if (parsed && typeof parsed === 'object') wordFreqMap = parsed;
      } catch (e) {
        // ignore parse errors
      }
    } catch (e) {
      // no freq data available; that's fine
    }

    const scored = poolForScoring.map((word, idx) => {
      if (idx % 20 === 0) {
        const pct = Math.round((idx / poolForScoring.length) * 100);
        console.log('Wordle Solver: Progress:', pct + '%');
        try { if (reqId) window.postMessage({ source: 'wordle-solver-extension', type: 'suggestions-progress', id: reqId, progress: pct }, '*'); } catch (e) {}
      }
      // compute positional score across unknown positions (favor letters common among remaining possibilities)
      let posScore = 0;
      for (let i = 0; i < 5; i++) {
        if (!(gameState.constraints && gameState.constraints.correct && Object.prototype.hasOwnProperty.call(gameState.constraints.correct, i))) {
          posScore += (posFreqArr[i][word[i]] || 0);
        }
      }

      const { entropy, depthEstimate } = calculateExpectedInfo(word, possibleWords);

      return {
        word,
        entropy,
        depthEstimate,
        freqScore: (wordFreqMap && typeof wordFreqMap[word] === 'number') ? wordFreqMap[word] : scoreByLetterFreq(word),
        posScore
      };
    });

    // Use attemptNumber as the number of guesses already used (0-5); compute remaining
    if (typeof gameState.attemptNumber === 'number') {
      const guessesUsed = gameState.attemptNumber;
      const remaining = Math.max(0, 6 - guessesUsed);

      // Sort by depthEstimate when few remaining (<= threshold), else by entropy
      scored.sort((a, b) => {
        if (remaining <= 4) {
          if (a.depthEstimate !== b.depthEstimate) return a.depthEstimate - b.depthEstimate;
          const d = b.entropy - a.entropy; if (Math.abs(d) > 1e-9) return d;
          const f = b.freqScore - a.freqScore; if (f !== 0) return f;
          const p = b.posScore - a.posScore; if (p !== 0) return p;
          return a.word.localeCompare(b.word);
        }
        const d = b.entropy - a.entropy; if (Math.abs(d) > 1e-9) return d;
        const f = b.freqScore - a.freqScore; if (f !== 0) return f;
        const p = b.posScore - a.posScore; if (p !== 0) return p;
        return a.word.localeCompare(b.word);
      });

      // Prefer feasible candidates within remaining depth when possible
      const feasible = scored.filter(s => (s.depthEstimate || 0) <= remaining);
      const pool = feasible.length > 0 ? feasible : scored;

      console.log('Wordle Solver: Top suggestions:', pool.slice(0, 5).map(s => s.word + ' (' + s.entropy.toFixed(2) + ' bits, depth=' + s.depthEstimate + ')'));

      return { suggestions: pool.slice(0, 5).map((item, i) => ({
        word: item.word,
        entropy: item.entropy,
        explanation: `Entropy: ${item.entropy.toFixed(2)} bits — narrows ${possibleWords.length} remaining possibilities.`,
        chancesLeft: remaining,
        depthLeft: Math.max(0, remaining - 1),
        depthEstimate: item.depthEstimate
      })), total: possibleWords.length };
    }

    // legacy ordering
    scored.sort((a, b) => {
      const d = b.entropy - a.entropy;
      if (Math.abs(d) > 1e-9) return d;
      const f = b.freqScore - a.freqScore;
      if (f !== 0) return f;
      const p = b.posScore - a.posScore;
      if (p !== 0) return p;
      return a.word.localeCompare(b.word);
    });

    console.log('Wordle Solver: Top suggestions:', scored.slice(0, 5).map(s => s.word + ' (' + s.entropy.toFixed(2) + ' bits, fq=' + s.freqScore + ')'));

    return { suggestions: scored.slice(0, 5).map((item, i) => ({
      word: item.word,
      entropy: item.entropy,
      explanation: `Entropy: ${item.entropy.toFixed(2)} bits — narrows ${possibleWords.length} remaining possibilities.`,
      chancesLeft: typeof gameState.attemptNumber === 'number' ? Math.max(0, 6 - gameState.attemptNumber + 1) : undefined,
      depthLeft: typeof gameState.attemptNumber === 'number' ? Math.max(0, 6 - gameState.attemptNumber) : undefined,
      depthEstimate: item.depthEstimate
    })), total: possibleWords.length };
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
        const start = Date.now();
        console.log('Wordle Solver: Starting getSuggestions (id):', id);
        const suggestions = await getSuggestions(gameState, id);
        const elapsed = Date.now() - start;
        console.log('Wordle Solver: getSuggestions completed (id):', id, 'elapsedMs:', elapsed);
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
      // Legacy path left for compatibility; we will try remote and bundled sources and reply
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

    } else if (data.type === 'apply-wordlist' && typeof data.text === 'string') {
      // Apply a wordlist provided by the content script (text). This allows the content script to fetch
      // the remote list (which avoids CORS/timeouts in some contexts) and instruct the solver to update
      try {
        const parsed = parseTextToWordList(data.text);
        if (parsed && parsed.length > 0) {
          wordList = parsed;
          wordListLoaded = true;
          // Clear cache because candidate sets changed
          try { _entropyCache.clear(); } catch (e) {}
          console.log('Wordle Solver: Applied wordlist from', data.source || 'unknown', 'count:', parsed.length, 'sample:', parsed.slice(0, 10));
          // Echo back a refresh-wordlist-response for compatibility
          try {
            window.postMessage({ source: 'wordle-solver-extension', type: 'refresh-wordlist-response', id: data.id || null, ok: true, count: parsed.length, source: data.source || 'content' }, '*');
          } catch (e) {
            // best-effort
          }
        }
      } catch (e) {
        console.warn('Wordle Solver: Failed to apply wordlist', e);
      }
    }

    // Support chunked apply from content script: pieces with id/idx/total
    else if (data.type === 'apply-wordlist-chunk' && data && typeof data.id === 'string') {
      try {
        if (!window._ws_wordlistChunks) window._ws_wordlistChunks = new Map();
        const id = data.id;
        const idx = Number.isFinite(data.idx) ? data.idx : 0;
        const total = Number.isFinite(data.total) ? data.total : 1;
        if (!window._ws_wordlistChunks.has(id)) window._ws_wordlistChunks.set(id, { chunks: new Array(total), total, received: 0, source: data.source || 'unknown' });
        const bucket = window._ws_wordlistChunks.get(id);
        if (bucket.chunks[idx] === undefined) {
          bucket.chunks[idx] = data.text || '';
          bucket.received++;
        }
        if (bucket.received % 5 === 0 || bucket.received === bucket.total) {
          console.log('Wordle Solver: Received wordlist chunk', id, 'received', bucket.received, '/', bucket.total);
        }
        // If all received, assemble and apply
        if (bucket.received === bucket.total) {
          const full = bucket.chunks.join('');
          window._ws_wordlistChunks.delete(id);
          try {
            const parsed = parseTextToWordList(full);
            if (parsed && parsed.length > 0) {
              wordList = parsed;
              wordListLoaded = true;
              console.log('Wordle Solver: Applied reassembled wordlist (chunked) count:', parsed.length, 'sample:', parsed.slice(0,10));
              try {
                window.postMessage({ source: 'wordle-solver-extension', type: 'refresh-wordlist-response', id: id, ok: true, count: parsed.length, source: 'chunked' }, '*');
              } catch (e) { /* best-effort */ }
            } else {
              console.warn('Wordle Solver: Reassembled wordlist parsed to zero words');
              try { window.postMessage({ source: 'wordle-solver-extension', type: 'refresh-wordlist-response', id: id, ok: false, error: 'parsed-zero' }, '*'); } catch (e) {}
            }
          } catch (e) {
            console.warn('Wordle Solver: Error parsing reassembled wordlist', e);
            try { window.postMessage({ source: 'wordle-solver-extension', type: 'refresh-wordlist-response', id: id, ok: false, error: e.message }, '*'); } catch (e) {}
          }
        }
      } catch (e) {
        console.warn('Wordle Solver: Error handling wordlist chunk', e);
      }
    }

    else if (data.type === 'apply-wordlist-chunk-done' && data && typeof data.id === 'string') {
      // finalization message: if we already have all chunks, the assembly occurs above; otherwise wait briefly for last messages
      try {
        const id = data.id;
        const bucket = window._ws_wordlistChunks && window._ws_wordlistChunks.get(id);
        if (bucket && bucket.received === bucket.total) {
          // already handled
        } else if (bucket) {
          // wait a bit and then try to assemble (some chunks may be arriving slightly after done)
          setTimeout(() => {
            const b2 = window._ws_wordlistChunks && window._ws_wordlistChunks.get(id);
            if (b2 && b2.received === b2.total) {
              // assemble now
              const full = b2.chunks.join('');
              window._ws_wordlistChunks.delete(id);
              try {
                const parsed = parseTextToWordList(full);
                if (parsed && parsed.length > 0) {
                  wordList = parsed;
                  wordListLoaded = true;
                  console.log('Wordle Solver: Applied reassembled wordlist (finalized) count:', parsed.length);
                  try { window.postMessage({ source: 'wordle-solver-extension', type: 'refresh-wordlist-response', id: id, ok: true, count: parsed.length, source: 'chunked-final' }, '*'); } catch (e) {}
                } else {
                  try { window.postMessage({ source: 'wordle-solver-extension', type: 'refresh-wordlist-response', id: id, ok: false, error: 'parsed-zero' }, '*'); } catch (e) {}
                }
              } catch (e) { try { window.postMessage({ source: 'wordle-solver-extension', type: 'refresh-wordlist-response', id: id, ok: false, error: e.message }, '*'); } catch (e) {} }
            } else {
              console.warn('Wordle Solver: Chunk finalize received but not all chunks present for id', id, 'received', b2 ? b2.received : 0, 'expected', b2 ? b2.total : '?');
            }
          }, 300);
        } else {
          // no bucket: perhaps already applied via single-message; ignore
        }
      } catch (e) { console.warn('Wordle Solver: Error handling chunk-done', e); }
    }

    // Respond to explicit wordlist-info requests (fallback verification path)
    else if (data.type === 'wordlist-info-request' && data && typeof data.id === 'string') {
      try {
        window.postMessage({ source: 'wordle-solver-extension', type: 'wordlist-info-response', id: data.id, ok: true, count: wordList.length }, '*');
      } catch (e) { /* best-effort */ }
      return;
    }

    // entropy cache load from content script
    else if (data.type === 'entropy-cache-load' && data && data.cache) {
      try {
        const c = data.cache || {};
        let added = 0;
        for (const [k, v] of Object.entries(c)) {
          if (!_entropyCache.has(k)) { _entropyCache.set(k, v); added++; }
        }
        console.log('Wordle Solver: Loaded', added, 'entries from persistent cache');
      } catch (e) { console.warn('Wordle Solver: Error loading persistent cache', e); }
    }

    else if (data.type === 'entropy-cache-clear') {
      try { _entropyCache.clear(); console.log('Wordle Solver: Cleared in-memory entropy cache'); } catch (e) { }
    }
  });
})();
