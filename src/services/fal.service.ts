import path from 'node:path';
import fs from 'fs-extra';
import ora from 'ora';
import { logger } from '../utils/logger.js';
import type { FalQueueResponse } from '../types/index.js';

const FAL_NANO_BANANA_URL = 'https://queue.fal.run/fal-ai/nano-banana-2';
const FAL_NANO_BANANA_EDIT_URL = 'https://queue.fal.run/fal-ai/nano-banana-2/edit';
const FAL_BG_REMOVE_URL = 'https://queue.fal.run/fal-ai/bria/background/remove';

function headers(apiKey: string): Record<string, string> {
  return {
    Authorization: `Key ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

// ── Image generation ────────────────────────────────────────────────

export async function submitGeneration(
  apiKey: string,
  prompt: string,
): Promise<FalQueueResponse> {
  const response = await fetch(FAL_NANO_BANANA_URL, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({
      prompt,
      num_images: 1,
      resolution: '2K',
      output_format: 'png',
      aspect_ratio: '1:1',
      safety_tolerance: '6',
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    logger.fatal(`fal.ai submission failed (${response.status}): ${body}`);
    process.exit(1);
  }

  return (await response.json()) as FalQueueResponse;
}

// ── Screenshot generation (with optional reference images) ──────────

export async function submitScreenshotGeneration(
  apiKey: string,
  prompt: string,
  imageUrls?: string[],
  resolution: string = '2K',
): Promise<FalQueueResponse> {
  const hasRefs = imageUrls && imageUrls.length > 0;
  const endpoint = hasRefs ? FAL_NANO_BANANA_EDIT_URL : FAL_NANO_BANANA_URL;

  const payload: Record<string, unknown> = {
    prompt,
    num_images: 1,
    resolution,
    output_format: 'png',
    aspect_ratio: '1:1',
    safety_tolerance: '6',
  };

  if (hasRefs) {
    payload.image_urls = imageUrls;
  }

  logger.info(`Prompt length: ${prompt.length} chars`);
  logger.info(`Endpoint: ${hasRefs ? 'nano-banana-2/edit' : 'nano-banana-2'}`);
  if (hasRefs) {
    logger.info(`Reference images: ${imageUrls!.length} URLs`);
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    logger.fatal(`fal.ai screenshot generation failed (${response.status}): ${body}`);
    process.exit(1);
  }

  return (await response.json()) as FalQueueResponse;
}

// ── Image enhancement (img2img) ─────────────────────────────────────

export async function submitEnhancement(
  apiKey: string,
  imagePath: string,
): Promise<FalQueueResponse> {
  const dataUri = await imageToDataUri(imagePath);

  const prompt =
    'Upscale and improve the quality of this image. ' +
    'Make it sharper and higher resolution. ' +
    'Keep the exact same image, do not change anything.';

  const response = await fetch(FAL_NANO_BANANA_EDIT_URL, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({
      prompt,
      image_urls: [dataUri],
      num_images: 1,
      resolution: '2K',
      output_format: 'png',
      safety_tolerance: '6',
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    logger.fatal(`fal.ai enhancement failed (${response.status}): ${body}`);
    process.exit(1);
  }

  return (await response.json()) as FalQueueResponse;
}

// ── Background removal ──────────────────────────────────────────────

export async function submitBackgroundRemoval(
  apiKey: string,
  imagePath: string,
): Promise<FalQueueResponse> {
  const dataUri = await imageToDataUri(imagePath);

  const response = await fetch(FAL_BG_REMOVE_URL, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({
      image_url: dataUri,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    logger.fatal(`fal.ai background removal failed (${response.status}): ${body}`);
    process.exit(1);
  }

  return (await response.json()) as FalQueueResponse;
}

// ── Image upload (imgbb) ─────────────────────────────────────────────

export async function uploadImageToImgbb(
  imgbbApiKey: string,
  filePath: string,
): Promise<string> {
  const data = await fs.readFile(filePath);
  const b64 = data.toString('base64');

  const form = new URLSearchParams();
  form.append('key', imgbbApiKey);
  form.append('image', b64);

  const response = await fetch('https://api.imgbb.com/1/upload', {
    method: 'POST',
    body: form,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`imgbb upload failed (${response.status}): ${text}`);
  }

  const result = (await response.json()) as { data?: { url?: string } };
  const url = result.data?.url;
  if (!url) throw new Error('No URL returned from imgbb');
  return url;
}

// ── Screenshot translation (img2img) ────────────────────────────────

export async function submitTranslation(
  apiKey: string,
  imageUrl: string,
  locale: string,
  resolution: string = '2K',
): Promise<FalQueueResponse> {
  const prompt =
    `Keep the image exactly the same — same layout, same design, same colors, same structure. ` +
    `Only translate all visible text into ${locale}. Do not change anything else.`;

  const response = await fetch(FAL_NANO_BANANA_EDIT_URL, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({
      prompt,
      image_urls: [imageUrl],
      num_images: 1,
      resolution,
      output_format: 'png',
      aspect_ratio: 'auto',
      safety_tolerance: '6',
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`fal.ai translation submit failed for ${locale} (${response.status}): ${body}`);
  }

  return (await response.json()) as FalQueueResponse;
}

export async function pollTranslation(
  apiKey: string,
  statusUrl: string,
  intervalMs: number = 10_000,
): Promise<void> {
  while (true) {
    const res = await fetch(statusUrl, { headers: headers(apiKey) });
    if (!res.ok) throw new Error(`Status check failed (${res.status})`);

    const data = (await res.json()) as { status: string; error?: string };
    if (data.status === 'COMPLETED') return;
    if (data.status === 'FAILED') throw new Error(data.error ?? 'Unknown fal.ai error');

    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

// ── Shared helpers ──────────────────────────────────────────────────

export async function pollUntilComplete(
  apiKey: string,
  statusUrl: string,
  opts?: { label?: string; intervalMs?: number },
): Promise<void> {
  const intervalMs = opts?.intervalMs ?? 5_000;
  const label = opts?.label ?? 'Processing';
  const startTime = Date.now();
  const spinner = ora({
    text: `${label}... (0s)`,
    indent: 4,
  }).start();

  const formatElapsed = (): string => {
    const secs = Math.floor((Date.now() - startTime) / 1000);
    return secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`;
  };

  while (true) {
    const res = await fetch(statusUrl, { headers: headers(apiKey) });
    if (!res.ok) {
      spinner.fail('Failed to check status');
      logger.error(`Status check failed (${res.status})`);
      process.exit(1);
    }

    const data = (await res.json()) as { status: string; error?: string };

    if (data.status === 'COMPLETED') {
      spinner.succeed(`${label} — done (${formatElapsed()})`);
      return;
    }

    if (data.status === 'FAILED') {
      spinner.fail(`${label} — failed`);
      logger.error(data.error ?? 'Unknown error from fal.ai');
      process.exit(1);
    }

    spinner.text = `${label}... (${formatElapsed()})`;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

export async function fetchResult(
  apiKey: string,
  responseUrl: string,
): Promise<string> {
  const res = await fetch(responseUrl, { headers: headers(apiKey) });
  if (!res.ok) {
    logger.fatal(`Failed to fetch result (${res.status})`);
    process.exit(1);
  }

  const data = (await res.json()) as { images?: { url: string }[]; image?: { url: string } };
  const imageUrl = data.images?.[0]?.url ?? data.image?.url;
  if (!imageUrl) {
    logger.fatal('No image URL in fal.ai response');
    process.exit(1);
  }

  return imageUrl;
}

export async function downloadImage(
  url: string,
  outputPath: string,
): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    logger.fatal(`Failed to download image (${res.status})`);
    process.exit(1);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(outputPath, buffer);
}

export async function imageToDataUri(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
  };
  const mime = mimeMap[ext] ?? 'image/png';
  const data = await fs.readFile(filePath);
  const b64 = data.toString('base64');
  return `data:${mime};base64,${b64}`;
}
