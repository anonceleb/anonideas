import java.util.*;

/**
 * Validates word entropy scores against established metrics and theoretical bounds.
 * Provides methods to cross-check if calculated entropy scores are correct.
 */
public class EntropyValidator {
    
    private final WordEntropyCalculator calculator;
    private static final double EPSILON = 1e-10; // Tolerance for floating point comparisons
    
    public EntropyValidator() {
        this.calculator = new WordEntropyCalculator();
    }
    
    /**
     * Validation result containing the validation status and details.
     */
    public static class ValidationResult {
        private final boolean valid;
        private final String message;
        private final Map<String, Object> metrics;
        
        public ValidationResult(boolean valid, String message, Map<String, Object> metrics) {
            this.valid = valid;
            this.message = message;
            this.metrics = metrics;
        }
        
        public boolean isValid() {
            return valid;
        }
        
        public String getMessage() {
            return message;
        }
        
        public Map<String, Object> getMetrics() {
            return metrics;
        }
        
        @Override
        public String toString() {
            return String.format("ValidationResult{valid=%s, message='%s', metrics=%s}", 
                valid, message, metrics);
        }
    }
    
    /**
     * Validate that entropy is within theoretical bounds [0, log2(N)].
     * 
     * @param entropy The calculated entropy
     * @param vocabularySize The size of the vocabulary
     * @return ValidationResult indicating if entropy is within valid bounds
     */
    public ValidationResult validateEntropyBounds(double entropy, int vocabularySize) {
        Map<String, Object> metrics = new HashMap<>();
        double maxEntropy = calculator.getMaximumEntropy(vocabularySize);
        
        metrics.put("calculatedEntropy", entropy);
        metrics.put("vocabularySize", vocabularySize);
        metrics.put("theoreticalMinimum", 0.0);
        metrics.put("theoreticalMaximum", maxEntropy);
        
        if (entropy < -EPSILON) {
            return new ValidationResult(false, 
                "Entropy cannot be negative. Got: " + entropy, metrics);
        }
        
        if (entropy > maxEntropy + EPSILON) {
            return new ValidationResult(false, 
                String.format("Entropy %.4f exceeds maximum possible entropy %.4f for vocabulary size %d",
                    entropy, maxEntropy, vocabularySize), metrics);
        }
        
        return new ValidationResult(true, 
            "Entropy is within valid theoretical bounds", metrics);
    }
    
    /**
     * Validate entropy calculation by recalculating and comparing.
     * 
     * @param wordFrequencies The word frequency distribution
     * @param claimedEntropy The entropy value to validate
     * @return ValidationResult indicating if the claimed entropy matches calculated value
     */
    public ValidationResult validateEntropyCalculation(
            Map<String, Integer> wordFrequencies, double claimedEntropy) {
        
        Map<String, Object> metrics = new HashMap<>();
        double calculatedEntropy = calculator.calculateEntropy(wordFrequencies);
        double difference = Math.abs(calculatedEntropy - claimedEntropy);
        
        metrics.put("claimedEntropy", claimedEntropy);
        metrics.put("recalculatedEntropy", calculatedEntropy);
        metrics.put("absoluteDifference", difference);
        metrics.put("vocabularySize", wordFrequencies.size());
        
        if (difference < EPSILON) {
            return new ValidationResult(true, 
                "Entropy calculation is correct", metrics);
        }
        
        return new ValidationResult(false, 
            String.format("Entropy mismatch: claimed=%.6f, calculated=%.6f, difference=%.6f",
                claimedEntropy, calculatedEntropy, difference), metrics);
    }
    
    /**
     * Validate uniform distribution entropy.
     * For uniform distribution, entropy should equal log2(N).
     * 
     * @param wordFrequencies Word frequency map (should be uniform)
     * @param entropy The calculated entropy
     * @return ValidationResult for uniform distribution
     */
    public ValidationResult validateUniformDistribution(
            Map<String, Integer> wordFrequencies, double entropy) {
        
        Map<String, Object> metrics = new HashMap<>();
        
        // Check if distribution is uniform
        Set<Integer> frequencies = new HashSet<>(wordFrequencies.values());
        boolean isUniform = frequencies.size() == 1;
        
        metrics.put("isUniform", isUniform);
        metrics.put("entropy", entropy);
        metrics.put("vocabularySize", wordFrequencies.size());
        
        if (!isUniform) {
            return new ValidationResult(true, 
                "Distribution is not uniform (no validation needed)", metrics);
        }
        
        double expectedEntropy = calculator.getMaximumEntropy(wordFrequencies.size());
        double difference = Math.abs(entropy - expectedEntropy);
        
        metrics.put("expectedEntropy", expectedEntropy);
        metrics.put("difference", difference);
        
        if (difference < EPSILON) {
            return new ValidationResult(true, 
                "Uniform distribution entropy is correct (equals log2(N))", metrics);
        }
        
        return new ValidationResult(false, 
            String.format("Uniform distribution entropy mismatch: expected=%.6f, got=%.6f",
                expectedEntropy, entropy), metrics);
    }
    
    /**
     * Validate entropy against established linguistic metrics.
     * Natural language word entropy typically ranges from 6-12 bits per word.
     * 
     * @param entropy The calculated entropy
     * @param isNaturalLanguage Whether this is natural language text
     * @return ValidationResult based on linguistic norms
     */
    public ValidationResult validateLinguisticRange(double entropy, boolean isNaturalLanguage) {
        Map<String, Object> metrics = new HashMap<>();
        metrics.put("entropy", entropy);
        metrics.put("isNaturalLanguage", isNaturalLanguage);
        
        if (!isNaturalLanguage) {
            return new ValidationResult(true, 
                "Non-natural language text (linguistic validation skipped)", metrics);
        }
        
        // Based on research: natural language word entropy is typically 6-12 bits
        final double MIN_NATURAL_ENTROPY = 6.0;
        final double MAX_NATURAL_ENTROPY = 12.0;
        
        metrics.put("expectedMinimum", MIN_NATURAL_ENTROPY);
        metrics.put("expectedMaximum", MAX_NATURAL_ENTROPY);
        
        if (entropy < MIN_NATURAL_ENTROPY) {
            return new ValidationResult(false, 
                String.format("Entropy %.4f is unusually low for natural language (expected %.1f-%.1f bits)",
                    entropy, MIN_NATURAL_ENTROPY, MAX_NATURAL_ENTROPY), metrics);
        }
        
        if (entropy > MAX_NATURAL_ENTROPY) {
            return new ValidationResult(false, 
                String.format("Entropy %.4f is unusually high for natural language (expected %.1f-%.1f bits)",
                    entropy, MIN_NATURAL_ENTROPY, MAX_NATURAL_ENTROPY), metrics);
        }
        
        return new ValidationResult(true, 
            "Entropy is within expected range for natural language", metrics);
    }
    
    /**
     * Comprehensive validation of word entropy scores.
     * Runs multiple validation checks and returns detailed results.
     * 
     * @param wordFrequencies The word frequency distribution
     * @param calculatedEntropy The entropy to validate
     * @param isNaturalLanguage Whether this is natural language text
     * @return List of ValidationResult for each check performed
     */
    public List<ValidationResult> comprehensiveValidation(
            Map<String, Integer> wordFrequencies, 
            double calculatedEntropy,
            boolean isNaturalLanguage) {
        
        List<ValidationResult> results = new ArrayList<>();
        
        // 1. Validate theoretical bounds
        results.add(validateEntropyBounds(calculatedEntropy, wordFrequencies.size()));
        
        // 2. Validate calculation correctness
        results.add(validateEntropyCalculation(wordFrequencies, calculatedEntropy));
        
        // 3. Validate uniform distribution if applicable
        results.add(validateUniformDistribution(wordFrequencies, calculatedEntropy));
        
        // 4. Validate linguistic range if natural language
        if (isNaturalLanguage) {
            results.add(validateLinguisticRange(calculatedEntropy, true));
        }
        
        return results;
    }
    
    /**
     * Print a validation report.
     * 
     * @param results List of validation results
     */
    public void printValidationReport(List<ValidationResult> results) {
        System.out.println("\n=== Entropy Validation Report ===");
        System.out.println();
        
        int passed = 0;
        int failed = 0;
        
        for (int i = 0; i < results.size(); i++) {
            ValidationResult result = results.get(i);
            String status = result.isValid() ? "✓ PASS" : "✗ FAIL";
            
            if (result.isValid()) {
                passed++;
            } else {
                failed++;
            }
            
            System.out.println(String.format("Check %d: %s", i + 1, status));
            System.out.println("  " + result.getMessage());
            System.out.println("  Metrics: " + result.getMetrics());
            System.out.println();
        }
        
        System.out.println(String.format("Summary: %d passed, %d failed out of %d checks",
            passed, failed, results.size()));
        System.out.println("=================================\n");
    }
}
