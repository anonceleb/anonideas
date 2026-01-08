// Comparator for candidate words that takes remaining attempts into account
// Candidates should have these fields: { word, entropy, expectedRemaining, worstRemaining, depthEstimate, freqScore, posScore }

const EPS = 1e-9;

function compareCandidates(a, b, chancesLeft) {
  // When chancesLeft is small (<=2), prioritize smaller depthEstimate, then smaller worstRemaining
  if (typeof chancesLeft === 'number' && chancesLeft <= 2) {
    if (a.depthEstimate !== b.depthEstimate) return a.depthEstimate - b.depthEstimate > 0 ? 1 : -1; // smaller depthEstimate first
    if (a.worstRemaining !== b.worstRemaining) return a.worstRemaining - b.worstRemaining > 0 ? 1 : -1; // smaller worstRemaining is better
    // fall back to higher entropy
    if (Math.abs(a.entropy - b.entropy) > EPS) return b.entropy - a.entropy > 0 ? 1 : -1;
    if (b.freqScore !== a.freqScore) return b.freqScore - a.freqScore > 0 ? 1 : -1;
    if (b.posScore !== a.posScore) return b.posScore - a.posScore > 0 ? 1 : -1;
    return a.word.localeCompare(b.word) < 0 ? -1 : 1;
  }

  // Default ordering: entropy desc, freqScore desc, posScore desc, lexicographic
  if (Math.abs(a.entropy - b.entropy) > EPS) return b.entropy - a.entropy > 0 ? 1 : -1;
  if (b.freqScore !== a.freqScore) return b.freqScore - a.freqScore > 0 ? 1 : -1;
  if (b.posScore !== a.posScore) return b.posScore - a.posScore > 0 ? 1 : -1;
  return a.word.localeCompare(b.word) < 0 ? -1 : 1;
}

module.exports = {
  compareCandidates
};
