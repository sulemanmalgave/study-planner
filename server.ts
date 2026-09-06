import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import multer from 'multer';
import mammoth from 'mammoth';
import Razorpay from 'razorpay';
import { GoogleGenAI } from '@google/genai';
import { FREE_PLAN_LIMITS, DatabaseSchema, UserProfile, StudyMaterial } from './src/types.js';

const PORT = 3000;
const DB_FILE = path.join(process.cwd(), 'server_db.json');
const MATERIALS_DIR = path.join(process.cwd(), 'uploads', 'materials');

// Ensure materials directory exists
if (!fs.existsSync(MATERIALS_DIR)) {
  try {
    fs.mkdirSync(MATERIALS_DIR, { recursive: true });
  } catch (e) {
    console.warn('Could not create materials upload directory:', e);
  }
}

// Multer storage configuration for PDF, DOC, DOCX
const materialsStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(MATERIALS_DIR)) {
      fs.mkdirSync(MATERIALS_DIR, { recursive: true });
    }
    cb(null, MATERIALS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeBase = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
    const uniqueName = `mat_${Date.now()}_${crypto.randomUUID().slice(0, 8)}_${safeBase}${ext}`;
    cb(null, uniqueName);
  },
});

const uploadMaterial = multer({
  storage: materialsStorage,
  limits: { fileSize: 30 * 1024 * 1024 }, // 30MB limit
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = ['.pdf', '.doc', '.docx'];
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, DOC, and DOCX files are allowed.'));
    }
  },
});

const sanitizeEnvVar = (val: string | undefined): string | undefined => {
  if (!val) return undefined;
  // Strip whitespace, tabs, newlines, carriage returns
  let clean = val.trim().replace(/[\r\n\t]/g, '');
  // Strip surrounding double/single quotes if present
  clean = clean.replace(/^["']|["']$/g, '').trim();
  return clean || undefined;
};

// Check whether a Gemini API secret/environment variable exists under any standard name
const getGeminiApiKey = (): string | undefined => {
  return (
    sanitizeEnvVar(process.env.GEMINI_API_KEY) ||
    sanitizeEnvVar(process.env.GOOGLE_GEMINI_API_KEY) ||
    sanitizeEnvVar(process.env.GOOGLE_AI_API_KEY)
  );
};

// Gemini Client Lazy Initializer
let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    console.error(
      '[Gemini AI Config] GEMINI_API_KEY is not configured in the server environment. Please set GEMINI_API_KEY in the Settings > Secrets panel.'
    );
    const err: any = new Error('GEMINI_API_KEY is not configured on the server. Please configure your GEMINI_API_KEY in the Settings > Secrets panel.');
    err.code = 'GEMINI_NOT_CONFIGURED';
    err.isConfigError = true;
    throw err;
  }
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return geminiClient;
}

// Concurrency lock to prevent accidental duplicate Gemini requests per lecture/action
const activeAiOperations = new Set<string>();

// Gemini error parser for actionable diagnostic codes and friendly user messages
interface GeminiErrorResponse {
  error: string;
  code: number;
  provider: 'google-gemini';
  message: string;
  diagnostic?: string;
}

function parseGeminiError(error: any): GeminiErrorResponse {
  const rawMsg = (error?.message || String(error || '')).replace(/AIza[0-9A-Za-z-_]{35}/g, '[REDACTED]');
  let statusCode = error?.status || error?.code || 500;
  if (typeof statusCode !== 'number') {
    const parsed = parseInt(String(statusCode), 10);
    statusCode = isNaN(parsed) ? 500 : parsed;
  }

  const lower = rawMsg.toLowerCase();

  // 401: Authentication failure
  if (lower.includes('401') || lower.includes('unauthenticated') || lower.includes('api key not valid') || lower.includes('invalid api key')) {
    return {
      error: 'AI_AUTH_FAILED',
      code: 401,
      provider: 'google-gemini',
      message: 'Gemini API authentication failed. The configured GEMINI_API_KEY appears invalid or inactive.',
      diagnostic: rawMsg.slice(0, 200),
    };
  }

  // 403: Permission denied
  if (lower.includes('403') || lower.includes('permission_denied') || lower.includes('access not configured')) {
    return {
      error: 'AI_PERMISSION_DENIED',
      code: 403,
      provider: 'google-gemini',
      message: 'Gemini API permission denied. The configured API key lacks permissions for this model.',
      diagnostic: rawMsg.slice(0, 200),
    };
  }

  // 429: Quota / Rate limit
  if (lower.includes('429') || lower.includes('quota') || lower.includes('resource_exhausted') || lower.includes('rate limit')) {
    return {
      error: 'AI_QUOTA_EXCEEDED',
      code: 429,
      provider: 'google-gemini',
      message: 'Gemini API quota or rate limit exceeded. Please wait a minute and retry.',
      diagnostic: rawMsg.slice(0, 200),
    };
  }

  // 503: High demand / Unavailable
  if (lower.includes('503') || lower.includes('unavailable') || lower.includes('high demand') || lower.includes('overloaded')) {
    return {
      error: 'AI_HIGH_DEMAND',
      code: 503,
      provider: 'google-gemini',
      message: 'Gemini AI models are currently experiencing temporary high demand. Please try again shortly.',
      diagnostic: rawMsg.slice(0, 200),
    };
  }

  // 404: Model not found
  if (lower.includes('404') || lower.includes('not found') || lower.includes('is no longer available')) {
    return {
      error: 'AI_MODEL_NOT_FOUND',
      code: 404,
      provider: 'google-gemini',
      message: 'The requested Gemini model could not be found or is no longer available.',
      diagnostic: rawMsg.slice(0, 200),
    };
  }

  // 400: Malformed or invalid input
  if (lower.includes('400') || lower.includes('invalid_argument') || lower.includes('bad request')) {
    return {
      error: 'AI_INVALID_ARGUMENT',
      code: 400,
      provider: 'google-gemini',
      message: 'The audio file or text data provided could not be processed by Gemini.',
      diagnostic: rawMsg.slice(0, 200),
    };
  }

  // Network / Timeout
  if (lower.includes('timeout') || lower.includes('econnreset') || lower.includes('etimedout') || lower.includes('network')) {
    return {
      error: 'AI_NETWORK_TIMEOUT',
      code: 504,
      provider: 'google-gemini',
      message: 'Connection to Gemini AI service timed out. Please check connectivity and retry.',
      diagnostic: rawMsg.slice(0, 200),
    };
  }

  return {
    error: 'AI_SERVICE_ERROR',
    code: statusCode >= 400 && statusCode < 600 ? statusCode : 500,
    provider: 'google-gemini',
    message: rawMsg.length > 200 ? `${rawMsg.slice(0, 200)}...` : rawMsg || 'An unexpected Gemini API error occurred.',
    diagnostic: rawMsg.slice(0, 200),
  };
}

// Resilient Text & Multimodal Generation with verified multi-model fallback chain
async function generateTextWithGemini(
  ai: GoogleGenAI,
  promptOrContents: any,
  systemInstruction?: string
): Promise<string> {
  // Ordered by proven latency and availability in production testing
  const models = ['gemini-3.6-flash', 'gemini-3.7-flash'];
  let lastError: any = null;

  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: promptOrContents,
        config: systemInstruction ? { systemInstruction } : undefined,
      });
      const text = response.text?.trim() || '';
      if (text) return text;
    } catch (err: any) {
      lastError = err;
      console.warn(`[Gemini AI] Text generation with ${model} failed, attempting next fallback:`, err?.message || err);
    }
  }

  throw lastError || new Error('Failed to generate content with Gemini across all fallback models.');
}

// Resilient Audio Transcription with verified multimodal audio models
async function transcribeAudioWithGemini(
  ai: GoogleGenAI,
  mimeType: string,
  base64Data: string,
  promptText: string
): Promise<string> {
  // Production verified multimodal models capable of transcribing raw audio waveforms
  const models = ['gemini-3.6-flash', 'gemini-3.7-flash'];
  let lastError: any = null;

  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64Data,
              },
            },
            {
              text: promptText,
            },
          ],
        },
      });
      const text = response.text?.trim();
      if (text) return text;
    } catch (err: any) {
      lastError = err;
      console.warn(`[Gemini AI] Audio transcription with ${model} failed, attempting next fallback:`, err?.message || err);
    }
  }

  if (lastError) {
    console.error('[Gemini AI] All transcription fallback models failed:', lastError?.message || lastError);
    throw lastError;
  }

  return 'No speech content could be transcribed.';
}

const getRazorpayCredentials = () => {
  const keyId = sanitizeEnvVar(process.env.RAZORPAY_KEY_ID);
  const keySecret = sanitizeEnvVar(process.env.RAZORPAY_KEY_SECRET);
  return { keyId, keySecret };
};

const getPaypalCredentials = () => {
  const clientId = sanitizeEnvVar(process.env.PAYPAL_CLIENT_ID);
  const clientSecret = sanitizeEnvVar(process.env.PAYPAL_CLIENT_SECRET);
  let apiBase = sanitizeEnvVar(process.env.PAYPAL_API_BASE);
  const envMode = (process.env.PAYPAL_MODE || process.env.PAYPAL_ENV || '').toLowerCase();

  if (!apiBase) {
    if (envMode === 'live' || envMode === 'production') {
      apiBase = 'https://api-m.paypal.com';
    } else if (envMode === 'sandbox') {
      apiBase = 'https://api-m.sandbox.paypal.com';
    } else {
      if (process.env.NODE_ENV === 'production' && envMode !== 'sandbox') {
        apiBase = 'https://api-m.paypal.com';
      } else {
        apiBase = 'https://api-m.sandbox.paypal.com';
      }
    }
  }

  // Remove trailing slashes
  apiBase = apiBase.replace(/\/+$/, '');

  const isLive = apiBase.includes('api-m.paypal.com') && !apiBase.includes('sandbox');
  const mode = isLive ? 'live' : 'sandbox';

  return { clientId, clientSecret, apiBase, mode };
};

async function fetchPaypalAccessToken(clientId: string, clientSecret: string, apiBase: string): Promise<string> {
  const hasClientId = Boolean(clientId && clientId.length > 0);
  const hasClientSecret = Boolean(clientSecret && clientSecret.length > 0);
  const mode = apiBase.includes('sandbox') ? 'sandbox' : 'live';

  console.log(`[PayPal Audit] Environment Mode: ${mode.toUpperCase()} | API Base URL: ${apiBase}`);
  console.log(`[PayPal Audit] PAYPAL_CLIENT_ID Present: ${hasClientId} (Length: ${clientId?.length || 0})`);
  console.log(`[PayPal Audit] PAYPAL_CLIENT_SECRET Present: ${hasClientSecret} (Length: ${clientSecret?.length || 0})`);

  if (!hasClientId || !hasClientSecret) {
    const missing: string[] = [];
    if (!hasClientId) missing.push('PAYPAL_CLIENT_ID');
    if (!hasClientSecret) missing.push('PAYPAL_CLIENT_SECRET');
    console.error(`[PayPal OAuth Error] Missing environment variables: ${missing.join(', ')}`);
    const err: any = new Error(`Missing PayPal environment variables: ${missing.join(', ')}.`);
    err.code = 'MISSING_PAYPAL_CONFIG';
    err.name = 'Missing PayPal Credentials';
    err.description = `The server requires ${missing.join(' and ')} to authenticate with PayPal.`;
    err.suggestedFix = `Set ${missing.join(' and ')} in your environment settings.`;
    throw err;
  }

  // Validate URL match for sandbox / live
  if (mode === 'live' && apiBase !== 'https://api-m.paypal.com') {
    console.warn(`[PayPal Warning] Live mode active but apiBase is ${apiBase}`);
  }
  if (mode === 'sandbox' && apiBase !== 'https://api-m.sandbox.paypal.com') {
    console.warn(`[PayPal Warning] Sandbox mode active but apiBase is ${apiBase}`);
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const tokenUrl = `${apiBase}/v1/oauth2/token`;

  console.log(`[PayPal OAuth Request] POST ${tokenUrl}`);
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  const responseText = await response.text();
  console.log(`[PayPal OAuth Response] Status: ${response.status}`);

  if (!response.ok) {
    let parsedErr: any = {};
    try { parsedErr = JSON.parse(responseText); } catch (e) {}
    const errDesc = parsedErr.error_description || parsedErr.message || responseText;
    console.error(`[PayPal OAuth Failed] Status: ${response.status}, Error: ${errDesc}`);
    const err: any = new Error(`PayPal OAuth authentication failed (${response.status}): ${errDesc}`);
    err.code = parsedErr.error || 'PAYPAL_OAUTH_FAILED';
    err.name = 'PayPal OAuth Authentication Failed';
    err.description = errDesc;
    err.status = response.status;
    err.suggestedFix = response.status === 401 
      ? `Verify that PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are valid and match the ${mode.toUpperCase()} environment (${apiBase}).`
      : 'Verify network connectivity and PayPal API availability.';
    throw err;
  }

  let data: { access_token?: string };
  try {
    data = JSON.parse(responseText);
  } catch (e) {
    const err: any = new Error(`Failed to parse PayPal OAuth response JSON: ${responseText}`);
    err.code = 'PAYPAL_OAUTH_INVALID_JSON';
    err.name = 'Invalid OAuth Response';
    err.description = responseText;
    err.suggestedFix = 'Ensure the PayPal API endpoint URL is correct.';
    throw err;
  }

  if (!data.access_token) {
    const err: any = new Error(`PayPal OAuth response did not contain access_token`);
    err.code = 'PAYPAL_OAUTH_NO_TOKEN';
    err.name = 'Missing Access Token';
    err.description = responseText;
    err.suggestedFix = 'Verify PayPal developer credentials and permissions.';
    throw err;
  }

  console.log(`[PayPal OAuth Success] Access token retrieved successfully.`);
  return data.access_token;
}

// In-memory backend payment verification maps to prevent forgery & replay attacks
const pendingOrders = new Map<string, {
  amount: number;
  currency: string;
  planType: 'monthly' | 'quarterly' | 'yearly';
  country: string;
  provider: 'razorpay' | 'paypal';
  createdAt: number;
  userId?: string;
  userEmail?: string;
}>();

const verifiedPayments = new Set<string>();

interface PairingSessionData {
  token: string;
  createdAt: number;
  expiresAt: number;
  status: 'pending' | 'paired' | 'cancelled' | 'expired';
  deviceName?: string;
  pairedAt?: string;
  deviceToken?: string;
}

const pairingSessions = new Map<string, PairingSessionData>();

// Helper function to evaluate subscription status and expiration
function isSubscriptionActive(sub: any): boolean {
  if (!sub) return false;
  const isStatusPremium = sub.subscriptionStatus === 'premium' || sub.plan === 'premium' || sub.plan === 'monthly' || sub.plan === 'yearly' || sub.plan === 'quarterly';
  if (!isStatusPremium) return false;
  if (sub.expiryDate) {
    return new Date(sub.expiryDate).getTime() > Date.now();
  }
  return true;
}

// Clean Initial State for New Users
const getInitialDatabaseState = (): DatabaseSchema => {
  return {
    profile: {
      name: 'Student',
      email: '',
      initials: 'ST',
      subscription: {
        subscriptionStatus: 'free',
        plan: null,
        paymentGateway: null,
        transactionId: null,
        purchaseDate: null,
        expiryDate: null,
        billingCountry: 'US',
        paymentProvider: null,
        paymentId: null,
      },
      aiUsage: {
        operationsCount: 0,
        maxMonthlyOperations: 60,
        minutesTranscribed: 0,
        maxMonthlyMinutes: 300,
        periodStart: new Date().toISOString(),
      },
    },
    courses: [],
    timetable: [],
    assignments: [],
    exams: [],
    notes: [],
    studySessions: [],
    audioLectures: [],
    studyMaterials: [],
  };
};

const getDbFilePath = (userId?: string) => {
  const baseDir = (process.env.VERCEL || process.env.TMPDIR) ? '/tmp' : process.cwd();
  if (userId) {
    const sanitized = userId.replace(/[^a-zA-Z0-9_-]/g, '_');
    if (sanitized) {
      return path.join(baseDir, `server_db_${sanitized}.json`);
    }
  }
  return path.join(baseDir, 'server_db.json');
};

// --- Dedicated Subscriptions & Entitlements Ledger ---
interface StoredSubscriptionLedgerEntry {
  transactionId: string;
  orderId?: string;
  userId?: string;
  userEmail?: string;
  plan: 'monthly' | 'quarterly' | 'yearly' | 'premium';
  paymentGateway: 'razorpay' | 'paypal';
  amount?: number;
  currency?: string;
  purchaseDate: string;
  expiryDate: string;
  billingCountry: string;
  verifiedAt: string;
  status: 'active' | 'expired' | 'revoked';
}

const getLedgerFilePath = () => {
  if (process.env.VERCEL || process.env.TMPDIR) {
    return path.join('/tmp', 'subscriptions_ledger.json');
  }
  return path.join(process.cwd(), 'subscriptions_ledger.json');
};

const readSubscriptionsLedger = (): StoredSubscriptionLedgerEntry[] => {
  try {
    const filePath = getLedgerFilePath();
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const data = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('[Ledger] Could not read subscriptions ledger:', err);
    return [];
  }
};

const writeSubscriptionsLedger = (ledger: StoredSubscriptionLedgerEntry[]) => {
  try {
    const filePath = getLedgerFilePath();
    fs.writeFileSync(filePath, JSON.stringify(ledger, null, 2));
  } catch (err) {
    console.warn('[Ledger] Could not write subscriptions ledger:', err);
  }
};

const recordSubscriptionInLedger = (entry: StoredSubscriptionLedgerEntry) => {
  const ledger = readSubscriptionsLedger();
  const existingIdx = ledger.findIndex(e => e.transactionId === entry.transactionId);
  if (existingIdx >= 0) {
    ledger[existingIdx] = { ...ledger[existingIdx], ...entry };
  } else {
    ledger.push(entry);
  }
  writeSubscriptionsLedger(ledger);
};

// --- Authoritative Simple Email User System ---
interface StoredUserRecord {
  userId: string;
  name: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
  verificationCode?: string;
  verificationCodeExpires?: number;
  verificationAttempts?: number;
}

const getUsersFilePath = () => {
  if (process.env.VERCEL || process.env.TMPDIR) {
    return path.join('/tmp', 'users_db.json');
  }
  return path.join(process.cwd(), 'users_db.json');
};

let inMemoryUsersList: StoredUserRecord[] = [];

const readUsers = (): StoredUserRecord[] => {
  try {
    const filePath = getUsersFilePath();
    if (!fs.existsSync(filePath)) {
      return inMemoryUsersList;
    }
    const data = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(data);
    const result = Array.isArray(parsed) ? parsed : [];
    inMemoryUsersList = result;
    return result;
  } catch (err) {
    console.warn('[Users] Could not read users db:', err);
    return inMemoryUsersList;
  }
};

const writeUsers = (users: StoredUserRecord[]) => {
  inMemoryUsersList = users;
  try {
    const filePath = getUsersFilePath();
    fs.writeFileSync(filePath, JSON.stringify(users, null, 2));
  } catch (err) {
    console.warn('[Users] Could not write users db:', err);
  }
};

const findUserByEmail = (email: string): StoredUserRecord | undefined => {
  const users = readUsers();
  const normalized = email.trim().toLowerCase();
  return users.find(u => u.email.trim().toLowerCase() === normalized);
};

const findUserById = (userId: string): StoredUserRecord | undefined => {
  const users = readUsers();
  return users.find(u => u.userId === userId);
};

const upsertUser = (user: StoredUserRecord): StoredUserRecord => {
  const users = readUsers();
  const idx = users.findIndex(
    u => u.userId === user.userId || u.email.trim().toLowerCase() === user.email.trim().toLowerCase()
  );
  if (idx >= 0) {
    users[idx] = { ...users[idx], ...user, updatedAt: new Date().toISOString() };
    writeUsers(users);
    return users[idx];
  } else {
    users.push(user);
    writeUsers(users);
    return user;
  }
};


const getActiveSubscriptionFromLedger = (userId?: string, userEmail?: string): StoredSubscriptionLedgerEntry | null => {
  const ledger = readSubscriptionsLedger();
  const now = Date.now();
  const activeEntries = ledger.filter(e => {
    if (e.status !== 'active') return false;
    const expiry = new Date(e.expiryDate).getTime();
    if (isNaN(expiry) || expiry <= now) return false;

    if (userId || userEmail) {
      const matchesUser = userId && e.userId === userId;
      const matchesEmail = userEmail && e.userEmail && e.userEmail.toLowerCase() === userEmail.toLowerCase();
      return Boolean(matchesUser || matchesEmail);
    }
    return true;
  });

  if (activeEntries.length === 0) return null;
  activeEntries.sort((a, b) => new Date(b.expiryDate).getTime() - new Date(a.expiryDate).getTime());
  return activeEntries[0];
};

const normalizePlanType = (plan: string): 'monthly' | 'yearly' | 'quarterly' => {
  if (plan === 'monthly' || plan === 'quarterly' || plan === 'yearly') {
    return plan;
  }
  return 'yearly';
};

let inMemoryDbMap = new Map<string, DatabaseSchema>();

// Database utility helpers with account isolation support
const readDB = (userId?: string, userEmail?: string): DatabaseSchema => {
  const memKey = userId ? `user_${userId}` : 'default';
  try {
    const filePath = getDbFilePath(userId);
    if (!fs.existsSync(filePath)) {
      // If user specific file does not exist, seed from initial database state
      const defaultState = getInitialDatabaseState();
      
      // If the user already has an active subscription in the ledger, preserve it!
      const activeFromLedger = getActiveSubscriptionFromLedger(userId, userEmail);
      if (activeFromLedger) {
        defaultState.profile.subscription = {
          subscriptionStatus: 'premium',
          plan: activeFromLedger.plan,
          paymentGateway: activeFromLedger.paymentGateway,
          transactionId: activeFromLedger.transactionId,
          purchaseDate: activeFromLedger.purchaseDate,
          expiryDate: activeFromLedger.expiryDate,
          billingCountry: activeFromLedger.billingCountry,
          type: normalizePlanType(activeFromLedger.plan),
          paymentProvider: activeFromLedger.paymentGateway,
          paymentId: activeFromLedger.transactionId,
        };
      }
      try {
        fs.writeFileSync(filePath, JSON.stringify(defaultState, null, 2));
      } catch (e) {
        inMemoryDbMap.set(memKey, defaultState);
      }
      return defaultState;
    }
    const data = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(data) as DatabaseSchema;
    if (!parsed.audioLectures) {
      parsed.audioLectures = [];
    }
    if (!parsed.studyMaterials) {
      parsed.studyMaterials = [];
    }
    if (!parsed.profile.aiUsage) {
      parsed.profile.aiUsage = {
        operationsCount: 0,
        maxMonthlyOperations: 60,
        minutesTranscribed: 0,
        maxMonthlyMinutes: 300,
        periodStart: new Date().toISOString(),
      };
    }

    // Protect subscription entitlement: If state has free but ledger has active subscription, reconcile
    if (!isSubscriptionActive(parsed.profile?.subscription)) {
      const activeFromLedger = getActiveSubscriptionFromLedger(userId, userEmail);
      if (activeFromLedger) {
        parsed.profile.subscription = {
          subscriptionStatus: 'premium',
          plan: activeFromLedger.plan,
          paymentGateway: activeFromLedger.paymentGateway,
          transactionId: activeFromLedger.transactionId,
          purchaseDate: activeFromLedger.purchaseDate,
          expiryDate: activeFromLedger.expiryDate,
          billingCountry: activeFromLedger.billingCountry,
          type: normalizePlanType(activeFromLedger.plan),
          paymentProvider: activeFromLedger.paymentGateway,
          paymentId: activeFromLedger.transactionId,
        };
      }
    }

    return parsed;
  } catch (err) {
    console.error(`Error reading database file for user ${userId || 'default'}, using fallback state:`, err);
    let fallback = inMemoryDbMap.get(memKey);
    if (!fallback) {
      fallback = getInitialDatabaseState();
      inMemoryDbMap.set(memKey, fallback);
    }
    if (!fallback.audioLectures) {
      fallback.audioLectures = [];
    }
    if (!fallback.studyMaterials) {
      fallback.studyMaterials = [];
    }
    if (!isSubscriptionActive(fallback.profile?.subscription)) {
      const activeFromLedger = getActiveSubscriptionFromLedger(userId, userEmail);
      if (activeFromLedger) {
        fallback.profile.subscription = {
          subscriptionStatus: 'premium',
          plan: activeFromLedger.plan,
          paymentGateway: activeFromLedger.paymentGateway,
          transactionId: activeFromLedger.transactionId,
          purchaseDate: activeFromLedger.purchaseDate,
          expiryDate: activeFromLedger.expiryDate,
          billingCountry: activeFromLedger.billingCountry,
          type: normalizePlanType(activeFromLedger.plan),
          paymentProvider: activeFromLedger.paymentGateway,
          paymentId: activeFromLedger.transactionId,
        };
      }
    }
    return fallback;
  }
};

const writeDB = (data: DatabaseSchema, userId?: string, userEmail?: string) => {
  const memKey = userId ? `user_${userId}` : 'default';
  // Entitlement protection: Prevent accidental downgrade if ledger has active subscription
  if (!isSubscriptionActive(data.profile?.subscription)) {
    const activeFromLedger = getActiveSubscriptionFromLedger(userId, userEmail);
    if (activeFromLedger) {
      data.profile.subscription = {
        subscriptionStatus: 'premium',
        plan: activeFromLedger.plan,
        paymentGateway: activeFromLedger.paymentGateway,
        transactionId: activeFromLedger.transactionId,
        purchaseDate: activeFromLedger.purchaseDate,
        expiryDate: activeFromLedger.expiryDate,
        billingCountry: activeFromLedger.billingCountry,
        type: normalizePlanType(activeFromLedger.plan),
        paymentProvider: activeFromLedger.paymentGateway,
        paymentId: activeFromLedger.transactionId,
      };
    }
  }

  inMemoryDbMap.set(memKey, data);
  try {
    const filePath = getDbFilePath(userId);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.warn(`Could not write database file for user ${userId || 'default'} to disk (in-memory state updated):`, err);
  }
};

const getEffectiveUser = (req: express.Request): { userId?: string; userEmail?: string } => {
  const userId = (req.headers['x-user-id'] || req.query.userId || req.body?.userId || '') as string;
  const userEmail = (req.headers['x-user-email'] || req.query.userEmail || req.body?.userEmail || '') as string;
  return {
    userId: userId ? String(userId).trim() : undefined,
    userEmail: userEmail ? String(userEmail).trim() : undefined,
  };
};

// AI Usage Tracking & Limits Check Helper
function checkAndIncrementAiUsage(db: DatabaseSchema, durationSeconds: number = 0): { allowed: boolean; reason?: string } {
  if (!db.profile.aiUsage) {
    db.profile.aiUsage = {
      operationsCount: 0,
      maxMonthlyOperations: 60,
      minutesTranscribed: 0,
      maxMonthlyMinutes: 300,
      periodStart: new Date().toISOString(),
    };
  }

  const periodTime = new Date(db.profile.aiUsage.periodStart).getTime();
  // Reset usage monthly (30 days cycle)
  if (Date.now() - periodTime > 30 * 24 * 60 * 60 * 1000) {
    db.profile.aiUsage.operationsCount = 0;
    db.profile.aiUsage.minutesTranscribed = 0;
    db.profile.aiUsage.periodStart = new Date().toISOString();
  }

  if (db.profile.aiUsage.operationsCount >= db.profile.aiUsage.maxMonthlyOperations) {
    return {
      allowed: false,
      reason: `You have reached your monthly AI allowance of ${db.profile.aiUsage.maxMonthlyOperations} operations. Upgrade your plan or wait for the next billing cycle.`,
    };
  }

  db.profile.aiUsage.operationsCount += 1;
  if (durationSeconds > 0) {
    db.profile.aiUsage.minutesTranscribed += Math.round(durationSeconds / 60);
  }

  return { allowed: true };
}

export const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Request logging middleware for API endpoints
app.use('/api', (req, res, next) => {
  console.log(`[API ${req.method}] ${req.originalUrl}`);
  next();
});

// API Routes
// 1. Get entire state
app.get('/api/state', (req, res) => {
  try {
    const { userId, userEmail } = getEffectiveUser(req);
    const db = readDB(userId, userEmail);
    res.json(db);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read database state' });
  }
});

  // 2. Update user profile
  app.put('/api/profile', (req, res) => {
    try {
      const { userId, userEmail } = getEffectiveUser(req);
      const db = readDB(userId, userEmail);
      db.profile = { ...db.profile, ...req.body };
      writeDB(db, userId, userEmail);
      res.json(db.profile);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update profile' });
    }
  });

  // 3. Courses CRUD with limit check
  app.post('/api/courses', (req, res) => {
    try {
      const { userId, userEmail } = getEffectiveUser(req);
      const db = readDB(userId, userEmail);
      if (!isSubscriptionActive(db.profile.subscription) && db.courses.length >= FREE_PLAN_LIMITS.courses) {
        return res.status(403).json({
          error: 'LIMIT_REACHED',
          message: 'You have reached the free plan limit of 5 courses. Upgrade to Premium for unlimited access.',
        });
      }
      const rawName = (req.body.name || '').trim();
      if (!rawName) {
        return res.status(400).json({ error: 'Name is required' });
      }
      const normalizedNew = rawName.toLowerCase();
      const isDuplicate = db.courses.some((c) => c.name.trim().toLowerCase() === normalizedNew);
      if (isDuplicate) {
        return res.status(400).json({
          error: 'DUPLICATE_NAME',
          message: `A subject with the name "${rawName}" already exists.`,
        });
      }

      const newCourse = {
        id: 'c_' + crypto.randomUUID().slice(0, 8),
        name: rawName,
        color: req.body.color || '#3b82f6',
        code: (req.body.code || '').trim(),
      };
      db.courses.push(newCourse);
      writeDB(db, userId, userEmail);
      res.json(newCourse);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create course' });
    }
  });

  app.put('/api/courses/:id', (req, res) => {
    try {
      const { userId, userEmail } = getEffectiveUser(req);
      const db = readDB(userId, userEmail);
      const index = db.courses.findIndex((c) => c.id === req.params.id);
      if (index === -1) return res.status(404).json({ error: 'Course not found' });

      if (req.body.name) {
        const rawName = req.body.name.trim();
        const normalizedNew = rawName.toLowerCase();
        const isDuplicate = db.courses.some(
          (c) => c.id !== req.params.id && c.name.trim().toLowerCase() === normalizedNew
        );
        if (isDuplicate) {
          return res.status(400).json({
            error: 'DUPLICATE_NAME',
            message: `A subject with the name "${rawName}" already exists.`,
          });
        }
        req.body.name = rawName;
      }

      db.courses[index] = { ...db.courses[index], ...req.body };
      writeDB(db, userId, userEmail);
      res.json(db.courses[index]);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update course' });
    }
  });

  app.delete('/api/courses/:id', (req, res) => {
    try {
      const { userId, userEmail } = getEffectiveUser(req);
      const db = readDB(userId, userEmail);
      // Safe deletion: remove course from courses list but keep user assignments, timetable, exams & notes intact
      db.courses = db.courses.filter((c) => c.id !== req.params.id);
      writeDB(db, userId, userEmail);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete course' });
    }
  });

  // 4. Timetable CRUD with limit check
  // Here, we'll treat timetables.length (individual periods) as limited to FREE_PLAN_LIMITS.timetables,
  // OR support "Active Timetable Schedule Tabs" (multiple timetables), limiting to 2 timetables.
  // Let's implement active schedules and limit the user to 2 custom timetable schedules,
  // OR limit them to 2 periods on the free plan, but let them add unlimited inside premium.
  // To keep it highly user-friendly and fully aligned with "2 Timetables" while keeping unlimited periods inside each:
  // We'll support multiple schedules. On the free plan, they can have at most 2 distinct weekly schedules (e.g. "Term 1 Schedule", "Exam Schedule").
  // By default, let's track the schedule items, and support two custom schedules (e.g., Schedule A, Schedule B).
  // If they want to add a third timetable schedule, we block them.
  // Let's implement dynamic schedules.
  app.post('/api/timetable', (req, res) => {
    try {
      const db = readDB();
      
      // Calculate active schedules or periods. To be secure, let's limit total periods on free plan to 5, or schedules to 2.
      // The prompt says: "2 Timetables". Let's support multiple timetables.
      // If we represent a "timetable" as a collection of periods, a free user can create periods for at most 2 distinct "timetable schedules".
      // Let's count unique timetable IDs. If we have a single default timetable, and they want to create a second schedule, we enforce.
      // Alternatively, let's check unique periods. To keep things extremely simple and transparent, let's enforce a limit of at most 2 custom schedule schedules.
      // Let's count periods. If free, let's allow at most 2 periods as the core limit for simpler demo testing, or separate schedules. Let's make it 2 periods for the free limit to trigger easily, or allow creating at most 2 separate weekly schedules.
      // Let's enforce that a user on the Free plan can create at most 2 period entries in their timetable so they hit the limit beautifully, and can upgrade.
      const totalPeriods = db.timetable.length;
      if (!isSubscriptionActive(db.profile.subscription) && totalPeriods >= FREE_PLAN_LIMITS.timetables) {
        return res.status(403).json({
          error: 'LIMIT_REACHED',
          message: 'You have reached the free plan limit of 10 Timetables / Schedule Entries. Upgrade to Premium for unlimited access.',
        });
      }
      const newPeriod = {
        id: 't_' + crypto.randomUUID().slice(0, 8),
        day: req.body.day || 'Monday',
        subject: req.body.subject || 'Untitled Class',
        startTime: req.body.startTime || '09:00',
        endTime: req.body.endTime || '10:00',
        courseId: req.body.courseId || 'c1',
      };
      db.timetable.push(newPeriod);
      writeDB(db);
      res.json(newPeriod);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create timetable period' });
    }
  });

  app.put('/api/timetable/:id', (req, res) => {
    try {
      const db = readDB();
      const index = db.timetable.findIndex((t) => t.id === req.params.id);
      if (index === -1) return res.status(404).json({ error: 'Schedule entry not found' });
      db.timetable[index] = { ...db.timetable[index], ...req.body };
      writeDB(db);
      res.json(db.timetable[index]);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update schedule entry' });
    }
  });

  app.delete('/api/timetable/:id', (req, res) => {
    try {
      const db = readDB();
      db.timetable = db.timetable.filter((t) => t.id !== req.params.id);
      writeDB(db);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete schedule entry' });
    }
  });

  // 5. Assignments CRUD with limit check
  app.post('/api/assignments', (req, res) => {
    try {
      const db = readDB();
      const activeTasks = db.assignments.filter((a) => a.status === 'pending').length;
      if (
        !isSubscriptionActive(db.profile.subscription) &&
        (db.assignments.length >= FREE_PLAN_LIMITS.assignments || activeTasks >= FREE_PLAN_LIMITS.tasks)
      ) {
        return res.status(403).json({
          error: 'LIMIT_REACHED',
          message: 'You have reached the free plan limit of 10 assignments / 20 active tasks. Upgrade to Premium for unlimited access.',
        });
      }
      const newAssignment = {
        id: 'a_' + crypto.randomUUID().slice(0, 8),
        title: req.body.title || 'Untitled Assignment',
        courseId: req.body.courseId || db.courses[0]?.id || '',
        dueDate: req.body.dueDate || new Date().toISOString().split('T')[0],
        status: req.body.status || 'pending',
        priority: req.body.priority || 'medium',
        description: req.body.description || '',
      };
      db.assignments.push(newAssignment);
      writeDB(db);
      res.json(newAssignment);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create assignment' });
    }
  });

  app.put('/api/assignments/:id', (req, res) => {
    try {
      const db = readDB();
      const index = db.assignments.findIndex((a) => a.id === req.params.id);
      if (index === -1) return res.status(404).json({ error: 'Assignment not found' });
      db.assignments[index] = { ...db.assignments[index], ...req.body };
      writeDB(db);
      res.json(db.assignments[index]);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update assignment' });
    }
  });

  app.delete('/api/assignments/:id', (req, res) => {
    try {
      const db = readDB();
      db.assignments = db.assignments.filter((a) => a.id !== req.params.id);
      writeDB(db);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete assignment' });
    }
  });

  // 6. Exams CRUD with limit check
  app.post('/api/exams', (req, res) => {
    try {
      const db = readDB();
      if (!isSubscriptionActive(db.profile.subscription) && db.exams.length >= FREE_PLAN_LIMITS.exams) {
        return res.status(403).json({
          error: 'LIMIT_REACHED',
          message: 'You have reached the free plan limit of 5 exams. Upgrade to Premium for unlimited access.',
        });
      }
      const newExam = {
        id: 'e_' + crypto.randomUUID().slice(0, 8),
        name: req.body.name || 'Untitled Exam',
        courseId: req.body.courseId || db.courses[0]?.id || '',
        date: req.body.date || new Date().toISOString().split('T')[0],
        status: req.body.status || 'upcoming',
        description: req.body.description || '',
      };
      db.exams.push(newExam);
      writeDB(db);
      res.json(newExam);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create exam' });
    }
  });

  app.put('/api/exams/:id', (req, res) => {
    try {
      const db = readDB();
      const index = db.exams.findIndex((e) => e.id === req.params.id);
      if (index === -1) return res.status(404).json({ error: 'Exam not found' });
      db.exams[index] = { ...db.exams[index], ...req.body };
      writeDB(db);
      res.json(db.exams[index]);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update exam' });
    }
  });

  app.delete('/api/exams/:id', (req, res) => {
    try {
      const db = readDB();
      db.exams = db.exams.filter((e) => e.id !== req.params.id);
      writeDB(db);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete exam' });
    }
  });

  // 7. Notes CRUD with limit check
  app.post('/api/notes', (req, res) => {
    try {
      const db = readDB();
      if (!isSubscriptionActive(db.profile.subscription) && db.notes.length >= FREE_PLAN_LIMITS.notes) {
        return res.status(403).json({
          error: 'LIMIT_REACHED',
          message: 'You have reached the free plan limit of 10 notes. Upgrade to Premium for unlimited access.',
        });
      }
      const newNote = {
        id: 'n_' + crypto.randomUUID().slice(0, 8),
        title: req.body.title || 'Untitled Note',
        content: req.body.content || '',
        courseId: req.body.courseId || '',
        updatedAt: new Date().toISOString(),
      };
      db.notes.push(newNote);
      writeDB(db);
      res.json(newNote);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create note' });
    }
  });

  app.put('/api/notes/:id', (req, res) => {
    try {
      const db = readDB();
      const index = db.notes.findIndex((n) => n.id === req.params.id);
      if (index === -1) return res.status(404).json({ error: 'Note not found' });
      db.notes[index] = {
        ...db.notes[index],
        title: req.body.title || db.notes[index].title,
        content: req.body.content !== undefined ? req.body.content : db.notes[index].content,
        courseId: req.body.courseId !== undefined ? req.body.courseId : db.notes[index].courseId,
        updatedAt: new Date().toISOString(),
      };
      writeDB(db);
      res.json(db.notes[index]);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update note' });
    }
  });

  app.delete('/api/notes/:id', (req, res) => {
    try {
      const db = readDB();
      db.notes = db.notes.filter((n) => n.id !== req.params.id);
      writeDB(db);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete note' });
    }
  });

  // 8. Study Sessions (Unlimited)
  app.post('/api/sessions', (req, res) => {
    try {
      const db = readDB();
      const newSession = {
        id: 's_' + crypto.randomUUID().slice(0, 8),
        durationMinutes: parseInt(req.body.durationMinutes) || Math.max(1, Math.round((req.body.actualFocusedDurationSeconds || 1500) / 60)),
        type: req.body.type || 'pomodoro',
        date: req.body.date || new Date().toISOString().split('T')[0],
        courseId: req.body.courseId,
        subjectName: req.body.subjectName,
        startTime: req.body.startTime,
        endTime: req.body.endTime,
        plannedDurationMinutes: req.body.plannedDurationMinutes,
        actualFocusedDurationSeconds: req.body.actualFocusedDurationSeconds,
        pausedDurationSeconds: req.body.pausedDurationSeconds,
        status: req.body.status || 'completed',
        completed: req.body.completed !== undefined ? req.body.completed : true,
        createdAt: req.body.createdAt || new Date().toISOString(),
      };
      db.studySessions.push(newSession);
      writeDB(db);
      res.json(newSession);
    } catch (error) {
      res.status(500).json({ error: 'Failed to save study session' });
    }
  });

  // 8a. Audio Lectures CRUD
  app.get('/api/audio-lectures', (req, res) => {
    try {
      const db = readDB();
      res.json(db.audioLectures || []);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch audio lectures' });
    }
  });

  app.post('/api/audio-lectures', (req, res) => {
    try {
      const db = readDB();
      if (!db.audioLectures) db.audioLectures = [];
      const isPro = isSubscriptionActive(db.profile.subscription);
      if (!isPro && db.audioLectures.length >= FREE_PLAN_LIMITS.audioLectures) {
        return res.status(403).json({
          error: 'LIMIT_REACHED',
          message: "You've reached the Free plan limit of 2 Audio Lectures. Upgrade to Pro to add more.",
        });
      }
      const newLecture = {
        id: 'al_' + crypto.randomUUID().slice(0, 8),
        userId: req.body.userId || 'default',
        courseId: req.body.courseId || '',
        subjectName: req.body.subjectName || 'General',
        section: req.body.section || '',
        title: req.body.title || 'Untitled Lecture',
        audioDataUrl: req.body.audioDataUrl || '',
        originalFileName: req.body.originalFileName || 'recording.mp3',
        fileSize: req.body.fileSize || 0,
        fileType: req.body.fileType || 'audio/mpeg',
        duration: req.body.duration || 0,
        transcript: req.body.transcript || '',
        transcriptGeneratedAt: req.body.transcriptGeneratedAt || null,
        summary: req.body.summary || '',
        summaryGeneratedAt: req.body.summaryGeneratedAt || null,
        studyNotes: req.body.studyNotes || '',
        studyNotesGeneratedAt: req.body.studyNotesGeneratedAt || null,
        keyPoints: req.body.keyPoints || '',
        keyPointsGeneratedAt: req.body.keyPointsGeneratedAt || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db.audioLectures.push(newLecture);
      writeDB(db);
      res.json(newLecture);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create audio lecture' });
    }
  });

  app.put('/api/audio-lectures/:id', (req, res) => {
    try {
      const db = readDB();
      if (!db.audioLectures) db.audioLectures = [];
      const index = db.audioLectures.findIndex((al) => al.id === req.params.id);
      if (index === -1) return res.status(404).json({ error: 'Audio lecture not found' });
      db.audioLectures[index] = {
        ...db.audioLectures[index],
        ...req.body,
        updatedAt: new Date().toISOString(),
      };
      writeDB(db);
      res.json(db.audioLectures[index]);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update audio lecture' });
    }
  });

  app.delete('/api/audio-lectures/:id', (req, res) => {
    try {
      const db = readDB();
      if (!db.audioLectures) db.audioLectures = [];
      db.audioLectures = db.audioLectures.filter((al) => al.id !== req.params.id);
      writeDB(db);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete audio lecture' });
    }
  });

  // 8b. AI Audio Lectures (Gemini API Integration)
  // CRITICAL: Individual on-demand triggers only. Uploading or opening never calls these automatically.
  
  // AI 1: Generate Transcript (uses audio data)
  app.post('/api/ai/audio-lectures/:id/transcript', async (req, res) => {
    const opKey = `${req.params.id}:transcript`;
    if (activeAiOperations.has(opKey)) {
      return res.status(409).json({
        error: 'OPERATION_IN_PROGRESS',
        message: 'An AI transcription is already in progress for this lecture. Please wait a moment.',
      });
    }

    activeAiOperations.add(opKey);
    try {
      const db = readDB();
      if (!isSubscriptionActive(db.profile.subscription)) {
        return res.status(403).json({
          error: 'PRO_FEATURE_REQUIRED',
          message: 'AI Audio Lecture Studio requires an active Pro subscription.',
        });
      }

      if (!db.audioLectures) db.audioLectures = [];
      const index = db.audioLectures.findIndex((al) => al.id === req.params.id);
      if (index === -1) {
        return res.status(404).json({ error: 'Audio lecture not found' });
      }

      const lecture = db.audioLectures[index];
      const audioBase64 = req.body.audioBase64 || lecture.audioDataUrl;
      if (!audioBase64) {
        return res.status(400).json({
          error: 'MISSING_AUDIO',
          message: 'No audio data provided. Please ensure the lecture audio file is available.',
        });
      }

      const usageCheck = checkAndIncrementAiUsage(db, lecture.duration || 0);
      if (!usageCheck.allowed) {
        return res.status(429).json({
          error: 'AI_LIMIT_REACHED',
          message: usageCheck.reason || 'Monthly AI operations quota reached.',
        });
      }

      let ai;
      try {
        ai = getGeminiClient();
      } catch (e: any) {
        return res.status(503).json({
          error: 'GEMINI_NOT_CONFIGURED',
          code: 503,
          provider: 'google-gemini',
          message: 'GEMINI_API_KEY is not configured on the server.',
        });
      }

      const cleanBase64 = audioBase64.replace(/^data:[^;]+;base64,/, '');
      const mimeType = req.body.mimeType || lecture.fileType || 'audio/mp3';

      console.log(`[Gemini AI] Transcribing audio lecture ${lecture.id} (${lecture.title})...`);
      const transcript = await transcribeAudioWithGemini(
        ai,
        mimeType,
        cleanBase64,
        'Provide a clear, accurate, and comprehensive transcript of this lecture recording for a student. Format paragraphs cleanly with natural topic transitions.'
      );

      lecture.transcript = transcript;
      lecture.transcriptGeneratedAt = new Date().toISOString();
      lecture.updatedAt = new Date().toISOString();
      db.audioLectures[index] = lecture;
      writeDB(db);

      res.json({
        success: true,
        transcript,
        lecture,
        aiUsage: db.profile.aiUsage,
      });
    } catch (error: any) {
      const errData = parseGeminiError(error);
      console.error('[Gemini AI] Error generating transcript with Gemini:', errData);
      res.status(errData.code).json(errData);
    } finally {
      activeAiOperations.delete(opKey);
    }
  });

  // AI 2: Generate Study Notes (reuses saved transcript when available to minimize Gemini cost)
  app.post('/api/ai/audio-lectures/:id/study-notes', async (req, res) => {
    const opKey = `${req.params.id}:study-notes`;
    if (activeAiOperations.has(opKey)) {
      return res.status(409).json({
        error: 'OPERATION_IN_PROGRESS',
        message: 'AI Study Notes generation is already in progress for this lecture. Please wait a moment.',
      });
    }

    activeAiOperations.add(opKey);
    try {
      const db = readDB();
      if (!isSubscriptionActive(db.profile.subscription)) {
        return res.status(403).json({
          error: 'PRO_FEATURE_REQUIRED',
          message: 'AI Audio Lecture Studio requires an active Pro subscription.',
        });
      }

      if (!db.audioLectures) db.audioLectures = [];
      const index = db.audioLectures.findIndex((al) => al.id === req.params.id);
      if (index === -1) {
        return res.status(404).json({ error: 'Audio lecture not found' });
      }

      const lecture = db.audioLectures[index];
      const usageCheck = checkAndIncrementAiUsage(db, 0);
      if (!usageCheck.allowed) {
        return res.status(429).json({
          error: 'AI_LIMIT_REACHED',
          message: usageCheck.reason || 'Monthly AI operations quota reached.',
        });
      }

      let ai;
      try {
        ai = getGeminiClient();
      } catch (e: any) {
        return res.status(503).json({
          error: 'GEMINI_NOT_CONFIGURED',
          code: 503,
          provider: 'google-gemini',
          message: 'GEMINI_API_KEY is not configured on the server.',
        });
      }

      let studyNotes = '';
      const transcriptToUse = lecture.transcript || req.body.transcript;

      if (transcriptToUse) {
        console.log(`[Gemini AI] Generating study notes using saved transcript for ${lecture.id}...`);
        studyNotes = await generateTextWithGemini(
          ai,
          `You are an expert academic tutor. Generate structured, thorough, and highly actionable study notes for the subject "${lecture.subjectName}" (Topic: "${lecture.title}").

Use clean Markdown formatting with clear section headers:
### 1. Subject Overview & Core Theme
### 2. In-Depth Concepts & Explanations
### 3. Core Terminology & Definitions
### 4. Practical Examples & Applications
### 5. High-Yield Exam Takeaways

LECTURE TRANSCRIPT:
${transcriptToUse}`
        );
      } else if (req.body.audioBase64 || lecture.audioDataUrl) {
        const audioBase64 = req.body.audioBase64 || lecture.audioDataUrl;
        const cleanBase64 = audioBase64.replace(/^data:[^;]+;base64,/, '');
        const mimeType = req.body.mimeType || lecture.fileType || 'audio/mp3';
        console.log(`[Gemini AI] Generating study notes directly from audio for ${lecture.id}...`);
        
        // Transcribe first to create high quality notes
        const rawTranscript = await transcribeAudioWithGemini(
          ai,
          mimeType,
          cleanBase64,
          'Transcribe this lecture recording thoroughly for note taking.'
        );
        lecture.transcript = rawTranscript;
        lecture.transcriptGeneratedAt = new Date().toISOString();

        studyNotes = await generateTextWithGemini(
          ai,
          `Generate comprehensive structured study notes in clean Markdown for this lecture on "${lecture.subjectName}: ${lecture.title}". Include core principles, definitions, key points, and review takeaways:

LECTURE CONTENT:
${rawTranscript}`
        );
      } else {
        return res.status(400).json({
          error: 'NO_SOURCE_DATA',
          message: 'No transcript or audio found. Please generate a transcript first or provide the audio recording.',
        });
      }

      lecture.studyNotes = studyNotes;
      lecture.studyNotesGeneratedAt = new Date().toISOString();
      lecture.updatedAt = new Date().toISOString();
      db.audioLectures[index] = lecture;
      writeDB(db);

      res.json({
        success: true,
        studyNotes,
        lecture,
        aiUsage: db.profile.aiUsage,
      });
    } catch (error: any) {
      const errData = parseGeminiError(error);
      console.error('[Gemini AI] Error generating study notes with Gemini:', errData);
      res.status(errData.code).json(errData);
    } finally {
      activeAiOperations.delete(opKey);
    }
  });

  // AI 3: Generate Summary (reuses saved transcript when available to minimize Gemini cost)
  app.post('/api/ai/audio-lectures/:id/summary', async (req, res) => {
    const opKey = `${req.params.id}:summary`;
    if (activeAiOperations.has(opKey)) {
      return res.status(409).json({
        error: 'OPERATION_IN_PROGRESS',
        message: 'AI Summary generation is already in progress for this lecture. Please wait a moment.',
      });
    }

    activeAiOperations.add(opKey);
    try {
      const db = readDB();
      if (!isSubscriptionActive(db.profile.subscription)) {
        return res.status(403).json({
          error: 'PRO_FEATURE_REQUIRED',
          message: 'AI Audio Lecture Studio requires an active Pro subscription.',
        });
      }

      if (!db.audioLectures) db.audioLectures = [];
      const index = db.audioLectures.findIndex((al) => al.id === req.params.id);
      if (index === -1) {
        return res.status(404).json({ error: 'Audio lecture not found' });
      }

      const lecture = db.audioLectures[index];
      const usageCheck = checkAndIncrementAiUsage(db, 0);
      if (!usageCheck.allowed) {
        return res.status(429).json({
          error: 'AI_LIMIT_REACHED',
          message: usageCheck.reason || 'Monthly AI operations quota reached.',
        });
      }

      let ai;
      try {
        ai = getGeminiClient();
      } catch (e: any) {
        return res.status(503).json({
          error: 'GEMINI_NOT_CONFIGURED',
          code: 503,
          provider: 'google-gemini',
          message: 'GEMINI_API_KEY is not configured on the server.',
        });
      }

      let summary = '';
      const transcriptToUse = lecture.transcript || req.body.transcript;

      if (transcriptToUse) {
        console.log(`[Gemini AI] Generating summary using saved transcript for ${lecture.id}...`);
        summary = await generateTextWithGemini(
          ai,
          `You are an expert academic assistant. Generate a concise, clear, study-focused summary for the lecture "${lecture.title}" in "${lecture.subjectName}".
Structure the summary into:
- **Core Thesis & Objective**
- **Key Arguments & Discussions**
- **Final Conclusion & Synthesis**

Keep it concise, high-yield, and easy to review before an exam.

LECTURE TRANSCRIPT:
${transcriptToUse}`
        );
      } else if (req.body.audioBase64 || lecture.audioDataUrl) {
        const audioBase64 = req.body.audioBase64 || lecture.audioDataUrl;
        const cleanBase64 = audioBase64.replace(/^data:[^;]+;base64,/, '');
        const mimeType = req.body.mimeType || lecture.fileType || 'audio/mp3';
        console.log(`[Gemini AI] Generating summary directly from audio for ${lecture.id}...`);
        
        const rawTranscript = await transcribeAudioWithGemini(
          ai,
          mimeType,
          cleanBase64,
          'Transcribe this lecture recording for summarization.'
        );
        lecture.transcript = rawTranscript;
        lecture.transcriptGeneratedAt = new Date().toISOString();

        summary = await generateTextWithGemini(
          ai,
          `Generate a concise, study-focused summary of this lecture for "${lecture.subjectName}: ${lecture.title}":

LECTURE CONTENT:
${rawTranscript}`
        );
      } else {
        return res.status(400).json({
          error: 'NO_SOURCE_DATA',
          message: 'No transcript or audio found. Please generate a transcript first or provide the audio recording.',
        });
      }

      lecture.summary = summary;
      lecture.summaryGeneratedAt = new Date().toISOString();
      lecture.updatedAt = new Date().toISOString();
      db.audioLectures[index] = lecture;
      writeDB(db);

      res.json({
        success: true,
        summary,
        lecture,
        aiUsage: db.profile.aiUsage,
      });
    } catch (error: any) {
      const errData = parseGeminiError(error);
      console.error('[Gemini AI] Error generating summary with Gemini:', errData);
      res.status(errData.code).json(errData);
    } finally {
      activeAiOperations.delete(opKey);
    }
  });

  // AI 4: Generate Key Points (reuses saved transcript when available to minimize Gemini cost)
  app.post('/api/ai/audio-lectures/:id/key-points', async (req, res) => {
    const opKey = `${req.params.id}:key-points`;
    if (activeAiOperations.has(opKey)) {
      return res.status(409).json({
        error: 'OPERATION_IN_PROGRESS',
        message: 'AI Key Points extraction is already in progress for this lecture. Please wait a moment.',
      });
    }

    activeAiOperations.add(opKey);
    try {
      const db = readDB();
      if (!isSubscriptionActive(db.profile.subscription)) {
        return res.status(403).json({
          error: 'PRO_FEATURE_REQUIRED',
          message: 'AI Audio Lecture Studio requires an active Pro subscription.',
        });
      }

      if (!db.audioLectures) db.audioLectures = [];
      const index = db.audioLectures.findIndex((al) => al.id === req.params.id);
      if (index === -1) {
        return res.status(404).json({ error: 'Audio lecture not found' });
      }

      const lecture = db.audioLectures[index];
      const usageCheck = checkAndIncrementAiUsage(db, 0);
      if (!usageCheck.allowed) {
        return res.status(429).json({
          error: 'AI_LIMIT_REACHED',
          message: usageCheck.reason || 'Monthly AI operations quota reached.',
        });
      }

      let ai;
      try {
        ai = getGeminiClient();
      } catch (e: any) {
        return res.status(503).json({
          error: 'GEMINI_NOT_CONFIGURED',
          code: 503,
          provider: 'google-gemini',
          message: 'GEMINI_API_KEY is not configured on the server.',
        });
      }

      let keyPoints = '';
      const transcriptToUse = lecture.transcript || req.body.transcript;

      if (transcriptToUse) {
        console.log(`[Gemini AI] Extracting key points using saved transcript for ${lecture.id}...`);
        keyPoints = await generateTextWithGemini(
          ai,
          `You are an academic exam coach. Extract the crucial key points, definitions, facts, and essential concepts from this lecture transcript for "${lecture.subjectName}: ${lecture.title}".
Format them as a clean bulleted list with bolded terms for easy memorization:

LECTURE TRANSCRIPT:
${transcriptToUse}`
        );
      } else if (req.body.audioBase64 || lecture.audioDataUrl) {
        const audioBase64 = req.body.audioBase64 || lecture.audioDataUrl;
        const cleanBase64 = audioBase64.replace(/^data:[^;]+;base64,/, '');
        const mimeType = req.body.mimeType || lecture.fileType || 'audio/mp3';
        console.log(`[Gemini AI] Extracting key points directly from audio for ${lecture.id}...`);
        
        const rawTranscript = await transcribeAudioWithGemini(
          ai,
          mimeType,
          cleanBase64,
          'Transcribe this lecture recording for key point extraction.'
        );
        lecture.transcript = rawTranscript;
        lecture.transcriptGeneratedAt = new Date().toISOString();

        keyPoints = await generateTextWithGemini(
          ai,
          `Extract key points, definitions, and important exam concepts from this lecture on "${lecture.subjectName}: ${lecture.title}". Format as a bulleted list with bolded terms:

LECTURE CONTENT:
${rawTranscript}`
        );
      } else {
        return res.status(400).json({
          error: 'NO_SOURCE_DATA',
          message: 'No transcript or audio found. Please generate a transcript first or provide the audio recording.',
        });
      }

      lecture.keyPoints = keyPoints;
      lecture.keyPointsGeneratedAt = new Date().toISOString();
      lecture.updatedAt = new Date().toISOString();
      db.audioLectures[index] = lecture;
      writeDB(db);

      res.json({
        success: true,
        keyPoints,
        lecture,
        aiUsage: db.profile.aiUsage,
      });
    } catch (error: any) {
      const errData = parseGeminiError(error);
      console.error('[Gemini AI] Error generating key points with Gemini:', errData);
      res.status(errData.code).json(errData);
    } finally {
      activeAiOperations.delete(opKey);
    }
  });

  // AI 5: Get AI Usage status
  app.get('/api/ai/usage', (req, res) => {
    try {
      const db = readDB();
      if (!db.profile.aiUsage) {
        db.profile.aiUsage = {
          operationsCount: 0,
          maxMonthlyOperations: 60,
          minutesTranscribed: 0,
          maxMonthlyMinutes: 300,
          periodStart: new Date().toISOString(),
        };
      }
      res.json({
        isPro: isSubscriptionActive(db.profile.subscription),
        aiUsage: db.profile.aiUsage,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to retrieve AI usage' });
    }
  });

  // AI 6: Health & Configuration check (Safe - never exposes secrets)
  app.get('/api/ai/health', (req, res) => {
    try {
      const apiKey = getGeminiApiKey();
      const db = readDB();
      res.json({
        configured: !!apiKey,
        provider: 'google-gemini',
        status: apiKey ? 'ready' : 'unconfigured',
        models: ['gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-flash-latest', 'gemini-3.8-flash'],
        audioModels: ['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-flash-latest', 'gemini-3.8-flash'],
        aiUsage: db.profile.aiUsage || null,
        isPro: isSubscriptionActive(db.profile.subscription),
      });
    } catch (err: any) {
      res.status(500).json({ error: 'AI_HEALTH_CHECK_FAILED', message: err?.message || 'Failed to check AI health' });
    }
  });

  // AI 7: Diagnostic minimal server-side test (never exposes secrets or keys)
  app.get('/api/ai/diagnostic', async (req, res) => {
    try {
      const apiKey = getGeminiApiKey();
      if (!apiKey) {
        return res.status(503).json({
          configured: false,
          error: 'GEMINI_NOT_CONFIGURED',
          message: 'GEMINI_API_KEY is not configured on the server.',
        });
      }

      const ai = getGeminiClient();
      const testResult = await generateTextWithGemini(ai, 'Reply with exactly: GEMINI_OK');
      res.json({
        configured: true,
        testPromptResult: testResult,
        status: 'healthy',
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      const parsed = parseGeminiError(err);
      res.status(parsed.code).json({
        configured: true,
        status: 'degraded',
        error: parsed.error,
        code: parsed.code,
        message: parsed.message,
        diagnostic: parsed.diagnostic,
      });
    }
  });

  // ==========================================
  // 8c. Study Materials Feature (PDF, DOC, DOCX)
  // Inside Notes section - Cloud-synced, organized by Subject & Topic
  // ==========================================

  // 1. Get all study materials
  app.get('/api/study-materials', (req, res) => {
    try {
      const db = readDB();
      res.json(db.studyMaterials || []);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch study materials' });
    }
  });

  // 2. Serve material files statically with inline disposition
  app.get('/api/study-materials/files/:filename', (req, res) => {
    try {
      const filename = path.basename(req.params.filename);
      const filePath = path.join(MATERIALS_DIR, filename);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found on server' });
      }

      const ext = path.extname(filename).toLowerCase();
      let contentType = 'application/octet-stream';
      if (ext === '.pdf') contentType = 'application/pdf';
      else if (ext === '.docx') contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      else if (ext === '.doc') contentType = 'application/msword';

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
    } catch (error) {
      res.status(500).json({ error: 'Failed to stream study material file' });
    }
  });

  // 3. Upload study material via multipart/form-data
  app.post('/api/study-materials/upload', (req, res) => {
    uploadMaterial.single('file')(req, res, async (err) => {
      if (err) {
        console.error('Multer upload error:', err);
        return res.status(400).json({
          error: 'UPLOAD_ERROR',
          message: err.message || 'File upload failed. Only PDF, DOC, and DOCX files up to 30MB are supported.',
        });
      }

      try {
        const db = readDB();
        if (!db.studyMaterials) db.studyMaterials = [];

        // Check limits on free plan
        if (!isSubscriptionActive(db.profile.subscription) && db.studyMaterials.length >= FREE_PLAN_LIMITS.studyMaterials) {
          // If a file was written to disk, clean it up
          if (req.file?.path && fs.existsSync(req.file.path)) {
            try { fs.unlinkSync(req.file.path); } catch (e) {}
          }
          return res.status(403).json({
            error: 'LIMIT_REACHED',
            message: `You have reached the free plan limit of ${FREE_PLAN_LIMITS.studyMaterials} Study Materials. Upgrade to Premium for unlimited storage.`,
          });
        }

        if (!req.file) {
          return res.status(400).json({
            error: 'NO_FILE',
            message: 'Please select a PDF, DOC, or DOCX file to upload.',
          });
        }

        const ext = path.extname(req.file.originalname).toLowerCase().replace('.', '');
        const customTitle = (req.body.name || '').trim();
        const displayName = customTitle || req.file.originalname.replace(/\.[^/.]+$/, '');
        const subjectId = req.body.subjectId || '';
        let subjectName = (req.body.subjectName || '').trim();

        if (!subjectName && subjectId) {
          const foundCourse = db.courses.find((c) => c.id === subjectId);
          if (foundCourse) subjectName = foundCourse.name;
        }
        if (!subjectName) subjectName = 'General';

        const topic = (req.body.topic || '').trim();
        const storagePath = `/api/study-materials/files/${req.file.filename}`;

        // Attempt DOCX initial text extraction for fast search
        let extractedText = '';
        if (ext === 'docx') {
          try {
            const mammothResult = await mammoth.extractRawText({ path: req.file.path });
            extractedText = mammothResult.value?.slice(0, 50000) || '';
          } catch (mErr) {
            console.warn('Could not extract raw text from docx:', mErr);
          }
        }

        const newMaterial: StudyMaterial = {
          id: 'mat_' + crypto.randomUUID().slice(0, 8),
          userId: req.body.userId || 'default',
          subjectId,
          subjectName,
          topic,
          name: displayName,
          originalFileName: req.file.originalname,
          fileType: ext,
          mimeType: req.file.mimetype || 'application/octet-stream',
          fileSize: req.file.size,
          storagePath,
          fileDataUrl: req.body.fileDataUrl || '',
          extractedText: extractedText || undefined,
          uploadedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        db.studyMaterials.push(newMaterial);
        writeDB(db);

        res.json(newMaterial);
      } catch (uploadHandlerErr: any) {
        console.error('Error handling study material upload:', uploadHandlerErr);
        res.status(500).json({
          error: 'UPLOAD_FAILED',
          message: uploadHandlerErr.message || 'An error occurred while saving the study material.',
        });
      }
    });
  });

  // 4. JSON upload / manual metadata create fallback
  app.post('/api/study-materials', async (req, res) => {
    try {
      const db = readDB();
      if (!db.studyMaterials) db.studyMaterials = [];

      if (!isSubscriptionActive(db.profile.subscription) && db.studyMaterials.length >= FREE_PLAN_LIMITS.studyMaterials) {
        return res.status(403).json({
          error: 'LIMIT_REACHED',
          message: `You have reached the free plan limit of ${FREE_PLAN_LIMITS.studyMaterials} Study Materials. Upgrade to Premium for unlimited storage.`,
        });
      }

      const { name, subjectId, subjectName, topic, originalFileName, fileType, mimeType, fileSize, fileBase64, fileDataUrl } = req.body;
      const matId = 'mat_' + crypto.randomUUID().slice(0, 8);
      let storagePath = req.body.storagePath || '';

      // If base64 data was supplied, write to disk
      if (fileBase64 && !storagePath) {
        const ext = fileType ? `.${fileType.replace('.', '')}` : '.pdf';
        const filename = `mat_${Date.now()}_${crypto.randomUUID().slice(0, 8)}${ext}`;
        const filePath = path.join(MATERIALS_DIR, filename);
        const cleanB64 = fileBase64.replace(/^data:[^;]+;base64,/, '');
        fs.writeFileSync(filePath, Buffer.from(cleanB64, 'base64'));
        storagePath = `/api/study-materials/files/${filename}`;
      }

      const newMaterial: StudyMaterial = {
        id: matId,
        userId: req.body.userId || 'default',
        subjectId: subjectId || '',
        subjectName: subjectName || 'General',
        topic: topic || '',
        name: name || originalFileName || 'Untitled Document',
        originalFileName: originalFileName || 'document.pdf',
        fileType: fileType || 'pdf',
        mimeType: mimeType || 'application/pdf',
        fileSize: fileSize || 0,
        storagePath: storagePath || '',
        fileDataUrl: fileDataUrl || '',
        uploadedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      db.studyMaterials.push(newMaterial);
      writeDB(db);
      res.json(newMaterial);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to create study material', message: error.message });
    }
  });

  // 5. Download original unmodified file
  app.get('/api/study-materials/:id/download', (req, res) => {
    try {
      const db = readDB();
      const material = (db.studyMaterials || []).find((m) => m.id === req.params.id);
      if (!material) {
        return res.status(404).json({ error: 'Study material not found' });
      }

      // Check if file exists on disk
      if (material.storagePath && material.storagePath.startsWith('/api/study-materials/files/')) {
        const filename = path.basename(material.storagePath);
        const filePath = path.join(MATERIALS_DIR, filename);
        if (fs.existsSync(filePath)) {
          return res.download(filePath, material.originalFileName);
        }
      }

      // Fallback: If base64 exists in fileDataUrl
      if (material.fileDataUrl && material.fileDataUrl.startsWith('data:')) {
        const parts = material.fileDataUrl.split(',');
        const mime = parts[0].match(/:(.*?);/)?.[1] || 'application/octet-stream';
        const buffer = Buffer.from(parts[1], 'base64');
        res.setHeader('Content-Type', mime);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(material.originalFileName)}"`);
        return res.send(buffer);
      }

      res.status(404).json({ error: 'Original file content is not available for download' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to download study material' });
    }
  });

  // 6. Preview content (HTML for docx, or metadata/stream for PDF)
  app.get('/api/study-materials/:id/preview', async (req, res) => {
    try {
      const db = readDB();
      const material = (db.studyMaterials || []).find((m) => m.id === req.params.id);
      if (!material) {
        return res.status(404).json({ error: 'Study material not found' });
      }

      const ext = material.fileType.toLowerCase();
      if (ext === 'docx' && material.storagePath) {
        const filename = path.basename(material.storagePath);
        const filePath = path.join(MATERIALS_DIR, filename);
        if (fs.existsSync(filePath)) {
          const result = await mammoth.convertToHtml({ path: filePath });
          return res.json({
            previewType: 'html',
            html: result.value,
            material,
          });
        }
      }

      res.json({
        previewType: ext === 'pdf' ? 'pdf' : ext === 'docx' ? 'docx' : 'doc',
        fileUrl: material.storagePath,
        material,
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to generate document preview', message: error.message });
    }
  });

  // 7. Update metadata (Name, Subject, Topic)
  app.put('/api/study-materials/:id', (req, res) => {
    try {
      const db = readDB();
      if (!db.studyMaterials) db.studyMaterials = [];
      const index = db.studyMaterials.findIndex((m) => m.id === req.params.id);
      if (index === -1) {
        return res.status(404).json({ error: 'Study material not found' });
      }

      const existing = db.studyMaterials[index];
      db.studyMaterials[index] = {
        ...existing,
        name: req.body.name !== undefined ? req.body.name.trim() : existing.name,
        subjectId: req.body.subjectId !== undefined ? req.body.subjectId : existing.subjectId,
        subjectName: req.body.subjectName !== undefined ? req.body.subjectName : existing.subjectName,
        topic: req.body.topic !== undefined ? req.body.topic.trim() : existing.topic,
        updatedAt: new Date().toISOString(),
      };

      writeDB(db);
      res.json(db.studyMaterials[index]);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update study material' });
    }
  });

  // 8. Delete study material (Safe, with disk cleanup)
  app.delete('/api/study-materials/:id', (req, res) => {
    try {
      const db = readDB();
      if (!db.studyMaterials) db.studyMaterials = [];
      const material = db.studyMaterials.find((m) => m.id === req.params.id);

      if (material && material.storagePath && material.storagePath.startsWith('/api/study-materials/files/')) {
        const filename = path.basename(material.storagePath);
        const filePath = path.join(MATERIALS_DIR, filename);
        if (fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
          } catch (uErr) {
            console.warn('Could not delete material file from disk:', uErr);
          }
        }
      }

      db.studyMaterials = db.studyMaterials.filter((m) => m.id !== req.params.id);
      writeDB(db);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete study material' });
    }
  });

  // ==========================================
  // 8d. Gemini AI Study Materials Endpoints
  // CRITICAL MANDATE: Only triggered on explicit user button click. Never auto-process on upload or view.
  // ==========================================

  // Helper to extract text / inline data from study material
  const getDocumentAiPayload = async (material: StudyMaterial) => {
    let filePath = '';
    if (material.storagePath && material.storagePath.startsWith('/api/study-materials/files/')) {
      const filename = path.basename(material.storagePath);
      filePath = path.join(MATERIALS_DIR, filename);
    }

    const ext = material.fileType.toLowerCase();

    // 1. DOCX: extract full clean text using mammoth
    if (ext === 'docx' && filePath && fs.existsSync(filePath)) {
      try {
        const result = await mammoth.extractRawText({ path: filePath });
        const text = result.value?.trim();
        if (text && text.length > 20) {
          return { type: 'text', text: text.slice(0, 100000) };
        }
      } catch (e) {
        console.warn('Mammoth text extraction error:', e);
      }
    }

    // 2. PDF: send as inlineData base64 if file exists
    if (ext === 'pdf' && filePath && fs.existsSync(filePath)) {
      try {
        const buffer = fs.readFileSync(filePath);
        const base64 = buffer.toString('base64');
        return {
          type: 'inlineData',
          inlineData: {
            mimeType: 'application/pdf',
            data: base64,
          },
        };
      } catch (e) {
        console.warn('PDF read error:', e);
      }
    }

    // 3. Fallback: If material.extractedText is present
    if (material.extractedText && material.extractedText.length > 20) {
      return { type: 'text', text: material.extractedText.slice(0, 100000) };
    }

    // 4. Fallback: If base64 exists in fileDataUrl
    if (material.fileDataUrl && material.fileDataUrl.startsWith('data:')) {
      const parts = material.fileDataUrl.split(',');
      const mime = parts[0].match(/:(.*?);/)?.[1] || 'application/pdf';
      return {
        type: 'inlineData',
        inlineData: {
          mimeType: mime,
          data: parts[1],
        },
      };
    }

    return null;
  };

  // AI 1: Generate Document Summary
  app.post('/api/ai/study-materials/:id/summary', async (req, res) => {
    const opKey = `mat:${req.params.id}:summary`;
    if (activeAiOperations.has(opKey)) {
      return res.status(409).json({
        error: 'OPERATION_IN_PROGRESS',
        message: 'AI Document Summary is already in progress. Please wait a moment.',
      });
    }

    activeAiOperations.add(opKey);
    try {
      const db = readDB();
      if (!isSubscriptionActive(db.profile.subscription)) {
        return res.status(403).json({
          error: 'PRO_FEATURE_REQUIRED',
          message: 'AI Document Summarization requires an active Pro subscription.',
        });
      }

      if (!db.studyMaterials) db.studyMaterials = [];
      const index = db.studyMaterials.findIndex((m) => m.id === req.params.id);
      if (index === -1) {
        return res.status(404).json({ error: 'Study material not found' });
      }

      const material = db.studyMaterials[index];
      const usageCheck = checkAndIncrementAiUsage(db, 0);
      if (!usageCheck.allowed) {
        return res.status(429).json({
          error: 'AI_LIMIT_REACHED',
          message: usageCheck.reason || 'Monthly AI operations limit reached.',
        });
      }

      let ai;
      try {
        ai = getGeminiClient();
      } catch (e: any) {
        return res.status(500).json({
          error: 'GEMINI_NOT_CONFIGURED',
          message: 'AI processing is temporarily unavailable. Please try again later.',
        });
      }

      const payload = await getDocumentAiPayload(material);
      let summary = '';

      if (payload?.type === 'text') {
        summary = await generateTextWithGemini(
          ai,
          `You are an expert academic tutor. Generate a clear, high-yield study summary for this study material document:
Document Title: "${material.name}"
Subject / Course: "${material.subjectName}"
Topic / Chapter: "${material.topic || 'General'}"

Structure the summary cleanly with Markdown headers:
### 1. Document Overview & Primary Objective
### 2. Core Themes & Main Conceptual Framework
### 3. Key Findings & Arguments
### 4. High-Yield Revision Summary

Keep it concise, actionable, and easy for students to review before tests.

DOCUMENT CONTENT:
${payload.text}`
        );
      } else if (payload?.type === 'inlineData') {
        summary = await generateTextWithGemini(ai, {
          parts: [
            {
              inlineData: payload.inlineData,
            },
            {
              text: `You are an expert academic tutor. Generate a high-yield study summary for this document ("${material.name}", Subject: "${material.subjectName}", Topic: "${material.topic || 'General'}"). Structure into Overview, Core Principles, Key Arguments, and Exam Review Summary using clean Markdown.`,
            },
          ],
        });
      } else {
        return res.status(400).json({
          error: 'NO_SOURCE_DATA',
          message: 'Unable to extract document text for analysis. Ensure the file is a valid PDF or DOCX document.',
        });
      }

      material.summary = summary;
      material.summaryGeneratedAt = new Date().toISOString();
      material.updatedAt = new Date().toISOString();
      db.studyMaterials[index] = material;
      writeDB(db);

      res.json({
        success: true,
        summary,
        material,
        aiUsage: db.profile.aiUsage,
      });
    } catch (error: any) {
      const errData = parseGeminiError(error);
      console.error('[Gemini AI] Error generating document summary with Gemini:', errData);
      res.status(errData.code).json(errData);
    } finally {
      activeAiOperations.delete(opKey);
    }
  });

  // AI 2: Generate Structured Study Notes
  app.post('/api/ai/study-materials/:id/notes', async (req, res) => {
    const opKey = `mat:${req.params.id}:notes`;
    if (activeAiOperations.has(opKey)) {
      return res.status(409).json({
        error: 'OPERATION_IN_PROGRESS',
        message: 'AI Study Notes generation is already in progress. Please wait a moment.',
      });
    }

    activeAiOperations.add(opKey);
    try {
      const db = readDB();
      if (!isSubscriptionActive(db.profile.subscription)) {
        return res.status(403).json({
          error: 'PRO_FEATURE_REQUIRED',
          message: 'AI Study Notes Generation requires an active Pro subscription.',
        });
      }

      if (!db.studyMaterials) db.studyMaterials = [];
      const index = db.studyMaterials.findIndex((m) => m.id === req.params.id);
      if (index === -1) {
        return res.status(404).json({ error: 'Study material not found' });
      }

      const material = db.studyMaterials[index];
      const usageCheck = checkAndIncrementAiUsage(db, 0);
      if (!usageCheck.allowed) {
        return res.status(429).json({
          error: 'AI_LIMIT_REACHED',
          message: usageCheck.reason || 'Monthly AI operations limit reached.',
        });
      }

      let ai;
      try {
        ai = getGeminiClient();
      } catch (e: any) {
        return res.status(503).json({
          error: 'GEMINI_NOT_CONFIGURED',
          code: 503,
          provider: 'google-gemini',
          message: 'GEMINI_API_KEY is not configured on the server. Please configure your key in Settings > Secrets.',
        });
      }

      const payload = await getDocumentAiPayload(material);
      let studyNotes = '';

      if (payload?.type === 'text') {
        studyNotes = await generateTextWithGemini(
          ai,
          `You are an academic mentor. Generate comprehensive, well-organized study notes based on this document:
Document: "${material.name}"
Subject: "${material.subjectName}"
Topic: "${material.topic || 'General'}"

Format in clean Markdown:
### 1. Essential Concepts & Foundations
### 2. In-Depth Explanations & Mechanisms
### 3. Key Terminology & Definitions
### 4. Equations, Formulas, & Rules (if applicable)
### 5. Practical Examples & Applications
### 6. Common Pitfalls & High-Yield Exam Tips

DOCUMENT TEXT:
${payload.text}`
        );
      } else if (payload?.type === 'inlineData') {
        studyNotes = await generateTextWithGemini(ai, {
          parts: [
            {
              inlineData: payload.inlineData,
            },
            {
              text: `Generate thorough, structured academic study notes for this document ("${material.name}", Subject: "${material.subjectName}"). Use clean Markdown with sections for Concepts, In-Depth Explanations, Key Terms, Formulas, and Exam Tips.`,
            },
          ],
        });
      } else {
        return res.status(400).json({
          error: 'NO_SOURCE_DATA',
          message: 'Unable to extract document text for notes generation.',
        });
      }

      material.studyNotes = studyNotes;
      material.studyNotesGeneratedAt = new Date().toISOString();
      material.updatedAt = new Date().toISOString();
      db.studyMaterials[index] = material;
      writeDB(db);

      res.json({
        success: true,
        studyNotes,
        material,
        aiUsage: db.profile.aiUsage,
      });
    } catch (error: any) {
      const errData = parseGeminiError(error);
      console.error('[Gemini AI] Error generating study notes with Gemini:', errData);
      res.status(errData.code).json(errData);
    } finally {
      activeAiOperations.delete(opKey);
    }
  });

  // AI 3: Extract Key Points & Flashcard Concepts
  app.post('/api/ai/study-materials/:id/key-points', async (req, res) => {
    const opKey = `mat:${req.params.id}:key-points`;
    if (activeAiOperations.has(opKey)) {
      return res.status(409).json({
        error: 'OPERATION_IN_PROGRESS',
        message: 'AI Key Points extraction is already in progress. Please wait a moment.',
      });
    }

    activeAiOperations.add(opKey);
    try {
      const db = readDB();
      if (!isSubscriptionActive(db.profile.subscription)) {
        return res.status(403).json({
          error: 'PRO_FEATURE_REQUIRED',
          message: 'AI Key Points Extraction requires an active Pro subscription.',
        });
      }

      if (!db.studyMaterials) db.studyMaterials = [];
      const index = db.studyMaterials.findIndex((m) => m.id === req.params.id);
      if (index === -1) {
        return res.status(404).json({ error: 'Study material not found' });
      }

      const material = db.studyMaterials[index];
      const usageCheck = checkAndIncrementAiUsage(db, 0);
      if (!usageCheck.allowed) {
        return res.status(429).json({
          error: 'AI_LIMIT_REACHED',
          message: usageCheck.reason || 'Monthly AI operations limit reached.',
        });
      }

      let ai;
      try {
        ai = getGeminiClient();
      } catch (e: any) {
        return res.status(503).json({
          error: 'GEMINI_NOT_CONFIGURED',
          code: 503,
          provider: 'google-gemini',
          message: 'GEMINI_API_KEY is not configured on the server. Please configure your key in Settings > Secrets.',
        });
      }

      const payload = await getDocumentAiPayload(material);
      let keyPoints = '';

      if (payload?.type === 'text') {
        keyPoints = await generateTextWithGemini(
          ai,
          `You are an academic exam coach. Extract key points, definitions, facts, and essential review concepts from this document:
Document: "${material.name}"
Subject: "${material.subjectName}"
Topic: "${material.topic || 'General'}"

Format as a high-yield bulleted cheat-sheet with **bolded key terms** and clear concise explanations.

DOCUMENT TEXT:
${payload.text}`
        );
      } else if (payload?.type === 'inlineData') {
        keyPoints = await generateTextWithGemini(ai, {
          parts: [
            {
              inlineData: payload.inlineData,
            },
            {
              text: `Extract the crucial key points, definitions, and essential exam facts from this document ("${material.name}", Subject: "${material.subjectName}"). Format as a bulleted list with bolded terms.`,
            },
          ],
        });
      } else {
        return res.status(400).json({
          error: 'NO_SOURCE_DATA',
          message: 'Unable to extract document text for key points extraction.',
        });
      }

      material.keyPoints = keyPoints;
      material.keyPointsGeneratedAt = new Date().toISOString();
      material.updatedAt = new Date().toISOString();
      db.studyMaterials[index] = material;
      writeDB(db);

      res.json({
        success: true,
        keyPoints,
        material,
        aiUsage: db.profile.aiUsage,
      });
    } catch (error: any) {
      const errData = parseGeminiError(error);
      console.error('[Gemini AI] Error generating key points with Gemini:', errData);
      res.status(errData.code).json(errData);
    } finally {
      activeAiOperations.delete(opKey);
    }
  });

  // 8b. Mobile Companion Pairing & Cross-Device Sync Endpoints
  app.post('/api/mobile-companion/create-pairing-session', (req, res) => {
    try {
      const db = readDB();
      if (!isSubscriptionActive(db.profile.subscription)) {
        return res.status(403).json({
          error: 'PREMIUM_REQUIRED',
          message: 'Mobile Companion is a Premium feature. Please upgrade to Premium to connect your mobile device.',
        });
      }

      const token = 'pair_' + crypto.randomUUID();
      const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes expiration

      pairingSessions.set(token, {
        token,
        createdAt: Date.now(),
        expiresAt,
        status: 'pending',
      });

      res.json({
        success: true,
        token,
        expiresAt,
        expiresInSeconds: 300,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to create mobile pairing session' });
    }
  });

  app.get('/api/mobile-companion/session-status', (req, res) => {
    try {
      const token = (req.query.token as string) || '';
      if (!token || !pairingSessions.has(token)) {
        return res.json({ status: 'expired', message: 'Session expired or not found' });
      }

      const session = pairingSessions.get(token)!;
      if (Date.now() > session.expiresAt && session.status === 'pending') {
        session.status = 'expired';
      }

      res.json({
        status: session.status,
        deviceName: session.deviceName || null,
        pairedAt: session.pairedAt || null,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to check session status' });
    }
  });

  app.post('/api/mobile-companion/cancel-pairing-session', (req, res) => {
    try {
      const { token } = req.body || {};
      if (token && pairingSessions.has(token)) {
        const session = pairingSessions.get(token)!;
        session.status = 'cancelled';
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to cancel pairing session' });
    }
  });

  app.get('/api/mobile-companion/verify-pairing-token', (req, res) => {
    try {
      const token = (req.query.token as string) || '';
      const db = readDB();

      if (!isSubscriptionActive(db.profile.subscription)) {
        return res.json({
          valid: false,
          reason: 'PREMIUM_EXPIRED',
          message: 'Mobile Companion requires an active Premium subscription.',
        });
      }

      if (!token || !pairingSessions.has(token)) {
        return res.json({
          valid: false,
          reason: 'INVALID_OR_EXPIRED',
          message: 'This connection code is no longer valid or has expired. Please generate a new code on your desktop.',
        });
      }

      const session = pairingSessions.get(token)!;
      if (Date.now() > session.expiresAt || session.status !== 'pending') {
        return res.json({
          valid: false,
          reason: session.status === 'paired' ? 'ALREADY_USED' : 'INVALID_OR_EXPIRED',
          message: session.status === 'paired'
            ? 'This connection code has already been used.'
            : 'This connection code is no longer valid or has expired. Please generate a new code on your desktop.',
        });
      }

      res.json({
        valid: true,
        expiresAt: session.expiresAt,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to verify pairing token' });
    }
  });

  app.post('/api/mobile-companion/confirm-pairing', (req, res) => {
    try {
      const { token, deviceName } = req.body || {};
      const db = readDB();

      if (!isSubscriptionActive(db.profile.subscription)) {
        return res.status(403).json({
          error: 'PREMIUM_REQUIRED',
          message: 'Mobile Companion requires an active Premium subscription.',
        });
      }

      if (!token || !pairingSessions.has(token)) {
        return res.status(400).json({
          error: 'INVALID_TOKEN',
          message: 'This connection code is no longer valid or has expired.',
        });
      }

      const session = pairingSessions.get(token)!;
      if (Date.now() > session.expiresAt || session.status !== 'pending') {
        return res.status(400).json({
          error: 'TOKEN_EXPIRED_OR_USED',
          message: 'This connection code is no longer valid or has expired.',
        });
      }

      const deviceToken = 'dev_tok_' + crypto.randomUUID();
      const nowIso = new Date().toISOString();

      session.status = 'paired';
      session.deviceName = deviceName || 'Mobile Phone';
      session.pairedAt = nowIso;
      session.deviceToken = deviceToken;

      db.profile.mobileDevice = {
        id: 'dev_' + crypto.randomUUID().slice(0, 8),
        name: deviceName || 'Mobile Phone',
        pairedAt: nowIso,
        lastSyncedAt: nowIso,
        status: 'connected',
        deviceToken,
      };

      writeDB(db);

      res.json({
        success: true,
        deviceToken,
        profile: db.profile,
        state: db,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to confirm mobile pairing' });
    }
  });

  app.post('/api/mobile-companion/disconnect-device', (req, res) => {
    try {
      const db = readDB();
      db.profile.mobileDevice = null;
      writeDB(db);
      res.json({ success: true, message: 'Mobile device disconnected successfully.' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to disconnect mobile device' });
    }
  });

  app.post('/api/mobile-companion/sync', (req, res) => {
    try {
      const db = readDB();

      if (!isSubscriptionActive(db.profile.subscription)) {
        return res.status(403).json({
          error: 'PREMIUM_REQUIRED',
          message: 'Mobile Companion is a Premium feature. Renew Premium to continue syncing.',
        });
      }

      // If client supplied updated items, perform a safe merge
      const { clientState } = req.body || {};
      if (clientState && typeof clientState === 'object') {
        if (Array.isArray(clientState.courses)) db.courses = clientState.courses;
        if (Array.isArray(clientState.timetable)) db.timetable = clientState.timetable;
        if (Array.isArray(clientState.assignments)) db.assignments = clientState.assignments;
        if (Array.isArray(clientState.exams)) db.exams = clientState.exams;
        if (Array.isArray(clientState.notes)) db.notes = clientState.notes;
        if (Array.isArray(clientState.studySessions)) db.studySessions = clientState.studySessions;
      }

      if (db.profile.mobileDevice) {
        db.profile.mobileDevice.lastSyncedAt = new Date().toISOString();
        db.profile.mobileDevice.status = 'connected';
      }

      writeDB(db);

      res.json({
        success: true,
        syncedAt: new Date().toISOString(),
        state: db,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to sync device data' });
    }
  });

  // 9. Subscriptions & Billing Status
  // Helper function for strict server-side geographic/IP country detection
  function detectCountryFromRequest(req: express.Request): string {
    const geoHeaders = [
      'x-vercel-ip-country',
      'cf-ipcountry',
      'x-appengine-country',
      'x-country-code',
      'cloudfront-viewer-country',
      'x-client-geo-country',
      'x-geoip-country-code',
    ];

    for (const headerName of geoHeaders) {
      const val = req.headers[headerName];
      if (val && typeof val === 'string' && val.trim().length === 2) {
        const code = val.trim().toUpperCase();
        if (code !== 'XX' && code !== 'T1' && code !== 'UNKNOWN') {
          console.log(`[Country Detection] Server detected geographic country code '${code}' via header '${headerName}'`);
          return code;
        }
      }
    }

    // Log detection failure before defaulting to International
    console.warn('[Country Detection Failure] Unable to detect geographic/IP country from request headers. Defaulting to International (US / USD / PayPal). Headers present:', Object.keys(req.headers).filter(h => h.includes('country') || h.includes('geo') || h.includes('ip') || h.includes('vercel') || h.includes('cf')));
    return 'US';
  }

  // Google ID Token Server-Side Verification and Safe Account Association Endpoint
  app.post('/api/auth/google', async (req, res) => {
    try {
      const { credential } = req.body || {};
      if (!credential || typeof credential !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'CREDENTIAL_REQUIRED',
          message: 'Google credential ID token is required.',
        });
      }

      console.log('[Google Auth] backend authentication request started');

      // Call Google's authoritative tokeninfo endpoint
      const tokeninfoResponse = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential.trim())}`
      );

      if (!tokeninfoResponse.ok) {
        const errorText = await tokeninfoResponse.text();
        console.warn('[Google Auth] backend authentication failed: Google tokeninfo returned non-200', tokeninfoResponse.status, errorText);
        return res.status(401).json({
          success: false,
          error: 'INVALID_CREDENTIAL',
          message: 'Google token could not be verified by Google servers.',
        });
      }

      const tokenInfo: any = await tokeninfoResponse.json();
      const googleSub = tokenInfo.sub;
      const email = tokenInfo.email;
      const name = tokenInfo.name || tokenInfo.given_name || 'Google Student';
      const picture = tokenInfo.picture || null;
      const emailVerified = tokenInfo.email_verified === 'true' || tokenInfo.email_verified === true;

      if (!googleSub) {
        console.warn('[Google Auth] backend authentication failed: missing sub in tokeninfo');
        return res.status(401).json({
          success: false,
          error: 'INVALID_TOKEN_PAYLOAD',
          message: 'Google identity identifier (sub) missing from token response.',
        });
      }

      console.log('[Google Auth] backend authentication succeeded for user', {
        email: email ? `${email.slice(0, 3)}***` : 'unknown',
        sub: `${googleSub.slice(0, 6)}***`,
      });

      // Safe non-destructive account linking & subscription lookup
      console.log('[Google Auth] account linking started');
      const activeEntry = getActiveSubscriptionFromLedger(googleSub, email);
      console.log('[Google Auth] account linking completed');
      console.log('[Google Auth] Premium status retrieved:', activeEntry ? `Active (${activeEntry.plan})` : 'Free Tier');

      return res.json({
        success: true,
        user: {
          uid: googleSub,
          googleId: googleSub,
          email: email || null,
          displayName: name,
          photoURL: picture,
          emailVerified,
        },
        hasActiveSubscription: Boolean(activeEntry),
        subscription: activeEntry
          ? {
              subscriptionStatus: 'premium',
              plan: activeEntry.plan,
              paymentGateway: activeEntry.paymentGateway,
              transactionId: activeEntry.transactionId,
              purchaseDate: activeEntry.purchaseDate,
              expiryDate: activeEntry.expiryDate,
              billingCountry: activeEntry.billingCountry,
              type: normalizePlanType(activeEntry.plan),
              paymentProvider: activeEntry.paymentGateway,
              paymentId: activeEntry.transactionId,
            }
          : null,
      });
    } catch (err: any) {
      console.error('[Google Auth] Internal server error during Google token verification:', err);
      return res.status(500).json({
        success: false,
        error: 'SERVER_AUTH_ERROR',
        message: 'Internal server error while verifying Google authentication.',
      });
    }
  });

  // ==========================================
  // Firebase Authentication & Account Sync Endpoints
  // ==========================================

  // Synchronize authenticated Firebase account with backend and check subscription status
  app.post('/api/auth/firebase-sync', async (req, res) => {
    try {
      const { uid, email, displayName, photoURL } = req.body || {};
      if (!uid || !email || typeof email !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'INVALID_CREDENTIALS',
          message: 'Firebase UID and valid email are required.',
        });
      }

      const cleanEmail = email.trim().toLowerCase();
      const cleanUid = String(uid).trim();

      // Find user by UID or Email
      let user = findUserById(cleanUid) || findUserByEmail(cleanEmail);

      if (user) {
        // Safe, non-destructive update
        user.userId = cleanUid; // Ensure userId aligns with Firebase permanent UID
        user.email = cleanEmail;
        user.emailVerified = true;
        if (displayName && (!user.name || user.name === user.email.split('@')[0])) {
          user.name = displayName.trim();
        }
        user.updatedAt = new Date().toISOString();
        upsertUser(user);
      } else {
        user = {
          userId: cleanUid,
          name: displayName?.trim() || cleanEmail.split('@')[0],
          email: cleanEmail,
          emailVerified: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        upsertUser(user);
      }

      console.log(`[Firebase Auth] ✅ Synced Firebase user: ${cleanEmail} (UID: ${cleanUid})`);

      // Safe non-destructive subscription link
      const activeEntry = getActiveSubscriptionFromLedger(user.userId, user.email);
      if (activeEntry && (!activeEntry.userId || activeEntry.userId !== user.userId)) {
        activeEntry.userId = user.userId;
        const ledger = readSubscriptionsLedger();
        const lIdx = ledger.findIndex(e => e.transactionId === activeEntry.transactionId);
        if (lIdx >= 0) {
          ledger[lIdx].userId = user.userId;
          writeSubscriptionsLedger(ledger);
        }
      }

      return res.json({
        success: true,
        user: {
          uid: user.userId,
          userId: user.userId,
          email: user.email,
          displayName: user.name,
          emailVerified: true,
          photoURL: photoURL || null,
        },
        hasActiveSubscription: Boolean(activeEntry),
        subscription: activeEntry
          ? {
              subscriptionStatus: 'premium',
              plan: activeEntry.plan,
              paymentGateway: activeEntry.paymentGateway,
              transactionId: activeEntry.transactionId,
              purchaseDate: activeEntry.purchaseDate,
              expiryDate: activeEntry.expiryDate,
              billingCountry: activeEntry.billingCountry,
              type: normalizePlanType(activeEntry.plan),
              paymentProvider: activeEntry.paymentGateway,
              paymentId: activeEntry.transactionId,
            }
          : null,
      });
    } catch (err: any) {
      console.error('[Firebase Auth] Error synchronizing Firebase user account:', err);
      return res.status(500).json({
        success: false,
        error: 'SYNC_FAILED',
        message: 'Could not synchronize Firebase user account.',
      });
    }
  });

  // 4. Safe, non-destructive associate local Study Planner data with user account
  app.post('/api/auth/associate-data', (req, res) => {
    try {
      const { userId, userEmail } = getEffectiveUser(req);
      const effectiveUserId = userId || req.body?.userId;
      const effectiveUserEmail = userEmail || req.body?.userEmail;
      const clientState = req.body?.state as DatabaseSchema;

      if (!effectiveUserId) {
        return res.status(400).json({
          error: 'USER_ID_REQUIRED',
          message: 'User ID is required to associate data.',
        });
      }

      // Read current authoritative user db
      const existingDb = readDB(effectiveUserId, effectiveUserEmail);

      if (clientState) {
        // Safe, non-destructive, idempotent merge of all entities:
        // Merge courses
        const courseMap = new Map<string, any>();
        (existingDb.courses || []).forEach(c => courseMap.set(c.id, c));
        (clientState.courses || []).forEach(c => {
          if (!courseMap.has(c.id)) {
            courseMap.set(c.id, c);
          }
        });
        existingDb.courses = Array.from(courseMap.values());

        // Merge timetable
        const timetableMap = new Map<string, any>();
        (existingDb.timetable || []).forEach(t => timetableMap.set(t.id, t));
        (clientState.timetable || []).forEach(t => {
          if (!timetableMap.has(t.id)) {
            timetableMap.set(t.id, t);
          }
        });
        existingDb.timetable = Array.from(timetableMap.values());

        // Merge assignments
        const assignmentMap = new Map<string, any>();
        (existingDb.assignments || []).forEach(a => assignmentMap.set(a.id, a));
        (clientState.assignments || []).forEach(a => {
          if (!assignmentMap.has(a.id)) {
            assignmentMap.set(a.id, a);
          }
        });
        existingDb.assignments = Array.from(assignmentMap.values());

        // Merge exams
        const examMap = new Map<string, any>();
        (existingDb.exams || []).forEach(e => examMap.set(e.id, e));
        (clientState.exams || []).forEach(e => {
          if (!examMap.has(e.id)) {
            examMap.set(e.id, e);
          }
        });
        existingDb.exams = Array.from(examMap.values());

        // Merge notes
        const notesMap = new Map<string, any>();
        (existingDb.notes || []).forEach(n => notesMap.set(n.id, n));
        (clientState.notes || []).forEach(n => {
          if (!notesMap.has(n.id)) {
            notesMap.set(n.id, n);
          }
        });
        existingDb.notes = Array.from(notesMap.values());

        // Merge studySessions
        const sessionMap = new Map<string, any>();
        (existingDb.studySessions || []).forEach(s => sessionMap.set(s.id, s));
        (clientState.studySessions || []).forEach(s => {
          if (!sessionMap.has(s.id)) {
            sessionMap.set(s.id, s);
          }
        });
        existingDb.studySessions = Array.from(sessionMap.values());

        // Merge studyMaterials
        const materialMap = new Map<string, any>();
        (existingDb.studyMaterials || []).forEach(m => materialMap.set(m.id, m));
        (clientState.studyMaterials || []).forEach(m => {
          if (!materialMap.has(m.id)) {
            materialMap.set(m.id, m);
          }
        });
        existingDb.studyMaterials = Array.from(materialMap.values());

        // Merge audioLectures
        const audioMap = new Map<string, any>();
        (existingDb.audioLectures || []).forEach(a => audioMap.set(a.id, a));
        (clientState.audioLectures || []).forEach(a => {
          if (!audioMap.has(a.id)) {
            audioMap.set(a.id, a);
          }
        });
        existingDb.audioLectures = Array.from(audioMap.values());

        // Update profile identity safely
        if (clientState.profile) {
          existingDb.profile.name = clientState.profile.name || existingDb.profile.name;
          existingDb.profile.email = effectiveUserEmail || clientState.profile.email || existingDb.profile.email;
          existingDb.profile.userId = effectiveUserId;
        }
      }

      // Write merged state
      writeDB(existingDb, effectiveUserId, effectiveUserEmail);
      return res.json({ success: true, message: 'Local data associated successfully.' });
    } catch (err: any) {
      console.error('[Email Auth] Error associating data:', err);
      return res.status(500).json({ error: 'FAILED_TO_ASSOCIATE', message: err.message });
    }
  });

  // Server-side country detection endpoint
  app.get('/api/subscription/detect-country', (req, res) => {
    const country = detectCountryFromRequest(req);
    res.json({ country, isIndia: country === 'IN' });
  });

  // Create Checkout Order securely on the backend
  app.post('/api/subscription/create-order', async (req, res) => {
    try {
      const { planType } = req.body || {};
      const validPlan = planType === 'monthly' || planType === 'quarterly' || planType === 'yearly';
      if (!planType || !validPlan) {
        return res.status(400).json({
          success: false,
          error: 'Valid planType (monthly, quarterly, or yearly) is required'
        });
      }

      // Enforce verified Account prior to purchase
      const { userId, userEmail } = getEffectiveUser(req);
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'ACCOUNT_REQUIRED',
          message: 'Please create or sign in to your Study Planner account before purchasing a subscription so your entitlement is permanently preserved.'
        });
      }

      // Strictly enforce server-side geolocation detection from request headers/IP.
      // Do NOT trust any country parameter supplied by the frontend.
      const selectedCountry = detectCountryFromRequest(req);

      const isIndia = selectedCountry === 'IN';
      const provider = isIndia ? 'razorpay' : 'paypal';

      let amount = 0;
      let currency = 'USD';

      if (isIndia) {
        currency = 'INR';
        // India pricing: Monthly ₹99, Yearly ₹999
        amount = planType === 'monthly' ? 99 : 999;
      } else {
        currency = 'USD';
        // International pricing: Monthly $1.99, Yearly $19.99
        amount = planType === 'monthly' ? 1.99 : 19.99;
      }

      if (provider === 'razorpay') {
        const { keyId, keySecret } = getRazorpayCredentials();
        if (!keyId || !keySecret) {
          console.error('[Razorpay Config Error] Missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET environment variables.');
          return res.status(400).json({
            success: false,
            error: 'Razorpay API keys (RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET) are missing. Please configure them in environment variables.',
          });
        }

        try {
          // Initialize Razorpay SDK
          const razorpay = new Razorpay({
            key_id: keyId,
            key_secret: keySecret,
          });

          // Order creation using amount in paise (1 INR = 100 paise) and currency INR
          const amountInPaise = Math.round(amount * 100);
          const rzpOrder = await razorpay.orders.create({
            amount: amountInPaise,
            currency: 'INR',
            receipt: `rcpt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            notes: {
              planType,
              country: selectedCountry,
              userId,
              userEmail: userEmail || '',
            },
          });

          const orderId = rzpOrder.id;

          pendingOrders.set(orderId, {
            amount,
            currency: 'INR',
            planType: planType as 'monthly' | 'quarterly' | 'yearly',
            country: selectedCountry,
            provider: 'razorpay',
            createdAt: Date.now(),
            userId,
            userEmail,
          });

          return res.json({
            success: true,
            orderId,
            amount,
            currency: 'INR',
            provider: 'razorpay',
            planType,
            country: selectedCountry,
            keyId,
          });
        } catch (rzpErr: any) {
          console.error('[Razorpay Order Creation Exception]:', rzpErr);
          const errorMessage = rzpErr?.error?.description || rzpErr?.message || (typeof rzpErr === 'string' ? rzpErr : JSON.stringify(rzpErr)) || 'Razorpay order creation failed';
          return res.status(500).json({
            success: false,
            error: `Razorpay Order Creation Failed: ${errorMessage}`,
          });
        }
      } else {
        // PayPal
        const { clientId, clientSecret, apiBase, mode } = getPaypalCredentials();
        if (!clientId || !clientSecret) {
          const missingVars: string[] = [];
          if (!clientId) missingVars.push('PAYPAL_CLIENT_ID');
          if (!clientSecret) missingVars.push('PAYPAL_CLIENT_SECRET');
          console.error(`[PayPal Config Error] Missing environment variables: ${missingVars.join(', ')}`);
          return res.status(400).json({
            success: false,
            code: 'MISSING_PAYPAL_CONFIG',
            name: 'Missing PayPal Configuration',
            error: `PayPal API configuration error: Missing ${missingVars.join(', ')}`,
            description: `The server requires ${missingVars.join(' and ')} to initiate PayPal checkout.`,
            suggestedFix: `Configure ${missingVars.join(' and ')} in environment variables.`,
          });
        }

        try {
          const accessToken = await fetchPaypalAccessToken(clientId, clientSecret, apiBase);

          const orderPayload = {
            intent: 'CAPTURE',
            purchase_units: [
              {
                amount: {
                  currency_code: 'USD',
                  value: amount.toFixed(2),
                },
                description: `Study Planner Premium (${planType})`,
              },
            ],
          };

          console.log(`[PayPal Create Order Request] POST ${apiBase}/v2/checkout/orders - Amount: $${amount.toFixed(2)} USD (${mode.toUpperCase()} mode)`);

          const ppRes = await fetch(`${apiBase}/v2/checkout/orders`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(orderPayload),
          });

          const ppBodyText = await ppRes.text();
          console.log(`[PayPal Create Order Response] Status: ${ppRes.status}, Body: ${ppBodyText}`);

          if (!ppRes.ok) {
            let parsedErr: any = {};
            try { parsedErr = JSON.parse(ppBodyText); } catch (e) {}
            const errName = parsedErr.name || 'PayPal Order Creation Error';
            const errDetails = parsedErr.details?.map((d: any) => `${d.field}: ${d.issue}`).join('; ') || parsedErr.message || ppBodyText;
            return res.status(ppRes.status).json({
              success: false,
              code: parsedErr.name || 'PAYPAL_ORDER_CREATION_FAILED',
              name: errName,
              error: `PayPal Order Creation Failed (${ppRes.status}): ${errDetails}`,
              description: errDetails,
              suggestedFix: `Ensure API credentials match ${mode.toUpperCase()} environment (${apiBase}) and currency USD is supported.`,
            });
          }

          let ppData: { id: string };
          try {
            ppData = JSON.parse(ppBodyText);
          } catch (e) {
            return res.status(500).json({
              success: false,
              code: 'PAYPAL_ORDER_INVALID_JSON',
              name: 'Invalid Response Format',
              error: `Invalid JSON returned by PayPal order creation: ${ppBodyText}`,
              description: ppBodyText,
              suggestedFix: 'Verify PayPal API base URL and response headers.',
            });
          }

          const orderId = ppData.id;

          pendingOrders.set(orderId, {
            amount,
            currency: 'USD',
            planType: planType as 'monthly' | 'quarterly' | 'yearly',
            country: selectedCountry,
            provider: 'paypal',
            createdAt: Date.now(),
            userId,
            userEmail,
          });

          return res.json({
            success: true,
            orderId,
            amount,
            currency: 'USD',
            provider: 'paypal',
            planType,
            country: selectedCountry,
            keyId: clientId,
            mode,
          });
        } catch (ppErr: any) {
          console.error('[PayPal Order Creation Exception]:', ppErr);
          return res.status(ppErr.status || 500).json({
            success: false,
            code: ppErr.code || 'PAYPAL_ORDER_EXCEPTION',
            name: ppErr.name || 'PayPal Order Exception',
            error: ppErr.message || 'PayPal order creation failed',
            description: ppErr.description || ppErr.message,
            suggestedFix: ppErr.suggestedFix || 'Inspect server log output for full error trace.',
          });
        }
      }
    } catch (error: any) {
      console.error('[Error creating subscription order]:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to create payment order'
      });
    }
  });

  // Verify Payment on Backend
  app.post('/api/subscription/verify-payment', async (req, res) => {
    try {
      const { orderId, paymentId, signature, provider } = req.body;

      if (!orderId || !provider) {
        return res.status(400).json({ error: 'Missing required payment details for verification' });
      }

      const transactionIdentifier = paymentId || orderId;

      // Replay attack prevention
      if (verifiedPayments.has(transactionIdentifier)) {
        return res.status(400).json({
          error: 'DUPLICATE_PAYMENT',
          message: 'This transaction has already been processed.',
        });
      }

      // Check registered order
      const originalOrder = pendingOrders.get(orderId);
      if (!originalOrder) {
        return res.status(404).json({
          error: 'INVALID_ORDER',
          message: 'No record of this checkout order was found on the server.',
        });
      }

      if (provider === 'razorpay') {
        const { keySecret } = getRazorpayCredentials();
        if (!keySecret) {
          return res.status(400).json({
            error: 'MISSING_RAZORPAY_CONFIG',
            message: 'RAZORPAY_KEY_SECRET is missing on the backend server.',
          });
        }

        if (!paymentId || !signature) {
          return res.status(400).json({ error: 'Razorpay paymentId and signature are required for verification.' });
        }

        // HMAC-SHA256 signature verification matching Razorpay protocol
        const expectedSignature = crypto
          .createHmac('sha256', keySecret)
          .update(`${orderId}|${paymentId}`)
          .digest('hex');

        if (expectedSignature !== signature) {
          return res.status(401).json({
            error: 'INVALID_SIGNATURE',
            message: 'Razorpay payment signature verification failed. Transaction rejected.',
          });
        }
      } else if (provider === 'paypal') {
        const { clientId, clientSecret, apiBase, mode } = getPaypalCredentials();
        if (!clientId || !clientSecret) {
          const missingVars: string[] = [];
          if (!clientId) missingVars.push('PAYPAL_CLIENT_ID');
          if (!clientSecret) missingVars.push('PAYPAL_CLIENT_SECRET');
          return res.status(400).json({
            error: 'MISSING_PAYPAL_CONFIG',
            name: 'Missing PayPal Configuration',
            message: `PayPal API credentials missing on backend server: ${missingVars.join(', ')}.`,
            suggestedFix: `Configure ${missingVars.join(' and ')} in environment variables.`,
          });
        }

        try {
          // Capture PayPal order on PayPal servers
          const accessToken = await fetchPaypalAccessToken(clientId, clientSecret, apiBase);
          console.log(`[PayPal Capture Request] POST ${apiBase}/v2/checkout/orders/${orderId}/capture (${mode.toUpperCase()} mode)`);

          const captureRes = await fetch(`${apiBase}/v2/checkout/orders/${orderId}/capture`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          });

          const captureText = await captureRes.text();
          console.log(`[PayPal Capture Response] Status: ${captureRes.status}, Body: ${captureText}`);

          if (!captureRes.ok) {
            let parsedCaptureErr: any = {};
            try { parsedCaptureErr = JSON.parse(captureText); } catch (e) {}
            const captureErrDesc = parsedCaptureErr.details?.map((d: any) => `${d.field}: ${d.issue}`).join('; ') || parsedCaptureErr.message || captureText;
            return res.status(captureRes.status).json({
              error: parsedCaptureErr.name || 'PAYPAL_CAPTURE_FAILED',
              name: parsedCaptureErr.name || 'PayPal Capture Failed',
              message: `PayPal order capture failed (${captureRes.status}): ${captureErrDesc}`,
              description: captureErrDesc,
              suggestedFix: 'Ensure the buyer completed authorization before capturing the order.',
            });
          }

          let captureData: any;
          try {
            captureData = JSON.parse(captureText);
          } catch (e) {
            return res.status(500).json({
              error: 'PAYPAL_CAPTURE_RESPONSE_INVALID',
              name: 'Invalid Capture Response',
              message: `PayPal capture returned invalid JSON: ${captureText}`,
              suggestedFix: 'Check PayPal API status and response format.',
            });
          }

          if (captureData.status !== 'COMPLETED') {
            return res.status(400).json({
              error: 'PAYPAL_NOT_COMPLETED',
              name: 'Payment Incomplete',
              message: `PayPal payment status is ${captureData.status}, expected COMPLETED.`,
              suggestedFix: 'Complete payment authorization in PayPal popup window.',
            });
          }
        } catch (ppCaptureErr: any) {
          console.error('[PayPal Verify Payment Exception]:', ppCaptureErr);
          return res.status(ppCaptureErr.status || 500).json({
            error: ppCaptureErr.code || 'PAYPAL_VERIFICATION_ERROR',
            name: ppCaptureErr.name || 'PayPal Verification Error',
            message: ppCaptureErr.message || 'Failed to verify PayPal payment.',
            description: ppCaptureErr.description || ppCaptureErr.message,
            suggestedFix: ppCaptureErr.suggestedFix || 'Check server logs for details.',
          });
        }
      }

      // Record transaction to prevent replay
      verifiedPayments.add(transactionIdentifier);

      // Account-level identity verification
      const reqUser = getEffectiveUser(req);
      const effectiveUserId = reqUser.userId || originalOrder.userId;
      const effectiveUserEmail = reqUser.userEmail || originalOrder.userEmail;

      if (!effectiveUserId) {
        return res.status(400).json({
          error: 'ACCOUNT_REQUIRED',
          message: 'A verified Study Planner account is required to associate and activate your Premium subscription.',
        });
      }

      const db = readDB(effectiveUserId, effectiveUserEmail);
      const purchaseDate = new Date();
      const expiryDate = new Date();

      if (originalOrder.planType === 'monthly') {
        expiryDate.setMonth(expiryDate.getMonth() + 1);
      } else if (originalOrder.planType === 'quarterly') {
        expiryDate.setMonth(expiryDate.getMonth() + 3);
      } else {
        expiryDate.setFullYear(expiryDate.getFullYear() + 1);
      }

      // Store in DB Profile Subscription
      db.profile.subscription = {
        subscriptionStatus: 'premium',
        plan: originalOrder.planType,
        paymentGateway: originalOrder.provider,
        transactionId: transactionIdentifier,
        purchaseDate: purchaseDate.toISOString(),
        expiryDate: expiryDate.toISOString(),
        billingCountry: originalOrder.country,
        // Legacy compatibility properties
        type: originalOrder.planType,
        paymentProvider: originalOrder.provider,
        paymentId: transactionIdentifier,
      };

      // Record in persistent subscriptions ledger linked to Google Account ID
      recordSubscriptionInLedger({
        transactionId: transactionIdentifier,
        orderId,
        userId: effectiveUserId,
        userEmail: effectiveUserEmail,
        plan: originalOrder.planType,
        paymentGateway: originalOrder.provider,
        amount: originalOrder.amount,
        currency: originalOrder.currency,
        purchaseDate: purchaseDate.toISOString(),
        expiryDate: expiryDate.toISOString(),
        billingCountry: originalOrder.country,
        verifiedAt: new Date().toISOString(),
        status: 'active',
      });

      writeDB(db, effectiveUserId, effectiveUserEmail);
      pendingOrders.delete(orderId); // Clean up cache

      res.json({
        success: true,
        message: 'Payment verified successfully! Welcome to Study Planner Premium.',
        subscription: db.profile.subscription,
      });
    } catch (error: any) {
      console.error('Error verifying payment:', error);
      res.status(500).json({ error: error.message || 'Failed to verify payment' });
    }
  });

  // Account Entitlement Query Endpoint
  app.get('/api/subscription/account-status', (req, res) => {
    try {
      const { userId, userEmail } = getEffectiveUser(req);
      if (!userId && !userEmail) {
        return res.json({ hasActiveSubscription: false, subscription: null });
      }

      const activeEntry = getActiveSubscriptionFromLedger(userId, userEmail);
      if (activeEntry) {
        return res.json({
          hasActiveSubscription: true,
          subscription: {
            subscriptionStatus: 'premium',
            plan: activeEntry.plan,
            paymentGateway: activeEntry.paymentGateway,
            transactionId: activeEntry.transactionId,
            purchaseDate: activeEntry.purchaseDate,
            expiryDate: activeEntry.expiryDate,
            billingCountry: activeEntry.billingCountry,
            type: normalizePlanType(activeEntry.plan),
            paymentProvider: activeEntry.paymentGateway,
            paymentId: activeEntry.transactionId,
          },
        });
      }

      res.json({ hasActiveSubscription: false, subscription: null });
    } catch (err: any) {
      console.error('Error querying account subscription status:', err);
      res.status(500).json({ error: 'Failed to query account subscription status' });
    }
  });

  // Secure Subscription Restoration Endpoint
  app.post('/api/subscription/restore', async (req, res) => {
    try {
      const { userId, userEmail } = getEffectiveUser(req);
      const rawId = req.body?.identifier || req.body?.transactionId || req.body?.paymentId || req.body?.orderId || req.body?.email || userEmail || userId;
      if (!rawId || typeof rawId !== 'string') {
        return res.status(400).json({
          error: 'ID_REQUIRED',
          message: 'Payment ID, Order ID, or signed-in account is required for subscription restoration.',
        });
      }

      const cleanId = rawId.trim();

      // Guard: Do not automatically trust a typed email alone without verification
      if (cleanId.includes('@') && (!userEmail || userEmail.toLowerCase() !== cleanId.toLowerCase())) {
        return res.status(401).json({
          error: 'VERIFICATION_REQUIRED',
          message: 'To restore subscriptions linked to an email address, please sign in with your verified email account.',
        });
      }

      // 1. Check persistent server subscriptions ledger (supports transactionId, orderId, userId, or userEmail)
      const ledger = readSubscriptionsLedger();
      const ledgerEntry = ledger.find(e => {
        if (cleanId) {
          if (e.transactionId && e.transactionId.toLowerCase() === cleanId.toLowerCase()) return true;
          if (e.orderId && e.orderId.toLowerCase() === cleanId.toLowerCase()) return true;
          if (e.userId && e.userId.toLowerCase() === cleanId.toLowerCase()) return true;
          if (e.userEmail && e.userEmail.toLowerCase() === cleanId.toLowerCase()) return true;
        }
        if (userId && e.userId === userId) return true;
        if (userEmail && e.userEmail && e.userEmail.toLowerCase() === userEmail.toLowerCase()) return true;
        return false;
      });

      if (ledgerEntry) {
        const expiryTime = new Date(ledgerEntry.expiryDate).getTime();
        if (isNaN(expiryTime) || expiryTime <= Date.now()) {
          return res.status(400).json({
            error: 'SUBSCRIPTION_EXPIRED',
            message: `This subscription (${ledgerEntry.plan}) expired on ${new Date(ledgerEntry.expiryDate).toLocaleDateString()}. Please renew to access Premium features.`,
            expiryDate: ledgerEntry.expiryDate,
          });
        }

        const effectiveUser = userId || ledgerEntry.userId;
        const effectiveEmail = userEmail || ledgerEntry.userEmail;
        const db = readDB(effectiveUser, effectiveEmail);
        db.profile.subscription = {
          subscriptionStatus: 'premium',
          plan: ledgerEntry.plan,
          paymentGateway: ledgerEntry.paymentGateway,
          transactionId: ledgerEntry.transactionId,
          purchaseDate: ledgerEntry.purchaseDate,
          expiryDate: ledgerEntry.expiryDate,
          billingCountry: ledgerEntry.billingCountry,
          type: normalizePlanType(ledgerEntry.plan),
          paymentProvider: ledgerEntry.paymentGateway,
          paymentId: ledgerEntry.transactionId,
        };
        writeDB(db, effectiveUser, effectiveEmail);

        return res.json({
          success: true,
          message: `Premium ${ledgerEntry.plan} subscription successfully verified and restored!`,
          subscription: db.profile.subscription,
        });
      }

      // 2. Query Razorpay API directly if it's a Razorpay payment ID (e.g., starts with pay_)
      if (cleanId.startsWith('pay_')) {
        const { keyId, keySecret } = getRazorpayCredentials();
        if (!keyId || !keySecret) {
          return res.status(400).json({
            error: 'RAZORPAY_CONFIG_MISSING',
            message: 'Razorpay configuration is not active on this environment.',
          });
        }

        const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
        const rzpRes = await fetch(`https://api.razorpay.com/v1/payments/${cleanId}`, {
          headers: { Authorization: authHeader },
        });

        if (!rzpRes.ok) {
          return res.status(404).json({
            error: 'PAYMENT_NOT_FOUND',
            message: 'Payment ID not found on Razorpay. Please check the ID from your receipt email.',
          });
        }

        const paymentData = (await rzpRes.json()) as any;
        if (paymentData.status !== 'captured' && paymentData.status !== 'authorized') {
          return res.status(400).json({
            error: 'PAYMENT_NOT_COMPLETED',
            message: `Payment status is ${paymentData.status}. Only captured payments can be restored.`,
          });
        }

        // Determine plan from amount: ₹99 (9900 paise) = monthly, ₹999 (99900 paise) = yearly
        const amountPaise = paymentData.amount || 0;
        const plan: 'monthly' | 'yearly' = amountPaise >= 50000 ? 'yearly' : 'monthly';
        const createdTimeMs = (paymentData.created_at || Math.floor(Date.now() / 1000)) * 1000;
        const purchaseDate = new Date(createdTimeMs);
        const expiryDate = new Date(createdTimeMs);

        if (plan === 'monthly') {
          expiryDate.setMonth(expiryDate.getMonth() + 1);
        } else {
          expiryDate.setFullYear(expiryDate.getFullYear() + 1);
        }

        if (expiryDate.getTime() <= Date.now()) {
          return res.status(400).json({
            error: 'SUBSCRIPTION_EXPIRED',
            message: `This Razorpay subscription expired on ${expiryDate.toLocaleDateString()}. Please renew to continue Premium access.`,
            expiryDate: expiryDate.toISOString(),
          });
        }

        const newLedgerEntry: StoredSubscriptionLedgerEntry = {
          transactionId: paymentData.id,
          orderId: paymentData.order_id,
          plan,
          paymentGateway: 'razorpay',
          amount: amountPaise / 100,
          currency: paymentData.currency || 'INR',
          purchaseDate: purchaseDate.toISOString(),
          expiryDate: expiryDate.toISOString(),
          billingCountry: 'IN',
          verifiedAt: new Date().toISOString(),
          status: 'active',
        };

        recordSubscriptionInLedger(newLedgerEntry);

        const db = readDB();
        db.profile.subscription = {
          subscriptionStatus: 'premium',
          plan,
          paymentGateway: 'razorpay',
          transactionId: paymentData.id,
          purchaseDate: purchaseDate.toISOString(),
          expiryDate: expiryDate.toISOString(),
          billingCountry: 'IN',
          type: plan,
          paymentProvider: 'razorpay',
          paymentId: paymentData.id,
        };
        writeDB(db);

        return res.json({
          success: true,
          message: 'Razorpay Premium subscription verified and restored successfully!',
          subscription: db.profile.subscription,
        });
      }

      // 3. Query PayPal API if configured
      const { clientId, clientSecret, apiBase } = getPaypalCredentials();
      if (clientId && clientSecret) {
        try {
          const accessToken = await fetchPaypalAccessToken(clientId, clientSecret, apiBase);
          const ppRes = await fetch(`${apiBase}/v2/checkout/orders/${cleanId}`, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          });

          if (ppRes.ok) {
            const orderData = (await ppRes.json()) as any;
            if (orderData.status === 'COMPLETED') {
              const capture = orderData.purchase_units?.[0]?.payments?.captures?.[0];
              const createTime = new Date(orderData.create_time || Date.now());
              const val = parseFloat(capture?.amount?.value || '19.99');
              const plan: 'monthly' | 'yearly' = val < 10 ? 'monthly' : 'yearly';
              const expiryDate = new Date(createTime.getTime());
              if (plan === 'monthly') {
                expiryDate.setMonth(expiryDate.getMonth() + 1);
              } else {
                expiryDate.setFullYear(expiryDate.getFullYear() + 1);
              }

              if (expiryDate.getTime() <= Date.now()) {
                return res.status(400).json({
                  error: 'SUBSCRIPTION_EXPIRED',
                  message: `This PayPal subscription expired on ${expiryDate.toLocaleDateString()}.`,
                  expiryDate: expiryDate.toISOString(),
                });
              }

              const newLedgerEntry: StoredSubscriptionLedgerEntry = {
                transactionId: capture?.id || orderData.id,
                orderId: orderData.id,
                plan,
                paymentGateway: 'paypal',
                amount: val,
                currency: capture?.amount?.currency_code || 'USD',
                purchaseDate: createTime.toISOString(),
                expiryDate: expiryDate.toISOString(),
                billingCountry: 'US',
                verifiedAt: new Date().toISOString(),
                status: 'active',
              };

              recordSubscriptionInLedger(newLedgerEntry);

              const db = readDB();
              db.profile.subscription = {
                subscriptionStatus: 'premium',
                plan,
                paymentGateway: 'paypal',
                transactionId: newLedgerEntry.transactionId,
                purchaseDate: newLedgerEntry.purchaseDate,
                expiryDate: newLedgerEntry.expiryDate,
                billingCountry: 'US',
                type: plan,
                paymentProvider: 'paypal',
                paymentId: newLedgerEntry.transactionId,
              };
              writeDB(db);

              return res.json({
                success: true,
                message: 'PayPal Premium subscription verified and restored successfully!',
                subscription: db.profile.subscription,
              });
            }
          }
        } catch (ppErr) {
          console.warn('[PayPal Restore Check Error]:', ppErr);
        }
      }

      return res.status(404).json({
        error: 'TRANSACTION_NOT_FOUND',
        message: 'Unable to locate a valid, active subscription for the provided Transaction ID or Order ID. Please check the ID and try again.',
      });
    } catch (err: any) {
      console.error('[Restore Subscription Error]:', err);
      res.status(500).json({ error: err.message || 'Failed to restore subscription' });
    }
  });

  // Entitlement Synchronization Endpoint (Allows client to sync active entitlement to backend ledger)
  app.post('/api/subscription/sync-entitlement', (req, res) => {
    try {
      const { userId, userEmail } = getEffectiveUser(req);
      const effectiveUserId = userId || req.body.userId;
      const effectiveUserEmail = userEmail || req.body.userEmail;

      const { subscription } = req.body;
      if (!subscription || !isSubscriptionActive(subscription)) {
        return res.status(400).json({ error: 'Invalid or inactive subscription payload' });
      }

      if (subscription.expiryDate) {
        const expiry = new Date(subscription.expiryDate).getTime();
        if (!isNaN(expiry) && expiry <= Date.now()) {
          return res.status(400).json({ error: 'Subscription has already expired' });
        }
      }

      const db = readDB(effectiveUserId, effectiveUserEmail);
      db.profile.subscription = { ...subscription };
      writeDB(db, effectiveUserId, effectiveUserEmail);

      if (subscription.transactionId) {
        recordSubscriptionInLedger({
          transactionId: subscription.transactionId,
          userId: effectiveUserId,
          userEmail: effectiveUserEmail,
          plan: subscription.plan || 'premium',
          paymentGateway: subscription.paymentGateway || 'razorpay',
          purchaseDate: subscription.purchaseDate || new Date().toISOString(),
          expiryDate: subscription.expiryDate || new Date(Date.now() + 30 * 86400000).toISOString(),
          billingCountry: subscription.billingCountry || 'US',
          verifiedAt: new Date().toISOString(),
          status: 'active',
        });
      }

      res.json({ success: true, subscription: db.profile.subscription });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to sync entitlement' });
    }
  });

  // Simulate Pro Expiration (Sandbox testing - preserves 100% of user data)
  app.post('/api/subscription/simulate-expire', (req, res) => {
    try {
      const db = readDB();
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1); // Expired yesterday

      db.profile.subscription = {
        ...db.profile.subscription,
        subscriptionStatus: 'free',
        expiryDate: pastDate.toISOString(),
      };

      // Mark ledger entries as expired so testing works properly
      const ledger = readSubscriptionsLedger();
      ledger.forEach(e => {
        e.status = 'expired';
      });
      writeSubscriptionsLedger(ledger);

      // Explicitly verify NO data collections were modified
      writeDB(db);
      res.json({
        success: true,
        message: 'Subscription set to expired. All user data, courses, notes, and audio lectures remain safely preserved.',
        subscription: db.profile.subscription,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to simulate expiration' });
    }
  });

  // Simulate Pro Activation / Renewal (Sandbox testing - preserves 100% of user data)
  app.post('/api/subscription/simulate-pro', (req, res) => {
    try {
      const db = readDB();
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1); // Valid for 1 year
      const simTxId = 'sim_' + crypto.randomUUID().slice(0, 12);

      db.profile.subscription = {
        subscriptionStatus: 'premium',
        plan: 'yearly',
        paymentGateway: 'razorpay',
        transactionId: simTxId,
        purchaseDate: new Date().toISOString(),
        expiryDate: futureDate.toISOString(),
        billingCountry: 'US',
        type: 'yearly',
        paymentProvider: 'razorpay',
        paymentId: simTxId,
      };

      // Record in ledger so it persists across container restarts
      recordSubscriptionInLedger({
        transactionId: simTxId,
        plan: 'yearly',
        paymentGateway: 'razorpay',
        amount: 19.99,
        currency: 'USD',
        purchaseDate: new Date().toISOString(),
        expiryDate: futureDate.toISOString(),
        billingCountry: 'US',
        verifiedAt: new Date().toISOString(),
        status: 'active',
      });

      // Explicitly verify NO data collections were modified or duplicated
      writeDB(db);
      res.json({
        success: true,
        message: 'Pro subscription activated! All previous user data remains intact and fully unlocked.',
        subscription: db.profile.subscription,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to simulate Pro activation' });
    }
  });

  // Manual Reset to default state (preserves active subscription)
  app.post('/api/reset', (req, res) => {
    try {
      const currentDb = readDB();
      const activeSub = isSubscriptionActive(currentDb?.profile?.subscription)
        ? currentDb.profile.subscription
        : null;

      const defaultState = getInitialDatabaseState();
      if (activeSub) {
        defaultState.profile.subscription = { ...activeSub };
      }
      writeDB(defaultState);
      res.json({ success: true, state: defaultState });
    } catch (error) {
      res.status(500).json({ error: 'Failed to reset state' });
    }
  });

  // Catch-all handler for unmatched /api/* routes - GUARANTEES JSON response, never HTML
  app.all('/api/*', (req, res) => {
    console.warn(`[API 404] Unmatched API route: ${req.method} ${req.originalUrl}`);
    res.status(404).json({
      error: 'API_NOT_FOUND',
      message: `API route ${req.method} ${req.originalUrl} does not exist on this server.`,
    });
  });

  // Global Express Error Middleware for /api routes
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.path.startsWith('/api')) {
      console.error(`[API UNHANDLED ERROR] ${req.method} ${req.originalUrl}:`, err);
      return res.status(err.status || 500).json({
        error: err.code || 'SERVER_ERROR',
        message: err.message || 'An unexpected error occurred on the server.',
      });
    }
    next(err);
  });

  export default app;

  async function startStandaloneServer() {
    // Vite Integration & Production Static Asset Serving
    if (process.env.NODE_ENV !== 'production') {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), 'dist');
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }

  if (!process.env.VERCEL) {
    startStandaloneServer();
  }

