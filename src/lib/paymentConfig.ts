export type GatewayProvider = 'razorpay' | 'paypal';

export interface PlanOption {
  id: 'monthly' | 'quarterly' | 'yearly';
  title: string;
  price: number;
  currency: 'INR' | 'USD';
  currencySymbol: string;
  formattedPrice: string;
  billingText: string;
  badge?: string;
  savingsText?: string;
  monthlyEquivalent?: string;
}

export interface GatewayConfig {
  id: GatewayProvider;
  name: string;
  badgeText: string;
  description: string;
  supportedMethods: string;
}

export interface CountryConfig {
  code: string;
  name: string;
  flag: string;
  gateway: GatewayProvider;
  currency: 'INR' | 'USD';
  currencySymbol: string;
  plans: PlanOption[];
}

export const COUNTRY_CONFIGS: Record<string, CountryConfig> = {
  IN: {
    code: 'IN',
    name: 'India',
    flag: '🇮🇳',
    gateway: 'razorpay',
    currency: 'INR',
    currencySymbol: '₹',
    plans: [
      {
        id: 'monthly',
        title: 'Monthly Plan',
        price: 99,
        currency: 'INR',
        currencySymbol: '₹',
        formattedPrice: '₹99',
        billingText: 'Billed monthly',
      },
      {
        id: 'yearly',
        title: 'Yearly Plan',
        price: 999,
        currency: 'INR',
        currencySymbol: '₹',
        formattedPrice: '₹999',
        billingText: 'Billed yearly',
        badge: 'BEST VALUE',
        savingsText: 'SAVE 16%',
        monthlyEquivalent: '₹83.25/mo',
      },
    ],
  },
  INTERNATIONAL: {
    code: 'US',
    name: 'International',
    flag: '🌎',
    gateway: 'paypal',
    currency: 'USD',
    currencySymbol: '$',
    plans: [
      {
        id: 'monthly',
        title: 'Monthly Plan',
        price: 1.99,
        currency: 'USD',
        currencySymbol: '$',
        formattedPrice: '$1.99',
        billingText: 'Billed monthly',
      },
      {
        id: 'yearly',
        title: 'Yearly Plan',
        price: 19.99,
        currency: 'USD',
        currencySymbol: '$',
        formattedPrice: '$19.99',
        billingText: 'Billed yearly',
        badge: 'BEST VALUE',
        savingsText: 'SAVE 16%',
        monthlyEquivalent: '$1.67/mo',
      },
    ],
  },
};

export const GATEWAY_CONFIGS: Record<GatewayProvider, GatewayConfig> = {
  razorpay: {
    id: 'razorpay',
    name: 'Razorpay',
    badgeText: 'Razorpay',
    description: 'Instant checkout for India via UPI, Netbanking, Cards & Wallets',
    supportedMethods: 'UPI (GPay, PhonePe, Paytm), Netbanking, Credit & Debit Cards',
  },
  paypal: {
    id: 'paypal',
    name: 'PayPal',
    badgeText: 'PayPal',
    description: 'Secure global checkout with PayPal, Credit & Debit Cards',
    supportedMethods: 'PayPal Account, Credit Cards, Debit Cards, Pay Later',
  },
};

// Helper to get country configuration safely
export function getCountryConfig(countryCode?: string): CountryConfig {
  const code = (countryCode || '').trim().toUpperCase();
  if (code === 'IN') {
    return COUNTRY_CONFIGS.IN;
  }
  return COUNTRY_CONFIGS.INTERNATIONAL;
}

// Automatic server-side country detection call
export async function detectUserCountry(): Promise<string> {
  try {
    const res = await fetch('/api/subscription/detect-country', { method: 'GET' });
    if (res.ok) {
      const data = await res.json();
      if (data?.country) {
        const detected = String(data.country).trim().toUpperCase();
        console.log(`[Country Auto-Detect] Server detected country: ${detected}`);
        return detected === 'IN' ? 'IN' : 'US';
      }
    }
    console.warn('[Country Detection Warning] Server detection returned non-OK status or empty payload. Defaulting to International (US).');
  } catch (e) {
    console.warn('[Country Detection Warning] Failed to reach backend country detection API. Defaulting to International (US):', e);
  }
  return 'US';
}

// Legacy function retained for backward compatibility (no-op)
export function saveBillingCountry(_countryCode: string): void {
  // Billing country selection is strictly automatic and non-overridable.
}
