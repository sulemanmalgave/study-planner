import React, { useState } from 'react';
import { Settings, User, Sparkles, RefreshCw, Check, Loader2, AlertCircle, Lock, RotateCcw, LogIn, LogOut } from 'lucide-react';
import { UserProfile } from '../types';
import { AuthUserProfile } from '../lib/firebase';
import OAuthDiagnosticPanel from './OAuthDiagnosticPanel';

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
  onSignInWithMicrosoft,
  onSignInWithGoogle,
  onSignOut,
}: SettingsViewProps) {
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);

  const isPremium = (
    (profile.subscription.subscriptionStatus === 'premium' || profile.subscription.plan === 'premium' || profile.subscription.plan === 'monthly' || profile.subscription.plan === 'yearly' || profile.subscription.plan === 'quarterly') &&
    (!profile.subscription.expiryDate || new Date(profile.subscription.expiryDate).getTime() > Date.now())
  );

  const hasExpiredSubscription = Boolean(
    !isPremium &&
    (profile.subscription.expiryDate || profile.subscription.transactionId || profile.subscription.plan)
  );

  const handleSimulateExpire = async () => {
    setIsSimulating(true);
    try {
      const res = await fetch('/api/subscription/simulate-expire', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setUpdateMessage('Subscription expired simulated. All your courses, notes, timetable, and audio lectures remain 100% safely preserved!');
        if (onRefreshState) onRefreshState();
      }
    } catch (e) {
      setUpdateMessage('Failed to simulate subscription expiration.');
    } finally {
      setIsSimulating(false);
    }
  };

  const handleSimulatePro = async () => {
    setIsSimulating(true);
    try {
      const res = await fetch('/api/subscription/simulate-pro', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setUpdateMessage('Pro subscription activated! All previously created data is immediately available and unlocked.');
        if (onRefreshState) onRefreshState();
      }
    } catch (e) {
      setUpdateMessage('Failed to simulate Pro activation.');
    } finally {
      setIsSimulating(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdating(true);
    setUpdateMessage(null);
    try {
      // derive initials
      const initials = name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2) || 'AM';

      await onUpdateProfile({
        name,
        email,
        initials,
      });

      setUpdateMessage('Profile settings saved successfully!');
    } catch (e: any) {
      setUpdateMessage('Error saving profile details.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleReset = async () => {
    if (confirm('WARNING: This will purge all your custom classes, assignments, notes, and resets your subscription plan to the default Free Account. Proceed?')) {
      setIsResetting(true);
      try {
        await onResetDatabase();
        setUpdateMessage('Database restored to default sandbox state.');
      } catch (e) {
        setUpdateMessage('Reset operation failed.');
      } finally {
        setIsResetting(false);
      }
    }
  };

  const handleExportData = () => {
    fetch('/api/state')
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch data');
        return res.json();
      })
      .then(data => {
        const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
          JSON.stringify(data, null, 2)
        )}`;
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute('href', jsonString);
        downloadAnchor.setAttribute('download', `studyflow_backup_${new Date().toISOString().split('T')[0]}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        setUpdateMessage('Academic data exported successfully!');
      })
      .catch(() => {
        setUpdateMessage('Failed to export data.');
      });
  };

  return (
    <div className="space-y-6 text-[#1D1B20]" id="settings-view-root">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 bg-white border border-[#E1E3E1] rounded-2xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-[#F3EDF7] text-[#1D1B20] rounded-xl border border-[#E1E3E1]">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#1D1B20] tracking-wide uppercase">Workspace Configuration</h2>
            <p className="text-[10px] font-mono text-[#49454F] mt-1 uppercase">Manage profile, subscription & testbeds</p>
          </div>
        </div>
      </div>

      {updateMessage && (
        <div className="p-3.5 text-xs text-[#0f5132] bg-[#FDECEB]/40 border border-[#F9DEDC]/50 rounded-xl flex items-center gap-2">
          <Check className="w-4 h-4 text-[#0f5132] shrink-0" />
          <span>{updateMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5" id="settings-split-grid">
        
        {/* Left: General Settings & Profile Form */}
        <div className="lg:col-span-8 space-y-5">
          {/* Microsoft Account Association Card */}
          <div className="bg-white border border-[#E1E3E1] rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E1E3E1] pb-3">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 21 21">
                  <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
                  <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
                  <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
                  <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
                </svg>
                <h3 className="text-xs font-bold text-[#1D1B20] uppercase tracking-wider">Microsoft Account &amp; Cloud Protection</h3>
              </div>
              {authUser && (
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full">
                  Signed in account
                </span>
              )}
            </div>

            {authUser ? (
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 bg-emerald-50/70 border border-emerald-200/70 rounded-xl">
                <div className="flex items-center gap-3">
                  {authUser.photoURL ? (
                    <img
                      src={authUser.photoURL}
                      alt={authUser.displayName || 'Microsoft User'}
                      className="w-10 h-10 rounded-full border border-emerald-300 shrink-0"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-[#00A4EF] text-white font-bold text-sm flex items-center justify-center shrink-0">
                      {(authUser.displayName || authUser.email || 'M')[0].toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-emerald-950 flex items-center gap-1.5 truncate">
                      <span>{authUser.displayName || 'Microsoft User'}</span>
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    </div>
                    <div className="text-[11px] text-emerald-800 truncate">{authUser.email}</div>
                    <div className="text-[10px] text-emerald-700/80 font-mono mt-0.5">UID: {authUser.uid.slice(0, 16)}...</div>
                  </div>
                </div>

                {onSignOut && (
                  <button
                    type="button"
                    onClick={onSignOut}
                    className="px-3.5 py-1.5 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs shrink-0"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <p className="text-xs text-slate-600 leading-relaxed">
                  Connect your Microsoft account to safeguard your courses, study notes, and Premium entitlements across devices and browser sessions.
                </p>
                <div className="flex items-center gap-3 flex-wrap">
                  {(onSignInWithMicrosoft || onSignInWithGoogle) && (
                    <button
                      type="button"
                      onClick={async () => {
                        setIsSigningIn(true);
                        try {
                          if (onSignInWithMicrosoft) {
                            await onSignInWithMicrosoft();
                          } else if (onSignInWithGoogle) {
                            await onSignInWithGoogle();
                          }
                          setUpdateMessage('Microsoft Account connected successfully! Your workspace and subscription are now permanently synced.');
                        } catch (err: any) {
                          setUpdateMessage(err.message || 'Failed to sign in with Microsoft.');
                        } finally {
                          setIsSigningIn(false);
                        }
                      }}
                      disabled={isSigningIn}
                      className="py-2.5 px-4 bg-[#2F2F2F] hover:bg-[#1B1B1B] text-white text-xs font-bold rounded-xl flex items-center gap-2.5 transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                      id="settings-microsoft-signin-btn"
                    >
                      {isSigningIn ? (
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                      ) : (
                        <svg className="w-4 h-4 shrink-0" viewBox="0 0 21 21">
                          <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
                          <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
                          <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
                          <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
                        </svg>
                      )}
                      <span>{isSigningIn ? 'Signing in...' : 'Sign in with Microsoft'}</span>
                    </button>
                  )}
                </div>
              </div>
            )}
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
                className="px-6 py-2.5 bg-[#6750A4] hover:bg-[#6750A4]/90 disabled:opacity-50 text-xs font-bold text-white rounded-xl shadow-sm flex items-center gap-2"
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
                    <span className="text-[#1D1B20] font-bold uppercase">{profile.subscription.paymentGateway || profile.subscription.paymentProvider || 'Razorpay/PayPal'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Transaction ID:</span>
                    <span className="text-[#1D1B20] font-bold truncate max-w-[120px]" title={profile.subscription.transactionId || profile.subscription.paymentId || ''}>
                      {profile.subscription.transactionId || profile.subscription.paymentId || 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Purchased:</span>
                    <span className="text-[#1D1B20] font-bold">
                      {profile.subscription.purchaseDate ? new Date(profile.subscription.purchaseDate).toLocaleDateString() : 'Active'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Expires:</span>
                    <span className="text-[#1D1B20] font-bold">
                      {profile.subscription.expiryDate ? new Date(profile.subscription.expiryDate).toLocaleDateString() : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
            ) : hasExpiredSubscription ? (
              <div className="space-y-3" id="settings-expired-details">
                <div className="text-xs font-bold text-amber-700 uppercase flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  <span>Pro Subscription Expired</span>
                </div>
                <div className="p-2.5 bg-amber-50/70 border border-amber-200/60 rounded-xl text-[10px] text-amber-900 leading-relaxed">
                  <strong>Data Safe &amp; Preserved:</strong> All your previously created courses, notes, audio lectures, and study records remain completely intact. Upgrade to Pro to resume unlimited creation and live features.
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
                  You are currently on the basic free plan. Upgrade to Study Planner Pro to unlock unlimited courses, notes, audio lectures, and companion sync.
                </p>
                <button
                  onClick={onTriggerUpgrade}
                  className="w-full py-2 bg-gradient-to-r from-amber-500 to-yellow-600 text-white font-extrabold text-xs rounded-xl shadow hover:brightness-110 transition-all cursor-pointer"
                  id="settings-upgrade-pro-button"
                >
                  Upgrade Premium
                </button>
                {onOpenRestore && (
                  <button
                    onClick={onOpenRestore}
                    type="button"
                    className="w-full py-2 bg-slate-50 hover:bg-slate-100 border border-[#E1E3E1] text-[#1D1B20] font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    id="settings-restore-purchase-button"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-[#6750A4]" />
                    <span>Restore Existing Purchase</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Export Data Card */}
          <div className="p-5 bg-white border border-[#E1E3E1] rounded-2xl space-y-4">
            <h4 className="text-xs font-extrabold text-[#1D1B20] uppercase tracking-wider border-b border-[#E1E3E1] pb-2">
              Export Academic Data
            </h4>
            <p className="text-[10px] text-[#49454F] leading-relaxed">
              Export all your registered courses, lecture hours, assignments, study logs, and notes to a clean JSON file for external backups.
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

          {/* OAuth Origin & Domain Diagnostic */}
          <OAuthDiagnosticPanel defaultExpanded={true} />

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
