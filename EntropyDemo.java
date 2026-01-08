import java.util.*;

/**
 * Demonstrates the word entropy calculation and validation system.
 * Shows how to cross-check entropy scores against established metrics.
 */
public class EntropyDemo {
    
    public static void main(String[] args) {
        WordEntropyCalculator calculator = new WordEntropyCalculator();
        EntropyValidator validator = new EntropyValidator();
        
        System.out.println("=== Word Entropy Calculation and Validation Demo ===\n");
        
        // Example 1: Uniform distribution (maximum entropy)
        System.out.println("Example 1: Uniform Distribution");
        System.out.println("---------------------------------");
        Map<String, Integer> uniformDist = new HashMap<>();
        uniformDist.put("the", 10);
        uniformDist.put("cat", 10);
        uniformDist.put("sat", 10);
        uniformDist.put("mat", 10);
        
        double entropy1 = calculator.calculateEntropy(uniformDist);
        System.out.println("Word frequencies: " + uniformDist);
        System.out.println("Calculated entropy: " + String.format("%.4f", entropy1) + " bits");
        System.out.println("Maximum possible entropy: " + 
            String.format("%.4f", calculator.getMaximumEntropy(uniformDist.size())) + " bits");
        
        List<EntropyValidator.ValidationResult> results1 = 
            validator.comprehensiveValidation(uniformDist, entropy1, false);
        validator.printValidationReport(results1);
        
        // Example 2: Skewed distribution (lower entropy)
        System.out.println("\nExample 2: Skewed Distribution");
        System.out.println("---------------------------------");
        Map<String, Integer> skewedDist = new HashMap<>();
        skewedDist.put("the", 50);
        skewedDist.put("cat", 10);
        skewedDist.put("sat", 5);
        skewedDist.put("mat", 2);
        
        double entropy2 = calculator.calculateEntropy(skewedDist);
        System.out.println("Word frequencies: " + skewedDist);
        System.out.println("Calculated entropy: " + String.format("%.4f", entropy2) + " bits");
        System.out.println("Maximum possible entropy: " + 
            String.format("%.4f", calculator.getMaximumEntropy(skewedDist.size())) + " bits");
        System.out.println("Normalized entropy: " + 
            String.format("%.4f", calculator.calculateNormalizedEntropy(skewedDist)));
        
        List<EntropyValidator.ValidationResult> results2 = 
            validator.comprehensiveValidation(skewedDist, entropy2, false);
        validator.printValidationReport(results2);
        
        // Example 3: Character-level entropy
        System.out.println("\nExample 3: Character-level Entropy");
        System.out.println("---------------------------------");
        String word = "entropy";
        double charEntropy = calculator.calculateWordEntropy(word);
        System.out.println("Word: \"" + word + "\"");
        System.out.println("Character-level entropy: " + String.format("%.4f", charEntropy) + " bits");
        
        Map<Character, Integer> charFreq = new HashMap<>();
        for (char c : word.toCharArray()) {
            charFreq.put(c, charFreq.getOrDefault(c, 0) + 1);
        }
        System.out.println("Character frequencies: " + charFreq);
        System.out.println();
        
        // Example 4: Natural language simulation
        System.out.println("\nExample 4: Natural Language Simulation");
        System.out.println("---------------------------------");
        Map<String, Integer> naturalLangDist = createNaturalLanguageDistribution();
        double entropy4 = calculator.calculateEntropy(naturalLangDist);
        
        System.out.println("Simulated vocabulary size: " + naturalLangDist.size() + " words");
        System.out.println("Total word count: " + 
            naturalLangDist.values().stream().mapToInt(Integer::intValue).sum());
        System.out.println("Calculated entropy: " + String.format("%.4f", entropy4) + " bits");
        
        List<EntropyValidator.ValidationResult> results4 = 
            validator.comprehensiveValidation(naturalLangDist, entropy4, true);
        validator.printValidationReport(results4);
        
        // Example 5: Validation error detection
        System.out.println("\nExample 5: Error Detection");
        System.out.println("---------------------------------");
        Map<String, Integer> testDist = new HashMap<>();
        testDist.put("word1", 20);
        testDist.put("word2", 30);
        testDist.put("word3", 50);
        
        double correctEntropy = calculator.calculateEntropy(testDist);
        double incorrectEntropy = 5.0; // Deliberately wrong value
        
        System.out.println("Testing with incorrect entropy value...");
        System.out.println("Correct entropy: " + String.format("%.4f", correctEntropy));
        System.out.println("Claimed entropy: " + String.format("%.4f", incorrectEntropy));
        
        EntropyValidator.ValidationResult errorCheck = 
            validator.validateEntropyCalculation(testDist, incorrectEntropy);
        System.out.println("\nValidation result: " + 
            (errorCheck.isValid() ? "PASS" : "FAIL"));
        System.out.println("Message: " + errorCheck.getMessage());
        System.out.println("Metrics: " + errorCheck.getMetrics());
        System.out.println();
        
        System.out.println("=== Demo Complete ===");
    }
    
    /**
     * Creates a simulated natural language word frequency distribution.
     * Follows Zipf's law approximation: frequency rank follows power law.
     */
    private static Map<String, Integer> createNaturalLanguageDistribution() {
        Map<String, Integer> distribution = new HashMap<>();
        
        // Common words with Zipfian distribution
        String[] words = {
            "the", "be", "to", "of", "and", "a", "in", "that", "have", "I",
            "it", "for", "not", "on", "with", "he", "as", "you", "do", "at",
            "this", "but", "his", "by", "from", "they", "we", "say", "her", "she",
            "or", "an", "will", "my", "one", "all", "would", "there", "their", "what",
            "so", "up", "out", "if", "about", "who", "get", "which", "go", "me"
        };
        
        // Zipf's law: frequency is inversely proportional to rank
        int baseFrequency = 1000;
        for (int i = 0; i < words.length; i++) {
            int frequency = (int) (baseFrequency / Math.pow(i + 1, 1.1));
            distribution.put(words[i], Math.max(1, frequency));
        }
        
        return distribution;
    }
}
