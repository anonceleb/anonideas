/**
 * Finds the best "Burner Word" to differentiate between remaining candidates.
 * @param {string[]} candidates - List of possible words (e.g., ['bider', 'eider', 'rider', 'tider', 'wider'])
 * @param {string[]} fullDictionary - The entire list of valid Wordle guesses
 * @returns {string[]} Top 3 suggested burner words
 */
function getBestBurnerWords(candidates, fullDictionary) {
  if (candidates.length <= 2) return []; // No need for a burner if only 2 options left

  // 1. Identify "Discriminator Letters" 
  // These are letters that appear in some candidates but not all.
  const letterCounts = {};
  candidates.forEach(word => {
    const uniqueLetters = new Set(word.split(''));
    uniqueLetters.forEach(char => {
      letterCounts[char] = (letterCounts[char] || 0) + 1;
    });
  });

  // A letter is useful if it's in some candidates but not all.
  // Example: If 'R' is in ALL 5 candidates, it tells us nothing new.
  const discriminatorLetters = Object.keys(letterCounts).filter(
    char => letterCounts[char] > 0 && letterCounts[char] < candidates.length
  );

  // 2. Score every word in the full dictionary
  // We want a word that contains as many DIFFERENT discriminator letters as possible.
  const scores = fullDictionary.map(word => {
    let score = 0;
    const wordLetters = new Set(word.split(''));
    
    discriminatorLetters.forEach(char => {
      if (wordLetters.has(char)) {
        // We weight it: letters that appear in ~50% of candidates are most valuable
        const frequency = letterCounts[char] / candidates.length;
        const weight = 1 - Math.abs(0.5 - frequency); 
        score += weight;
      }
    });

    return { word, score };
  });

  // 3. Return the highest scoring words
  return scores
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(s => s.word);
}

// Expose to global for page usage
try {
  if (typeof window !== 'undefined') window.getBestBurnerWords = getBestBurnerWords;
} catch (e) {
  // ignore in non-browser contexts
}

// Export for Node-based tests
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getBestBurnerWords };
}