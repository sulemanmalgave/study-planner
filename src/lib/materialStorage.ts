// IndexedDB Storage helper for Study Material files (Images, PDFs, Documents)
// Storing uploaded files as Blobs in IndexedDB ensures offline persistence, fast loading,
// and seamless access across page refreshes and PWA restarts without localStorage quota limits.

const DB_NAME = 'StudyPlannerMaterialsDB';
const DB_VERSION = 1;
const STORE_NAME = 'material_blobs';

function openMaterialsDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not supported in this environment'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save a study material file Blob into IndexedDB by material ID.
 */
export async function saveMaterialBlob(id: string, blob: Blob): Promise<void> {
  if (!id || !blob) return;
  try {
    const db = await openMaterialsDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(blob, id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('[MaterialStorage] Failed to store material blob in IndexedDB:', err);
  }
}

/**
 * Retrieve a study material file Blob from IndexedDB by material ID.
 */
export async function getMaterialBlob(id: string): Promise<Blob | null> {
  if (!id) return null;
  try {
    const db = await openMaterialsDB();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  } catch (err) {
    console.warn('[MaterialStorage] Failed to retrieve material blob from IndexedDB:', err);
    return null;
  }
}

/**
 * Delete a study material file Blob from IndexedDB by material ID.
 */
export async function deleteMaterialBlob(id: string): Promise<void> {
  if (!id) return;
  try {
    const db = await openMaterialsDB();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    });
  } catch (err) {
    console.warn('[MaterialStorage] Failed to delete material blob from IndexedDB:', err);
  }
}

/**
 * Convert a base64 Data URL to a native Blob object.
 */
export function dataUrlToBlob(dataUrl: string): Blob | null {
  if (!dataUrl || !dataUrl.startsWith('data:')) return null;
  try {
    const arr = dataUrl.split(',');
    const mimeMatch = arr[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  } catch (e) {
    console.warn('[MaterialStorage] Could not parse dataUrl to Blob:', e);
    return null;
  }
}

// Track active Object URLs to safely revoke them and prevent memory leaks
const activeObjectUrls = new Set<string>();

/**
 * Creates a tracked Object URL from a Blob.
 */
export function createTrackedObjectUrl(blob: Blob): string {
  const url = URL.createObjectURL(blob);
  activeObjectUrls.add(url);
  return url;
}

/**
 * Safely revokes a tracked Object URL.
 */
export function revokeTrackedObjectUrl(url: string | null | undefined): void {
  if (!url) return;
  if (url.startsWith('blob:') && activeObjectUrls.has(url)) {
    try {
      URL.revokeObjectURL(url);
      activeObjectUrls.delete(url);
    } catch (e) {
      // Ignore
    }
  }
}

/**
 * Determine the clean normalized file extension/type from MIME type, extension, or data URL.
 */
export function getMaterialFileType(material: {
  fileType?: string;
  mimeType?: string;
  originalFileName?: string;
  fileName?: string;
  name?: string;
  storagePath?: string;
  fileDataUrl?: string;
} | null | undefined): string {
  if (!material) return '';

  const mime = (material.mimeType || '').toLowerCase();
  if (mime.includes('png')) return 'png';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('svg')) return 'svg';
  if (mime.includes('bmp')) return 'bmp';
  if (mime.includes('pdf')) return 'pdf';
  if (mime.includes('wordprocessingml') || mime.includes('docx')) return 'docx';
  if (mime.includes('msword')) return 'doc';
  if (mime.includes('text/plain')) return 'txt';
  if (mime.includes('text/csv') || mime.includes('csv')) return 'csv';

  // Check fileType property
  const type = (material.fileType || '').toLowerCase().replace('.', '').trim();
  if (type) return type;

  // Check file name extension
  const candidate = material.originalFileName || material.fileName || material.name || material.storagePath || '';
  const match = candidate.match(/\.([a-zA-Z0-9]+)(?:\?|#|$)/);
  if (match) {
    return match[1].toLowerCase();
  }

  // Check data URL mime
  if (material.fileDataUrl && material.fileDataUrl.startsWith('data:')) {
    const dataMime = material.fileDataUrl.split(';')[0].replace('data:', '').toLowerCase();
    if (dataMime.includes('png')) return 'png';
    if (dataMime.includes('jpeg') || dataMime.includes('jpg')) return 'jpg';
    if (dataMime.includes('webp')) return 'webp';
    if (dataMime.includes('pdf')) return 'pdf';
  }

  return 'doc';
}

/**
 * Checks whether a study material is an image format (.jpg, .jpeg, .png, .webp, .gif, .svg).
 */
export function isImageMaterial(material: {
  fileType?: string;
  mimeType?: string;
  originalFileName?: string;
  fileName?: string;
  name?: string;
  storagePath?: string;
  fileDataUrl?: string;
} | null | undefined): boolean {
  if (!material) return false;
  const mime = (material.mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  const ext = getMaterialFileType(material);
  return ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'bmp'].includes(ext);
}
