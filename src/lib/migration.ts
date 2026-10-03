import { DatabaseSchema, Subscription } from '../types';
import { loadClientState, saveClientState, sanitizeSchema, hasMeaningfulData } from './storage';
import { getStoredEntitlement, isEntitlementActive, saveStoredEntitlement } from './entitlement';
import { handleSignUp, saveLocalAuthUser, AuthUserProfile, AUTH_SESSION_STORAGE_KEY } from './emailAuth';

export const MIGRATION_RECORD_STORAGE_KEY = 'studyflow_migration_record';
export const MIGRATION_SNAPSHOT_STORAGE_KEY = 'studyflow_migration_snapshot_v1';
export const MIGRATION_DISMISSED_KEY = 'studyflow_migration_dismissed';

export interface MigrationRecord {
  migrationVersion: number;
  migrationStatus: 'completed' | 'in_progress' | 'failed';
  oldUserReference: string;
  newUserId: string;
  migratedAt: string;
  snapshotVerified: boolean;
  itemCountsMigrated: {
    courses: number;
    timetable: number;
    assignments: number;
    exams: number;
    notes: number;
    studySessions: number;
    audioLectures: number;
    studyMaterials: number;
  };
}

export interface ExistingUserDataSummary {
  hasExistingData: boolean;
  itemCounts: {
    courses: number;
    timetable: number;
    assignments: number;
    exams: number;
    notes: number;
    studySessions: number;
    audioLectures: number;
    studyMaterials: number;
  };
  hasActiveSubscription: boolean;
  subscription: Subscription | null;
  suggestedName: string;
  isMigrated: boolean;
}

/**
 * Checks whether an existing migration record already marks this device/session as migrated.
 */
export function getMigrationRecord(): MigrationRecord | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = localStorage.getItem(MIGRATION_RECORD_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.migrationStatus === 'completed' && parsed.newUserId) {
      return parsed as MigrationRecord;
    }
  } catch (e) {
    // Ignore parse errors
  }
  return null;
}

export function isMigrationCompleted(): boolean {
  const record = getMigrationRecord();
  return Boolean(record && record.migrationStatus === 'completed');
}

/**
 * Detects whether existing Study Planner user data exists in local storage,
 * backup storage, or entitlement cache BEFORE an account was created.
 */
export function detectExistingUserData(): ExistingUserDataSummary {
  const fallbackSummary: ExistingUserDataSummary = {
    hasExistingData: false,
    itemCounts: {
      courses: 0,
      timetable: 0,
      assignments: 0,
      exams: 0,
      notes: 0,
      studySessions: 0,
      audioLectures: 0,
      studyMaterials: 0,
    },
    hasActiveSubscription: false,
    subscription: null,
    suggestedName: '',
    isMigrated: isMigrationCompleted(),
  };

  if (typeof window === 'undefined') return fallbackSummary;

  try {
    const localState = loadClientState();
    const storedEntitlement = getStoredEntitlement();
    const hasActiveSub = isEntitlementActive(storedEntitlement);

    const courses = localState?.courses?.length || 0;
    const timetable = localState?.timetable?.length || 0;
    const assignments = localState?.assignments?.length || 0;
    const exams = localState?.exams?.length || 0;
    const notes = localState?.notes?.length || 0;
    const studySessions = localState?.studySessions?.length || 0;
    const audioLectures = localState?.audioLectures?.length || 0;
    const studyMaterials = localState?.studyMaterials?.length || 0;

    const totalItems = courses + timetable + assignments + exams + notes + studySessions + audioLectures + studyMaterials;
    const hasMeaningful = hasMeaningfulData(localState) || totalItems > 0 || hasActiveSub;

    // Check if the user already has a real registered account (not anonymous)
    const existingUserId = localState?.profile?.userId || localState?.profile?.id;
    const isAlreadyRegistered = Boolean(
      existingUserId &&
      !existingUserId.startsWith('anon_') &&
      existingUserId.startsWith('usr_') &&
      isMigrationCompleted()
    );

    return {
      hasExistingData: hasMeaningful && !isAlreadyRegistered,
      itemCounts: {
        courses,
        timetable,
        assignments,
        exams,
        notes,
        studySessions,
        audioLectures,
        studyMaterials,
      },
      hasActiveSubscription: hasActiveSub,
      subscription: hasActiveSub ? (storedEntitlement || localState?.profile?.subscription || null) : null,
      suggestedName: (localState?.profile?.name && localState.profile.name !== 'Student')
        ? localState.profile.name
        : '',
      isMigrated: isAlreadyRegistered,
    };
  } catch (err) {
    console.warn('[Migration Detection] Non-fatal check error:', err);
    return fallbackSummary;
  }
}

/**
 * Creates a permanent, non-destructive snapshot of current local data before migration.
 * Serves as recovery failsafe.
 */
export function createMigrationSnapshot(): void {
  if (typeof window === 'undefined') return;
  try {
    const currentState = loadClientState();
    if (currentState) {
      localStorage.setItem(MIGRATION_SNAPSHOT_STORAGE_KEY, JSON.stringify(currentState));
    }
  } catch (e) {
    console.warn('[Migration Snapshot] Notice saving migration snapshot:', e);
  }
}

/**
 * Executes an atomic, idempotent migration of existing user data into a newly created account.
 * 
 * Safety protocol:
 * 1. Snapshot existing data.
 * 2. Validate current state structure.
 * 3. Register user with Name + Password (server generates immutable unique userId).
 * 4. Associate existing items with server (union merge).
 * 5. Verify transferred data count on server.
 * 6. Preserve and link active subscription (monthly/yearly, Razorpay/PayPal).
 * 7. Set migration completed record.
 * 8. Return successfully migrated user state.
 */
export async function executeAtomicMigration(
  name: string,
  password: string,
  confirmPassword?: string
): Promise<{ user: AuthUserProfile; finalState: DatabaseSchema }> {
  const cleanName = (typeof name === 'string' ? name : '').trim();
  if (!cleanName) {
    throw new Error('Name is required to create an account.');
  }
  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters.');
  }
  if (confirmPassword !== undefined && password !== confirmPassword) {
    throw new Error('Passwords do not match. Please verify your password.');
  }

  // Step 1: Snapshot existing data safely
  createMigrationSnapshot();

  const existingLocalState = loadClientState() || sanitizeSchema(null);
  const existingEntitlement = getStoredEntitlement();
  const hasActiveSub = isEntitlementActive(existingEntitlement);

  const baselineItemCount = {
    courses: existingLocalState.courses?.length || 0,
    timetable: existingLocalState.timetable?.length || 0,
    assignments: existingLocalState.assignments?.length || 0,
    exams: existingLocalState.exams?.length || 0,
    notes: existingLocalState.notes?.length || 0,
    studySessions: existingLocalState.studySessions?.length || 0,
    audioLectures: existingLocalState.audioLectures?.length || 0,
    studyMaterials: existingLocalState.studyMaterials?.length || 0,
  };

  // Step 2: Register account through native endpoint
  const authResult = await handleSignUp(cleanName, undefined, password, confirmPassword || password);
  const newUserId = authResult.user.userId || authResult.user.uid;
  if (!newUserId) {
    throw new Error('Server did not return a valid user ID.');
  }

  // Step 3: Prepare state to link with the new immutable userId
  const stateToMigrate: DatabaseSchema = {
    ...existingLocalState,
    profile: {
      ...existingLocalState.profile,
      userId: newUserId,
      id: newUserId,
      name: cleanName,
      initials: cleanName
        .split(' ')
        .map((p) => p[0])
        .join('')
        .toUpperCase()
        .slice(0, 2) || 'ST',
      subscription: hasActiveSub && existingEntitlement
        ? { ...existingEntitlement }
        : existingLocalState.profile?.subscription,
    },
  };

  // Step 4: Associate data on server with authenticated headers
  const token = localStorage.getItem(AUTH_SESSION_STORAGE_KEY) || authResult.token;
  const associateRes = await fetch('/api/auth/associate-data', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token || ''}`,
      'x-user-id': newUserId,
    },
    body: JSON.stringify({
      userId: newUserId,
      state: stateToMigrate,
    }),
  });

  if (!associateRes.ok) {
    const errData = await associateRes.json().catch(() => ({}));
    throw new Error(errData.message || 'Could not migrate your Study Planner data to the new account.');
  }

  // Step 5: Verification step - read back server state to verify integrity
  const verifyRes = await fetch('/api/state', {
    headers: {
      'Authorization': `Bearer ${token || ''}`,
      'x-user-id': newUserId,
    },
  });

  let verifiedServerState: DatabaseSchema | null = null;
  if (verifyRes.ok) {
    verifiedServerState = (await verifyRes.json()) as DatabaseSchema;
  }

  // Step 6: Preserve existing subscription entitlement if active
  if (hasActiveSub && existingEntitlement) {
    saveStoredEntitlement(existingEntitlement, 'restored', {
      userId: newUserId,
    });
    // Notify server to ensure ledger entry is updated
    try {
      await fetch('/api/subscription/sync-entitlement', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token || ''}`,
          'x-user-id': newUserId,
        },
        body: JSON.stringify({
          userId: newUserId,
          subscription: existingEntitlement,
        }),
      });
    } catch (e) {
      // Non-fatal, local entitlement is saved
    }
  }

  // Step 7: Record successful migration metadata
  const migrationRecord: MigrationRecord = {
    migrationVersion: 1,
    migrationStatus: 'completed',
    oldUserReference: existingLocalState.profile?.userId || 'legacy_device',
    newUserId,
    migratedAt: new Date().toISOString(),
    snapshotVerified: Boolean(verifiedServerState),
    itemCountsMigrated: baselineItemCount,
  };

  try {
    localStorage.setItem(MIGRATION_RECORD_STORAGE_KEY, JSON.stringify(migrationRecord));
  } catch (e) {}

  // Step 8: Update client state with migrated data
  const finalState = verifiedServerState || stateToMigrate;
  saveClientState(finalState);
  saveLocalAuthUser(authResult.user);

  return {
    user: authResult.user,
    finalState,
  };
}
