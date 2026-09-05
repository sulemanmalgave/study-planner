import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Check, Sparkles, ShieldCheck, Zap, CreditCard, ArrowRight, Loader2, AlertCircle, Globe, UserCheck, LogIn, RefreshCw } from 'lucide-react';
import { Subscription } from '../types';
import { 
  getCountryConfig, 
  GATEWAY_CONFIGS, 
  detectUserCountry, 
  PlanOption 
} from '../lib/paymentConfig';
import { modalBackdropVariants, modalPanelVariants } from '../lib/animations';
import { AuthUserProfile } from '../lib/firebase';
import { 
  renderGoogleButton, 
  promptGoogleAccountChooser, 
  triggerInteractiveGoogleLogin,
  initGoogleIdentityServices
} from '../lib/googleAuth';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (updatedSubscription: Subscription) => void;
  currentCountry?: string;
  limitReason?: string;
  onOpenRestore?: () => void;
  authUser?: AuthUserProfile | null;
  onSignInWithGoogle?: () => Promise<AuthUserProfile>;
}

declare global {
  interface Window {
    Razorpay?: any;
    paypal?: any;
  }
}

// Helper function to safely fetch API JSON responses
const safeFetchJson = async (url: string, options?: RequestInit) => {
  let response: Response;
  try {
    response = await fetch(url, options);
  } catch (netErr: any) {
    throw new Error(`Connection error: ${netErr.message || 'Unable to reach backend server'}`);
  }

  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  let data: any = null;
  if (isJson) {
    try {
      data = await response.json();
    } catch (parseErr) {
      throw new Error('Server response could not be parsed as JSON.');
    }
  } else {
    const rawText = await response.text();
    console.error(`[API Non-JSON Response] ${url} returned HTTP ${response.status}:`, rawText.slice(0, 300));
    if (response.status === 404) {
      throw new Error('Payment API endpoint not found (HTTP 404). Please verify backend server route.');
    }
    throw new Error(`Server returned HTTP ${response.status} (${response.statusText}) instead of JSON.`);
  }

  if (!response.ok) {
    const code = data?.code || data?.error || `HTTP_${response.status}`;
    const name = data?.name || 'Request Failed';
    const desc = data?.description || data?.message || data?.error || `Server request failed with status ${response.status}`;
    const fix = data?.suggestedFix || '';
    
    const formattedMsg = `[${name} (${code})]: ${desc}${fix ? ` — Fix: ${fix}` : ''}`;
    const formattedError: any = new Error(formattedMsg);
    formattedError.code = code;
    formattedError.name = name;
    formattedError.description = desc;
    formattedError.suggestedFix = fix;
    throw formattedError;
  }

  return data;
};

export default function UpgradeModal({ 
  isOpen, 
  onClose, 
  onSuccess, 
  limitReason,
  onOpenRestore,
  authUser,
  onSignInWithGoogle,
}: UpgradeModalProps) {
  const [billingCountry, setBillingCountry] = useState<string>('US');
  const [selectedPlanId, setSelectedPlanId] = useState<'monthly' | 'quarterly' | 'yearly'>('yearly');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentSuccessMessage, setPaymentSuccessMessage] = useState<string | null>(null);
  const [isGisButtonRendered, setIsGisButtonRendered] = useState<boolean>(false);
  const gisButtonRef = useRef<HTMLDivElement>(null);

  // Auto-detect billing country on modal mount or when opening
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setPaymentSuccessMessage(null);
      
      detectUserCountry().then((detected) => {
        const countryCode = detected === 'IN' ? 'IN' : 'US';
        setBillingCountry(countryCode);
        setSelectedPlanId('yearly');
      });
    }
  }, [isOpen]);

  // Render Google Identity Services Button when modal is open and user is not yet signed in
  useEffect(() => {
    let isMounted = true;
    if (isOpen && !authUser && gisButtonRef.current) {
      // Small timeout to allow modal animation to place the DOM element
      const timer = setTimeout(() => {
        if (!isMounted || !gisButtonRef.current) return;
        renderGoogleButton(gisButtonRef.current, {
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'rectangular',
          width: 300,
        }).then((rendered) => {
          if (isMounted) {
            setIsGisButtonRendered(rendered);
          }
        }).catch((err) => {
          console.warn('[UpgradeModal] GIS button render warning:', err);
        });
      }, 100);

      return () => {
        isMounted = false;
        clearTimeout(timer);
      };
    }
  }, [isOpen, authUser]);

  // Derive current country config and gateway config dynamically
  const countryConfig = getCountryConfig(billingCountry);
  const isIndia = countryConfig.code === 'IN';
  const activeGateway = GATEWAY_CONFIGS[countryConfig.gateway];
  const plans = countryConfig.plans;

  // Selected plan object
  const activePlan = plans.find(p => p.id === selectedPlanId) || plans[0];

  const handleGoogleSignIn = async () => {
    setError(null);
    setIsSigningIn(true);
    try {
      if (onSignInWithGoogle) {
        await onSignInWithGoogle();
      } else {
        await triggerInteractiveGoogleLogin(20000);
      }
    } catch (err: any) {
      console.error('[Google Sign-In Error]', err);
      const isTimeout = err?.message?.includes('timed out');
      const isBlocked = err?.code === 'auth/popup-blocked' || err?.message?.includes('popup') || err?.message?.includes('blocked');
      const message = isBlocked
        ? 'Sign-in popup was blocked by browser. Please allow popups or use the Google Sign-in button directly.'
        : isTimeout
        ? 'Google sign-in timed out. Please click "Try Again" below to reconnect.'
        : (err?.message || 'Google sign-in could not be completed. Please try again.');
      setError(message);
    } finally {
      setIsSigningIn(false);
    }
  };

  // Load Razorpay Checkout SDK dynamically
  const loadRazorpayScript = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (window.Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  // Load PayPal SDK dynamically
  const loadPaypalScript = (clientId: string): Promise<boolean> => {
    return new Promise((resolve) => {
      if (window.paypal) {
        resolve(true);
        return;
      }
      const existingScript = document.getElementById('paypal-sdk-script');
      if (existingScript) {
        if (window.paypal) {
          resolve(true);
          return;
        }
        existingScript.addEventListener('load', () => resolve(true));
        existingScript.addEventListener('error', () => resolve(false));
        return;
      }
      const script = document.createElement('script');
      script.id = 'paypal-sdk-script';
      script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=USD&enable-funding=venmo,paylater`;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  // Verify transaction on backend
  const handleVerifyPaymentOnBackend = async (payload: {
    orderId: string;
    paymentId?: string;
    signature?: string;
    provider: 'razorpay' | 'paypal';
  }) => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authUser?.uid) {
        headers['x-user-id'] = authUser.uid;
      }
      if (authUser?.email) {
        headers['x-user-email'] = authUser.email;
      }

      const data = await safeFetchJson('/api/subscription/verify-payment', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...payload,
          userId: authUser?.uid,
          userEmail: authUser?.email,
        }),
      });

      setPaymentSuccessMessage('🎉 Payment verified successfully! Welcome to Study Planner Premium.');
      if (onSuccess && data.subscription) {
        onSuccess(data.subscription);
      }

      setTimeout(() => {
        setIsLoading(false);
        onClose();
      }, 1500);
    } catch (err: any) {
      const displayErr = err?.message || 'Payment verification failed. Please contact support.';
      console.error('[Verify Payment Error]', err);
      setError(displayErr);
      setIsLoading(false);
    }
  };

  // Execute checkout
  const handleCheckout = async () => {
    if (!authUser) {
      setError('Please sign in with Google first so your Premium subscription is permanently linked to your account.');
      await handleGoogleSignIn();
      return;
    }

    setIsLoading(true);
    setError(null);
    setPaymentSuccessMessage(null);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authUser.uid) {
        headers['x-user-id'] = authUser.uid;
      }
      if (authUser.email) {
        headers['x-user-email'] = authUser.email;
      }

      // 1. Create order on secure backend
      const orderData = await safeFetchJson('/api/subscription/create-order', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          planType: activePlan.id,
          country: billingCountry,
          userId: authUser.uid,
          userEmail: authUser.email,
        }),
      });

      const { orderId, provider, keyId, amount, currency } = orderData;

      if (provider === 'razorpay') {
        const isScriptLoaded = await loadRazorpayScript();

        if (isScriptLoaded && window.Razorpay) {
          const options = {
            key: keyId,
            amount: Math.round(amount * 100), // in paise
            currency: currency,
            name: 'Study Planner Premium',
            description: `${activePlan.title} (${activePlan.formattedPrice})`,
            order_id: orderId,
            handler: async function (response: any) {
              await handleVerifyPaymentOnBackend({
                orderId,
                paymentId: response.razorpay_payment_id,
                signature: response.razorpay_signature,
                provider: 'razorpay',
              });
            },
            prefill: {
              name: authUser.displayName || 'Student User',
              email: authUser.email || 'student@studyplanner.app',
            },
            theme: {
              color: '#6750A4',
            },
            modal: {
              ondismiss: function () {
                setIsLoading(false);
              },
            },
          };

          const rzp = new window.Razorpay(options);
          rzp.open();
        } else {
          throw new Error('Razorpay Checkout SDK failed to load. Please check your network connection.');
        }
      } else {
        // PayPal Gateway Flow
        const isPaypalLoaded = await loadPaypalScript(keyId);

        if (isPaypalLoaded && window.paypal) {
          const container = document.getElementById('paypal-button-container');
          if (container) {
            container.innerHTML = '';
          }

          window.paypal.Buttons({
            createOrder: () => orderId,
            onApprove: async (data: any) => {
              await handleVerifyPaymentOnBackend({
                orderId: data.orderID,
                provider: 'paypal',
              });
            },
            onError: (err: any) => {
              console.error('[PayPal Checkout Error Detail]', err);
              const detailStr = typeof err === 'string' ? err : err?.message || JSON.stringify(err);
              setError(`PayPal Checkout Error: ${detailStr}`);
              setIsLoading(false);
            },
            onCancel: () => {
              setIsLoading(false);
            }
          }).render('#paypal-button-container');

          setIsLoading(false);
        } else {
          // Direct verification fallback if script fails to load
          await handleVerifyPaymentOnBackend({
            orderId,
            provider: 'paypal',
          });
        }
      }
    } catch (err: any) {
      console.error('Checkout error:', err);
      const displayErr = err?.message || 'Payment initiation failed. Please try again.';
      setError(displayErr);
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" id="upgrade-modal-backdrop">
          <motion.div
            variants={modalBackdropVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="fixed inset-0 bg-slate-900/80 backdrop-blur-md"
            onClick={onClose}
          />
          <motion.div 
            variants={modalPanelVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-100 flex flex-col max-h-[92vh] overflow-hidden text-slate-800 z-10" 
            id="upgrade-modal-card"
          >
            
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/70 shrink-0">
              <div className="flex items-center gap-2.5">
                <img 
                  src={`${(import.meta.env.BASE_URL || '/').replace(/\/$/, '')}/logo.png`}
                  alt="Study Planner Logo" 
                  className="w-9 h-9 rounded-xl object-cover shadow-sm border border-slate-200/80 shrink-0" 
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
                <div>
                  <h3 className="text-base font-bold text-[#1D1B20] tracking-tight flex items-center gap-1.5">
                    <span>Study Planner Premium</span>
                    <Sparkles className="w-4 h-4 text-[#6750A4]" />
                  </h3>
                  <p className="text-[11px] text-[#49454F]">Unlock unlimited academic potential</p>
                </div>
              </div>
              <button 
                onClick={onClose} 
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors btn-press cursor-pointer"
                id="close-upgrade-modal-btn"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5 text-left">
              
              {/* Limit Notice if triggered by feature cap */}
              {limitReason && (
                <div className="p-3.5 bg-amber-50 border border-amber-200/80 rounded-2xl flex items-start gap-3 text-amber-900 animate-slide-down">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5 text-xs">
                    <span className="font-bold">Free Plan Limit Reached</span>
                    <p className="text-[#49454F] leading-relaxed">{limitReason}</p>
                  </div>
                </div>
              )}

              {/* Billing Region Information (Non-interactive) */}
              <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-1 text-xs" id="billing-region-info">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-bold text-[#1D1B20]">
                    <Globe className="w-4 h-4 text-[#6750A4]" />
                    <span>Billing Region:</span>
                  </div>
                  <span className="font-extrabold text-[#1D1B20] bg-white px-2.5 py-1 rounded-lg border border-slate-200/60 shadow-2xs">
                    {isIndia ? '🇮🇳 India (₹ INR)' : '🌎 International ($ USD)'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 font-medium">
                  Prices are automatically determined based on your location.
                </p>
              </div>

              {/* Plan Duration Cards */}
              <div className="space-y-2.5">
                <label className="text-xs font-bold text-[#1D1B20] uppercase tracking-wider">Choose Subscription Plan</label>
                <div className="grid grid-cols-2 gap-3" id="plan-selection-cards">
                  
                  {plans.map((plan: PlanOption) => {
                    const isSelected = selectedPlanId === plan.id;
                    return (
                      <div
                        key={plan.id}
                        onClick={() => setSelectedPlanId(plan.id)}
                        className={`p-4 rounded-2xl border cursor-pointer transition-all relative space-y-2 card-interactive ${
                          isSelected
                            ? 'border-[#6750A4] bg-[#F3EDF7]/80 ring-2 ring-[#6750A4]/20 shadow-sm'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                        id={`select-plan-${plan.id}-card`}
                      >
                        {plan.badge && (
                          <span className="absolute -top-2.5 right-3 px-2 py-0.5 text-[9px] font-black bg-[#6750A4] text-white rounded-full uppercase shadow-sm tracking-wider">
                            {plan.badge} • {plan.savingsText}
                          </span>
                        )}

                        <div className="flex justify-between items-start">
                          <span className="text-xs font-bold text-[#1D1B20]">{plan.title}</span>
                          <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${
                            isSelected ? 'border-[#6750A4] bg-[#6750A4]' : 'border-slate-300'
                          }`}>
                            {isSelected && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                          </div>
                        </div>

                        <div>
                          <div className="text-lg font-black text-[#1D1B20]">{plan.formattedPrice}</div>
                          <div className="text-[10px] text-[#49454F] font-medium">{plan.billingText}</div>
                          {plan.monthlyEquivalent && (
                            <div className="text-[10px] text-[#0f5132] font-semibold mt-0.5">
                              {plan.monthlyEquivalent} equivalent
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                </div>
              </div>

              {/* Account Association Section - Required for Premium */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                  <span>Google Account Requirement</span>
                  <span className="text-[10px] text-slate-400 font-medium">Permanent Protection</span>
                </div>

                {authUser ? (
                  <div className="p-3 bg-emerald-50 border border-emerald-200/80 rounded-2xl flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {authUser.photoURL ? (
                        <img 
                          src={authUser.photoURL} 
                          alt={authUser.displayName || 'User'} 
                          className="w-7 h-7 rounded-full border border-emerald-300 shrink-0" 
                          referrerPolicy="no-referrer" 
                        />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
                          {(authUser.displayName || authUser.email || 'U')[0].toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-bold text-emerald-950 truncate flex items-center gap-1">
                          <span>{authUser.displayName || 'Google Account'}</span>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        </div>
                        <div className="text-[11px] text-emerald-700/80 truncate">{authUser.email}</div>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-full shrink-0">
                      Linked
                    </span>
                  </div>
                ) : (
                  <div className="p-3.5 bg-amber-50/90 border border-amber-200/80 rounded-2xl space-y-3" id="google-requirement-card">
                    <div className="flex items-start gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-white shadow-xs border border-amber-200 flex items-center justify-center shrink-0 mt-0.5">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h6 className="text-xs font-bold text-amber-950">Sign in with Google required before purchase</h6>
                        <p className="text-[11px] text-amber-800 leading-snug mt-0.5">
                          Linking your Google account guarantees your subscription is never lost if you delete subjects, clear cache, or switch devices.
                        </p>
                      </div>
                    </div>

                    {/* Official Google Identity Services Rendered Button Container */}
                    <div className="flex justify-center w-full min-h-[44px]" id="gis-render-wrapper">
                      <div ref={gisButtonRef} id="gis-upgrade-button-container" className="flex justify-center w-full" />
                    </div>

                    {/* Interactive Fallback / Retry button */}
                    {(!isGisButtonRendered || isSigningIn || error) && (
                      <button
                        type="button"
                        onClick={handleGoogleSignIn}
                        disabled={isSigningIn}
                        className="w-full py-2.5 px-3 bg-white hover:bg-amber-50 text-slate-800 text-xs font-bold border border-amber-300/80 rounded-xl shadow-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                        id="google-signin-upgrade-card-btn"
                      >
                        {isSigningIn ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
                            <span>Connecting Google Account...</span>
                          </>
                        ) : error ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 text-amber-700" />
                            <span>Retry Google Sign-In</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                            </svg>
                            <span>Sign in with Google Account</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Premium Features Included */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#1D1B20] uppercase tracking-wider">
                  <Zap className="w-4 h-4 text-[#6750A4]" />
                  <span>Everything Included in Premium:</span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-[#1D1B20] font-medium">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Unlimited Active Tasks</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Unlimited Timetables</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Unlimited Assignments</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Unlimited Notes & Pages</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Unlimited Exams</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Full Lifetime Analytics</span>
                  </div>
                </div>
              </div>

              {/* Dedicated PayPal Button Mount Container for International Checkout */}
              {!isIndia && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center justify-between">
                    <span>PayPal Express Checkout Container</span>
                    <span className="text-[10px] text-slate-400 font-medium">Official PayPal Smart Buttons</span>
                  </div>
                  <div 
                    id="paypal-button-container" 
                    className="w-full min-h-[45px] empty:hidden transition-all"
                  />
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Success Message */}
              {paymentSuccessMessage && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-bold flex items-center gap-2 animate-bounce">
                  <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span>{paymentSuccessMessage}</span>
                </div>
              )}

            </div>

            {/* Footer Checkout Action */}
            <div className="p-5 border-t border-slate-100 bg-slate-50/70 shrink-0 space-y-2">
              <button
                onClick={handleCheckout}
                disabled={isLoading || isSigningIn || !!paymentSuccessMessage}
                className={`w-full py-3.5 px-4 text-xs font-bold rounded-2xl shadow-lg flex items-center justify-center gap-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer btn-press ${
                  authUser 
                    ? 'text-white bg-[#6750A4] hover:bg-[#503E84] shadow-[#6750A4]/20' 
                    : 'text-slate-900 bg-white hover:bg-slate-50 border border-slate-300 shadow-sm'
                }`}
                id="pay-now-btn"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Securing Payment Connection...</span>
                  </>
                ) : isSigningIn ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
                    <span>Connecting Google Account...</span>
                  </>
                ) : !authUser ? (
                  <>
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                    </svg>
                    <span>Sign in with Google to Purchase ({activePlan.formattedPrice})</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                ) : (
                  <>
                    <CreditCard className="w-4 h-4" />
                    <span>
                      Pay {activePlan.formattedPrice} with {activeGateway.name}
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="flex items-center justify-center gap-2 text-[10px] text-[#49454F]">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>256-bit SSL Encrypted • Verified Backend Processing • Cancel Anytime</span>
              </div>

              {onOpenRestore && (
                <div className="pt-1 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenRestore();
                    }}
                    className="text-[11px] font-semibold text-[#6750A4] hover:underline cursor-pointer inline-flex items-center gap-1"
                  >
                    <span>Already paid? Restore your subscription</span>
                  </button>
                </div>
              )}
            </div>

          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
