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
        
        // (rest of demo retained)
    }
}