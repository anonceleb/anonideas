// Pure solver core functions for unit testing (Node-friendly)
'use strict';

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
  if (!Array.isArray(possibleWords) || possibleWords.length === 0 || possibleWords.length === 1) return 0;

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

const matchesConstraints = (word, constraints) => {
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
};

const getPossibleWords = (wordList, constraints) => {
  return wordList.filter(w => matchesConstraints(w, constraints));
};

// Soft constraints used to filter candidate guesses (enforce known greens, forbidden yellow positions, and gray letters)
const satisfiesSoft = (word, constraints) => {
  // enforce correct positions
  for (const [pos, letter] of Object.entries(constraints.correct || {})) {
    if (word[parseInt(pos)] !== letter) return false;
  }
  // enforce present forbidden positions
  for (const [letter, positions] of Object.entries(constraints.present || {})) {
    for (const pos of positions) {
      if (word[parseInt(pos)] === letter) return false;
    }
  }
  // enforce absent letters (unless they are also in present/correct)
  for (const letter of (constraints.absent instanceof Set ? Array.from(constraints.absent) : (constraints.absent || []))) {
    const isAlsoPresent = constraints.present && constraints.present[letter];
    const isAlsoCorrect = Object.values(constraints.correct || {}).includes(letter);
    if (!isAlsoPresent && !isAlsoCorrect && word.includes(letter)) return false;
  }
  return true;
};

module.exports = { getPattern, calculateExpectedInfo, matchesConstraints, getPossibleWords, satisfiesSoft };
