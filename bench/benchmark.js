#!/usr/bin/env node
// Simple benchmark for prefilter thresholds and strategist integration
// Node 18+ required (for fetch)

let fetchFunc;
try {
  fetchFunc = global.fetch || require('node-fetch');
} catch (e) {
  fetchFunc = undefined;
}

// --- Utility functions (copied/adapted from solver.js) ---
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

// Copy of strategist.getBestBurnerWords (slightly adapted)
function getBestBurnerWords(candidates, fullDictionary) {
  if (candidates.length <= 2) return [];

  const letterCounts = {};
  candidates.forEach(word => {
    const uniqueLetters = new Set(word.split(''));
    uniqueLetters.forEach(char => {
      letterCounts[char] = (letterCounts[char] || 0) + 1;
    });
  });

  const discriminatorLetters = Object.keys(letterCounts).filter(
    char => letterCounts[char] > 0 && letterCounts[char] < candidates.length
  );

  const scores = fullDictionary.map(word => {
    let score = 0;
    const wordLetters = new Set(word.split(''));

    discriminatorLetters.forEach(char => {
      if (wordLetters.has(char)) {
        const frequency = letterCounts[char] / candidates.length;
        const weight = 1 - Math.abs(0.5 - frequency);
        score += weight;
      }
    });

    return { word, score };
  });

  return scores
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(s => s.word);
}

// --- Benchmark runner ---
async function loadWordList() {
  if (fetchFunc) {
    try {
      const res = await fetchFunc('https://gist.githubusercontent.com/dracos/dd0668f281e685bad51479e5acaadb93/raw/valid-wordle-words.txt');
      const text = await res.text();
      return text.split('\n').map(w => w.trim().toLowerCase()).filter(w => w.length === 5 && /^[a-z]+$/.test(w));
    } catch (e) {
      console.error('Failed to fetch remote word list, falling back to small set');
    }
  }
  return ['crane', 'slate', 'trace', 'least', 'stale', 'hinge', 'binge', 'tinge', 'singe', 'pride', 'bride', 'grind'];
}

function sample(arr, n) {
  const out = [];
  const idx = new Set();
  while (out.length < n && out.length < arr.length) {
    const i = Math.floor(Math.random() * arr.length);
    if (!idx.has(i)) {
      idx.add(i);
      out.push(arr[i]);
    }
  }
  return out;
}

async function benchmark() {
  const wordList = await loadWordList();
  const wordSet = new Set(wordList);
  console.log('Loaded word list with', wordList.length, 'words');

  const candidateSizes = [50, 100, 200, 500];
  const PREFILTER_OPTIONS = [50, 100, 200];
  const BURNER_COUNTS = [5, 10];
  const SAMPLE_SIZES = [100, 200];

  const results = [];

  for (const size of candidateSizes) {
    for (let trial = 0; trial < 5; trial++) {
      // Build a candidate set by sampling words that share some letters with a randomly chosen seed
      const seed = wordList[Math.floor(Math.random() * wordList.length)];
      const candidates = sample(wordList.filter(w => {
        // prefer words that share at least 2 letters with seed
        const s = new Set(seed.split(''));
        const shared = w.split('').filter(c => s.has(c));
        return shared.length >= 1;
      }), size);

      // If filter produced too few, fallback to random sample
      while (candidates.length < size) candidates.push(wordList[Math.floor(Math.random() * wordList.length)]);

      // Compute ground-truth top3 by scoring full wordList (or sample to limit time)
      const scoringPool = sample(wordList, Math.min(1000, wordList.length));

      const t0Full = Date.now();
      const fullScored = scoringPool.map(w => ({ word: w, entropy: calculateExpectedInfo(w, candidates) }));
      fullScored.sort((a, b) => b.entropy - a.entropy);
      const t1Full = Date.now();
      const fullTop3 = fullScored.slice(0, 3).map(s => s.word);

      for (const PREFILTER_THRESHOLD of PREFILTER_OPTIONS) {
        for (const BURNER_COUNT of BURNER_COUNTS) {
          for (const SAMPLE_SIZE of SAMPLE_SIZES) {
            const start = Date.now();

            // prefilter logic (same approach as in solver.js)
            let poolSet = new Set([...candidates]);
            let poolArr = Array.from(poolSet);

            let prefiltered = poolArr;
            if (poolArr.length > PREFILTER_THRESHOLD) {
              const burners = getBestBurnerWords(candidates, wordList).slice(0, BURNER_COUNT);
              const sampled = sample(wordList.filter(w => !poolSet.has(w)), SAMPLE_SIZE);
              const pool = new Set([...candidates, ...burners, ...sampled]);
              prefiltered = Array.from(pool);
            }

            // score prefiltered with our same scoringPool to emulate solver behavior
            const scored = prefiltered.map(w => ({ word: w, entropy: calculateExpectedInfo(w, candidates) }));
            scored.sort((a, b) => b.entropy - a.entropy);
            const end = Date.now();

            const preTop3 = scored.slice(0, 3).map(s => s.word);

            const overlapTop1 = fullTop3[0] === preTop3[0] ? 1 : 0;
            const overlapTop3 = preTop3.filter(w => fullTop3.includes(w)).length;

            results.push({
              size,
              PREFILTER_THRESHOLD,
              BURNER_COUNT,
              SAMPLE_SIZE,
              timeFullMs: t1Full - t0Full,
              timePrefilterMs: end - start,
              fullTop1: fullTop3[0],
              preTop1: preTop3[0] || null,
              overlapTop1,
              overlapTop3
            });
          }
        }
      }
    }
  }

  // Summarize
  console.table(results.slice(0, 100));

  // Compute aggregate metrics per PREFILTER_THRESHOLD
  const summary = {};
  for (const r of results) {
    const key = `T${r.PREFILTER_THRESHOLD}_B${r.BURNER_COUNT}_S${r.SAMPLE_SIZE}`;
    if (!summary[key]) summary[key] = { count: 0, overlapSum: 0, timeSum: 0 };
    summary[key].count++;
    summary[key].overlapSum += r.overlapTop3;
    summary[key].timeSum += r.timePrefilterMs;
  }

  console.log('\nAggregate summary (average overlapTop3 and timePrefilterMs):');
  for (const [k, v] of Object.entries(summary)) {
    console.log(k, 'avgOverlapTop3=', (v.overlapSum / v.count).toFixed(2), 'avgTimeMs=', (v.timeSum / v.count).toFixed(1));
  }

  console.log('\nDone.');
}

benchmark().catch(err => console.error(err));
