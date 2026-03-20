import path from 'node:path';
import sharp from 'sharp';
import { execa } from 'execa';
import { logger } from '../utils/logger.js';
import type { ExtractOptions } from '../types/index.js';

const GRID_COLS = 4;
const GRID_ROWS = 4;
const OUTPUT_SIZE = 512;
const DEFAULT_ZOOM = 1.07;
const DEFAULT_GAP = 0;

export function buildLogoPrompt(appIdea: string): string {
  return `Create a 4\u00d74 grid of iOS app icons exploring 16 different stylistic interpretations of the same app idea:
"${appIdea}"
Each cell should show a *unique visual concept and style*, while the overall grid feels cohesive, modern, and playful \u2014 similar to indie iOS app icons.
---
## Core Visual Language (applies to ALL icons)
All icons should be:
- rounded square iOS app icons
- cute, modern, minimal, and friendly
- smooth, soft, and slightly 3D
- colorful with gradients and subtle lighting
- polished and App-Store-ready
Design inspirations include:
- soft rounded geometry
- expressive simple characters (optional)
- pastel + neon gradients
- subtle shadow + depth
- cozy indie-app aesthetic
Avoid:
- text
- photorealism
- clutter
- harsh detail
---
## Global Rendering Rules
The following MUST remain identical across all 16 icons:
- canvas size
- icon proportions
- lighting direction (soft top-front light)
- composition and framing
- overall polish
**Only the icon design style should change.**
Background grid should:
- be seamless and clean
- use a dark neutral background
- keep **equal spacing between icons**, both horizontally and vertically
- make the spacing **small but sufficient** so icons do not touch
- feel presentation-ready
**Important for slicing:**
- spacing and alignment must be precise and identical across all rows and columns
- each icon must be fully contained within its cell
---
## 4\u00d74 Grid \u2014 Style Themes (Left \u2192 Right, Top \u2192 Bottom)
### Row 1 \u2014 Soft & Playful
1. Cute pastel character icon
2. Minimal bold glyph icon
3. Soft 3D bubble icon
4. Neon glow icon
### Row 2 \u2014 Friendly & Organic
5. Warm clay-like 3D icon
6. Cute geometric mascot icon
7. Gradient abstract symbol icon
8. Sticker-style icon
### Row 3 \u2014 Modern & Techy
9. Glossy high-contrast icon
10. Dark-mode neon symbol icon
11. Futuristic crystal-like icon
12. Soft isometric 3D icon
### Row 4 \u2014 Character & Fun
13. Cute blob mascot icon
14. Playful cartoon symbol icon
15. Ultra-minimal mono icon
16. Dreamy gradient icon
---
## Visual Quality Requirements
Each icon should feature:
- smooth rounded corners
- soft gradient lighting
- subtle depth + shading
- professional anti-aliasing
- high-end mobile app polish
Do NOT include:
- text labels
- UI mockups
- real-world photos
- noisy textures
---
## Output
A **single seamless image** containing:
- 4 rows \u00d7 4 columns
- 16 unique app icon designs
- consistent alignment and minimal to zero spacing
- dark neutral grid background
- presentation-ready quality
Spacing should be precise and consistent. Icons should not overlap or touch. Grid background must remain uniform and solid.`;
}

export async function extractLogo(
  gridPath: string,
  index: number,
  outputPath: string,
  opts?: ExtractOptions,
): Promise<void> {
  const zoom = opts?.zoom ?? DEFAULT_ZOOM;
  const gap = opts?.gap ?? DEFAULT_GAP;

  const meta = await sharp(gridPath).metadata();
  if (!meta.width || !meta.height) {
    logger.fatal('Could not read grid image dimensions');
    process.exit(1);
  }

  const tileW = Math.floor(meta.width / GRID_COLS);
  const tileH = Math.floor(meta.height / GRID_ROWS);

  const row = Math.floor((index - 1) / GRID_COLS);
  const col = (index - 1) % GRID_COLS;

  // Step 1: Crop tile with gap removed
  const cropW = tileW - gap * 2;
  const cropH = tileH - gap * 2;

  // Step 2: Apply zoom — crop from center to remove background edges
  const zoomW = Math.floor(cropW / zoom);
  const zoomH = Math.floor(cropH / zoom);
  const offsetX = Math.floor((cropW - zoomW) / 2);
  const offsetY = Math.floor((cropH - zoomH) / 2);

  await sharp(gridPath)
    .extract({
      left: col * tileW + gap + offsetX,
      top: row * tileH + gap + offsetY,
      width: zoomW,
      height: zoomH,
    })
    .resize(OUTPUT_SIZE, OUTPUT_SIZE)
    .toFile(outputPath);
}

export async function splitGrid(
  gridPath: string,
  outputDir: string,
  opts: { rows: number; cols: number; zoom: number; gap: number; width: number; height: number },
): Promise<void> {
  const total = opts.rows * opts.cols;

  for (let i = 1; i <= total; i++) {
    const outPath = path.join(outputDir, `image_${i}.png`);
    await extractTile(gridPath, i, outPath, opts);
  }

  logger.success(`Split into ${total} tiles in ${outputDir}`);
}

async function extractTile(
  gridPath: string,
  index: number,
  outputPath: string,
  opts: { rows: number; cols: number; zoom: number; gap: number; width: number; height: number },
): Promise<void> {
  const meta = await sharp(gridPath).metadata();
  if (!meta.width || !meta.height) {
    logger.fatal('Could not read grid image dimensions');
    process.exit(1);
  }

  const tileW = Math.floor(meta.width / opts.cols);
  const tileH = Math.floor(meta.height / opts.rows);

  const row = Math.floor((index - 1) / opts.cols);
  const col = (index - 1) % opts.cols;

  const cropW = tileW - opts.gap * 2;
  const cropH = tileH - opts.gap * 2;

  const zoomW = Math.floor(cropW / opts.zoom);
  const zoomH = Math.floor(cropH / opts.zoom);
  const offsetX = Math.floor((cropW - zoomW) / 2);
  const offsetY = Math.floor((cropH - zoomH) / 2);

  await sharp(gridPath)
    .extract({
      left: col * tileW + opts.gap + offsetX,
      top: row * tileH + opts.gap + offsetY,
      width: zoomW,
      height: zoomH,
    })
    .resize(opts.width, opts.height)
    .toFile(outputPath);
}

export async function openPreview(imagePath: string): Promise<void> {
  try {
    await execa('open', [path.resolve(imagePath)]);
  } catch {
    logger.warn(`Could not open preview. Grid saved at: ${imagePath}`);
  }
}
