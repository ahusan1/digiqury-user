import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const STORAGE_KEY = 'dm_downloaded_assets_v1';

export type DownloadedAsset = {
  id: string;
  userId: string;
  productId: string;
  title: string;
  previewImage?: string;
  fileName: string;
  sourceUrl: string;
  localPath?: string;
  localUri?: string;
  localDirectory?: string;
  downloadedAt: string;
};

const safeParse = (raw: string | null): DownloadedAsset[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const getAllRecords = (): DownloadedAsset[] => {
  return safeParse(localStorage.getItem(STORAGE_KEY));
};

const setAllRecords = (records: DownloadedAsset[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
};

const sanitizeName = (name: string) => {
  return name
    .replace(/[^a-zA-Z0-9._ -]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
};

const MIME_EXTENSION_MAP: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'application/x-zip-compressed': 'zip',
  'application/x-rar-compressed': 'rar',
  'application/vnd.rar': 'rar',
  'application/x-7z-compressed': '7z',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'text/plain': 'txt',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'video/mp4': 'mp4',
  'audio/mpeg': 'mp3',
};

const INVALID_EXTENSIONS = new Set([
  'bin',
  'image',
  'images',
  'download',
  'file',
  'open',
  'view',
  'uc',
]);

const isValidExtension = (value: string): boolean => {
  const normalized = String(value || '').trim().toLowerCase();
  return /^[a-z0-9]{2,6}$/.test(normalized) && !INVALID_EXTENSIONS.has(normalized);
};

const extensionFromUrl = (url: string): string => {
  try {
    const pathname = new URL(url).pathname;
    const candidate = pathname.split('.').pop()?.toLowerCase() || '';
    if (isValidExtension(candidate)) return candidate;
  } catch {
    // ignore
  }

  const fallbackCandidate = String(url || '').split('?')[0].split('#')[0].split('.').pop()?.toLowerCase() || '';
  if (isValidExtension(fallbackCandidate)) return fallbackCandidate;
  return '';
};

const safeDecode = (value: string): string => {
  let output = String(value || '');
  for (let i = 0; i < 2; i += 1) {
    try {
      const decoded = decodeURIComponent(output);
      if (decoded === output) break;
      output = decoded;
    } catch {
      break;
    }
  }
  return output;
};

const parseFilenameFromDisposition = (disposition: string): string => {
  const raw = String(disposition || '').trim();
  if (!raw) return '';

  const utf8 = raw.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (utf8) return safeDecode(utf8.replace(/"/g, ''));

  const plain = raw.match(/filename=([^;]+)/i)?.[1];
  if (!plain) return '';
  return safeDecode(plain.trim().replace(/^"|"$/g, ''));
};

const stripKnownExtension = (value: string): string => {
  const normalized = String(value || '').trim();
  return normalized.replace(/\.[a-z0-9]{2,6}$/i, '');
};

const inferExtensionFromMime = (mimeType: string): string => {
  const normalized = String(mimeType || '').split(';')[0].trim().toLowerCase();
  return MIME_EXTENSION_MAP[normalized] || '';
};

const resolveRemoteDownloadMeta = async (url: string): Promise<{ fileName: string; extension: string }> => {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    if (!response.ok) return { fileName: '', extension: '' };

    const dispositionName = parseFilenameFromDisposition(response.headers.get('content-disposition') || '');
    const contentType = response.headers.get('content-type') || '';

    const extensionFromName = extensionFromUrl(dispositionName);
    const extensionFromType = inferExtensionFromMime(contentType);
    const extension = extensionFromName || extensionFromType;

    return {
      fileName: dispositionName,
      extension,
    };
  } catch {
    return { fileName: '', extension: '' };
  }
};

const inferExtension = (sourceUrl: string, sourcePath = '', mimeType = '') => {
  // First try to extract filename from /api/download?name=... query parameter
  try {
    const url = new URL(sourceUrl, window.location.origin);
    const extParam = safeDecode(url.searchParams.get('ext') || '').toLowerCase();
    if (isValidExtension(extParam)) {
      return extParam;
    }

    const nameParam = url.searchParams.get('name');
    if (nameParam) {
      const fromName = extensionFromUrl(safeDecode(nameParam));
      if (fromName) return fromName;
    }
  } catch {
    // ignore URL parsing errors
  }

  const fromSourcePath = extensionFromUrl(sourcePath);
  if (fromSourcePath) return fromSourcePath;

  const fromSourceUrl = extensionFromUrl(sourceUrl);
  if (fromSourceUrl) return fromSourceUrl;

  const normalizedMime = String(mimeType || '').split(';')[0].trim().toLowerCase();
  if (normalizedMime && MIME_EXTENSION_MAP[normalizedMime]) {
    return MIME_EXTENSION_MAP[normalizedMime];
  }

  return 'bin';
};

const toBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

const persistDownloadedAsset = (asset: DownloadedAsset) => {
  const records = getAllRecords();
  const withoutOld = records.filter((item) => !(item.userId === asset.userId && item.productId === asset.productId));
  setAllRecords([asset, ...withoutOld].slice(0, 200));
};

const triggerWebDownload = (url: string, filename: string) => {
  if (url.includes('drive.google.com')) {
    if (Capacitor.isNativePlatform()) {
      import('@capacitor/browser').then(({ Browser }) => {
        Browser.open({ url }).catch(console.error);
      });
    } else {
      window.location.assign(url);
    }
    return;
  }

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

export const downloadAssetToDevice = async (input: {
  userId: string;
  productId: string;
  title: string;
  sourceUrl: string;
  sourcePath?: string;
  previewImage?: string;
}): Promise<DownloadedAsset> => {
  let extension = inferExtension(input.sourceUrl, input.sourcePath || '');
  let stem = sanitizeName(input.title) || 'asset';

  if (!isValidExtension(extension)) {
    const remoteMeta = await resolveRemoteDownloadMeta(input.sourceUrl);
    if (isValidExtension(remoteMeta.extension)) {
      extension = remoteMeta.extension;
    }
    if (remoteMeta.fileName) {
      const headerStem = sanitizeName(stripKnownExtension(remoteMeta.fileName));
      if (headerStem) {
        stem = headerStem;
      }
    }
  }

  if (!isValidExtension(extension)) {
    extension = 'bin';
  }

  const fileName = `${stem}.${extension}`;
  const timestamp = Date.now();

  const baseRecord: DownloadedAsset = {
    id: `${input.productId}-${timestamp}`,
    userId: input.userId,
    productId: input.productId,
    title: input.title,
    previewImage: input.previewImage,
    fileName,
    sourceUrl: input.sourceUrl,
    downloadedAt: new Date(timestamp).toISOString(),
  };

  const isGoogleDrive = input.sourceUrl.includes('drive.google.com');

  if (!Capacitor.isNativePlatform() || isGoogleDrive) {
    triggerWebDownload(input.sourceUrl, fileName);
    persistDownloadedAsset(baseRecord);
    return baseRecord;
  }

  const localPath = `DIGi QuRYDownloads/${timestamp}-${fileName}`;

  const filesystemAny = Filesystem as unknown as {
    downloadFile?: (options: {
      path: string;
      directory: Directory;
      url: string;
      recursive?: boolean;
    }) => Promise<unknown>;
    checkPermissions?: () => Promise<{ publicStorage?: 'granted' | 'denied' | 'prompt' }>;
    requestPermissions?: () => Promise<{ publicStorage?: 'granted' | 'denied' | 'prompt' }>;
  };

  const ensureStoragePermission = async () => {
    if (Capacitor.getPlatform() !== 'android') return;
    if (typeof filesystemAny.checkPermissions !== 'function') return;

    const status = await filesystemAny.checkPermissions();
    if (status?.publicStorage === 'granted') return;

    if (typeof filesystemAny.requestPermissions === 'function') {
      const requested = await filesystemAny.requestPermissions();
      if (requested?.publicStorage === 'granted') return;
    }
  };

  const candidateDirectories: Directory[] = [
    Directory.Documents,
    Directory.External,
    Directory.Data,
    Directory.Cache,
  ];

  const saveToDirectory = async (directory: Directory) => {
    if (typeof filesystemAny.downloadFile === 'function') {
      try {
        await filesystemAny.downloadFile({
          path: localPath,
          directory,
          url: input.sourceUrl,
          recursive: true,
        });
        return;
      } catch {
        // Fall through to fetch+write fallback for devices where downloadFile is unstable.
      }
    }

    const response = await fetch(input.sourceUrl);
    if (!response.ok) {
      throw new Error(`Download failed with status ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64Data = toBase64(arrayBuffer);

    await Filesystem.writeFile({
      path: localPath,
      data: base64Data,
      directory,
      recursive: true,
    });
  };

  await ensureStoragePermission();

  let savedDirectory: Directory | null = null;
  let lastError: unknown = null;

  for (const directory of candidateDirectories) {
    try {
      await saveToDirectory(directory);
      savedDirectory = directory;
      break;
    } catch (err) {
      lastError = err;
    }
  }

  if (!savedDirectory) {
    throw new Error(
      `Unable to save file to device storage${lastError ? `: ${String((lastError as Error)?.message || lastError)}` : ''}`
    );
  }

  let resolvedUri = '';
  try {
    const uriResult = await Filesystem.getUri({
      directory: savedDirectory,
      path: localPath,
    });
    resolvedUri = uriResult.uri;
  } catch {
    resolvedUri = '';
  }

  const asset: DownloadedAsset = {
    ...baseRecord,
    localPath,
    localDirectory: savedDirectory,
    localUri: resolvedUri || undefined,
  };

  persistDownloadedAsset(asset);
  return asset;
};

export const listDownloadedAssets = (userId: string): DownloadedAsset[] => {
  return getAllRecords().filter((item) => item.userId === userId);
};

export const removeDownloadedAsset = (assetId: string) => {
  const records = getAllRecords();
  const target = records.find((item) => item.id === assetId);
  setAllRecords(records.filter((item) => item.id !== assetId));

  if (target?.localPath && Capacitor.isNativePlatform()) {
    void Filesystem.deleteFile({
      directory: (target.localDirectory as Directory) || Directory.Documents,
      path: target.localPath,
    }).catch(() => undefined);
  }
};

export const openDownloadedAsset = async (asset: DownloadedAsset) => {
  const target = asset.localUri || asset.sourceUrl;
  window.open(target, '_blank');
};

export const shareDownloadedAsset = async (asset: DownloadedAsset) => {
  const url = asset.localUri || asset.sourceUrl;

  if (Capacitor.isNativePlatform()) {
    await Share.share({
      title: asset.title,
      text: `Check out: ${asset.title}`,
      url,
      dialogTitle: 'Share Asset',
    });
  } else {
    const subject = encodeURIComponent(`Check out: ${asset.title}`);
    const body = encodeURIComponent(`I found this: ${url}`);
    window.open(`mailto:?subject=${subject}&body=${body}`);
  }
};
