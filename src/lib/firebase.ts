import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import type { AuthUserProfile } from './emailAuth';

export type { AuthUserProfile };

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let isFirebaseConfigured = false;

try {
  let firebaseConfig: any = null;

  try {
    const configModules = import.meta.glob('/firebase-applet-config.json', { eager: true });
    const configPath = Object.keys(configModules)[0];
    if (configPath && configModules[configPath]) {
      firebaseConfig = (configModules[configPath] as any).default || configModules[configPath];
    }
  } catch (e) {
    // Ignore dynamic glob import errors
  }

  if (!firebaseConfig && typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_API_KEY) {
    firebaseConfig = {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
      firestoreDatabaseId: import.meta.env.VITE_FIREBASE_DATABASE_ID || '(default)'
    };
  }

  if (firebaseConfig && firebaseConfig.apiKey && firebaseConfig.apiKey !== 'YOUR_API_KEY') {
    app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
    const dbId = firebaseConfig.firestoreDatabaseId || '(default)';
    db = getFirestore(app, dbId);
    isFirebaseConfigured = true;
    console.log('[Firebase] Successfully initialized Firestore database');
  } else {
    console.warn('[Firebase] Config file or valid credentials not found. Operating in local / fallback mode.');
  }
} catch (error) {
  console.warn('[Firebase] Initialization skipped or error caught gracefully:', error);
}

export { 
  app, 
  db, 
  isFirebaseConfigured 
};

