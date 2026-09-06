import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { 
  getAuth, 
  Auth, 
  OAuthProvider,
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut as fbSignOut, 
  onAuthStateChanged, 
  signInWithCredential,
  User as FirebaseUser 
} from 'firebase/auth';

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;
let isFirebaseConfigured = false;
let oAuthClientId = '';

export interface AuthUserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

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
      firestoreDatabaseId: import.meta.env.VITE_FIREBASE_DATABASE_ID || '(default)',
      oAuthClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
    };
  }

  if (firebaseConfig && firebaseConfig.apiKey && firebaseConfig.apiKey !== 'YOUR_API_KEY') {
    app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
    const dbId = firebaseConfig.firestoreDatabaseId || '(default)';
    db = getFirestore(app, dbId);
    auth = getAuth(app);
    oAuthClientId = firebaseConfig.oAuthClientId || '';
    isFirebaseConfigured = true;
    console.log('[Firebase] Successfully initialized Firebase, Firestore & Auth');
  } else {
    console.warn('[Firebase] Config file or valid credentials not found. Operating in local / fallback mode.');
  }
} catch (error) {
  console.warn('[Firebase] Initialization skipped or error caught gracefully:', error);
}

// Track active in-flight popup promise to prevent concurrent popup requests (which causes auth/cancelled-popup-request)
let inFlightPopupPromise: Promise<AuthUserProfile> | null = null;

/**
 * Sign in with Microsoft using Firebase Auth OAuthProvider('microsoft.com')
 * Official OAuth flow supporting personal Microsoft accounts (Hotmail, Outlook, Live)
 * and Work / School (Microsoft 365 / Entra ID) accounts.
 */
export async function signInWithMicrosoft(): Promise<AuthUserProfile> {
  if (!auth) {
    throw new Error('Firebase Authentication is not configured.');
  }

  // If a popup request is already in progress, reuse the existing promise to prevent duplicate popups
  if (inFlightPopupPromise) {
    console.log('[Microsoft Auth] Sign-in popup already in progress, reusing existing request');
    return inFlightPopupPromise;
  }

  const runSignIn = async (): Promise<AuthUserProfile> => {
    try {
      console.log('[Microsoft Auth] Initiating official Microsoft OAuth popup flow');
      const provider = new OAuthProvider('microsoft.com');

      // Tenant 'common' allows both personal Microsoft accounts and work/school accounts
      provider.setCustomParameters({
        prompt: 'select_account',
        tenant: 'common',
      });

      // Standard OpenID & profile scopes for user profile and identity
      provider.addScope('openid');
      provider.addScope('profile');
      provider.addScope('email');
      provider.addScope('User.Read');

      const result = await signInWithPopup(auth!, provider);
      const user = result.user;

      console.log('[Microsoft Auth] Sign-in successful for user:', {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
      });

      return {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || user.email?.split('@')[0] || 'Microsoft User',
        photoURL: user.photoURL,
      };
    } catch (err: any) {
      console.warn('[Microsoft Auth] Popup sign-in error:', err);
      const code = err?.code || '';
      const msg = err?.message || '';

      if (code === 'auth/cancelled-popup-request' || msg.includes('cancelled-popup-request')) {
        throw new Error('Microsoft sign-in was cancelled or interrupted. Please click "Sign in with Microsoft" when ready.');
      }
      if (code === 'auth/popup-closed-by-user' || msg.includes('popup-closed-by-user')) {
        throw new Error('The Microsoft sign-in window was closed before completing login. Click "Sign in with Microsoft" to continue.');
      }
      if (code === 'auth/popup-blocked' || msg.includes('popup-blocked')) {
        throw new Error('The sign-in popup was blocked by your browser. Please allow popups for this site and try again.');
      }
      if (code === 'auth/unauthorized-domain' || msg.includes('unauthorized-domain')) {
        const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'this domain';
        throw new Error(`Domain not authorized for Firebase Microsoft Sign-In (${currentOrigin}). Please ensure ${window?.location?.hostname || currentOrigin} is added to Firebase Authentication Authorized Domains.`);
      }
      if (code === 'auth/account-exists-with-different-credential') {
        throw new Error('An account already exists with this email address. Please sign in with your original method or link your accounts.');
      }
      if (code === 'auth/operation-not-allowed') {
        throw new Error('Microsoft sign-in is not enabled yet in your Firebase Authentication console. Please enable the Microsoft provider under Authentication > Sign-in method.');
      }
      if (code === 'auth/network-request-failed') {
        throw new Error('Network connection error during Microsoft authentication. Please check your connection and try again.');
      }

      throw new Error(msg || 'Failed to sign in with Microsoft.');
    } finally {
      inFlightPopupPromise = null;
    }
  };

  inFlightPopupPromise = runSignIn();
  return inFlightPopupPromise;
}

/**
 * Sign in with Google using Firebase Auth popup or Google Identity Services credential
 */
export async function signInWithGoogle(): Promise<AuthUserProfile> {
  if (!auth) {
    throw new Error('Firebase Authentication is not configured.');
  }

  // If a popup request is already in progress, reuse the existing promise to prevent duplicate popups
  if (inFlightPopupPromise) {
    console.log('[Google Auth] Sign-in popup already in progress, reusing existing request');
    return inFlightPopupPromise;
  }

  const runSignIn = async (): Promise<AuthUserProfile> => {
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('email');
      provider.addScope('profile');
      provider.setCustomParameters({ prompt: 'select_account' });

      const result = await signInWithPopup(auth!, provider);
      const user = result.user;

      return {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
      };
    } catch (err: any) {
      console.warn('[Google Auth] Popup sign-in error:', err);
      if (err?.code === 'auth/cancelled-popup-request' || err?.message?.includes('cancelled-popup-request')) {
        throw new Error('Sign-in prompt was cancelled or closed. Please click "Sign in with Google" when you are ready.');
      }
      if (err?.code === 'auth/popup-closed-by-user' || err?.message?.includes('popup-closed-by-user')) {
        throw new Error('Sign-in prompt was closed. Please click "Sign in with Google" when you are ready.');
      }
      if (err?.code === 'auth/popup-blocked' || err?.message?.includes('popup-blocked')) {
        throw new Error('The sign-in popup was blocked by your browser. Please allow popups or click the sign-in button again.');
      }
      if (err?.code === 'auth/unauthorized-domain' || err?.message?.includes('unauthorized-domain')) {
        const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'this domain';
        throw new Error(`Domain not authorized for Firebase Google Sign-In (${currentOrigin}). Please ensure ${currentOrigin} is added to Firebase Authentication Authorized Domains.`);
      }
      throw new Error(err?.message || 'Failed to sign in with Google.');
    } finally {
      inFlightPopupPromise = null;
    }
  };

  inFlightPopupPromise = runSignIn();
  return inFlightPopupPromise;
}

/**
 * Sign in with a Google ID Token (e.g., from Google Identity Services button)
 */
export async function signInWithGoogleIdToken(idToken: string): Promise<AuthUserProfile> {
  if (!auth) {
    throw new Error('Firebase Authentication is not configured.');
  }

  const credential = GoogleAuthProvider.credential(idToken);
  const result = await signInWithCredential(auth, credential);
  const user = result.user;

  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
  };
}

/**
 * Sign out current user
 */
export async function signOutUser(): Promise<void> {
  if (auth) {
    await fbSignOut(auth);
  }
}

/**
 * Subscribe to Firebase Auth state changes
 */
export function onAuthUserChange(callback: (user: AuthUserProfile | null) => void): () => void {
  if (!auth) {
    callback(null);
    return () => {};
  }

  return onAuthStateChanged(auth, (user: FirebaseUser | null) => {
    if (user) {
      callback({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
      });
    } else {
      callback(null);
    }
  });
}

export { app, db, auth, isFirebaseConfigured, oAuthClientId };
