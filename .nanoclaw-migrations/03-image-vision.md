# Image & Vision

**Intent:** Enable multimodal (image) input from Telegram photos. Images are downloaded, resized, and passed as base64 content blocks to the Claude agent in the container.

## Files

- `src/image.ts` — NEW (95 lines)
- `src/types.ts` — MODIFIED (add ImageAttachment, images field)

## How to Apply

### 1. Create src/image.ts

New file with these exports:

```typescript
import sharp from 'sharp';

export interface ProcessedImage {
  base64: string;
  mimeType: 'image/jpeg';
  width: number;
  height: number;
  originalSize: number;
}

export async function downloadImage(url: string, timeoutMs = 30_000): Promise<Buffer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(timeout);
  }
}

export async function processImage(buffer: Buffer): Promise<ProcessedImage> {
  const processed = await sharp(buffer)
    .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer({ resolveWithObject: true });
  return {
    base64: processed.data.toString('base64'),
    mimeType: 'image/jpeg',
    width: processed.info.width,
    height: processed.info.height,
    originalSize: buffer.length,
  };
}

export async function downloadAndProcessImage(
  url: string,
  savePath?: string,
): Promise<ProcessedImage> {
  const buffer = await downloadImage(url);
  if (savePath) {
    const fs = await import('fs');
    fs.writeFileSync(savePath, buffer);
  }
  return processImage(buffer);
}
```

**Critical values:** 1024px max (longest edge), fit `inside`, no enlargement, JPEG quality 80%.

### 2. Modify src/types.ts

Add `ImageAttachment` interface and extend `NewMessage`:

```typescript
export interface ImageAttachment {
  base64: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
}

export interface NewMessage {
  // ... existing fields ...
  images?: ImageAttachment[];
  location?: { latitude: number; longitude: number };
  modelOverride?: string;
  thinkingBudget?: number;
  // ... upstream fields (thread_id, reply_to_*) follow ...
}
```

These fields are used by:
- `telegram.ts` (sets images, location, modelOverride, thinkingBudget on ingest)
- `index.ts` (reads images for cache, reads modelOverride/thinkingBudget for container)
- `container-runner.ts` (passes images and model/thinking to container)
