import sharp from 'sharp';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const IMAGE_SIZES = [240, 480, 720, 1200] as const;
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set(['jpeg', 'png', 'webp', 'avif', 'heif']);

export class ImageError extends Error {
  constructor(public code: string, msg: string) { super(msg); }
}

/**
 * Yüklənmiş şəkli yoxlayır (məzmuna görə, ada görə yox), EXIF-i silir,
 * 240/480/720/1200 webp variantlarını yaradır. Qaytarır: şəkil id-si.
 */
export async function processImage(buf: Buffer, uploadsDir: string): Promise<{ id: string; width: number; height: number }> {
  if (!buf.length) throw new ImageError('empty', 'Fayl boşdur');
  if (buf.length > MAX_UPLOAD_BYTES) throw new ImageError('too_large', 'Fayl çox böyükdür');
  let meta: { format?: string; width?: number; height?: number };
  try {
    meta = await sharp(buf, { limitInputPixels: 50_000_000 }).metadata();
  } catch {
    throw new ImageError('bad_type', 'Şəkil faylı deyil');
  }
  if (!meta.format || !ALLOWED.has(meta.format)) throw new ImageError('bad_type', 'Yalnız JPG, PNG, WEBP, AVIF, HEIC');
  if (!meta.width || !meta.height || meta.width < 200 || meta.height < 200) throw new ImageError('too_small', 'Şəkil ən azı 200×200 olmalıdır');
  fs.mkdirSync(uploadsDir, { recursive: true });
  const id = crypto.randomBytes(8).toString('hex');
  let out = { width: 0, height: 0 };
  for (const w of IMAGE_SIZES) {
    const info = await sharp(buf, { limitInputPixels: 50_000_000 })
      .rotate() // EXIF oriyentasiyasını tətbiq edir, sonra metadata atılır
      .resize({ width: w, height: Math.round(w * 1.25), fit: 'inside', withoutEnlargement: true })
      .webp({ quality: w <= 480 ? 70 : 74, effort: 5 })
      .toFile(path.join(uploadsDir, `${id}-${w}.webp`));
    out = { width: info.width, height: info.height };
  }
  return { id, ...out };
}

export function removeImage(uploadsDir: string, id: string | null) {
  if (!id || !/^[a-z0-9]{6,40}$/.test(id)) return;
  for (const w of IMAGE_SIZES) fs.rmSync(path.join(uploadsDir, `${id}-${w}.webp`), { force: true });
}
