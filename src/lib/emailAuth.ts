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

export const AUTH_USER_STORAGE_KEY = 'studyflow_auth_user';
export const AUTH_SESSION_STORAGE_KEY = 'studyflow_session_token';

export interface AuthUserProfile {
  userId: string;
  uid?: string; // Legacy compatibility alias for existing components
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

/**
 * Helper to build auth headers including optional session token
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
 * Register a new Study Planner account with Name, Email, and Password.
 * No email verification required - user is signed in immediately.
 */
export async function handleSignUp(
  name: string,
  email: string,
  password: string,
  confirmPassword?: string
): Promise<AuthResult> {
  const cleanName = name.trim();
  const cleanEmail = email.trim().toLowerCase();

  if (!cleanName) {
    throw new Error('Please enter your name.');
  }
  if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
    throw new Error('Please enter a valid email address.');
  }
  if (!password || password.length < 6) {
    throw new Error('Password must be at least 6 characters.');
  }
  if (confirmPassword !== undefined && password !== confirmPassword) {
    throw new Error('Passwords do not match. Please verify your password.');
  }

  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: cleanName,
      email: cleanEmail,
      password,
      confirmPassword: confirmPassword || password,
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || data.error || 'Failed to create account.');
  }

  const authUser: AuthUserProfile = {
    userId: data.user.userId,
    uid: data.user.userId,
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
 * Sign in existing Study Planner user with Email and Password.
 */
export async function handleSignIn(
  email: string,
  password: string
): Promise<AuthResult> {
  const cleanEmail = email.trim().toLowerCase();

  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('Please enter a valid email address.');
  }
  if (!password) {
    throw new Error('Please enter your password.');
  }

  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: cleanEmail,
      password,
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || data.error || 'Incorrect email or password.');
  }

  const authUser: AuthUserProfile = {
    userId: data.user.userId,
    uid: data.user.userId,
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
    const res = await fetch('/api/auth/me', {
      headers: getAuthHeaders(),
    });

    if (!res.ok) return null;
    const data = await res.json();

    if (data.authenticated && data.user) {
      const authUser: AuthUserProfile = {
        userId: data.user.userId,
        uid: data.user.userId,
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
  }
  return null;
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
 */
export function associateLocalDataWithEmailAccount(
  user: AuthUserProfile,
  currentDbState: DatabaseSchema
): DatabaseSchema {
  const effectiveId = user.userId || user.uid;
  if (!effectiveId) return currentDbState;

  console.log('[Native Auth] Safely associating local workspace data with user ID:', effectiveId);

  const existingProfile = currentDbState.profile || ({} as Partial<UserProfile>);
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
    if (parsed && userId && parsed.email) {
      return {
        userId,
        uid: userId,
        name: parsed.name || parsed.displayName || parsed.email.split('@')[0],
        displayName: parsed.name || parsed.displayName || parsed.email.split('@')[0],
        email: parsed.email,
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

