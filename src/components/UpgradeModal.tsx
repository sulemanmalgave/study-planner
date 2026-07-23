import React, { useState, useEffect } from 'react';
import { X, Check, Sparkles, Globe, ShieldCheck, Zap, CreditCard, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { Subscription } from '../types';

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

export default function UpgradeModal({ isOpen, onClose, onSuccess, currentCountry = 'IN', limitReason }: UpgradeModalProps) {
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('yearly');
  const [billingCountry, setBillingCountry] = useState<string>('IN');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentSuccessMessage, setPaymentSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setPaymentSuccessMessage(null);
      // Auto-detect country if not explicitly passed
      if (currentCountry) {
        setBillingCountry(currentCountry.toUpperCase() === 'IN' ? 'IN' : 'US');
      } else {
        fetch('/api/subscription/detect-country')
          .then((res) => res.json())
          .then((data) => {
            if (data.country) {
              setBillingCountry(data.country.toUpperCase() === 'IN' ? 'IN' : 'US');
            }
          })
          .catch(() => setBillingCountry('IN'));
      }
    }
  }, [isOpen, currentCountry]);

  if (!isOpen) return null;

  const isIndia = billingCountry === 'IN';

  // Prices
  const monthlyPrice = isIndia ? '₹99' : '$2.99';
  const yearlyPrice = isIndia ? '₹599' : '$19.99';
  const yearlyMonthlyEquivalent = isIndia ? '₹49/mo' : '$1.66/mo';
  const currencySymbol = isIndia ? '₹' : '$';

  // Load Razorpay Script dynamically
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

  // Load PayPal Script dynamically
  const loadPaypalScript = (clientId: string): Promise<boolean> => {
    return new Promise((resolve) => {
      if (window.paypal) {
        resolve(true);
        return;
      }
      const existingScript = document.getElementById('paypal-sdk-script');
      if (existingScript) {
        resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.id = 'paypal-sdk-script';
      script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=USD`;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handleVerifyPaymentOnBackend = async (payload: {
    orderId: string;
    paymentId?: string;
    signature?: string;
    provider: 'razorpay' | 'paypal';
  }) => {
    try {
      const response = await fetch('/api/subscription/verify-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Payment verification failed');
      }

      setPaymentSuccessMessage('🎉 Payment verified! Welcome to StudyFlow Premium.');
      if (onSuccess && data.subscription) {
        onSuccess(data.subscription);
      }

      setTimeout(() => {
        setIsLoading(false);
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Payment verification failed. Please try again.');
      setIsLoading(false);
    }
  };

  const handleCheckout = async () => {
    setIsLoading(true);
    setError(null);
    setPaymentSuccessMessage(null);

    try {
      // 1. Create order on backend
      const orderRes = await fetch('/api/subscription/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planType: selectedPlan,
          country: billingCountry,
        }),
      });

      const orderData = await orderRes.json();

      if (!orderRes.ok) {
        throw new Error(orderData.message || orderData.error || 'Failed to initialize payment order');
      }

      const { orderId, provider, keyId, amount, currency } = orderData;

      if (provider === 'razorpay') {
        const isScriptLoaded = await loadRazorpayScript();

        if (isScriptLoaded && window.Razorpay) {
          const options = {
            key: keyId,
            amount: amount * 100, // in paise
            currency: currency,
            name: 'StudyFlow Premium',
            description: `${selectedPlan === 'monthly' ? 'Monthly' : 'Yearly'} Premium Plan (${currencySymbol}${amount})`,
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
              name: 'Alex Mercer',
              email: 'alex.mercer@example.com',
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
          throw new Error('Razorpay Checkout SDK failed to load. Please check network connection.');
        }
      } else {
        // PayPal Flow
        const isPaypalLoaded = await loadPaypalScript(keyId);

        if (isPaypalLoaded && window.paypal) {
          // Trigger PayPal Modal or popup window
          window.paypal.Buttons({
            createOrder: () => orderId,
            onApprove: async (data: any) => {
              await handleVerifyPaymentOnBackend({
                orderId: data.orderID,
                provider: 'paypal',
              });
            },
            onError: (err: any) => {
              console.error('PayPal Buttons Error:', err);
              setError('PayPal Checkout encountered an error.');
              setIsLoading(false);
            },
            onCancel: () => {
              setIsLoading(false);
            }
          }).render('#paypal-button-container');
        } else {
          // Fallback verification call directly for order authorization
          await handleVerifyPaymentOnBackend({
            orderId,
            provider: 'paypal',
          });
        }
      }
    } catch (err: any) {
      console.error('Checkout error:', err);
      setError(err.message || 'Payment process failed. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-fade-in" id="upgrade-modal-backdrop">
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-100 flex flex-col max-h-[92vh] overflow-hidden text-slate-800" id="upgrade-modal-card">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-[#EADDFF] text-[#21005D] rounded-xl shadow-sm">
              <Sparkles className="w-5 h-5 text-[#6750A4]" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#1D1B20] tracking-tight">StudyFlow Premium</h3>
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
          
          {/* Limit Notification Notice if triggered by limit */}
          {limitReason && (
            <div className="p-3.5 bg-amber-50 border border-amber-200/80 rounded-2xl flex items-start gap-3 text-amber-900 animate-slide-down">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5 text-xs">
                <span className="font-bold">Free Plan Limit Reached</span>
                <p className="text-[#49454F] leading-relaxed">{limitReason}</p>
              </div>
            </div>
          )}

          {/* Region / Gateway Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-[#1D1B20] uppercase tracking-wider flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-[#6750A4]" />
                Select Billing Region
              </label>
              <span className="text-[10px] text-[#49454F] font-medium">
                {isIndia ? 'Razorpay (UPI / Cards / Netbanking)' : 'PayPal (Cards / International)'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 bg-[#F3EDF7] p-1 rounded-2xl border border-slate-200/60">
              <button
                type="button"
                onClick={() => setBillingCountry('IN')}
                className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                  isIndia 
                    ? 'bg-white text-[#21005D] shadow-sm border border-slate-200/80' 
                    : 'text-[#49454F] hover:text-[#1D1B20]'
                }`}
                id="select-country-in-btn"
              >
                <span>🇮🇳 India (INR)</span>
                {isIndia && <Check className="w-3.5 h-3.5 text-[#6750A4]" />}
              </button>

              <button
                type="button"
                onClick={() => setBillingCountry('US')}
                className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                  !isIndia 
                    ? 'bg-white text-[#21005D] shadow-sm border border-slate-200/80' 
                    : 'text-[#49454F] hover:text-[#1D1B20]'
                }`}
                id="select-country-us-btn"
              >
                <span>🌎 International (USD)</span>
                {!isIndia && <Check className="w-3.5 h-3.5 text-[#6750A4]" />}
              </button>
            </div>
          </div>

          {/* Plan Duration Cards */}
          <div className="space-y-2.5">
            <label className="text-xs font-bold text-[#1D1B20] uppercase tracking-wider">Choose Subscription Plan</label>
            <div className="grid grid-cols-2 gap-3">
              
              {/* Monthly Plan */}
              <div
                onClick={() => setSelectedPlan('monthly')}
                className={`p-4 rounded-2xl border cursor-pointer transition-all relative space-y-2 ${
                  selectedPlan === 'monthly'
                    ? 'border-[#6750A4] bg-[#F3EDF7]/80 ring-2 ring-[#6750A4]/20 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
                id="select-monthly-plan-card"
              >
                <div className="flex justify-between items-start">
                  <span className="text-xs font-bold text-[#1D1B20]">Monthly</span>
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                    selectedPlan === 'monthly' ? 'border-[#6750A4] bg-[#6750A4]' : 'border-slate-300'
                  }`}>
                    {selectedPlan === 'monthly' && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                  </div>
                </div>

                <div>
                  <div className="text-lg font-black text-[#1D1B20]">{monthlyPrice}</div>
                  <div className="text-[10px] text-[#49454F] font-medium">Billed monthly</div>
                </div>
              </div>

              {/* Yearly Plan */}
              <div
                onClick={() => setSelectedPlan('yearly')}
                className={`p-4 rounded-2xl border cursor-pointer transition-all relative space-y-2 ${
                  selectedPlan === 'yearly'
                    ? 'border-[#6750A4] bg-[#F3EDF7]/80 ring-2 ring-[#6750A4]/20 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
                id="select-yearly-plan-card"
              >
                <span className="absolute -top-2.5 right-3 px-2 py-0.5 text-[9px] font-black bg-[#6750A4] text-white rounded-full uppercase shadow-sm tracking-wider">
                  BEST VALUE • SAVE {isIndia ? '50%' : '44%'}
                </span>

                <div className="flex justify-between items-start">
                  <span className="text-xs font-bold text-[#1D1B20]">Yearly Plan</span>
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                    selectedPlan === 'yearly' ? 'border-[#6750A4] bg-[#6750A4]' : 'border-slate-300'
                  }`}>
                    {selectedPlan === 'yearly' && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                  </div>
                </div>

                <div>
                  <div className="text-lg font-black text-[#1D1B20]">{yearlyPrice}</div>
                  <div className="text-[10px] text-[#0f5132] font-semibold">{yearlyMonthlyEquivalent} • Billed yearly</div>
                </div>
              </div>

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
                <span>Full Lifetime History Analytics</span>
              </div>
            </div>
          </div>

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
            className="w-full py-3.5 px-4 text-xs font-bold text-white bg-[#6750A4] hover:bg-[#503E84] rounded-2xl shadow-lg shadow-[#6750A4]/20 flex items-center justify-center gap-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
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
                  Pay {selectedPlan === 'monthly' ? monthlyPrice : yearlyPrice} with {isIndia ? 'Razorpay' : 'PayPal'}
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
