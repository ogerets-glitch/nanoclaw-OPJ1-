/**
 * Image processing for NanoClaw
 * Downloads, resizes, and encodes images for multimodal agent input.
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { logger } from './logger.js';

export interface ProcessedImage {
  base64: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  width: number;
  height: number;
  originalSize: number;
}

const MAX_DIMENSION = 1024;
const JPEG_QUALITY = 80;

/**
 * Download an image from a URL and return it as a Buffer.
 */
export async function downloadImage(
  url: string,
  timeoutMs = 30_000,
): Promise<Buffer> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Image download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Resize an image buffer so its longest side is at most MAX_DIMENSION,
 * convert to JPEG, and return base64-encoded data.
 */
export async function processImage(buffer: Buffer): Promise<ProcessedImage> {
  const originalSize = buffer.length;

  const image = sharp(buffer);
  const metadata = await image.metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;

  const resized = image
    .resize(MAX_DIMENSION, MAX_DIMENSION, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: JPEG_QUALITY });

  const outputBuffer = await resized.toBuffer();
  const outputMeta = await sharp(outputBuffer).metadata();

  return {
    base64: outputBuffer.toString('base64'),
    mimeType: 'image/jpeg',
    width: outputMeta.width || width,
    height: outputMeta.height || height,
    originalSize,
  };
}

/**
 * Download an image, process it, and optionally save to the group workspace.
 */
export async function downloadAndProcessImage(
  url: string,
  savePath?: string,
): Promise<ProcessedImage> {
  const buffer = await downloadImage(url);
  const processed = await processImage(buffer);

  if (savePath) {
    fs.mkdirSync(path.dirname(savePath), { recursive: true });
    fs.writeFileSync(savePath, Buffer.from(processed.base64, 'base64'));
    logger.debug(
      { savePath, size: processed.base64.length },
      'Image saved to workspace',
    );
  }

  logger.info(
    {
      originalSize: processed.originalSize,
      processedSize: processed.base64.length,
      dimensions: `${processed.width}x${processed.height}`,
    },
    'Processed image attachment',
  );

  return processed;
}
