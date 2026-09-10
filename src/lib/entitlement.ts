import { Subscription } from '../types';

export const ENTITLEMENT_STORAGE_KEY = 'studyflow_premium_entitlement';
export const DB_STATE_STORAGE_KEY = 'studyflow_db_state';

export interface EntitlementRecord extends Subscription {
  lastVerifiedAt?: string;
  source?: 'payment' | 'restored' | 'cache' | 'server';
  userId?: string;
  userEmail?: string;
}

/**
 * Validates whether a given subscription/entitlement object is currently active and unexpired.
 */
export function isEntitlementActive(sub?: Subscription | null): boolean {
  if (!sub) return false;
  const isStatusPremium =
    sub.subscriptionStatus === 'premium' ||
    (sub as any).status === 'active' ||
    (sub as any).subscriptionStatus === 'active' ||
    sub.plan === 'premium' ||
    sub.plan === 'monthly' ||
    sub.plan === 'yearly' ||
    sub.plan === 'quarterly';

  if (!isStatusPremium) return false;

  if (sub.expiryDate) {
    const expiryTime = new Date(sub.expiryDate).getTime();
    if (!isNaN(expiryTime)) {
      return expiryTime > Date.now();
    }
  }

  return true;
}

/**
 * Retrieves the independent entitlement record from browser storage.
 * Performs backward-compatible, idempotent migration from legacy dbState if needed.
 */
export function getStoredEntitlement(): EntitlementRecord | null {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return null;
  }
  try {
    // 1. Check dedicated independent entitlement storage
    const stored = localStorage.getItem(ENTITLEMENT_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as EntitlementRecord;
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    }

    // 2. Migration fallback: Check legacy state in localStorage
    const legacyData = localStorage.getItem(DB_STATE_STORAGE_KEY);
    if (legacyData) {
      const parsedState = JSON.parse(legacyData);
      const legacySub = parsedState?.profile?.subscription;
      if (legacySub && isEntitlementActive(legacySub)) {
        const migrated: EntitlementRecord = {
          ...legacySub,
          source: 'cache',
          lastVerifiedAt: new Date().toISOString(),
        };
        // Idempotent migration write to dedicated store
        localStorage.setItem(ENTITLEMENT_STORAGE_KEY, JSON.stringify(migrated));
        return migrated;
      }
    }
  } catch (err) {
    console.warn('[Entitlement] Error reading stored entitlement:', err);
  }

  return null;
}

/**
 * Durably saves an independent entitlement record to dedicated storage
 * and keeps legacy dbState profile.subscription in sync.
 */
export function saveStoredEntitlement(
  subscription: Subscription,
  source: 'payment' | 'restored' | 'cache' | 'server' = 'cache',
  userDetails?: { userId?: string; userEmail?: string }
): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return;
  }
  try {
    const record: EntitlementRecord = {
      ...subscription,
      source,
      lastVerifiedAt: new Date().toISOString(),
      ...(userDetails?.userId ? { userId: userDetails.userId } : {}),
      ...(userDetails?.userEmail ? { userEmail: userDetails.userEmail } : {}),
    };

    localStorage.setItem(ENTITLEMENT_STORAGE_KEY, JSON.stringify(record));

    // Keep legacy dbState in sync if present in localStorage
    const currentDbStateRaw = localStorage.getItem(DB_STATE_STORAGE_KEY);
    if (currentDbStateRaw) {
      try {
        const currentDbState = JSON.parse(currentDbStateRaw);
        if (currentDbState && currentDbState.profile) {
          currentDbState.profile.subscription = { ...subscription };
          localStorage.setItem(DB_STATE_STORAGE_KEY, JSON.stringify(currentDbState));
        }
      } catch (e) {
        // Ignore JSON parse warning
      }
    }
  } catch (err) {
    console.warn('[Entitlement] Error saving stored entitlement:', err);
  }
}

/**
 * Merges loaded state with the active local entitlement.
 * GUARANTEE: Never allows an active, valid Premium subscription to be downgraded
 * or overwritten by a 'free' or empty server response.
 */
export function reconcileSubscription(
  incomingSub: Subscription | undefined,
  localEntitlement: EntitlementRecord | null
): Subscription {
  const isLocalActive = isEntitlementActive(localEntitlement);
  const isIncomingActive = isEntitlementActive(incomingSub);

  // If local entitlement is active and incoming is free or expired, PRESERVE local entitlement
  if (isLocalActive && !isIncomingActive && localEntitlement) {
    return { ...localEntitlement };
  }

  // If incoming has a newer active subscription, adopt it
  if (isIncomingActive && incomingSub) {
    return { ...incomingSub };
  }

  // If incoming exists, return it
  if (incomingSub) {
    return incomingSub;
  }

  // Fallback to local or default free
  if (localEntitlement) {
    return localEntitlement;
  }

  return {
    subscriptionStatus: 'free',
    plan: null,
    paymentGateway: null,
    transactionId: null,
    purchaseDate: null,
    expiryDate: null,
    billingCountry: 'US',
  };
}

/**
 * Asynchronously synchronizes the verified entitlement to the backend server
 * so server endpoints stay authoritatively informed.
 */
export async function syncEntitlementToBackend(
  entitlement: Subscription,
  userDetails?: { userId?: string; userEmail?: string }
): Promise<boolean> {
  if (!isEntitlementActive(entitlement)) return false;
  try {
    const res = await fetch('/api/subscription/sync-entitlement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        subscription: entitlement,
        userId: userDetails?.userId,
        userEmail: userDetails?.userEmail,
      }),
    });
    return res.ok;
  } catch (err) {
    // Silent fail in offline/degraded mode
    return false;
  }
}

/**
 * Checks the backend ledger for an active subscription associated with a Google user account.
 * Enables automatic restore across devices and after cache clearing.
 */
export async function fetchAccountEntitlementFromBackend(
  userId: string,
  userEmail?: string
): Promise<Subscription | null> {
  if (!userId && !userEmail) return null;
  try {
    const query = new URLSearchParams();
    if (userId) query.set('userId', userId);
    if (userEmail) query.set('userEmail', userEmail);

    const res = await fetch(`/api/subscription/account-status?${query.toString()}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.hasActiveSubscription && data.subscription) {
      return data.subscription as Subscription;
    }
    return null;
  } catch (err) {
    console.warn('[Entitlement] Error querying account status from backend:', err);
    return null;
  }
}
