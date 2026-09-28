import { HttpStatus } from '@nestjs/common';
import sharp from 'sharp';
import { DomainError } from '../../core/errors.js';

/** Upload rules. The web page and the README quote these numbers. */
export const IMAGE_RULES = {
  /** Largest upload accepted, checked while the upload is read (413 beyond it). */
  maxBytes: 8 * 1024 * 1024,
  /** Largest picture decoded: refuses decompression bombs before they use memory. */
  maxPixels: 40_000_000,
  /** Images per submission; the first is the project's cover. */
  maxPerSubmission: 6,
  /** The stored image fits in this square, never enlarged. */
  fullSize: 1600,
  /** Gallery thumbnails, cropped to fill. */
  thumbWidth: 640,
  thumbHeight: 400,
} as const;

/** Decoded formats accepted, whatever the file is called. SVG and GIF are not among them. */
const ALLOWED = new Set(['jpeg', 'png', 'webp']);

// No libvips operation cache: every upload is different, and memory stays flat.
sharp.cache(false);

export interface ProcessedImage {
  full: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
}

const unsupported = (): DomainError =>
  new DomainError(HttpStatus.BAD_REQUEST, 'unsupported_image', 'Upload a JPEG, PNG or WebP image.');

/**
 * Turns an untrusted upload into images the portal made itself: decode (only JPEG, PNG or WebP,
 * checked from the bytes, never the file name), apply the camera's rotation, then encode fresh
 * WebP files. Nothing of the original survives but its pixels: no EXIF (camera, GPS), no ICC or
 * XMP, and no bytes hidden after the image. Runs offline: sharp's libvips is a prebuilt binary
 * installed with the image, and nothing is fetched.
 */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  const options = { limitInputPixels: IMAGE_RULES.maxPixels, failOn: 'error' } as const;
  let format: string | undefined;
  let pixels = 0;
  try {
    // Only the header is read here, so the pixel limit is checked below, by us, with a clear
    // answer; with the limit on, sharp would refuse a bomb as an unreadable file.
    const meta = await sharp(input, { ...options, limitInputPixels: false }).metadata();
    format = meta.format;
    pixels = (meta.width ?? 0) * (meta.height ?? 0);
  } catch {
    throw unsupported();
  }
  if (!format || !ALLOWED.has(format)) throw unsupported();
  if (pixels > IMAGE_RULES.maxPixels) {
    throw new DomainError(
      HttpStatus.PAYLOAD_TOO_LARGE,
      'payload_too_large',
      `The image is too large: at most ${IMAGE_RULES.maxPixels / 1_000_000} megapixels.`,
    );
  }

  try {
    const upright = sharp(input, options).rotate();
    const [full, thumb] = await Promise.all([
      upright
        .clone()
        .resize({
          width: IMAGE_RULES.fullSize,
          height: IMAGE_RULES.fullSize,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 82 })
        .toBuffer({ resolveWithObject: true }),
      upright
        .clone()
        .resize({ width: IMAGE_RULES.thumbWidth, height: IMAGE_RULES.thumbHeight, fit: 'cover' })
        .webp({ quality: 78 })
        .toBuffer(),
    ]);
    return { full: full.data, thumb, width: full.info.width, height: full.info.height };
  } catch {
    // A file whose header decodes but whose body is broken.
    throw unsupported();
  }
}
