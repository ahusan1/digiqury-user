import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase.ts';

type SignedUploadPayload = {
  uploadUrl?: string;
  publicUrl?: string;
  error?: {
    code?: string;
    message?: string;
  };
};

type UploadBlobInput = {
  folder: string;
  blob: Blob;
  contentType: string;
  extension?: string;
};

const MIME_TO_EXTENSION: Record<string, string> = {
  'image/avif': 'avif',
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'application/x-zip-compressed': 'zip',
  'application/x-rar-compressed': 'rar',
  'application/vnd.rar': 'rar',
  'application/x-7z-compressed': '7z',
  'application/octet-stream': 'bin',
};

const resolveApiUrl = (path: string): string => {
  const explicitBase = String(import.meta.env.VITE_API_BASE_URL || '').trim();
  const isLocalWeb =
    typeof window !== 'undefined' &&
    /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);

  if (!Capacitor.isNativePlatform() && !isLocalWeb && !explicitBase) {
    return path;
  }

  const base = String(
    explicitBase ||
      'https://user-mu-two.vercel.app'
  ).replace(/\/+$/, '');

  return `${base}${path}`;
};

const parseJsonSafely = async <T>(response: Response): Promise<T | null> => {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
};

const sanitizeFolder = (value: string): string => {
  return String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');
};

const sanitizeExtension = (value: string): string => {
  const clean = String(value || '').trim().toLowerCase().replace(/^\./, '');
  return /^[a-z0-9]{2,8}$/.test(clean) ? clean : '';
};

const inferExtensionFromName = (fileName: string): string => {
  const fromName = String(fileName || '').trim().split('?')[0].split('#')[0].split('.').pop() || '';
  return sanitizeExtension(fromName);
};

const inferExtensionFromContentType = (contentType: string): string => {
  const cleanType = String(contentType || '').trim().toLowerCase().split(';')[0];
  return sanitizeExtension(MIME_TO_EXTENSION[cleanType] || '');
};

const getAuthToken = async (): Promise<string> => {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  } catch {
    return '';
  }
};

export const uploadBlobToR2 = async ({
  folder,
  blob,
  contentType,
  extension,
}: UploadBlobInput): Promise<string> => {
  const safeFolder = sanitizeFolder(folder);
  if (!safeFolder) {
    throw new Error('Upload folder is required.');
  }

  if (safeFolder !== 'product-preview') {
    throw new Error('Only product preview images are uploaded to Cloudflare R2.');
  }

  const normalizedContentType = String(contentType || '').trim().toLowerCase().split(';')[0] || 'application/octet-stream';
  const safeExtension = sanitizeExtension(extension || '') || inferExtensionFromContentType(normalizedContentType) || 'bin';

  const token = await getAuthToken();

  const signResponse = await fetch(resolveApiUrl('/api/storage/sign-upload'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      folder: safeFolder,
      extension: safeExtension,
      contentType: normalizedContentType,
    }),
  });

  const signPayload = await parseJsonSafely<SignedUploadPayload>(signResponse);
  if (!signResponse.ok) {
    const fallbackMessage = signResponse.status === 404
      ? 'Upload API not found. Set VITE_API_BASE_URL for local dev or deploy API routes.'
      : `Unable to prepare upload URL (HTTP ${signResponse.status}).`;
    const errorMessage = signPayload?.error?.message || fallbackMessage;
    throw new Error(errorMessage);
  }

  const uploadUrl = String(signPayload?.uploadUrl || '').trim();
  const publicUrl = String(signPayload?.publicUrl || '').trim();

  if (!uploadUrl || !publicUrl) {
    throw new Error('Upload service did not return required URLs.');
  }

  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': normalizedContentType,
    },
    body: blob,
  });

  if (!uploadResponse.ok) {
    const uploadText = (await uploadResponse.text().catch(() => '')).slice(0, 180);
    const suffix = uploadText ? ` ${uploadText}` : '';
    throw new Error(`Upload failed (HTTP ${uploadResponse.status}).${suffix}`);
  }

  return publicUrl;
};

export const uploadFileToR2 = async (
  file: File,
  folder: string,
  fallbackExtension = 'bin',
): Promise<string> => {
  const extension = inferExtensionFromName(file.name) || sanitizeExtension(fallbackExtension) || 'bin';
  const contentType = String(file.type || '').trim().toLowerCase() || 'application/octet-stream';

  return uploadBlobToR2({
    folder,
    blob: file,
    contentType,
    extension,
  });
};
