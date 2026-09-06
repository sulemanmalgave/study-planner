import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShieldCheck, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  Mail, 
  ArrowRight, 
  RefreshCw, 
  X 
} from 'lucide-react';
import { isEmailSignInLink, completeEmailSignIn, directEmailSignIn } from '../lib/emailAuth';
import { AuthUserProfile } from '../lib/firebase';

interface EmailLinkAuthHandlerProps {
  onAuthSuccess: (user: AuthUserProfile, hasActiveSubscription?: boolean, subscription?: any) => void;
  onRequestNewLink?: (email?: string) => void;
}

export default function EmailLinkAuthHandler({
  onAuthSuccess,
  onRequestNewLink,
}: EmailLinkAuthHandlerProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [needsEmailPrompt, setNeedsEmailPrompt] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isExpired, setIsExpired] = useState(false);
  const [successUser, setSuccessUser] = useState<AuthUserProfile | null>(null);

  useEffect(() => {
    // Check if the current URL has Firebase email link query params
    if (!isEmailSignInLink()) return;

    const storedEmail = typeof window !== 'undefined' ? window.localStorage.getItem('emailForSignIn') : null;

    if (storedEmail) {
      // Automatic completion on the same device/browser
      handleComplete(storedEmail);
    } else {
      // Cross-device sign-in detected: user clicked link on another browser or device
      setNeedsEmailPrompt(true);
    }
  }, []);

  const handleComplete = async (emailToVerify?: string) => {
    setIsProcessing(true);
    setError(null);
    setIsExpired(false);

    try {
      const result = await completeEmailSignIn(emailToVerify);
      setSuccessUser(result.user);
      setIsProcessing(false);
      setNeedsEmailPrompt(false);

      // Trigger success callback
      onAuthSuccess(result.user, result.hasActiveSubscription, result.subscription);

      // Dismiss handler after brief success indicator
      setTimeout(() => {
        setSuccessUser(null);
      }, 1500);
    } catch (err: any) {
      setIsProcessing(false);
      const code = err?.code || '';
      const msg = err?.message || '';

      if (code === 'auth/expired-action-code' || code === 'auth/invalid-action-code' || msg.includes('expired')) {
        setIsExpired(true);
        setError('This verification link has expired. Please request a new one.');
      } else if (code === 'EMAIL_REQUIRED') {
        setNeedsEmailPrompt(true);
      } else if (code === 'auth/operation-not-allowed' || msg.includes('operation-not-allowed')) {
        if (emailToVerify) {
          try {
            const fallback = await directEmailSignIn(emailToVerify);
            setSuccessUser(fallback.user);
            onAuthSuccess(fallback.user, fallback.hasActiveSubscription, fallback.subscription);
            setTimeout(() => {
              setSuccessUser(null);
            }, 1500);
            return;
          } catch (fallbackErr) {
            console.warn('[EmailLinkAuthHandler] Direct fallback notice:', fallbackErr);
          }
        }
        setError('Email link sign-in is not enabled in Firebase Console.');
      } else {
        console.warn('[EmailLinkAuthHandler] Sign-in notice:', msg || err);
        setError(msg || 'Failed to complete sign-in with email link.');
      }
    }
  };

  const handleManualEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = emailInput.trim().toLowerCase();
    if (!clean || !clean.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    handleComplete(clean);
  };

  const handleClose = () => {
    setNeedsEmailPrompt(false);
    setError(null);
    setIsExpired(false);
    setSuccessUser(null);
    // Clean URL
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('emailSignIn');
      url.searchParams.delete('apiKey');
      url.searchParams.delete('mode');
      url.searchParams.delete('oobCode');
      window.history.replaceState({}, document.title, url.pathname);
    } catch (e) {}
  };

  // Do not render anything if not an email sign in link and not actively showing prompt/error/success
  if (!isProcessing && !needsEmailPrompt && !error && !isExpired && !successUser) {
    return null;
  }

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md" 
        id="firebase-email-link-handler-modal"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative w-full max-w-md bg-white rounded-3xl p-6 border border-slate-100 shadow-2xl space-y-4 text-slate-800"
        >
          {/* Close button for non-processing states */}
          {!isProcessing && (
            <button
              onClick={handleClose}
              className="absolute top-5 right-5 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors cursor-pointer"
              id="close-email-link-handler-btn"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {/* STATE 1: Automatic Verifying in progress */}
          {isProcessing && (
            <div className="py-6 text-center space-y-3" id="email-link-verifying-state">
              <div className="w-12 h-12 mx-auto rounded-full bg-[#6750A4]/10 text-[#6750A4] flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-[#6750A4]" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                Verifying your sign-in link...
              </h3>
              <p className="text-xs text-slate-600 max-w-xs mx-auto">
                Securely completing your passwordless sign-in with Firebase Authentication.
              </p>
            </div>
          )}

          {/* STATE 2: Success state */}
          {successUser && !isProcessing && (
            <div className="py-6 text-center space-y-3" id="email-link-success-state">
              <div className="w-12 h-12 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7 text-emerald-600" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                Email verified successfully!
              </h3>
              <p className="text-xs text-slate-600">
                Welcome, <strong>{successUser.displayName || successUser.email}</strong>. Your workspace is ready.
              </p>
            </div>
          )}

          {/* STATE 3: Cross-device email confirmation prompt */}
          {needsEmailPrompt && !isProcessing && !isExpired && (
            <div className="space-y-4" id="email-link-cross-device-prompt">
              <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
                <div className="w-9 h-9 rounded-xl bg-[#6750A4]/10 text-[#6750A4] flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Confirm Your Email</h3>
                  <p className="text-[11px] text-slate-500">Cross-device authentication check</p>
                </div>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                To complete sign-in on this device, please enter the email address you used to request this link:
              </p>

              {error && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                  <div className="flex-1 leading-snug">{error}</div>
                </div>
              )}

              <form onSubmit={handleManualEmailSubmit} className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700 block">Email Address</label>
                  <div className="relative">
                    <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      placeholder="name@example.com"
                      required
                      autoFocus
                      className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:border-[#6750A4] focus:ring-1 focus:ring-[#6750A4]"
                      id="cross-device-email-input"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isProcessing}
                  className="w-full py-2.5 px-4 bg-[#6750A4] hover:bg-[#523e85] text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer"
                  id="submit-cross-device-email-btn"
                >
                  <span>Complete Sign-In</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          )}

          {/* STATE 4: Expired or Invalid link */}
          {isExpired && !isProcessing && (
            <div className="py-4 text-center space-y-4" id="email-link-expired-state">
              <div className="w-12 h-12 mx-auto rounded-full bg-amber-100 text-amber-600 flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  This verification link has expired.
                </h3>
                <p className="text-xs text-slate-600 mt-1 max-w-xs mx-auto">
                  For your security, sign-in links are only valid for a limited time. Please request a new one.
                </p>
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    handleClose();
                    if (onRequestNewLink) {
                      onRequestNewLink(emailInput);
                    }
                  }}
                  className="w-full py-2.5 px-4 bg-[#6750A4] hover:bg-[#523e85] text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer"
                  id="send-new-verification-email-btn"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Send new verification email</span>
                </button>

                <button
                  type="button"
                  onClick={handleClose}
                  className="w-full py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-medium cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
