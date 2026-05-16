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

// ── Feature image prompt builder ───────────────────────────────────

export interface FeatureImagePromptOptions {
  appName: string;
  subtitle?: string;
  prompt: string;
  primaryColor: string;
  hasLogo: boolean;
  screenshotCount: number;
}

export function buildFeatureImagePrompt(opts: FeatureImagePromptOptions): string {
  const { appName, subtitle, prompt, primaryColor, hasLogo, screenshotCount } = opts;

  const referenceLines: string[] = [];
  if (hasLogo) {
    referenceLines.push(
      '- Reference image #1 is the EXACT app logo. Render it pixel-faithfully on the brand panel — do not redraw, restyle, or recolor it.',
    );
  }
  if (screenshotCount > 0) {
    const startIdx = hasLogo ? 2 : 1;
    const endIdx = startIdx + screenshotCount - 1;
    const range = screenshotCount === 1 ? `#${startIdx}` : `#${startIdx}..#${endIdx}`;
    referenceLines.push(
      `- Reference image${screenshotCount > 1 ? 's' : ''} ${range} ${screenshotCount > 1 ? 'are' : 'is'} actual app screenshots. Place ${screenshotCount > 1 ? 'them' : 'it'} inside realistic, modern phone device frames (slight angle, soft shadow). Keep the app UI content from the reference intact — only add the frame and styling around it.`,
    );
  }
  if (referenceLines.length === 0) {
    referenceLines.push('- No reference images provided. Render the brand panel and device mockups from scratch based on the app concept above.');
  }

  const subtitleLine = subtitle
    ? `- Subtitle / tagline (render below the app name): "${subtitle}"`
    : '- No subtitle provided. Use only the app name on the brand panel.';

  return `You are an expert prompt engineer specialized in generating **premium Google Play Store feature graphics** (the 1024×500 banner shown at the top of a Play Store listing).

Your task: produce a single, detailed image prompt for fal.ai (nano-banana-2) that renders ONE wide marketing banner for the app below.

**App details:**
- App name (render EXACTLY as written, do not paraphrase or restyle letters): "${appName}"
${subtitleLine}
- App concept / description: "${prompt}"
- Primary brand color (must dominate the brand panel background or accent strokes): ${primaryColor}

**Reference images:**
${referenceLines.join('\n')}

**Output requirements:**
- Return ONE single JSON object (no surrounding prose) with these keys:
  - "layout": e.g. "horizontal split — brand panel left (~40%), device mockups right (~60%)"
  - "background": describe the background using the primary color (gradient, soft shapes, abstract accents — never empty white)
  - "left_panel": { "app_icon", "app_name_typography", "subtitle_typography", "tagline_position" }
  - "right_panel": { "device_frame", "device_arrangement", "screen_content" } — screen_content refers to the reference screenshot(s)
  - "color_palette": { "primary": "${primaryColor}", "accent", "neutral" }
  - "typography": describe the type system (font weight, hierarchy) — clean modern sans-serif, bold readable
  - "mood": one-line vibe
  - "constraints": "16:9 wide banner, no empty corners or dead space, crisp legible text, no logo distortion, no fake UI text — only the strings provided above"

**Critical constraints baked into the prompt:**
- The image must read as a Play Store feature graphic — wide horizontal banner, NOT a phone screenshot.
- Text on the banner must be ONLY the app name "${appName}"${subtitle ? ` and the subtitle "${subtitle}"` : ''}. No invented marketing copy, no AI-generated lorem text.
- The primary color ${primaryColor} must visibly dominate the design.
- All device mockups must be modern (rounded corners, thin bezels, slight perspective angle).
- The result must work at 1024×500 px after a center-cover crop.`;
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
