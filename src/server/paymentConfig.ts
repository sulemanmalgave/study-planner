import dotenv from 'dotenv';

// Ensure environment variables from .env file are loaded
dotenv.config();

export interface PaymentConfig {
  razorpay: {
    keyId: string;
    keySecret: string;
  };
  paypal: {
    clientId: string;
    clientSecret: string;
    apiBaseUrl: string;
  };
}

/**
 * List of required environment variables for payment processing.
 */
const REQUIRED_PAYMENT_ENV_VARS = [
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'PAYPAL_CLIENT_ID',
  'PAYPAL_CLIENT_SECRET',
  'PAYPAL_API_BASE_URL',
] as const;

let cachedConfig: PaymentConfig | null = null;

/**
 * Validates that all required payment environment variables are present and non-empty.
 * Throws a detailed Error if any environment variables are missing.
 */
export function validatePaymentEnv(): void {
  const missingVars: string[] = [];

  for (const envVar of REQUIRED_PAYMENT_ENV_VARS) {
    const value = process.env[envVar];
    if (!value || value.trim() === '') {
      missingVars.push(envVar);
    }
  }

  if (missingVars.length > 0) {
    const errorMessage = `[Payment Configuration Fatal Error] Server startup failed. Missing required environment variable(s): ${missingVars.join(
      ', '
    )}. Ensure these variables are defined in process.env or .env.`;
    console.error('====================================================');
    console.error(errorMessage);
    console.error('====================================================');
    throw new Error(errorMessage);
  }

  // Validate PAYPAL_API_BASE_URL format
  const paypalUrl = process.env.PAYPAL_API_BASE_URL!.trim();
  if (!paypalUrl.startsWith('http://') && !paypalUrl.startsWith('https://')) {
    throw new Error(
      `[Payment Configuration Fatal Error] Invalid PAYPAL_API_BASE_URL: "${paypalUrl}". Must be a valid URL starting with http:// or https://.`
    );
  }
}

/**
 * Returns the validated payment configuration singleton.
 * Validates environment variables on first call or server startup.
 */
export function getPaymentConfig(): PaymentConfig {
  if (!cachedConfig) {
    validatePaymentEnv();

    const paypalApiBaseUrl = process.env.PAYPAL_API_BASE_URL!.trim().replace(/\/+$/, '');

    cachedConfig = {
      razorpay: {
        keyId: process.env.RAZORPAY_KEY_ID!.trim(),
        keySecret: process.env.RAZORPAY_KEY_SECRET!.trim(),
      },
      paypal: {
        clientId: process.env.PAYPAL_CLIENT_ID!.trim(),
        clientSecret: process.env.PAYPAL_CLIENT_SECRET!.trim(),
        apiBaseUrl: paypalApiBaseUrl,
      },
    };
  }

  return cachedConfig;
}

/**
 * Returns client-safe public credentials without secret keys.
 */
export function getPublicPaymentConfig() {
  const config = getPaymentConfig();
  return {
    razorpayKeyId: config.razorpay.keyId,
    paypalClientId: config.paypal.clientId,
    paypalApiBaseUrl: config.paypal.apiBaseUrl,
  };
}
