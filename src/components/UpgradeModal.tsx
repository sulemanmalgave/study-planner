import React, { useState, useEffect } from 'react';
import { X, Check, Sparkles, Globe, ShieldCheck, Zap, CreditCard, ArrowRight, Loader2, AlertCircle, Lock } from 'lucide-react';
import { Subscription } from '../types';
import { 
  getCountryConfig, 
  GATEWAY_CONFIGS, 
  detectUserCountry, 
  saveBillingCountry, 
  PlanOption 
} from '../lib/paymentConfig';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (updatedSubscription: Subscription) => void;
  currentCountry?: string;
  limitReason?: string;
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
  currentCountry, 
  limitReason 
}: UpgradeModalProps) {
  const [billingCountry, setBillingCountry] = useState<string>('IN');
  const [selectedPlanId, setSelectedPlanId] = useState<'monthly' | 'quarterly' | 'yearly'>('quarterly');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentSuccessMessage, setPaymentSuccessMessage] = useState<string | null>(null);

  // Auto-detect billing country on modal mount or when opening
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setPaymentSuccessMessage(null);
      
      detectUserCountry(currentCountry).then((detected) => {
        const countryCode = detected === 'IN' ? 'IN' : 'US';
        setBillingCountry(countryCode);
        
        // Default plan selection based on country
        if (countryCode === 'IN') {
          setSelectedPlanId('quarterly');
        } else {
          setSelectedPlanId('yearly');
        }
      });
    }
  }, [isOpen, currentCountry]);

  if (!isOpen) return null;

  // Derive current country config and gateway config dynamically
  const countryConfig = getCountryConfig(billingCountry);
  const isIndia = countryConfig.code === 'IN';
  const activeGateway = GATEWAY_CONFIGS[countryConfig.gateway];
  const plans = countryConfig.plans;

  // Selected plan object
  const activePlan = plans.find(p => p.id === selectedPlanId) || plans[0];

  // Handle manual country switch (instantly updates gateway, currency, prices, and saves to localStorage)
  const handleCountryChange = (newCountryCode: string) => {
    const code = newCountryCode === 'IN' ? 'IN' : 'US';
    setBillingCountry(code);
    saveBillingCountry(code);
    setError(null);

    // Auto switch selected plan if current plan ID doesn't exist in new country plans
    const newConfig = getCountryConfig(code);
    const hasPlan = newConfig.plans.some(p => p.id === selectedPlanId);
    if (!hasPlan) {
      if (code === 'IN') {
        setSelectedPlanId('quarterly');
      } else {
        setSelectedPlanId('yearly');
      }
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
      const data = await safeFetchJson('/api/subscription/verify-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
    setIsLoading(true);
    setError(null);
    setPaymentSuccessMessage(null);

    try {
      // 1. Create order on secure backend
      const orderData = await safeFetchJson('/api/subscription/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planType: activePlan.id,
          country: billingCountry,
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
              name: 'Student User',
              email: 'student@studyplanner.app',
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-fade-in" id="upgrade-modal-backdrop">
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-100 flex flex-col max-h-[92vh] overflow-hidden text-slate-800" id="upgrade-modal-card">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-2.5">
            <img 
              src="/logo.png" 
              alt="Study Planner Logo" 
              className="w-9 h-9 rounded-xl object-cover shadow-sm border border-slate-200/80 shrink-0" 
              referrerPolicy="no-referrer"
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
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors"
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

          {/* Billing Region Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-[#1D1B20] uppercase tracking-wider flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-[#6750A4]" />
                Billing Country
              </label>
              <span className="text-[10px] text-[#49454F] font-semibold bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                {isIndia ? 'INR (₹)' : 'USD ($)'}
              </span>
            </div>

            {/* Country Switcher */}
            <div className="grid grid-cols-2 gap-2 bg-[#F3EDF7] p-1 rounded-2xl border border-slate-200/60" id="billing-country-selector">
              <button
                type="button"
                onClick={() => handleCountryChange('IN')}
                className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-between transition-all ${
                  isIndia 
                    ? 'bg-white text-[#21005D] shadow-sm border border-slate-200/80' 
                    : 'text-[#49454F] hover:text-[#1D1B20]'
                }`}
                id="select-country-in-btn"
              >
                <div className="flex items-center gap-2">
                  <span>🇮🇳</span>
                  <span>India</span>
                </div>
                {isIndia && <Check className="w-3.5 h-3.5 text-[#6750A4]" />}
              </button>

              <button
                type="button"
                onClick={() => handleCountryChange('US')}
                className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-between transition-all ${
                  !isIndia 
                    ? 'bg-white text-[#21005D] shadow-sm border border-slate-200/80' 
                    : 'text-[#49454F] hover:text-[#1D1B20]'
                }`}
                id="select-country-us-btn"
              >
                <div className="flex items-center gap-2">
                  <span>🌎</span>
                  <span>International</span>
                </div>
                {!isIndia && <Check className="w-3.5 h-3.5 text-[#6750A4]" />}
              </button>
            </div>
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
                    className={`p-4 rounded-2xl border cursor-pointer transition-all relative space-y-2 ${
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
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
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
            disabled={isLoading || !!paymentSuccessMessage}
            className="w-full py-3.5 px-4 text-xs font-bold text-white bg-[#6750A4] hover:bg-[#503E84] rounded-2xl shadow-lg shadow-[#6750A4]/20 flex items-center justify-center gap-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
            id="pay-now-btn"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Securing Payment Connection...</span>
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
        </div>

      </div>
    </div>
  );
}
