import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateAndUpdateMove } from './moveAndValidationController'; // adjust the path if needed

// Create __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define an interface for our test cases (optional but helps with type safety)
interface TestCase {
  description: string;
  gameState: any;
  playerId: string;
  moveNotation: string;
  promotionPiece?: string;
  expected: Partial<any>;
}

// Read the test cases JSON file
const testCasesPath = path.join(__dirname, 'testingData.json');
const testCases: TestCase[] = JSON.parse(fs.readFileSync(testCasesPath, 'utf8'));

testCases.forEach((testCase, index) => {
  const { description, gameState, playerId, moveNotation, promotionPiece, expected } = testCase;
  const result = validateAndUpdateMove(gameState, playerId, moveNotation, promotionPiece);
  
  console.log(`Test ${index + 1}: ${description}`);
  console.log("Input:");
  console.log(JSON.stringify({ gameState, playerId, moveNotation, promotionPiece }, null, 2));
  console.log("Output:");
  console.log(JSON.stringify(result, null, 2));
  console.log("Expected:");
  console.log(JSON.stringify(expected, null, 2));
  
  // Simple check for expected fields
  let passed = true;
  for (const key in expected) {
    if (result[key as keyof typeof result] !== expected[key]) {
      passed = false;
      break;
    }
  }
  
  console.log(passed ? "Result: PASSED" : "Result: FAILED");
  console.log("---------------------------------------------------");
});
