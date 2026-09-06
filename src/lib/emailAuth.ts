/**
 * Simple Email Authentication and Account System
 * 
 * - Passwordless authentication based on Name and Email address
 * - One-time 6-digit email verification code (OTP)
 * - Permanent authoritative internal unique user ID (usr_<id>)
 * - Safe, non-destructive association of local Study Planner workspace data
 * - Full protection and recovery of Premium entitlements
 */

import { AuthUserProfile } from './firebase';
import { DatabaseSchema, Subscription, UserProfile } from '../types';
import { isEntitlementActive, saveStoredEntitlement } from './entitlement';

export const AUTH_USER_STORAGE_KEY = 'studyflow_auth_user';

export interface SendCodeResponse {
  success: boolean;
  message: string;
  isExistingUser?: boolean;
  demoCode?: string;
  error?: string;
}

export interface VerifyCodeResponse {
  success: boolean;
  user?: AuthUserProfile;
  hasActiveSubscription?: boolean;
  subscription?: Subscription | null;
  error?: string;
  message?: string;
}

/**
 * Send one-time verification code to email
 */
export async function sendEmailVerificationCode(
  email: string,
  name?: string,
  mode: 'signup' | 'signin' = 'signup'
): Promise<SendCodeResponse> {
  const cleanEmail = email.trim().toLowerCase();
  const res = await fetch('/api/auth/email/send-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: cleanEmail,
      name: name?.trim(),
      mode,
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || data.error || 'Failed to send verification code.');
  }

  return data;
}

/**
 * Verify one-time code and retrieve/create authenticated user account
 */
export async function verifyEmailVerificationCode(
  email: string,
  code: string,
  name?: string
): Promise<VerifyCodeResponse> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanCode = code.trim();

  const res = await fetch('/api/auth/email/verify-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: cleanEmail,
      code: cleanCode,
      name: name?.trim(),
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || data.error || 'Invalid or expired verification code.');
  }

  // Save authenticated user to persistent local storage
  if (data.user) {
    saveLocalAuthUser(data.user);
    if (data.hasActiveSubscription && data.subscription) {
      saveStoredEntitlement(data.subscription, 'restored', {
        userId: data.user.uid,
        userEmail: data.user.email || undefined,
      });
    }
  }

  return data;
}

/**
 * Resend verification code
 */
export async function resendEmailVerificationCode(email: string): Promise<SendCodeResponse> {
  const cleanEmail = email.trim().toLowerCase();
  const res = await fetch('/api/auth/email/resend-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: cleanEmail }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || data.error || 'Failed to resend verification code.');
  }

  return data;
}

/**
 * Safely associates local Study Planner data with the authenticated email account.
 * Idempotent, preserves all records (courses, timetable, assignments, exams, notes, sessions).
 */
export function associateLocalDataWithEmailAccount(
  user: AuthUserProfile,
  currentDbState: DatabaseSchema
): DatabaseSchema {
  if (!user || !user.uid) return currentDbState;

  console.log('[Email Auth] Safely associating local workspace data with user ID:', user.uid);

  const existingProfile = currentDbState.profile || ({} as Partial<UserProfile>);
  const currentCourses = Array.isArray(currentDbState.courses) ? currentDbState.courses : [];
  const currentTimetable = Array.isArray(currentDbState.timetable) ? currentDbState.timetable : [];
  const currentAssignments = Array.isArray(currentDbState.assignments) ? currentDbState.assignments : [];
  const currentExams = Array.isArray(currentDbState.exams) ? currentDbState.exams : [];
  const currentNotes = Array.isArray(currentDbState.notes) ? currentDbState.notes : [];
  const currentStudySessions = Array.isArray(currentDbState.studySessions) ? currentDbState.studySessions : [];
  const currentStudyMaterials = Array.isArray(currentDbState.studyMaterials) ? currentDbState.studyMaterials : [];
  const currentAudioLectures = Array.isArray(currentDbState.audioLectures) ? currentDbState.audioLectures : [];

  const updatedProfile: UserProfile = {
    ...existingProfile,
    userId: user.uid,
    id: user.uid,
    email: user.email || existingProfile.email || '',
    name: user.displayName || existingProfile.name || 'Student',
    initials: (user.displayName || existingProfile.name || user.email || 'ST')
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
    console.warn('[Email Auth] LocalStorage write notice:', err);
  }

  // Asynchronously notify backend to synchronize workspace data
  fetch('/api/auth/associate-data', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': user.uid,
      'x-user-email': user.email || '',
    },
    body: JSON.stringify({
      userId: user.uid,
      userEmail: user.email,
      state: mergedState,
    }),
  }).catch((err) => {
    console.warn('[Email Auth] Non-fatal backend data sync notice:', err);
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
    if (parsed && parsed.uid && parsed.email) {
      return parsed;
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
      localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user));
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
