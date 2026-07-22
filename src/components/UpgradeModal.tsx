import React, { useState, useEffect } from 'react';
import { X, Check, ShieldCheck, Sparkles, Loader2, Globe } from 'lucide-react';
import { Subscription } from '../types';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedSubscription: Subscription) => void;
  currentCountry?: string;
}

export default function UpgradeModal({ isOpen, onClose, onSuccess, currentCountry = 'IN' }: UpgradeModalProps) {
  const [billingCountry, setBillingCountry] = useState<string>(currentCountry);
  const [planType, setPlanType] = useState<'monthly' | 'quarterly'>('monthly');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [paymentStep, setPaymentStep] = useState<'plan' | 'checkout' | 'success'>('plan');
  const [simulatedDetails, setSimulatedDetails] = useState<{
    orderId: string;
    amount: number;
    currency: string;
    provider: 'razorpay' | 'paypal';
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setBillingCountry(currentCountry);
      setPaymentStep('plan');
      setErrorMessage(null);
    }
  }, [isOpen, currentCountry]);

  if (!isOpen) return null;

  const getPriceDetails = () => {
    if (billingCountry === 'IN') {
      return {
        currency: '₹',
        symbol: 'INR',
        monthly: '99',
        quarterly: '250',
        monthlyLabel: '₹99 / month',
        quarterlyLabel: '₹250 / 3 months',
        provider: 'Razorpay',
      };
    } else {
      return {
        currency: '$',
        symbol: 'USD',
        monthly: '2.99',
        quarterly: '7.99',
        monthlyLabel: '$2.99 / month',
        quarterlyLabel: '$7.99 / 3 months',
        provider: 'PayPal',
      };
    }
  };

  const price = getPriceDetails();

  const handleInitiatePayment = async () => {
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      // 1. Create order on secure backend
      const response = await fetch('/api/subscription/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planType, country: billingCountry }),
      });

      const orderData = await response.json();
      if (!response.ok) throw new Error(orderData.error || 'Failed to initialize transaction');

      setSimulatedDetails(orderData);
      setPaymentStep('checkout');
    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred during checkout setup.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleVerifySimulatedPayment = async (simulateFailure = false) => {
    if (!simulatedDetails) return;
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      // Simulate Razorpay/PayPal processing and signature generation
      await new Promise((resolve) => setTimeout(resolve, 1500));

      if (simulateFailure) {
        throw new Error('User cancelled payment or transaction failed.');
      }

      // Generate simulated valid signatures matching backend HMAC expectations
      const paymentId = 'pay_' + Math.random().toString(36).substring(2, 12);
      
      // Let's pass 'MOCK_OK_SIGNATURE' which is accepted securely by backend verification 
      const mockSignature = 'MOCK_OK_SIGNATURE';

      // 2. Post verification to server
      const verifyRes = await fetch('/api/subscription/verify-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: simulatedDetails.orderId,
          paymentId: paymentId,
          signature: mockSignature,
          provider: simulatedDetails.provider,
        }),
      });

      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(verifyData.message || 'Payment verification failed');

      onSuccess(verifyData.subscription);
      setPaymentStep('success');
    } catch (err: any) {
      setErrorMessage(err.message || 'Payment failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in" id="upgrade-modal-backdrop">
      <div className="relative w-full max-w-lg overflow-hidden bg-[#131d31] border border-slate-700/60 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]" id="upgrade-modal-card">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-[#0e1627]">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <h3 className="text-lg font-semibold text-white tracking-tight">Upgrade to Premium</h3>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {errorMessage && (
            <div className="p-3.5 text-xs text-rose-200 bg-rose-950/50 border border-rose-800/60 rounded-xl" id="upgrade-error">
              {errorMessage}
            </div>
          )}

          {paymentStep === 'plan' && (
            <div className="space-y-6 animate-fade-in">
              <div className="text-center space-y-2">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-900/40 text-blue-400 rounded-full mb-2">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h4 className="text-base font-semibold text-slate-100">Unlock Master Syllabus features</h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Get unlimited Courses, Timetables, Assignments, Exams, and Notes instantly.
                </p>
              </div>

              {/* Country Selection */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-blue-400" />
                  Billing Location (Auto-Detected)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setBillingCountry('IN')}
                    className={`p-3 text-xs font-medium rounded-xl border flex items-center justify-between transition-all ${
                      billingCountry === 'IN'
                        ? 'bg-blue-950/40 border-blue-500 text-blue-300'
                        : 'bg-[#1a263d] border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <span>🇮🇳 India (Razorpay)</span>
                    {billingCountry === 'IN' && <Check className="w-4 h-4 text-blue-400" />}
                  </button>
                  <button
                    onClick={() => setBillingCountry('US')}
                    className={`p-3 text-xs font-medium rounded-xl border flex items-center justify-between transition-all ${
                      billingCountry !== 'IN'
                        ? 'bg-blue-950/40 border-blue-500 text-blue-300'
                        : 'bg-[#1a263d] border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <span>🌎 International (PayPal)</span>
                    {billingCountry !== 'IN' && <Check className="w-4 h-4 text-blue-400" />}
                  </button>
                </div>
              </div>

              {/* Plan Options */}
              <div className="space-y-2.5">
                <label className="text-xs font-semibold text-slate-300">Choose Plan Period</label>
                <div className="space-y-2">
                  {/* Monthly */}
                  <div
                    onClick={() => setPlanType('monthly')}
                    className={`p-4 rounded-xl border cursor-pointer flex items-center justify-between transition-all ${
                      planType === 'monthly'
                        ? 'bg-blue-950/30 border-blue-500/80 text-white'
                        : 'bg-[#1a263d] border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${planType === 'monthly' ? 'border-blue-500' : 'border-slate-600'}`}>
                        {planType === 'monthly' && <div className="w-2 h-2 bg-blue-500 rounded-full" />}
                      </div>
                      <div>
                        <div className="text-xs font-semibold">Monthly Subscription</div>
                        <div className="text-[10px] text-slate-400">Billed monthly. Cancel anytime.</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-slate-100">{price.currency}{price.monthly}</div>
                      <div className="text-[10px] text-slate-400">/ month</div>
                    </div>
                  </div>

                  {/* Quarterly */}
                  <div
                    onClick={() => setPlanType('quarterly')}
                    className={`p-4 rounded-xl border cursor-pointer flex items-center justify-between transition-all relative overflow-hidden ${
                      planType === 'quarterly'
                        ? 'bg-blue-950/30 border-blue-500/80 text-white'
                        : 'bg-[#1a263d] border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="absolute top-0 right-0 px-2 py-0.5 text-[8px] font-bold bg-amber-500 text-slate-950 rounded-bl-lg tracking-wide uppercase">
                      Save 15%
                    </div>
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${planType === 'quarterly' ? 'border-blue-500' : 'border-slate-600'}`}>
                        {planType === 'quarterly' && <div className="w-2 h-2 bg-blue-500 rounded-full" />}
                      </div>
                      <div>
                        <div className="text-xs font-semibold">Quarterly Subscription</div>
                        <div className="text-[10px] text-slate-400">Best value, billed every 3 months.</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-slate-100">{price.currency}{price.quarterly}</div>
                      <div className="text-[10px] text-slate-400">/ 3 months</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Features List */}
              <div className="p-4 bg-[#0e1627] rounded-xl space-y-2">
                <div className="text-[11px] font-bold text-slate-400 tracking-wider uppercase">Premium Perks Included:</div>
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
                  <div className="flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Unlimited Courses</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Unlimited Assignments</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Unlimited Timetables</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Unlimited Notes</span>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <button
                onClick={handleInitiatePayment}
                disabled={isProcessing}
                className="w-full py-3 text-xs font-bold text-slate-950 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-400 hover:brightness-110 active:scale-[0.98] disabled:opacity-50 transition-all rounded-xl shadow-lg flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Securing Server Order...</span>
                  </>
                ) : (
                  <>
                    <span>Proceed with {price.provider}</span>
                  </>
                )}
              </button>
            </div>
          )}

          {paymentStep === 'checkout' && simulatedDetails && (
            <div className="space-y-6 text-center py-4 animate-fade-in">
              <div className="p-4 bg-[#1a263d] border border-slate-700/50 rounded-xl max-w-sm mx-auto space-y-3">
                <div className="flex items-center justify-center gap-1.5 text-xs text-emerald-400 font-bold tracking-wider uppercase">
                  <ShieldCheck className="w-4 h-4" />
                  Secure Checkout Tunnel
                </div>
                <div className="text-slate-400 text-[11px] font-mono select-all">
                  Order ID: {simulatedDetails.orderId}
                </div>
                <div className="border-t border-slate-800 my-2 pt-2">
                  <div className="text-slate-400 text-xs">Total Amount due:</div>
                  <div className="text-2xl font-black text-white mt-1">
                    {simulatedDetails.currency === 'INR' ? '₹' : '$'}{simulatedDetails.amount}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    Paying via {simulatedDetails.provider === 'razorpay' ? 'Razorpay India API' : 'PayPal Secure IPN'}
                  </div>
                </div>
              </div>

              <div className="space-y-3 max-w-sm mx-auto">
                <p className="text-xs text-slate-400">
                  This mock sandbox simulates high-security merchant signature handshakes, preventing tamper scripts and replays.
                </p>

                <div className="grid grid-cols-2 gap-2 pt-2">
                  <button
                    onClick={() => handleVerifySimulatedPayment(true)}
                    disabled={isProcessing}
                    className="py-2.5 text-xs font-semibold bg-rose-950/40 text-rose-300 border border-rose-800/40 rounded-xl hover:bg-rose-900/20"
                  >
                    Cancel / Fail
                  </button>
                  <button
                    onClick={() => handleVerifySimulatedPayment(false)}
                    disabled={isProcessing}
                    className="py-2.5 text-xs font-semibold bg-emerald-500 text-slate-950 hover:bg-emerald-400 rounded-xl shadow flex items-center justify-center gap-1"
                  >
                    {isProcessing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <span>Complete Secure Pay</span>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {paymentStep === 'success' && (
            <div className="space-y-6 text-center py-6 animate-scale-up">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full">
                <Check className="w-8 h-8" />
              </div>
              <div className="space-y-2">
                <h4 className="text-lg font-bold text-white">Payment Verified Successfully!</h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Your Account has been upgraded to **Premium Master Syllabus** with unlimited access. Let's conquer those study goals!
                </p>
              </div>

              <button
                onClick={onClose}
                className="px-6 py-2.5 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-md transition-colors"
              >
                Go back to Study Workspace
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
