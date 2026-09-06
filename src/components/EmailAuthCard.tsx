import React, { useState } from 'react';
import { 
  User, 
  Mail, 
  Lock, 
  Eye, 
  EyeOff, 
  Check, 
  ArrowRight, 
  ArrowLeft,
  Loader2, 
  LogOut, 
  ShieldCheck, 
  AlertCircle,
  KeyRound
} from 'lucide-react';
import { 
  AuthUserProfile,
  handleSignUp,
  handleSignIn,
  handlePasswordReset,
  handleSignOut
} from '../lib/emailAuth';

interface EmailAuthCardProps {
  authUser?: AuthUserProfile | null;
  onAuthSuccess: (user: AuthUserProfile, hasActiveSubscription?: boolean, subscription?: any) => void;
  onSignOut?: () => void;
  title?: string;
  compact?: boolean;
}

type AuthMode = 'signup' | 'login' | 'forgot_password';

export default function EmailAuthCard({
  authUser,
  onAuthSuccess,
  onSignOut,
  title,
  compact = false,
}: EmailAuthCardProps) {
  const [mode, setMode] = useState<AuthMode>('signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Clear messages on mode switch
  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    setError(null);
    setSuccessMessage(null);
    setPassword('');
    setConfirmPassword('');
  };

  // 1. Sign Up Handler (NAME + EMAIL + PASSWORD)
  const onSubmitSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setError(null);
    setSuccessMessage(null);

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanName) {
      setError('Please enter your name.');
      return;
    }
    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match. Please verify your password.');
      return;
    }

    setIsLoading(true);
    try {
      const result = await handleSignUp(cleanName, cleanEmail, password, confirmPassword);
      setSuccessMessage('Account created successfully.');
      onAuthSuccess(result.user, result.hasActiveSubscription, result.subscription);
    } catch (err: any) {
      console.warn('[EmailAuthCard] Signup notice:', err?.message || err);
      setError(err?.message || 'Failed to create account. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Log In Handler (EMAIL + PASSWORD)
  const onSubmitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setError(null);
    setSuccessMessage(null);

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setIsLoading(true);
    try {
      const result = await handleSignIn(cleanEmail, password);
      setSuccessMessage('Logged in successfully.');
      onAuthSuccess(result.user, result.hasActiveSubscription, result.subscription);
    } catch (err: any) {
      console.warn('[EmailAuthCard] Login notice:', err?.message || err);
      setError(err?.message || 'Failed to log in. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  // 3. Forgot Password Handler
  const onSubmitForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setError(null);
    setSuccessMessage(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      setError('Please enter a valid email address.');
      return;
    }

    setIsLoading(true);
    try {
      await handlePasswordReset(cleanEmail);
      setSuccessMessage('If an account exists for this email, a password reset link has been sent.');
    } catch (err: any) {
      console.warn('[EmailAuthCard] Reset password notice:', err?.message || err);
      setError(err?.message || 'Failed to send password reset email.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Sign Out
  const onSignOutClick = async () => {
    await handleSignOut();
    if (onSignOut) {
      onSignOut();
    }
    switchMode('login');
  };

  // If user is already authenticated
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
                Active Account
              </span>
            </div>
            <div className="text-[11px] text-slate-600 truncate mt-0.5">{authUser.email}</div>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5">ID: {authUser.uid}</div>
          </div>
        </div>

        <button
          type="button"
          onClick={onSignOutClick}
          className="px-3 py-1.5 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs shrink-0 self-end sm:self-auto"
          id="signout-email-account-btn"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out</span>
        </button>
      </div>
    );
  }

  return (
    <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-4 space-y-3.5" id="email-account-auth-container">
      {/* Header Tabs / Nav */}
      <div className="flex items-center justify-between border-b border-slate-200/70 pb-2.5">
        <div>
          <h4 className="text-xs font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-[#6750A4] shrink-0" />
            <span>
              {mode === 'signup' && (title || 'Create your Study Planner account')}
              {mode === 'login' && 'Log in to your Study Planner account'}
              {mode === 'forgot_password' && 'Reset your password'}
            </span>
          </h4>
          <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
            {mode === 'signup' && 'Enter your details below to create your account immediately.'}
            {mode === 'login' && 'Sign in with your email and password to access your workspace.'}
            {mode === 'forgot_password' && 'Enter your account email to receive a password reset link.'}
          </p>
        </div>

        {/* Quick toggle between Sign Up and Log In */}
        {mode !== 'forgot_password' && (
          <div className="flex items-center bg-slate-200/60 p-0.5 rounded-lg text-[11px] font-bold">
            <button
              type="button"
              onClick={() => switchMode('signup')}
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                mode === 'signup' 
                  ? 'bg-white text-[#6750A4] shadow-xs' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              id="tab-create-account-btn"
            >
              Sign Up
            </button>
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                mode === 'login' 
                  ? 'bg-white text-[#6750A4] shadow-xs' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              id="tab-login-btn"
            >
              Log In
            </button>
          </div>
        )}
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-start gap-2" id="email-auth-error-alert">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
          <div className="flex-1 leading-snug break-words">{error}</div>
        </div>
      )}

      {/* Success Alert */}
      {successMessage && !error && (
        <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2" id="email-auth-status-alert">
          <Check className="w-4 h-4 shrink-0 text-emerald-600" />
          <div className="flex-1 font-medium">{successMessage}</div>
        </div>
      )}

      {/* ======================================================= */}
      {/* 1. SIGNUP FORM: Name + Email + Password + Confirm Pass  */}
      {/* ======================================================= */}
      {mode === 'signup' && (
        <form onSubmit={onSubmitSignUp} className="space-y-3" id="email-signup-form">
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

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-700 block">Password</label>
            <div className="relative">
              <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                minLength={6}
                required
                className="w-full pl-9 pr-9 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-[#6750A4] focus:ring-1 focus:ring-[#6750A4]"
                id="email-auth-password-input"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-700 block">Confirm Password</label>
            <div className="relative">
              <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                minLength={6}
                required
                className="w-full pl-9 pr-9 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-[#6750A4] focus:ring-1 focus:ring-[#6750A4]"
                id="email-auth-confirm-password-input"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                tabIndex={-1}
                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
              >
                {showConfirmPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div className="pt-1">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 bg-[#6750A4] hover:bg-[#523e85] active:scale-[0.99] text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-xs disabled:opacity-50 cursor-pointer"
              id="create-account-btn"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Creating account...</span>
                </>
              ) : (
                <>
                  <span>Create Account</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>

          <div className="text-center pt-1">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className="text-[11px] text-slate-600 hover:text-[#6750A4] font-medium cursor-pointer"
              id="switch-to-login-btn"
            >
              Already have an account? <span className="font-bold text-[#6750A4] underline">Log In</span>
            </button>
          </div>
        </form>
      )}

      {/* ======================================================= */}
      {/* 2. LOGIN FORM: Email + Password                         */}
      {/* ======================================================= */}
      {mode === 'login' && (
        <form onSubmit={onSubmitLogin} className="space-y-3" id="email-login-form">
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
                id="email-login-email-input"
              />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-slate-700 block">Password</label>
              <button
                type="button"
                onClick={() => switchMode('forgot_password')}
                className="text-[11px] font-medium text-[#6750A4] hover:underline cursor-pointer"
                id="forgot-password-link"
              >
                Forgot Password?
              </button>
            </div>
            <div className="relative">
              <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your account password"
                required
                className="w-full pl-9 pr-9 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-[#6750A4] focus:ring-1 focus:ring-[#6750A4]"
                id="email-login-password-input"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div className="pt-1">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 bg-[#6750A4] hover:bg-[#523e85] active:scale-[0.99] text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-xs disabled:opacity-50 cursor-pointer"
              id="login-account-btn"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Logging in...</span>
                </>
              ) : (
                <>
                  <span>Log In</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>

          <div className="text-center pt-1">
            <button
              type="button"
              onClick={() => switchMode('signup')}
              className="text-[11px] text-slate-600 hover:text-[#6750A4] font-medium cursor-pointer"
              id="switch-to-signup-btn"
            >
              Don't have an account? <span className="font-bold text-[#6750A4] underline">Create Account</span>
            </button>
          </div>
        </form>
      )}

      {/* ======================================================= */}
      {/* 3. FORGOT PASSWORD FORM: Email                          */}
      {/* ======================================================= */}
      {mode === 'forgot_password' && (
        <form onSubmit={onSubmitForgotPassword} className="space-y-3" id="email-forgot-password-form">
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
                id="email-reset-email-input"
              />
            </div>
          </div>

          <div className="pt-1">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 bg-[#6750A4] hover:bg-[#523e85] active:scale-[0.99] text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-xs disabled:opacity-50 cursor-pointer"
              id="send-reset-email-btn"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Sending reset email...</span>
                </>
              ) : (
                <>
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Send Reset Email</span>
                </>
              )}
            </button>
          </div>

          <div className="text-center pt-1">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className="text-[11px] text-[#6750A4] hover:underline font-bold inline-flex items-center gap-1 cursor-pointer"
              id="return-to-login-btn"
            >
              <ArrowLeft className="w-3 h-3" />
              <span>Return to Log In</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
