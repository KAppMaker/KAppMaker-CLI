import { z } from 'zod';
import { cli, flags, type ToolDef } from '../define.js';

const resolution = z.enum(['1K', '2K', '4K']).optional().describe('AI resolution (default 2K)');
const spec = z.string().optional()
  .describe('Path to a filled spec JSON (from spec_template). Preferred: you write the spec, so no OpenAI call or key is needed');
const FAL = 'Spends credits on YOUR fal.ai account (falApiKey in kappmaker config).';

export const assetTools: ToolDef[] = [
  cli({
    name: 'spec_template',
    title: 'Get a spec template for image generation',
    description:
      'Returns the canonical JSON template (with fill instructions) for one image kind, to fill from the app\'s ' +
      'AiGuidelines/ and pass as `spec` to the generate_* tools. With `output`, writes it to that file (never overwrites). Omit kind to list kinds.',
    kind: 'write',
    shape: {
      kind: z.enum(['screenshots', 'feature-graphic', 'logo', 'image', 'mascot', 'mascot-states', 'mascot-animation']).optional(),
      output: z.string().optional().describe('File to write, e.g. Assets/screenshots/spec.json'),
    },
    commands: (i) => [i.kind ? ['spec-template', i.kind, ...flags({ '--output': i.output })] : ['spec-template', '--list']],
  }),
  cli({
    name: 'generate_logo',
    title: 'Generate 16 logo options',
    description:
      'Generates a 4×4 grid of 16 logo concepts with AI and saves it as Assets/logo_variations.png (look at that image), ' +
      'then call pick_logo with the chosen number. Give `prompt` (app idea, audience, style) or a logo `spec`.',
    kind: 'paid',
    network: true,
    shape: { prompt: z.string().optional(), spec, output: z.string().optional().describe('Final logo path (the grid goes next to it)') },
    commands: (i) => [['create-logo', '--grid-only', ...flags({ '--prompt': i.prompt, '--spec': i.spec, '--output': i.output })]],
    planNote: () => `One image generation. ${FAL}`,
  }),
  cli({
    name: 'pick_logo',
    title: 'Pick a logo from the grid',
    description: 'Cuts logo 1-16 (left to right, top to bottom) out of the grid made by generate_logo. Free, local. Next: generate_icons.',
    kind: 'write',
    shape: {
      choice: z.number().int().min(1).max(16),
      zoom: z.number().positive().optional().describe('Crop zoom, e.g. 1.1 to trim background edges'),
      gap: z.number().int().min(0).optional(),
      output: z.string().optional().describe('Default: Assets/app_logo.png'),
    },
    commands: (i) => [['create-logo', '--choose', String(i.choice), ...flags({ '--zoom': i.zoom, '--gap': i.gap, '--output': i.output })]],
  }),
  cli({
    name: 'generate_icons',
    title: 'Make app icons from the logo',
    description: 'Writes every iOS AppIcon size and/or Android launcher icon (all densities + adaptive icon) from one logo. No AI, free.',
    kind: 'write',
    shape: {
      platform: z.enum(['both', 'ios', 'android']).default('both'),
      source: z.string().optional().describe('Logo PNG (default: auto-detect under Assets/)'),
      background: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().describe('Background hex, e.g. "#FFFFFF"'),
    },
    commands: (i) => {
      const common = flags({ '--source': i.source, '--background': i.background });
      const out: string[][] = [];
      if (i.platform !== 'android') out.push(['generate-ios-icons', ...common]);
      if (i.platform !== 'ios') out.push(['generate-android-icons', ...common]);
      return out;
    },
  }),
  cli({
    name: 'generate_screenshots',
    title: 'Generate store marketing screenshots',
    description:
      'Generates 8 App Store / Play marketing screenshots (headlines, device frames) from the app\'s real screens in ' +
      'Assets/screenshots. Pass a filled `spec` (spec_template kind=screenshots); `prompt` instead uses OpenAI to write the spec.',
    kind: 'paid',
    network: true,
    shape: {
      spec, prompt: z.string().optional().describe('App description; only used when no spec is given'),
      style: z.number().int().min(1).max(8).optional().describe('Style preset 1-8'),
      input: z.string().optional().describe('Folder of reference screenshots'),
      output: z.string().optional(), resolution,
    },
    commands: (i) => [['generate-screenshots', ...flags({
      '--spec': i.spec, '--prompt': i.prompt, '--style': i.style, '--input': i.input, '--output': i.output, '--resolution': i.resolution,
    })]],
    planNote: (i) => `One image generation (${i.resolution ?? '2K'}). ${FAL}${i.spec ? '' : ' Also one OpenAI call (openaiApiKey).'}`,
  }),
  cli({
    name: 'generate_feature_graphic',
    title: 'Generate the Google Play feature graphic',
    description: 'Generates the 1024×500 Play Store feature graphic. Pass a filled `spec`, or prompt + app_name + primary_color.',
    kind: 'paid',
    network: true,
    shape: {
      spec, prompt: z.string().optional(), app_name: z.string().optional(),
      primary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(), subtitle: z.string().optional(),
      logo: z.string().optional(), reference: z.array(z.string()).max(10).optional().describe('App screenshots to frame'),
      output: z.string().optional(), locale: z.string().optional(), resolution,
    },
    commands: (i) => [['generate-feature-image', ...flags({
      '--spec': i.spec, '--prompt': i.prompt, '--app-name': i.app_name, '--primary-color': i.primary_color,
      '--subtitle': i.subtitle, '--logo': i.logo, '--reference': i.reference, '--output': i.output,
      '--locale': i.locale, '--resolution': i.resolution,
    })]],
    planNote: (i) => `One image generation. ${FAL}${i.spec ? '' : ' Also one OpenAI call (openaiApiKey).'}`,
  }),
  cli({
    name: 'generate_image',
    title: 'Generate any image',
    description: 'General AI image (illustrations, onboarding art, backgrounds). With `reference` images it edits/derives from them.',
    kind: 'paid',
    network: true,
    shape: {
      prompt: z.string().optional(), spec, output: z.string().optional(),
      num_images: z.number().int().min(1).max(8).default(1),
      aspect_ratio: z.enum(['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9', '9:21', 'auto']).default('1:1'),
      resolution, reference: z.array(z.string()).max(10).optional(),
    },
    commands: (i) => [['generate-image', ...flags({
      '--prompt': i.prompt, '--spec': i.spec, '--output': i.output, '--num-images': i.num_images,
      '--aspect-ratio': i.aspect_ratio, '--resolution': i.resolution, '--reference': i.reference,
    })]],
    planNote: (i) => `${i.num_images} image generation(s). ${FAL}`,
  }),
  cli({
    name: 'translate_screenshots',
    title: 'Translate store screenshots',
    description: 'Translates the en-US store screenshots into other locales and writes them into the Fastlane distribution folders.',
    kind: 'paid',
    network: true,
    shape: {
      locales: z.array(z.string()).min(1).describe('Play locale codes, e.g. ["de-DE","ja-JP"]'),
      source_dir: z.string().optional(), output: z.string().optional(), resolution,
    },
    commands: (i) => [['translate-screenshots', ...(i.source_dir ? [i.source_dir] : []),
      ...flags({ '--locales': i.locales, '--output': i.output, '--resolution': i.resolution })]],
    planNote: (i) => `One image generation per locale (${i.locales.length}). ${FAL} Also uploads images to imgbb (imgbbApiKey).`,
  }),
];
