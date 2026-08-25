import { logger } from './logger.js';
import { promptInput } from './prompt.js';

// Interactive cell picker for 4×4 generation grids (logos, mascots).
// Returns null when the user asks to regenerate the grid.

export interface GridSelectionResult {
  index: number;
  zoom?: number;
  gap?: number;
}

export async function askGridSelection(itemLabel: string): Promise<GridSelectionResult | null> {
  while (true) {
    const answer = await promptInput(
      `Choose a ${itemLabel} (1-16) or R to regenerate. Optional: "5 --zoom 1.1 --gap 3": `,
    );
    const trimmed = answer.trim().toLowerCase();

    if (trimmed === 'r') {
      return null; // signals regeneration
    }

    const parsed = parseGridSelection(trimmed);
    if (parsed) return parsed;

    logger.warn('Please enter a number 1-16, optionally with --zoom and --gap, or R to regenerate.');
  }
}

export function parseGridSelection(input: string): GridSelectionResult | null {
  const tokens = input.split(/\s+/);
  const num = parseInt(tokens[0], 10);
  if (isNaN(num) || num < 1 || num > 16) return null;

  const result: GridSelectionResult = { index: num };

  for (let i = 1; i < tokens.length - 1; i++) {
    if (tokens[i] === '--zoom') {
      const val = parseFloat(tokens[i + 1]);
      if (!isNaN(val) && val > 0) result.zoom = val;
    }
    if (tokens[i] === '--gap') {
      const val = parseInt(tokens[i + 1], 10);
      if (!isNaN(val) && val >= 0) result.gap = val;
    }
  }

  return result;
}
