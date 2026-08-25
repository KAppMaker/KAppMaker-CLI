import * as fal from './fal.service.js';

// ── App mascot generation ──────────────────────────────────────────
// Three prompt stages, mirroring the proven flow:
//   1. variation grid  — 16 different mascot CONCEPTS for the app idea
//   2. states grid     — the CHOSEN mascot in 16 emotional/app states
//   3. single state    — one extra state for the chosen mascot
// Stages 2-3 pass the chosen mascot as a reference image (edit mode).

export const MASCOT_GRID = { rows: 4, cols: 4, cells: 16 } as const;

export const DEFAULT_MASCOT_STATES: string[] = [
  'happy', 'sad', 'excited', 'thinking',
  'loading', 'success', 'error', 'idle',
  'celebrating', 'confused', 'proud', 'curious',
  'sleeping', 'encouraging', 'waving', 'love',
];

const NO_TEXT_RULES = `⚠️ The image must contain NO TEXT WHATSOEVER:
- no words
- no letters
- no numbers
- no icons with text meaning
- no UI elements
- no speech bubbles
- no emojis
- no watermarks or logos`;

export function buildMascotVariationPrompt(appIdea: string, appTone?: string): string {
  return `Generate a 4×4 grid (16 squares) of **different mascot concepts** for a single app, based on the provided app idea.
Each square should feature a unique mascot design with distinct appearance, coloring, shape, or style, while keeping all mascots within a **consistent grid space** so they can be easily separated later for individual use.
The mascots should be visually cohesive in size and perspective, but each square represents a **different character concept** exploring playful, cute, or gamified styles. Leave **uniform margins/padding** around each mascot so the grid can be easily split or cut later without overlapping edges or cropping important details. Each mascot should occupy roughly the same amount of space within its square, with clear separation between squares.

Use diverse artistic approaches for each mascot, including cartoon, chibi, flat vector, digital painting, 3D render, minimalist, sketch, semi-realistic, bold colors, pastel palettes, or comic style.
If a specific color is provided by the user, incorporate it creatively in some of the mascots while still allowing variation in other colors for diversity.

Backgrounds should be white or transparent to emphasize the mascot designs. Lighting, perspective, and minor details may vary subtly between squares for visual interest, but avoid clutter, distortion, or blurriness. Each mascot should clearly stand out in its square.

The goal is to produce a **high-resolution 4×4 grid** of distinct mascot concepts that can be previewed by the user, allowing them to **choose one mascot to continue generating emotional states and poses later**. Focus on creativity, playfulness, and charm, keeping the mascots suitable for a gamified and ultra-cute app style.

${NO_TEXT_RULES}

${appTone ? `App Tone: ${appTone}\n` : ''}App Idea:
${appIdea}`;
}

export function buildMascotStatesPrompt(appIdea: string, states: string[]): string {
  const stateList = states
    .map((s, i) => `${i + 1}. ${s}`)
    .join('\n');

  return `Generate a 4×4 grid (16 squares) showing the **same selected mascot** (provided as the reference image) in 16 different emotional and situational states, based on the provided app idea. The mascot's **identity, style, colors, proportions, and overall design must remain consistent across all squares**, as if it is the same character expressing different emotions or actions.

Each square shows exactly ONE state, in this exact order (left → right, top → bottom):
${stateList}

Each square should show a **single, clearly readable emotional or app-related state**. Keep the mascot **centered inside each square** with **uniform padding and safe margins**, ensuring that every square can be cleanly split or extracted later without cropping important details. The mascot should occupy roughly the same amount of space in each square, with consistent perspective and scale.

Backgrounds should be white or transparent to support the emotion being expressed, without distracting from the mascot. Lighting and minor effects may vary subtly to reinforce each emotion, but avoid drastic changes that could break visual consistency.

Avoid introducing new styles, outfits, or redesigns. Do not change the mascot's body shape, face structure, or color palette beyond small expressive variations needed for emotions. The goal is **emotional variety with visual consistency**.

Output a **high-resolution 4×4 grid**, suitable for app UI states, onboarding, empty states, success screens, and error screens. Each square should feel like a collectible expression of the same mascot, playful, cute, and clearly readable.

${NO_TEXT_RULES}

App Idea:
${appIdea}`;
}

export function buildSingleStatePrompt(stateDescription: string): string {
  return `Generate a **single, high-quality illustration** of the **same selected mascot** (provided as the reference image), preserving its exact identity, visual style, colors, proportions, and personality. This image represents **one specific emotional or situational state** described below.

The mascot must clearly express the requested emotion or behavior through **facial expression, body language, posture, and subtle visual cues**, without changing its core design. Do not redesign the mascot, change outfits, or alter its shape, face structure, or color palette beyond what is required for emotional expression.

The mascot should be **centered on the canvas** with generous and consistent padding on all sides, making the image easy to crop, animate, or place inside an app UI. Keep the mascot at a comfortable scale, occupying roughly 60–70% of the canvas.

Use a white or transparent background that supports the emotion but does not distract from the mascot. Avoid clutter, text, logos, or complex scenery.

The final image should feel **cute, expressive, and app-ready**, suitable for UI states, empty screens, onboarding, notifications, or animated variations later.

${NO_TEXT_RULES}

Requested Emotional / Situational State:
${stateDescription}`;
}

// Fills/caps a user-provided state list to exactly 16 entries (grid contract),
// topping up with defaults that aren't already present.
export function normalizeStates(custom?: string[]): string[] {
  const cleaned = (custom ?? [])
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MASCOT_GRID.cells);
  const missing = DEFAULT_MASCOT_STATES.filter(
    (d) => !cleaned.some((c) => c.toLowerCase() === d),
  );
  return [...cleaned, ...missing].slice(0, MASCOT_GRID.cells);
}

// "Loading / thinking hard!" → "loading_thinking_hard" (for file names)
export function stateSlug(state: string): string {
  return state
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'state';
}

export async function removeBackgroundToFile(
  apiKey: string,
  inputPath: string,
  outputPath: string,
  label: string,
): Promise<void> {
  const queue = await fal.submitBackgroundRemoval(apiKey, inputPath);
  await fal.pollUntilComplete(apiKey, queue.status_url, {
    label: `Removing background: ${label}`,
    intervalMs: 3_000,
  });
  const url = await fal.fetchResult(apiKey, queue.response_url);
  await fal.downloadImage(url, outputPath);
}
