import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  User, 
  Lock, 
  Eye, 
  EyeOff, 
  ArrowRight, 
  Loader2, 
  AlertCircle, 
  GraduationCap, 
  CheckCircle2, 
  ShieldCheck,
  Sparkles,
  BookOpen,
  Calendar,
  FileText,
  RotateCcw,
  Crown
} from 'lucide-react';
import { 
  AuthUserProfile, 
  handleSignUp, 
  handleSignIn 
} from '../lib/emailAuth';
import { loadClientState } from '../lib/storage';
import { detectExistingUserData, executeAtomicMigration } from '../lib/migration';
import { useTranslation } from '../lib/i18n';

interface AuthScreenProps {
  onAuthSuccess: (user: AuthUserProfile, hasActiveSubscription?: boolean, subscription?: any) => void;
  initialMode?: 'protect' | 'signup' | 'login';
}

export default function AuthScreen({ 
  onAuthSuccess, 
  initialMode 
}: AuthScreenProps) {
  const { language } = useTranslation();
  const isFr = language === 'fr-FR';

  // Check if unmigrated data exists on this device
  const existingSummary = React.useMemo(() => {
    try {
      return detectExistingUserData();
    } catch (e) {
      return null;
    }
  }, []);

  const hasExistingData = Boolean(existingSummary?.hasExistingData);

  // Determine initial mode:
  // If unlinked data is detected and no initial mode forced, start with 'protect' screen.
  // Otherwise, default to 'signup'.
  const [mode, setMode] = useState<'protect' | 'signup' | 'login'>(() => {
    if (initialMode) return initialMode;
    return hasExistingData ? 'protect' : 'signup';
  });

  // Fields: Username, Password, Confirm Password (exactly as required)
  const [username, setUsername] = useState(existingSummary?.suggestedName || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [migrationStatusText, setMigrationStatusText] = useState<string | null>(null);

  const totalLocalItems = hasExistingData
    ? Object.values(existingSummary!.itemCounts).reduce((a, b) => a + b, 0)
    : 0;

  const switchMode = (newMode: 'protect' | 'signup' | 'login') => {
    setMode(newMode);
    setError(null);
    setSuccessMessage(null);
    setMigrationStatusText(null);
    setPassword('');
    setConfirmPassword('');
  };

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setError(null);
    setSuccessMessage(null);
    setMigrationStatusText(null);

    const cleanUsername = username.trim();

    if (!cleanUsername) {
      setError(isFr ? "Le nom d'utilisateur est requis." : 'Username is required.');
      return;
    }

    if (cleanUsername.length < 2) {
      setError(isFr ? "Le nom d'utilisateur doit contenir au moins 2 caractères." : 'Username must be at least 2 characters.');
      return;
    }

    if (!password) {
      setError(isFr ? 'Le mot de passe est obligatoire.' : 'Password is required.');
      return;
    }

    if (mode === 'signup') {
      if (password.length < 8) {
        setError(isFr ? 'Le mot de passe doit comporter au moins 8 caractères.' : 'Password must be at least 8 characters.');
        return;
      }
      if (!confirmPassword) {
        setError(isFr ? 'Veuillez confirmer votre mot de passe.' : 'Confirm Password is required.');
        return;
      }
      if (password !== confirmPassword) {
        setError(isFr ? 'Les mots de passe ne correspondent pas.' : 'Passwords do not match.');
        return;
      }
    }

    setIsLoading(true);

    try {
      if (mode === 'signup') {
        if (hasExistingData) {
          // Existing user creating account: Run atomic, verifiable zero-data-loss migration
          setMigrationStatusText(
            isFr 
              ? 'Migration sécurisée de vos données en cours...' 
              : 'Safely migrating and verifying your study data...'
          );

          const { user, finalState } = await executeAtomicMigration(cleanUsername, password, confirmPassword);
          
          setSuccessMessage(
            isFr 
              ? 'Compte créé et données migrées avec succès !' 
              : 'Account created and study data safely preserved!'
          );

          const hasActiveSub = finalState.profile?.subscription?.subscriptionStatus === 'premium' || 
            Boolean(existingSummary?.hasActiveSubscription);
          
          setTimeout(() => {
            onAuthSuccess(user, hasActiveSub, finalState.profile?.subscription);
          }, 350);
        } else {
          // Brand new user sign-up
          setMigrationStatusText(isFr ? 'Création de votre compte...' : 'Creating your account...');
          const result = await handleSignUp(cleanUsername, password, confirmPassword);
          setSuccessMessage(isFr ? 'Compte créé avec succès !' : 'Account created successfully!');
          setTimeout(() => {
            onAuthSuccess(result.user, result.hasActiveSubscription, result.subscription);
          }, 350);
        }
      } else {
        // Existing user logging in
        setMigrationStatusText(isFr ? 'Connexion en cours...' : 'Logging in...');
        const localState = hasExistingData ? loadClientState() : undefined;
        const result = await handleSignIn(cleanUsername, password, localState || undefined);
        setSuccessMessage(isFr ? 'Connexion réussie !' : 'Logged in successfully!');
        setTimeout(() => {
          onAuthSuccess(result.user, result.hasActiveSubscription, result.subscription);
        }, 350);
      }
    } catch (err: any) {
      console.warn('[AuthScreen] Notice:', err?.message || err);
      setError(
        err?.message || 
        (isFr ? 'Une erreur est survenue. Veuillez réessayer.' : 'An error occurred. Please try again.')
      );
    } finally {
      setIsLoading(false);
      setMigrationStatusText(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FAF8FC] via-[#F3EDF7] to-[#E8DEF8] flex flex-col justify-center items-center p-4 sm:p-6 md:p-8 text-slate-800 selection:bg-[#6750A4] selection:text-white" id="auth-screen">
      {/* Decorative Background Elements */}
      <div className="fixed top-10 left-10 w-72 h-72 bg-[#D0BCFF]/30 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed bottom-10 right-10 w-96 h-96 bg-[#EADDFF]/40 rounded-full blur-3xl pointer-events-none" />

      <motion.div 
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="w-full max-w-md relative z-10"
      >
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center p-3 bg-white rounded-2xl shadow-sm border border-slate-200/80 mb-3.5">
            <img 
              src={`${(import.meta.env.BASE_URL || '/').replace(/\/$/, '')}/logo.png`}
              alt="Study Planner Logo" 
              className="w-12 h-12 rounded-xl object-cover shadow-xs border border-slate-100 shrink-0" 
              referrerPolicy="no-referrer"
              onError={(e) => {
                const target = e.currentTarget;
                const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
                if (!target.dataset.triedFallback) {
                  target.dataset.triedFallback = '1';
                  target.src = `${base}/logo.jpg`;
                }
              }}
            />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1D1B20] tracking-tight">
            Study Planner
          </h1>
          <p className="text-xs sm:text-sm text-[#49454F] mt-1 font-medium">
            {isFr ? 'Votre espace de réussite académique' : 'Your Personal Academic Success Workspace'}
          </p>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* VIEW 1: PROTECT YOUR STUDY PLANNER (Existing Unlinked Data)   */}
        {/* ------------------------------------------------------------- */}
        {mode === 'protect' && (
          <div className="bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-xl shadow-slate-900/5" id="protect-study-planner-card">
            {/* Header Badge & Title */}
            <div className="text-center mb-5">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-[#ECE6F0] text-[#6750A4] flex items-center justify-center mb-3 shadow-xs">
                <ShieldCheck className="w-6 h-6 text-[#6750A4]" />
              </div>
              <h2 className="text-xl font-extrabold text-[#1D1B20] tracking-tight" id="protect-title">
                {isFr ? 'Protégez votre Study Planner' : 'Protect Your Study Planner'}
              </h2>
              <p className="text-xs sm:text-sm text-[#49454F] mt-2 leading-relaxed px-1 font-normal">
                {isFr 
                  ? 'Créez un compte ou connectez-vous pour continuer. Vos données d’étude existantes seront préservées et associées à votre compte.' 
                  : 'Create an account or log in to continue. Your existing study data will be preserved and linked to your account.'}
              </p>
            </div>

            {/* Preserved Data Breakdown Summary */}
            {existingSummary && (
              <div className="bg-[#F7F9FC] border border-slate-200 rounded-2xl p-4 mb-6 space-y-2.5">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                  <span>{isFr ? 'Données détectées sur cet appareil' : 'Detected study records to preserve'}</span>
                  <span className="text-[#6750A4] font-black">{totalLocalItems} items</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-700 pt-1">
                  {existingSummary.itemCounts.courses > 0 && (
                    <div className="flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-[#6750A4]" />
                      <span>{existingSummary.itemCounts.courses} {isFr ? 'Matières' : 'Subjects'}</span>
                    </div>
                  )}
                  {existingSummary.itemCounts.timetable > 0 && (
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-[#6750A4]" />
                      <span>{existingSummary.itemCounts.timetable} {isFr ? 'Créneaux' : 'Timetable periods'}</span>
                    </div>
                  )}
                  {(existingSummary.itemCounts.assignments > 0 || existingSummary.itemCounts.exams > 0) && (
                    <div className="flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-[#6750A4]" />
                      <span>{existingSummary.itemCounts.assignments + existingSummary.itemCounts.exams} {isFr ? 'Devoirs / Examens' : 'Tasks / Exams'}</span>
                    </div>
                  )}
                  {existingSummary.itemCounts.notes > 0 && (
                    <div className="flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-[#6750A4]" />
                      <span>{existingSummary.itemCounts.notes} {isFr ? 'Notes' : 'Notes & Materials'}</span>
                    </div>
                  )}
                  {existingSummary.hasActiveSubscription && (
                    <div className="flex items-center gap-1.5 col-span-2 text-amber-700 font-bold bg-amber-50 p-1.5 rounded-lg border border-amber-200">
                      <Crown className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>{isFr ? 'Abonnement Premium actif préservé' : 'Active Premium subscription preserved'}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Action Buttons: Create Account & Log In */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className="w-full py-3.5 px-4 bg-[#6750A4] hover:bg-[#503E84] active:scale-[0.99] text-white rounded-2xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-md shadow-[#6750A4]/20 cursor-pointer"
                id="protect-create-account-btn"
              >
                <span>{isFr ? 'Créer un compte' : 'Create Account'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => switchMode('login')}
                className="w-full py-3.5 px-4 bg-[#F3EDF7] hover:bg-[#EADDFF] active:scale-[0.99] text-[#21005D] rounded-2xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 border border-[#D0BCFF] cursor-pointer"
                id="protect-login-btn"
              >
                <span>{isFr ? 'Se connecter' : 'Log In'}</span>
              </button>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* VIEW 2: AUTHENTICATION FORMS (Create Account OR Log In)       */}
        {/* ------------------------------------------------------------- */}
        {(mode === 'signup' || mode === 'login') && (
          <div className="bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-xl shadow-slate-900/5">
            {/* Card Title & Header */}
            <div className="mb-5 pb-3 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-[#1D1B20] flex items-center gap-2">
                  {mode === 'signup' ? (
                    <>
                      <span>{isFr ? 'Créer un compte' : 'Create Account'}</span>
                      <Sparkles className="w-4 h-4 text-[#6750A4]" />
                    </>
                  ) : (
                    <>
                      <span>{isFr ? 'Connexion' : 'Log In'}</span>
                      <GraduationCap className="w-4 h-4 text-[#6750A4]" />
                    </>
                  )}
                </h2>
                <p className="text-xs text-[#49454F] mt-0.5">
                  {mode === 'signup' 
                    ? (isFr ? 'Créez votre compte pour accéder à Study Planner.' : 'Create your account to access Study Planner.') 
                    : (isFr ? 'Connectez-vous pour accéder à votre espace.' : 'Enter your credentials to access your planner.')}
                </p>
              </div>

              {/* Back to Protection choice if unmigrated data exists */}
              {hasExistingData && (
                <button
                  type="button"
                  onClick={() => switchMode('protect')}
                  className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer shrink-0"
                >
                  {isFr ? '← Retour' : '← Back'}
                </button>
              )}
            </div>

            {/* Existing Data Notice in Sign-up */}
            {hasExistingData && mode === 'signup' && (
              <div className="mb-4 p-3 bg-gradient-to-r from-[#F3EDF7] to-[#EADDFF] border border-[#D0BCFF] rounded-2xl flex items-start gap-2.5 shadow-xs">
                <ShieldCheck className="w-4 h-4 text-[#6750A4] shrink-0 mt-0.5" />
                <div className="text-[11px] leading-snug text-[#49454F]">
                  <strong className="text-[#1D1B20] block font-semibold">
                    {isFr ? 'Préservation des données garantie' : 'Zero Data Loss Migration'}
                  </strong>
                  <span>
                    {isFr 
                      ? `Vos ${totalLocalItems} éléments d'étude et votre statut seront automatiquement liés à ce nouveau compte.` 
                      : `Your ${totalLocalItems} existing study items and status will be preserved and linked to this account.`}
                  </span>
                </div>
              </div>
            )}

            {/* Error Alert with Retry button */}
            {error && (
              <motion.div 
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-2xl flex items-start gap-2.5" 
                id="auth-error-alert"
              >
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1 font-medium leading-relaxed break-words">{error}</div>
              </motion.div>
            )}

            {/* Success Alert */}
            {successMessage && !error && (
              <motion.div 
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-2xl flex items-center gap-2.5" 
                id="auth-success-alert"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <div className="flex-1 font-medium">{successMessage}</div>
              </motion.div>
            )}

            {/* Mandatory Auth Form: Exactly Username + Password (+ Confirm Password on signup) */}
            <form onSubmit={handleSubmit} className="space-y-4" id="mandatory-auth-form">
              {/* Field 1: Username */}
              <div className="space-y-1.5">
                <label 
                  htmlFor="auth-username-input" 
                  className="text-xs font-bold text-slate-700 block tracking-wide"
                >
                  {isFr ? "Nom d'utilisateur" : 'Username'}
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="auth-username-input"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={mode === 'signup' ? (isFr ? "Choisissez un nom d'utilisateur" : 'Choose a username') : (isFr ? "Votre nom d'utilisateur" : 'Enter your username')}
                    autoComplete="username"
                    required
                    disabled={isLoading}
                    className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50/80 hover:bg-slate-50 focus:bg-white border border-slate-200 focus:border-[#6750A4] rounded-2xl text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#6750A4]/20 transition-all shadow-inner/5"
                  />
                </div>
              </div>

              {/* Field 2: Password */}
              <div className="space-y-1.5">
                <label 
                  htmlFor="auth-password-input" 
                  className="text-xs font-bold text-slate-700 block tracking-wide"
                >
                  {isFr ? 'Mot de passe' : 'Password'}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="auth-password-input"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'signup' ? (isFr ? 'Minimum 8 caractères' : 'Minimum 8 characters') : (isFr ? 'Entrez votre mot de passe' : 'Enter your password')}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    minLength={mode === 'signup' ? 8 : 1}
                    required
                    disabled={isLoading}
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-50/80 hover:bg-slate-50 focus:bg-white border border-slate-200 focus:border-[#6750A4] rounded-2xl text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#6750A4]/20 transition-all shadow-inner/5"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1 rounded-lg"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Field 3: Confirm Password (Create Account only) */}
              {mode === 'signup' && (
                <div className="space-y-1.5">
                  <label 
                    htmlFor="auth-confirm-password-input" 
                    className="text-xs font-bold text-slate-700 block tracking-wide"
                  >
                    {isFr ? 'Confirmer le mot de passe' : 'Confirm Password'}
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="auth-confirm-password-input"
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder={isFr ? 'Retapez le mot de passe' : 'Confirm your password'}
                      autoComplete="new-password"
                      minLength={8}
                      required
                      disabled={isLoading}
                      className="w-full pl-10 pr-10 py-2.5 bg-slate-50/80 hover:bg-slate-50 focus:bg-white border border-slate-200 focus:border-[#6750A4] rounded-2xl text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#6750A4]/20 transition-all shadow-inner/5"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1 rounded-lg"
                      tabIndex={-1}
                      aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 px-4 bg-[#6750A4] hover:bg-[#503E84] active:scale-[0.99] text-white rounded-2xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-md shadow-[#6750A4]/20 disabled:opacity-50 cursor-pointer"
                  id={mode === 'signup' ? 'create-account-button' : 'login-button'}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{migrationStatusText || (mode === 'signup' ? (isFr ? 'Création...' : 'Creating Account...') : (isFr ? 'Connexion...' : 'Logging In...'))}</span>
                    </>
                  ) : (
                    <>
                      <span>{mode === 'signup' ? (isFr ? 'Créer un compte' : 'Create Account') : (isFr ? 'Se connecter' : 'Log In')}</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>

              {/* Mode Switch Links (Exactly as specified) */}
              <div className="text-center pt-2">
                {mode === 'signup' ? (
                  <button
                    type="button"
                    onClick={() => switchMode('login')}
                    className="text-xs text-[#49454F] hover:text-[#1D1B20] transition-colors cursor-pointer"
                    id="switch-to-login-link"
                  >
                    <span>{isFr ? 'Vous avez déjà un compte ? ' : 'Already have an account? '}</span>
                    <span className="font-bold text-[#6750A4] hover:underline">
                      {isFr ? 'Se connecter' : 'Log in'}
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => switchMode('signup')}
                    className="text-xs text-[#49454F] hover:text-[#1D1B20] transition-colors cursor-pointer"
                    id="switch-to-signup-link"
                  >
                    <span>{isFr ? 'Nouvel utilisateur ? ' : 'New user? '}</span>
                    <span className="font-bold text-[#6750A4] hover:underline">
                      {isFr ? 'Créer un compte' : 'Create an account'}
                    </span>
                  </button>
                )}
              </div>
            </form>
          </div>
        )}

        {/* Footer Branding */}
        <div className="text-center mt-6 text-[11px] text-[#49454F]/80">
          <p>{isFr ? 'Study Planner — Sécurisé, privé et sans publicité' : 'Study Planner — Secure, Private & Focused'}</p>
        </div>
      </motion.div>
    </div>
  );
}
