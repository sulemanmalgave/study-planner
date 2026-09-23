import React, { useState, useEffect, useRef } from 'react';
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
  SUPPORTED_COUNTRIES,
  getSavedBillingCountry,
  saveBillingCountry,
  PlanOption,
  getPlanDisplayName,
  inferPlanInterval
} from '../lib/paymentConfig';
import { modalBackdropVariants, modalPanelVariants } from '../lib/animations';
import { AuthUserProfile } from '../lib/emailAuth';
import { getStoredEntitlement, isEntitlementActive, saveStoredEntitlement } from '../lib/entitlement';
import EmailAuthCard from './EmailAuthCard';
import { useTranslation, formatFrDate } from '../lib/i18n';

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
  return formatFrDate(isoString);
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
  const { t, language } = useTranslation();
  const [billingCountry, setBillingCountry] = useState<string>(() => {
    return getSavedBillingCountry() || 'US';
  });
  const [selectedPlanId, setSelectedPlanId] = useState<'monthly' | 'quarterly' | 'yearly'>('yearly');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentSuccessMessage, setPaymentSuccessMessage] = useState<string | null>(null);
  const [serverSubscription, setServerSubscription] = useState<Subscription | null>(null);
  const [paypalClientId, setPaypalClientId] = useState<string | null>(null);
  const [isPaypalSdkReady, setIsPaypalSdkReady] = useState<boolean>(false);

  // Refs for tracking DOM elements, active PayPal button instance, and current checkout params
  const paypalContainerRef = useRef<HTMLDivElement>(null);
  const activePayPalButtonsRef = useRef<any>(null);
  const authUserRef = useRef(authUser);
  authUserRef.current = authUser;
  const billingCountryRef = useRef(billingCountry);
  billingCountryRef.current = billingCountry;
  const languageRef = useRef(language);
  languageRef.current = language;
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  // Global handler to catch PayPal SDK v5 detached DOM container events cleanly
  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event?.reason?.message || String(event?.reason || '');
      if (
        reason.includes('Detected container element removed from DOM') || 
        reason.includes('paypal_js_sdk') ||
        reason.includes('zoid')
      ) {
        event.preventDefault();
      }
    };
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

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

  // Handle user-selected billing country change
  const handleCountryChange = (newCountryCode: string) => {
    setBillingCountry(newCountryCode);
    saveBillingCountry(newCountryCode);
    setError(null);
  };

  // Refresh authoritative status and country detection on mount / open
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setPaymentSuccessMessage(null);

      // Sync selected plan with active subscription if present
      const currentPlan = effectiveSubscription?.plan || (effectiveSubscription as any)?.type;
      if (currentPlan) {
        const interval = inferPlanInterval(currentPlan, effectiveSubscription?.purchaseDate, effectiveSubscription?.expiryDate);
        if (interval === 'monthly' || interval === 'quarterly' || interval === 'yearly') {
          setSelectedPlanId(interval);
        }
      }
      
      const savedCountry = getSavedBillingCountry();
      if (savedCountry) {
        setBillingCountry(savedCountry);
      } else {
        detectUserCountry().then((detected) => {
          setBillingCountry(detected);
        });
      }

      // Fetch public payment configuration (PayPal client ID, etc.)
      fetch('/api/subscription/config')
        .then(res => res.json())
        .then(cfg => {
          if (cfg?.paypalClientId) {
            setPaypalClientId(cfg.paypalClientId);
          }
        })
        .catch(err => {
          console.warn('[Payment Config Fetch Error]', err);
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
  const activePlanRef = useRef(activePlan);
  activePlanRef.current = activePlan;

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

  // Helper to load PayPal SDK dynamically with USD currency
  const loadPaypalScript = (clientId: string): Promise<boolean> => {
    return new Promise((resolve) => {
      if (window.paypal) {
        resolve(true);
        return;
      }
      const existingScript = document.getElementById('paypal-sdk-script') as HTMLScriptElement | null;
      if (existingScript) {
        if (existingScript.src.includes(`client-id=${clientId}`)) {
          existingScript.addEventListener('load', () => resolve(true));
          existingScript.addEventListener('error', () => resolve(false));
          return;
        } else {
          existingScript.remove();
        }
      }
      const script = document.createElement('script');
      script.id = 'paypal-sdk-script';
      script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=USD&intent=capture`;
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
          billingCountry: billingCountry,
          planType: activePlan.id,
          planId: activePlan.id,
          plan: activePlan.id,
          userId: authUser?.uid,
          userEmail: authUser?.email,
        }),
      });

      setPaymentSuccessMessage(
        language === 'fr-FR'
          ? 'Paiement vérifié avec succès ! Bienvenue dans Study Planner Premium.'
          : 'Payment verified successfully! Welcome to Study Planner Premium.'
      );
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

  // Dedicated effect to mount PayPal Buttons when billing country is outside India
  useEffect(() => {
    if (!isOpen || isUserPremium || isIndia) {
      if (activePayPalButtonsRef.current) {
        try {
          if (typeof activePayPalButtonsRef.current.close === 'function') {
            activePayPalButtonsRef.current.close();
          }
        } catch (_) {}
        activePayPalButtonsRef.current = null;
      }
      return;
    }

    let isCancelled = false;

    const initPayPalButtons = async () => {
      try {
        let cid = paypalClientId;
        if (!cid) {
          const cfgRes = await fetch('/api/subscription/config');
          if (cfgRes.ok) {
            const cfg = await cfgRes.json();
            if (cfg.paypalClientId) {
              cid = cfg.paypalClientId;
              if (!isCancelled) setPaypalClientId(cid);
            }
          }
        }

        if (!cid || isCancelled) return;

        const isLoaded = await loadPaypalScript(cid);
        if (!isLoaded || !window.paypal || isCancelled) return;

        if (!isCancelled) {
          setIsPaypalSdkReady(true);
        }

        const container = paypalContainerRef.current || document.getElementById('paypal-button-container');
        if (!container || !container.isConnected || isCancelled) return;

        // If buttons are already rendered in this container, do not re-render
        if (activePayPalButtonsRef.current && container.children.length > 0) {
          return;
        }

        // Clean up previous button instance safely
        if (activePayPalButtonsRef.current) {
          try {
            if (typeof activePayPalButtonsRef.current.close === 'function') {
              activePayPalButtonsRef.current.close();
            }
          } catch (_) {}
          activePayPalButtonsRef.current = null;
        }

        container.innerHTML = '';

        if (isCancelled || !container.isConnected) return;

        const buttons = window.paypal.Buttons({
          style: {
            layout: 'vertical',
            color: 'gold',
            shape: 'rect',
            label: 'paypal',
            height: 42,
          },
          createOrder: async () => {
            const currentAuth = authUserRef.current;
            const currentPlan = activePlanRef.current;
            const currentCountry = billingCountryRef.current;
            const currentLang = languageRef.current;

            if (!currentAuth || !currentAuth.uid) {
              setError(
                currentLang === 'fr-FR'
                  ? 'Veuillez vérifier votre compte ci-dessous avant de procéder au paiement.'
                  : 'Please verify your account below before proceeding to payment.'
              );
              const authElem = document.getElementById('email-account-auth-container');
              if (authElem) authElem.scrollIntoView({ behavior: 'smooth' });
              throw new Error('AUTH_REQUIRED');
            }

            setIsLoading(true);
            setError(null);
            try {
              const headers: Record<string, string> = { 'Content-Type': 'application/json' };
              if (currentAuth.uid) headers['x-user-id'] = currentAuth.uid;
              if (currentAuth.email) headers['x-user-email'] = currentAuth.email;

              const orderData = await safeFetchJson('/api/subscription/create-order', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                  planType: currentPlan.id,
                  planId: currentPlan.id,
                  plan: currentPlan.id,
                  billingCountry: currentCountry,
                  country: currentCountry,
                  userId: currentAuth.uid,
                  userEmail: currentAuth.email,
                }),
              });

              if (orderData.alreadyActive) {
                setPaymentSuccessMessage(
                  currentLang === 'fr-FR'
                    ? 'Votre abonnement Premium est déjà actif.'
                    : 'Your Premium subscription is already active.'
                );
                if (orderData.subscription && onSuccessRef.current) {
                  onSuccessRef.current(orderData.subscription);
                }
                setIsLoading(false);
                throw new Error('ALREADY_ACTIVE');
              }

              return orderData.orderId;
            } catch (createErr: any) {
              setIsLoading(false);
              if (createErr.message !== 'AUTH_REQUIRED' && createErr.message !== 'ALREADY_ACTIVE') {
                setError(createErr.message || 'Failed to initiate PayPal order');
              }
              throw createErr;
            }
          },
          onApprove: async (data: any) => {
            await handleVerifyPaymentOnBackend({
              orderId: data.orderID,
              provider: 'paypal',
            });
          },
          onError: (err: any) => {
            console.error('[PayPal SDK Error]', err);
            const detailStr = typeof err === 'string' ? err : err?.message || JSON.stringify(err);
            setError(languageRef.current === 'fr-FR' ? `Erreur PayPal : ${detailStr}` : `PayPal Checkout Error: ${detailStr}`);
            setIsLoading(false);
          },
          onCancel: () => {
            setIsLoading(false);
          },
        });

        activePayPalButtonsRef.current = buttons;

        if (typeof buttons.isEligible === 'function' && !buttons.isEligible()) {
          return;
        }

        if (container.isConnected && !isCancelled) {
          await buttons.render(container).catch((renderErr: any) => {
            const msg = renderErr?.message || String(renderErr);
            if (msg.includes('container element removed') || isCancelled || !container.isConnected) {
              return;
            }
            console.warn('[PayPal Render Error]', renderErr);
          });
        }
      } catch (err: any) {
        const msg = err?.message || String(err);
        if (!msg.includes('container element removed')) {
          console.warn('[PayPal setup exception]', err);
        }
      }
    };

    // Small delay to ensure container element is mounted in DOM
    const timer = setTimeout(initPayPalButtons, 150);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
      if (activePayPalButtonsRef.current) {
        try {
          if (typeof activePayPalButtonsRef.current.close === 'function') {
            activePayPalButtonsRef.current.close();
          }
        } catch (_) {}
        activePayPalButtonsRef.current = null;
      }
    };
  }, [isOpen, isUserPremium, isIndia, paypalClientId]);

  // Execute checkout with duplicate purchase protection
  const handleCheckout = async () => {
    // Client-side guard: Never allow an already active premium subscriber to start checkout
    if (isUserPremium) {
      setError(
        language === 'fr-FR'
          ? 'Votre abonnement Premium est déjà actif. Aucun débit supplémentaire ne sera effectué.'
          : 'Your Premium subscription is already active. You will not be charged again.'
      );
      return;
    }

    if (!authUser || !authUser.uid) {
      setError(
        language === 'fr-FR'
          ? 'Veuillez vous connecter à votre compte Study Planner afin d\'associer votre abonnement Premium.'
          : 'Please create or sign in to your Study Planner account first so your Premium subscription is securely linked to your account.'
      );
      const authElem = document.getElementById('email-account-auth-container');
      if (authElem) {
        authElem.scrollIntoView({ behavior: 'smooth' });
      }
      return;
    }

    // For international users with PayPal buttons visible, highlight the PayPal button
    if (!isIndia) {
      const paypalSection = document.getElementById('paypal-checkout-section');
      if (paypalSection) {
        paypalSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      const container = paypalContainerRef.current || document.getElementById('paypal-button-container');
      if (container) {
        container.classList.add('ring-2', 'ring-[#6750A4]', 'ring-offset-2', 'rounded-xl');
        setTimeout(() => {
          container?.classList.remove('ring-2', 'ring-[#6750A4]', 'ring-offset-2', 'rounded-xl');
        }, 2000);
      }
      if (!isPaypalSdkReady) {
        setError(
          language === 'fr-FR'
            ? 'Le module PayPal est en cours de chargement. Veuillez patienter...'
            : 'PayPal checkout is loading. Please wait a moment...'
        );
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
          planId: activePlan.id,
          plan: activePlan.id,
          billingCountry: billingCountry,
          country: billingCountry,
          userId: authUser.uid,
          userEmail: authUser.email,
        }),
      });

      // If backend reports subscription is already active, acknowledge without charging
      if (orderData.alreadyActive) {
        setPaymentSuccessMessage(
          language === 'fr-FR'
            ? 'Votre abonnement Premium est déjà actif.'
            : 'Your Premium subscription is already active.'
        );
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
        throw new Error('Unsupported payment provider');
      }
    } catch (err: any) {
      console.error('Checkout error:', err);
      // If error indicates already premium, handle gracefully
      if (err?.code === 'ALREADY_PREMIUM' || err?.message?.includes('already active')) {
        setError(null);
        setPaymentSuccessMessage(
          language === 'fr-FR'
            ? 'Votre abonnement Premium est déjà actif.'
            : 'Your Premium subscription is already active.'
        );
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
                        <span>{language === 'fr-FR' ? 'Actif' : 'Active'}</span>
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#49454F]">
                    {isUserPremium ? (language === 'fr-FR' ? 'Votre abonnement Premium est actif.' : 'Your Premium subscription is active.') : t('premium.upgradeSubtitle')}
                  </p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-white border border-slate-200/70 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
                id="close-upgrade-modal-btn"
                title={t('action.cancel')}
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
                          <span>{language === 'fr-FR' ? 'PREMIUM ACTIF ✓' : 'PREMIUM ACTIVE ✓'}</span>
                        </div>
                        <h4 className="text-sm font-bold text-slate-900 mt-0.5">
                          {language === 'fr-FR' ? 'Votre abonnement Premium est actif.' : 'Your Premium subscription is active.'}
                        </h4>
                      </div>
                    </div>
                    <p className="text-xs text-emerald-950/80 leading-relaxed">
                      {language === 'fr-FR' ? 'Vous disposez d\'un accès illimité et complet à l\'ensemble des fonctionnalités de Study Planner. Votre abonnement est relié en toute sécurité à votre espace de travail.' : 'You have complete, unlimited access to all Study Planner features. Your active subscription is securely linked to your workspace.'}
                    </p>
                  </div>

                  {/* Authoritative Subscription Details Breakdown */}
                  <div className="p-4.5 bg-slate-50/90 rounded-2xl border border-slate-200/80 space-y-3" id="subscription-details-breakdown">
                    <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                      <span>{t('settings.subscriptionStatus')}</span>
                      <span className="text-[10px] text-emerald-700 font-bold bg-emerald-100/80 px-2 py-0.5 rounded-full">
                        {language === 'fr-FR' ? 'Statut certifié' : 'Authoritative Status'}
                      </span>
                    </div>

                    <div className="space-y-2 text-xs divide-y divide-slate-200/60">
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-slate-500 font-medium flex items-center gap-1.5">
                          <Zap className="w-3.5 h-3.5 text-[#6750A4]" />
                          {t('settings.planLabel')}
                        </span>
                        <span className="font-bold text-slate-900">
                          {getPlanDisplayName(effectiveSubscription, language)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-2">
                        <span className="text-slate-500 font-medium flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          {language === 'fr-FR' ? 'Statut' : 'Status'}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                          {language === 'fr-FR' ? 'Actif ✓' : 'Active ✓'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-2">
                        <span className="text-slate-500 font-medium flex items-center gap-1.5">
                          <CreditCard className="w-3.5 h-3.5 text-slate-500" />
                          {t('settings.gatewayLabel')}
                        </span>
                        <span className="font-bold text-slate-900 uppercase">
                          {effectiveSubscription?.paymentGateway || (effectiveSubscription as any)?.paymentProvider || 'Razorpay'}
                        </span>
                      </div>

                      {effectiveSubscription?.expiryDate && (
                        <div className="flex items-center justify-between pt-2">
                          <span className="text-slate-500 font-medium flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-slate-500" />
                            {t('settings.validUntil')}
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
                            {t('settings.refLabel')}
                          </span>
                          <span className="font-mono text-[11px] text-slate-700 bg-slate-200/60 px-2 py-0.5 rounded-md truncate max-w-[180px]">
                            {effectiveSubscription?.transactionId || (effectiveSubscription as any)?.paymentId}
                          </span>
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-2">
                        <span className="text-slate-500 font-medium flex items-center gap-1.5">
                          <Globe className="w-3.5 h-3.5 text-slate-500" />
                          {language === 'fr-FR' ? 'Compte' : 'Account'}
                        </span>
                        <span className="font-medium text-slate-800 truncate max-w-[200px]">
                          {authUser?.displayName || authUser?.name || (authUser?.email && !authUser.email.endsWith('@studyplanner.internal') ? authUser.email : null) || profile?.name || (language === 'fr-FR' ? 'Utilisateur actif' : 'Active Workspace User')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Account & Entitlement Association Card */}
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                      <span>{language === 'fr-FR' ? 'Gestion du compte' : 'Account Management'}</span>
                      <span className="text-[10px] text-slate-400 font-medium">{language === 'fr-FR' ? 'Identité vérifiée' : 'Verified Identity'}</span>
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
                      <span>{language === 'fr-FR' ? 'Tous les privilèges Premium activés :' : 'All Premium Privileges Active:'}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs text-[#1D1B20] font-medium">
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>{language === 'fr-FR' ? 'Matières & Cours illimités' : 'Unlimited Subjects & Courses'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>{t('premium.unlimitedTimetable')}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>{language === 'fr-FR' ? 'Devoirs & Tâches illimités' : 'Unlimited Assignments & Tasks'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>{t('premium.unlimitedNotes')}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>{language === 'fr-FR' ? 'Examens & Rappels illimités' : 'Unlimited Exams & Reminders'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>{t('premium.analytics')}</span>
                      </div>
                    </div>
                  </div>

                  {/* Anti-Duplicate Payment Assurance */}
                  <div className="p-3 bg-emerald-50/70 border border-emerald-200/60 rounded-xl text-xs text-emerald-800 flex items-start gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>
                      <strong>{language === 'fr-FR' ? 'Abonnement protégé :' : 'Protected Subscription:'}</strong> {language === 'fr-FR' ? 'Votre compte Premium est actif. Aucun paiement supplémentaire ne vous sera demandé pour cette période.' : 'Your Premium account is active. You will never be asked to pay again for this active period.'}
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
                        <span className="font-bold">{language === 'fr-FR' ? 'Limite du forfait gratuit atteinte : ' : 'Free Plan Limit Reached: '}</span>
                        <span>{limitReason}</span>
                      </div>
                    </div>
                  )}

                  {/* Billing Country Selection & Currency Routing */}
                  <div className="p-3.5 bg-slate-50/90 rounded-2xl border border-slate-200/80 space-y-2.5" id="billing-country-card">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                        <Globe className="w-3.5 h-3.5 text-[#6750A4]" />
                        <span>{t('premium.billingCountry')}</span>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-700 flex items-center gap-1">
                        <span>{countryConfig.flag}</span>
                        <span>{countryConfig.currency} • {isIndia ? 'Razorpay' : 'PayPal'}</span>
                      </span>
                    </div>

                    <div className="relative">
                      <select
                        id="billing-country-select"
                        value={billingCountry}
                        onChange={(e) => handleCountryChange(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 appearance-none focus:outline-none focus:ring-2 focus:ring-[#6750A4]/30 focus:border-[#6750A4] cursor-pointer"
                      >
                        {SUPPORTED_COUNTRIES.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.flag} {c.name} ({c.currency} • {c.gateway === 'razorpay' ? 'Razorpay' : 'PayPal'})
                          </option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                        <ArrowRight className="w-3.5 h-3.5 rotate-90" />
                      </div>
                    </div>

                    <p className="text-[10px] text-slate-500 leading-tight">
                      {isIndia ? t('premium.indiaGatewayNotice') : t('premium.intlGatewayNotice')}
                    </p>
                  </div>

                  {/* Pricing Cards Selection */}
                  <div className="space-y-2">
                    <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                      <span>{language === 'fr-FR' ? 'Sélectionnez votre formule' : 'Select Subscription Plan'}</span>
                      <span className="text-[10px] text-slate-400 font-medium">{language === 'fr-FR' ? `Facturé en ${countryConfig.currency}` : `Billed in ${countryConfig.currency}`}</span>
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
                              <p className="text-[11px] text-[#49454F]">{plan.savingsText || plan.billingText || (language === 'fr-FR' ? 'Accès complet sans interruption' : 'Full uninterrupted access')}</p>
                            </div>

                            <div className="text-right">
                              <div className="text-sm font-extrabold text-[#1D1B20]">
                                {plan.formattedPrice}
                              </div>
                              {plan.monthlyEquivalent && (
                                <div className="text-[10px] text-[#6750A4] font-medium">
                                  {language === 'fr-FR' ? `Équivalent ${plan.monthlyEquivalent}` : `${plan.monthlyEquivalent} equivalent`}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Simple Account & Verification Section */}
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                      <span>{t('settings.accountProtection')}</span>
                      <span className="text-[10px] text-slate-400 font-medium">{language === 'fr-FR' ? 'Compte vérifié' : 'Verified Account'}</span>
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
                      <span>{language === 'fr-FR' ? 'Inclus dans l\'abonnement Premium :' : 'Everything Included in Premium:'}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs text-[#1D1B20] font-medium">
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>{t('premium.unlimitedTasks')}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>{t('premium.unlimitedTimetable')}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>{language === 'fr-FR' ? 'Devoirs illimités' : 'Unlimited Assignments'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>{t('premium.unlimitedNotes')}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>{language === 'fr-FR' ? 'Examens illimités' : 'Unlimited Exams'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>{t('premium.analytics')}</span>
                      </div>
                    </div>
                  </div>

                  {/* Dynamic PayPal Gateway Container (Rendered when PayPal is active) */}
                  {!isIndia && (
                    <div className="p-4 bg-slate-50/90 rounded-2xl border border-slate-200/90 space-y-3" id="paypal-checkout-section">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                        <div className="flex items-center gap-2">
                          <CreditCard className="w-4 h-4 text-[#6750A4]" />
                          <span>{t('premium.completeInPaypal')}</span>
                        </div>
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full">
                          USD ($) • PayPal & Cards
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-500">
                        {language === 'fr-FR' 
                          ? 'Payez en toute sécurité avec votre compte PayPal ou par carte bancaire/crédit.' 
                          : 'Pay securely using your PayPal balance, debit, or credit card.'}
                      </p>

                      <div 
                        ref={paypalContainerRef}
                        id="paypal-button-container" 
                        className="w-full min-h-[42px] transition-all"
                      />

                      {!isPaypalSdkReady && (
                        <div className="flex items-center justify-center gap-2 py-3 text-xs text-slate-500">
                          <Loader2 className="w-4 h-4 animate-spin text-[#6750A4]" />
                          <span>{t('premium.paypalLoading')}</span>
                        </div>
                      )}
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
                    <span>{language === 'fr-FR' ? 'Premium actif — Retourner à l\'application' : 'Premium Active — Return to App'}</span>
                  </button>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 px-1">
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{language === 'fr-FR' ? 'Abonnement actif en règle' : 'Active Subscription in Good Standing'}</span>
                    </div>
                    {onOpenRestore && (
                      <button
                        type="button"
                        onClick={onOpenRestore}
                        className="text-[#6750A4] hover:underline font-semibold cursor-pointer"
                      >
                        {t('settings.restorePurchase')}
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
                        <span>{language === 'fr-FR' ? 'Sécurisation de la connexion de paiement...' : 'Securing Payment Connection...'}</span>
                      </>
                    ) : !authUser ? (
                      <>
                        <span>{language === 'fr-FR' ? `Vérifier le compte pour continuer (${activePlan.formattedPrice})` : `Verify Account to Continue (${activePlan.formattedPrice})`}</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    ) : (
                      <>
                        <CreditCard className="w-4 h-4" />
                        <span>
                          {language === 'fr-FR'
                            ? (isIndia
                                ? `Régler ${activePlan.formattedPrice} avec Razorpay`
                                : `Payer ${activePlan.formattedPrice} avec PayPal / Carte`)
                            : (isIndia
                                ? `Pay ${activePlan.formattedPrice} with Razorpay`
                                : `Pay ${activePlan.formattedPrice} with PayPal / Card`)}
                        </span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>

                  <div className="flex items-center justify-center gap-2 text-[10px] text-[#49454F]">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{language === 'fr-FR' ? 'Transaction chiffrée 256 bits conforme aux normes bancaires' : 'Encrypted 256-bit bank grade transaction'}</span>
                    <span>•</span>
                    {onOpenRestore && (
                      <button
                        type="button"
                        onClick={onOpenRestore}
                        className="text-[#6750A4] hover:underline font-semibold cursor-pointer"
                      >
                        {t('settings.restorePurchase')}
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
