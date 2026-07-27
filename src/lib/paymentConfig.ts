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
        price: 199,
        currency: 'INR',
        currencySymbol: '₹',
        formattedPrice: '₹199',
        billingText: 'Billed monthly',
      },
      {
        id: 'quarterly',
        title: 'Quarterly Plan',
        price: 399,
        currency: 'INR',
        currencySymbol: '₹',
        formattedPrice: '₹399',
        billingText: 'Billed quarterly (3 months)',
        badge: 'BEST VALUE',
        savingsText: 'SAVE 33%',
        monthlyEquivalent: '₹133/mo',
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
        price: 4.99,
        currency: 'USD',
        currencySymbol: '$',
        formattedPrice: '$4.99',
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
        savingsText: 'SAVE 67%',
        monthlyEquivalent: '$1.66/mo',
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

// Client-side country auto-detection with multi-layered fallbacks
export async function detectUserCountry(savedProfileCountry?: string): Promise<string> {
  // 1. Check explicitly saved selection in localStorage
  try {
    const localSaved = localStorage.getItem('studyflow_billing_country');
    if (localSaved) {
      const clean = localSaved.trim().toUpperCase();
      if (clean === 'IN' || clean === 'US') return clean;
    }
  } catch (e) {
    console.warn('LocalStorage billing country access error:', e);
  }

  // 2. Check saved billing country in user profile
  if (savedProfileCountry) {
    const cleanProfile = savedProfileCountry.trim().toUpperCase();
    if (cleanProfile === 'IN') return 'IN';
    if (cleanProfile && cleanProfile !== 'IN') return 'US';
  }

  // 3. Try backend API country detection
  try {
    const res = await fetch('/api/subscription/detect-country', { method: 'GET' });
    if (res.ok) {
      const data = await res.json();
      if (data?.country) {
        const detected = String(data.country).trim().toUpperCase();
        return detected === 'IN' ? 'IN' : 'US';
      }
    }
  } catch (e) {
    console.warn('Backend country detection call failed, falling back to browser locale:', e);
  }

  // 4. Fallback: Browser Timezone Check
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (timeZone.includes('Kolkata') || timeZone.includes('Calcutta') || timeZone.includes('Asia/Kolkata')) {
      return 'IN';
    }
  } catch (e) {
    // ignore
  }

  // 5. Fallback: Browser Languages Check
  try {
    const languages = navigator.languages || [navigator.language || ''];
    for (const lang of languages) {
      if (lang && (lang.toLowerCase().endsWith('-in') || lang.toLowerCase().startsWith('hi'))) {
        return 'IN';
      }
    }
  } catch (e) {
    // ignore
  }

  // 6. Final Default
  return 'US';
}

// Save country choice locally and in storage
export function saveBillingCountry(countryCode: string): void {
  const cleanCode = countryCode.trim().toUpperCase() === 'IN' ? 'IN' : 'US';
  try {
    localStorage.setItem('studyflow_billing_country', cleanCode);
  } catch (e) {
    console.warn('Failed to save billing country to localStorage:', e);
  }
}
