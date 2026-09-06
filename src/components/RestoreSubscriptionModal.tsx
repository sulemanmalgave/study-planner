import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, RotateCcw, ShieldCheck, Check, AlertCircle, Loader2, Sparkles, Receipt, HelpCircle, LogIn } from 'lucide-react';
import { Subscription } from '../types';
import { modalBackdropVariants, modalPanelVariants } from '../lib/animations';
import { getStoredEntitlement, isEntitlementActive, saveStoredEntitlement } from '../lib/entitlement';
import { AuthUserProfile } from '../lib/firebase';
import { triggerInteractiveGoogleLogin } from '../lib/googleAuth';
import { triggerInteractiveMicrosoftLogin } from '../lib/microsoftAuth';

interface RestoreSubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (restoredSubscription: Subscription) => void;
  authUser?: AuthUserProfile | null;
  onSignInWithMicrosoft?: () => Promise<AuthUserProfile>;
  onSignInWithGoogle?: () => Promise<AuthUserProfile>;
}

export default function RestoreSubscriptionModal({
  isOpen,
  onClose,
  onSuccess,
  authUser,
  onSignInWithMicrosoft,
  onSignInWithGoogle,
}: RestoreSubscriptionModalProps) {
  const [identifier, setIdentifier] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleAccountRestore = async () => {
    if (isLoading) return;
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      let activeUser = authUser;
      if (!activeUser) {
        if (onSignInWithMicrosoft) {
          activeUser = await onSignInWithMicrosoft();
        } else if (onSignInWithGoogle) {
          activeUser = await onSignInWithGoogle();
        } else {
          activeUser = await triggerInteractiveMicrosoftLogin(45000);
        }
      }

      if (!activeUser) {
        throw new Error('Please sign in with your account to restore purchases.');
      }

      const res = await fetch('/api/subscription/account-status', {
        headers: {
          'x-user-id': activeUser.uid,
          'x-user-email': activeUser.email || '',
        },
      });

      const data = await res.json();
      if (res.ok && data.hasActiveSubscription && data.subscription) {
        saveStoredEntitlement(data.subscription, 'restored');
        setSuccessMessage(`Restored active ${data.subscription.plan || 'Premium'} subscription linked to ${activeUser.email}!`);
        onSuccess(data.subscription);
        setTimeout(() => {
          setIsLoading(false);
          onClose();
        }, 1200);
        return;
      }

      // Check restore endpoint with email / uid
      const restoreRes = await fetch('/api/subscription/restore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': activeUser.uid,
          'x-user-email': activeUser.email || '',
        },
        body: JSON.stringify({
          identifier: activeUser.email || activeUser.uid,
        }),
      });

      const restoreData = await restoreRes.json();
      if (restoreRes.ok && restoreData.success && restoreData.subscription) {
        saveStoredEntitlement(restoreData.subscription, 'restored');
        setSuccessMessage(`Restored subscription linked to ${activeUser.email}!`);
        onSuccess(restoreData.subscription);
        setTimeout(() => {
          setIsLoading(false);
          onClose();
        }, 1200);
        return;
      }

      setError(`No active Premium subscription was found for account (${activeUser.email}). If you used a different payment ID, please enter it below.`);
    } catch (err: any) {
      console.error('[Account Restore Error]', err);
      const isCancelled = err?.code === 'auth/cancelled-popup-request' ||
                          err?.code === 'auth/popup-closed-by-user' ||
                          err?.message?.includes('cancelled-popup-request') ||
                          err?.message?.includes('popup-closed-by-user') ||
                          err?.message?.includes('cancelled or closed');
      if (isCancelled) {
        setError('Sign-in prompt was closed or cancelled. Click "Restore with Account" when ready.');
      } else {
        setError(err?.message || 'Unable to restore with account. Please try entering your Payment ID.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeviceCheck = async () => {
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const stored = getStoredEntitlement();
      if (stored && isEntitlementActive(stored)) {
        // We have an active local entitlement record. Let's sync to server
        const res = await fetch('/api/subscription/sync-entitlement', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: stored }),
        }).catch(() => null);

        saveStoredEntitlement(stored, 'restored');
        setSuccessMessage(`Verified active ${stored.plan || 'Premium'} subscription from device records.`);
        onSuccess(stored);
        setTimeout(() => {
          setIsLoading(false);
          onClose();
        }, 1200);
        return;
      }

      // Check if server ledger has an active record
      if (stored?.transactionId) {
        const response = await fetch('/api/subscription/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: stored.transactionId }),
        });
        const data = await response.json();
        if (response.ok && data.success && data.subscription) {
          saveStoredEntitlement(data.subscription, 'restored');
          setSuccessMessage(data.message || 'Subscription successfully restored!');
          onSuccess(data.subscription);
          setTimeout(() => {
            setIsLoading(false);
            onClose();
          }, 1200);
          return;
        }
      }

      setError('No active subscription found stored on this device. Please enter your Payment ID or Order ID below from your receipt.');
    } catch (e: any) {
      setError(e.message || 'Verification failed. Please enter your Payment ID below.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestoreWithId = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = identifier.trim();
    if (!trimmed) {
      setError('Please enter your Payment ID or Order ID.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch('/api/subscription/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: trimmed }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || data.error || 'Unable to locate a valid subscription for this ID.');
      }

      const subscription: Subscription = data.subscription;
      saveStoredEntitlement(subscription, 'restored');
      setSuccessMessage(data.message || 'Subscription restored successfully!');
      onSuccess(subscription);

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
                  <p className="text-[11px] text-[#49454F]">Verify past purchase securely via payment records</p>
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

            {/* Account Instant Restore */}
            <div className="p-4 bg-slate-50 border border-slate-200/90 rounded-2xl space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 21 21">
                    <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
                    <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
                    <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
                    <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
                  </svg>
                  <span>Restore via Account</span>
                </div>
                {authUser && (
                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full">
                    Signed in
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                {authUser 
                  ? `Check purchases linked to ${authUser.email}`
                  : 'If you purchased Premium while signed in, sign in to restore your access instantly.'}
              </p>
              <button
                onClick={handleAccountRestore}
                disabled={isLoading}
                type="button"
                className="w-full py-2.5 bg-[#2F2F2F] hover:bg-[#1B1B1B] text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs disabled:opacity-50"
                id="restore-with-account-btn"
              >
                {isLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                ) : (
                  <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 21 21">
                    <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
                    <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
                    <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
                    <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
                  </svg>
                )}
                <span>
                  {authUser ? `Check Purchases for ${authUser.email}` : 'Sign in with Microsoft to Restore'}
                </span>
              </button>
            </div>

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

            {/* Restore with ID Form */}
            <form onSubmit={handleRestoreWithId} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#1D1B20] flex items-center gap-1.5">
                  <Receipt className="w-3.5 h-3.5 text-[#6750A4]" />
                  <span>Payment / Transaction ID</span>
                </label>
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="e.g., pay_Qz123... or PayPal Order ID"
                  disabled={isLoading}
                  className="w-full px-3.5 py-2.5 text-xs text-[#1D1B20] bg-white border border-[#E1E3E1] rounded-xl focus:ring-1 focus:ring-[#6750A4] focus:border-[#6750A4] outline-none font-mono"
                />
                <div className="flex items-start gap-1 text-[10px] text-[#49454F] mt-1">
                  <HelpCircle className="w-3 h-3 text-[#79747E] shrink-0 mt-0.5" />
                  <span>
                    Found in your Razorpay or PayPal payment confirmation email receipt (e.g., <code>pay_...</code> or Order ID).
                  </span>
                </div>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isLoading}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-xs font-bold text-[#49454F] rounded-xl transition-all cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading || !identifier.trim()}
                  className="flex-1 py-2.5 bg-[#6750A4] hover:bg-[#503E84] text-xs font-bold text-white rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm disabled:opacity-50"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Verify &amp; Restore</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
