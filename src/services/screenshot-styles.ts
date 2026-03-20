// ── Screenshot style prompts for generate-screenshots command ─────
// Each style defines the visual direction sent to OpenAI for JSON prompt generation.
// The grid layout preamble is shared; only the style-specific direction differs.

const GRID_PREAMBLE = `- The output is a **single image** containing a **2-row × 4-column grid** of 8 vertical marketing screenshots. Each cell in the grid is one screenshot.`;

const GRID_RULES = `Rules:
- Fill every field with detailed, relevant information derived from the user's input.
- Generate exactly 8 screenshots.
- The image generator will render ALL 8 screenshots in a **single 2×4 grid image**. The JSON must describe each of the 8 grid cells concisely.
- Keep each screenshot description concise (2-3 sentences max for screen_visual_description) — the image generator works best with focused, clear descriptions.
- Follow the **STYLE DIRECTION** closely — it defines the visual aesthetic for all screenshots.
- Ensure all screenshots maintain **consistent brand identity** and **premium app marketing aesthetics**.
- Do NOT include explanations — output ONLY the JSON object.`;

// ── Style 1: Rich multi-device marketing ─────────────────────────

const STYLE_1 = `${GRID_PREAMBLE}
- Each screenshot must:
  - Contain **1–3 app screens** inside realistic smartphone frames (iPhone or Android).
  - Feature **bold, benefit-driven marketing text** integrated with the UI (titles, short subtitles, key stats, callouts).
  - Maintain **consistent branding**: color palette, typography, spacing, UI components.
  - Apply **realistic lighting, soft shadows, subtle reflections, and device edge glow**.
  - Use **storytelling principles**: highlight app benefits, key features, and unique selling points visually.
  - Ensure **text readability and visual hierarchy** in each screenshot.
Output ONLY a JSON object with this schema:
{
  "type": "app_store_pro_screenshots",
  "grid_layout": {
    "rows": 2,
    "columns": 4,
    "total_cells": 8,
    "arrangement": "All 8 screenshots arranged in a single image as a 2×4 grid (2 rows, 4 columns). Each grid cell contains one complete vertical marketing screenshot."
  },
  "style": {
    "branding_theme": "",
    "color_palette": [],
    "typography": ""
  },
  "screenshots_overview": {
    "count": 8,
    "device_frames": "modern iPhone and Android, photorealistic with soft shadows and reflections",
    "tagline_style": "bold, large marketing titles with short benefit-focused subtitles and occasional key stats/icons",
    "visual_consistency_rules": [
      "Same color palette across all screenshots",
      "Identical typography family and size hierarchy",
      "Matching corner radius, spacing, and UI geometry",
      "Unified iconography style and visual motif",
      "Consistent lighting and shadow intensity",
      "Harmonized layout for readability and engagement"
    ]
  },
  "screenshots": [
    {
      "title_text": "",
      "subtitle_text": "",
      "screen_visual_description": "",
      "ui_elements_emphasized": [],
      "background_effects": ""
    }
  ],
  "lighting": {
    "ambient": "soft studio lighting",
    "device_glow": "soft edge glow around devices",
    "shadow_style": "subtle layered drop shadows for depth"
  },
  "realism": "ultra-high fidelity marketing mockups with crisp gradients, photorealistic devices, professional App Store/Play Store quality"
}
${GRID_RULES}`;

// ── Style 2: Minimal Apple-style single device ───────────────────

const STYLE_2 = `${GRID_PREAMBLE}
- Each screenshot must:
  - Contain **exactly ONE app screen only**.
  - Use a perfectly centered, straight-on smartphone frame (no tilt, no rotation, no perspective distortion).
  - Maintain identical device scale across all 8 screenshots.
  - Avoid overlapping devices, stacking, layering, or cropping.
  - Keep the device fully visible within safe margins.
LAYOUT STRUCTURE (STRICT GRID SYSTEM):
- Use a vertical 3-zone layout:
  1. Top 35% → Headline + subtitle area
  2. Middle 50% → Centered device
  3. Bottom 15% → Optional micro-support line, subtle stat, or whitespace
- All screenshots must follow this exact structural ratio.
- Maintain consistent horizontal padding on both sides.
- Text must never overlap the device frame.
- Keep large negative space around the device.
TYPOGRAPHY SYSTEM:
- Use a modern geometric sans-serif (SF Pro Display / Inter / Helvetica Now style).
- Headline:
  - Large, bold, 1–3 short lines max.
  - Maximum 6 words.
  - High contrast against background.
- Subtitle:
  - Smaller weight.
  - One short supporting sentence.
  - Must reinforce benefit, not describe feature mechanically.
- Strict hierarchy consistency across all screenshots.
- Identical headline positioning in every slide.
TEXT STYLE RULES:
- Keep messaging minimal and confident.
- Avoid exclamation marks.
- Avoid emoji.
- Avoid cluttered bullet lists.
- Focus on clarity and calm authority.
- Each screenshot highlights ONE core feature only.
DEVICE PRESENTATION:
- Photorealistic iPhone or Android frame.
- Straight frontal view.
- Ultra-clean bezels.
- Subtle realistic reflections (very minimal).
- No dramatic shadows.
- Device shadow must be soft and centered directly underneath.
- No heavy glow effects.
BACKGROUND SYSTEM:
- Use either:
  - Very soft vertical gradient (subtle tonal shift only)
  OR
  - Solid premium neutral color
- Avoid busy textures.
- Avoid patterns.
- Avoid strong diagonal effects.
- Background must support readability first.
- Maintain one consistent background logic across all 8 screenshots (either gradient family or solid system).
COLOR SYSTEM:
- Limit to:
  - 1 primary brand color
  - 1 neutral light tone
  - 1 neutral dark tone
- Do not introduce new accent colors mid-sequence.
- Keep palette controlled and restrained.
VISUAL CONSISTENCY RULES:
- Same device scale ratio across all 8 screenshots.
- Same headline position across all 8 screenshots.
- Same text alignment (all left-aligned OR all centered — do not mix).
- Same spacing rhythm.
- Same corner radius logic.
- Same lighting intensity.
- Same typography hierarchy.
- No style drift.
STORY FLOW REQUIREMENT:
- Arrange the 8 screenshots in a logical feature progression:
  1. Core value proposition
  2. Primary feature
  3. Supporting feature
  4. Workflow / usage
  5. Advanced capability
  6. Customization or personalization
  7. Trust / reliability / performance
  8. Closing value reinforcement
APP STORE OPTIMIZATION RULES:
- Ensure readability at small preview size.
- Avoid thin light text on light backgrounds.
- Avoid low-contrast subtitle tones.
- Headline must be immediately scannable.
- Avoid overcrowding.
LIGHTING:
- Ambient: Soft neutral studio lighting.
- Shadow: Subtle centered soft drop shadow.
- Device glow: Extremely minimal edge definition only.
REALISM LEVEL:
- Ultra-clean marketing mockups.
- Apple keynote presentation style.
- High-resolution, professional App Store ready.
- No gimmicks, no exaggerated effects.
Output ONLY a JSON object with this schema:
{
  "type": "app_store_pro_screenshots",
  "grid_layout": {
    "rows": 2,
    "columns": 4,
    "total_cells": 8,
    "arrangement": "All 8 screenshots arranged in a single image as a 2×4 grid (2 rows, 4 columns). Each grid cell contains one complete vertical marketing screenshot."
  },
  "style": {
    "branding_theme": "",
    "color_palette": [],
    "typography": ""
  },
  "screenshots_overview": {
    "count": 8,
    "device_frames": "single centered modern smartphone, straight angle, no tilt",
    "tagline_style": "large minimal headline + concise supporting subtitle",
    "visual_consistency_rules": [
      "One device per screenshot",
      "Identical layout structure across all screenshots",
      "Strict vertical 3-zone grid",
      "Massive controlled whitespace",
      "Consistent typography scale and alignment",
      "Unified lighting and shadow softness"
    ]
  },
  "screenshots": [
    {
      "title_text": "",
      "subtitle_text": "",
      "screen_visual_description": "",
      "ui_elements_emphasized": [],
      "background_effects": ""
    }
  ],
  "lighting": {
    "ambient": "soft neutral studio lighting",
    "device_glow": "very subtle edge definition",
    "shadow_style": "centered soft drop shadow with low opacity"
  },
  "realism": "ultra-premium minimal marketing mockups, Apple-style presentation, professional App Store quality"
}
${GRID_RULES}
- Do NOT introduce dynamic angles, cropping, or multiple devices.`;

// ── Style 3: SaaS conversion-focused with feature bullets ────────

const STYLE_3 = `${GRID_PREAMBLE}
- Each screenshot must:
  - Contain exactly ONE primary centered device.
  - Optional: small supporting UI callout cards outside the device.
  - Maintain a clean, structured grid-based layout.
  - Prioritize clarity and conversion over visual drama.
  - Avoid tilting, cropping, overlapping, or cinematic effects.
LAYOUT SYSTEM (STRICT GRID):
- Use a structured 12-column invisible grid.
- Vertical layout zones:
  1. Top 30% → Headline
  2. Next 15% → Subtitle
  3. Middle 40% → Centered device
  4. Bottom 15% → Feature bullets or supporting proof
- All screenshots must follow this structure.
- Maintain identical spacing rhythm across all 8 slides.
- Strict safe margins on all sides.
DEVICE PRESENTATION:
- Fully visible modern smartphone frame.
- Straight-on perspective (no rotation).
- Consistent device size across all screenshots.
- Clean soft drop shadow centered beneath device.
- Subtle reflection allowed but minimal.
- Device must be the visual anchor.
FEATURE CALLOUT SYSTEM:
- Use 2–3 small benefit bullets per screenshot (max).
- Each bullet:
  - Small icon (consistent icon set).
  - Short benefit phrase (max 5 words).
- Keep bullets outside device.
- Align bullets symmetrically (centered or evenly spaced).
- Do not clutter.
TYPOGRAPHY SYSTEM:
- Use modern professional sans-serif (Inter / SF Pro / Manrope style).
- Headline:
  - Bold and benefit-driven.
  - Max 6 words.
  - High contrast.
- Subtitle:
  - Short explanation reinforcing value.
  - Calm, trustworthy tone.
- Bullet text:
  - Smaller, medium weight.
  - Clean and scannable.
- Maintain identical hierarchy scale across all slides.
TEXT RULES:
- Focus on outcomes, not technical descriptions.
- Avoid hype language.
- Avoid excessive punctuation.
- Keep tone professional and confident.
- Optimize for readability at small App Store preview size.
COLOR SYSTEM:
- Use:
  - 1 primary brand color
  - 1 secondary supportive tone
  - Neutral light or dark base
- Maintain consistent background logic across all slides.
- Alternate subtle tonal shifts only (light variations allowed).
- Ensure strong text contrast at all times.
BACKGROUND STYLE:
- Soft subtle gradient OR clean solid background.
- Optional faint geometric texture (very subtle).
- Avoid bold diagonal splits.
- Avoid dramatic lighting.
- Keep presentation calm and premium.
VISUAL CONSISTENCY RULES:
- Same device size across all 8 screenshots.
- Same headline alignment.
- Same bullet structure and icon size.
- Same grid spacing.
- Same shadow softness.
- Same lighting intensity.
- No style variation mid-sequence.
STORY STRUCTURE (CONVERSION FLOW):
- Slide 1 → Core value proposition.
- Slide 2 → Primary feature.
- Slide 3 → Secondary feature.
- Slide 4 → Workflow simplicity.
- Slide 5 → Advanced capability.
- Slide 6 → Customization / flexibility.
- Slide 7 → Trust / reliability / proof.
- Slide 8 → Reinforced value + soft CTA tone.
APP STORE OPTIMIZATION:
- Headline readable in thumbnail preview.
- Bullet text concise and scannable.
- Avoid dense paragraphs.
- Keep UI uncluttered.
- Maintain breathing space.
LIGHTING:
- Ambient: Neutral soft studio lighting.
- Device glow: Minimal edge separation.
- Shadow: Soft centered drop shadow with low-medium opacity.
REALISM LEVEL:
- Clean professional SaaS marketing mockups.
- Enterprise-ready feel.
- Trustworthy and polished.
- High-resolution App Store ready visuals.
Output ONLY a JSON object with this schema:
{
  "type": "app_store_pro_screenshots",
  "grid_layout": {
    "rows": 2,
    "columns": 4,
    "total_cells": 8,
    "arrangement": "All 8 screenshots arranged in a single image as a 2×4 grid (2 rows, 4 columns). Each grid cell contains one complete vertical marketing screenshot."
  },
  "style": {
    "branding_theme": "",
    "color_palette": [],
    "typography": ""
  },
  "screenshots_overview": {
    "count": 8,
    "device_frames": "single centered modern smartphone, straight perspective",
    "tagline_style": "benefit-driven headline + concise subtitle + structured feature bullets",
    "visual_consistency_rules": [
      "Strict grid-based layout",
      "Consistent device scale",
      "Uniform bullet and icon system",
      "Identical typography hierarchy",
      "Unified spacing rhythm",
      "Consistent lighting and shadow softness"
    ]
  },
  "screenshots": [
    {
      "title_text": "",
      "subtitle_text": "",
      "screen_visual_description": "",
      "ui_elements_emphasized": [],
      "background_effects": ""
    }
  ],
  "lighting": {
    "ambient": "soft neutral studio lighting",
    "device_glow": "minimal edge separation",
    "shadow_style": "subtle centered drop shadow"
  },
  "realism": "professional SaaS-grade marketing mockups, structured layout, App Store optimized clarity"
}
${GRID_RULES}
- Do NOT introduce cropping, dynamic tilt, or dramatic effects.`;

// ── Style 4: Bold geometric color blocks ─────────────────────────

const STYLE_4 = `${GRID_PREAMBLE}
- Each screenshot must:
  - Contain 1–3 app screens inside realistic smartphone frames.
  - Use bold background color blocks (solid, split, or geometric shapes).
  - Emphasize high contrast and strong visual hierarchy.
  - Prioritize scroll-stopping impact while remaining premium.
  - Keep layout clean and intentional — bold does not mean messy.
LAYOUT SYSTEM:
- Use large geometric background blocks:
  - Horizontal split
  - Vertical split
  - Diagonal split
  - Large circular or abstract shape
- Maintain a consistent geometric logic across all 8 screenshots.
- Device may be centered OR slightly offset, but not heavily tilted.
- Maximum tilt allowed: 5–8 degrees.
- Do not crop device aggressively (full device mostly visible).
- Keep strong safe margins.
TEXT PLACEMENT RULES:
- Headline must be oversized and dominant.
- Text may partially overlap background shapes but NEVER overlap key UI.
- Use strong contrast between text and background color blocks.
- Keep text area structured and aligned.
- Do not scatter text randomly.
- Use short punchy headlines (max 5 words preferred).
- Subtitle must remain concise and benefit-driven.
TYPOGRAPHY SYSTEM:
- Use bold display sans-serif (heavy weight).
- Headline:
  - Large, impactful.
  - Tight vertical spacing.
- Subtitle:
  - Medium weight.
  - Smaller scale but highly readable.
- Optional micro-stat allowed (very short).
- Maintain identical hierarchy scale across all screenshots.
COLOR SYSTEM (STRICT CONTROL):
- Use:
  - 1 dominant primary brand color
  - 1 strong secondary color
  - Neutral light or dark base
- Rotate background color dominance across slides:
  - Slide 1: Primary dominant
  - Slide 2: Secondary dominant
  - Slide 3: Primary
  - Continue rhythmically
- Do NOT introduce extra colors outside defined palette.
- Maintain contrast accessibility.
DEVICE PRESENTATION:
- Modern realistic smartphone frame.
- Slight perspective allowed (subtle only).
- Stronger drop shadow than minimal style.
- Clear separation from background block.
- Consistent device scale across all 8 slides.
- No extreme cinematic lighting.
VISUAL CONSISTENCY RULES:
- Same geometric background logic across slides.
- Same device size ratio.
- Same headline size scaling.
- Same tilt degree (if tilt used).
- Same shadow direction and softness.
- Same typography family and tracking.
- Unified color rotation pattern.
STORY FLOW STRUCTURE:
- Slide 1 → Core bold value statement.
- Slide 2–6 → Key features (one major benefit per slide).
- Slide 7 → Performance / trust / stats.
- Slide 8 → Strong closing reinforcement.
- Each slide must feel like part of a cohesive campaign.
APP STORE OPTIMIZATION:
- Ensure headline readable at thumbnail size.
- Avoid thin typography.
- Avoid low-contrast text on vibrant colors.
- Maintain breathing space.
- Keep UI uncluttered despite bold background.
BACKGROUND EFFECTS:
- Clean solid fills.
- Smooth gradient transitions allowed.
- Large abstract shapes.
- No heavy textures.
- No realistic environment scenes.
LIGHTING:
- Ambient: Clean modern studio light.
- Device glow: Moderate edge separation.
- Shadow: Stronger soft drop shadow for contrast.
- Avoid dramatic cinematic effects.
REALISM LEVEL:
- High-impact modern tech marketing visuals.
- Bold but premium.
- Scroll-stopping App Store presentation.
- High-resolution and professionally polished.
Output ONLY a JSON object with this schema:
{
  "type": "app_store_pro_screenshots",
  "grid_layout": {
    "rows": 2,
    "columns": 4,
    "total_cells": 8,
    "arrangement": "All 8 screenshots arranged in a single image as a 2×4 grid (2 rows, 4 columns). Each grid cell contains one complete vertical marketing screenshot."
  },
  "style": {
    "branding_theme": "",
    "color_palette": [],
    "typography": ""
  },
  "screenshots_overview": {
    "count": 8,
    "device_frames": "modern smartphone frames with subtle perspective and strong separation shadows",
    "tagline_style": "large bold headline with concise benefit subtitle",
    "visual_consistency_rules": [
      "Consistent geometric background system",
      "Defined color rotation pattern",
      "Consistent device scale ratio",
      "Unified typography hierarchy",
      "Strong contrast maintained",
      "Controlled shadow direction"
    ]
  },
  "screenshots": [
    {
      "title_text": "",
      "subtitle_text": "",
      "screen_visual_description": "",
      "ui_elements_emphasized": [],
      "background_effects": ""
    }
  ],
  "lighting": {
    "ambient": "clean modern studio lighting",
    "device_glow": "moderate edge separation",
    "shadow_style": "strong soft drop shadow for depth"
  },
  "realism": "bold high-impact App Store marketing mockups, vibrant geometric backgrounds, premium polished finish"
}
${GRID_RULES}
- Maintain strict color control.
- Do NOT introduce random new background styles mid-sequence.`;

// ── Style 5: Full-bleed UI, no device frames ─────────────────────

const STYLE_5 = `${GRID_PREAMBLE}
- Each screenshot must:
  - NOT use smartphone device frames.
  - Display the app UI full-bleed (edge-to-edge).
  - Focus on immersive product presentation.
  - Highlight one major feature per screenshot.
  - Maintain strict App Store safe margins for text overlay.
UI PRESENTATION SYSTEM:
- Show full vertical app screen scaled proportionally.
- UI may slightly zoom in (5–15%) to emphasize key sections.
- Zoom logic must remain consistent across all 8 screenshots.
- Do not distort UI proportions.
- Keep UI crisp and readable.
LAYOUT STRUCTURE:
- Use a layered overlay system:
  - Background: Full UI
  - Middle layer: Subtle blur or gradient mask behind text
  - Top layer: Headline + subtitle
- Text must sit on a subtle blur panel or gradient fade for readability.
- Maintain consistent text placement across all screenshots:
  - Either all top-aligned OR all bottom-aligned.
  - Do not mix alignment styles.
TEXT SYSTEM:
- Headline:
  - Bold, minimal, benefit-focused.
  - Max 6 words.
  - High contrast against overlay.
- Subtitle:
  - Short supporting line.
  - Clarifies value, not feature mechanics.
- Optional micro-proof line allowed (very short).
- Avoid heavy paragraphs.
- Avoid cluttered bullets.
VISUAL EMPHASIS RULES:
- Use subtle UI highlight techniques:
  - Soft glow around important UI element
  - Slight brightness increase on focal area
  - Minimal shadow separation
- Do not use dramatic arrows or large graphic overlays.
- Keep enhancements subtle and premium.
COLOR SYSTEM:
- Background is driven by UI colors.
- Text overlay panel must harmonize with UI palette.
- Avoid introducing unrelated accent colors.
- Maintain consistent overlay opacity level across slides.
BACKGROUND EFFECTS:
- Use subtle gradient fades behind text.
- Use glassmorphism-style soft blur panel if needed.
- Keep overlay minimal and clean.
- Avoid heavy textures.
- Avoid decorative patterns.
TYPOGRAPHY SYSTEM:
- Modern clean sans-serif (Inter / SF Pro / Manrope style).
- Headline large and bold.
- Subtitle medium weight.
- Maintain identical hierarchy scale across all slides.
- Strict alignment consistency.
VISUAL CONSISTENCY RULES:
- Same UI zoom ratio across all screenshots.
- Same text alignment zone.
- Same overlay opacity.
- Same headline size and weight.
- Same highlight technique intensity.
- No variation in lighting style.
STORY FLOW STRUCTURE:
- Slide 1 → Core product value (hero UI screen).
- Slide 2–6 → Feature deep dives (each zooming into relevant UI section).
- Slide 7 → Performance / analytics / proof screen.
- Slide 8 → Closing reinforcement with strongest visual UI moment.
APP STORE OPTIMIZATION:
- Ensure headline readable in thumbnail preview.
- Avoid thin light fonts on bright UI backgrounds.
- Keep overlay contrast strong enough.
- Maintain safe margins from top and bottom UI areas.
- Avoid overcrowding UI with excessive overlays.
LIGHTING & DEPTH:
- No external lighting (since no device).
- Depth achieved through blur overlays and subtle shadows.
- Avoid heavy 3D effects.
- Keep presentation flat but layered.
REALISM LEVEL:
- Crisp, high-resolution UI.
- Premium SaaS / modern app marketing aesthetic.
- Clean, immersive, product-first presentation.
- Professional App Store ready quality.
Output ONLY a JSON object with this schema:
{
  "type": "app_store_pro_screenshots",
  "grid_layout": {
    "rows": 2,
    "columns": 4,
    "total_cells": 8,
    "arrangement": "All 8 screenshots arranged in a single image as a 2×4 grid (2 rows, 4 columns). Each grid cell contains one complete vertical marketing screenshot."
  },
  "style": {
    "branding_theme": "",
    "color_palette": [],
    "typography": ""
  },
  "screenshots_overview": {
    "count": 8,
    "device_frames": "no device frames, full-bleed UI presentation",
    "tagline_style": "bold minimal headline layered over subtle blur panel",
    "visual_consistency_rules": [
      "Consistent UI zoom ratio",
      "Uniform overlay opacity and blur level",
      "Identical text alignment across slides",
      "Unified typography hierarchy",
      "Subtle highlight intensity consistency"
    ]
  },
  "screenshots": [
    {
      "title_text": "",
      "subtitle_text": "",
      "screen_visual_description": "",
      "ui_elements_emphasized": [],
      "background_effects": ""
    }
  ],
  "lighting": {
    "ambient": "none, UI-driven presentation",
    "device_glow": "not applicable",
    "shadow_style": "subtle overlay shadow separation only"
  },
  "realism": "immersive UI-first App Store marketing visuals, crisp full-bleed presentation, modern premium aesthetic"
}
${GRID_RULES}
- Do NOT introduce device frames.
- Do NOT add cinematic lighting or heavy 3D effects.`;

// ── Style 6: Cinematic depth with layered devices ────────────────

const STYLE_6 = `${GRID_PREAMBLE}
- Each screenshot must:
  - Be in strict **9:16 vertical format** (portrait orientation for App Store).
  - Contain 1–3 app screens inside realistic smartphone frames.
  - Use layered depth composition (foreground, midground, background).
  - Emphasize spatial hierarchy and visual drama.
  - Maintain App Store readability and safe margins.
  - Avoid chaotic or overly busy layouts.
DEPTH SYSTEM (MANDATORY):
- Foreground:
  - Primary device in sharp focus.
- Midground:
  - Secondary device or UI element (optional).
- Background:
  - Soft gradient environment with subtle light bloom.
- Apply controlled depth-of-field effect:
  - Foreground crisp.
  - Background softly diffused.
- Maintain consistent depth logic across all 8 screenshots.
DEVICE ARRANGEMENT:
- Primary device slightly angled (8–15° max).
- Secondary device (if used) must sit behind or offset.
- Devices may overlap slightly for dimensional feel.
- Maintain consistent tilt angle across slides.
- Device scale must remain consistent.
- Ensure devices fit **vertically within the 9:16 frame**, keeping top and bottom safe margins for text.
LIGHTING SYSTEM:
- Use directional key light (top-left OR top-right — choose one and keep consistent).
- Subtle rim light on device edges for separation.
- Soft bloom glow behind primary device.
- Avoid extreme lens flares.
- Keep lighting premium and controlled.
LAYOUT STRUCTURE:
- Text must remain clear and anchored.
- Headline placed either top-left or top-right consistently across all slides.
- Text must not float randomly.
- Use invisible grid alignment even in cinematic layout.
- Maintain safe spacing from edges.
- Respect 9:16 vertical layout zones:
  - Top 20–25% → Headline
  - Middle 55–60% → Device(s)
  - Bottom 15–20% → Subtitle or micro-stat
TYPOGRAPHY SYSTEM:
- Use bold modern sans-serif with strong presence.
- Headline:
  - Short, powerful, emotionally engaging.
  - Max 6 words.
- Subtitle:
  - Supportive benefit statement.
  - Keep concise.
- Maintain consistent hierarchy across all slides.
TEXT STYLE RULES:
- Messaging may be slightly more aspirational.
- Avoid hype language.
- Avoid excessive punctuation.
- Keep tone confident and premium.
- Ensure high contrast against background.
BACKGROUND ENVIRONMENT:
- Use dark-to-light gradients or subtle color washes.
- Add faint volumetric light behind device.
- No busy patterns.
- No stock photos or real-world environments.
- Keep background abstract and product-focused.
COLOR SYSTEM:
- Use:
  - 1 primary brand color (for glow accents)
  - Neutral dark or deep tone base
  - Optional subtle secondary highlight
- Maintain consistent color mood across all slides.
- Do not dramatically change background color between slides.
VISUAL CONSISTENCY RULES:
- Same light direction across all screenshots.
- Same tilt degree for primary device.
- Same shadow softness and glow intensity.
- Same typography scale.
- Same spatial depth structure.
- No random layout shifts.
STORY FLOW STRUCTURE:
- Slide 1 → Hero cinematic value moment.
- Slide 2–5 → Feature highlights with layered depth.
- Slide 6 → Workflow or interaction progression.
- Slide 7 → Performance / analytics / data moment.
- Slide 8 → Strong premium closing scene.
APP STORE OPTIMIZATION:
- Must fit **9:16 portrait preview**.
- Headline readable at thumbnail size.
- Avoid thin fonts on dark backgrounds.
- Maintain strong text contrast.
- Avoid overcrowding with too many devices.
- Preserve breathing space even with depth layers.
SHADOW SYSTEM:
- Realistic soft shadows based on light direction.
- Slight shadow overlap between layered devices.
- No exaggerated 3D cartoon shadows.
REALISM LEVEL:
- High-end product launch aesthetic.
- Premium keynote-level presentation.
- Dimensional but refined.
- Ultra-polished App Store ready visuals.
Output ONLY a JSON object with this schema:
{
  "type": "app_store_pro_screenshots",
  "grid_layout": {
    "rows": 2,
    "columns": 4,
    "total_cells": 8,
    "arrangement": "All 8 screenshots arranged in a single image as a 2×4 grid (2 rows, 4 columns). Each grid cell contains one complete vertical marketing screenshot."
  },
  "style": {
    "branding_theme": "",
    "color_palette": [],
    "typography": ""
  },
  "screenshots_overview": {
    "count": 8,
    "device_frames": "layered modern smartphone frames with controlled depth and slight perspective",
    "tagline_style": "short powerful headline with refined supporting line",
    "visual_consistency_rules": [
      "Consistent light direction across slides",
      "Uniform device tilt angle",
      "Maintained depth-of-field logic",
      "Consistent glow intensity",
      "Unified typography hierarchy",
      "Stable spatial composition system",
      "Strict 9:16 vertical portrait layout"
    ]
  },
  "screenshots": [
    {
      "title_text": "",
      "subtitle_text": "",
      "screen_visual_description": "",
      "ui_elements_emphasized": [],
      "background_effects": ""
    }
  ],
  "lighting": {
    "ambient": "directional cinematic key light with subtle bloom",
    "device_glow": "soft rim light for separation",
    "shadow_style": "realistic depth-based shadows aligned with key light"
  },
  "realism": "premium cinematic product-launch marketing visuals, dimensional layered composition, high-end App Store presentation, 9:16 vertical ready"
}
${GRID_RULES}
- Maintain consistent light direction and tilt angle.
- Ensure **all screenshots are strictly 9:16 portrait**.
- Do NOT introduce chaotic overlapping.`;

// ── Style 7: Editorial lifestyle with floating objects ───────────

const STYLE_7 = `${GRID_PREAMBLE}
You are generating premium App Store screenshots for a lifestyle-focused app.
Return ONLY a valid JSON object.
Do not include explanations.
Generate exactly 8 vertical screenshots (9:16).
CORE STYLE CONCEPT:
This is an editorial, fashion-magazine-inspired screenshot system.
The app UI must feel integrated into a lifestyle context.
The composition must include floating cut-out objects relevant to the app.
This style is soft, aesthetic, and aspirational — not aggressive.
VISUAL STRUCTURE:
Each screenshot must include:
1. Soft neutral background (beige, warm cream, light pastel)
2. Rounded vertical container card holding the app UI
3. Floating cut-out objects around the device (realistic shadows)
4. Elegant serif headline typography at top
5. Airy spacing and breathing room
6. Subtle layered depth
TYPOGRAPHY SYSTEM:
- Serif font (editorial feel, high-fashion energy)
- Headline: 3–6 words
- Sentence case (not ALL CAPS)
- Calm, aspirational tone
- No giant single-word anchors
- No bold billboard typography
BACKGROUND RULES:
- Soft neutral palette
- No dark backgrounds
- No high-contrast neon colors
- Minimal gradients allowed (very subtle)
- Slight paper-like warmth preferred
DEVICE RULES:
- iPhone mockup inside rounded container card
- Slight drop shadow
- Centered or slightly off-center
- No aggressive tilt
- Device should feel embedded in design
COLLAGE RULES:
- 4–10 floating cut-out objects relevant to the app
- Objects must have:
  - Soft realistic shadow
  - Slight depth
  - Clean cut-out edges
- Objects should feel organically scattered
- Do not overcrowd layout
SOCIAL PROOF INTEGRATION:
- Ratings
- User count
- Review numbers
- Small badge icons
Must be visually integrated, not oversized.
DEPTH SYSTEM:
- Soft layered stacking
- Subtle shadows
- Slight object overlap
- Gentle 3D realism
- No dramatic lighting
SCREEN FLOW:
1. Intro (brand + social proof)
2. Core management feature
3. Creative feature
4. Discovery feature
5. Organization feature
6. Personalization feature
7. Community/social feature
8. Closing aspirational lifestyle shot
APP STORE OPTIMIZATION:
- Must remain readable at small preview size
- Headline must not exceed 2 lines
- Maintain safe top/bottom margins
- Avoid clutter
- Clean hierarchy
REALISM LEVEL:
- High-end fashion app aesthetic
- Instagram / Pinterest visual language
- Soft editorial tone
- Clean premium SaaS finish
Output ONLY a JSON object using this schema:
{
  "type": "app_store_pro_screenshots",
  "grid_layout": {
    "rows": 2,
    "columns": 4,
    "total_cells": 8,
    "arrangement": "All 8 screenshots arranged in a single image as a 2×4 grid (2 rows, 4 columns). Each grid cell contains one complete vertical marketing screenshot."
  },
  "style": {
    "branding_theme": "",
    "color_palette": [],
    "typography": ""
  },
  "screenshots_overview": {
    "count": 8,
    "device_frames": "iPhone mockup inside rounded container card with soft shadow",
    "tagline_style": "elegant serif headline, calm aspirational tone",
    "visual_consistency_rules": [
      "Consistent soft neutral background palette",
      "Uniform floating object style and shadow depth",
      "Identical serif typography hierarchy",
      "Consistent container card styling",
      "Unified collage density and spacing",
      "Harmonized editorial aesthetic across all slides"
    ]
  },
  "screenshots": [
    {
      "title_text": "",
      "subtitle_text": "",
      "screen_visual_description": "",
      "ui_elements_emphasized": [],
      "background_effects": ""
    }
  ],
  "lighting": {
    "ambient": "soft diffused natural light, editorial studio feel",
    "device_glow": "gentle embedded shadow within container card",
    "shadow_style": "soft realistic shadows on floating objects"
  },
  "realism": "high-end editorial lifestyle aesthetic, fashion-magazine inspired, Pinterest-quality premium finish"
}
${GRID_RULES}
- Enforce thematic cohesion.
- Do NOT use dark backgrounds or aggressive typography.`;

// ── Style 8: Floating product reveal (Apple keynote) ─────────────

const STYLE_8 = `${GRID_PREAMBLE}
Return ONLY a valid JSON object following the schema provided below.
Do NOT include explanations.
Do NOT include commentary.
Do NOT break structure.
Generate exactly 8 screenshots.
CORE CONCEPT:
This style is a premium floating product reveal aesthetic.
The device is the hero.
The UI is clearly visible.
Typography supports the product.
The overall look must feel like an Apple keynote slide.
FORMAT REQUIREMENTS:
- Strict 9:16 vertical portrait layout.
- Designed for App Store preview.
- Maintain safe margins (top and bottom).
- Headline must be readable at thumbnail size.
DEVICE SYSTEM:
- Use 1–2 realistic modern smartphone frames per screenshot.
- Primary device slightly angled (8–12° max).
- Maintain identical tilt angle across all 8 slides.
- Maintain consistent device scale across all slides.
- Devices must float with subtle realistic shadow beneath.
- If secondary device is used, it must sit behind primary and slightly offset.
- No chaotic overlapping.
- Devices must remain vertically centered within 9:16 frame.
DEPTH SYSTEM (MANDATORY):
- Foreground: Primary device in sharp focus.
- Midground: Optional secondary device slightly softened.
- Background: Soft gradient environment with subtle bloom.
- Apply controlled depth-of-field:
  - Devices crisp.
  - Background diffused.
- Maintain identical depth logic across all slides.
LIGHTING SYSTEM:
- Choose ONE light direction (top-left OR top-right).
- Use it consistently across all slides.
- Add subtle rim light on device edges.
- Add soft bloom glow behind primary device.
- Avoid harsh reflections.
- No extreme lens flares.
LAYOUT STRUCTURE:
- Headline must be anchored consistently (top-left OR top-right — choose one and keep consistent).
- Top 20–25% → Headline.
- Middle 55–60% → Device(s).
- Bottom 15–20% → Subtitle.
- Use invisible grid alignment.
- No floating random text placement.
- Maintain generous breathing space.
TYPOGRAPHY SYSTEM:
- Bold modern sans-serif.
- Headline:
  - Max 6 words.
  - Emotion-driven.
  - Short and powerful.
- Subtitle:
  - Short supporting benefit.
  - Concise and refined.
- Maintain consistent hierarchy and font scale across slides.
TEXT STYLE RULES:
- Slightly aspirational tone.
- Avoid hype language.
- Avoid excessive punctuation.
- Keep confident and premium.
- Ensure strong contrast against background.
BACKGROUND ENVIRONMENT:
- Dark-to-light gradient or deep premium base tone.
- Subtle volumetric glow behind device.
- No patterns.
- No stock images.
- No real-world environments.
- Abstract and product-focused only.
COLOR SYSTEM:
- Use 1 primary brand color (for glow accents).
- Use 1 deep neutral base tone.
- Optional subtle secondary highlight.
- Maintain consistent color mood across all slides.
- Do not drastically change background color between slides.
SHADOW SYSTEM:
- Realistic soft floating shadows aligned with light direction.
- Slight shadow overlap if two devices are layered.
- No exaggerated cartoon shadows.
STORY FLOW STRUCTURE:
- Slide 1 → Hero product reveal moment.
- Slide 2–4 → Feature highlights.
- Slide 5 → Workflow or interaction layering moment.
- Slide 6 → Guided process or transition state.
- Slide 7 → Performance / analytics / data emphasis.
- Slide 8 → Strong premium closing product hero.
APP STORE OPTIMIZATION:
- Headline must remain readable at small preview size.
- Avoid thin fonts on dark backgrounds.
- Avoid overcrowding.
- Preserve breathing space.
- Strictly optimized for 9:16 portrait.
REALISM LEVEL:
- High-end product launch aesthetic.
- Premium keynote-level presentation.
- Dimensional but refined.
- Ultra-polished App Store-ready visuals.
Output ONLY a JSON object using this schema:
{
  "type": "app_store_pro_screenshots",
  "grid_layout": {
    "rows": 2,
    "columns": 4,
    "total_cells": 8,
    "arrangement": "All 8 screenshots arranged in a single image as a 2×4 grid (2 rows, 4 columns). Each grid cell contains one complete vertical marketing screenshot."
  },
  "style": {
    "branding_theme": "",
    "color_palette": [],
    "typography": ""
  },
  "screenshots_overview": {
    "count": 8,
    "device_frames": "floating modern smartphone frames with controlled depth and subtle angle",
    "tagline_style": "short powerful headline with refined supporting subtitle",
    "visual_consistency_rules": [
      "Consistent light direction across slides",
      "Uniform device tilt angle",
      "Maintained depth-of-field logic",
      "Consistent bloom glow intensity",
      "Unified typography hierarchy",
      "Stable spatial composition system",
      "Strict 9:16 vertical portrait layout"
    ]
  },
  "screenshots": [
    {
      "title_text": "",
      "subtitle_text": "",
      "screen_visual_description": "",
      "ui_elements_emphasized": [],
      "background_effects": ""
    }
  ],
  "lighting": {
    "ambient": "directional key light with subtle bloom",
    "device_glow": "soft rim light for edge separation",
    "shadow_style": "realistic floating shadows aligned with key light"
  },
  "realism": "premium Apple keynote product-reveal aesthetic, floating hero device presentation, ultra-polished App Store-ready visuals"
}
${GRID_RULES}
- Maintain consistent light direction and tilt angle.
- Ensure **all screenshots are strictly 9:16 portrait**.
- Do NOT introduce chaotic overlapping.`;

// ── Export ────────────────────────────────────────────────────────

export const STYLE_PROMPTS: Record<number, string> = {
  1: STYLE_1,
  2: STYLE_2,
  3: STYLE_3,
  4: STYLE_4,
  5: STYLE_5,
  6: STYLE_6,
  7: STYLE_7,
  8: STYLE_8,
};
