import React, { useState } from 'react';
import { Settings, User, Globe, Sparkles, RefreshCw, Check, Loader2, AlertCircle, Lock } from 'lucide-react';
import { UserProfile, Subscription } from '../types';

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
  onTriggerUpgrade
}: SettingsViewProps) {
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [billingCountry, setBillingCountry] = useState(profile.subscription.billingCountry);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);

  const isPremium = profile.subscription.plan === 'premium';

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

      // Keep subscription in sync
      const subscriptionCopy = { ...profile.subscription, billingCountry };

      await onUpdateProfile({
        name,
        email,
        initials,
        subscription: subscriptionCopy
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
      .then(res => res.json())
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
        <div className="lg:col-span-8 bg-white border border-[#E1E3E1] rounded-2xl p-6">
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

            <div className="flex items-center gap-2 border-b border-[#E1E3E1] pb-3 pt-3">
              <Globe className="w-4 h-4 text-[#0f5132]" />
              <h3 className="text-xs font-bold text-[#1D1B20] uppercase tracking-wider">Billing Location Selector</h3>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] text-[#49454F] leading-relaxed max-w-lg">
                Choose your region to test local pricing API setups: India activates signature-verified Razorpay (INR), and international countries activate signature-verified PayPal (USD).
              </p>
              
              <div className="grid grid-cols-2 gap-2 max-w-md">
                <button
                  type="button"
                  onClick={() => setBillingCountry('IN')}
                  className={`p-3 text-xs font-medium rounded-xl border flex items-center justify-between transition-all ${
                    billingCountry === 'IN'
                      ? 'bg-[#EADDFF] border-[#6750A4] text-[#1D1B20]'
                      : 'bg-[#F3EDF7]/50 border-[#E1E3E1] text-[#49454F]'
                  }`}
                >
                  <span>🇮🇳 India (Razorpay)</span>
                  {billingCountry === 'IN' && <Check className="w-4 h-4 text-[#6750A4]" />}
                </button>
                <button
                  type="button"
                  onClick={() => setBillingCountry('US')}
                  className={`p-3 text-xs font-medium rounded-xl border flex items-center justify-between transition-all ${
                    billingCountry !== 'IN'
                      ? 'bg-[#EADDFF] border-[#6750A4] text-[#1D1B20]'
                      : 'bg-[#F3EDF7]/50 border-[#E1E3E1] text-[#49454F]'
                  }`}
                >
                  <span>🌎 International (PayPal)</span>
                  {billingCountry !== 'IN' && <Check className="w-4 h-4 text-[#6750A4]" />}
                </button>
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
                    <span>Period:</span>
                    <span className="text-[#1D1B20] font-bold">{profile.subscription.type}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Provider:</span>
                    <span className="text-[#1D1B20] font-bold uppercase">{profile.subscription.paymentProvider}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Payment ID:</span>
                    <span className="text-[#1D1B20] font-bold truncate max-w-[120px]" title={profile.subscription.paymentId || ''}>
                      {profile.subscription.paymentId}
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
            ) : (
              <div className="space-y-3" id="settings-free-details">
                <div className="text-xs font-bold text-[#49454F] uppercase">
                  Standard Free Account
                </div>
                <p className="text-[10px] text-[#49454F] leading-relaxed">
                  You are currently restricted to basic database bounds. Upgrade to Master Syllabus to remove limits.
                </p>
                <button
                  onClick={onTriggerUpgrade}
                  className="w-full py-2 bg-gradient-to-r from-amber-500 to-yellow-600 text-white font-extrabold text-xs rounded-xl shadow hover:brightness-110 transition-all"
                >
                  Upgrade Premium
                </button>
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

          {/* Developer Testing Control box */}
          <div className="p-5 bg-white border border-[#E1E3E1] rounded-2xl space-y-4">
            <h4 className="text-xs font-extrabold text-[#B3261E] uppercase tracking-wider border-b border-[#E1E3E1] pb-2">
              Developer Sandbox Control
            </h4>
            <p className="text-[10px] text-[#49454F] leading-relaxed">
              Reset database to purge all current entries, seed default screenshot examples, and restore the Free Account state.
            </p>
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
  );
}
