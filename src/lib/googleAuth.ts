/**
 * Google Identity Services (GIS) and Google Authentication Module
 * 
 * Provides:
 * - Robust Google Identity Services client integration
 * - Server-side ID token verification via /api/auth/google
 * - Safe account linking and Premium status retrieval
 * - Firebase Auth synchronization via GoogleAuthProvider.credential
 * - Timeout-protected fallback mechanisms to prevent "Connecting..." hangs
 */

import { signInWithGoogleIdToken, signInWithGoogle as signInWithFirebasePopup, AuthUserProfile } from './firebase';
import { Subscription } from '../types';

export const GOOGLE_CLIENT_ID = 
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GOOGLE_CLIENT_ID) ||
  '446581031176-sp43qc7tblt9n8u8a4hrj1h05rtparor.apps.googleusercontent.com';

/**
 * Returns the exact runtime origin of the application
 */
export function getCurrentRuntimeOrigin(): string {
  if (typeof window !== 'undefined' && window.location) {
    return window.location.origin;
  }
  return '';
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (config: any) => void;
          renderButton: (parent: HTMLElement, options: any) => void;
          prompt: (momentListener?: (notification: any) => void) => void;
          cancel: () => void;
        };
      };
    };
  }
}

// Module-level singleton state to prevent duplicate GIS initializations
let isGisInitialized = false;
let gisScriptLoadingPromise: Promise<boolean> | null = null;
type AuthSuccessCallback = (user: AuthUserProfile, subscription: Subscription | null) => void;
const authSuccessListeners = new Set<AuthSuccessCallback>();

/**
 * Ensure Google Identity Services script is loaded in the DOM
 */
export function ensureGisScriptLoaded(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  
  if (window.google?.accounts?.id) {
    return Promise.resolve(true);
  }

  if (gisScriptLoadingPromise) {
    return gisScriptLoadingPromise;
  }

  gisScriptLoadingPromise = new Promise((resolve) => {
    // Check if script element already exists
    let script = document.querySelector('script[src="https://accounts.google.com/gsi/client"]') as HTMLScriptElement;
    
    const onScriptReady = () => {
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (window.google?.accounts?.id) {
          clearInterval(interval);
          console.log('[Google Auth] GIS script loaded and ready');
          resolve(true);
        } else if (attempts > 30) { // 3 seconds timeout
          clearInterval(interval);
          console.warn('[Google Auth] GIS script loaded but window.google.accounts.id not found');
          resolve(false);
        }
      }, 100);
    };

    if (script) {
      if (window.google?.accounts?.id) {
        resolve(true);
      } else {
        script.addEventListener('load', onScriptReady);
        script.addEventListener('error', () => {
          console.warn('[Google Auth] Failed to load GIS script from CDN');
          resolve(false);
        });
      }
    } else {
      script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = onScriptReady;
      script.onerror = () => {
        console.warn('[Google Auth] Failed to inject GIS script into DOM');
        resolve(false);
      };
      document.head.appendChild(script);
    }
  });

  return gisScriptLoadingPromise;
}

/**
 * Initialize Google Identity Services ONCE for the application lifecycle
 */
export async function initGoogleIdentityServices(onSuccess?: AuthSuccessCallback): Promise<boolean> {
  if (onSuccess) {
    authSuccessListeners.add(onSuccess);
  }

  if (isGisInitialized) {
    return true;
  }

  const isLoaded = await ensureGisScriptLoaded();
  if (!isLoaded || !window.google?.accounts?.id) {
    console.warn('[Google Auth] Cannot initialize GIS: script not available');
    return false;
  }

  try {
    const currentOrigin = getCurrentRuntimeOrigin();
    console.log('[Google Auth] Initializing GIS for origin:', currentOrigin);
    console.log('[Google Auth] Google client ID detected:', GOOGLE_CLIENT_ID.slice(0, 16) + '...');

    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: async (response: { credential: string }) => {
        console.log('[Google Auth] authentication callback received');
        try {
          const { user, subscription } = await verifyAndCompleteGoogleAuth(response.credential);
          authSuccessListeners.forEach(fn => {
            try { fn(user, subscription); } catch (e) { console.error('[Google Auth] Listener error:', e); }
          });
        } catch (err) {
          console.error('[Google Auth] Error handling Google credential callback:', err);
        }
      },
      auto_select: false,
      cancel_on_tap_outside: true,
      context: 'signin',
    });

    isGisInitialized = true;
    return true;
  } catch (err) {
    console.error('[Google Auth] Failed to initialize GIS:', err);
    return false;
  }
}

/**
 * Render the official Google Identity Services button into a target container
 */
export async function renderGoogleButton(
  container: HTMLElement,
  options?: {
    theme?: 'outline' | 'filled_blue' | 'filled_black';
    size?: 'large' | 'medium' | 'small';
    text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
    shape?: 'rectangular' | 'pill' | 'circle' | 'square';
    width?: number;
    logo_alignment?: 'left' | 'center';
  }
): Promise<boolean> {
  if (!container) return false;

  await initGoogleIdentityServices();

  if (!window.google?.accounts?.id) {
    return false;
  }

  try {
    container.innerHTML = '';
    window.google.accounts.id.renderButton(container, {
      theme: options?.theme || 'outline',
      size: options?.size || 'large',
      text: options?.text || 'signin_with',
      shape: options?.shape || 'rectangular',
      width: options?.width || Math.min(container.clientWidth || 280, 320),
      logo_alignment: options?.logo_alignment || 'left',
    });

    // Verify GIS actually rendered an element into container (not blocked by origin mismatch)
    await new Promise(r => setTimeout(r, 60));
    const hasElements = container.children.length > 0;
    if (hasElements) {
      console.log('[Google Auth] Google button rendered successfully');
      return true;
    } else {
      console.warn('[Google Auth] Google button container empty. The origin may need to be added to Authorized JavaScript origins in Google Cloud Console:', getCurrentRuntimeOrigin());
      return false;
    }
  } catch (err) {
    console.error('[Google Auth] Error rendering Google button:', err);
    return false;
  }
}

/**
 * Display Google Account Chooser Prompt
 */
export async function promptGoogleAccountChooser(): Promise<void> {
  await initGoogleIdentityServices();
  if (window.google?.accounts?.id) {
    window.google.accounts.id.prompt((notification) => {
      if (notification.isNotDisplayed()) {
        console.log('[Google Auth] Prompt not displayed reason:', notification.getNotDisplayedReason());
      } else if (notification.isSkippedMoment()) {
        console.log('[Google Auth] Prompt skipped reason:', notification.getSkippedReason());
      } else if (notification.isDismissedMoment()) {
        console.log('[Google Auth] Prompt dismissed reason:', notification.getDismissedReason());
      }
    });
  }
}

/**
 * Verify Google ID token on authoritative server, link account, and synchronize Firebase
 */
export async function verifyAndCompleteGoogleAuth(credential: string): Promise<{
  user: AuthUserProfile;
  subscription: Subscription | null;
}> {
  console.log('[Google Auth] backend authentication request started');

  const res = await fetch('/api/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential }),
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    console.warn('[Google Auth] backend authentication failed with status', res.status);
    throw new Error(errorBody.message || 'Google token verification failed on server.');
  }

  const data = await res.json();
  if (!data.success || !data.user) {
    throw new Error(data.message || 'Server did not return a valid user identity.');
  }

  console.log('[Google Auth] backend authentication succeeded');
  console.log('[Google Auth] account linking completed');
  console.log('[Google Auth] Premium status retrieved:', data.hasActiveSubscription ? 'Active Premium' : 'Free Plan');

  const userProfile: AuthUserProfile = {
    uid: data.user.uid,
    email: data.user.email,
    displayName: data.user.displayName,
    photoURL: data.user.photoURL,
  };

  // Synchronize Firebase Auth with this credential in the background
  try {
    await signInWithGoogleIdToken(credential);
    console.log('[Google Auth] Firebase auth session synchronized with Google credential');
  } catch (firebaseErr) {
    console.warn('[Google Auth] Non-fatal Firebase sync notice:', firebaseErr);
  }

  return {
    user: userProfile,
    subscription: data.subscription || null,
  };
}

/**
 * Fallback interactive login trigger with strict timeout protection
 * Prevents UI from staying permanently stuck in "Connecting..."
 */
export async function triggerInteractiveGoogleLogin(
  timeoutMs: number = 45000
): Promise<AuthUserProfile> {
  let timerId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timerId = setTimeout(() => {
      reject(new Error('Google sign-in timed out or was closed. Please click "Try Again" to retry.'));
    }, timeoutMs);
  });

  // Attempt GIS prompt first if available, otherwise popup
  const authAction = async (): Promise<AuthUserProfile> => {
    try {
      // Try Firebase popup which handles user interaction directly
      const user = await signInWithFirebasePopup();
      return user;
    } finally {
      if (timerId) clearTimeout(timerId);
    }
  };

  return await Promise.race([authAction(), timeoutPromise]);
}
