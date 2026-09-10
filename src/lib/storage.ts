import { DatabaseSchema, UserProfile, Course, TimetablePeriod, Assignment, Exam, Note, StudySession, AudioLecture, StudyMaterial } from '../types';
import { getInitialClientState } from '../defaultState';
import { getStoredEntitlement, saveStoredEntitlement, reconcileSubscription, isEntitlementActive } from './entitlement';
import { db, isFirebaseConfigured } from './firebase';
import { doc, setDoc } from 'firebase/firestore';
import { getAuthHeaders } from './emailAuth';

export const PRIMARY_STORAGE_KEY = 'studyflow_db_state';
export const BACKUP_STORAGE_KEY = 'studyflow_db_state_backup';
export const UPDATED_AT_KEY = 'studyflow_db_state_updated_at';

/**
 * Checks whether a database schema contains any meaningful user-authored data
 * (as opposed to an empty, default-initialized state).
 */
export function hasMeaningfulData(state: DatabaseSchema | null | undefined): boolean {
  if (!state) return false;
  const courseCount = state.courses?.length || 0;
  const taskCount = state.assignments?.length || 0;
  const noteCount = state.notes?.length || 0;
  const examCount = state.exams?.length || 0;
  const timetableCount = state.timetable?.length || 0;
  const sessionCount = state.studySessions?.length || 0;
  const lectureCount = state.audioLectures?.length || 0;
  const materialCount = state.studyMaterials?.length || 0;

  if (
    courseCount +
    taskCount +
    noteCount +
    examCount +
    timetableCount +
    sessionCount +
    lectureCount +
    materialCount > 0
  ) {
    return true;
  }

  // Also consider non-default student profile names meaningful
  if (state.profile?.name && state.profile.name.trim() !== '' && state.profile.name.trim() !== 'Student') {
    return true;
  }
  if (state.profile?.email && state.profile.email.trim() !== '') {
    return true;
  }

  return false;
}

/**
 * Safely sanitizes a database schema to ensure all collection arrays are initialized.
 */
export function sanitizeSchema(state: any): DatabaseSchema {
  const fallback = getInitialClientState();
  if (!state || typeof state !== 'object') return fallback;

  return {
    profile: {
      name: state.profile?.name || fallback.profile.name,
      email: state.profile?.email || fallback.profile.email,
      initials: state.profile?.initials || fallback.profile.initials,
      photoURL: state.profile?.photoURL || null,
      subscription: state.profile?.subscription || fallback.profile.subscription,
      aiUsage: state.profile?.aiUsage || fallback.profile.aiUsage,
    },
    courses: Array.isArray(state.courses) ? state.courses : [],
    timetable: Array.isArray(state.timetable) ? state.timetable : [],
    assignments: Array.isArray(state.assignments) ? state.assignments : [],
    exams: Array.isArray(state.exams) ? state.exams : [],
    notes: Array.isArray(state.notes) ? state.notes : [],
    studySessions: Array.isArray(state.studySessions) ? state.studySessions : [],
    audioLectures: Array.isArray(state.audioLectures) ? state.audioLectures : [],
    studyMaterials: Array.isArray(state.studyMaterials) ? state.studyMaterials : [],
  };
}

/**
 * Loads the client database state synchronously from browser storage.
 * Evaluates both primary and backup storage keys to prevent data loss.
 */
export function loadClientState(): DatabaseSchema | null {
  if (typeof window === 'undefined') return null;

  const localEntitlement = getStoredEntitlement();

  // 1. Try primary storage key
  try {
    const rawPrimary = localStorage.getItem(PRIMARY_STORAGE_KEY);
    if (rawPrimary) {
      const parsed = JSON.parse(rawPrimary);
      const clean = sanitizeSchema(parsed);
      clean.profile.subscription = reconcileSubscription(clean.profile?.subscription, localEntitlement);
      return clean;
    }
  } catch (e) {
    console.warn('[Storage] Warning reading primary state from localStorage:', e);
  }

  // 2. Try backup storage key
  try {
    const rawBackup = localStorage.getItem(BACKUP_STORAGE_KEY);
    if (rawBackup) {
      const parsed = JSON.parse(rawBackup);
      const clean = sanitizeSchema(parsed);
      clean.profile.subscription = reconcileSubscription(clean.profile?.subscription, localEntitlement);
      // Restore primary key from backup
      try {
        localStorage.setItem(PRIMARY_STORAGE_KEY, JSON.stringify(clean));
      } catch (err) {}
      return clean;
    }
  } catch (e) {
    console.warn('[Storage] Warning reading backup state from localStorage:', e);
  }

  return null;
}

/**
 * Persists the client database state to durable browser storage (Primary + Backup).
 * Always protects and preserves active subscription entitlement.
 */
export function saveClientState(state: DatabaseSchema): void {
  if (typeof window === 'undefined' || !state) return;

  const clean = sanitizeSchema(state);
  const localEntitlement = getStoredEntitlement();
  clean.profile.subscription = reconcileSubscription(clean.profile?.subscription, localEntitlement);

  const jsonStr = JSON.stringify(clean);

  // 1. Primary local storage write
  try {
    localStorage.setItem(PRIMARY_STORAGE_KEY, jsonStr);
  } catch (e) {
    console.warn('[Storage] Failed to save primary state to localStorage:', e);
  }

  // 2. Secondary redundant backup write
  try {
    localStorage.setItem(BACKUP_STORAGE_KEY, jsonStr);
    localStorage.setItem(UPDATED_AT_KEY, new Date().toISOString());
  } catch (e) {
    console.warn('[Storage] Failed to save backup state to localStorage:', e);
  }

  // 3. Dedicated entitlement ledger persistence
  if (clean.profile?.subscription) {
    try {
      saveStoredEntitlement(clean.profile.subscription);
    } catch (e) {
      console.warn('[Storage] Failed to save entitlement:', e);
    }
  }

  // 4. Firestore persistence if configured
  if (isFirebaseConfigured && db) {
    try {
      const authUserId = clean.profile?.email ? clean.profile.email.replace(/[^a-zA-Z0-9_-]/g, '_') : 'default';
      setDoc(doc(db, 'workspaces', authUserId), clean, { merge: true }).catch((err) => {
        console.warn('[Firestore] Non-blocking background save notice:', err);
      });
    } catch (fErr) {
      // Non-blocking
    }
  }
}

/**
 * Performs a comprehensive, non-destructive union merge between two database states.
 * Guarantees that neither local nor remote records are discarded.
 */
export function mergeDatabaseStates(
  local: DatabaseSchema | null | undefined,
  remote: DatabaseSchema | null | undefined
): DatabaseSchema {
  if (!local && !remote) return getInitialClientState();
  if (!local) return sanitizeSchema(remote);
  if (!remote) return sanitizeSchema(local);

  const cleanLocal = sanitizeSchema(local);
  const cleanRemote = sanitizeSchema(remote);
  const localEntitlement = getStoredEntitlement();

  // 1. Profile Merge
  const profileName = (cleanLocal.profile?.name && cleanLocal.profile.name !== 'Student')
    ? cleanLocal.profile.name
    : (cleanRemote.profile?.name || 'Student');

  const profileEmail = cleanLocal.profile?.email || cleanRemote.profile?.email || '';
  const profileInitials = cleanLocal.profile?.initials || cleanRemote.profile?.initials || 'ST';

  // Subscription entitlement: strictly preserve any active subscription
  let sub = cleanLocal.profile?.subscription;
  if (!isEntitlementActive(sub) && isEntitlementActive(cleanRemote.profile?.subscription)) {
    sub = cleanRemote.profile.subscription;
  }
  sub = reconcileSubscription(sub, localEntitlement);

  // 2. Courses (Union by id)
  const courseMap = new Map<string, Course>();
  cleanRemote.courses.forEach((c) => {
    if (c && c.id) courseMap.set(c.id, c);
  });
  cleanLocal.courses.forEach((c) => {
    if (c && c.id) {
      if (!courseMap.has(c.id)) {
        courseMap.set(c.id, c);
      } else {
        courseMap.set(c.id, { ...courseMap.get(c.id)!, ...c });
      }
    }
  });

  // 3. Timetable (Union by id)
  const timetableMap = new Map<string, TimetablePeriod>();
  cleanRemote.timetable.forEach((t) => {
    if (t && t.id) timetableMap.set(t.id, t);
  });
  cleanLocal.timetable.forEach((t) => {
    if (t && t.id) {
      if (!timetableMap.has(t.id)) {
        timetableMap.set(t.id, t);
      } else {
        timetableMap.set(t.id, { ...timetableMap.get(t.id)!, ...t });
      }
    }
  });

  // 4. Assignments / Tasks (Union by id)
  const assignmentMap = new Map<string, Assignment>();
  cleanRemote.assignments.forEach((a) => {
    if (a && a.id) assignmentMap.set(a.id, a);
  });
  cleanLocal.assignments.forEach((a) => {
    if (a && a.id) {
      if (!assignmentMap.has(a.id)) {
        assignmentMap.set(a.id, a);
      } else {
        // Merge fields, local overrides status if changed
        assignmentMap.set(a.id, { ...assignmentMap.get(a.id)!, ...a });
      }
    }
  });

  // 5. Exams (Union by id)
  const examMap = new Map<string, Exam>();
  cleanRemote.exams.forEach((e) => {
    if (e && e.id) examMap.set(e.id, e);
  });
  cleanLocal.exams.forEach((e) => {
    if (e && e.id) {
      if (!examMap.has(e.id)) {
        examMap.set(e.id, e);
      } else {
        examMap.set(e.id, { ...examMap.get(e.id)!, ...e });
      }
    }
  });

  // 6. Notes (Union by id, preserving latest updatedAt)
  const notesMap = new Map<string, Note>();
  cleanRemote.notes.forEach((n) => {
    if (n && n.id) notesMap.set(n.id, n);
  });
  cleanLocal.notes.forEach((n) => {
    if (n && n.id) {
      const existing = notesMap.get(n.id);
      if (!existing) {
        notesMap.set(n.id, n);
      } else {
        const existingTs = new Date(existing.updatedAt || 0).getTime();
        const localTs = new Date(n.updatedAt || 0).getTime();
        notesMap.set(n.id, localTs >= existingTs ? { ...existing, ...n } : { ...n, ...existing });
      }
    }
  });

  // 7. Study Sessions (Union by id)
  const sessionMap = new Map<string, StudySession>();
  cleanRemote.studySessions.forEach((s) => {
    if (s && s.id) sessionMap.set(s.id, s);
  });
  cleanLocal.studySessions.forEach((s) => {
    if (s && s.id && !sessionMap.has(s.id)) {
      sessionMap.set(s.id, s);
    }
  });

  // 8. Audio Lectures (Union by id)
  const audioMap = new Map<string, AudioLecture>();
  cleanRemote.audioLectures.forEach((al) => {
    if (al && al.id) audioMap.set(al.id, al);
  });
  cleanLocal.audioLectures.forEach((al) => {
    if (al && al.id) {
      if (!audioMap.has(al.id)) {
        audioMap.set(al.id, al);
      } else {
        audioMap.set(al.id, { ...audioMap.get(al.id)!, ...al });
      }
    }
  });

  // 9. Study Materials (Union by id)
  const materialsMap = new Map<string, StudyMaterial>();
  cleanRemote.studyMaterials.forEach((sm) => {
    if (sm && sm.id) materialsMap.set(sm.id, sm);
  });
  cleanLocal.studyMaterials.forEach((sm) => {
    if (sm && sm.id) {
      if (!materialsMap.has(sm.id)) {
        materialsMap.set(sm.id, sm);
      } else {
        materialsMap.set(sm.id, { ...materialsMap.get(sm.id)!, ...sm });
      }
    }
  });

  return {
    profile: {
      ...cleanRemote.profile,
      ...cleanLocal.profile,
      name: profileName,
      email: profileEmail,
      initials: profileInitials,
      subscription: sub,
    },
    courses: Array.from(courseMap.values()),
    timetable: Array.from(timetableMap.values()),
    assignments: Array.from(assignmentMap.values()),
    exams: Array.from(examMap.values()),
    notes: Array.from(notesMap.values()),
    studySessions: Array.from(sessionMap.values()),
    audioLectures: Array.from(audioMap.values()),
    studyMaterials: Array.from(materialsMap.values()),
  };
}

/**
 * Synchronizes client workspace state with the server.
 * Uses a non-destructive merge to guarantee that neither client nor server data is destroyed.
 */
export async function syncStateWithServer(state: DatabaseSchema): Promise<DatabaseSchema> {
  try {
    const authHeaders = getAuthHeaders();
    const res = await fetch('/api/state/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({ state }),
    });

    if (res.ok) {
      const serverState = (await res.json()) as DatabaseSchema;
      const merged = mergeDatabaseStates(state, serverState);
      saveClientState(merged);
      return merged;
    }
  } catch (err) {
    console.warn('[Sync] Non-fatal background sync warning:', err);
  }

  // Return saved client state if server is temporarily unreachable
  saveClientState(state);
  return state;
}
