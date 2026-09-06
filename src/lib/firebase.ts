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
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  updateProfile,
  ActionCodeSettings,
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

/**
 * Send passwordless Firebase Email Sign-In Link
 */
export async function sendFirebaseEmailSignInLink(email: string, name?: string): Promise<void> {
  if (!auth) {
    throw new Error('Firebase Authentication is not initialized.');
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanName = (name || '').trim();

  // Determine current origin. If window is undefined, fallback to production domain.
  const isVercel = typeof window !== 'undefined' && (
    window.location.hostname === 'study-planner-tool.vercel.app' || 
    window.location.hostname.endsWith('.vercel.app')
  );

  const primaryDomain = isVercel 
    ? 'https://study-planner-tool.vercel.app' 
    : (typeof window !== 'undefined' && window.location.origin ? window.location.origin : 'https://study-planner-tool.vercel.app');

  // Return URL with emailSignIn query param
  const returnUrl = new URL(primaryDomain);
  returnUrl.searchParams.set('emailSignIn', 'true');

  const actionCodeSettings: ActionCodeSettings = {
    url: returnUrl.toString(),
    handleCodeInApp: true,
  };

  // Safely store email and name locally for completing sign-in on same browser
  if (typeof window !== 'undefined') {
    window.localStorage.setItem('emailForSignIn', cleanEmail);
    if (cleanName) {
      window.localStorage.setItem('nameForSignIn', cleanName);
    }
  }

  try {
    console.log(`[Firebase Auth] Sending real Firebase sign-in link to: ${cleanEmail} (Redirect: ${actionCodeSettings.url})`);
    await sendSignInLinkToEmail(auth, cleanEmail, actionCodeSettings);
    console.log(`[Firebase Auth] Successfully requested Firebase to deliver sign-in link to ${cleanEmail}`);
  } catch (err: any) {
    const code = err?.code || '';
    const msg = err?.message || '';

    // If current origin was rejected by Firebase authorized domains, retry with production domain
    if (
      (code === 'auth/unauthorized-continue-uri' || msg.includes('unauthorized-continue-uri') || code === 'auth/unauthorized-domain') &&
      actionCodeSettings.url !== 'https://study-planner-tool.vercel.app/?emailSignIn=true'
    ) {
      console.log('[Firebase Auth] Current origin not authorized. Retrying with production domain: https://study-planner-tool.vercel.app/?emailSignIn=true');
      try {
        const prodSettings: ActionCodeSettings = {
          url: 'https://study-planner-tool.vercel.app/?emailSignIn=true',
          handleCodeInApp: true,
        };
        await sendSignInLinkToEmail(auth, cleanEmail, prodSettings);
        console.log(`[Firebase Auth] Successfully sent sign-in link using production domain to ${cleanEmail}`);
        return;
      } catch (retryErr: any) {
        console.warn('[Firebase Auth] Retry with production domain failed:', retryErr);
      }
    }

    if (code === 'auth/operation-not-allowed' || msg.includes('operation-not-allowed')) {
      console.warn('[Firebase Auth] Firebase Passwordless Email Link provider is not enabled in Firebase Console.');
      const opError = new Error(
        'Email link (passwordless) sign-in is not enabled in Firebase Console. Please go to Firebase Console > Authentication > Sign-in method > Email/Password, and enable "Email link (passwordless sign-in)".'
      );
      (opError as any).code = 'auth/operation-not-allowed';
      throw opError;
    }

    console.warn('[Firebase Auth] Error sending email sign-in link:', err);

    if (code === 'auth/unauthorized-continue-uri' || msg.includes('unauthorized-continue-uri') || code === 'auth/unauthorized-domain') {
      const host = new URL(actionCodeSettings.url).hostname;
      throw new Error(
        `Domain ${host} is not in Firebase authorized domains. Please ensure ${host} (and study-planner-tool.vercel.app) are added to Firebase Console > Authentication > Settings > Authorized domains.`
      );
    }
    if (code === 'auth/invalid-email') {
      throw new Error('Please enter a valid email address.');
    }
    if (code === 'auth/missing-continue-uri') {
      throw new Error('A redirect URL is required for email link authentication.');
    }
    throw new Error(msg || 'Failed to send Firebase verification email. Please try again.');
  }
}

/**
 * Check if the current URL contains a Firebase Email Sign-In link
 */
export function isFirebaseEmailSignInLink(): boolean {
  if (!auth || typeof window === 'undefined') return false;
  return isSignInWithEmailLink(auth, window.location.href);
}

/**
 * Complete Firebase Email Link sign-in
 */
export async function completeFirebaseEmailSignIn(emailOverride?: string): Promise<{
  user: AuthUserProfile;
  isNewUser: boolean;
}> {
  if (!auth || typeof window === 'undefined') {
    throw new Error('Firebase Authentication is not available.');
  }

  const storedEmail = window.localStorage.getItem('emailForSignIn') || '';
  const email = (emailOverride || storedEmail).trim().toLowerCase();

  if (!email) {
    const error: any = new Error('EMAIL_REQUIRED_FOR_COMPLETION');
    error.code = 'EMAIL_REQUIRED';
    throw error;
  }

  try {
    console.log(`[Firebase Auth] Verifying email link for ${email}...`);
    const result = await signInWithEmailLink(auth, email, window.location.href);
    const user = result.user;

    // Preserve saved name if available
    const savedName = window.localStorage.getItem('nameForSignIn');
    if (savedName && (!user.displayName || user.displayName === user.email?.split('@')[0])) {
      try {
        await updateProfile(user, { displayName: savedName });
      } catch (e) {
        console.warn('[Firebase Auth] Could not update profile displayName:', e);
      }
    }

    // Clean up temporary local storage
    window.localStorage.removeItem('emailForSignIn');
    window.localStorage.removeItem('nameForSignIn');

    // Clean up URL parameters so refresh doesn't re-trigger
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('emailSignIn');
      url.searchParams.delete('apiKey');
      url.searchParams.delete('mode');
      url.searchParams.delete('oobCode');
      url.searchParams.delete('lang');
      window.history.replaceState({}, document.title, url.pathname + (url.search ? url.search : ''));
    } catch (e) {
      // ignore URL cleaning error
    }

    const authProfile: AuthUserProfile = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || savedName || user.email?.split('@')[0] || 'Student',
      photoURL: user.photoURL,
    };

    return {
      user: authProfile,
      isNewUser: (result as any)._tokenResponse?.isNewUser ?? false,
    };
  } catch (err: any) {
    console.error('[Firebase Auth] Error completing sign in with email link:', err);
    const code = err?.code || '';
    const msg = err?.message || '';

    if (code === 'auth/expired-action-code' || msg.includes('expired')) {
      const error: any = new Error('This verification link has expired. Please request a new one.');
      error.code = 'auth/expired-action-code';
      throw error;
    }
    if (code === 'auth/invalid-action-code' || msg.includes('invalid-action-code')) {
      const error: any = new Error('This verification link has expired or is invalid. Please request a new one.');
      error.code = 'auth/invalid-action-code';
      throw error;
    }
    if (code === 'auth/invalid-email' || msg.includes('invalid-email')) {
      const error: any = new Error('The email address does not match the one used to request this link. Please enter the correct email address.');
      error.code = 'auth/invalid-email';
      throw error;
    }
    throw new Error(msg || 'Failed to complete sign in with verification link.');
  }
}

export { 
  app, 
  db, 
  auth, 
  isFirebaseConfigured, 
  oAuthClientId,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  updateProfile
};
