import React, { useState, useEffect } from 'react';
import { 
  User, 
  Mail, 
  Check, 
  ArrowRight, 
  Loader2, 
  RefreshCw, 
  LogOut, 
  ShieldCheck, 
  AlertCircle,
  Sparkles,
  Inbox
} from 'lucide-react';
import { AuthUserProfile, signInWithGoogle } from '../lib/firebase';
import { 
  sendEmailSignInLink,
  clearLocalAuthUser,
  syncFirebaseUserWithBackend
} from '../lib/emailAuth';

interface EmailAuthCardProps {
  authUser?: AuthUserProfile | null;
  onAuthSuccess: (user: AuthUserProfile, hasActiveSubscription?: boolean, subscription?: any) => void;
  onSignOut?: () => void;
  title?: string;
  compact?: boolean;
}

export default function EmailAuthCard({
  authUser,
  onAuthSuccess,
  onSignOut,
  title,
  compact = false,
}: EmailAuthCardProps) {
  const [step, setStep] = useState<'form' | 'sent'>('form');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [resendCountdown, setResendCountdown] = useState(0);

  // Initialize stored inputs if user started typing previously
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedEmail = window.localStorage.getItem('emailForSignIn');
      const savedName = window.localStorage.getItem('nameForSignIn');
      if (savedEmail && !email) setEmail(savedEmail);
      if (savedName && !name) setName(savedName);
    }
  }, []);

  // Countdown timer for resend email
  useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = setTimeout(() => {
      setResendCountdown(c => c - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [resendCountdown]);

  // Handle Send Real Firebase Sign-In Link (with graceful direct fallback if provider disabled)
  const handleSendLink = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isLoading) return;
    setError(null);
    setStatusMessage(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      setError('Please enter a valid email address.');
      return;
    }

    if (!name.trim()) {
      setError('Please enter your name.');
      return;
    }

    setIsLoading(true);
    try {
      const result = await sendEmailSignInLink(cleanEmail, name.trim());
      if (result.status === 'direct_signed_in' && result.user) {
        setStatusMessage(`Welcome, ${result.user.displayName || result.user.email}!`);
        onAuthSuccess(result.user, result.hasActiveSubscription, result.subscription);
      } else {
        setStep('sent');
        setStatusMessage(`We sent a secure sign-in link to ${cleanEmail}`);
        setResendCountdown(30);
      }
    } catch (err: any) {
      console.warn('[EmailAuthCard] Sign-in notice:', err?.message || err);
      setError(err?.message || 'Failed to complete sign-in. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Resend Email
  const handleResendLink = async () => {
    if (isResending || resendCountdown > 0) return;
    setError(null);
    setIsResending(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const result = await sendEmailSignInLink(cleanEmail, name.trim());
      if (result.status === 'direct_signed_in' && result.user) {
        setStatusMessage(`Welcome, ${result.user.displayName || result.user.email}!`);
        onAuthSuccess(result.user, result.hasActiveSubscription, result.subscription);
      } else {
        setStatusMessage(`A new sign-in link has been sent to ${cleanEmail}.`);
        setResendCountdown(30);
      }
    } catch (err: any) {
      console.warn('[EmailAuthCard] Resend notice:', err?.message || err);
      setError(err?.message || 'Failed to resend sign-in email.');
    } finally {
      setIsResending(false);
    }
  };

  // Handle Google One-Click Sign In
  const handleGoogleSignIn = async () => {
    if (isGoogleLoading || isLoading) return;
    setError(null);
    setIsGoogleLoading(true);
    try {
      const gUser = await signInWithGoogle();
      const syncResult = await syncFirebaseUserWithBackend(gUser);
      setStatusMessage(`Welcome, ${syncResult.user.displayName || syncResult.user.email}!`);
      onAuthSuccess(syncResult.user, syncResult.hasActiveSubscription, syncResult.subscription);
    } catch (err: any) {
      console.warn('[Google Auth] Sign-in notice:', err?.message || err);
      setError(err?.message || 'Google sign-in could not be completed.');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  // If user is already authenticated and verified
  if (authUser) {
    return (
      <div 
        className="p-3.5 bg-emerald-50/80 border border-emerald-200/90 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs"
        id="authenticated-email-account-card"
      >
        <div className="flex items-center gap-3 min-w-0">
          {authUser.photoURL ? (
            <img 
              src={authUser.photoURL} 
              alt={authUser.displayName || 'User'} 
              className="w-9 h-9 rounded-full border border-emerald-300 shadow-xs shrink-0 object-cover" 
              referrerPolicy="no-referrer" 
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-[#6750A4] text-white font-bold text-xs flex items-center justify-center shadow-xs shrink-0">
              {(authUser.displayName || authUser.email || 'U')[0].toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="font-bold text-slate-900 truncate flex items-center gap-1.5">
              <span>{authUser.displayName || 'Study Planner User'}</span>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100/90 px-2 py-0.5 rounded-full">
                <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                Verified Account
              </span>
            </div>
            <div className="text-[11px] text-slate-600 truncate mt-0.5">{authUser.email}</div>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5">ID: {authUser.uid}</div>
          </div>
        </div>

        {onSignOut && (
          <button
            type="button"
            onClick={() => {
              clearLocalAuthUser();
              onSignOut();
            }}
            className="px-3 py-1.5 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs shrink-0 self-end sm:self-auto"
            id="signout-email-account-btn"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-4 space-y-3.5" id="email-account-auth-container">
      {/* Title / Header */}
      <div className="flex items-start justify-between gap-2 border-b border-slate-200/70 pb-2.5">
        <div>
          <h4 className="text-xs font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-[#6750A4] shrink-0" />
            <span>
              {step === 'sent' 
                ? 'Check your email' 
                : (title || 'Create your Study Planner account')}
            </span>
          </h4>
          <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
            {step === 'sent'
              ? 'We sent a secure sign-in link to your email.'
              : 'Enter your name and email to receive a passwordless sign-in link.'}
          </p>
        </div>

        {step === 'sent' && (
          <button
            type="button"
            onClick={() => {
              setStep('form');
              setError(null);
              setStatusMessage(null);
            }}
            className="text-[11px] font-bold text-[#6750A4] hover:underline cursor-pointer shrink-0"
            id="change-email-btn"
          >
            Change email
          </button>
        )}
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-start gap-2" id="email-auth-error-alert">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
          <div className="flex-1 leading-snug break-words">{error}</div>
        </div>
      )}

      {/* Status Message */}
      {statusMessage && !error && (
        <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2" id="email-auth-status-alert">
          <Check className="w-4 h-4 shrink-0 text-emerald-600" />
          <div className="flex-1 font-medium">{statusMessage}</div>
        </div>
      )}

      {/* STEP 1: Name and Email Form */}
      {step === 'form' && (
        <form onSubmit={handleSendLink} className="space-y-3" id="email-signup-form">
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-700 block">Name</label>
            <div className="relative">
              <User className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
                required
                className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-[#6750A4] focus:ring-1 focus:ring-[#6750A4]"
                id="email-auth-name-input"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-700 block">Email</label>
            <div className="relative">
              <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                required
                className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-[#6750A4] focus:ring-1 focus:ring-[#6750A4]"
                id="email-auth-email-input"
              />
            </div>
          </div>

          <div className="pt-1">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 bg-[#6750A4] hover:bg-[#523e85] active:scale-[0.99] text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-xs disabled:opacity-50 cursor-pointer"
              id="send-email-link-btn"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Sending secure link...</span>
                </>
              ) : (
                <>
                  <span>Continue</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>

          <div className="relative flex items-center justify-center my-1.5">
            <div className="border-t border-slate-200 w-full" />
            <span className="bg-slate-50 px-2 text-[10px] uppercase tracking-wider text-slate-400 font-semibold absolute">
              or
            </span>
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isGoogleLoading || isLoading}
            className="w-full py-2 px-3 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 transition-all flex items-center justify-center gap-2 shadow-2xs cursor-pointer disabled:opacity-50"
            id="google-signin-btn"
          >
            {isGoogleLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-600" />
            ) : (
              <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
            )}
            <span>Continue with Google</span>
          </button>

          <p className="text-[10px] text-slate-500 text-center leading-relaxed">
            By continuing, you agree to our Terms of Service &amp; Privacy Policy. A secure, passwordless authentication link will be sent to your email.
          </p>
        </form>
      )}

      {/* STEP 2: Email Sent Confirmation View */}
      {step === 'sent' && (
        <div className="space-y-3.5" id="email-link-sent-container">
          <div className="p-3.5 bg-white border border-slate-200/80 rounded-xl space-y-2 text-center">
            <div className="w-10 h-10 mx-auto rounded-full bg-[#6750A4]/10 text-[#6750A4] flex items-center justify-center">
              <Inbox className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-800">
                Sign-in link sent to:
              </p>
              <p className="text-xs font-bold text-[#6750A4] break-all mt-0.5">
                {email}
              </p>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed pt-1">
              Open your email on this device or click the link in the message to instantly sign in to your account.
            </p>
          </div>

          {/* Action buttons: Change email & Resend email */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setStep('form');
                setError(null);
                setStatusMessage(null);
              }}
              className="flex-1 py-2 px-3 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer text-center"
              id="back-to-change-email-btn"
            >
              Change email
            </button>

            <button
              type="button"
              onClick={handleResendLink}
              disabled={isResending || resendCountdown > 0}
              className="flex-1 py-2 px-3 bg-white hover:bg-slate-100 disabled:opacity-50 text-[#6750A4] border border-[#6750A4]/30 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer text-center"
              id="resend-email-link-btn"
            >
              {isResending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className={`w-3.5 h-3.5 ${resendCountdown > 0 ? 'text-slate-400' : ''}`} />
              )}
              <span>
                {resendCountdown > 0 ? `Resend email (${resendCountdown}s)` : 'Resend email'}
              </span>
            </button>
          </div>

          <div className="text-[10px] text-slate-500 text-center leading-relaxed">
            Can't find the email? Check your spam or promotions folder.
          </div>
        </div>
      )}
    </div>
  );
}
