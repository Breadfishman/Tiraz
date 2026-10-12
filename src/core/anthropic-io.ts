/**
 * Real Anthropic vision I/O for the taste judge (SPEC §9). Excluded from unit coverage — it reads
 * image files and calls the hosted API — so it is kept thin: all prompt/verdict logic lives in the
 * tested `vision-judge.ts`. `@anthropic-ai/sdk` is an optional dependency (lazy-imported); the API
 * key is read from `ANTHROPIC_API_KEY`.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { VisionRankingJudge } from './vision-judge';
import type { VisionComplete, VisionRequest } from './vision-judge';

type MediaType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';

function mediaTypeFor(file: string): MediaType {
  switch (path.extname(file).toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    default:
      return 'image/png';
  }
}

async function imageBlock(file: string): Promise<{
  type: 'image';
  source: { type: 'base64'; media_type: MediaType; data: string };
}> {
  const data = await readFile(file);
  return {
    type: 'image',
    source: { type: 'base64', media_type: mediaTypeFor(file), data: data.toString('base64') },
  };
}

/** Call Anthropic's vision model with the ranking prompt + every screenshot; return its text. */
export const anthropicVisionComplete: VisionComplete = async (req: VisionRequest) => {
  let mod: typeof import('@anthropic-ai/sdk');
  try {
    mod = await import('@anthropic-ai/sdk');
  } catch {
    throw new Error('@anthropic-ai/sdk is not installed. Run `npm install @anthropic-ai/sdk`.');
  }
  if (process.env.ANTHROPIC_API_KEY === undefined || process.env.ANTHROPIC_API_KEY === '') {
    throw new Error('The vision judge requires an API key — set ANTHROPIC_API_KEY.');
  }

  // Minimal view of just the surface we use — avoids leaning on the optional SDK's deep types.
  interface AnthropicLike {
    messages: { create(body: unknown): Promise<{ content: { type: string; text?: string }[] }> };
  }
  const AnthropicCtor = mod.default as unknown as new () => AnthropicLike;
  const client = new AnthropicCtor();
  const images = await Promise.all(req.imagePaths.map((file) => imageBlock(file)));
  const refs = await Promise.all((req.referencePaths ?? []).map((file) => imageBlock(file)));

  // Label each image so the model can map it to its option number unambiguously.
  const content: unknown[] = [];
  images.forEach((image, i) => {
    content.push({ type: 'text', text: `Option ${String(i + 1)}:` }, image);
  });
  refs.forEach((image, i) => {
    content.push({ type: 'text', text: `Reference ${String(i + 1)} (not an option):` }, image);
  });
  content.push({ type: 'text', text: req.prompt });

  const message = await client.messages.create({
    model: req.model,
    max_tokens: 2048,
    system: req.system,
    messages: [{ role: 'user', content }],
  });

  return message.content
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text ?? '')
    .join('\n');
};

/** Build a live {@link VisionRankingJudge} wired to the Anthropic vision API. */
export function createVisionJudge(): VisionRankingJudge {
  return new VisionRankingJudge(anthropicVisionComplete);
}
