import React, { useState, useEffect } from 'react';
import { 
  Globe, 
  CheckCircle2, 
  AlertTriangle, 
  Copy, 
  Check, 
  ExternalLink, 
  Key, 
  ShieldCheck, 
  RefreshCw, 
  ChevronDown, 
  ChevronUp, 
  Info 
} from 'lucide-react';
import { GOOGLE_CLIENT_ID } from '../lib/googleAuth';

export const EXPECTED_PRODUCTION_DOMAIN = 'https://study-planner-tool.vercel.app';
export const EXPECTED_PRODUCTION_HOST = 'study-planner-tool.vercel.app';
export const GCP_PROJECT_ID = 'gen-lang-client-0198820455';
export const GCP_PROJECT_NUMBER = '446581031176';
export const FIREBASE_PROJECT_ID = 'ai-studio-digitalstudyplan';

interface OAuthDiagnosticPanelProps {
  className?: string;
  compact?: boolean;
  defaultExpanded?: boolean;
  title?: string;
  onClose?: () => void;
}

export default function OAuthDiagnosticPanel({
  className = '',
  compact = false,
  defaultExpanded = true,
  title = 'OAuth Origin & Domain Diagnostic',
}: OAuthDiagnosticPanelProps) {
  const [currentOrigin, setCurrentOrigin] = useState<string>('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [gisLoaded, setGisLoaded] = useState<boolean>(false);
  const [lastCheckTime, setLastCheckTime] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setCurrentOrigin(window.location.origin);
      setGisLoaded(Boolean(window.google?.accounts?.id));
    }
  }, []);

  const isProductionMatch = Boolean(
    currentOrigin && 
    currentOrigin.toLowerCase().replace(/\/$/, '') === EXPECTED_PRODUCTION_DOMAIN.toLowerCase().replace(/\/$/, '')
  );

  const handleCopy = async (text: string, key: string) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const handleRunPreflightCheck = () => {
    setIsChecking(true);
    setTimeout(() => {
      if (typeof window !== 'undefined') {
        setCurrentOrigin(window.location.origin);
        setGisLoaded(Boolean(window.google?.accounts?.id));
        setLastCheckTime(new Date().toLocaleTimeString());
      }
      setIsChecking(false);
    }, 400);
  };

  const cloudConsoleUrl = `https://console.cloud.google.com/apis/credentials?project=${GCP_PROJECT_ID}`;
  const firebaseAuthUrl = `https://console.firebase.google.com/project/${FIREBASE_PROJECT_ID}/authentication/settings`;
  const firebaseProvidersUrl = `https://console.firebase.google.com/project/${FIREBASE_PROJECT_ID}/authentication/providers`;

  return (
    <div 
      className={`bg-white border rounded-2xl shadow-xs transition-all overflow-hidden ${
        isProductionMatch ? 'border-emerald-200' : 'border-amber-200'
      } ${className}`}
      id="oauth-diagnostic-panel"
    >
      {/* Header */}
      <div 
        className={`px-4 py-3 flex items-center justify-between cursor-pointer select-none ${
          isProductionMatch ? 'bg-emerald-50/70 hover:bg-emerald-50' : 'bg-amber-50/70 hover:bg-amber-50'
        }`}
        onClick={() => setIsExpanded(!isExpanded)}
        id="oauth-diagnostic-header"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`p-1.5 rounded-lg shrink-0 ${isProductionMatch ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
            <Globe className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-900 tracking-tight">
                {title}
              </span>
              <span 
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider inline-flex items-center gap-1 ${
                  isProductionMatch 
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300/60' 
                    : 'bg-amber-100 text-amber-800 border border-amber-300/60'
                }`}
                id="oauth-match-status-badge"
              >
                {isProductionMatch ? (
                  <>
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    <span>Production Domain Match</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-3 h-3 text-amber-600" />
                    <span>Non-Production Origin</span>
                  </>
                )}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 truncate mt-0.5 font-mono">
              Current: {currentOrigin || 'Detecting origin...'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleRunPreflightCheck();
            }}
            disabled={isChecking}
            title="Refresh diagnostic check"
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-white rounded-lg transition-colors cursor-pointer"
            id="oauth-diagnostic-refresh-btn"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
          </button>
          <div className="p-1 text-slate-400">
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>
      </div>

      {/* Expanded Body */}
      {isExpanded && (
        <div className="p-4 space-y-4 text-xs text-slate-700 bg-white" id="oauth-diagnostic-body">
          {/* Comparison Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Current Active Origin */}
            <div className={`p-3 rounded-xl border ${isProductionMatch ? 'bg-slate-50/80 border-slate-200' : 'bg-amber-50/40 border-amber-200'}`}>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Current window.location.origin
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(currentOrigin, 'currentOrigin')}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                  id="copy-current-origin-btn"
                >
                  {copiedKey === 'currentOrigin' ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-600" />
                      <span className="text-emerald-600">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy Origin</span>
                    </>
                  )}
                </button>
              </div>
              <div className="font-mono text-xs font-semibold text-slate-900 bg-white p-2 rounded-lg border border-slate-200/80 break-all select-all">
                {currentOrigin || 'Checking window object...'}
              </div>
              <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                <Info className="w-3 h-3 shrink-0" />
                <span>Runtime host serving this browser session</span>
              </div>
            </div>

            {/* Expected Production Origin */}
            <div className="p-3 rounded-xl border bg-slate-50/80 border-slate-200">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Expected Production Domain
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(EXPECTED_PRODUCTION_DOMAIN, 'expectedOrigin')}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                  id="copy-expected-origin-btn"
                >
                  {copiedKey === 'expectedOrigin' ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-600" />
                      <span className="text-emerald-600">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy Domain</span>
                    </>
                  )}
                </button>
              </div>
              <div className="font-mono text-xs font-semibold text-emerald-950 bg-white p-2 rounded-lg border border-emerald-200/80 break-all select-all">
                {EXPECTED_PRODUCTION_DOMAIN}
              </div>
              <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                <ShieldCheck className="w-3 h-3 shrink-0 text-emerald-600" />
                <span>Required in Google Cloud Authorized Origins</span>
              </div>
            </div>
          </div>

          {/* Diagnostic Evaluation Banner */}
          {isProductionMatch ? (
            <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-xl text-emerald-900 space-y-1">
              <div className="flex items-center gap-2 font-bold text-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Domain Match Confirmed</span>
              </div>
              <p className="text-[11px] text-emerald-800 leading-relaxed pl-6">
                You are accessing the application directly from the verified production origin. Ensure <code className="bg-emerald-100/80 px-1 py-0.5 rounded font-mono text-[10px] font-bold text-emerald-950">{EXPECTED_PRODUCTION_DOMAIN}</code> has been saved in your Google Cloud Console Web OAuth Client credentials.
              </p>
            </div>
          ) : (
            <div className="p-3 bg-amber-50/90 border border-amber-200 rounded-xl text-amber-950 space-y-1">
              <div className="flex items-center gap-2 font-bold text-xs">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Origin Mismatch Notice for this Environment</span>
              </div>
              <p className="text-[11px] text-amber-900 leading-relaxed pl-6">
                Your browser is currently running on <code className="bg-amber-100/80 px-1 py-0.5 rounded font-mono text-[10px] font-bold text-amber-950 break-all">{currentOrigin}</code> instead of production.
              </p>
              <p className="text-[11px] text-amber-800 leading-relaxed pl-6">
                Google OAuth will reject sign-in attempts on this preview URL with <code className="font-mono text-[10px] bg-amber-100 px-1 py-0.5 rounded">400: origin_mismatch</code> unless this preview URL is also registered as an authorized origin, or unless you test on the live production URL.
              </p>
            </div>
          )}

          {/* Credentials Info Table */}
          <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/50 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-slate-500" />
                OAuth Client Identification
              </span>
              <button
                type="button"
                onClick={() => handleCopy(GOOGLE_CLIENT_ID, 'clientId')}
                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-1 cursor-pointer"
                id="copy-client-id-btn"
              >
                {copiedKey === 'clientId' ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-600" />
                    <span className="text-emerald-600">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Copy Client ID</span>
                  </>
                )}
              </button>
            </div>

            <div className="space-y-1.5 text-[11px]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 py-1 border-b border-slate-200/60 font-mono">
                <span className="text-slate-500 font-sans">Client ID:</span>
                <span className="text-slate-900 select-all break-all text-[10px] sm:text-[11px] font-semibold">
                  {GOOGLE_CLIENT_ID}
                </span>
              </div>
              <div className="flex items-center justify-between gap-1 py-1 border-b border-slate-200/60 font-mono">
                <span className="text-slate-500 font-sans">GCP Project ID:</span>
                <span className="text-slate-900 font-semibold">{GCP_PROJECT_ID}</span>
              </div>
              <div className="flex items-center justify-between gap-1 py-1 font-mono">
                <span className="text-slate-500 font-sans">Google Identity Script:</span>
                <span className={`font-semibold ${gisLoaded ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {gisLoaded ? '● Loaded (window.google.accounts.id available)' : '○ Initializing...'}
                </span>
              </div>
            </div>
          </div>

          {/* Firebase Authentication Configuration Guide */}
          <div className="border border-purple-200 rounded-xl p-3.5 bg-purple-50/40 space-y-3" id="firebase-auth-config-guide">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-purple-900 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-purple-600" />
                Firebase Auth &amp; Authorized Domains Setup
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                Project: {FIREBASE_PROJECT_ID}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-[11px]">
              {/* Step 1: Enable Email Link */}
              <div className="p-2.5 bg-white rounded-lg border border-purple-100 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 flex items-center gap-1">
                    <span className="w-4 h-4 rounded-full bg-purple-600 text-white text-[10px] inline-flex items-center justify-center font-bold">1</span>
                    Enable Email Link (Passwordless)
                  </span>
                  <a
                    href={firebaseProvidersUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] font-bold text-purple-600 hover:text-purple-800 inline-flex items-center gap-0.5"
                  >
                    <span>Open</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  Go to <strong>Authentication &gt; Sign-in method &gt; Email/Password</strong>. Toggle on <em>Email / Password</em> and check <strong>Email link (passwordless sign-in)</strong>, then Save.
                </p>
              </div>

              {/* Step 2: Add Authorized Domain */}
              <div className="p-2.5 bg-white rounded-lg border border-purple-100 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 flex items-center gap-1">
                    <span className="w-4 h-4 rounded-full bg-purple-600 text-white text-[10px] inline-flex items-center justify-center font-bold">2</span>
                    Add Authorized Domain
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(EXPECTED_PRODUCTION_HOST, 'prodHost')}
                    className="text-[10px] font-bold text-purple-600 hover:text-purple-800 inline-flex items-center gap-1 cursor-pointer"
                    id="copy-prod-host-btn"
                  >
                    {copiedKey === 'prodHost' ? (
                      <>
                        <Check className="w-2.5 h-2.5 text-emerald-600" />
                        <span className="text-emerald-600">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-2.5 h-2.5" />
                        <span>Copy Host</span>
                      </>
                    )}
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  Go to <strong>Authentication &gt; Settings &gt; Authorized domains</strong>. Click <em>Add domain</em> and enter <code className="font-mono font-bold text-purple-900 bg-purple-50 px-1 py-0.5 rounded">{EXPECTED_PRODUCTION_HOST}</code>.
                </p>
              </div>
            </div>
          </div>

          {!compact && (
            /* Direct Action Links */
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
              <a
                href={cloudConsoleUrl}
                target="_blank"
                rel="noreferrer"
                className="py-2 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors text-center"
                id="open-gcp-console-link"
              >
                <span>Google Cloud Credentials</span>
                <ExternalLink className="w-3 h-3" />
              </a>

              <a
                href={firebaseProvidersUrl}
                target="_blank"
                rel="noreferrer"
                className="py-2 px-3 bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors text-center"
                id="open-firebase-providers-link"
              >
                <span>Enable Email Link</span>
                <ExternalLink className="w-3 h-3" />
              </a>

              <a
                href={firebaseAuthUrl}
                target="_blank"
                rel="noreferrer"
                className="py-2 px-3 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors text-center"
                id="open-firebase-console-link"
              >
                <span>Authorized Domains</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}

          {lastCheckTime && (
            <p className="text-[10px] text-slate-400 text-right">
              Last checked: {lastCheckTime}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
