import React, { useState } from 'react';
import { Settings, User, Sparkles, RefreshCw, Check, Loader2, AlertCircle, Lock, RotateCcw, ShieldCheck } from 'lucide-react';
import { UserProfile } from '../types';
import { AuthUserProfile } from '../lib/firebase';
import EmailAuthCard from './EmailAuthCard';

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
  onSignInWithMicrosoft?: () => Promise<AuthUserProfile>;
  onSignInWithGoogle?: () => Promise<AuthUserProfile>;
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
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);

  const isPremium = profile.subscription.subscriptionStatus === 'premium' || profile.subscription.plan === 'premium';
  const isExpired = profile.subscription.subscriptionStatus === 'expired';

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdating(true);
    setUpdateMessage(null);
    try {
      await onUpdateProfile({ name, email });
      setUpdateMessage('Profile details successfully saved.');
    } catch (err: any) {
      setUpdateMessage('Failed to update profile.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleReset = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to reset demo sample data to factory defaults? This will not remove your Premium status.'
    );
    if (!confirmed) return;

    setIsResetting(true);
    try {
      await onResetDatabase();
      setUpdateMessage('Demo sandbox reset to factory defaults.');
    } catch (err: any) {
      setUpdateMessage('Failed to reset sandbox.');
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
      setUpdateMessage('Simulated subscription expiration. Your custom courses & data remain safe!');
    } catch (err: any) {
      setUpdateMessage('Failed to simulate expiration.');
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
      setUpdateMessage('Pro features activated in sandbox.');
    } catch (err: any) {
      setUpdateMessage('Failed to simulate activation.');
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
            <span>Settings &amp; Preferences</span>
          </h2>
          <p className="text-xs sm:text-sm text-[#49454F] mt-0.5">
            Manage your student account, security verification, and subscription status
          </p>
        </div>

        {onRefreshState && (
          <button
            onClick={onRefreshState}
            className="px-4 py-2 border border-[#E1E3E1] text-[#1D1B20] hover:bg-slate-50 text-xs font-bold rounded-xl flex items-center gap-2 transition-colors cursor-pointer self-start sm:self-auto shadow-xs"
            id="settings-refresh-state-btn"
          >
            <RefreshCw className="w-3.5 h-3.5 text-[#6750A4]" />
            <span>Sync Workspace</span>
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
          {/* Account Verification & Security Card */}
          <div className="bg-white border border-[#E1E3E1] rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E1E3E1] pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[#6750A4]" />
                <h3 className="text-xs font-bold text-[#1D1B20] uppercase tracking-wider">Account &amp; Entitlement Protection</h3>
              </div>
              {authUser && (
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full">
                  Verified Account
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
                setUpdateMessage('Account verified successfully! Your workspace and subscription are securely linked.');
              }}
              onSignOut={onSignOut}
            />
          </div>

          <div className="bg-white border border-[#E1E3E1] rounded-2xl p-6">
            <form onSubmit={handleSaveProfile} className="space-y-5" id="settings-profile-form">
              <div className="flex items-center gap-2 border-b border-[#E1E3E1] pb-3">
                <User className="w-4 h-4 text-[#6750A4]" />
                <h3 className="text-xs font-bold text-[#1D1B20] uppercase tracking-wider">Student Profile Settings</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[#49454F] uppercase">Student Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-white border border-[#E1E3E1] text-xs text-[#1D1B20] rounded-xl px-3.5 py-2.5 focus:ring-1 focus:ring-[#6750A4] outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[#49454F] uppercase">Email Address</label>
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
                    <span>Save Profile</span>
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
              Subscription Status
            </h4>

            {isPremium ? (
              <div className="space-y-3" id="settings-premium-details">
                <div className="flex items-center gap-1.5 text-xs text-[#b78103] font-bold uppercase">
                  <Sparkles className="w-4 h-4 text-[#b78103]" />
                  <span>Premium Active</span>
                </div>
                <div className="text-[10px] text-[#49454F] space-y-1.5 font-mono">
                  <div className="flex justify-between">
                    <span>Plan:</span>
                    <span className="text-[#1D1B20] font-bold capitalize">{profile.subscription.plan || 'Premium'} ({profile.subscription.type || 'Yearly'})</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Gateway:</span>
                    <span className="text-[#1D1B20] font-bold uppercase">{profile.subscription.paymentGateway || profile.subscription.paymentProvider || 'Direct'}</span>
                  </div>
                  {profile.subscription.transactionId && (
                    <div className="flex justify-between truncate">
                      <span>Ref:</span>
                      <span className="text-[#6750A4] font-bold truncate max-w-[140px]">{profile.subscription.transactionId}</span>
                    </div>
                  )}
                  {profile.subscription.expiryDate && (
                    <div className="flex justify-between">
                      <span>Valid until:</span>
                      <span className="text-emerald-700 font-bold">{new Date(profile.subscription.expiryDate).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>

                <div className="p-3 bg-emerald-50 border border-emerald-200/80 rounded-xl text-[11px] text-emerald-800">
                  Your academic workspace is upgraded to unlimited capacity across all subjects, notes, and timetable slots.
                </div>
              </div>
            ) : isExpired ? (
              <div className="space-y-3" id="settings-expired-details">
                <div className="flex items-center gap-1.5 text-xs text-amber-700 font-bold uppercase">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  <span>Pro Plan Expired</span>
                </div>
                <div className="p-3 bg-amber-50 border border-amber-200/80 rounded-xl text-[11px] text-amber-900 leading-relaxed">
                  <strong>Data Safe &amp; Preserved:</strong> All your previously created courses, notes, and study records remain completely intact. Upgrade to resume unlimited creation.
                </div>
                <div className="text-[10px] text-[#49454F] space-y-1 font-mono">
                  <div className="flex justify-between">
                    <span>Previous Plan:</span>
                    <span className="text-[#1D1B20] font-bold capitalize">{profile.subscription.plan || 'Pro'}</span>
                  </div>
                  {profile.subscription.expiryDate && (
                    <div className="flex justify-between">
                      <span>Expired On:</span>
                      <span className="text-amber-700 font-bold">{new Date(profile.subscription.expiryDate).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>
                <button
                  onClick={onTriggerUpgrade}
                  className="w-full py-2 bg-gradient-to-r from-amber-500 to-yellow-600 text-white font-extrabold text-xs rounded-xl shadow hover:brightness-110 transition-all cursor-pointer"
                  id="settings-renew-pro-button"
                >
                  Renew Pro Subscription
                </button>
                {onOpenRestore && (
                  <button
                    onClick={onOpenRestore}
                    type="button"
                    className="w-full py-2 bg-slate-50 hover:bg-slate-100 border border-[#E1E3E1] text-[#1D1B20] font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    id="settings-renew-restore-button"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-[#6750A4]" />
                    <span>Restore Existing Purchase</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3" id="settings-free-details">
                <div className="text-xs font-bold text-[#49454F] uppercase">
                  Standard Free Account
                </div>
                <p className="text-[10px] text-[#49454F] leading-relaxed">
                  You are currently on the basic free plan. Upgrade to Study Planner Premium to unlock unlimited courses, notes, and timetable sync.
                </p>
                <button
                  onClick={onTriggerUpgrade}
                  className="w-full py-2.5 bg-[#6750A4] hover:bg-[#503E84] text-white font-extrabold text-xs rounded-xl shadow transition-all cursor-pointer flex items-center justify-center gap-2"
                  id="settings-upgrade-pro-button"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Upgrade to Premium</span>
                </button>
                {onOpenRestore && (
                  <button
                    onClick={onOpenRestore}
                    type="button"
                    className="w-full py-2 bg-slate-50 hover:bg-slate-100 border border-[#E1E3E1] text-[#1D1B20] font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    id="settings-free-restore-button"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-[#6750A4]" />
                    <span>Restore Purchase</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Backup Export */}
          <div className="p-5 bg-white border border-[#E1E3E1] rounded-2xl space-y-3">
            <h4 className="text-xs font-extrabold text-[#1D1B20] uppercase tracking-wider border-b border-[#E1E3E1] pb-2">
              Workspace Backup
            </h4>
            <p className="text-[10px] text-[#49454F] leading-relaxed">
              Export an offline JSON backup of your current courses, assignments, exams, and notes.
            </p>
            {isPremium ? (
              <button
                onClick={handleExportData}
                className="w-full py-2 bg-[#6750A4] hover:bg-[#503E84] text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
                id="export-workspace-button"
              >
                <span>Export JSON Workspace Backup</span>
              </button>
            ) : (
              <button
                onClick={onTriggerUpgrade}
                className="w-full py-2 bg-[#79747E]/10 hover:bg-[#79747E]/20 text-[#49454F] font-bold text-xs rounded-xl flex items-center justify-center gap-2 border border-[#79747E]/20 transition-all cursor-pointer relative"
                id="export-workspace-button-locked"
              >
                <Lock className="w-3.5 h-3.5 text-[#79747E]" />
                <span>Export Data (Premium Only)</span>
              </button>
            )}
          </div>

          {/* Developer Testing Control box */}
          <div className="p-5 bg-white border border-[#E1E3E1] rounded-2xl space-y-4">
            <h4 className="text-xs font-extrabold text-[#B3261E] uppercase tracking-wider border-b border-[#E1E3E1] pb-2">
              Developer Sandbox Control
            </h4>
            <p className="text-[10px] text-[#49454F] leading-relaxed">
              Test subscription lifecycle and data preservation without losing any custom items.
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
                  <span>Simulate Pro Expiration (Safe)</span>
                </button>
              ) : (
                <button
                  onClick={handleSimulatePro}
                  disabled={isSimulating}
                  className="w-full py-2 bg-purple-50 text-[#6750A4] hover:bg-purple-100 border border-purple-200 font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                  id="settings-simulate-pro-btn"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#6750A4]" />
                  <span>Simulate Pro Activation (Safe)</span>
                </button>
              )}

              <button
                onClick={handleReset}
                disabled={isResetting}
                className="w-full py-2 bg-[#FDECEB] text-[#B3261E] hover:bg-[#FDECEB]/80 border border-[#F9DEDC] font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
                id="settings-sandbox-reset"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isResetting ? 'animate-spin' : ''}`} />
                <span>Restore Factory Sandbox</span>
              </button>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
