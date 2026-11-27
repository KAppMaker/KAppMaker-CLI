// Helper for prompt tests: asks two questions and prints the answers as JSON.
import { confirm, promptInput } from '../utils/prompt.js';
const a = await confirm('  App not found. Create it now?');
const b = await promptInput('  Name: ');
const c = await confirm('  Continue with these settings?');
console.log(`RESULT ${JSON.stringify([a, b, c])}`);
