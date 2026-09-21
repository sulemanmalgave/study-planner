import { Subscription } from '../types';

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

export const BILLING_COUNTRY_STORAGE_KEY = 'study_planner_billing_country';

export interface CountryOption {
  code: string;
  name: string;
  flag: string;
  gateway: GatewayProvider;
  currency: 'INR' | 'USD';
  currencySymbol: string;
}

export const SUPPORTED_COUNTRIES: CountryOption[] = [
  { code: 'IN', name: 'India', flag: '🇮🇳', gateway: 'razorpay', currency: 'INR', currencySymbol: '₹' },
  { code: 'US', name: 'United States', flag: '🇺🇸', gateway: 'paypal', currency: 'USD', currencySymbol: '$' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧', gateway: 'paypal', currency: 'USD', currencySymbol: '$' },
  { code: 'FR', name: 'France', flag: '🇫🇷', gateway: 'paypal', currency: 'USD', currencySymbol: '$' },
  { code: 'DE', name: 'Germany', flag: '🇩🇪', gateway: 'paypal', currency: 'USD', currencySymbol: '$' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦', gateway: 'paypal', currency: 'USD', currencySymbol: '$' },
  { code: 'AU', name: 'Australia', flag: '🇦🇺', gateway: 'paypal', currency: 'USD', currencySymbol: '$' },
  { code: 'IT', name: 'Italy', flag: '🇮🇹', gateway: 'paypal', currency: 'USD', currencySymbol: '$' },
  { code: 'ES', name: 'Spain', flag: '🇪🇸', gateway: 'paypal', currency: 'USD', currencySymbol: '$' },
  { code: 'NL', name: 'Netherlands', flag: '🇳🇱', gateway: 'paypal', currency: 'USD', currencySymbol: '$' },
  { code: 'CH', name: 'Switzerland', flag: '🇨🇭', gateway: 'paypal', currency: 'USD', currencySymbol: '$' },
  { code: 'JP', name: 'Japan', flag: '🇯🇵', gateway: 'paypal', currency: 'USD', currencySymbol: '$' },
  { code: 'SG', name: 'Singapore', flag: '🇸🇬', gateway: 'paypal', currency: 'USD', currencySymbol: '$' },
  { code: 'AE', name: 'United Arab Emirates', flag: '🇦🇪', gateway: 'paypal', currency: 'USD', currencySymbol: '$' },
  { code: 'BR', name: 'Brazil', flag: '🇧🇷', gateway: 'paypal', currency: 'USD', currencySymbol: '$' },
  { code: 'OTHER', name: 'Other Countries (International)', flag: '🌎', gateway: 'paypal', currency: 'USD', currencySymbol: '$' },
];

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

// Retrieve previously selected billing country from localStorage
export function getSavedBillingCountry(): string | null {
  try {
    const saved = localStorage.getItem(BILLING_COUNTRY_STORAGE_KEY);
    if (saved && typeof saved === 'string') {
      const clean = saved.trim().toUpperCase();
      if (clean) return clean;
    }
  } catch (e) {
    // Local storage access error (e.g. strict privacy mode)
  }
  return null;
}

// Persist user selected billing country
export function saveBillingCountry(countryCode: string): void {
  try {
    const clean = (countryCode || '').trim().toUpperCase();
    if (clean) {
      localStorage.setItem(BILLING_COUNTRY_STORAGE_KEY, clean);
    }
  } catch (e) {
    // Local storage access error
  }
}

// Helper to get country configuration safely
export function getCountryConfig(countryCode?: string): CountryConfig {
  const code = (countryCode || '').trim().toUpperCase();
  if (code === 'IN') {
    return COUNTRY_CONFIGS.IN;
  }

  // Find country metadata in supported countries or fallback
  const matched = SUPPORTED_COUNTRIES.find(c => c.code === code);
  const name = matched ? matched.name : (code ? code : 'International');
  const flag = matched ? matched.flag : '🌎';

  return {
    code: code || 'US',
    name,
    flag,
    gateway: 'paypal',
    currency: 'USD',
    currencySymbol: '$',
    plans: COUNTRY_CONFIGS.INTERNATIONAL.plans,
  };
}

// Automatic server-side country detection call with local persistence fallback
export async function detectUserCountry(): Promise<string> {
  // First check if the user previously selected their billing country
  const savedCountry = getSavedBillingCountry();
  if (savedCountry) {
    return savedCountry;
  }

  try {
    const res = await fetch('/api/subscription/detect-country', { method: 'GET' });
    if (res.ok) {
      const data = await res.json();
      if (data?.country) {
        const detected = String(data.country).trim().toUpperCase();
        console.log(`[Country Auto-Detect] Server detected country: ${detected}`);
        return detected === 'IN' ? 'IN' : detected;
      }
    }
    console.warn('[Country Detection Warning] Server detection returned non-OK status or empty payload. Defaulting to International (US).');
  } catch (e) {
    console.warn('[Country Detection Warning] Failed to reach backend country detection API. Defaulting to International (US):', e);
  }
  return 'US';
}

/**
 * Infers the normalized plan interval ('monthly' | 'quarterly' | 'yearly')
 * based on plan string, transaction properties, or time duration.
 * Returns null if the plan is generic/unspecified and cannot be resolved by dates.
 */
export function inferPlanInterval(
  plan?: string | null,
  purchaseDate?: string | null,
  expiryDate?: string | null
): 'monthly' | 'quarterly' | 'yearly' | null {
  const p = (plan || '').toLowerCase();
  if (p === 'monthly' || p.includes('month') || p.includes('mensuel')) return 'monthly';
  if (p === 'quarterly' || p.includes('quarter') || p.includes('trimestriel')) return 'quarterly';
  if (p === 'yearly' || p === 'annual' || p.includes('year') || p.includes('annuel')) return 'yearly';

  // If plan is legacy 'premium' or missing, accurately infer based on validity dates
  if (purchaseDate && expiryDate) {
    const start = new Date(purchaseDate).getTime();
    const end = new Date(expiryDate).getTime();
    if (!isNaN(start) && !isNaN(end) && end > start) {
      const diffDays = Math.round((end - start) / (1000 * 60 * 60 * 24));
      if (diffDays <= 35) return 'monthly';
      if (diffDays <= 120) return 'quarterly';
      return 'yearly';
    }
  }

  return null;
}

/**
 * Provides an authoritative, localized display title for the subscription plan.
 * Guarantees that users on Monthly plans are clearly and accurately identified,
 * and never blindly defaults missing plans to "Yearly".
 */
export function getPlanDisplayName(
  sub?: Subscription | null,
  language: string = 'en'
): string {
  if (!sub || sub.subscriptionStatus === 'free') {
    return language === 'fr-FR' ? 'Gratuit' : 'Free';
  }

  const interval = inferPlanInterval(sub.plan || (sub as any).type, sub.purchaseDate, sub.expiryDate);

  if (interval === 'monthly') {
    return language === 'fr-FR' ? 'Formule mensuelle (Illimitée)' : 'Monthly Plan (Unlimited)';
  }
  if (interval === 'quarterly') {
    return language === 'fr-FR' ? 'Formule trimestrielle (Illimitée)' : 'Quarterly Plan (Unlimited)';
  }
  if (interval === 'yearly') {
    return language === 'fr-FR' ? 'Formule annuelle (Illimitée)' : 'Yearly Plan (Unlimited)';
  }

  return language === 'fr-FR' ? 'Formule Premium (Illimitée)' : 'Premium Plan (Unlimited)';
}
