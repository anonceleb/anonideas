let fetchFunc;
try {
  fetchFunc = global.fetch || require('node-fetch');
} catch (e) {
  fetchFunc = undefined;
}

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

async function loadWordList() {
  if (fetchFunc) {
    try {
      const res = await fetchFunc('https://gist.githubusercontent.com/dracos/dd0668f281e685bad51479e5acaadb93/raw/valid-wordle-words.txt');
      const text = await res.text();
      return text.split('\n').map(w => w.trim().toLowerCase()).filter(w => w.length === 5 && /^[a-z]+$/.test(w));
    } catch (e) {
      // fallthrough to bundled list
    }
  }
  return ['crane','slate','trace','least','stale','hinge','binge','tinge','singe','pride','bride','grind'];
}

async function runSmallPrefilterTest() {
  const wordList = await loadWordList();
  const candidates = sample(wordList, 120);
  // full scoring pool is a sample of the word list
  const scoringPool = sample(wordList, 400);

  // ground truth top3
  const fullScored = scoringPool.map(w => ({ word: w, entropy: calculateExpectedInfo(w, candidates) }));
  fullScored.sort((a, b) => b.entropy - a.entropy);
  const fullTop3 = fullScored.slice(0, 3).map(s => s.word);

  // run prefilter using strategist burners
  const burners = getBestBurnerWords(candidates, wordList).slice(0, 10);
  const sampled = sample(wordList.filter(w => !candidates.includes(w)), 200);
  const pool = new Set([...candidates, ...burners, ...sampled]);
  const prefiltered = Array.from(pool);
  const scored = prefiltered.map(w => ({ word: w, entropy: calculateExpectedInfo(w, candidates) }));
  scored.sort((a, b) => b.entropy - a.entropy);
  const preTop3 = scored.slice(0, 3).map(s => s.word);

  const overlapTop3 = preTop3.filter(w => fullTop3.includes(w)).length;

  return { overlapTop3, fullTop3, preTop3 };
}


// Add matchesConstraints and getPossibleWords for unit testing
function matchesConstraints(word, constraints) {
  for (const [pos, letter] of Object.entries(constraints.correct || {})) {
    if (word[parseInt(pos)] !== letter) return false;
  }
  for (const letter of (constraints.absent instanceof Set ? Array.from(constraints.absent) : (constraints.absent || []))) {
    if (word.includes(letter)) {
      let allowed = false;
      for (let i = 0; i < word.length; i++) {
        if (word[i] === letter && constraints.correct && constraints.correct[i] === letter) {
          allowed = true;
          break;
        }
        if (constraints.present && constraints.present[letter] && !constraints.present[letter].has && !constraints.present[letter].includes(i)) {
          // covers array or Set-like
          allowed = true;
          break;
        }
      }
      if (!allowed) return false;
    }
  }
  for (const [letter, positions] of Object.entries(constraints.present || {})) {
    if (!word.includes(letter)) return false;
    for (let i = 0; i < word.length; i++) {
      if (word[i] === letter) {
        if ((positions instanceof Set && positions.has(i)) || (Array.isArray(positions) && positions.includes(i))) {
          return false; // letter is present in a forbidden position
        }
      }
    }
  }
  return true;
}

function getPossibleWords(wordList, constraints) {
  return wordList.filter(w => matchesConstraints(w, constraints));
}

module.exports = { getBestBurnerWords, runSmallPrefilterTest, matchesConstraints, getPossibleWords };
