/**
 * Native Study Planner Account Client Library
 * 
 * Simple, production-grade Name + Email + Password authentication:
 * - Direct native account creation (no email verification, no OTP, no passwordless links)
 * - Immediate sign-in on account creation
 * - Secure server-side hashed password verification (bcrypt)
 * - Secure authenticated session management (HttpOnly cookie + token fallback)
 * - Automatic linking with active Premium subscriptions in subscriptions_ledger.json
 * - Safe, non-destructive local workspace data association
 */

import { DatabaseSchema, UserProfile, Subscription } from '../types';
import { getStoredEntitlement, isEntitlementActive } from './entitlement';

export const AUTH_USER_STORAGE_KEY = 'studyflow_auth_user';
export const AUTH_SESSION_STORAGE_KEY = 'studyflow_session_token';

export interface AuthUserProfile {
  userId: string;
  uid?: string; // Legacy compatibility alias for existing components
  username?: string;
  name: string;
  displayName?: string; // Legacy compatibility alias
  email: string | null;
  photoURL?: string | null;
}

export interface AuthResult {
  user: AuthUserProfile;
  token?: string;
  hasActiveSubscription: boolean;
  subscription: Subscription | null;
}

export const DEVICE_ID_STORAGE_KEY = 'studyflow_device_id';

export function getOrCreateAnonymousDeviceId(): string {
  if (typeof window === 'undefined' || !window.localStorage) {
    return 'default';
  }
  try {
    let deviceId = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (!deviceId) {
      deviceId = 'dev_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);
      localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
    }
    return deviceId;
  } catch (e) {
    return 'default';
  }
}

/**
 * Helper to build auth headers including optional session token and device-level isolation
 */
export function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  try {
    const token = localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      headers['x-session-token'] = token;
    }
    const user = getLocalAuthUser();
    if (user?.userId || user?.uid) {
      headers['x-user-id'] = user.userId || user.uid || '';
    } else {
      const deviceId = getOrCreateAnonymousDeviceId();
      headers['x-device-id'] = deviceId;
      headers['x-user-id'] = `anon_${deviceId}`;
    }
    if (user?.email) {
      headers['x-user-email'] = user.email;
    }
  } catch (e) {
    // ignore
  }
  return headers;
}

/**
 * Register a new Study Planner account with Username, Password, and Confirm Password.
 * Supports backward-compatible arguments (name, email, password, confirmPassword).
 * No email or OTP required - user is signed in immediately and permanent unique userId is assigned.
 */
export async function handleSignUp(
  username: string,
  arg2?: string,
  arg3?: string,
  arg4?: any,
  arg5?: any
): Promise<AuthResult> {
  const cleanUsername = (typeof username === 'string' ? username : '').trim();

  let cleanPassword = '';
  let cleanConfirmPassword = '';
  let cleanEmail = '';
  let stateToMigrate: any = null;

  // Detect argument layout:
  if (typeof arg2 === 'string' && (arg2.includes('@') || arg2.includes('.'))) {
    // Legacy: (username, email, password, confirmPassword, state)
    cleanEmail = arg2.trim().toLowerCase();
    cleanPassword = typeof arg3 === 'string' ? arg3 : '';
    cleanConfirmPassword = typeof arg4 === 'string' ? arg4 : cleanPassword;
    stateToMigrate = arg5;
  } else if (arg2 === undefined && typeof arg3 === 'string' && arg3) {
    // Called as: (username, undefined, password, confirmPassword, state)
    cleanPassword = arg3;
    cleanConfirmPassword = typeof arg4 === 'string' ? arg4 : cleanPassword;
    stateToMigrate = arg5;
  } else {
    // Standard: (username, password, confirmPassword, state)
    cleanPassword = typeof arg2 === 'string' ? arg2 : '';
    cleanConfirmPassword = typeof arg3 === 'string' ? arg3 : cleanPassword;
    stateToMigrate = arg4;
  }

  if (!cleanUsername) {
    throw new Error('Username is required.');
  }
  if (cleanUsername.length < 2) {
    throw new Error('Username must be at least 2 characters.');
  }
  if (!cleanPassword) {
    throw new Error('Password is required.');
  }
  if (cleanPassword.length < 6) {
    throw new Error('Password must be at least 6 characters.');
  }
  if (cleanConfirmPassword !== undefined && cleanPassword !== cleanConfirmPassword) {
    throw new Error('Passwords do not match. Please verify your password.');
  }

  const endpoint = '/api/auth/signup';
  let res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: cleanUsername,
      name: cleanUsername,
      firstName: cleanUsername,
      email: cleanEmail,
      password: cleanPassword,
      confirmPassword: cleanConfirmPassword,
      state: stateToMigrate,
    }),
  });

  if (!res.ok && res.status === 404) {
    // Fallback to /api/auth/register if needed
    res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: cleanUsername,
        name: cleanUsername,
        firstName: cleanUsername,
        email: cleanEmail,
        password: cleanPassword,
        confirmPassword: cleanConfirmPassword,
        state: stateToMigrate,
      }),
    });
  }

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || data.error || 'Failed to create account.');
  }

  const authUser: AuthUserProfile = {
    userId: data.user.userId,
    uid: data.user.userId,
    username: data.user.username || data.user.name,
    name: data.user.name,
    displayName: data.user.name,
    email: data.user.email,
    photoURL: null,
  };

  if (data.token) {
    try {
      localStorage.setItem(AUTH_SESSION_STORAGE_KEY, data.token);
    } catch (e) {}
  }

  saveLocalAuthUser(authUser);

  return {
    user: authUser,
    token: data.token,
    hasActiveSubscription: Boolean(data.hasActiveSubscription),
    subscription: data.subscription || null,
  };
}

/**
 * Sign in existing Study Planner user with Username and Password.
 */
export async function handleSignIn(
  username: string,
  password: string,
  stateToMigrate?: any
): Promise<AuthResult> {
  const cleanUsername = (typeof username === 'string' ? username : '').trim();

  if (!cleanUsername) {
    throw new Error('Please enter your Username.');
  }
  if (!password) {
    throw new Error('Please enter your password.');
  }

  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: cleanUsername,
      identifier: cleanUsername,
      name: cleanUsername,
      firstName: cleanUsername,
      password,
      state: stateToMigrate,
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || data.error || 'Incorrect Username or password.');
  }

  const authUser: AuthUserProfile = {
    userId: data.user.userId,
    uid: data.user.userId,
    username: data.user.username || data.user.name,
    name: data.user.name,
    displayName: data.user.name,
    email: data.user.email,
    photoURL: null,
  };

  if (data.token) {
    try {
      localStorage.setItem(AUTH_SESSION_STORAGE_KEY, data.token);
    } catch (e) {}
  }

  saveLocalAuthUser(authUser);

  return {
    user: authUser,
    token: data.token,
    hasActiveSubscription: Boolean(data.hasActiveSubscription),
    subscription: data.subscription || null,
  };
}

/**
 * Check current authenticated session with the server.
 */
export async function checkCurrentAuth(): Promise<AuthResult | null> {
  try {
    let res = await fetch('/api/auth/session', {
      headers: getAuthHeaders(),
    });

    if (!res.ok || res.status === 404) {
      res = await fetch('/api/auth/me', {
        headers: getAuthHeaders(),
      });
    }

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        // Explicitly unauthenticated
        clearLocalAuthUser();
        return null;
      }
      // Transient server/network error: preserve cached session
      const cached = getLocalAuthUser();
      if (cached) {
        const localEntitlement = getStoredEntitlement();
        return {
          user: cached,
          hasActiveSubscription: Boolean(localEntitlement && isEntitlementActive(localEntitlement)),
          subscription: localEntitlement || null,
        };
      }
      return null;
    }

    const data = await res.json();

    if (data.authenticated && data.user) {
      const authUser: AuthUserProfile = {
        userId: data.user.userId,
        uid: data.user.userId,
        username: data.user.username || data.user.name,
        name: data.user.name,
        displayName: data.user.name,
        email: data.user.email,
        photoURL: null,
      };
      saveLocalAuthUser(authUser);
      return {
        user: authUser,
        hasActiveSubscription: Boolean(data.hasActiveSubscription),
        subscription: data.subscription || null,
      };
    }
  } catch (err) {
    console.warn('[Native Auth] Non-fatal auth check notice:', err);
    // Offline or network timeout: preserve cached session
    const cached = getLocalAuthUser();
    if (cached) {
      const localEntitlement = getStoredEntitlement();
      return {
        user: cached,
        hasActiveSubscription: Boolean(localEntitlement && isEntitlementActive(localEntitlement)),
        subscription: localEntitlement || null,
      };
    }
  }
  return null;
}

/**
 * Safely migrates local study planner state into server account namespace.
 */
export async function handleDataMigration(state: any): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/migrate', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ state }),
    });
    return res.ok;
  } catch (err) {
    console.warn('[Native Auth] Migration notice:', err);
    return false;
  }
}

/**
 * Request password reset token / email.
 */
export async function handlePasswordReset(email: string): Promise<string> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
    throw new Error('Please enter a valid email address.');
  }

  const res = await fetch('/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: cleanEmail }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Failed to request password reset.');
  }
  return data.message || 'If an account exists for this email, password reset instructions have been generated.';
}

/**
 * Sign out current user.
 */
export async function handleSignOut(): Promise<void> {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: getAuthHeaders(),
    });
  } catch (err) {
    console.warn('[Native Auth] Sign out notice:', err);
  }
  clearLocalAuthUser();
  try {
    localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
  } catch (e) {}
}

/**
 * Safely associates local Study Planner data with the authenticated account.
 * Idempotent, preserves all academic records (courses, timetable, assignments, exams, notes, sessions).
 * CRITICAL SAFETY CHECK: NEVER associates or merges data if the local data belonged to a DIFFERENT registered user.
 */
export function associateLocalDataWithEmailAccount(
  user: AuthUserProfile,
  currentDbState: DatabaseSchema
): DatabaseSchema {
  const effectiveId = user.userId || user.uid;
  if (!effectiveId) return currentDbState;

  const existingProfile = currentDbState.profile || ({} as Partial<UserProfile>);
  
  // Guard against cross-account contamination: If local data belonged to another registered user, do not overwrite!
  if (
    existingProfile.userId &&
    existingProfile.userId !== effectiveId &&
    !existingProfile.userId.startsWith('anon_')
  ) {
    console.warn('[Native Auth] Local state belongs to a different user. Preventing cross-account data pollution.');
    return currentDbState;
  }

  console.log('[Native Auth] Safely associating local workspace data with user ID:', effectiveId);

  const currentCourses = Array.isArray(currentDbState.courses) ? currentDbState.courses : [];
  const currentTimetable = Array.isArray(currentDbState.timetable) ? currentDbState.timetable : [];
  const currentAssignments = Array.isArray(currentDbState.assignments) ? currentDbState.assignments : [];
  const currentExams = Array.isArray(currentDbState.exams) ? currentDbState.exams : [];
  const currentNotes = Array.isArray(currentDbState.notes) ? currentDbState.notes : [];
  const currentStudySessions = Array.isArray(currentDbState.studySessions) ? currentDbState.studySessions : [];
  const currentStudyMaterials = Array.isArray(currentDbState.studyMaterials) ? currentDbState.studyMaterials : [];
  const currentAudioLectures = Array.isArray(currentDbState.audioLectures) ? currentDbState.audioLectures : [];

  const displayName = user.name || user.displayName || existingProfile.name || 'Student';

  const updatedProfile: UserProfile = {
    ...existingProfile,
    userId: effectiveId,
    id: effectiveId,
    email: user.email || existingProfile.email || '',
    name: displayName,
    initials: displayName
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'ST',
    photoURL: user.photoURL || existingProfile.photoURL || null,
    subscription: existingProfile.subscription || {
      subscriptionStatus: 'free',
      plan: 'free',
      paymentGateway: null,
      transactionId: null,
      purchaseDate: null,
      expiryDate: null,
      billingCountry: 'GLOBAL',
    },
  };

  const mergedState: DatabaseSchema = {
    ...currentDbState,
    profile: updatedProfile,
    courses: currentCourses,
    timetable: currentTimetable,
    assignments: currentAssignments,
    exams: currentExams,
    notes: currentNotes,
    studySessions: currentStudySessions,
    studyMaterials: currentStudyMaterials,
    audioLectures: currentAudioLectures,
  };

  try {
    localStorage.setItem('studyflow_db_state', JSON.stringify(mergedState));
  } catch (err) {
    console.warn('[Native Auth] LocalStorage write notice:', err);
  }

  // Asynchronously notify backend to synchronize workspace data
  fetch('/api/auth/associate-data', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      userId: effectiveId,
      userEmail: user.email,
      state: mergedState,
    }),
  }).catch((err) => {
    console.warn('[Native Auth] Non-fatal backend data sync notice:', err);
  });

  return mergedState;
}

/**
 * Get locally stored authenticated user
 */
export function getLocalAuthUser(): AuthUserProfile | null {
  try {
    const raw = localStorage.getItem(AUTH_USER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const userId = parsed?.userId || parsed?.uid;
    if (parsed && userId) {
      return {
        userId,
        uid: userId,
        name: parsed.name || parsed.displayName || (parsed.email ? parsed.email.split('@')[0] : 'Student'),
        displayName: parsed.name || parsed.displayName || (parsed.email ? parsed.email.split('@')[0] : 'Student'),
        email: parsed.email || null,
        photoURL: parsed.photoURL || null,
      };
    }
  } catch (e) {
    // ignore
  }
  return null;
}

/**
 * Save locally stored authenticated user
 */
export function saveLocalAuthUser(user: AuthUserProfile | null): void {
  try {
    if (user) {
      const normalized = {
        userId: user.userId || user.uid,
        uid: user.userId || user.uid,
        name: user.name || user.displayName || user.email?.split('@')[0] || 'Student',
        displayName: user.name || user.displayName || user.email?.split('@')[0] || 'Student',
        email: user.email,
        photoURL: user.photoURL || null,
      };
      localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(normalized));
    } else {
      localStorage.removeItem(AUTH_USER_STORAGE_KEY);
    }
  } catch (e) {
    // ignore
  }
}

/**
 * Clear authenticated user
 */
export function clearLocalAuthUser(): void {
  try {
    localStorage.removeItem(AUTH_USER_STORAGE_KEY);
  } catch (e) {
    // ignore
  }
}

