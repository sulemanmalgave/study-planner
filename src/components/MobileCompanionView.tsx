import React, { useState, useEffect } from 'react';
import { 
  Smartphone, 
  QrCode, 
  CheckCircle2, 
  RefreshCw, 
  Unplug, 
  Sparkles, 
  Clock, 
  ShieldCheck, 
  Wifi, 
  X, 
  AlertCircle, 
  ArrowRight,
  ExternalLink,
  Info
} from 'lucide-react';
import QRCode from 'qrcode';
import { UserProfile, DatabaseSchema } from '../types';

interface MobileCompanionViewProps {
  profile: UserProfile;
  onUpgradeClick: () => void;
  dbState: DatabaseSchema | null;
  onRefreshState: () => void;
}

export default function MobileCompanionView({
  profile,
  onUpgradeClick,
  dbState,
  onRefreshState,
}: MobileCompanionViewProps) {
  const isPremium = profile.subscription.subscriptionStatus === 'premium' || profile.subscription.plan === 'premium';
  const mobileDevice = profile.mobileDevice;
  const isConnected = mobileDevice?.status === 'connected';

  // QR Modal & Pairing State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isGeneratingToken, setIsGeneratingToken] = useState<boolean>(false);
  const [pairToken, setPairToken] = useState<string | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [countdownSeconds, setCountdownSeconds] = useState<number>(300);
  const [pairingStatus, setPairingStatus] = useState<'idle' | 'pending' | 'paired' | 'expired'>('idle');
  const [pairingError, setPairingError] = useState<string | null>(null);

  // Sync state
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [isDisconnecting, setIsDisconnecting] = useState<boolean>(false);

  // Generate pairing session on demand
  const handleStartPairing = async () => {
    setIsModalOpen(true);
    setIsGeneratingToken(true);
    setPairingError(null);
    setPairingStatus('pending');
    setCountdownSeconds(300);

    try {
      const res = await fetch('/api/mobile-companion/create-pairing-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to create pairing session.');
      }

      const token = data.token;
      setPairToken(token);

      // Generate pairing URL pointing to current origin
      const baseUrl = window.location.origin.replace(/\/$/, '');
      const pairUrl = `${baseUrl}/mobile-pair?token=${token}`;

      // Generate QR Code data URL
      const qrDataUrl = await QRCode.toDataURL(pairUrl, {
        width: 280,
        margin: 2,
        color: {
          dark: '#21005D',
          light: '#FFFFFF',
        },
      });

      setQrCodeDataUrl(qrDataUrl);
      setIsGeneratingToken(false);
    } catch (err: any) {
      console.error('Error starting pairing session:', err);
      setPairingError(err.message || 'Unable to generate pairing code. Please try again.');
      setIsGeneratingToken(false);
      setPairingStatus('expired');
    }
  };

  // Poll pairing status when modal is open and pending
  useEffect(() => {
    if (!isModalOpen || !pairToken || pairingStatus !== 'pending') return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/mobile-companion/session-status?token=${pairToken}`);
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'paired') {
            setPairingStatus('paired');
            clearInterval(interval);
            setTimeout(() => {
              onRefreshState();
              setIsModalOpen(false);
            }, 1200);
          } else if (data.status === 'expired' || data.status === 'cancelled') {
            setPairingStatus('expired');
            clearInterval(interval);
          }
        }
      } catch (err) {
        console.warn('Status poll warning:', err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [isModalOpen, pairToken, pairingStatus]);

  // Countdown timer for 5-minute QR expiry
  useEffect(() => {
    if (!isModalOpen || pairingStatus !== 'pending') return;

    const timer = setInterval(() => {
      setCountdownSeconds((prev) => {
        if (prev <= 1) {
          setPairingStatus('expired');
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isModalOpen, pairingStatus]);

  // Cancel pairing session
  const handleCancelPairing = async () => {
    if (pairToken) {
      try {
        await fetch('/api/mobile-companion/cancel-pairing-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: pairToken }),
        });
      } catch (e) {}
    }
    setIsModalOpen(false);
    setPairToken(null);
    setQrCodeDataUrl(null);
  };

  // Manual Trigger Sync
  const handleManualSync = async () => {
    setIsSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch('/api/mobile-companion/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        onRefreshState();
        setSyncMessage('🟢 Synced successfully with server just now!');
        setTimeout(() => setSyncMessage(null), 3000);
      }
    } catch (e) {
      setSyncMessage('⚠️ Sync failed. Please check network connection.');
    } finally {
      setIsSyncing(false);
    }
  };

  // Disconnect Device
  const handleDisconnectDevice = async () => {
    if (!window.confirm('Are you sure you want to disconnect your mobile phone? You can re-pair it anytime.')) {
      return;
    }
    setIsDisconnecting(true);
    try {
      const res = await fetch('/api/mobile-companion/disconnect-device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        onRefreshState();
      }
    } catch (e) {
      alert('Failed to disconnect device.');
    } finally {
      setIsDisconnecting(false);
    }
  };

  // Helper formatting for seconds to MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // FREE PLAN SCREEN
  if (!isPremium) {
    return (
      <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-8 animate-fade-in" id="mobile-companion-free-view">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-[#E1E3E1] shadow-xs">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-[#EADDFF] flex items-center justify-center text-[#21005D] shrink-0 shadow-sm">
              <Smartphone className="w-7 h-7 text-[#6750A4]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-extrabold text-[#1D1B20]">Mobile Companion</h2>
                <span className="px-2.5 py-0.5 text-[10px] font-black bg-[#6750A4] text-white rounded-full uppercase tracking-wider">
                  Premium
                </span>
              </div>
              <p className="text-xs text-[#49454F] mt-0.5 max-w-lg">
                Connect your phone to keep your timetable, tasks, exams, and notes synchronized on the go.
              </p>
            </div>
          </div>
          <button
            onClick={onUpgradeClick}
            className="py-3 px-6 bg-[#6750A4] hover:bg-[#503E84] text-white text-xs font-extrabold rounded-full shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer shrink-0"
            id="mobile-companion-upgrade-btn"
          >
            <Sparkles className="w-4 h-4" />
            <span>Upgrade to Premium</span>
          </button>
        </div>

        {/* Feature Overview Card */}
        <div className="bg-gradient-to-br from-purple-50/80 via-white to-slate-50 p-8 rounded-3xl border border-[#D0BCFF]/60 space-y-6 shadow-xs text-left">
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-[#21005D]">Study Anywhere with Full Cross-Device Sync</h3>
            <p className="text-xs text-[#49454F] leading-relaxed max-w-2xl">
              Take your student planner with you everywhere. Pair your smartphone in seconds by scanning a secure QR code. No passwords required.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="p-4 bg-white rounded-2xl border border-slate-200/80 flex items-start gap-3 shadow-2xs">
              <div className="p-2.5 bg-purple-50 text-[#6750A4] rounded-xl shrink-0">
                <QrCode className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-[#1D1B20]">Instant QR Code Pairing</h4>
                <p className="text-[11px] text-[#49454F] mt-0.5 leading-normal">
                  Scan the QR code with your phone camera to securely link your device in seconds.
                </p>
              </div>
            </div>

            <div className="p-4 bg-white rounded-2xl border border-slate-200/80 flex items-start gap-3 shadow-2xs">
              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
                <Wifi className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-[#1D1B20]">Real-Time 2-Way Sync</h4>
                <p className="text-[11px] text-[#49454F] mt-0.5 leading-normal">
                  Edits made on your desktop update on your phone automatically, and vice-versa.
                </p>
              </div>
            </div>

            <div className="p-4 bg-white rounded-2xl border border-slate-200/80 flex items-start gap-3 shadow-2xs">
              <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl shrink-0">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-[#1D1B20]">Mobile Web App / PWA</h4>
                <p className="text-[11px] text-[#49454F] mt-0.5 leading-normal">
                  Install Study Planner on your mobile home screen for quick single-tap access.
                </p>
              </div>
            </div>

            <div className="p-4 bg-white rounded-2xl border border-slate-200/80 flex items-start gap-3 shadow-2xs">
              <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-[#1D1B20]">Offline Support</h4>
                <p className="text-[11px] text-[#49454F] mt-0.5 leading-normal">
                  View and update your schedule offline. Changes automatically sync when back online.
                </p>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200/60 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs text-[#49454F]">
              <Info className="w-4 h-4 text-[#6750A4] shrink-0" />
              <span>Mobile Companion is included free with all Premium subscriptions.</span>
            </div>

            <button
              onClick={onUpgradeClick}
              className="w-full sm:w-auto py-3 px-8 bg-[#6750A4] hover:bg-[#503E84] text-white text-xs font-bold rounded-full transition-all shadow-md cursor-pointer flex items-center justify-center gap-2"
              id="unlock-mobile-companion-btn"
            >
              <span>Unlock Mobile Companion</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // PREMIUM USER SCREEN
  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6 animate-fade-in" id="mobile-companion-premium-view">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-[#E1E3E1] shadow-xs">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#EADDFF] flex items-center justify-center text-[#21005D] shrink-0 shadow-sm">
            <Smartphone className="w-6 h-6 text-[#6750A4]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-extrabold text-[#1D1B20]">Mobile Companion</h2>
              <span className="px-2 py-0.5 text-[9px] font-extrabold bg-emerald-100 text-emerald-800 rounded-md uppercase tracking-wider">
                Premium Active
              </span>
            </div>
            <p className="text-xs text-[#49454F] mt-0.5">
              Connect your smartphone for seamless cross-device academic tracking.
            </p>
          </div>
        </div>

        {isConnected ? (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleManualSync}
              disabled={isSyncing}
              className="py-2 px-4 bg-slate-100 hover:bg-slate-200 text-[#1D1B20] text-xs font-bold rounded-full transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              id="manual-sync-btn"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-[#6750A4]' : 'text-slate-600'}`} />
              <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
            </button>

            <button
              onClick={handleStartPairing}
              className="py-2 px-4 bg-[#6750A4] hover:bg-[#503E84] text-white text-xs font-bold rounded-full transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
              id="add-device-btn"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>Show QR Code</span>
            </button>
          </div>
        ) : (
          <button
            onClick={handleStartPairing}
            className="py-3 px-6 bg-[#6750A4] hover:bg-[#503E84] text-white text-xs font-extrabold rounded-full shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer shrink-0"
            id="connect-phone-btn"
          >
            <QrCode className="w-4 h-4" />
            <span>Connect Phone</span>
          </button>
        )}
      </div>

      {syncMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800 font-bold flex items-center gap-2 animate-slide-down">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{syncMessage}</span>
        </div>
      )}

      {/* Connection Status Card */}
      <div className="bg-white p-6 rounded-3xl border border-[#E1E3E1] shadow-xs space-y-6 text-left">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <h3 className="text-sm font-extrabold text-[#1D1B20] uppercase tracking-wider">
            Connected Devices
          </h3>

          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
            <span className="text-xs font-bold text-[#1D1B20]">
              {isConnected ? 'Phone: Connected 🟢' : 'Phone: Not Connected ⚪'}
            </span>
          </div>
        </div>

        {isConnected && mobileDevice ? (
          <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <Smartphone className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-[#1D1B20]">{mobileDevice.name || 'My Smartphone'}</h4>
                  <span className="px-2 py-0.5 text-[9px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200/80 rounded uppercase">
                    Connected 🟢
                  </span>
                </div>
                <div className="text-[11px] text-[#49454F] space-y-0.5">
                  <p>Paired: {new Date(mobileDevice.pairedAt).toLocaleDateString()} at {new Date(mobileDevice.pairedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                  <p className="font-medium text-slate-600">Last Synced: {new Date(mobileDevice.lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-200/60">
              <button
                onClick={handleManualSync}
                disabled={isSyncing}
                className="px-3.5 py-2 bg-white hover:bg-slate-100 text-xs font-bold text-[#1D1B20] border border-slate-200/80 rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                id="device-sync-btn"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-[#6750A4]' : 'text-slate-600'}`} />
                <span>Sync Now</span>
              </button>

              <button
                onClick={handleDisconnectDevice}
                disabled={isDisconnecting}
                className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-xs font-bold text-rose-700 border border-rose-200/80 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                id="device-disconnect-btn"
              >
                <Unplug className="w-3.5 h-3.5 text-rose-600" />
                <span>Disconnect</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="p-8 bg-slate-50/70 border-2 border-dashed border-slate-200 rounded-3xl text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-[#EADDFF]/50 text-[#6750A4] flex items-center justify-center mx-auto">
              <Smartphone className="w-6 h-6" />
            </div>
            <div className="max-w-md mx-auto space-y-1">
              <h4 className="text-sm font-bold text-[#1D1B20]">No Phone Connected Yet</h4>
              <p className="text-xs text-[#49454F] leading-relaxed">
                Connect your mobile phone to access your study schedule, classes, tasks, and notes on the go.
              </p>
            </div>
            <button
              onClick={handleStartPairing}
              className="py-2.5 px-6 bg-[#6750A4] hover:bg-[#503E84] text-white text-xs font-bold rounded-full shadow-sm transition-all cursor-pointer inline-flex items-center gap-2"
              id="empty-connect-phone-btn"
            >
              <QrCode className="w-4 h-4" />
              <span>Connect Phone via QR Code</span>
            </button>
          </div>
        )}
      </div>

      {/* QR PAIRING MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-fade-in" id="qr-pairing-modal-backdrop">
          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 flex flex-col overflow-hidden text-slate-800" id="qr-pairing-modal-card">
            
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/80">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#EADDFF] flex items-center justify-center text-[#21005D]">
                  <QrCode className="w-4 h-4 text-[#6750A4]" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-[#1D1B20]">Connect Your Phone</h3>
                  <p className="text-[10px] text-[#49454F]">Scan QR Code to Pair</p>
                </div>
              </div>

              <button
                onClick={handleCancelPairing}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
                id="close-qr-modal-btn"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 text-center space-y-5">
              {isGeneratingToken ? (
                <div className="py-12 space-y-3">
                  <RefreshCw className="w-8 h-8 text-[#6750A4] animate-spin mx-auto" />
                  <p className="text-xs font-bold text-[#1D1B20]">Generating Secure Pairing Code...</p>
                </div>
              ) : pairingError ? (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-700 font-medium space-y-3">
                  <AlertCircle className="w-6 h-6 text-rose-500 mx-auto" />
                  <p>{pairingError}</p>
                  <button
                    onClick={handleStartPairing}
                    className="py-2 px-4 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-full transition-colors text-xs cursor-pointer"
                  >
                    Try Again
                  </button>
                </div>
              ) : pairingStatus === 'expired' ? (
                <div className="py-8 space-y-4">
                  <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
                    <Clock className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-[#1D1B20]">QR Code Expired</h4>
                    <p className="text-xs text-[#49454F]">
                      For security, connection codes expire after 5 minutes.
                    </p>
                  </div>
                  <button
                    onClick={handleStartPairing}
                    className="py-2.5 px-6 bg-[#6750A4] hover:bg-[#503E84] text-white text-xs font-bold rounded-full shadow-sm transition-all cursor-pointer inline-flex items-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Generate New QR Code</span>
                  </button>
                </div>
              ) : pairingStatus === 'paired' ? (
                <div className="py-10 space-y-3 animate-bounce">
                  <CheckCircle2 className="w-16 h-16 text-emerald-600 mx-auto" />
                  <h4 className="text-base font-extrabold text-[#1D1B20]">Phone Connected ✓</h4>
                  <p className="text-xs text-[#49454F]">Your phone is now synchronized with Study Planner.</p>
                </div>
              ) : (
                <>
                  {/* Display QR Code */}
                  <div className="p-4 bg-white rounded-2xl border-2 border-[#EADDFF] inline-block shadow-sm">
                    {qrCodeDataUrl ? (
                      <img 
                        src={qrCodeDataUrl} 
                        alt="Mobile Pairing QR Code" 
                        className="w-56 h-56 mx-auto object-contain"
                      />
                    ) : (
                      <div className="w-56 h-56 bg-slate-100 flex items-center justify-center text-xs text-slate-400">
                        Loading QR...
                      </div>
                    )}
                  </div>

                  {/* Countdown timer */}
                  <div className="flex items-center justify-center gap-1.5 text-xs text-slate-600 font-bold bg-slate-50 py-1.5 px-3 rounded-full w-max mx-auto border border-slate-200/80">
                    <Clock className="w-3.5 h-3.5 text-[#6750A4]" />
                    <span>QR code expires in {formatTime(countdownSeconds)}</span>
                  </div>

                  {/* Steps */}
                  <div className="p-4 bg-slate-50/80 rounded-2xl text-left text-xs space-y-2 border border-slate-200/60">
                    <div className="font-extrabold text-[#1D1B20] uppercase text-[10px] tracking-wider mb-1">
                      Pairing Instructions:
                    </div>
                    <ol className="space-y-1.5 text-[#49454F] font-medium text-[11px]">
                      <li className="flex items-center gap-2">
                        <span className="w-4 h-4 rounded-full bg-[#EADDFF] text-[#21005D] text-[10px] font-black flex items-center justify-center shrink-0">1</span>
                        <span>Open camera on your phone</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="w-4 h-4 rounded-full bg-[#EADDFF] text-[#21005D] text-[10px] font-black flex items-center justify-center shrink-0">2</span>
                        <span>Point camera at this QR code</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="w-4 h-4 rounded-full bg-[#EADDFF] text-[#21005D] text-[10px] font-black flex items-center justify-center shrink-0">3</span>
                        <span>Tap the link to open Study Planner</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="w-4 h-4 rounded-full bg-[#EADDFF] text-[#21005D] text-[10px] font-black flex items-center justify-center shrink-0">4</span>
                        <span>Tap "Connect Phone" to confirm</span>
                      </li>
                    </ol>
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between">
              <button
                onClick={handleStartPairing}
                disabled={isGeneratingToken || pairingStatus === 'paired'}
                className="py-2 px-4 text-xs font-bold text-[#6750A4] hover:bg-purple-50 rounded-full transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh QR Code</span>
              </button>

              <button
                onClick={handleCancelPairing}
                className="py-2 px-5 text-xs font-bold text-slate-600 hover:bg-slate-200/80 rounded-full transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
