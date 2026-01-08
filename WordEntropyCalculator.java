import java.util.*;

/**
 * Calculates entropy scores for words based on their frequency distribution.
 * Uses Shannon's entropy formula: H = -Σ p(x) * log2(p(x))
 */
public class WordEntropyCalculator {
    
    /**
     * Calculate the entropy of a word frequency distribution.
     * 
     * @param wordFrequencies Map of words to their frequencies
     * @return The entropy score in bits
     */
    public double calculateEntropy(Map<String, Integer> wordFrequencies) {
        if (wordFrequencies == null || wordFrequencies.isEmpty()) {
            return 0.0;
        }
        
        // Calculate total word count
        int totalWords = wordFrequencies.values().stream()
            .mapToInt(Integer::intValue)
            .sum();
        
        if (totalWords == 0) {
            return 0.0;
        }
        
        // Calculate entropy using Shannon's formula
        double entropy = 0.0;
        for (int frequency : wordFrequencies.values()) {
            if (frequency > 0) {
                double probability = (double) frequency / totalWords;
                entropy -= probability * (Math.log(probability) / Math.log(2));
            }
        }
        
        return entropy;
    }
    
    /**
     * Calculate the entropy for a single word based on character distribution.
     * 
     * @param word The word to analyze
     * @return The character-level entropy of the word in bits
     */
    public double calculateWordEntropy(String word) {
        if (word == null || word.isEmpty()) {
            return 0.0;
        }
        
        Map<Character, Integer> charFrequencies = new HashMap<>();
        for (char c : word.toCharArray()) {
            charFrequencies.put(c, charFrequencies.getOrDefault(c, 0) + 1);
        }
        
        double entropy = 0.0;
        int length = word.length();
        
        for (int frequency : charFrequencies.values()) {
            if (frequency > 0) {
                double probability = (double) frequency / length;
                entropy -= probability * (Math.log(probability) / Math.log(2));
            }
        }
        
        return entropy;
    }
    
    /**
     * Get maximum possible entropy for a given vocabulary size.
     * Maximum entropy occurs when all words have equal probability.
     * 
     * @param vocabularySize The number of unique words
     * @return The maximum entropy in bits
     */
    public double getMaximumEntropy(int vocabularySize) {
        if (vocabularySize <= 0) {
            return 0.0;
        }
        return Math.log(vocabularySize) / Math.log(2);
    }
    
    /**
     * Calculate normalized entropy (0 to 1 scale).
     * 
     * @param wordFrequencies Map of words to their frequencies
     * @return Normalized entropy score between 0 and 1
     */
    public double calculateNormalizedEntropy(Map<String, Integer> wordFrequencies) {
        if (wordFrequencies == null || wordFrequencies.size() <= 1) {
            return 0.0;
        }
        
        double entropy = calculateEntropy(wordFrequencies);
        double maxEntropy = getMaximumEntropy(wordFrequencies.size());
        
        return maxEntropy > 0 ? entropy / maxEntropy : 0.0;
    }
}
