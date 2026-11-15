import { z } from 'zod';
import { getAudioContext, type LoadedAssets } from './assets.js';

const AssetManifestSchema = z.object({
  images: z.record(z.string(), z.string()).default({}),
  audio: z.record(z.string(), z.string()).default({})
});

export async function loadAll(
  manifestUrl: string,
  onProgress: (progress: number) => void,
  signal: AbortSignal
): Promise<LoadedAssets> {
  const images = new Map<string, HTMLImageElement>();
  const audio = new Map<string, AudioBuffer>();

  try {
    const response = await fetch(manifestUrl, { signal });
    if (!response.ok) {
      onProgress(1);
      return { images, audio };
    }

    const rawJson: unknown = await response.json();
    const parsed = AssetManifestSchema.safeParse(rawJson);
    if (!parsed.success) {
      onProgress(1);
      return { images, audio };
    }

    const imageEntries = Object.entries(parsed.data.images);
    const audioEntries = Object.entries(parsed.data.audio);
    const total = imageEntries.length + audioEntries.length;

    if (total === 0) {
      onProgress(1);
      return { images, audio };
    }

    let loadedCount = 0;
    const tickProgress = (): void => {
      loadedCount += 1;
      onProgress(loadedCount / total);
    };

    for (const [key, url] of imageEntries) {
      const img = await loadImage(url);
      if (img) images.set(key, img);
      tickProgress();
    }

    const ctx = getAudioContext();
    for (const [key, url] of audioEntries) {
      const buf = await loadAudioBuffer(url, ctx, signal);
      if (buf) audio.set(key, buf);
      tickProgress();
    }

    return { images, audio };
  } catch {
    onProgress(1);
    return { images, audio };
  }
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function loadAudioBuffer(
  url: string,
  ctx: AudioContext,
  signal: AbortSignal
): Promise<AudioBuffer | null> {
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    return await ctx.decodeAudioData(arrayBuffer);
  } catch {
    return null;
  }
}