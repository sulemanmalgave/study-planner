import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, RotateCcw, ShieldCheck, Check, AlertCircle, Loader2, Sparkles, Receipt, HelpCircle, Mail } from 'lucide-react';
import { Subscription } from '../types';
import { modalBackdropVariants, modalPanelVariants } from '../lib/animations';
import { getStoredEntitlement, isEntitlementActive, saveStoredEntitlement } from '../lib/entitlement';
import { AuthUserProfile } from '../lib/firebase';
import EmailAuthCard from './EmailAuthCard';

interface RestoreSubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (restoredSubscription: Subscription) => void;
  authUser?: AuthUserProfile | null;
  onAuthSuccess?: (user: AuthUserProfile, hasActiveSubscription?: boolean, subscription?: any) => void;
  onSignOut?: () => void;
}

export default function RestoreSubscriptionModal({
  isOpen,
  onClose,
  onSuccess,
  authUser,
  onAuthSuccess,
  onSignOut,
}: RestoreSubscriptionModalProps) {
  const [identifier, setIdentifier] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Check account purchases if user is already signed in
  const handleAccountRestore = async () => {
    if (isLoading || !authUser) return;
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch('/api/subscription/account-status', {
        headers: {
          'x-user-id': authUser.uid,
          'x-user-email': authUser.email || '',
        },
      });

      const data = await res.json();
      if (res.ok && data.hasActiveSubscription && data.subscription) {
        saveStoredEntitlement(data.subscription, 'restored', {
          userId: authUser.uid,
          userEmail: authUser.email || undefined,
        });
        setSuccessMessage(`Restored active ${data.subscription.plan || 'Premium'} subscription linked to ${authUser.email}!`);
        onSuccess(data.subscription);
        setTimeout(() => {
          setIsLoading(false);
          onClose();
        }, 1200);
        return;
      }

      // Check restore endpoint with authenticated headers
      const restoreRes = await fetch('/api/subscription/restore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': authUser.uid,
          'x-user-email': authUser.email || '',
        },
        body: JSON.stringify({
          identifier: authUser.email || authUser.uid,
        }),
      });

      const restoreData = await restoreRes.json();
      if (restoreRes.ok && restoreData.success && restoreData.subscription) {
        saveStoredEntitlement(restoreData.subscription, 'restored', {
          userId: authUser.uid,
          userEmail: authUser.email || undefined,
        });
        setSuccessMessage(`Restored subscription linked to ${authUser.email}!`);
        onSuccess(restoreData.subscription);
        setTimeout(() => {
          setIsLoading(false);
          onClose();
        }, 1200);
        return;
      }

      setError(`No active Premium subscription found for ${authUser.email}. If you have your Razorpay/PayPal Payment ID, enter it below.`);
    } catch (err: any) {
      console.error('[Account Restore Error]', err);
      setError(err?.message || 'Unable to restore with account. Please try entering your Payment ID.');
    } finally {
      setIsLoading(false);
    }
  };

  // Check local device storage
  const handleDeviceCheck = () => {
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    setTimeout(() => {
      const stored = getStoredEntitlement();
      if (stored && isEntitlementActive(stored)) {
        setSuccessMessage(`Recovered active ${stored.plan || 'Premium'} subscription from device memory!`);
        onSuccess(stored);
        setTimeout(() => {
          setIsLoading(false);
          onClose();
        }, 1000);
      } else {
        setError('No active Premium entitlement found in this browser. Please sign in or enter your Payment ID.');
        setIsLoading(false);
      }
    }, 400);
  };

  // Restore via Transaction / Order ID
  const handleRestoreWithId = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) {
      setError('Please enter your Payment ID, Order ID, or Transaction ID.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (authUser?.uid) headers['x-user-id'] = authUser.uid;
      if (authUser?.email) headers['x-user-email'] = authUser.email;

      const res = await fetch('/api/subscription/restore', {
        method: 'POST',
        headers,
        body: JSON.stringify({ identifier: identifier.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Unable to restore subscription with this identifier.');
      }

      if (data.subscription) {
        saveStoredEntitlement(data.subscription, 'restored', {
          userId: authUser?.uid,
          userEmail: authUser?.email || undefined,
        });
        setSuccessMessage(data.message || 'Subscription successfully verified and restored!');
        onSuccess(data.subscription);
      }

      setTimeout(() => {
        setIsLoading(false);
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to restore subscription. Please verify your ID.');
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto" id="restore-subscription-modal">
          <motion.div
            variants={modalBackdropVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="fixed inset-0 bg-black/40 backdrop-blur-xs"
            onClick={onClose}
          />

          <motion.div
            variants={modalPanelVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="relative w-full max-w-md bg-white rounded-3xl p-6 border border-[#E1E3E1] shadow-2xl z-10 space-y-5"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#E1E3E1] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-[#F3EDF7] rounded-xl text-[#6750A4]">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-[#1D1B20] tracking-tight">Restore Premium Subscription</h3>
                  <p className="text-[11px] text-[#49454F]">Verify past purchase securely via email or receipt</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 text-[#49454F] hover:bg-[#F3EDF7] rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {successMessage && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{successMessage}</span>
              </div>
            )}

            {/* Email Account Verification & Restoration */}
            {authUser ? (
              <div className="p-4 bg-emerald-50/80 border border-emerald-200/90 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-950">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>Signed in as {authUser.email}</span>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full">
                    Verified
                  </span>
                </div>
                <button
                  onClick={handleAccountRestore}
                  disabled={isLoading}
                  type="button"
                  className="w-full py-2.5 bg-[#6750A4] hover:bg-[#523d8c] text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs disabled:opacity-50"
                  id="restore-with-account-btn"
                >
                  {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                  <span>Check Purchases for {authUser.email}</span>
                </button>
              </div>
            ) : (
              <EmailAuthCard
                authUser={authUser}
                title="Verify Email to Restore Purchases"
                onAuthSuccess={(user, hasActiveSubscription, sub) => {
                  if (onAuthSuccess) {
                    onAuthSuccess(user, hasActiveSubscription, sub);
                  }
                  if (hasActiveSubscription && sub) {
                    saveStoredEntitlement(sub, 'restored', {
                      userId: user.uid,
                      userEmail: user.email || undefined,
                    });
                    setSuccessMessage(`Restored active ${sub.plan || 'Premium'} subscription linked to ${user.email}!`);
                    onSuccess(sub);
                    setTimeout(() => {
                      onClose();
                    }, 1200);
                  } else {
                    handleAccountRestore();
                  }
                }}
                onSignOut={onSignOut}
              />
            )}

            {/* Device Quick Check Button */}
            <div className="p-4 bg-[#F7F9FC] border border-[#E1E3E1] rounded-2xl space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-[#1D1B20]">
                <ShieldCheck className="w-4 h-4 text-[#6750A4]" />
                <span>Quick Device Check</span>
              </div>
              <p className="text-[11px] text-[#49454F] leading-relaxed">
                If you previously purchased Premium on this browser or device, click below to automatically recover your entitlement.
              </p>
              <button
                onClick={handleDeviceCheck}
                disabled={isLoading}
                type="button"
                className="w-full py-2 bg-white hover:bg-slate-50 border border-[#E1E3E1] text-[#1D1B20] text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5 text-[#6750A4]" />}
                <span>Check Device Entitlement</span>
              </button>
            </div>

            <div className="relative flex items-center justify-center my-2">
              <div className="border-t border-[#E1E3E1] w-full" />
              <span className="bg-white px-3 text-[10px] text-[#79747E] uppercase font-bold tracking-wider absolute">
                OR
              </span>
            </div>

            {/* Restore with Receipt / Payment ID Form */}
            <form onSubmit={handleRestoreWithId} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-[#1D1B20] flex items-center gap-1.5">
                  <Receipt className="w-3.5 h-3.5 text-[#6750A4]" />
                  <span>Restore via Payment ID or Order ID</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. pay_Nabc12345 or sim_..."
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="w-full px-3 py-2 border border-[#E1E3E1] rounded-xl text-xs text-[#1D1B20] focus:outline-none focus:border-[#6750A4]"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading || !identifier.trim()}
                className="w-full py-2.5 bg-[#6750A4] hover:bg-[#523d8c] text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-xs disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>Restore with Payment ID</span>
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
