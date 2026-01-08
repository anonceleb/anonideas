// Placeholder strategist. In production this module can provide suggested burner words.
window.getBestBurnerWords = function(possibleWords, wordList) {
  // very naive: return highest-entropy words (using a simple heuristic)
  return wordList.slice(0, 10);
};
