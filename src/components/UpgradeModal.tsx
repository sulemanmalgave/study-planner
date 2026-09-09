import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Check, 
  Sparkles, 
  ShieldCheck, 
  Zap, 
  CreditCard, 
  ArrowRight, 
  Loader2, 
  AlertCircle, 
  CheckCircle2, 
  Calendar, 
  Hash, 
  Globe 
} from 'lucide-react';
import { Subscription, UserProfile } from '../types';
import { 
  getCountryConfig, 
  GATEWAY_CONFIGS, 
  detectUserCountry, 
  PlanOption 
} from '../lib/paymentConfig';
import { modalBackdropVariants, modalPanelVariants } from '../lib/animations';
import { AuthUserProfile } from '../lib/emailAuth';
import { getStoredEntitlement, isEntitlementActive, saveStoredEntitlement } from '../lib/entitlement';
import EmailAuthCard from './EmailAuthCard';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (updatedSubscription: Subscription) => void;
  currentCountry?: string;
  limitReason?: string;
  onOpenRestore?: () => void;
  authUser?: AuthUserProfile | null;
  onAuthSuccess?: (user: AuthUserProfile, hasActiveSubscription?: boolean, subscription?: any) => void;
  onSignOut?: () => void;
  isPremium?: boolean;
  subscription?: Subscription | null;
  profile?: UserProfile | null;
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

const formatDate = (isoString?: string) => {
  if (!isoString) return 'Lifetime / Recurring';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return isoString;
  }
};

export default function UpgradeModal({ 
  isOpen, 
  onClose, 
  onSuccess, 
  limitReason,
  onOpenRestore,
  authUser,
  onAuthSuccess,
  onSignOut,
  isPremium,
  subscription,
  profile,
}: UpgradeModalProps) {
  const [billingCountry, setBillingCountry] = useState<string>('US');
  const [selectedPlanId, setSelectedPlanId] = useState<'monthly' | 'quarterly' | 'yearly'>('yearly');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentSuccessMessage, setPaymentSuccessMessage] = useState<string | null>(null);
  const [serverSubscription, setServerSubscription] = useState<Subscription | null>(null);

  // Authoritative entitlement check combining server, prop, profile, and local entitlement
  const localEntitlement = getStoredEntitlement();
  const effectiveSubscription: Subscription | null = 
    serverSubscription ||
    (isEntitlementActive(subscription) ? subscription! : null) ||
    (isEntitlementActive(profile?.subscription) ? profile!.subscription : null) ||
    (isEntitlementActive(localEntitlement) ? localEntitlement! : null);

  const isUserPremium = Boolean(
    isPremium ||
    isEntitlementActive(serverSubscription) ||
    isEntitlementActive(subscription) ||
    isEntitlementActive(profile?.subscription) ||
    isEntitlementActive(localEntitlement)
  );

  // Refresh authoritative status on mount / open
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setPaymentSuccessMessage(null);
      
      detectUserCountry().then((detected) => {
        const countryCode = detected === 'IN' ? 'IN' : 'US';
        setBillingCountry(countryCode);
        setSelectedPlanId('yearly');
      });

      // Query authoritative server-side subscription state
      const headers: Record<string, string> = {};
      if (authUser?.uid) headers['x-user-id'] = authUser.uid;
      if (authUser?.email) headers['x-user-email'] = authUser.email;

      fetch('/api/subscription/account-status', { headers })
        .then(res => res.json())
        .then(data => {
          if (data && data.hasActiveSubscription && data.subscription) {
            setServerSubscription(data.subscription);
            saveStoredEntitlement(data.subscription);
            if (onSuccess) {
              onSuccess(data.subscription);
            }
          }
        })
        .catch(err => {
          console.warn('Could not query account subscription status:', err);
        });
    }
  }, [isOpen, authUser]);

  // Derive current country config and gateway config dynamically
  const countryConfig = getCountryConfig(billingCountry);
  const isIndia = countryConfig.code === 'IN';
  const activeGateway = GATEWAY_CONFIGS[countryConfig.gateway];
  const plans = countryConfig.plans;

  // Selected plan object
  const activePlan = plans.find(p => p.id === selectedPlanId) || plans[0];

  // Helper to load Razorpay SDK dynamically
  const loadRazorpayScript = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (window.Razorpay) {
        resolve(true);
        return;
      }
      const existingScript = document.getElementById('razorpay-checkout-js');
      if (existingScript) {
        existingScript.addEventListener('load', () => resolve(true));
        existingScript.addEventListener('error', () => resolve(false));
        return;
      }
      const script = document.createElement('script');
      script.id = 'razorpay-checkout-js';
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  // Helper to load PayPal SDK dynamically
  const loadPaypalScript = (clientId: string): Promise<boolean> => {
    return new Promise((resolve) => {
      if (window.paypal) {
        resolve(true);
        return;
      }
      const existingScript = document.getElementById('paypal-sdk-script');
      if (existingScript) {
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

      setPaymentSuccessMessage('Payment verified successfully! Welcome to Study Planner Premium.');
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

  // Execute checkout with duplicate purchase protection
  const handleCheckout = async () => {
    // Client-side guard: Never allow an already active premium subscriber to start checkout
    if (isUserPremium) {
      setError('Your Premium subscription is already active. You will not be charged again.');
      return;
    }

    if (!authUser || !authUser.uid) {
      setError('Please create or sign in to your Study Planner account first so your Premium subscription is securely linked to your account.');
      const authElem = document.getElementById('email-account-auth-container');
      if (authElem) {
        authElem.scrollIntoView({ behavior: 'smooth' });
      }
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

      // 1. Create order on secure backend (Backend enforces duplicate protection)
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

      // If backend reports subscription is already active, acknowledge without charging
      if (orderData.alreadyActive) {
        setPaymentSuccessMessage('Your Premium subscription is already active.');
        if (orderData.subscription && onSuccess) {
          onSuccess(orderData.subscription);
        }
        setIsLoading(false);
        return;
      }

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
            prefill: {
              name: authUser.displayName || 'Student',
              email: authUser.email || '',
            },
            theme: {
              color: '#6750A4',
            },
            handler: async (response: any) => {
              await handleVerifyPaymentOnBackend({
                orderId: response.razorpay_order_id || orderId,
                paymentId: response.razorpay_payment_id,
                signature: response.razorpay_signature,
                provider: 'razorpay',
              });
            },
            modal: {
              ondismiss: () => {
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
      // If error indicates already premium, handle gracefully
      if (err?.code === 'ALREADY_PREMIUM' || err?.message?.includes('already active')) {
        setError(null);
        setPaymentSuccessMessage('Your Premium subscription is already active.');
        setIsLoading(false);
        return;
      }
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
            
            {/* Modal Header */}
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
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-[#1D1B20] tracking-tight">
                      Study Planner Premium
                    </h3>
                    {isUserPremium && (
                      <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-emerald-600" />
                        <span>Active</span>
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#49454F]">
                    {isUserPremium ? 'Your Premium subscription is active.' : 'Unlock unlimited academic potential'}
                  </p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-white border border-slate-200/70 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
                id="close-upgrade-modal-btn"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Content Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">

              {/* ========================================================================= */}
              {/* CASE 1: USER IS ALREADY ACTIVE PREMIUM -> SHOW STATUS, NEVER SHOW PURCHASE */}
              {/* ========================================================================= */}
              {isUserPremium ? (
                <div className="space-y-5" id="premium-active-view">
                  
                  {/* Premium Active Hero Card */}
                  <div className="p-5 bg-gradient-to-br from-emerald-50 via-teal-50/50 to-emerald-50 border border-emerald-200/80 rounded-2xl space-y-3" id="premium-active-hero-banner">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/20 shrink-0">
                        <Sparkles className="w-5 h-5 text-white animate-pulse" />
                      </div>
                      <div>
                        <div className="text-xs font-extrabold text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
                          <span>PREMIUM ACTIVE ✓</span>
                        </div>
                        <h4 className="text-sm font-bold text-slate-900 mt-0.5">
                          Your Premium subscription is active.
                        </h4>
                      </div>
                    </div>
                    <p className="text-xs text-emerald-950/80 leading-relaxed">
                      You have complete, unlimited access to all Study Planner features. Your active subscription is securely linked to your workspace.
                    </p>
                  </div>

                  {/* Authoritative Subscription Details Breakdown */}
                  <div className="p-4.5 bg-slate-50/90 rounded-2xl border border-slate-200/80 space-y-3" id="subscription-details-breakdown">
                    <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                      <span>Subscription Details</span>
                      <span className="text-[10px] text-emerald-700 font-bold bg-emerald-100/80 px-2 py-0.5 rounded-full">
                        Authoritative Status
                      </span>
                    </div>

                    <div className="space-y-2 text-xs divide-y divide-slate-200/60">
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-slate-500 font-medium flex items-center gap-1.5">
                          <Zap className="w-3.5 h-3.5 text-[#6750A4]" />
                          Plan
                        </span>
                        <span className="font-bold text-slate-900 capitalize">
                          {effectiveSubscription?.plan === 'yearly' || (!effectiveSubscription?.plan && effectiveSubscription?.type === 'yearly')
                            ? 'Yearly Plan (Unlimited)'
                            : effectiveSubscription?.plan 
                              ? `${effectiveSubscription.plan} Plan` 
                              : 'Yearly Plan (Unlimited)'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-2">
                        <span className="text-slate-500 font-medium flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          Status
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                          Active ✓
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-2">
                        <span className="text-slate-500 font-medium flex items-center gap-1.5">
                          <CreditCard className="w-3.5 h-3.5 text-slate-500" />
                          Payment Gateway
                        </span>
                        <span className="font-bold text-slate-900 uppercase">
                          {effectiveSubscription?.paymentGateway || (effectiveSubscription as any)?.paymentProvider || 'Razorpay'}
                        </span>
                      </div>

                      {effectiveSubscription?.expiryDate && (
                        <div className="flex items-center justify-between pt-2">
                          <span className="text-slate-500 font-medium flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-slate-500" />
                            Renewal / Valid Until
                          </span>
                          <span className="font-bold text-slate-900">
                            {formatDate(effectiveSubscription.expiryDate)}
                          </span>
                        </div>
                      )}

                      {(effectiveSubscription?.transactionId || (effectiveSubscription as any)?.paymentId) && (
                        <div className="flex items-center justify-between pt-2">
                          <span className="text-slate-500 font-medium flex items-center gap-1.5">
                            <Hash className="w-3.5 h-3.5 text-slate-500" />
                            Transaction Ref
                          </span>
                          <span className="font-mono text-[11px] text-slate-700 bg-slate-200/60 px-2 py-0.5 rounded-md truncate max-w-[180px]">
                            {effectiveSubscription?.transactionId || (effectiveSubscription as any)?.paymentId}
                          </span>
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-2">
                        <span className="text-slate-500 font-medium flex items-center gap-1.5">
                          <Globe className="w-3.5 h-3.5 text-slate-500" />
                          Account
                        </span>
                        <span className="font-medium text-slate-800 truncate max-w-[200px]">
                          {authUser?.email || profile?.email || 'Active Workspace User'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Account & Entitlement Association Card */}
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                      <span>Account Management</span>
                      <span className="text-[10px] text-slate-400 font-medium">Verified Identity</span>
                    </div>

                    <EmailAuthCard
                      authUser={authUser}
                      onAuthSuccess={(user, hasActiveSubscription, sub) => {
                        if (onAuthSuccess) {
                          onAuthSuccess(user, hasActiveSubscription, sub);
                        }
                        if (hasActiveSubscription && sub && onSuccess) {
                          onSuccess(sub);
                        }
                      }}
                      onSignOut={onSignOut}
                    />
                  </div>

                  {/* All Unlimited Features Active Banner */}
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2.5">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-[#1D1B20] uppercase tracking-wider">
                      <Zap className="w-4 h-4 text-[#6750A4]" />
                      <span>All Premium Privileges Active:</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs text-[#1D1B20] font-medium">
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Unlimited Subjects &amp; Courses</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Unlimited Timetables</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Unlimited Assignments &amp; Tasks</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Unlimited Notes &amp; Pages</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Unlimited Exams &amp; Reminders</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Full Lifetime Analytics</span>
                      </div>
                    </div>
                  </div>

                  {/* Anti-Duplicate Payment Assurance */}
                  <div className="p-3 bg-emerald-50/70 border border-emerald-200/60 rounded-xl text-xs text-emerald-800 flex items-start gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>
                      <strong>Protected Subscription:</strong> Your Premium account is active. You will never be asked to pay again for this active period.
                    </span>
                  </div>

                </div>
              ) : (
                /* ========================================================================= */
                /* CASE 2: FREE / EXPIRED USER -> SHOW UPGRADE SELECTION & CHECKOUT FLOW     */
                /* ========================================================================= */
                <div className="space-y-6" id="free-plan-upgrade-view">

                  {/* Limit Context Notification (if triggered by user hitting a free cap) */}
                  {limitReason && (
                    <div className="p-3.5 bg-amber-50 border border-amber-200/90 rounded-2xl flex items-start gap-2.5 text-xs text-amber-900" id="limit-reason-banner">
                      <Zap className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold">Free Plan Limit Reached: </span>
                        <span>{limitReason}</span>
                      </div>
                    </div>
                  )}

                  {/* Pricing Cards Selection */}
                  <div className="space-y-2">
                    <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                      <span>Select Subscription Plan</span>
                      <span className="text-[10px] text-slate-400 font-medium">Billed in {countryConfig.currency}</span>
                    </div>

                    <div className="grid grid-cols-1 gap-2.5">
                      {plans.map((plan: PlanOption) => {
                        const isSelected = selectedPlanId === plan.id;
                        return (
                          <div
                            key={plan.id}
                            onClick={() => setSelectedPlanId(plan.id)}
                            className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between ${
                              isSelected
                                ? 'border-[#6750A4] bg-[#6750A4]/5 shadow-sm'
                                : 'border-slate-200/80 bg-white hover:border-slate-300'
                            }`}
                            id={`plan-card-${plan.id}`}
                          >
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-[#1D1B20]">{plan.title}</span>
                                {plan.badge && (
                                  <span className="text-[9px] font-bold bg-[#6750A4] text-white px-2 py-0.5 rounded-full uppercase tracking-wider">
                                    {plan.badge}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-[#49454F]">{plan.savingsText || plan.billingText || 'Full uninterrupted access'}</p>
                            </div>

                            <div className="text-right">
                              <div className="text-sm font-extrabold text-[#1D1B20]">
                                {plan.formattedPrice}
                              </div>
                              {plan.monthlyEquivalent && (
                                <div className="text-[10px] text-[#6750A4] font-medium">
                                  {plan.monthlyEquivalent} equivalent
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Simple Email Account & Verification Section */}
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                      <span>Account &amp; Entitlement Protection</span>
                      <span className="text-[10px] text-slate-400 font-medium">Verified Email</span>
                    </div>

                    <EmailAuthCard
                      authUser={authUser}
                      onAuthSuccess={(user, hasActiveSubscription, sub) => {
                        if (onAuthSuccess) {
                          onAuthSuccess(user, hasActiveSubscription, sub);
                        }
                        if (hasActiveSubscription && sub && onSuccess) {
                          onSuccess(sub);
                        }
                      }}
                      onSignOut={onSignOut}
                    />
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
                        <span>Unlimited Notes &amp; Pages</span>
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

                  {/* Dynamic PayPal Gateway Container (Rendered when PayPal is active) */}
                  {!isIndia && (
                    <div className="space-y-2">
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
                    <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-bold flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                      <span>{paymentSuccessMessage}</span>
                    </div>
                  )}

                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="p-5 border-t border-slate-100 bg-slate-50/70 shrink-0 space-y-2">
              {isUserPremium ? (
                /* ========================================================================= */
                /* ACTIVE PREMIUM SUBSCRIBER FOOTER: NO CHECKOUT BUTTON                      */
                /* ========================================================================= */
                <div className="space-y-2.5">
                  <button
                    onClick={onClose}
                    className="w-full py-3.5 px-4 text-xs font-bold rounded-2xl shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer text-white bg-emerald-700 hover:bg-emerald-800"
                    id="premium-active-done-btn"
                  >
                    <Check className="w-4 h-4" />
                    <span>Premium Active — Return to App</span>
                  </button>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 px-1">
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Active Subscription in Good Standing</span>
                    </div>
                    {onOpenRestore && (
                      <button
                        type="button"
                        onClick={onOpenRestore}
                        className="text-[#6750A4] hover:underline font-semibold cursor-pointer"
                      >
                        Restore purchase
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                /* ========================================================================= */
                /* FREE / EXPIRED USER FOOTER: PURCHASE BUTTON                               */
                /* ========================================================================= */
                <div className="space-y-2">
                  <button
                    onClick={handleCheckout}
                    disabled={isLoading || !!paymentSuccessMessage}
                    className={`w-full py-3.5 px-4 text-xs font-bold rounded-2xl shadow-lg flex items-center justify-center gap-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer text-white bg-[#6750A4] hover:bg-[#503E84] shadow-[#6750A4]/20`}
                    id="pay-now-btn"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Securing Payment Connection...</span>
                      </>
                    ) : !authUser ? (
                      <>
                        <span>Verify Account to Continue ({activePlan.formattedPrice})</span>
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
                    <span>Encrypted 256-bit bank grade transaction</span>
                    <span>•</span>
                    {onOpenRestore && (
                      <button
                        type="button"
                        onClick={onOpenRestore}
                        className="text-[#6750A4] hover:underline font-semibold cursor-pointer"
                      >
                        Restore purchase
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
