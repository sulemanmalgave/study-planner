import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShieldCheck, 
  Lock, 
  User, 
  Eye, 
  EyeOff, 
  Check, 
  AlertCircle, 
  Loader2, 
  Sparkles, 
  Calendar, 
  BookOpen, 
  FileText, 
  Clock, 
  ArrowRight,
  Crown,
  X
} from 'lucide-react';
import { modalBackdropVariants, modalPanelVariants } from '../lib/animations';
import { useTranslation } from '../lib/i18n';
import { ExistingUserDataSummary, executeAtomicMigration } from '../lib/migration';
import { handleSignIn, AuthUserProfile } from '../lib/emailAuth';
import { DatabaseSchema } from '../types';

interface ProtectPlannerMigrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  dataSummary: ExistingUserDataSummary;
  onMigrationSuccess: (user: AuthUserProfile, migratedState: DatabaseSchema) => void;
}

export default function ProtectPlannerMigrationModal({
  isOpen,
  onClose,
  dataSummary,
  onMigrationSuccess,
}: ProtectPlannerMigrationModalProps) {
  const { language } = useTranslation();
  const isFrench = language === 'fr-FR';

  const [mode, setMode] = useState<'create' | 'login'>('create');
  const [name, setName] = useState(dataSummary.suggestedName || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const cleanName = name.trim();
    if (!cleanName) {
      setError(isFrench ? 'Veuillez saisir votre prénom ou nom.' : 'Please enter your name.');
      return;
    }

    if (!password) {
      setError(isFrench ? 'Le mot de passe est obligatoire.' : 'Password is required.');
      return;
    }

    if (mode === 'create') {
      if (password.length < 8) {
        setError(isFrench ? 'Le mot de passe doit comporter au moins 8 caractères.' : 'Password must be at least 8 characters.');
        return;
      }
      if (password !== confirmPassword) {
        setError(isFrench ? 'Les mots de passe ne correspondent pas.' : 'Passwords do not match. Please verify your password.');
        return;
      }
    }

    setIsLoading(true);

    try {
      if (mode === 'create') {
        // Atomic, idempotent migration
        const result = await executeAtomicMigration(cleanName, password, confirmPassword);
        setSuccessMessage(
          isFrench
            ? 'Vos données et votre compte Study Planner ont été sécurisés avec succès !'
            : 'Your Study Planner data and account have been securely linked!'
        );
        setTimeout(() => {
          setIsLoading(false);
          onMigrationSuccess(result.user, result.finalState);
          onClose();
        }, 1200);
      } else {
        // Log in to existing account
        const authResult = await handleSignIn(cleanName, password);
        setSuccessMessage(
          isFrench ? 'Connexion réussie !' : 'Logged in successfully!'
        );
        setTimeout(async () => {
          setIsLoading(false);
          // Fetch user state
          const res = await fetch('/api/state', {
            headers: {
              'Content-Type': 'application/json',
              'x-user-id': authResult.user.userId || authResult.user.uid,
            },
          });
          const state = res.ok ? ((await res.json()) as DatabaseSchema) : ({} as DatabaseSchema);
          onMigrationSuccess(authResult.user, state);
          onClose();
        }, 1000);
      }
    } catch (err: any) {
      setIsLoading(false);
      console.error('[Migration/Auth Exception]', err);
      const msg = err?.message || '';
      if (msg.includes('already exists') || msg.includes('déjà')) {
        setError(
          isFrench
            ? 'Un compte avec ce prénom existe déjà. Veuillez vous connecter ci-dessous ou choisir un autre prénom.'
            : 'An account with this name already exists. Please log in below or choose another name.'
        );
      } else {
        setError(
          isFrench
            ? "Nous n'avons pas encore pu déplacer vos données. Vos données existantes sont en sécurité. Veuillez réessayer."
            : "We couldn't finish moving your data yet. Your existing data is safe. Please try again."
        );
      }
    }
  };

  const totalItems =
    dataSummary.itemCounts.courses +
    dataSummary.itemCounts.timetable +
    dataSummary.itemCounts.assignments +
    dataSummary.itemCounts.exams +
    dataSummary.itemCounts.notes +
    dataSummary.itemCounts.studySessions;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto" id="protect-planner-modal">
          <motion.div
            variants={modalBackdropVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="fixed inset-0 bg-black/50 backdrop-blur-xs"
            onClick={onClose}
          />

          <motion.div
            variants={modalPanelVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="relative w-full max-w-lg bg-white rounded-3xl p-6 sm:p-7 border border-[#E1E3E1] shadow-2xl z-10 space-y-5 my-8 max-h-[90vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-start justify-between pb-3 border-b border-[#E1E3E1]">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-[#F3EDF7] rounded-2xl text-[#6750A4] shadow-xs">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-black text-[#1D1B20] tracking-tight">
                    {isFrench ? 'Protégez votre Study Planner' : 'Protect your Study Planner'}
                  </h2>
                  <p className="text-xs text-[#49454F] mt-0.5">
                    {isFrench
                      ? "Créez un compte pour sauvegarder en toute sécurité votre emploi du temps, vos notes, votre historique d'étude et votre accès Premium."
                      : 'Create an account to securely save your timetable, notes, study history and Premium access.'}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 text-[#49454F] hover:bg-[#F3EDF7] rounded-xl transition-colors cursor-pointer"
                title={isFrench ? 'Fermer' : 'Close'}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Preserved Data Badges */}
            {dataSummary.hasExistingData && (
              <div className="p-4 bg-[#F7F2FA] rounded-2xl border border-[#E8DEF8] space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[#6750A4] uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    {isFrench ? 'Données prêtes à être sécurisées' : 'Data Ready for Secure Backup'}
                  </span>
                  <span className="text-[11px] font-semibold text-[#49454F]">
                    {isFrench ? `${totalItems} éléments trouvés` : `${totalItems} items detected`}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 text-xs">
                  {dataSummary.itemCounts.courses > 0 && (
                    <div className="flex items-center gap-1.5 bg-white p-2 rounded-xl border border-[#E1E3E1] text-[#1D1B20]">
                      <BookOpen className="w-3.5 h-3.5 text-[#6750A4]" />
                      <span>{dataSummary.itemCounts.courses} {isFrench ? 'Matières' : 'Subjects'}</span>
                    </div>
                  )}
                  {dataSummary.itemCounts.timetable > 0 && (
                    <div className="flex items-center gap-1.5 bg-white p-2 rounded-xl border border-[#E1E3E1] text-[#1D1B20]">
                      <Calendar className="w-3.5 h-3.5 text-[#6750A4]" />
                      <span>{dataSummary.itemCounts.timetable} {isFrench ? 'Cours' : 'Classes'}</span>
                    </div>
                  )}
                  {dataSummary.itemCounts.notes > 0 && (
                    <div className="flex items-center gap-1.5 bg-white p-2 rounded-xl border border-[#E1E3E1] text-[#1D1B20]">
                      <FileText className="w-3.5 h-3.5 text-[#6750A4]" />
                      <span>{dataSummary.itemCounts.notes} Notes</span>
                    </div>
                  )}
                  {dataSummary.itemCounts.assignments > 0 && (
                    <div className="flex items-center gap-1.5 bg-white p-2 rounded-xl border border-[#E1E3E1] text-[#1D1B20]">
                      <Check className="w-3.5 h-3.5 text-[#6750A4]" />
                      <span>{dataSummary.itemCounts.assignments} {isFrench ? 'Devoirs' : 'Tasks'}</span>
                    </div>
                  )}
                  {dataSummary.itemCounts.exams > 0 && (
                    <div className="flex items-center gap-1.5 bg-white p-2 rounded-xl border border-[#E1E3E1] text-[#1D1B20]">
                      <Clock className="w-3.5 h-3.5 text-[#6750A4]" />
                      <span>{dataSummary.itemCounts.exams} Examens</span>
                    </div>
                  )}
                  {dataSummary.hasActiveSubscription && (
                    <div className="flex items-center gap-1.5 bg-amber-50 p-2 rounded-xl border border-amber-200 text-amber-900 font-bold col-span-2 sm:col-span-1">
                      <Crown className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span className="truncate">Premium {dataSummary.subscription?.plan || ''}</span>
                    </div>
                  )}
                </div>

                <p className="text-[11px] text-[#49454F] pt-1">
                  {isFrench
                    ? 'Vos données existantes sont en sécurité. Rien ne sera supprimé.'
                    : 'Your existing data is completely safe. Nothing will be deleted.'}
                </p>
              </div>
            )}

            {/* Mode Switch Tabs */}
            <div className="flex bg-[#F3EDF7] p-1 rounded-xl">
              <button
                type="button"
                onClick={() => { setMode('create'); setError(null); }}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                  mode === 'create'
                    ? 'bg-white text-[#6750A4] shadow-xs'
                    : 'text-[#49454F] hover:text-[#1D1B20]'
                }`}
              >
                {isFrench ? 'Créer un compte' : 'Create Account'}
              </button>
              <button
                type="button"
                onClick={() => { setMode('login'); setError(null); }}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                  mode === 'login'
                    ? 'bg-white text-[#6750A4] shadow-xs'
                    : 'text-[#49454F] hover:text-[#1D1B20]'
                }`}
              >
                {isFrench ? 'Se connecter' : 'Log In'}
              </button>
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Success Message */}
            {successMessage && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{successMessage}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-[#1D1B20] mb-1">
                  {isFrench ? 'Nom / Prénom' : 'Name'}
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#79747E]" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={isFrench ? 'Votre prénom ou nom' : 'Your first name'}
                    className="w-full pl-10 pr-3.5 py-2.5 bg-[#F3EDF7]/50 border border-[#CAC4D0] focus:border-[#6750A4] focus:ring-1 focus:ring-[#6750A4] rounded-xl text-xs text-[#1D1B20] outline-none transition-all"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1D1B20] mb-1">
                  {isFrench ? 'Mot de passe' : 'Password'}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#79747E]" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={isFrench ? 'Minimum 8 caractères' : 'Minimum 8 characters'}
                    className="w-full pl-10 pr-10 py-2.5 bg-[#F3EDF7]/50 border border-[#CAC4D0] focus:border-[#6750A4] focus:ring-1 focus:ring-[#6750A4] rounded-xl text-xs text-[#1D1B20] outline-none transition-all"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#79747E] hover:text-[#1D1B20]"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {mode === 'create' && (
                <div>
                  <label className="block text-xs font-bold text-[#1D1B20] mb-1">
                    {isFrench ? 'Confirmer le mot de passe' : 'Confirm Password'}
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#79747E]" />
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder={isFrench ? 'Confirmer le mot de passe' : 'Re-enter password'}
                      className="w-full pl-10 pr-10 py-2.5 bg-[#F3EDF7]/50 border border-[#CAC4D0] focus:border-[#6750A4] focus:ring-1 focus:ring-[#6750A4] rounded-xl text-xs text-[#1D1B20] outline-none transition-all"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#79747E] hover:text-[#1D1B20]"
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2 space-y-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 bg-[#6750A4] hover:bg-[#523d8c] text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer disabled:opacity-50"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <span>
                        {mode === 'create'
                          ? (isFrench ? 'Créer un compte et sécuriser les données' : 'Create Account & Secure Data')
                          : (isFrench ? 'Se connecter' : 'Log In')}
                      </span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-2.5 text-xs font-semibold text-[#49454F] hover:bg-[#F3EDF7] rounded-xl transition-all cursor-pointer"
                >
                  {isFrench ? 'Continuer / Plus tard' : 'Continue / Later'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
