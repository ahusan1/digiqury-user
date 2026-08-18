import { supabase } from './supabase';
import { toast } from 'react-hot-toast';
import { uploadBlobToR2 } from './r2Upload.ts';

const R2_PREVIEW_FOLDER = 'product-preview';
const SUPABASE_STORAGE_BUCKET = 'product-storage';

type SupabaseBlobUploadInput = {
  folder: string;
  blob: Blob;
  contentType: string;
  extension: string;
};

const sanitizeFolderPath = (value: string): string => {
  return String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');
};

const sanitizeFileExtension = (value: string): string => {
  const clean = String(value || '').trim().toLowerCase().replace(/^\./, '');
  return /^[a-z0-9]{2,8}$/.test(clean) ? clean : 'bin';
};

const createStoragePath = (folder: string, extension: string): string => {
  const safeFolder = sanitizeFolderPath(folder) || 'product-images';
  const safeExtension = sanitizeFileExtension(extension);
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${safeFolder}/${unique}.${safeExtension}`;
};

export const uploadBlobToSupabaseStorage = async ({
  folder,
  blob,
  contentType,
  extension,
}: SupabaseBlobUploadInput): Promise<string> => {
  const filePath = createStoragePath(folder, extension);

  const { error } = await supabase.storage
    .from(SUPABASE_STORAGE_BUCKET)
    .upload(filePath, blob, {
      contentType: String(contentType || '').trim() || 'application/octet-stream',
      cacheControl: '31536000',
      upsert: false,
    });

  if (error) {
    throw new Error(error.message || 'Failed to upload file to Supabase Storage.');
  }

  const { data } = supabase.storage
    .from(SUPABASE_STORAGE_BUCKET)
    .getPublicUrl(filePath);

  const publicUrl = String(data?.publicUrl || '').trim();
  if (!publicUrl) {
    throw new Error('Supabase Storage did not return a public URL.');
  }

  return publicUrl;
};

/**
 * Compress image using Canvas API (browser-native, no external dependency)
 * Adaptive compression with quality-first strategy to avoid blurry output.
 */
export const compressImage = async (
  file: File,
  maxWidth: number = 896,
  maxHeight: number = 896,
  quality: number = 0.82
): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const img = new Image();
      
      img.onload = async () => {
        // User-preferred balance window.
        const TARGET_MIN_BYTES = 20 * 1024;
        const TARGET_MAX_BYTES = 30 * 1024;
        const MIN_QUALITY = 0.28;
        const MAX_QUALITY = 0.95;

        const detectEncodeSupport = async (mimeType: 'image/avif' | 'image/webp' | 'image/jpeg'): Promise<boolean> => {
          try {
            const probe = document.createElement('canvas');
            probe.width = 2;
            probe.height = 2;
            const blob = await new Promise<Blob | null>((res) => {
              probe.toBlob((b) => res(b), mimeType, 0.8);
            });
            return !!blob && blob.type === mimeType;
          } catch {
            return false;
          }
        };

        const scaleAndDraw = (limitWidth: number, limitHeight: number): HTMLCanvasElement => {
          // Progressive downscale reduces blur compared to one-step shrinking.
          const sourceCanvas = document.createElement('canvas');
          const sourceCtx = sourceCanvas.getContext('2d');
          if (!sourceCtx) {
            throw new Error('Failed to get canvas context');
          }

          sourceCanvas.width = Math.max(1, Math.round(img.width));
          sourceCanvas.height = Math.max(1, Math.round(img.height));
          sourceCtx.imageSmoothingEnabled = true;
          sourceCtx.imageSmoothingQuality = 'high';
          sourceCtx.drawImage(img, 0, 0, sourceCanvas.width, sourceCanvas.height);

          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > limitWidth) {
              height = (height * limitWidth) / width;
              width = limitWidth;
            }
          } else {
            if (height > limitHeight) {
              width = (width * limitHeight) / height;
              height = limitHeight;
            }
          }

          const targetW = Math.max(1, Math.round(width));
          const targetH = Math.max(1, Math.round(height));

          let currentCanvas = sourceCanvas;
          let currentW = sourceCanvas.width;
          let currentH = sourceCanvas.height;

          // Reduce by half repeatedly until close to target.
          while (currentW * 0.5 > targetW && currentH * 0.5 > targetH) {
            const nextCanvas = document.createElement('canvas');
            nextCanvas.width = Math.max(targetW, Math.floor(currentW * 0.5));
            nextCanvas.height = Math.max(targetH, Math.floor(currentH * 0.5));
            const nextCtx = nextCanvas.getContext('2d');
            if (!nextCtx) {
              throw new Error('Failed to get canvas context');
            }
            nextCtx.imageSmoothingEnabled = true;
            nextCtx.imageSmoothingQuality = 'high';
            nextCtx.drawImage(currentCanvas, 0, 0, nextCanvas.width, nextCanvas.height);
            currentCanvas = nextCanvas;
            currentW = nextCanvas.width;
            currentH = nextCanvas.height;
          }

          const finalCanvas = document.createElement('canvas');
          finalCanvas.width = targetW;
          finalCanvas.height = targetH;
          const finalCtx = finalCanvas.getContext('2d');
          if (!finalCtx) {
            throw new Error('Failed to get canvas context');
          }
          finalCtx.imageSmoothingEnabled = true;
          finalCtx.imageSmoothingQuality = 'high';
          finalCtx.drawImage(currentCanvas, 0, 0, targetW, targetH);

          return finalCanvas;
        };

        const toEncodedBlob = (canvas: HTMLCanvasElement, mimeType: 'image/avif' | 'image/webp' | 'image/jpeg', q: number): Promise<Blob> => {
          return new Promise((res, rej) => {
            canvas.toBlob(
              (blob) => {
                if (blob) {
                  res(blob);
                } else {
                  rej(new Error('Failed to compress image'));
                }
              },
              mimeType,
              q
            );
          });
        };

        try {
          // Step down dimensions gradually to keep details while controlling final size.
          const dimensionPresets = [
            [1024, 1024],
            [maxWidth, maxHeight],
            [768, 768],
            [640, 640],
            [560, 560],
            [512, 512],
            [448, 448],
            [384, 384]
          ] as const;

          const avifSupported = await detectEncodeSupport('image/avif');
          const webpSupported = await detectEncodeSupport('image/webp');
          const mimePriority: Array<'image/avif' | 'image/webp' | 'image/jpeg'> = avifSupported
            ? ['image/avif', 'image/webp', 'image/jpeg']
            : webpSupported
              ? ['image/webp', 'image/jpeg']
              : ['image/jpeg'];

          type Candidate = {
            blob: Blob;
            width: number;
            height: number;
            quality: number;
          };

          let bestInRange: Candidate | null = null;
          let bestUnderMax: Candidate | null = null;
          let nearestAny: Candidate | null = null;
          const targetCenter = (TARGET_MIN_BYTES + TARGET_MAX_BYTES) / 2;

          const candidateScore = (c: Candidate) => (c.width * c.height) * c.quality;

          for (const mimeType of mimePriority) {
            let hitInRangeForMime = false;

            for (const [w, h] of dimensionPresets) {
              const canvas = scaleAndDraw(w, h);

              // Find the highest possible quality that still stays under max size.
              let lowQ = MIN_QUALITY;
              let highQ = MAX_QUALITY;
              let bestForPreset: Candidate | null = null;

              for (let i = 0; i < 12; i++) {
                const q = i === 0 ? Math.min(MAX_QUALITY, Math.max(MIN_QUALITY, quality)) : (lowQ + highQ) / 2;
                const blob = await toEncodedBlob(canvas, mimeType, q);

                // If browser silently encoded to another format (often PNG), skip this mime path.
                if (blob.type !== mimeType) {
                  break;
                }

                const size = blob.size;

                if (!nearestAny || Math.abs(size - targetCenter) < Math.abs(nearestAny.blob.size - targetCenter)) {
                  nearestAny = { blob, width: canvas.width, height: canvas.height, quality: q };
                }

                if (size <= TARGET_MAX_BYTES) {
                  bestForPreset = { blob, width: canvas.width, height: canvas.height, quality: q };
                  lowQ = q;
                } else {
                  highQ = q;
                }

                if (size > TARGET_MAX_BYTES) {
                  highQ = q;
                } else if (size < TARGET_MIN_BYTES) {
                  lowQ = q;
                } else {
                  bestForPreset = { blob, width: canvas.width, height: canvas.height, quality: q };
                  hitInRangeForMime = true;
                  break;
                }
              }

              if (bestForPreset) {
                const size = bestForPreset.blob.size;
                if (size >= TARGET_MIN_BYTES && size <= TARGET_MAX_BYTES) {
                  if (!bestInRange || candidateScore(bestForPreset) > candidateScore(bestInRange)) {
                    bestInRange = bestForPreset;
                  }
                }

                if (!bestUnderMax || candidateScore(bestForPreset) > candidateScore(bestUnderMax)) {
                  bestUnderMax = bestForPreset;
                }
              }

              if (hitInRangeForMime) {
                break;
              }
            }

            if (hitInRangeForMime) {
              break;
            }
          }

          const finalCandidate = bestInRange || bestUnderMax || nearestAny;

          if (!finalCandidate) {
            reject(new Error('Failed to compress image'));
            return;
          }

          resolve(finalCandidate.blob);
        } catch (err) {
          reject(err instanceof Error ? err : new Error('Failed to compress image'));
        }
      };

      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };

      img.src = e.target?.result as string;
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsDataURL(file);
  });
};

/**
 * Upload compressed image with hybrid routing:
 * - product-preview -> Cloudflare R2
 * - all other folders -> Supabase Storage
 */
export const uploadImageToSupabase = async (
  file: File,
  folder: string = 'product-images'
): Promise<string | null> => {
  try {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return null;
    }

    // Check file size (max 10MB before compression)
    const maxSizeBeforeCompression = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSizeBeforeCompression) {
      toast.error('File size too large (max 10MB)');
      return null;
    }

    // Show loading toast
    const loadingToast = toast.loading('Compressing & uploading image...');

    // Compress the image
    const compressedBlob = await compressImage(file);
    const isAvif = compressedBlob.type === 'image/avif';
    const isWebp = compressedBlob.type === 'image/webp';
    const isJpeg = compressedBlob.type === 'image/jpeg';
    const safeBlob = isAvif || isWebp || isJpeg ? compressedBlob : await new Promise<Blob>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Failed to convert image format'));
            return;
          }
          ctx.drawImage(img, 0, 0);
          canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Failed to convert image format'));
          }, 'image/jpeg', 0.82);
        };
        img.onerror = () => reject(new Error('Failed to parse compressed image'));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Failed to read compressed image'));
      reader.readAsDataURL(compressedBlob);
    });
    
    const extension = safeBlob.type === 'image/avif' ? 'avif' : safeBlob.type === 'image/webp' ? 'webp' : 'jpg';
    const contentType = safeBlob.type === 'image/avif' ? 'image/avif' : safeBlob.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
    const normalizedFolder = sanitizeFolderPath(folder) || 'product-images';
    const useR2 = false; // normalizedFolder === R2_PREVIEW_FOLDER;

    const publicUrl = useR2
      ? await uploadBlobToR2({
          folder: normalizedFolder,
          blob: safeBlob,
          contentType,
          extension,
        })
      : await uploadBlobToSupabaseStorage({
          folder: normalizedFolder,
          blob: safeBlob,
          contentType,
          extension,
        });

    const originalSizeKB = (file.size / 1024).toFixed(2);
    const compressedSizeKB = (safeBlob.size / 1024).toFixed(2);
    const reduction = (((file.size - safeBlob.size) / file.size) * 100).toFixed(1);

    toast.dismiss(loadingToast);
    toast.success(
      `Image uploaded! ${originalSizeKB}KB → ${compressedSizeKB}KB (${reduction}% smaller)`
    );

    return publicUrl;
  } catch (error: any) {
    console.error('Image upload error:', error);
    toast.error(error.message || 'Failed to upload image');
    return null;
  }
};

/**
 * Delete image from storage.
 *
 * For new R2 URLs this is a no-op because deletion is handled server-side.
 * For legacy Supabase URLs, old behavior is preserved.
 */
export const deleteImageFromSupabase = async (imageUrl: string): Promise<boolean> => {
  try {
    // Extract file path from public URL
    const urlParts = imageUrl.split('/product-storage/');
    if (urlParts.length !== 2) {
      return true;
    }

    const filePath = decodeURIComponent(urlParts[1]);

    const { error } = await supabase.storage
      .from('product-storage')
      .remove([filePath]);

    if (error) {
      console.warn('Failed to delete image:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.warn('Error deleting image:', error);
    return false;
  }
};

/**
 * Format file size for display
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};
