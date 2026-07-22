import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;
let isFirebaseConfigured = false;

try {
  // Dynamically attempt importing firebase-applet-config.json or using env vars
  let firebaseConfig: any = null;

  try {
    // Vite import glob / standard dynamic import check
    const configModules = import.meta.glob('/firebase-applet-config.json', { eager: true });
    const configPath = Object.keys(configModules)[0];
    if (configPath && configModules[configPath]) {
      firebaseConfig = (configModules[configPath] as any).default || configModules[configPath];
    }
  } catch (e) {
    // Ignore dynamic glob import errors
  }

  // Fallback to VITE_ process env variables if available
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
    auth = getAuth(app);
    isFirebaseConfigured = true;
    console.log('[Firebase] Successfully initialized Firebase & Firestore');
  } else {
    console.warn('[Firebase] Config file or valid credentials not found. Operating in local / fallback mode.');
  }
} catch (error) {
  console.warn('[Firebase] Initialization skipped or error caught gracefully:', error);
}

export { app, db, auth, isFirebaseConfigured };
