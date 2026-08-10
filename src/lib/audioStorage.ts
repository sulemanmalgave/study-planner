// IndexedDB Storage helper for Audio Lecture files
// Storing audio files as Blobs in IndexedDB avoids browser localStorage size limits (QuotaExceededError)

const DB_NAME = 'StudyPlannerAudioDB';
const DB_VERSION = 1;
const STORE_NAME = 'audio_files';

function openAudioDB(): Promise<IDBDatabase> {
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

export async function saveAudioBlob(id: string, blob: Blob): Promise<void> {
  try {
    const db = await openAudioDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(blob, id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('Failed to store audio blob in IndexedDB:', err);
  }
}

export async function getAudioBlob(id: string): Promise<Blob | null> {
  try {
    const db = await openAudioDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  } catch (err) {
    console.warn('Failed to retrieve audio blob from IndexedDB:', err);
    return null;
  }
}

export async function deleteAudioBlob(id: string): Promise<void> {
  try {
    const db = await openAudioDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    });
  } catch (err) {
    console.warn('Failed to delete audio blob from IndexedDB:', err);
  }
}

export async function getAudioObjectUrl(id: string, fallbackDataUrl?: string): Promise<string | null> {
  const blob = await getAudioBlob(id);
  if (blob) {
    return URL.createObjectURL(blob);
  }
  if (fallbackDataUrl) {
    return fallbackDataUrl;
  }
  return null;
}
