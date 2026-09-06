import React, { useState, useEffect } from 'react';
import { 
  User, 
  Mail, 
  KeyRound, 
  Check, 
  ArrowRight, 
  Loader2, 
  RefreshCw, 
  LogOut, 
  ShieldCheck, 
  AlertCircle,
  Sparkles
} from 'lucide-react';
import { AuthUserProfile } from '../lib/firebase';
import { 
  sendEmailVerificationCode, 
  verifyEmailVerificationCode, 
  resendEmailVerificationCode,
  saveLocalAuthUser,
  clearLocalAuthUser
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
  const [mode, setMode] = useState<'signup' | 'signin'>('signup');
  const [step, setStep] = useState<'form' | 'verify'>('form');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [demoCode, setDemoCode] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [resendCountdown, setResendCountdown] = useState(0);

  // Countdown timer for resend
  useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = setTimeout(() => {
      setResendCountdown(c => c - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [resendCountdown]);

  // Handle Send Code (Form submission)
  const handleSendCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isLoading) return;
    setError(null);
    setStatusMessage(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }

    if (mode === 'signup' && !name.trim()) {
      setError('Please enter your name.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await sendEmailVerificationCode(cleanEmail, name, mode);
      setStep('verify');
      if (res.demoCode) {
        setDemoCode(res.demoCode);
      }
      setStatusMessage(`Verification code sent to ${cleanEmail}`);
      setResendCountdown(45);
    } catch (err: any) {
      setError(err.message || 'Failed to send verification code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Verify Code
  const handleVerifyCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isLoading) return;
    setError(null);
    setStatusMessage(null);

    const cleanCode = code.trim();
    if (!cleanCode || cleanCode.length < 6) {
      setError('Please enter the 6-digit verification code.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await verifyEmailVerificationCode(email.trim().toLowerCase(), cleanCode, name);
      if (res.success && res.user) {
        setStatusMessage('Email verified successfully!');
        onAuthSuccess(res.user, res.hasActiveSubscription, res.subscription);
      } else {
        throw new Error(res.message || 'Verification failed.');
      }
    } catch (err: any) {
      setError(err.message || 'Invalid or expired verification code.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Resend Code
  const handleResendCode = async () => {
    if (isResending || resendCountdown > 0) return;
    setError(null);
    setIsResending(true);
    try {
      const res = await resendEmailVerificationCode(email.trim().toLowerCase());
      if (res.demoCode) {
        setDemoCode(res.demoCode);
      }
      setStatusMessage('A new verification code has been sent.');
      setResendCountdown(45);
    } catch (err: any) {
      setError(err.message || 'Failed to resend code.');
    } finally {
      setIsResending(false);
    }
  };

  // Quick helper to fill demo code
  const handlePasteDemoCode = () => {
    if (demoCode) {
      setCode(demoCode);
      setError(null);
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
      {/* Title / Description */}
      <div className="flex items-start justify-between gap-2 border-b border-slate-200/70 pb-2.5">
        <div>
          <h4 className="text-xs font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-[#6750A4] shrink-0" />
            <span>
              {title || (mode === 'signup' ? 'Create your Study Planner account' : 'Sign in to Study Planner')}
            </span>
          </h4>
          <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
            {step === 'form' 
              ? (mode === 'signup' 
                  ? 'No passwords required. We verify your account with a quick 6-digit email code.'
                  : 'Enter your email address to receive your sign-in verification code.')
              : `We've sent a 6-digit verification code to ${email}.`}
          </p>
        </div>

        {step === 'verify' && (
          <button
            type="button"
            onClick={() => {
              setStep('form');
              setError(null);
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
        <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span className="flex-1">{error}</span>
        </div>
      )}

      {/* Success / Status Message */}
      {statusMessage && !error && (
        <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0 text-emerald-600" />
          <span className="flex-1">{statusMessage}</span>
        </div>
      )}

      {/* STEP 1: Name and Email Form */}
      {step === 'form' && (
        <form onSubmit={handleSendCode} className="space-y-3" id="email-auth-form">
          {mode === 'signup' && (
            <div className="space-y-1">
              <label htmlFor="auth-name-input" className="block text-[11px] font-bold text-slate-700">
                Name
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  id="auth-name-input"
                  type="text"
                  placeholder="Your full name (e.g. Alex Johnson)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isLoading}
                  required={mode === 'signup'}
                  className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#6750A4] focus:border-transparent transition-all placeholder:text-slate-400"
                />
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label htmlFor="auth-email-input" className="block text-[11px] font-bold text-slate-700">
              Email address
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Mail className="w-4 h-4" />
              </div>
              <input
                id="auth-email-input"
                type="email"
                placeholder="alex@university.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                required
                className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#6750A4] focus:border-transparent transition-all placeholder:text-slate-400"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 px-4 bg-[#6750A4] hover:bg-[#523d8c] active:bg-[#433173] text-white text-xs font-bold rounded-xl shadow-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            id="email-auth-continue-btn"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Sending code...</span>
              </>
            ) : (
              <>
                <span>Continue</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          {/* Toggle between Create Account & Sign In */}
          <div className="text-center pt-1">
            {mode === 'signup' ? (
              <p className="text-[11px] text-slate-600">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('signin');
                    setError(null);
                  }}
                  className="font-bold text-[#6750A4] hover:underline cursor-pointer"
                  id="switch-to-signin-btn"
                >
                  Sign in with email
                </button>
              </p>
            ) : (
              <p className="text-[11px] text-slate-600">
                New to Study Planner?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('signup');
                    setError(null);
                  }}
                  className="font-bold text-[#6750A4] hover:underline cursor-pointer"
                  id="switch-to-signup-btn"
                >
                  Create an account
                </button>
              </p>
            )}
          </div>
        </form>
      )}

      {/* STEP 2: Enter 6-digit Verification Code */}
      {step === 'verify' && (
        <form onSubmit={handleVerifyCode} className="space-y-3" id="email-verify-code-form">
          <div className="space-y-1.5">
            <label htmlFor="auth-code-input" className="block text-[11px] font-bold text-slate-700">
              6-Digit Verification Code
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <KeyRound className="w-4 h-4" />
              </div>
              <input
                id="auth-code-input"
                type="text"
                maxLength={6}
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                disabled={isLoading}
                autoFocus
                className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 font-mono tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-[#6750A4] focus:border-transparent transition-all placeholder:text-slate-300"
              />
            </div>
          </div>

          {/* Development / Preview Helper */}
          {demoCode && (
            <div 
              onClick={handlePasteDemoCode}
              className="p-2 bg-purple-50 hover:bg-purple-100/80 border border-purple-200 text-purple-900 rounded-xl text-[11px] flex items-center justify-between cursor-pointer transition-colors"
              title="Click to fill code automatically"
            >
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#6750A4]" />
                <span>Verification Code: <strong className="font-mono font-bold tracking-wider">{demoCode}</strong></span>
              </div>
              <span className="text-[10px] font-bold text-[#6750A4] underline">Auto-fill</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || code.length < 6}
            className="w-full py-2.5 px-4 bg-[#6750A4] hover:bg-[#523d8c] active:bg-[#433173] text-white text-xs font-bold rounded-xl shadow-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            id="email-auth-verify-btn"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Verifying...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>Verify &amp; Continue</span>
              </>
            )}
          </button>

          {/* Resend Code Options */}
          <div className="flex items-center justify-between text-[11px] px-1 pt-1 text-slate-600">
            <span>Didn't receive the code?</span>
            <button
              type="button"
              onClick={handleResendCode}
              disabled={isResending || resendCountdown > 0}
              className="font-bold text-[#6750A4] hover:underline disabled:opacity-50 disabled:no-underline cursor-pointer"
              id="resend-email-code-btn"
            >
              {resendCountdown > 0 ? `Resend code in ${resendCountdown}s` : 'Resend code'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
