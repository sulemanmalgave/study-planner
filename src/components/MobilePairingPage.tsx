import React, { useState, useEffect } from 'react';
import { 
  Smartphone, 
  CheckCircle2, 
  AlertCircle, 
  Download, 
  ArrowRight, 
  Loader2, 
  ShieldCheck, 
  X,
  Share2
} from 'lucide-react';

interface MobilePairingPageProps {
  token: string;
  onPairingComplete: () => void;
  onCancel: () => void;
}

export default function MobilePairingPage({ token, onPairingComplete, onCancel }: MobilePairingPageProps) {
  const [status, setStatus] = useState<'verifying' | 'valid' | 'invalid' | 'premium_expired' | 'connecting' | 'connected'>('verifying');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [isIOS, setIsIOS] = useState<boolean>(false);

  // Capture PWA Install Prompt
  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    if (window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone) {
      setIsInstalled(true);
    }

    const userAgent = window.navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(userAgent)) {
      setIsIOS(true);
    }

    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  // Verify pairing token on load
  useEffect(() => {
    if (!token) {
      setStatus('invalid');
      setErrorMessage('No connection token provided.');
      return;
    }

    const verifyToken = async () => {
      try {
        const res = await fetch(`/api/mobile-companion/verify-pairing-token?token=${token}`);
        const data = await res.json();

        if (data.valid) {
          setStatus('valid');
        } else if (data.reason === 'PREMIUM_EXPIRED') {
          setStatus('premium_expired');
          setErrorMessage(data.message || 'Mobile Companion requires an active Premium subscription.');
        } else {
          setStatus('invalid');
          setErrorMessage(data.message || 'This connection code is no longer valid or has expired. Please generate a new code on your desktop.');
        }
      } catch (err) {
        setStatus('invalid');
        setErrorMessage('Failed to connect to server. Please check your internet connection.');
      }
    };

    verifyToken();
  }, [token]);

  // Handle user clicking "Connect Phone"
  const handleConfirmPairing = async () => {
    setStatus('connecting');
    try {
      const res = await fetch('/api/mobile-companion/confirm-pairing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          deviceName: navigator.userAgent.includes('iPhone') ? 'iPhone' : 'Android Phone',
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        if (data.deviceToken) {
          localStorage.setItem('studyflow_mobile_device_token', data.deviceToken);
        }
        setStatus('connected');
      } else {
        setStatus('invalid');
        setErrorMessage(data.message || 'Failed to complete phone pairing.');
      }
    } catch (err) {
      setStatus('invalid');
      setErrorMessage('Network error while confirming pairing.');
    }
  };

  // Trigger PWA Install
  const handleInstallPWA = async () => {
    if (installPrompt) {
      installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setIsInstalled(true);
      }
      setInstallPrompt(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4 text-slate-800">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl border border-slate-200/80 overflow-hidden text-center p-6 space-y-6 animate-fade-in">
        
        {/* Top Brand Logo */}
        <div className="flex items-center justify-center gap-2">
          <img 
            src={`${(import.meta.env.BASE_URL || '/').replace(/\/$/, '')}/logo.png`}
            alt="Study Planner Logo" 
            className="w-10 h-10 rounded-xl object-cover shadow-xs border border-slate-200/80" 
            referrerPolicy="no-referrer"
            onError={(e) => {
              const target = e.currentTarget;
              const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
              if (!target.dataset.triedFallback) {
                target.dataset.triedFallback = '1';
                target.src = `${base}/logo.jpg`;
              } else if (target.dataset.triedFallback === '1') {
                target.dataset.triedFallback = '2';
                target.src = `${base}/icon-512.png`;
              }
            }}
          />
          <div className="text-left min-w-0">
            <h1 className="text-sm font-extrabold text-[#1D1B20] tracking-tight">Study Planner</h1>
            <span className="text-[9px] font-mono font-bold text-[#6750A4] uppercase">Mobile Companion</span>
          </div>
        </div>

        {/* VERIFYING */}
        {status === 'verifying' && (
          <div className="py-12 space-y-3">
            <Loader2 className="w-8 h-8 text-[#6750A4] animate-spin mx-auto" />
            <p className="text-xs font-bold text-[#1D1B20]">Verifying Connection Code...</p>
          </div>
        )}

        {/* INVALID OR EXPIRED */}
        {status === 'invalid' && (
          <div className="py-6 space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <AlertCircle className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-extrabold text-[#1D1B20]">Code Invalid or Expired</h2>
              <p className="text-xs text-[#49454F] leading-relaxed px-2">
                {errorMessage || 'This connection code is no longer valid or has expired. Please generate a new code on your desktop.'}
              </p>
            </div>
            <button
              onClick={onCancel}
              className="w-full py-3 bg-[#6750A4] hover:bg-[#503E84] text-white text-xs font-bold rounded-full transition-all shadow-sm cursor-pointer"
            >
              Go to Study Planner
            </button>
          </div>
        )}

        {/* PREMIUM EXPIRED */}
        {status === 'premium_expired' && (
          <div className="py-6 space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
              <AlertCircle className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-extrabold text-[#1D1B20]">Premium Required</h2>
              <p className="text-xs text-[#49454F] leading-relaxed">
                Mobile Companion is a Premium feature. Please renew Premium on desktop to continue syncing.
              </p>
            </div>
            <button
              onClick={onCancel}
              className="w-full py-3 bg-[#6750A4] hover:bg-[#503E84] text-white text-xs font-bold rounded-full transition-all shadow-sm cursor-pointer"
            >
              Continue to Desktop App
            </button>
          </div>
        )}

        {/* VALID - CONFIRMATION SCREEN */}
        {status === 'valid' && (
          <div className="py-4 space-y-5">
            <div className="w-16 h-16 rounded-3xl bg-[#EADDFF] text-[#21005D] flex items-center justify-center mx-auto shadow-sm">
              <Smartphone className="w-8 h-8 text-[#6750A4]" />
            </div>

            <div className="space-y-1">
              <h2 className="text-lg font-extrabold text-[#1D1B20]">Connect to Study Planner</h2>
              <p className="text-xs text-[#49454F] leading-relaxed px-2">
                Your Windows Study Planner wants to connect this phone to synchronize your schedule, tasks, and notes.
              </p>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 text-xs space-y-1 text-left">
              <div className="flex justify-between items-center text-slate-500">
                <span>Source Device:</span>
                <span className="font-bold text-[#1D1B20]">Windows Study Planner</span>
              </div>
              <div className="flex justify-between items-center text-slate-500">
                <span>Sync Type:</span>
                <span className="font-bold text-emerald-600">Real-Time 2-Way Sync</span>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <button
                onClick={handleConfirmPairing}
                className="w-full py-3.5 bg-[#6750A4] hover:bg-[#503E84] text-white text-xs font-extrabold rounded-full transition-all shadow-md cursor-pointer flex items-center justify-center gap-2"
                id="confirm-mobile-pair-btn"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Connect Phone</span>
              </button>

              <button
                onClick={onCancel}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-full transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* CONNECTING */}
        {status === 'connecting' && (
          <div className="py-12 space-y-3">
            <Loader2 className="w-8 h-8 text-[#6750A4] animate-spin mx-auto" />
            <p className="text-xs font-bold text-[#1D1B20]">Connecting Phone to Windows Study Planner...</p>
          </div>
        )}

        {/* CONNECTED SUCCESS */}
        {status === 'connected' && (
          <div className="py-4 space-y-5">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-sm animate-bounce">
              <CheckCircle2 className="w-9 h-9" />
            </div>

            <div className="space-y-1">
              <h2 className="text-lg font-extrabold text-[#1D1B20]">Phone Connected ✓</h2>
              <p className="text-xs text-[#49454F]">
                Your phone is now synchronized with Study Planner.
              </p>
            </div>

            {/* PWA Install Banner */}
            {!isInstalled && (
              <div className="p-4 bg-purple-50/80 rounded-2xl border border-[#D0BCFF]/60 text-left space-y-3">
                <div className="flex items-start gap-3">
                  <Download className="w-5 h-5 text-[#6750A4] shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <h4 className="text-xs font-bold text-[#1D1B20]">Install Mobile Web App</h4>
                    <p className="text-[11px] text-[#49454F]">
                      Install Study Planner on your phone home screen for quick single-tap access.
                    </p>
                  </div>
                </div>

                {installPrompt ? (
                  <button
                    onClick={handleInstallPWA}
                    className="w-full py-2.5 bg-[#6750A4] hover:bg-[#503E84] text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-xs flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    <span>Install Study Planner</span>
                  </button>
                ) : isIOS ? (
                  <div className="p-2.5 bg-white rounded-xl border border-slate-200/80 text-[10px] text-slate-600 flex items-center gap-2">
                    <Share2 className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>To install: Tap Safari Share icon ➔ "Add to Home Screen"</span>
                  </div>
                ) : null}
              </div>
            )}

            <button
              onClick={onPairingComplete}
              className="w-full py-3.5 bg-[#6750A4] hover:bg-[#503E84] text-white text-xs font-extrabold rounded-full transition-all shadow-md cursor-pointer flex items-center justify-center gap-2"
              id="open-mobile-planner-btn"
            >
              <span>Open Mobile Study Planner</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
