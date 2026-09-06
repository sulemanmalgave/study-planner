/**
 * Microsoft Authentication and Account Association Module
 * 
 * Provides:
 * - Official Microsoft OAuth authentication via Firebase Auth OAuthProvider('microsoft.com')
 * - Support for personal Microsoft accounts (Hotmail, Outlook, Live) and Work/School (Entra ID)
 * - Safe association and merging of local Study Planner data with authenticated account
 * - Strict non-destructive migration ensuring courses, notes, exams and timetable are preserved
 * - Timeout-protected interactive triggers preventing UI hangs
 */

import { signInWithMicrosoft, AuthUserProfile } from './firebase';
import { DatabaseSchema, Subscription, UserProfile } from '../types';

export const EXPECTED_PRODUCTION_DOMAIN = 'https://study-planner-tool.vercel.app';
export const FIREBASE_PROJECT_ID = 'gen-lang-client-0198820455';
export const FIREBASE_AUTH_DOMAIN = 'gen-lang-client-0198820455.firebaseapp.com';
export const FIREBASE_MICROSOFT_REDIRECT_URI = 'https://gen-lang-client-0198820455.firebaseapp.com/__/auth/handler';
export const MICROSOFT_TENANT = 'common';

/**
 * Returns the exact runtime origin of the application
 */
export function getCurrentRuntimeOrigin(): string {
  if (typeof window !== 'undefined' && window.location) {
    return window.location.origin;
  }
  return '';
}

/**
 * Fallback interactive Microsoft sign-in trigger with strict timeout protection
 * Prevents UI from staying permanently stuck in "Connecting..."
 */
export async function triggerInteractiveMicrosoftLogin(
  timeoutMs: number = 45000
): Promise<AuthUserProfile> {
  let timerId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timerId = setTimeout(() => {
      reject(new Error('Microsoft sign-in timed out or was closed. Please click "Try Again" to retry.'));
    }, timeoutMs);
  });

  const authAction = async (): Promise<AuthUserProfile> => {
    try {
      const user = await signInWithMicrosoft();
      return user;
    } finally {
      if (timerId) clearTimeout(timerId);
    }
  };

  return await Promise.race([authAction(), timeoutPromise]);
}

/**
 * Safely associates local Study Planner data with the newly signed-in Microsoft account.
 * 
 * CRITICAL REQUIREMENTS:
 * - NEVER overwrites or wipes existing courses, notes, assignments, exams, or timetable
 * - Merges user identity non-destructively
 * - Retains existing Premium status if present
 * - Idempotent: safe to run multiple times without duplicating entries
 */
export function associateLocalDataWithMicrosoftAccount(
  user: AuthUserProfile,
  currentDbState: DatabaseSchema
): DatabaseSchema {
  if (!user || !currentDbState) return currentDbState;

  console.log('[Microsoft Auth] Safely associating local workspace data with Microsoft UID:', user.uid);

  const existingProfile = currentDbState.profile || ({} as Partial<UserProfile>);
  const currentCourses = Array.isArray(currentDbState.courses) ? currentDbState.courses : [];
  const currentTimetable = Array.isArray(currentDbState.timetable) ? currentDbState.timetable : [];
  const currentAssignments = Array.isArray(currentDbState.assignments) ? currentDbState.assignments : [];
  const currentExams = Array.isArray(currentDbState.exams) ? currentDbState.exams : [];
  const currentNotes = Array.isArray(currentDbState.notes) ? currentDbState.notes : [];
  const currentStudySessions = Array.isArray(currentDbState.studySessions) ? currentDbState.studySessions : [];
  const currentStudyMaterials = Array.isArray(currentDbState.studyMaterials) ? currentDbState.studyMaterials : [];

  const updatedProfile: UserProfile = {
    ...existingProfile,
    userId: user.uid,
    microsoftUid: user.uid,
    isMicrosoftLinked: true,
    email: user.email || existingProfile.email || '',
    name: user.displayName || existingProfile.name || user.email?.split('@')[0] || 'Student',
    initials: (user.displayName || existingProfile.name || 'S')
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'MS',
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
  };

  // Synchronize to localStorage safely
  try {
    localStorage.setItem('studyflow_db_state', JSON.stringify(mergedState));
  } catch (err) {
    console.warn('[Microsoft Auth] LocalStorage write notice:', err);
  }

  return mergedState;
}

/**
 * Checks server for existing subscriptions linked to this Microsoft account UID or email
 */
export async function queryAccountSubscription(
  user: AuthUserProfile
): Promise<{ hasActiveSubscription: boolean; subscription: Subscription | null }> {
  try {
    const res = await fetch('/api/subscription/account-status', {
      headers: {
        'x-user-id': user.uid,
        'x-user-email': user.email || '',
      },
    });

    if (!res.ok) {
      return { hasActiveSubscription: false, subscription: null };
    }

    const data = await res.json();
    return {
      hasActiveSubscription: Boolean(data?.hasActiveSubscription && data?.subscription),
      subscription: data?.subscription || null,
    };
  } catch (err) {
    console.warn('[Microsoft Auth] Failed to query subscription status:', err);
    return { hasActiveSubscription: false, subscription: null };
  }
}
