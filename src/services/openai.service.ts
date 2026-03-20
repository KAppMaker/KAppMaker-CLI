import { logger } from '../utils/logger.js';
import { STYLE_PROMPTS } from './screenshot-styles.js';

// ── Prompt builder ─────────────────────────────────────────────────

export function buildScreenshotPrompt(
  appDescription: string,
  hasReferenceImages: boolean,
  styleId: number = 1,
): string {
  const stylePrompt = STYLE_PROMPTS[styleId] ?? STYLE_PROMPTS[1];

  const referenceImageContext = hasReferenceImages
    ? `- **IMPORTANT: The user HAS provided existing app screenshots as reference images.** These reference images are passed alongside this prompt. You MUST instruct the image generator to use these reference images as the actual app screens inside the device frames. Ignore any status bars, navigation bars, or OS-specific chrome from the references - use only the main app content. Every screenshot concept should incorporate these reference images.`
    : `- No reference images have been provided. All app UI screens should be generated from scratch based on the app concept described above.`;

  return `You are an expert prompt engineer specialized in generating **premium App Store and Play Store marketing screenshots**.
Your task:
- Take the user's PRD, mobile app concept, or idea: User's input: "${appDescription}".
${referenceImageContext}
- Generate a single image prompt that produces **8 vertical marketing screenshots**.
${stylePrompt}`;
}

// ── OpenAI API ─────────────────────────────────────────────────────

export async function generateTextPrompt(
  apiKey: string,
  prompt: string,
): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4.1',
      input: prompt,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    logger.fatal(`OpenAI API error (${response.status}): ${body}`);
    process.exit(1);
  }

  const data = (await response.json()) as {
    output?: { content?: { text?: string }[] }[];
  };

  const text = data.output?.[0]?.content?.[0]?.text;
  if (!text) {
    logger.fatal('No text returned from OpenAI');
    process.exit(1);
  }

  return text;
}
