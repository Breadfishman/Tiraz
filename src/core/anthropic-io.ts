/**
 * Real Anthropic vision I/O for the taste judge (SPEC §9). Excluded from unit coverage — it reads
 * image files and calls the hosted API — so it is kept thin: all prompt/verdict logic lives in the
 * tested `vision-judge.ts`. `@anthropic-ai/sdk` is an optional dependency (lazy-imported); the API
 * key is read from `ANTHROPIC_API_KEY`.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { VisionPairwiseJudge } from './vision-judge';
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

/** Call Anthropic's vision model with the lens prompt + both screenshots; return its text. */
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
  const [a, b] = await Promise.all([imageBlock(req.imagePaths[0]), imageBlock(req.imagePaths[1])]);

  const message = await client.messages.create({
    model: req.model,
    max_tokens: 1024,
    system: req.system,
    messages: [{ role: 'user', content: [{ type: 'text', text: req.prompt }, a, b] }],
  });

  return message.content
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text ?? '')
    .join('\n');
};

/** Build a live {@link VisionPairwiseJudge} wired to the Anthropic vision API. */
export function createVisionJudge(): VisionPairwiseJudge {
  return new VisionPairwiseJudge(anthropicVisionComplete);
}
