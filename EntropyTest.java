import java.util.*;

/**
 * Unit tests for WordEntropyCalculator and EntropyValidator.
 * Tests entropy calculations and validation against established metrics.
 */
public class EntropyTest {
    
    private static int testsRun = 0;
    private static int testsPassed = 0;
    private static int testsFailed = 0;
    
    public static void main(String[] args) {
        System.out.println("=== Running Entropy Calculation and Validation Tests ===\n");
        
        testUniformDistribution();
        testSkewedDistribution();
        testSingleWord();
        testEmptyDistribution();
        testMaximumEntropy();
        testNormalizedEntropy();
        testCharacterEntropy();
        testValidationBounds();
        testValidationCorrectness();
        testUniformValidation();
        testLinguisticRange();
        testZeroFrequencies();
        
        System.out.println("\n=== Test Results ===");
        System.out.println("Total tests: " + testsRun);
        System.out.println("Passed: " + testsPassed);
        System.out.println("Failed: " + testsFailed);
        
        if (testsFailed == 0) {
            System.out.println("\n✓ All tests passed!");
        } else {
            System.out.println("\n✗ Some tests failed!");
            System.exit(1);
        }
    }
    
    private static void assertTrue(String testName, boolean condition, String message) {
        testsRun++;
        if (condition) {
            testsPassed++;
            System.out.println("✓ " + testName);
        } else {
            testsFailed++;
            System.out.println("✗ " + testName + ": " + message);
        }
    }
    
    private static void assertEquals(String testName, double expected, double actual, double delta) {
        testsRun++;
        if (Math.abs(expected - actual) <= delta) {
            testsPassed++;
            System.out.println("✓ " + testName);
        } else {
            testsFailed++;
            System.out.println("✗ " + testName + ": Expected " + expected + " but got " + actual);
        }
    }
    
    private static void testUniformDistribution() {
        System.out.println("\nTest: Uniform Distribution");
        System.out.println("---------------------------");
        
        WordEntropyCalculator calculator = new WordEntropyCalculator();
        Map<String, Integer> uniform = new HashMap<>();
        uniform.put("a", 25);
        uniform.put("b", 25);
        uniform.put("c", 25);
        uniform.put("d", 25);
        
        double entropy = calculator.calculateEntropy(uniform);
        double expected = 2.0; // log2(4) = 2
        
        assertEquals("Uniform distribution entropy equals log2(N)", 
            expected, entropy, 1e-10);
    }
    
    private static void testSkewedDistribution() {
        System.out.println("\nTest: Skewed Distribution");
        System.out.println("--------------------------");
        
        WordEntropyCalculator calculator = new WordEntropyCalculator();
        Map<String, Integer> skewed = new HashMap<>();
        skewed.put("a", 70);
        skewed.put("b", 20);
        skewed.put("c", 10);
        
        double entropy = calculator.calculateEntropy(skewed);
        
        // Manually calculate expected entropy
        double p1 = 0.7, p2 = 0.2, p3 = 0.1;
        double expected = -(p1 * Math.log(p1) / Math.log(2) + 
                           p2 * Math.log(p2) / Math.log(2) + 
                           p3 * Math.log(p3) / Math.log(2));
        
        assertEquals("Skewed distribution entropy calculation", 
            expected, entropy, 1e-10);
        
        double maxEntropy = calculator.getMaximumEntropy(skewed.size());
        assertTrue("Skewed entropy less than maximum", 
            entropy < maxEntropy, 
            "Entropy should be less than maximum for non-uniform distribution");
    }
    
    private static void testSingleWord() {
        System.out.println("\nTest: Single Word");
        System.out.println("------------------");
        
        WordEntropyCalculator calculator = new WordEntropyCalculator();
        Map<String, Integer> single = new HashMap<>();
        single.put("only", 100);
        
        double entropy = calculator.calculateEntropy(single);
        
        assertEquals("Single word entropy is zero", 
            0.0, entropy, 1e-10);
    }
    
    private static void testEmptyDistribution() {
        System.out.println("\nTest: Empty Distribution");
        System.out.println("------------------------");
        
        WordEntropyCalculator calculator = new WordEntropyCalculator();
        Map<String, Integer> empty = new HashMap<>();
        
        double entropy = calculator.calculateEntropy(empty);
        
        assertEquals("Empty distribution entropy is zero", 
            0.0, entropy, 1e-10);
    }
    
    private static void testMaximumEntropy() {
        System.out.println("\nTest: Maximum Entropy");
        System.out.println("---------------------");
        
        WordEntropyCalculator calculator = new WordEntropyCalculator();
        
        assertEquals("Maximum entropy for 8 words", 
            3.0, calculator.getMaximumEntropy(8), 1e-10);
        
        assertEquals("Maximum entropy for 16 words", 
            4.0, calculator.getMaximumEntropy(16), 1e-10);
        
        assertEquals("Maximum entropy for 1024 words", 
            10.0, calculator.getMaximumEntropy(1024), 1e-10);
    }
    
    private static void testNormalizedEntropy() {
        System.out.println("\nTest: Normalized Entropy");
        System.out.println("------------------------");
        
        WordEntropyCalculator calculator = new WordEntropyCalculator();
        
        // Uniform distribution should have normalized entropy = 1.0
        Map<String, Integer> uniform = new HashMap<>();
        uniform.put("a", 10);
        uniform.put("b", 10);
        uniform.put("c", 10);
        
        double normalized = calculator.calculateNormalizedEntropy(uniform);
        assertEquals("Normalized entropy for uniform distribution", 
            1.0, normalized, 1e-10);
        
        // Highly skewed should have lower normalized entropy
        Map<String, Integer> skewed = new HashMap<>();
        skewed.put("a", 90);
        skewed.put("b", 5);
        skewed.put("c", 5);
        
        double skewedNormalized = calculator.calculateNormalizedEntropy(skewed);
        assertTrue("Skewed distribution has lower normalized entropy", 
            skewedNormalized < 1.0 && skewedNormalized > 0.0,
            "Expected 0 < " + skewedNormalized + " < 1");
    }
    
    private static void testCharacterEntropy() {
        System.out.println("\nTest: Character-level Entropy");
        System.out.println("------------------------------");
        
        WordEntropyCalculator calculator = new WordEntropyCalculator();
        
        // All unique characters
        double entropy1 = calculator.calculateWordEntropy("abcdef");
        assertEquals("All unique characters entropy", 
            Math.log(6) / Math.log(2), entropy1, 1e-10);
        
        // All same characters
        double entropy2 = calculator.calculateWordEntropy("aaaa");
        assertEquals("All same characters entropy", 
            0.0, entropy2, 1e-10);
        
        // Empty string
        double entropy3 = calculator.calculateWordEntropy("");
        assertEquals("Empty string entropy", 
            0.0, entropy3, 1e-10);
    }
    
    private static void testValidationBounds() {
        System.out.println("\nTest: Validation Bounds");
        System.out.println("-----------------------");
        
        EntropyValidator validator = new EntropyValidator();
        
        // Valid entropy
        EntropyValidator.ValidationResult result1 = 
            validator.validateEntropyBounds(2.0, 4);
        assertTrue("Valid entropy within bounds", 
            result1.isValid(), "Should be valid");
        
        // Negative entropy (invalid)
        EntropyValidator.ValidationResult result2 = 
            validator.validateEntropyBounds(-1.0, 4);
        assertTrue("Negative entropy is invalid", 
            !result2.isValid(), "Should be invalid");
        
        // Entropy exceeds maximum (invalid)
        EntropyValidator.ValidationResult result3 = 
            validator.validateEntropyBounds(3.0, 4);
        assertTrue("Entropy exceeding maximum is invalid", 
            !result3.isValid(), "Should be invalid");
    }
    
    private static void testValidationCorrectness() {
        System.out.println("\nTest: Validation Correctness");
        System.out.println("----------------------------");
        
        EntropyValidator validator = new EntropyValidator();
        WordEntropyCalculator calculator = new WordEntropyCalculator();
        
        Map<String, Integer> words = new HashMap<>();
        words.put("x", 10);
        words.put("y", 20);
        words.put("z", 30);
        
        double correctEntropy = calculator.calculateEntropy(words);
        
        // Test with correct entropy
        EntropyValidator.ValidationResult result1 = 
            validator.validateEntropyCalculation(words, correctEntropy);
        assertTrue("Correct entropy validates successfully", 
            result1.isValid(), "Should be valid");
        
        // Test with incorrect entropy
        EntropyValidator.ValidationResult result2 = 
            validator.validateEntropyCalculation(words, 5.0);
        assertTrue("Incorrect entropy is detected", 
            !result2.isValid(), "Should be invalid");
    }
    
    private static void testUniformValidation() {
        System.out.println("\nTest: Uniform Distribution Validation");
        System.out.println("--------------------------------------");
        
        EntropyValidator validator = new EntropyValidator();
        WordEntropyCalculator calculator = new WordEntropyCalculator();
        
        Map<String, Integer> uniform = new HashMap<>();
        uniform.put("a", 15);
        uniform.put("b", 15);
        uniform.put("c", 15);
        
        double entropy = calculator.calculateEntropy(uniform);
        
        EntropyValidator.ValidationResult result = 
            validator.validateUniformDistribution(uniform, entropy);
        assertTrue("Uniform distribution validates correctly", 
            result.isValid(), "Should be valid");
    }
    
    private static void testLinguisticRange() {
        System.out.println("\nTest: Linguistic Range Validation");
        System.out.println("----------------------------------");
        
        EntropyValidator validator = new EntropyValidator();
        
        // Within natural language range (6-12 bits)
        EntropyValidator.ValidationResult result1 = 
            validator.validateLinguisticRange(8.5, true);
        assertTrue("Entropy within linguistic range", 
            result1.isValid(), "Should be valid");
        
        // Below natural language range
        EntropyValidator.ValidationResult result2 = 
            validator.validateLinguisticRange(3.0, true);
        assertTrue("Entropy below linguistic range detected", 
            !result2.isValid(), "Should be invalid");
        
        // Above natural language range
        EntropyValidator.ValidationResult result3 = 
            validator.validateLinguisticRange(15.0, true);
        assertTrue("Entropy above linguistic range detected", 
            !result3.isValid(), "Should be invalid");
        
        // Non-natural language (should skip validation)
        EntropyValidator.ValidationResult result4 = 
            validator.validateLinguisticRange(3.0, false);
        assertTrue("Non-natural language skips linguistic validation", 
            result4.isValid(), "Should be valid");
    }
    
    private static void testZeroFrequencies() {
        System.out.println("\nTest: Zero Frequencies");
        System.out.println("----------------------");
        
        WordEntropyCalculator calculator = new WordEntropyCalculator();
        
        Map<String, Integer> withZeros = new HashMap<>();
        withZeros.put("a", 0);
        withZeros.put("b", 0);
        withZeros.put("c", 0);
        
        double entropy = calculator.calculateEntropy(withZeros);
        assertEquals("All zero frequencies results in zero entropy", 
            0.0, entropy, 1e-10);
    }
}
