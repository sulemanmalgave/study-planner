import React, { useState } from 'react';
import { Settings, User, Sparkles, RefreshCw, Check, Loader2, AlertCircle, Lock, RotateCcw, ShieldCheck, Globe, Bot, CheckCircle2 } from 'lucide-react';
import { UserProfile } from '../types';
import { AuthUserProfile } from '../lib/emailAuth';
import EmailAuthCard from './EmailAuthCard';
import { useTranslation, Language } from '../lib/i18n';

interface SettingsViewProps {
  profile: UserProfile;
  coursesCount: number;
  assignmentsCount: number;
  timetableCount: number;
  notesCount: number;
  examsCount: number;
  onUpdateProfile: (profile: Partial<UserProfile>) => Promise<void>;
  onResetDatabase: () => Promise<void>;
  onTriggerUpgrade: () => void;
  onRefreshState?: () => void;
  onOpenRestore?: () => void;
  authUser?: AuthUserProfile | null;
  onAuthSuccess?: (user: AuthUserProfile, hasActiveSubscription?: boolean, subscription?: any) => void;
  onSignOut?: () => Promise<void>;
}

export default function SettingsView({
  profile,
  coursesCount,
  assignmentsCount,
  timetableCount,
  notesCount,
  examsCount,
  onUpdateProfile,
  onResetDatabase,
  onTriggerUpgrade,
  onRefreshState,
  onOpenRestore,
  authUser,
  onAuthSuccess,
  onSignOut,
}: SettingsViewProps) {
  const { t, language, setLanguage, formatDate } = useTranslation();
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [aiDiagnostic, setAiDiagnostic] = useState<any>(null);
  const [isCheckingAi, setIsCheckingAi] = useState(false);

  const handleCheckAiDiagnostic = async () => {
    setIsCheckingAi(true);
    try {
      const res = await fetch('/api/ai/diagnostic');
      const data = await res.json();
      setAiDiagnostic(data);
    } catch {
      setAiDiagnostic({
        configured: false,
        status: 'error',
        message: language === 'fr-FR' ? 'Impossible de joindre le point de diagnostic IA.' : 'Failed to reach AI diagnostic endpoint.',
      });
    } finally {
      setIsCheckingAi(false);
    }
  };

  const isPremium = profile.subscription.subscriptionStatus === 'premium' || profile.subscription.plan === 'premium';
  const isExpired = profile.subscription.subscriptionStatus === 'expired';

  const handleLanguageChange = async (newLang: Language) => {
    setLanguage(newLang);
    try {
      await onUpdateProfile({ language: newLang });
      const langName = newLang === 'fr-FR' ? 'Français (France)' : 'English (US)';
      setUpdateMessage(t('settings.languageSaved', { lang: langName }));
    } catch {
      // Preference is already saved in localStorage safely
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdating(true);
    setUpdateMessage(null);
    try {
      await onUpdateProfile({ name, email });
      setUpdateMessage(t('settings.savedSuccess'));
    } catch (err: any) {
      setUpdateMessage(t('settings.saveFailed'));
    } finally {
      setIsUpdating(false);
    }
  };

  const handleReset = async () => {
    const confirmed = window.confirm(
      t('settings.resetConfirm')
    );
    if (!confirmed) return;

    setIsResetting(true);
    try {
      await onResetDatabase();
      setUpdateMessage(language === 'fr-FR' ? 'Données de bac à sable réinitialisées.' : 'Demo sandbox reset to factory defaults.');
    } catch (err: any) {
      setUpdateMessage(t('settings.saveFailed'));
    } finally {
      setIsResetting(false);
    }
  };

  const handleSimulateExpire = async () => {
    setIsSimulating(true);
    try {
      const expiredSub = {
        ...profile.subscription,
        subscriptionStatus: 'expired' as const,
        expiryDate: new Date(Date.now() - 86400000).toISOString(),
      };
      await onUpdateProfile({ subscription: expiredSub });
      setUpdateMessage(language === 'fr-FR' ? 'Expiration simulée de l\'abonnement. Vos matières et données restent sécurisées !' : 'Simulated subscription expiration. Your custom courses & data remain safe!');
    } catch (err: any) {
      setUpdateMessage(language === 'fr-FR' ? 'Échec de la simulation d\'expiration.' : 'Failed to simulate expiration.');
    } finally {
      setIsSimulating(false);
    }
  };

  const handleSimulatePro = async () => {
    setIsSimulating(true);
    try {
      const now = new Date();
      const nextYear = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
      const activeSub = {
        ...profile.subscription,
        subscriptionStatus: 'premium' as const,
        plan: 'Yearly Pro',
        type: 'yearly',
        paymentGateway: 'developer_simulation',
        transactionId: `sim_${Date.now()}`,
        purchaseDate: now.toISOString(),
        expiryDate: nextYear.toISOString(),
      };
      await onUpdateProfile({ subscription: activeSub });
      setUpdateMessage(language === 'fr-FR' ? 'Fonctionnalités Premium activées dans le bac à sable.' : 'Pro features activated in sandbox.');
    } catch (err: any) {
      setUpdateMessage(language === 'fr-FR' ? 'Échec de la simulation d\'activation.' : 'Failed to simulate activation.');
    } finally {
      setIsSimulating(false);
    }
  };

  const handleExportData = () => {
    const data = {
      profile,
      exportDate: new Date().toISOString(),
      stats: {
        coursesCount,
        assignmentsCount,
        timetableCount,
        notesCount,
        examsCount,
      },
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `study_planner_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6" id="settings-view-container">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E1E3E1] pb-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-[#1D1B20] tracking-tight flex items-center gap-2">
            <Settings className="w-6 h-6 text-[#6750A4]" />
            <span>{t('settings.title')}</span>
          </h2>
          <p className="text-xs sm:text-sm text-[#49454F] mt-0.5">
            {t('settings.subtitle')}
          </p>
        </div>

        {onRefreshState && (
          <button
            onClick={onRefreshState}
            className="px-4 py-2 border border-[#E1E3E1] text-[#1D1B20] hover:bg-slate-50 text-xs font-bold rounded-xl flex items-center gap-2 transition-colors cursor-pointer self-start sm:self-auto shadow-xs"
            id="settings-refresh-state-btn"
          >
            <RefreshCw className="w-3.5 h-3.5 text-[#6750A4]" />
            <span>{t('settings.syncWorkspace')}</span>
          </button>
        )}
      </div>

      {updateMessage && (
        <div className="p-3.5 text-xs text-[#0f5132] bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{updateMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5" id="settings-split-grid">
        
        {/* Left: General Settings & Profile Form */}
        <div className="lg:col-span-8 space-y-5">
          {/* Language & Region Card */}
          <div className="bg-white border border-[#E1E3E1] rounded-2xl p-6 space-y-4" id="settings-language-card">
            <div className="flex items-center justify-between border-b border-[#E1E3E1] pb-3">
              <div className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-[#6750A4]" />
                <h3 className="text-xs font-bold text-[#1D1B20] uppercase tracking-wider">{t('settings.languageSection')}</h3>
              </div>
              <span className="text-[10px] font-bold text-[#6750A4] bg-[#EADDFF]/50 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                {language === 'fr-FR' ? 'Français (France)' : 'English'}
              </span>
            </div>

            <div>
              <label className="text-xs font-bold text-[#1D1B20] block mb-1">{t('settings.interfaceLanguage')}</label>
              <p className="text-xs text-[#49454F] mb-3">
                {t('settings.interfaceLanguageDesc')}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleLanguageChange('en')}
                  className={`p-3.5 rounded-xl border flex items-center justify-between text-left transition-all cursor-pointer ${
                    language === 'en'
                      ? 'border-[#6750A4] bg-[#6750A4]/5 text-[#1D1B20] ring-1 ring-[#6750A4]'
                      : 'border-[#E1E3E1] hover:bg-slate-50 text-[#49454F]'
                  }`}
                  id="lang-option-en"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-lg">🇺🇸</span>
                    <div>
                      <div className="text-xs font-bold">{t('settings.langEn')}</div>
                      <div className="text-[10px] text-[#49454F]/80">English (United States)</div>
                    </div>
                  </div>
                  {language === 'en' && <Check className="w-4 h-4 text-[#6750A4]" />}
                </button>

                <button
                  type="button"
                  onClick={() => handleLanguageChange('fr-FR')}
                  className={`p-3.5 rounded-xl border flex items-center justify-between text-left transition-all cursor-pointer ${
                    language === 'fr-FR'
                      ? 'border-[#6750A4] bg-[#6750A4]/5 text-[#1D1B20] ring-1 ring-[#6750A4]'
                      : 'border-[#E1E3E1] hover:bg-slate-50 text-[#49454F]'
                  }`}
                  id="lang-option-fr"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-lg">🇫🇷</span>
                    <div>
                      <div className="text-xs font-bold">{t('settings.langFr')}</div>
                      <div className="text-[10px] text-[#49454F]/80">Français (France)</div>
                    </div>
                  </div>
                  {language === 'fr-FR' && <Check className="w-4 h-4 text-[#6750A4]" />}
                </button>
              </div>
            </div>
          </div>

          {/* Account Verification & Security Card */}
          <div className="bg-white border border-[#E1E3E1] rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E1E3E1] pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[#6750A4]" />
                <h3 className="text-xs font-bold text-[#1D1B20] uppercase tracking-wider">{t('settings.accountProtection')}</h3>
              </div>
              {authUser && (
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full">
                  {t('settings.verifiedAccount')}
                </span>
              )}
            </div>

            <EmailAuthCard
              authUser={authUser}
              onAuthSuccess={(user, hasActiveSubscription, sub) => {
                setName(user.displayName || name);
                setEmail(user.email || email);
                if (onAuthSuccess) {
                  onAuthSuccess(user, hasActiveSubscription, sub);
                }
                setUpdateMessage(language === 'fr-FR' ? 'Compte vérifié avec succès ! Votre espace et abonnement sont sécurisés.' : 'Account verified successfully! Your workspace and subscription are securely linked.');
              }}
              onSignOut={onSignOut}
            />
          </div>

          <div className="bg-white border border-[#E1E3E1] rounded-2xl p-6">
            <form onSubmit={handleSaveProfile} className="space-y-5" id="settings-profile-form">
              <div className="flex items-center gap-2 border-b border-[#E1E3E1] pb-3">
                <User className="w-4 h-4 text-[#6750A4]" />
                <h3 className="text-xs font-bold text-[#1D1B20] uppercase tracking-wider">{t('settings.profileSettings')}</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[#49454F] uppercase">{t('settings.studentName')}</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-white border border-[#E1E3E1] text-xs text-[#1D1B20] rounded-xl px-3.5 py-2.5 focus:ring-1 focus:ring-[#6750A4] outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[#49454F] uppercase">{t('settings.emailAddress')}</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-white border border-[#E1E3E1] text-xs text-[#1D1B20] rounded-xl px-3.5 py-2.5 focus:ring-1 focus:ring-[#6750A4] outline-none"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-[#E1E3E1] flex justify-end">
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="px-6 py-2.5 bg-[#6750A4] hover:bg-[#6750A4]/90 disabled:opacity-50 text-xs font-bold text-white rounded-xl shadow-sm flex items-center gap-2 cursor-pointer"
                >
                  {isUpdating ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <span>{t('settings.saveProfile')}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Right: Subscription Detail Cards & Purge Resets */}
        <div className="lg:col-span-4 space-y-4">
          {/* Subscription State */}
          <div className="p-5 bg-white border border-[#E1E3E1] rounded-2xl space-y-4">
            <h4 className="text-xs font-extrabold text-[#1D1B20] uppercase tracking-wider border-b border-[#E1E3E1] pb-2">
              {t('settings.subscriptionStatus')}
            </h4>

            {isPremium ? (
              <div className="space-y-3" id="settings-premium-details">
                <div className="flex items-center gap-1.5 text-xs text-[#b78103] font-bold uppercase">
                  <Sparkles className="w-4 h-4 text-[#b78103]" />
                  <span>{t('settings.premiumActive')}</span>
                </div>
                <div className="text-[10px] text-[#49454F] space-y-1.5 font-mono">
                  <div className="flex justify-between">
                    <span>{t('settings.planLabel')}</span>
                    <span className="text-[#1D1B20] font-bold capitalize">{profile.subscription.plan || 'Premium'} ({profile.subscription.type || 'Yearly'})</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t('settings.gatewayLabel')}</span>
                    <span className="text-[#1D1B20] font-bold uppercase">{profile.subscription.paymentGateway || profile.subscription.paymentProvider || 'Direct'}</span>
                  </div>
                  {profile.subscription.transactionId && (
                    <div className="flex justify-between truncate">
                      <span>{t('settings.refLabel')}</span>
                      <span className="text-[#6750A4] font-bold truncate max-w-[140px]">{profile.subscription.transactionId}</span>
                    </div>
                  )}
                  {profile.subscription.expiryDate && (
                    <div className="flex justify-between">
                      <span>{t('settings.validUntil')}</span>
                      <span className="text-emerald-700 font-bold">{formatDate(profile.subscription.expiryDate)}</span>
                    </div>
                  )}
                </div>

                <div className="p-3 bg-emerald-50 border border-emerald-200/80 rounded-xl text-[11px] text-emerald-800">
                  {language === 'fr-FR'
                    ? 'Votre espace académique bénéficie d\'une capacité illimitée pour l\'ensemble des matières, devoirs, notes et créneaux d\'emploi du temps.'
                    : 'Your academic workspace is upgraded to unlimited capacity across all subjects, notes, and timetable slots.'}
                </div>

                <button
                  onClick={onTriggerUpgrade}
                  className="w-full py-2 bg-emerald-100/70 hover:bg-emerald-200/80 text-emerald-900 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  id="settings-view-subscription-btn"
                >
                  <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
                  <span>{t('settings.viewSubscriptionDetails')}</span>
                </button>
              </div>
            ) : isExpired ? (
              <div className="space-y-3" id="settings-expired-details">
                <div className="flex items-center gap-1.5 text-xs text-amber-700 font-bold uppercase">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  <span>{t('settings.proExpired')}</span>
                </div>
                <div className="p-3 bg-amber-50 border border-amber-200/80 rounded-xl text-[11px] text-amber-900 leading-relaxed">
                  <strong>{language === 'fr-FR' ? 'Données sécurisées & préservées :' : 'Data Safe & Preserved:'}</strong> {language === 'fr-FR' ? 'Toutes vos matières, fiches et séances créées restent intactes. Renouvelez pour créer sans restriction.' : 'All your previously created courses, notes, and study records remain completely intact. Upgrade to resume unlimited creation.'}
                </div>
                <div className="text-[10px] text-[#49454F] space-y-1 font-mono">
                  <div className="flex justify-between">
                    <span>{t('settings.planLabel')}</span>
                    <span className="text-[#1D1B20] font-bold capitalize">{profile.subscription.plan || 'Pro'}</span>
                  </div>
                  {profile.subscription.expiryDate && (
                    <div className="flex justify-between">
                      <span>{t('settings.validUntil')}</span>
                      <span className="text-amber-700 font-bold">{formatDate(profile.subscription.expiryDate)}</span>
                    </div>
                  )}
                </div>
                <button
                  onClick={onTriggerUpgrade}
                  className="w-full py-2 bg-gradient-to-r from-amber-500 to-yellow-600 text-white font-extrabold text-xs rounded-xl shadow hover:brightness-110 transition-all cursor-pointer"
                  id="settings-renew-pro-button"
                >
                  {t('settings.renewPro')}
                </button>
                {onOpenRestore && (
                  <button
                    onClick={onOpenRestore}
                    type="button"
                    className="w-full py-2 bg-slate-50 hover:bg-slate-100 border border-[#E1E3E1] text-[#1D1B20] font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    id="settings-renew-restore-button"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-[#6750A4]" />
                    <span>{t('settings.restorePurchase')}</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3" id="settings-free-details">
                <div className="text-xs font-bold text-[#49454F] uppercase">
                  {t('settings.freeAccountTitle')}
                </div>
                <p className="text-[10px] text-[#49454F] leading-relaxed">
                  {t('settings.freeAccountDesc')}
                </p>
                <button
                  onClick={onTriggerUpgrade}
                  className="w-full py-2.5 bg-[#6750A4] hover:bg-[#503E84] text-white font-extrabold text-xs rounded-xl shadow transition-all cursor-pointer flex items-center justify-center gap-2"
                  id="settings-upgrade-pro-button"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{t('settings.upgradeToPremium')}</span>
                </button>
                {onOpenRestore && (
                  <button
                    onClick={onOpenRestore}
                    type="button"
                    className="w-full py-2 bg-slate-50 hover:bg-slate-100 border border-[#E1E3E1] text-[#1D1B20] font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    id="settings-free-restore-button"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-[#6750A4]" />
                    <span>{t('settings.restorePurchase')}</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Backup Export */}
          <div className="p-5 bg-white border border-[#E1E3E1] rounded-2xl space-y-3">
            <h4 className="text-xs font-extrabold text-[#1D1B20] uppercase tracking-wider border-b border-[#E1E3E1] pb-2">
              {t('settings.workspaceBackup')}
            </h4>
            <p className="text-[10px] text-[#49454F] leading-relaxed">
              {t('settings.workspaceBackupDesc')}
            </p>
            {isPremium ? (
              <button
                onClick={handleExportData}
                className="w-full py-2 bg-[#6750A4] hover:bg-[#503E84] text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
                id="export-workspace-button"
              >
                <span>{t('settings.exportBackup')}</span>
              </button>
            ) : (
              <button
                onClick={onTriggerUpgrade}
                className="w-full py-2 bg-[#79747E]/10 hover:bg-[#79747E]/20 text-[#49454F] font-bold text-xs rounded-xl flex items-center justify-center gap-2 border border-[#79747E]/20 transition-all cursor-pointer relative"
                id="export-workspace-button-locked"
              >
                <Lock className="w-3.5 h-3.5 text-[#79747E]" />
                <span>{t('settings.exportLocked')}</span>
              </button>
            )}
          </div>

          {/* Gemini AI Status & Diagnostic Card (Safe - Never displays secret key) */}
          <div className="p-5 bg-white border border-[#E1E3E1] rounded-2xl space-y-4" id="settings-gemini-diagnostic-card">
            <div className="flex items-center justify-between border-b border-[#E1E3E1] pb-2">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-[#6750A4]" />
                <h4 className="text-xs font-extrabold text-[#1D1B20] uppercase tracking-wider">
                  {language === 'fr-FR' ? 'Diagnostic Gemini IA' : 'Gemini AI Diagnostics'}
                </h4>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-[#6750A4]/10 text-[#6750A4]">
                {language === 'fr-FR' ? 'Serveur Sécurisé' : 'Server-Side'}
              </span>
            </div>

            <p className="text-[10px] text-[#49454F] leading-relaxed">
              {language === 'fr-FR'
                ? 'Vérifiez la configuration et la connectivité de l\'API Gemini sans jamais exposer votre clé secrète.'
                : 'Verify Gemini API configuration and live connectivity without ever exposing secret keys.'}
            </p>

            <button
              onClick={handleCheckAiDiagnostic}
              disabled={isCheckingAi}
              type="button"
              className="w-full py-2 bg-[#6750A4]/10 hover:bg-[#6750A4]/20 text-[#6750A4] font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              id="settings-check-gemini-btn"
            >
              {isCheckingAi ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#6750A4]" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-[#6750A4]" />
              )}
              <span>
                {isCheckingAi
                  ? (language === 'fr-FR' ? 'Test en cours...' : 'Testing connection...')
                  : (language === 'fr-FR' ? 'Tester la connexion IA Gemini' : 'Test Gemini AI Connection')}
              </span>
            </button>

            {aiDiagnostic && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-[#49454F] font-medium">
                    {language === 'fr-FR' ? 'Statut de configuration :' : 'Configuration Status:'}
                  </span>
                  {aiDiagnostic.configured ? (
                    <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                      <CheckCircle2 className="w-3 h-3" />
                      {language === 'fr-FR' ? 'Configuré & Actif' : 'Configured & Active'}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                      <AlertCircle className="w-3 h-3" />
                      {language === 'fr-FR' ? 'Non Configuré' : 'Not Configured'}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[#49454F] font-medium">
                    {language === 'fr-FR' ? 'Variable détectée :' : 'Variable Detected:'}
                  </span>
                  <span className="font-mono font-bold text-[#1D1B20]">
                    {aiDiagnostic.variableDetected || 'NONE'}
                  </span>
                </div>

                {aiDiagnostic.keyType && aiDiagnostic.keyType !== 'None' && (
                  <div className="flex items-center justify-between">
                    <span className="text-[#49454F] font-medium">
                      {language === 'fr-FR' ? 'Type de clé Google :' : 'Google Key Type:'}
                    </span>
                    <span className="font-semibold text-slate-700">
                      {aiDiagnostic.keyType} ({aiDiagnostic.keyLength} chars)
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-[#49454F] font-medium">
                    {language === 'fr-FR' ? 'Environnement hôte :' : 'Host Runtime:'}
                  </span>
                  <span className="font-semibold text-slate-700">
                    {aiDiagnostic.runtimeEnvironment || 'Cloud Container'}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[#49454F] font-medium">
                    {language === 'fr-FR' ? 'Modèle principal :' : 'Primary Model:'}
                  </span>
                  <span className="font-mono text-[#6750A4] font-bold">
                    {aiDiagnostic.primaryModel || 'gemini-3.8-flash'}
                  </span>
                </div>

                {aiDiagnostic.apiTest?.tested && (
                  <div className="pt-2 border-t border-slate-200">
                    <div className="flex items-center justify-between">
                      <span className="text-[#49454F] font-medium">
                        {language === 'fr-FR' ? 'Test d\'inférence direct :' : 'Live Inference Test:'}
                      </span>
                      {aiDiagnostic.apiTest.success ? (
                        <span className="text-emerald-700 font-bold">
                          {language === 'fr-FR' ? `Succès (${aiDiagnostic.apiTest.latencyMs}ms)` : `Success (${aiDiagnostic.apiTest.latencyMs}ms)`}
                        </span>
                      ) : (
                        <span className="text-rose-700 font-bold">
                          {aiDiagnostic.errorCategory || 'Erreur'}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {aiDiagnostic.message && (
                  <p className="text-[10px] text-slate-600 bg-white p-2 rounded border border-slate-200 leading-normal">
                    {aiDiagnostic.message}
                  </p>
                )}

                <div className="text-[9px] text-[#49454F] pt-1 leading-normal border-t border-slate-200">
                  <p className="font-bold text-slate-700 mb-0.5">
                    {language === 'fr-FR' ? 'Note de déploiement multi-plateforme :' : 'Deployment note:'}
                  </p>
                  <p>
                    {language === 'fr-FR'
                      ? 'Les Secrets Google AI Studio sont injectés dans ce conteneur. Si vous déployez sur Vercel, ajoutez impérativement GEMINI_API_KEY dans Vercel > Settings > Environment Variables.'
                      : 'Google AI Studio Secrets are injected into this container. If deployed to Vercel, configure GEMINI_API_KEY in Vercel > Settings > Environment Variables.'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Developer Testing Control box */}
          <div className="p-5 bg-white border border-[#E1E3E1] rounded-2xl space-y-4">
            <h4 className="text-xs font-extrabold text-[#B3261E] uppercase tracking-wider border-b border-[#E1E3E1] pb-2">
              {t('settings.devSandbox')}
            </h4>
            <p className="text-[10px] text-[#49454F] leading-relaxed">
              {t('settings.devSandboxDesc')}
            </p>

            <div className="space-y-2">
              {isPremium ? (
                <button
                  onClick={handleSimulateExpire}
                  disabled={isSimulating}
                  className="w-full py-2 bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200 font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                  id="settings-simulate-expire-btn"
                >
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                  <span>{t('settings.simulateExpire')}</span>
                </button>
              ) : (
                <button
                  onClick={handleSimulatePro}
                  disabled={isSimulating}
                  className="w-full py-2 bg-purple-50 text-[#6750A4] hover:bg-purple-100 border border-purple-200 font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                  id="settings-simulate-pro-btn"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#6750A4]" />
                  <span>{t('settings.simulatePro')}</span>
                </button>
              )}

              <button
                onClick={handleReset}
                disabled={isResetting}
                className="w-full py-2 bg-[#FDECEB] text-[#B3261E] hover:bg-[#FDECEB]/80 border border-[#F9DEDC] font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
                id="settings-sandbox-reset"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isResetting ? 'animate-spin' : ''}`} />
                <span>{t('settings.restoreSandbox')}</span>
              </button>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
