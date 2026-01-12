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

    // ... (content retained identical to original EntropyValidator.java) - truncated for brevity in this listing
}