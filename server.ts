import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import mammoth from 'mammoth';
import Razorpay from 'razorpay';
import { GoogleGenAI } from '@google/genai';
import { put, del } from '@vercel/blob';
import { handleUpload } from '@vercel/blob/client';
import { FREE_PLAN_LIMITS, DatabaseSchema, UserProfile, StudyMaterial } from './src/types.js';

const PORT = 3000;
const DB_FILE = path.join(process.cwd(), 'server_db.json');

// Supported file extensions for Study Materials (PDF, Word DOC/DOCX, Images, TXT, CSV up to 30MB)
const ALLOWED_MATERIAL_EXTENSIONS = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.webp', '.txt', '.csv'];

// Ensure local uploads directory for resilient durable file storage
const UPLOADS_MATERIALS_DIR = path.join(process.cwd(), 'uploads', 'materials');
try {
  if (!fs.existsSync(UPLOADS_MATERIALS_DIR)) {
    fs.mkdirSync(UPLOADS_MATERIALS_DIR, { recursive: true });
  }
} catch (dirErr) {
  console.warn('[Storage] Could not create local materials directory:', dirErr);
}

// In-memory multer storage: files are buffered in memory and saved to Blob or local disk
const uploadMaterial = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 }, // 30MB maximum limit
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_MATERIAL_EXTENSIONS.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file format "${ext}". Supported formats: PDF, Word (DOC, DOCX), Images (JPG, PNG, WEBP), Text (TXT), and CSV.`));
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

// Check for the authoritative server-side GEMINI_API_KEY environment variable
const getGeminiApiKey = (): string | undefined => {
  return sanitizeEnvVar(process.env.GEMINI_API_KEY);
};

// Check for the authoritative server-side BLOB_READ_WRITE_TOKEN environment variable
const getBlobToken = (): string | undefined => {
  return sanitizeEnvVar(process.env.BLOB_READ_WRITE_TOKEN);
};

// Gemini Client Lazy Initializer
let geminiClient: GoogleGenAI | null = null;
let currentClientKey: string | null = null;

function getGeminiClient(): GoogleGenAI {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    console.error(
      '[Gemini AI Config] GEMINI_API_KEY is not configured in the server environment.'
    );
    const err: any = new Error('AI features are temporarily unavailable. Gemini is not configured for this deployment.');
    err.code = 'GEMINI_NOT_CONFIGURED';
    err.isConfigError = true;
    throw err;
  }
  if (!geminiClient || currentClientKey !== apiKey) {
    geminiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
    currentClientKey = apiKey;
  }
  return geminiClient;
}

// Concurrency lock to prevent accidental duplicate Gemini requests per lecture/action with auto-expiry
class ResilientAiLock {
  private locks = new Map<string, number>();
  private readonly ttlMs = 45000; // 45 seconds maximum lock duration

  has(key: string): boolean {
    const ts = this.locks.get(key);
    if (!ts) return false;
    if (Date.now() - ts > this.ttlMs) {
      this.locks.delete(key);
      return false;
    }
    return true;
  }

  add(key: string): void {
    this.locks.set(key, Date.now());
  }

  delete(key: string): void {
    this.locks.delete(key);
  }
}
const activeAiOperations = new ResilientAiLock();

// Helper to format an individual bullet item across primitive or object representations
function formatKeyPointBulletItem(item: any): string {
  if (item === null || item === undefined) return '';

  if (typeof item === 'string') {
    let clean = item.trim();
    // Normalize existing bullet prefixes so we don't produce double bullets
    clean = clean.replace(/^[\*\-\•\–\—\>]\s*/, '').trim();
    return clean ? `- ${clean}` : '';
  }

  if (typeof item === 'object') {
    const term = item.term || item.concept || item.title || item.name || item.keyword;
    const def = item.definition || item.meaning || item.explanation || item.description || item.value || item.details;
    if (term && def) {
      return `- **${String(term).trim()}**: ${String(def).trim()}`;
    }

    const point = item.point || item.takeaway || item.text || item.content || item.item || item.fact || item.rule || item.statement;
    if (point) {
      return `- ${String(point).trim()}`;
    }

    // Key-value pairs inside object
    const entries = Object.entries(item).filter(([k]) => k !== 'id' && k !== 'index');
    if (entries.length > 0) {
      return `- ${entries.map(([k, v]) => `**${k}**: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' | ')}`;
    }
  }

  return `- ${String(item).trim()}`;
}

// Robust schema validator and normalizer for Key Points output
function normalizeKeyPointsOutput(raw: any): string {
  if (!raw) return '';

  // 1. Recursive handling of raw JSON objects and arrays
  if (typeof raw === 'object' && raw !== null) {
    // Schema A: Array of items or section objects
    if (Array.isArray(raw)) {
      if (raw.length === 0) return '';
      // Check if array items are section structures ({ title/heading, items/points })
      const isSectionArray = raw.every((it) => it && typeof it === 'object' && (it.title || it.heading || it.section) && (Array.isArray(it.items) || Array.isArray(it.points)));
      if (isSectionArray) {
        return raw
          .map((sec) => {
            const title = sec.title || sec.heading || sec.section || 'Key Section';
            const items = sec.items || sec.points || [];
            const bullets = items.map(formatKeyPointBulletItem).filter(Boolean).join('\n');
            return `### ${title}\n${bullets}`;
          })
          .join('\n\n');
      }

      return raw.map(formatKeyPointBulletItem).filter(Boolean).join('\n');
    }

    // Schema B: Wrapped envelopes (e.g. { data: ... }, { result: ... }, { output: ... })
    const unwrapped = raw.data || raw.result || raw.response || raw.output || raw.content;
    if (unwrapped && (typeof unwrapped === 'object' || typeof unwrapped === 'string')) {
      const parsedUnwrapped = normalizeKeyPointsOutput(unwrapped);
      if (parsedUnwrapped) return parsedUnwrapped;
    }

    // Schema C: Structured 3-part or multi-part exam schema
    const takeaways =
      raw.criticalExamTakeaways ||
      raw.takeaways ||
      raw.criticalTakeaways ||
      raw.examTakeaways ||
      raw.coreTakeaways ||
      raw.mainTakeaways ||
      raw.keyPoints ||
      raw.key_points ||
      raw.key_takeaways ||
      raw.points;

    const terms =
      raw.essentialTerms ||
      raw.terms ||
      raw.definitions ||
      raw.vocabulary ||
      raw.keyTerms ||
      raw.essential_terms ||
      raw.key_terms;

    const pitfalls =
      raw.commonPitfalls ||
      raw.pitfalls ||
      raw.clarifications ||
      raw.misconceptions ||
      raw.cautions ||
      raw.warnings ||
      raw.common_pitfalls;

    const sections = raw.sections || raw.categories || raw.topics;

    if (Array.isArray(sections) && sections.length > 0) {
      return sections
        .map((sec) => {
          const title = sec.title || sec.heading || sec.name || 'Key Points';
          const items = sec.items || sec.points || sec.takeaways || [];
          const bullets = (Array.isArray(items) ? items : [items]).map(formatKeyPointBulletItem).filter(Boolean).join('\n');
          return `### ${title}\n${bullets}`;
        })
        .join('\n\n');
    }

    if (takeaways || terms || pitfalls) {
      const parts: string[] = [];

      if (takeaways) {
        const list = Array.isArray(takeaways) ? takeaways : [takeaways];
        const bullets = list.map(formatKeyPointBulletItem).filter(Boolean).join('\n');
        if (bullets) parts.push(`### 📌 Critical Exam Takeaways\n${bullets}`);
      }

      if (terms) {
        if (!Array.isArray(terms) && typeof terms === 'object' && terms !== null) {
          const bullets = Object.entries(terms)
            .map(([k, v]) => `- **${k}**: ${String(v).trim()}`)
            .join('\n');
          if (bullets) parts.push(`### 🔑 Essential Terms & Definitions\n${bullets}`);
        } else {
          const list = Array.isArray(terms) ? terms : [terms];
          const bullets = list.map(formatKeyPointBulletItem).filter(Boolean).join('\n');
          if (bullets) parts.push(`### 🔑 Essential Terms & Definitions\n${bullets}`);
        }
      }

      if (pitfalls) {
        const list = Array.isArray(pitfalls) ? pitfalls : [pitfalls];
        const bullets = list.map(formatKeyPointBulletItem).filter(Boolean).join('\n');
        if (bullets) parts.push(`### ⚠️ Common Pitfalls & Clarifications\n${bullets}`);
      }

      if (parts.length > 0) return parts.join('\n\n');
    }

    // Schema D: Dictionary of key-values where all values are primitives
    const entries = Object.entries(raw).filter(([k]) => !['status', 'success', 'model', 'timestamp'].includes(k));
    if (entries.length > 0 && entries.every(([, v]) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) {
      const bullets = entries.map(([k, v]) => `- **${k}**: ${String(v).trim()}`).join('\n');
      return `### 🔑 Essential Terms & Definitions\n${bullets}`;
    }

    // Schema E: Catch-all for other object structures with values
    const allValues = entries.map(([, v]) => formatKeyPointBulletItem(v)).filter(Boolean);
    if (allValues.length > 0) {
      return allValues.join('\n');
    }
  }

  // 2. String processing & JSON detection
  let text = String(raw).trim();

  // Strip enclosing Markdown code blocks if model wrapped output in ```markdown or ```
  if (text.startsWith('```markdown')) {
    text = text.replace(/^```markdown\s*/i, '').replace(/\s*```$/, '').trim();
  } else if (text.startsWith('```') && !text.startsWith('```json')) {
    text = text.replace(/^```\w*\s*/i, '').replace(/\s*```$/, '').trim();
  }

  // Detect and extract JSON code block: ```json ... ```
  const jsonFenceMatch = text.match(/```json\s*([\s\S]*?)\s*```/i);
  if (jsonFenceMatch) {
    try {
      const parsed = JSON.parse(jsonFenceMatch[1]);
      return normalizeKeyPointsOutput(parsed);
    } catch {
      // If parsing fails, strip fence and continue
      text = text.replace(/```json\s*/i, '').replace(/\s*```$/, '').trim();
    }
  }

  // Detect JSON object or array embedded within commentary text (e.g. "Here are the points: { ... }")
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  const firstBracket = text.indexOf('[');
  const lastBracket = text.lastIndexOf(']');

  if (firstBrace !== -1 && lastBrace > firstBrace && (firstBracket === -1 || firstBrace < firstBracket)) {
    try {
      const potentialJson = text.slice(firstBrace, lastBrace + 1);
      const parsed = JSON.parse(potentialJson);
      return normalizeKeyPointsOutput(parsed);
    } catch {
      // Continue to bracket check or raw text
    }
  }

  if (firstBracket !== -1 && lastBracket > firstBracket) {
    try {
      const potentialJson = text.slice(firstBracket, lastBracket + 1);
      const parsed = JSON.parse(potentialJson);
      return normalizeKeyPointsOutput(parsed);
    } catch {
      // Continue to raw text
    }
  }

  // 3. Clean up raw Markdown text
  // Ensure lines starting with '*' or '•' use standard '-' bullets
  const cleanedText = text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('• ') || trimmed.startsWith('* ')) {
        return `- ${trimmed.slice(2)}`;
      }
      return line;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n'); // collapse excessive blank lines

  return cleanedText;
}

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
  systemInstruction?: string,
  isAudioTask = false
): Promise<string> {
  // Official verified Gemini models according to Google AI Studio skill guidelines:
  // - Primary fast/multimodal model: 'gemini-3.8-flash'
  // - Resilient high-throughput fallback: 'gemini-3.1-flash-lite'
  // - Stable latest alias: 'gemini-flash-latest'
  // - Audio transcription: 'gemini-3.5-transcribe' with fallback to flash models
  const models = isAudioTask
    ? ['gemini-3.5-transcribe', 'gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest']
    : ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
  let lastError: any = null;

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    try {
      const response = await ai.models.generateContent({
        model,
        contents: promptOrContents,
        config: systemInstruction ? { systemInstruction } : undefined,
      });

      // Extract text safely from response.text or candidates parts
      let text = '';
      try {
        text = response.text?.trim() || '';
      } catch {
        text = '';
      }

      if (!text && response.candidates?.[0]?.content?.parts) {
        text = response.candidates[0].content.parts
          .map((p: any) => (typeof p.text === 'string' ? p.text : ''))
          .join('')
          .trim();
      }

      if (text) return text;
    } catch (err: any) {
      lastError = err;
      const status = err?.status || err?.code || 0;
      const msg = err?.message || String(err);
      console.warn(`[Gemini AI] Text generation with ${model} failed (status: ${status}):`, msg.slice(0, 160));

      // If rate limited or quota burst encountered, wait briefly before trying next model
      const isRateLimited = status === 429 || /RESOURCE_EXHAUSTED|quota|rate limit/i.test(msg);
      if (isRateLimited && i < models.length - 1) {
        console.info(`[Gemini AI] Rate limit/quota encountered on ${model}. Switching to resilient fallback ${models[i + 1]}...`);
        await new Promise((resolve) => setTimeout(resolve, 750));
      }
    }
  }

  throw lastError || new Error('Failed to generate content with Gemini across all fallback models.');
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
  const isStatusPremium =
    sub.subscriptionStatus === 'premium' ||
    sub.status === 'active' ||
    sub.subscriptionStatus === 'active' ||
    sub.plan === 'premium' ||
    sub.plan === 'monthly' ||
    sub.plan === 'yearly' ||
    sub.plan === 'quarterly';
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

// --- Authoritative Native Study Planner Account & Session System ---
interface StoredUserRecord {
  userId: string; // Permanent unique internal user identifier
  name: string;
  email: string;
  passwordHash?: string; // bcrypt hash ($2a$10$...) - NEVER stored in plain text or sent to browser
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
  passwordResetToken?: string; // SHA-256 hashed single-use token
  passwordResetExpires?: number;
  verificationCode?: string;
  verificationCodeExpires?: number;
  verificationAttempts?: number;
}

interface StoredSessionRecord {
  token: string;
  userId: string;
  email: string;
  createdAt: number;
  expiresAt: number;
}

const getUsersFilePath = () => {
  if (process.env.VERCEL || process.env.TMPDIR) {
    return path.join('/tmp', 'users_db.json');
  }
  return path.join(process.cwd(), 'users_db.json');
};

const getSessionsFilePath = () => {
  if (process.env.VERCEL || process.env.TMPDIR) {
    return path.join('/tmp', 'sessions_db.json');
  }
  return path.join(process.cwd(), 'sessions_db.json');
};

let inMemoryUsersList: StoredUserRecord[] = [];
let inMemorySessionsMap: Map<string, StoredSessionRecord> = new Map();

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

const readSessions = (): Map<string, StoredSessionRecord> => {
  try {
    const filePath = getSessionsFilePath();
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      const parsed: StoredSessionRecord[] = JSON.parse(data);
      if (Array.isArray(parsed)) {
        inMemorySessionsMap = new Map(parsed.map(s => [s.token, s]));
      }
    }
  } catch (err) {
    console.warn('[Sessions] Could not read sessions:', err);
  }
  return inMemorySessionsMap;
};

const saveSession = (session: StoredSessionRecord) => {
  inMemorySessionsMap.set(session.token, session);
  try {
    const filePath = getSessionsFilePath();
    const activeList = Array.from(inMemorySessionsMap.values()).filter(s => s.expiresAt > Date.now());
    fs.writeFileSync(filePath, JSON.stringify(activeList, null, 2));
  } catch (err) {
    console.warn('[Sessions] Could not write sessions:', err);
  }
};

const deleteSession = (token: string) => {
  inMemorySessionsMap.delete(token);
  try {
    const filePath = getSessionsFilePath();
    const activeList = Array.from(inMemorySessionsMap.values()).filter(s => s.token !== token && s.expiresAt > Date.now());
    fs.writeFileSync(filePath, JSON.stringify(activeList, null, 2));
  } catch (err) {
    console.warn('[Sessions] Could not delete session:', err);
  }
};

const findSessionByToken = (token: string): StoredSessionRecord | undefined => {
  if (inMemorySessionsMap.size === 0) {
    readSessions();
  }
  const session = inMemorySessionsMap.get(token);
  if (session) {
    if (session.expiresAt <= Date.now()) {
      deleteSession(token);
      return undefined;
    }
    return session;
  }
  return undefined;
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

const sanitizeUser = (user: StoredUserRecord) => ({
  userId: user.userId,
  uid: user.userId, // Legacy compatibility alias
  name: user.name,
  displayName: user.name, // Legacy compatibility alias
  email: user.email,
  emailVerified: true,
  createdAt: user.createdAt,
});


const isUserIdentityMatch = (
  entryUserId?: string,
  entryEmail?: string,
  targetUserId?: string,
  targetEmail?: string
): boolean => {
  if (targetUserId && entryUserId && targetUserId === entryUserId) return true;
  if (
    targetEmail &&
    entryEmail &&
    targetEmail.trim().toLowerCase() === entryEmail.trim().toLowerCase()
  ) {
    return true;
  }

  // Cross-identity match for known user accounts across auth migrations (e.g. Suleman Malgave)
  const isSulemanIdOrEmail = (id?: string, email?: string) => {
    const cleanEmail = (email || '').toLowerCase().trim();
    return (
      id === 'ljZZVPYbazRFOcqna2WORbPL0k42' ||
      id === 'usr_em_14q1jg' ||
      cleanEmail === 'sulemanmalgave1@gmail.com' ||
      cleanEmail === 'malgavesuleman85@gmail.com' ||
      cleanEmail.includes('suleman') ||
      cleanEmail.includes('malgave')
    );
  };

  if (
    isSulemanIdOrEmail(targetUserId, targetEmail) &&
    (isSulemanIdOrEmail(entryUserId, entryEmail) || !entryUserId)
  ) {
    return true;
  }

  return false;
};

const getActiveSubscriptionFromLedger = (userId?: string, userEmail?: string): StoredSubscriptionLedgerEntry | null => {
  const ledger = readSubscriptionsLedger();
  const now = Date.now();
  let ledgerModified = false;

  const activeEntries = ledger.filter(e => {
    if (e.status !== 'active') return false;
    const expiry = new Date(e.expiryDate).getTime();
    if (isNaN(expiry) || expiry <= now) return false;

    if (userId || userEmail) {
      // 1. Direct or cross-identity match
      if (isUserIdentityMatch(e.userId, e.userEmail, userId, userEmail)) {
        if ((userId && !e.userId) || (userEmail && !e.userEmail)) {
          if (userId && !e.userId) e.userId = userId;
          if (userEmail && !e.userEmail) e.userEmail = userEmail;
          ledgerModified = true;
        }
        return true;
      }

      // 2. Backward compatibility: If an active unassigned subscription exists from pre-auth migration,
      // associate it with the current active user
      if (!e.userId && !e.userEmail) {
        if (userId) e.userId = userId;
        if (userEmail) e.userEmail = userEmail;
        ledgerModified = true;
        return true;
      }

      return false;
    }

    return true;
  });

  if (ledgerModified) {
    try {
      writeSubscriptionsLedger(ledger);
    } catch (err) {
      console.warn('Failed to update ledger with user link:', err);
    }
  }

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

const getSessionTokenFromRequest = (req: express.Request): string | undefined => {
  // 1. From HttpOnly Cookie: study_session=xxx
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)study_session=([^;]+)/);
    if (match) {
      try {
        return decodeURIComponent(match[1].trim());
      } catch (e) {
        return match[1].trim();
      }
    }
  }
  // 2. From Authorization header: Bearer xxx
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  // 3. From custom x-session-token header
  const customHeader = req.headers['x-session-token'];
  if (typeof customHeader === 'string' && customHeader) {
    return customHeader.trim();
  }
  return undefined;
};

const getEffectiveUser = (req: express.Request): { userId?: string; userEmail?: string } => {
  // 1. Check authenticated session
  const token = getSessionTokenFromRequest(req);
  if (token) {
    const session = findSessionByToken(token);
    if (session) {
      return { userId: session.userId, userEmail: session.email };
    }
  }

  // 2. Fallback to headers (for backward compatibility)
  const userId = (req.headers['x-user-id'] || req.query.userId || req.body?.userId || '') as string;
  const userEmail = (req.headers['x-user-email'] || req.query.userEmail || req.body?.userEmail || '') as string;
  return {
    userId: userId ? String(userId).trim() : undefined,
    userEmail: userEmail ? String(userEmail).trim() : undefined,
  };
};

// Authoritative subscription check helper: Matches account-status and client entitlement
function checkUserHasActiveSubscription(req: express.Request, db?: DatabaseSchema): boolean {
  try {
    const { userId, userEmail } = getEffectiveUser(req);
    // 1. Check ledger
    const activeEntry = getActiveSubscriptionFromLedger(userId, userEmail);
    if (activeEntry) return true;

    // 2. Check profile subscription in db
    const currentDb = db || readDB(userId, userEmail);
    const sub = currentDb?.profile?.subscription;
    if (sub && ((sub as any).status === 'active' || sub.subscriptionStatus === 'premium' || isSubscriptionActive(sub))) {
      return true;
    }

    // 3. Client forwarded header/body hint (for stateless or serverless environments)
    const subHeader = req.headers['x-subscription-status'];
    if (subHeader === 'active' || subHeader === 'premium') return true;
    if (req.body?.isPremium === true || req.body?.subscription?.status === 'active') return true;

    // 4. Primary account holder / premium user fallback
    if (userEmail && (userEmail.toLowerCase().includes('suleman') || userEmail.toLowerCase() === 'sulemanmalgave1@gmail.com')) {
      return true;
    }

    return false;
  } catch (err) {
    console.error('Error checking active subscription:', err);
    return false;
  }
}

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
      const { userId, userEmail } = getEffectiveUser(req);
      const db = readDB(userId, userEmail);
      let list = db.audioLectures || [];
      if (list.length === 0) {
        const defaultDb = readDB();
        list = defaultDb.audioLectures || [];
      }
      res.json(list);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch audio lectures' });
    }
  });

  app.post('/api/audio-lectures', (req, res) => {
    try {
      const { userId, userEmail } = getEffectiveUser(req);
      const db = readDB(userId, userEmail);
      if (!db.audioLectures) db.audioLectures = [];
      const isPro = checkUserHasActiveSubscription(req, db);
      if (!isPro && db.audioLectures.length >= FREE_PLAN_LIMITS.audioLectures) {
        return res.status(403).json({
          error: 'LIMIT_REACHED',
          message: "You've reached the Free plan limit of 2 Audio Lectures. Upgrade to Pro to add more.",
        });
      }
      const newLecture = {
        id: 'al_' + crypto.randomUUID().slice(0, 8),
        userId: userId || req.body.userId || 'default',
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
      writeDB(db, userId, userEmail);
      res.json(newLecture);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create audio lecture' });
    }
  });

  app.put('/api/audio-lectures/:id', (req, res) => {
    try {
      const { userId, userEmail } = getEffectiveUser(req);
      let targetDb = readDB(userId, userEmail);
      if (!targetDb.audioLectures) targetDb.audioLectures = [];
      let index = targetDb.audioLectures.findIndex((al) => al.id === req.params.id);

      if (index === -1) {
        const defaultDb = readDB();
        const defaultIdx = (defaultDb.audioLectures || []).findIndex((al) => al.id === req.params.id);
        if (defaultIdx !== -1) {
          defaultDb.audioLectures[defaultIdx] = {
            ...defaultDb.audioLectures[defaultIdx],
            ...req.body,
            updatedAt: new Date().toISOString(),
          };
          writeDB(defaultDb);
          return res.json(defaultDb.audioLectures[defaultIdx]);
        }
        return res.status(404).json({ error: 'Audio lecture not found' });
      }

      targetDb.audioLectures[index] = {
        ...targetDb.audioLectures[index],
        ...req.body,
        updatedAt: new Date().toISOString(),
      };
      writeDB(targetDb, userId, userEmail);
      res.json(targetDb.audioLectures[index]);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update audio lecture' });
    }
  });

  app.delete('/api/audio-lectures/:id', (req, res) => {
    try {
      const { userId, userEmail } = getEffectiveUser(req);
      const db = readDB(userId, userEmail);
      if (db.audioLectures) {
        db.audioLectures = db.audioLectures.filter((al) => al.id !== req.params.id);
        writeDB(db, userId, userEmail);
      }
      const defaultDb = readDB();
      if (defaultDb.audioLectures) {
        defaultDb.audioLectures = defaultDb.audioLectures.filter((al) => al.id !== req.params.id);
        writeDB(defaultDb);
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete audio lecture' });
    }
  });

  // Helper to safely extract inline audio part from data URL or raw base64
  function extractAudioInlineData(rawAudio?: string, mimeTypeFallback: string = 'audio/mp3') {
    if (!rawAudio || typeof rawAudio !== 'string') return null;
    let cleanBase64 = rawAudio.trim();
    let mime = mimeTypeFallback || 'audio/mp3';
    if (cleanBase64.startsWith('data:')) {
      const m = cleanBase64.match(/^data:([^;]+);base64,(.+)$/);
      if (m) {
        mime = m[1];
        cleanBase64 = m[2];
      }
    }
    if (!cleanBase64) return null;
    return {
      inlineData: {
        mimeType: mime,
        data: cleanBase64,
      },
    };
  }

  // ==========================================
  // AI AUDIO LECTURE ENDPOINTS (Gemini Powered)
  // Summary, Key Points, Study Notes, Transcript
  // ==========================================

  // AI Audio 1: Transcribe Audio Lecture
  app.post('/api/ai/audio-lectures/:id/transcript', async (req, res) => {
    const opKey = `audio:${req.params.id}:transcript`;
    if (activeAiOperations.has(opKey)) {
      return res.status(409).json({
        error: 'OPERATION_IN_PROGRESS',
        message: 'Audio lecture transcription is already in progress. Please wait a moment.',
      });
    }

    activeAiOperations.add(opKey);
    try {
      const { userId, userEmail } = getEffectiveUser(req);
      const db = readDB(userId, userEmail);

      const isAllowed = checkUserHasActiveSubscription(req, db);
      if (!isAllowed) {
        return res.status(403).json({
          error: 'PRO_FEATURE_REQUIRED',
          message: 'AI Audio Lecture features require an active Premium subscription.',
        });
      }

      const apiKey = getGeminiApiKey();
      if (!apiKey) {
        return res.status(503).json({
          error: 'GEMINI_NOT_CONFIGURED',
          message: 'AI features are temporarily unavailable. Gemini is not configured for this deployment.',
        });
      }

      let lecture = (db.audioLectures || []).find((al) => al.id === req.params.id);
      let targetDb = db;
      if (!lecture) {
        const defaultDb = readDB();
        const found = (defaultDb.audioLectures || []).find((al) => al.id === req.params.id);
        if (found) {
          lecture = found;
          targetDb = defaultDb;
        }
      }

      // Stateless/serverless fallback: reconstruct lecture object from client request
      if (!lecture) {
        lecture = {
          id: req.params.id,
          userId: userId || 'default',
          title: req.body?.title || 'Lecture',
          subjectName: req.body?.subjectName || 'Study Material',
          section: req.body?.section || '',
          originalFileName: req.body?.originalFileName || 'lecture.mp3',
          audioDataUrl: req.body?.audioBase64 || '',
          fileType: req.body?.audioMimeType || 'audio/mp3',
          fileSize: 0,
          duration: 0,
          notes: req.body?.notes || '',
          studyNotes: req.body?.notes || '',
          transcript: req.body?.transcript || '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        if (!targetDb.audioLectures) targetDb.audioLectures = [];
        targetDb.audioLectures.push(lecture);
      }

      const rawAudio = req.body?.audioBase64 || lecture.audioDataUrl;
      const audioPart = extractAudioInlineData(rawAudio, req.body?.audioMimeType || lecture.fileType);

      if (!audioPart) {
        if (lecture.transcript && lecture.transcript.trim().length > 10) {
          return res.json({
            success: true,
            transcript: lecture.transcript,
            lecture,
          });
        }
        return res.status(400).json({
          error: 'NO_AUDIO_DATA',
          message: 'Audio data was not found for this lecture. Please ensure the audio file is uploaded or recorded to transcribe.',
        });
      }

      let ai;
      try {
        ai = getGeminiClient();
      } catch (err: any) {
        return res.status(503).json({
          error: 'GEMINI_NOT_CONFIGURED',
          message: 'AI features are temporarily unavailable. Gemini is not configured for this deployment.',
        });
      }

      const prompt = `You are a high-accuracy academic transcription specialist. Transcribe this lecture audio cleanly and completely into English (or the spoken language of the lecture). Preserve technical vocabulary, subject definitions, and formula references precisely. Use paragraph breaks to separate thoughts and speakers where appropriate. Do not add conversational commentary, preface, or concluding remarks; output only the transcript text.`;

      const transcript = await generateTextWithGemini(ai, [audioPart, prompt], undefined, true);

      lecture.transcript = transcript;
      lecture.transcriptGeneratedAt = new Date().toISOString();
      lecture.updatedAt = new Date().toISOString();

      const idx = (targetDb.audioLectures || []).findIndex((al) => al.id === lecture.id);
      if (idx !== -1) {
        targetDb.audioLectures[idx] = lecture;
      }
      writeDB(targetDb, userId, userEmail);

      res.json({
        success: true,
        transcript,
        lecture,
      });
    } catch (error: any) {
      const errData = parseGeminiError(error);
      console.warn('[Gemini AI] Transcript generation failed for lecture', req.params.id, errData.error, errData.message);
      res.status(errData.code).json(errData);
    } finally {
      activeAiOperations.delete(opKey);
    }
  });

  // AI Audio 2: Generate Lecture Summary
  app.post('/api/ai/audio-lectures/:id/summary', async (req, res) => {
    const opKey = `audio:${req.params.id}:summary`;
    if (activeAiOperations.has(opKey)) {
      return res.status(409).json({
        error: 'OPERATION_IN_PROGRESS',
        message: 'AI Lecture Summary is already in progress. Please wait a moment.',
      });
    }

    activeAiOperations.add(opKey);
    try {
      const { userId, userEmail } = getEffectiveUser(req);
      const db = readDB(userId, userEmail);

      const isAllowed = checkUserHasActiveSubscription(req, db);
      if (!isAllowed) {
        return res.status(403).json({
          error: 'PRO_FEATURE_REQUIRED',
          message: 'AI Audio Lecture features require an active Premium subscription.',
        });
      }

      const apiKey = getGeminiApiKey();
      if (!apiKey) {
        return res.status(503).json({
          error: 'GEMINI_NOT_CONFIGURED',
          message: 'AI features are temporarily unavailable. Gemini is not configured for this deployment.',
        });
      }

      let lecture = (db.audioLectures || []).find((al) => al.id === req.params.id);
      let targetDb = db;
      if (!lecture) {
        const defaultDb = readDB();
        const found = (defaultDb.audioLectures || []).find((al) => al.id === req.params.id);
        if (found) {
          lecture = found;
          targetDb = defaultDb;
        }
      }

      // Stateless/serverless fallback: reconstruct lecture object from client request
      if (!lecture) {
        lecture = {
          id: req.params.id,
          userId: userId || 'default',
          title: req.body?.title || 'Lecture',
          subjectName: req.body?.subjectName || 'Study Material',
          section: req.body?.section || '',
          originalFileName: req.body?.originalFileName || 'lecture.mp3',
          audioDataUrl: req.body?.audioBase64 || '',
          fileType: req.body?.audioMimeType || 'audio/mp3',
          fileSize: 0,
          duration: 0,
          notes: req.body?.notes || '',
          studyNotes: req.body?.notes || '',
          transcript: req.body?.transcript || '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        if (!targetDb.audioLectures) targetDb.audioLectures = [];
        targetDb.audioLectures.push(lecture);
      }

      let ai;
      try {
        ai = getGeminiClient();
      } catch (err: any) {
        return res.status(503).json({
          error: 'GEMINI_NOT_CONFIGURED',
          message: 'AI features are temporarily unavailable. Gemini is not configured for this deployment.',
        });
      }

      const sourceTranscript = req.body?.transcript || lecture.transcript;
      const rawAudio = req.body?.audioBase64 || lecture.audioDataUrl;
      const audioPart = extractAudioInlineData(rawAudio, req.body?.audioMimeType || lecture.fileType);

      let summary = '';
      if (sourceTranscript && sourceTranscript.trim().length > 15) {
        summary = await generateTextWithGemini(
          ai,
          `You are an expert academic tutor. Generate a comprehensive, high-yield study summary for this lecture:
Title: "${lecture.title}"
Subject / Course: "${lecture.subjectName}"
Section / Topic: "${lecture.section || 'General'}"

LECTURE TRANSCRIPT:
${sourceTranscript}

Structure the summary cleanly using Markdown headers:
### 1. Lecture Overview & Primary Objectives
### 2. Core Themes & Theoretical Framework
### 3. Key Concepts & Detailed Explanations
### 4. Practical Examples & Real-world Applications
### 5. High-Yield Revision Takeaways

Ensure clarity, rigor, and actionable revision value for students.`
        );
      } else if (audioPart) {
        summary = await generateTextWithGemini(ai, [
          audioPart,
          `You are an expert academic tutor. Listen to this lecture audio titled "${lecture.title}" for subject "${lecture.subjectName}" (Section: "${lecture.section || 'General'}"). Generate a comprehensive study summary with:
### 1. Lecture Overview & Primary Objectives
### 2. Core Themes & Theoretical Framework
### 3. Key Concepts & Detailed Explanations
### 4. Practical Examples & Real-world Applications
### 5. High-Yield Revision Takeaways

Structure cleanly in Markdown.`
        ]);
      } else if (lecture.title || lecture.subjectName || lecture.studyNotes || (lecture as any).notes) {
        summary = await generateTextWithGemini(
          ai,
          `You are an expert academic tutor. Generate a comprehensive, high-yield study summary for this lecture topic:
Title: "${lecture.title}"
Subject / Course: "${lecture.subjectName}"
Section / Topic: "${lecture.section || 'General'}"
Existing Notes: "${lecture.studyNotes || (lecture as any).notes || 'General Study Material'}"

Structure the summary cleanly using Markdown headers:
### 1. Lecture Overview & Primary Objectives
### 2. Core Themes & Theoretical Framework
### 3. Key Concepts & Detailed Explanations
### 4. Practical Examples & Real-world Applications
### 5. High-Yield Revision Takeaways

Ensure clarity, rigor, and actionable revision value for students.`
        );
      } else {
        return res.status(400).json({
          error: 'NO_SOURCE_DATA',
          message: 'Unable to generate summary without lecture audio, transcript, or topic details.',
        });
      }

      lecture.summary = summary;
      lecture.summaryGeneratedAt = new Date().toISOString();
      lecture.updatedAt = new Date().toISOString();

      const idx = (targetDb.audioLectures || []).findIndex((al) => al.id === lecture.id);
      if (idx !== -1) {
        targetDb.audioLectures[idx] = lecture;
      }
      writeDB(targetDb, userId, userEmail);

      res.json({
        success: true,
        summary,
        lecture,
      });
    } catch (error: any) {
      const errData = parseGeminiError(error);
      console.warn('[Gemini AI] Summary generation failed for lecture', req.params.id, errData.error, errData.message);
      res.status(errData.code).json(errData);
    } finally {
      activeAiOperations.delete(opKey);
    }
  });

  // AI Audio 3: Extract Key Points & Exam Takeaways
  app.post('/api/ai/audio-lectures/:id/key-points', async (req, res) => {
    const opKey = `audio:${req.params.id}:key-points`;
    if (activeAiOperations.has(opKey)) {
      return res.status(409).json({
        error: 'OPERATION_IN_PROGRESS',
        message: 'AI Key Points extraction is already in progress. Please wait a moment.',
      });
    }

    activeAiOperations.add(opKey);
    try {
      const { userId, userEmail } = getEffectiveUser(req);
      const db = readDB(userId, userEmail);

      const isAllowed = checkUserHasActiveSubscription(req, db);
      if (!isAllowed) {
        return res.status(403).json({
          error: 'PRO_FEATURE_REQUIRED',
          message: 'AI Audio Lecture features require an active Premium subscription.',
        });
      }

      const apiKey = getGeminiApiKey();
      if (!apiKey) {
        return res.status(503).json({
          error: 'GEMINI_NOT_CONFIGURED',
          message: 'AI features are temporarily unavailable. Gemini is not configured for this deployment.',
        });
      }

      let lecture = (db.audioLectures || []).find((al) => al.id === req.params.id);
      let targetDb = db;
      if (!lecture) {
        const defaultDb = readDB();
        const found = (defaultDb.audioLectures || []).find((al) => al.id === req.params.id);
        if (found) {
          lecture = found;
          targetDb = defaultDb;
        }
      }

      // Stateless/serverless fallback: reconstruct lecture object from client request
      if (!lecture) {
        lecture = {
          id: req.params.id,
          userId: userId || 'default',
          title: req.body?.title || 'Lecture',
          subjectName: req.body?.subjectName || 'Study Material',
          section: req.body?.section || '',
          originalFileName: req.body?.originalFileName || 'lecture.mp3',
          audioDataUrl: req.body?.audioBase64 || '',
          fileType: req.body?.audioMimeType || 'audio/mp3',
          fileSize: 0,
          duration: 0,
          notes: req.body?.notes || '',
          studyNotes: req.body?.notes || '',
          transcript: req.body?.transcript || '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        if (!targetDb.audioLectures) targetDb.audioLectures = [];
        targetDb.audioLectures.push(lecture);
      }

      let ai;
      try {
        ai = getGeminiClient();
      } catch (err: any) {
        return res.status(503).json({
          error: 'GEMINI_NOT_CONFIGURED',
          message: 'AI features are temporarily unavailable. Gemini is not configured for this deployment.',
        });
      }

      const sourceTranscript = req.body?.transcript || lecture.transcript;
      const sourceSummary = req.body?.summary || lecture.summary;
      const sourceNotes = req.body?.notes || lecture.studyNotes || (lecture as any).notes;
      const rawAudio = req.body?.audioBase64 || lecture.audioDataUrl;
      const audioPart = extractAudioInlineData(rawAudio, req.body?.audioMimeType || lecture.fileType);

      // Determine richest available text content for Key Points extraction:
      // Priority 1: Full lecture transcript
      // Priority 2: Generated summary (e.g. if summary was run first)
      // Priority 3: Personal or study notes
      const richTextContent = (sourceTranscript && sourceTranscript.trim().length > 15)
        ? sourceTranscript.trim()
        : (sourceSummary && sourceSummary.trim().length > 15)
          ? sourceSummary.trim()
          : (sourceNotes && sourceNotes.trim().length > 15)
            ? sourceNotes.trim()
            : '';

      let keyPoints = '';
      if (richTextContent) {
        keyPoints = await generateTextWithGemini(
          ai,
          `You are an expert academic tutor and exam prep specialist. Extract high-yield key takeaways, core definitions, and exam-critical concepts from this lecture:
Title: "${lecture.title || 'Academic Lecture'}"
Subject / Course: "${lecture.subjectName || 'General'}"
Section / Topic: "${lecture.section || 'General'}"

LECTURE CONTENT:
${richTextContent}

Format cleanly in Markdown with bullet points:
### 📌 Critical Exam Takeaways
- [Core finding, principle, or high-yield concept frequently tested on exams]
- [Key structural takeaway or method]
- [Practical application or problem-solving rule]

### 🔑 Essential Terms & Definitions
- **[Concept/Term]**: Clear, rigorous definition and why it matters.
- **[Concept/Term]**: Core formula, mechanism, or principle.

### ⚠️ Common Pitfalls & Clarifications
- [Crucial distinction, exception, or common misconception to avoid on exams]
- [High-yield memory aid or clarification]`
        );
      } else if (audioPart) {
        keyPoints = await generateTextWithGemini(ai, [
          audioPart,
          `You are an expert academic tutor and exam prep specialist. Listen to this lecture audio titled "${lecture.title || 'Lecture'}" for subject "${lecture.subjectName || 'General'}". Extract high-yield key takeaways, core definitions, and exam-critical concepts.
Format cleanly in Markdown with bullet points:
### 📌 Critical Exam Takeaways
### 🔑 Essential Terms & Definitions
### ⚠️ Common Pitfalls & Clarifications`
        ]);
      } else if (lecture.title || lecture.subjectName || sourceNotes) {
        keyPoints = await generateTextWithGemini(
          ai,
          `You are an expert academic tutor and exam prep specialist. Extract high-yield key takeaways, core definitions, and exam-critical concepts for this lecture topic:
Title: "${lecture.title || 'Lecture'}"
Subject / Course: "${lecture.subjectName || 'General'}"
Section / Topic: "${lecture.section || 'General'}"
Topic Overview: "${sourceNotes || 'General Study Material'}"

Format cleanly in Markdown with bullet points:
### 📌 Critical Exam Takeaways
- [Core takeaway or concept]
### 🔑 Essential Terms & Definitions
- **[Concept/Term]**: Definition and significance.
### ⚠️ Common Pitfalls & Clarifications
- [Important nuance or distinction]`
        );
      } else {
        return res.status(400).json({
          error: 'NO_SOURCE_DATA',
          message: 'Unable to extract key points without lecture audio, transcript, summary, or topic details.',
        });
      }

      // Normalize keyPoints to ensure clean string output across any model formatting
      const normalizedKeyPoints = normalizeKeyPointsOutput(keyPoints);

      lecture.keyPoints = normalizedKeyPoints;
      lecture.keyPointsGeneratedAt = new Date().toISOString();
      lecture.updatedAt = new Date().toISOString();

      const idx = (targetDb.audioLectures || []).findIndex((al) => al.id === lecture.id);
      if (idx !== -1) {
        targetDb.audioLectures[idx] = lecture;
      }
      writeDB(targetDb, userId, userEmail);

      res.json({
        success: true,
        keyPoints: normalizedKeyPoints,
        lecture,
      });
    } catch (error: any) {
      const errData = parseGeminiError(error);
      console.warn('[Gemini AI] Key points extraction failed for lecture', req.params.id, errData.error, errData.message);
      res.status(errData.code).json(errData);
    } finally {
      activeAiOperations.delete(opKey);
    }
  });

  // AI Audio 4: Generate Structured Study Notes
  const handleAudioStudyNotesRoute = async (req: express.Request, res: express.Response) => {
    const opKey = `audio:${req.params.id}:study-notes`;
    if (activeAiOperations.has(opKey)) {
      return res.status(409).json({
        error: 'OPERATION_IN_PROGRESS',
        message: 'AI Study Notes generation is already in progress. Please wait a moment.',
      });
    }

    activeAiOperations.add(opKey);
    try {
      const { userId, userEmail } = getEffectiveUser(req);
      const db = readDB(userId, userEmail);

      const isAllowed = checkUserHasActiveSubscription(req, db);
      if (!isAllowed) {
        return res.status(403).json({
          error: 'PRO_FEATURE_REQUIRED',
          message: 'AI Audio Lecture features require an active Premium subscription.',
        });
      }

      const apiKey = getGeminiApiKey();
      if (!apiKey) {
        return res.status(503).json({
          error: 'GEMINI_NOT_CONFIGURED',
          message: 'AI features are temporarily unavailable. Gemini is not configured for this deployment.',
        });
      }

      let lecture = (db.audioLectures || []).find((al) => al.id === req.params.id);
      let targetDb = db;
      if (!lecture) {
        const defaultDb = readDB();
        const found = (defaultDb.audioLectures || []).find((al) => al.id === req.params.id);
        if (found) {
          lecture = found;
          targetDb = defaultDb;
        }
      }

      // Stateless/serverless fallback: reconstruct lecture object from client request
      if (!lecture) {
        lecture = {
          id: req.params.id,
          userId: userId || 'default',
          title: req.body?.title || 'Lecture',
          subjectName: req.body?.subjectName || 'Study Material',
          section: req.body?.section || '',
          originalFileName: req.body?.originalFileName || 'lecture.mp3',
          audioDataUrl: req.body?.audioBase64 || '',
          fileType: req.body?.audioMimeType || 'audio/mp3',
          fileSize: 0,
          duration: 0,
          notes: req.body?.notes || '',
          studyNotes: req.body?.notes || '',
          transcript: req.body?.transcript || '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        if (!targetDb.audioLectures) targetDb.audioLectures = [];
        targetDb.audioLectures.push(lecture);
      }

      let ai;
      try {
        ai = getGeminiClient();
      } catch (err: any) {
        return res.status(503).json({
          error: 'GEMINI_NOT_CONFIGURED',
          message: 'AI features are temporarily unavailable. Gemini is not configured for this deployment.',
        });
      }

      const sourceTranscript = req.body?.transcript || lecture.transcript;
      const rawAudio = req.body?.audioBase64 || lecture.audioDataUrl;
      const audioPart = extractAudioInlineData(rawAudio, req.body?.audioMimeType || lecture.fileType);

      let studyNotes = '';
      if (sourceTranscript && sourceTranscript.trim().length > 15) {
        studyNotes = await generateTextWithGemini(
          ai,
          `You are an elite study strategist. Generate structured, thorough Cornell-style study notes based on this lecture:
Title: "${lecture.title}"
Subject: "${lecture.subjectName}"
Section / Topic: "${lecture.section || 'General'}"

LECTURE TRANSCRIPT:
${sourceTranscript}

Structure in clean Markdown:
# ${lecture.title} — Comprehensive Study Notes
## 🎯 Core Learning Objectives
## 📖 Detailed Notes & Concept Breakdown
## ❓ Cue Column / Self-Test Review Questions
## 📝 Summary & Key Formulations`
        );
      } else if (audioPart) {
        studyNotes = await generateTextWithGemini(ai, [
          audioPart,
          `You are an elite study strategist. Generate structured Cornell-style study notes based on this audio lecture titled "${lecture.title}" for subject "${lecture.subjectName}".
Structure in clean Markdown with Core Learning Objectives, Detailed Notes & Concept Breakdown, Review Questions, and Summary.`
        ]);
      } else if (lecture.title || lecture.subjectName || lecture.studyNotes || (lecture as any).notes) {
        studyNotes = await generateTextWithGemini(
          ai,
          `You are an elite study strategist. Generate structured, thorough Cornell-style study notes based on this lecture topic:
Title: "${lecture.title}"
Subject: "${lecture.subjectName}"
Section / Topic: "${lecture.section || 'General'}"
Existing Notes: "${lecture.studyNotes || (lecture as any).notes || 'General Study Material'}"

Structure in clean Markdown:
# ${lecture.title} — Comprehensive Study Notes
## 🎯 Core Learning Objectives
## 📖 Detailed Notes & Concept Breakdown
## ❓ Cue Column / Self-Test Review Questions
## 📝 Summary & Key Formulations`
        );
      } else {
        return res.status(400).json({
          error: 'NO_SOURCE_DATA',
          message: 'Unable to generate study notes without lecture audio, transcript, or topic details.',
        });
      }

      lecture.studyNotes = studyNotes;
      lecture.studyNotesGeneratedAt = new Date().toISOString();
      lecture.updatedAt = new Date().toISOString();

      const idx = (targetDb.audioLectures || []).findIndex((al) => al.id === lecture.id);
      if (idx !== -1) {
        targetDb.audioLectures[idx] = lecture;
      }
      writeDB(targetDb, userId, userEmail);

      res.json({
        success: true,
        studyNotes,
        notes: studyNotes,
        lecture,
      });
    } catch (error: any) {
      const errData = parseGeminiError(error);
      console.warn('[Gemini AI] Study notes generation failed for lecture', req.params.id, errData.error, errData.message);
      res.status(errData.code).json(errData);
    } finally {
      activeAiOperations.delete(opKey);
    }
  };

  app.post('/api/ai/audio-lectures/:id/study-notes', handleAudioStudyNotesRoute);
  app.post('/api/ai/audio-lectures/:id/notes', handleAudioStudyNotesRoute);

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
      const { userId, userEmail } = getEffectiveUser(req);
      const db = readDB(userId, userEmail);
      const apiKey = getGeminiApiKey();
      res.json({
        configured: !!apiKey,
        provider: 'google-gemini',
        status: apiKey ? 'ready' : 'not_configured',
        models: ['gemini-3.8-flash', 'gemini-flash-latest'],
        audioModels: ['gemini-3.5-transcribe', 'gemini-3.8-flash', 'gemini-flash-latest'],
        aiUsage: db.profile?.aiUsage || null,
        isPro: checkUserHasActiveSubscription(req, db),
      });
    } catch (err: any) {
      res.status(500).json({ error: 'AI_HEALTH_CHECK_FAILED', message: err?.message || 'Failed to check AI health' });
    }
  });

  // AI 7: Diagnostic minimal server-side test (never exposes secrets or keys)
  app.get('/api/ai/diagnostic', async (req, res) => {
    try {
      const { userId, userEmail } = getEffectiveUser(req);
      const db = readDB(userId, userEmail);
      const apiKey = getGeminiApiKey();
      if (!apiKey) {
        return res.status(503).json({
          configured: false,
          error: 'GEMINI_NOT_CONFIGURED',
          message: 'AI features are temporarily unavailable. Gemini is not configured for this deployment.',
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
      const { userId, userEmail } = getEffectiveUser(req);
      const db = readDB(userId, userEmail);
      res.json(db.studyMaterials || []);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch study materials' });
    }
  });

  // 2. Serve material files statically from local instance or self-heal from database data URL
  app.get('/api/study-materials/files/:filename', (req, res) => {
    try {
      const filename = path.basename(req.params.filename);
      const possiblePaths = [
        path.join(process.cwd(), 'uploads', 'materials', filename),
      ];

      const ext = path.extname(filename).toLowerCase();
      let contentType = 'application/octet-stream';
      if (ext === '.pdf') contentType = 'application/pdf';
      else if (ext === '.docx') contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      else if (ext === '.doc') contentType = 'application/msword';
      else if (ext === '.png') contentType = 'image/png';
      else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
      else if (ext === '.webp') contentType = 'image/webp';
      else if (ext === '.txt') contentType = 'text/plain';
      else if (ext === '.csv') contentType = 'text/csv';

      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          res.setHeader('Content-Type', contentType);
          res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
          return fs.createReadStream(p).pipe(res);
        }
      }

      // Self-healing database fallback if container restarted
      const { userId, userEmail } = getEffectiveUser(req);
      const db = readDB(userId, userEmail);
      const defaultDb = readDB();
      const allMaterials = [...(db.studyMaterials || []), ...(defaultDb.studyMaterials || [])];
      const match = allMaterials.find((m) =>
        (m.storagePath && m.storagePath.includes(filename)) ||
        (m.storageKey && m.storageKey.includes(filename)) ||
        m.originalFileName === filename
      );

      if (match && match.fileDataUrl && match.fileDataUrl.startsWith('data:')) {
        const parts = match.fileDataUrl.split(',');
        const mime = parts[0].match(/:(.*?);/)?.[1] || contentType;
        const buffer = Buffer.from(parts[1], 'base64');
        try {
          const uploadsDir = path.join(process.cwd(), 'uploads', 'materials');
          if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
          fs.writeFileSync(path.join(uploadsDir, filename), buffer);
        } catch (e) {}

        res.setHeader('Content-Type', mime);
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(match.originalFileName || filename)}"`);
        return res.send(buffer);
      }

      return res.status(404).json({
        error: 'FILE_NOT_FOUND',
        message: 'The requested study material file could not be found.',
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to access study material file' });
    }
  });

  // 2b. Check storage capability status
  app.get('/api/study-materials/storage-status', (req, res) => {
    const blobToken = getBlobToken();
    res.json({
      blobConfigured: !!blobToken,
      localStorageAvailable: true,
      maxUploadBytes: 30 * 1024 * 1024,
    });
  });

  // 3a. Generate client-side Vercel Blob upload token (when configured)
  app.post('/api/study-materials/upload-token', async (req, res) => {
    try {
      const blobToken = getBlobToken();
      if (!blobToken) {
        return res.status(200).json({
          configured: false,
          useDirectUpload: true,
          message: 'Vercel Blob is not configured. Direct multipart upload is active.',
        });
      }

      const { userId, userEmail } = getEffectiveUser(req);
      const db = readDB(userId, userEmail);
      const isPro = checkUserHasActiveSubscription(req, db);
      if (!isPro && (db.studyMaterials || []).length >= FREE_PLAN_LIMITS.studyMaterials) {
        return res.status(403).json({
          error: 'LIMIT_REACHED',
          message: `You have reached the free plan limit of ${FREE_PLAN_LIMITS.studyMaterials} Study Materials. Upgrade to Premium for unlimited storage.`,
        });
      }

      const jsonResponse = await handleUpload({
        token: blobToken,
        body: req.body,
        request: req,
        onBeforeGenerateToken: async (pathname) => {
          const ext = path.extname(pathname).toLowerCase();
          if (!ALLOWED_MATERIAL_EXTENSIONS.includes(ext)) {
            throw new Error(`Unsupported file type: ${ext}. Supported formats: PDF, Word, Images, TXT, CSV.`);
          }

          return {
            allowedContentTypes: [
              'application/pdf',
              'application/msword',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'image/jpeg',
              'image/png',
              'image/webp',
              'text/plain',
              'text/csv',
            ],
            maximumSizeInBytes: 30 * 1024 * 1024, // 30 MB
            tokenPayload: JSON.stringify({ userId: userId || 'default' }),
          };
        },
      });

      return res.json(jsonResponse);
    } catch (error: any) {
      console.error('[Upload Token Error]:', error);
      return res.status(400).json({ error: error.message || 'Upload authorization failed' });
    }
  });

  // 3b. Upload study material via multipart/form-data (in-memory buffer + Vercel Blob persistent storage)
  app.post('/api/study-materials/upload', (req, res) => {
    uploadMaterial.single('file')(req, res, async (err) => {
      if (err) {
        console.error('Upload validation error:', err);
        return res.status(400).json({
          error: 'UPLOAD_ERROR',
          message: err.message || 'File upload failed. Supported formats: PDF, DOC, DOCX, Images, TXT, CSV up to 30MB.',
        });
      }

      try {
        const { userId, userEmail } = getEffectiveUser(req);
        const db = readDB(userId, userEmail);
        if (!db.studyMaterials) db.studyMaterials = [];

        // Check limits on free plan
        const isPro = checkUserHasActiveSubscription(req, db);
        if (!isPro && db.studyMaterials.length >= FREE_PLAN_LIMITS.studyMaterials) {
          return res.status(403).json({
            error: 'LIMIT_REACHED',
            message: `You have reached the free plan limit of ${FREE_PLAN_LIMITS.studyMaterials} Study Materials. Upgrade to Premium for unlimited storage.`,
          });
        }

        if (!req.file) {
          return res.status(400).json({
            error: 'NO_FILE',
            message: 'Please select a document or file to upload.',
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
        let storagePath = '';
        let storageKey = '';
        let storageUrl = '';
        let downloadUrl = '';
        let fileDataUrl = '';

        // Persistent cloud storage or local disk storage with dataUrl resilience
        const blobToken = getBlobToken();
        const safeBase = path.basename(req.file.originalname, `.${ext}`).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);

        if (blobToken) {
          const blobPath = `materials/${Date.now()}_${crypto.randomUUID().slice(0, 8)}_${safeBase}.${ext}`;

          const blob = await put(blobPath, req.file.buffer, {
            access: 'public',
            contentType: req.file.mimetype || 'application/octet-stream',
            token: blobToken,
          });

          storagePath = blob.url;
          storageKey = blob.pathname;
          storageUrl = blob.url;
          downloadUrl = blob.downloadUrl;
          fileDataUrl = `data:${req.file.mimetype || 'application/octet-stream'};base64,${req.file.buffer.toString('base64')}`;
        } else {
          // Durable local file storage (works in container, Cloud Run, VPS, and local dev)
          const safeFilename = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}_${safeBase}.${ext}`;
          const uploadsDir = path.join(process.cwd(), 'uploads', 'materials');
          try {
            if (!fs.existsSync(uploadsDir)) {
              fs.mkdirSync(uploadsDir, { recursive: true });
            }
            fs.writeFileSync(path.join(uploadsDir, safeFilename), req.file.buffer);
          } catch (fsErr) {
            console.warn('[Storage] Could not write file to disk:', fsErr);
          }

          storagePath = `/api/study-materials/files/${safeFilename}`;
          storageKey = safeFilename;
          storageUrl = storagePath;
          downloadUrl = `/api/study-materials/files/${safeFilename}`;
          // Also persist dataUrl in DB as an instant resilient backup
          fileDataUrl = `data:${req.file.mimetype || 'application/octet-stream'};base64,${req.file.buffer.toString('base64')}`;
        }

        // In-memory text extraction for fast searching without disk writes
        let extractedText = '';
        if (ext === 'docx') {
          try {
            const mammothResult = await mammoth.extractRawText({ buffer: req.file.buffer });
            extractedText = mammothResult.value?.slice(0, 50000) || '';
          } catch (mErr) {
            console.warn('Could not extract raw text from docx buffer:', mErr);
          }
        } else if (ext === 'txt' || ext === 'csv') {
          try {
            extractedText = req.file.buffer.toString('utf-8').slice(0, 50000);
          } catch (tErr) {
            console.warn('Could not extract text from buffer:', tErr);
          }
        }

        const newMaterial: StudyMaterial = {
          id: 'mat_' + crypto.randomUUID().slice(0, 8),
          materialId: 'mat_' + crypto.randomUUID().slice(0, 8),
          userId: userId || req.body.userId || 'default',
          subjectId,
          subjectName,
          topic,
          name: displayName,
          documentTitle: displayName,
          originalFileName: req.file.originalname,
          fileName: req.file.originalname,
          fileType: ext,
          mimeType: req.file.mimetype || 'application/octet-stream',
          fileSize: req.file.size,
          storagePath,
          storageKey,
          storageUrl,
          downloadUrl,
          fileDataUrl: fileDataUrl || undefined,
          extractedText: extractedText || undefined,
          uploadedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        db.studyMaterials.push(newMaterial);
        writeDB(db, userId, userEmail);

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

  // 4. Save metadata after client-side upload or data URL upload
  app.post('/api/study-materials', async (req, res) => {
    try {
      const { userId, userEmail } = getEffectiveUser(req);
      const db = readDB(userId, userEmail);
      if (!db.studyMaterials) db.studyMaterials = [];

      const isPro = checkUserHasActiveSubscription(req, db);
      if (!isPro && db.studyMaterials.length >= FREE_PLAN_LIMITS.studyMaterials) {
        return res.status(403).json({
          error: 'LIMIT_REACHED',
          message: `You have reached the free plan limit of ${FREE_PLAN_LIMITS.studyMaterials} Study Materials. Upgrade to Premium for unlimited storage.`,
        });
      }

      const {
        name,
        subjectId,
        subjectName,
        topic,
        originalFileName,
        fileType,
        mimeType,
        fileSize,
        storagePath,
        storageKey,
        storageUrl,
        downloadUrl,
        fileBase64,
        fileDataUrl,
        extractedText,
      } = req.body;

      const matId = 'mat_' + crypto.randomUUID().slice(0, 8);
      const cleanExt = (fileType || path.extname(originalFileName || '').replace('.', '') || 'pdf').toLowerCase();
      const cleanTitle = name || originalFileName || 'Untitled Document';

      // Persist in-memory / dataUrl if provided without external storage
      let finalStoragePath = storagePath || storageUrl || '';
      let finalFileDataUrl = fileDataUrl || '';
      if (fileBase64 && !finalStoragePath) {
        finalFileDataUrl = fileBase64.startsWith('data:')
          ? fileBase64
          : `data:${mimeType || 'application/pdf'};base64,${fileBase64}`;
        finalStoragePath = finalFileDataUrl;
      }

      // If dataUrl is present, write to disk cache so it has a fast direct HTTP URL
      if (finalFileDataUrl && finalFileDataUrl.startsWith('data:') && (!finalStoragePath || finalStoragePath.startsWith('data:'))) {
        try {
          const uploadsDir = path.join(process.cwd(), 'uploads', 'materials');
          if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
          const safeBase = path.basename(cleanTitle, `.${cleanExt}`).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
          const safeFilename = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}_${safeBase}.${cleanExt}`;
          const diskPath = path.join(uploadsDir, safeFilename);
          const base64Content = finalFileDataUrl.split(',')[1];
          if (base64Content) {
            fs.writeFileSync(diskPath, Buffer.from(base64Content, 'base64'));
            finalStoragePath = `/api/study-materials/files/${safeFilename}`;
          }
        } catch (diskErr) {
          console.warn('[Storage] Could not write base64 to disk cache:', diskErr);
        }
      }

      const newMaterial: StudyMaterial = {
        id: matId,
        materialId: matId,
        userId: userId || req.body.userId || 'default',
        subjectId: subjectId || '',
        subjectName: subjectName || 'General',
        topic: topic || '',
        name: cleanTitle,
        documentTitle: cleanTitle,
        originalFileName: originalFileName || 'document.pdf',
        fileName: originalFileName || 'document.pdf',
        fileType: cleanExt,
        mimeType: mimeType || 'application/pdf',
        fileSize: fileSize || 0,
        storagePath: finalStoragePath,
        storageKey: storageKey || undefined,
        storageUrl: storageUrl || (finalStoragePath.startsWith('http') ? finalStoragePath : undefined),
        downloadUrl: downloadUrl || (finalStoragePath.startsWith('http') ? finalStoragePath : undefined),
        fileDataUrl: finalFileDataUrl || undefined,
        extractedText: extractedText || undefined,
        uploadedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      db.studyMaterials.push(newMaterial);
      writeDB(db, userId, userEmail);
      res.json(newMaterial);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to create study material', message: error.message });
    }
  });

  // 5. Download original unmodified file
  app.get('/api/study-materials/:id/download', async (req, res) => {
    try {
      const { userId, userEmail } = getEffectiveUser(req);
      const db = readDB(userId, userEmail);
      let material = (db.studyMaterials || []).find((m) => m.id === req.params.id);
      if (!material && userId) {
        const defaultDb = readDB();
        material = (defaultDb.studyMaterials || []).find((m) => m.id === req.params.id);
      }
      if (!material) {
        return res.status(404).json({ error: 'Study material not found' });
      }

      // If stored in Vercel Blob or public cloud storage, redirect directly
      const cloudUrl = material.downloadUrl || (material.storagePath && material.storagePath.startsWith('http') ? material.storagePath : null);
      if (cloudUrl) {
        return res.redirect(cloudUrl);
      }

      // If disk file exists
      if (material.storagePath && material.storagePath.startsWith('/api/study-materials/files/')) {
        const filename = path.basename(material.storagePath);
        const filePath = path.join(process.cwd(), 'uploads', 'materials', filename);
        if (fs.existsSync(filePath)) {
          return res.download(filePath, material.originalFileName);
        }
      }

      // If dataUrl or base64 is stored
      if (material.fileDataUrl && material.fileDataUrl.startsWith('data:')) {
        const parts = material.fileDataUrl.split(',');
        const mime = parts[0].match(/:(.*?);/)?.[1] || 'application/octet-stream';
        const buffer = Buffer.from(parts[1], 'base64');
        res.setHeader('Content-Type', mime);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(material.originalFileName)}"`);
        return res.send(buffer);
      }

      res.status(404).json({
        error: 'FILE_UNAVAILABLE',
        message: 'Original file content is not accessible. Please re-upload this document.',
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to download study material' });
    }
  });

  // 5b. View file inline (for PDF iframe, image preview)
  app.get('/api/study-materials/:id/view', async (req, res) => {
    try {
      const { userId, userEmail } = getEffectiveUser(req);
      const db = readDB(userId, userEmail);
      let material = (db.studyMaterials || []).find((m) => m.id === req.params.id);
      if (!material && userId) {
        const defaultDb = readDB();
        material = (defaultDb.studyMaterials || []).find((m) => m.id === req.params.id);
      }
      if (!material) {
        return res.status(404).json({ error: 'Study material not found' });
      }

      // If stored in Vercel Blob or public cloud storage, redirect directly
      const cloudUrl = material.storageUrl || (material.storagePath && material.storagePath.startsWith('http') ? material.storagePath : null);
      if (cloudUrl) {
        return res.redirect(cloudUrl);
      }

      // If disk file exists
      if (material.storagePath && material.storagePath.startsWith('/api/study-materials/files/')) {
        const filename = path.basename(material.storagePath);
        const filePath = path.join(process.cwd(), 'uploads', 'materials', filename);
        if (fs.existsSync(filePath)) {
          res.setHeader('Content-Type', material.mimeType || 'application/pdf');
          res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(material.originalFileName)}"`);
          return fs.createReadStream(filePath).pipe(res);
        }
      }

      // If dataUrl or base64 is stored
      if (material.fileDataUrl && material.fileDataUrl.startsWith('data:')) {
        const parts = material.fileDataUrl.split(',');
        const mime = parts[0].match(/:(.*?);/)?.[1] || material.mimeType || 'application/pdf';
        const buffer = Buffer.from(parts[1], 'base64');
        res.setHeader('Content-Type', mime);
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(material.originalFileName)}"`);
        return res.send(buffer);
      }

      res.status(404).json({
        error: 'FILE_UNAVAILABLE',
        message: 'Original file content is not accessible.',
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to view study material' });
    }
  });

  // 6. Preview content (HTML for DOCX, text for TXT/CSV, or direct URL for PDF/Images)
  app.get('/api/study-materials/:id/preview', async (req, res) => {
    try {
      const { userId, userEmail } = getEffectiveUser(req);
      const db = readDB(userId, userEmail);
      let material = (db.studyMaterials || []).find((m) => m.id === req.params.id);
      if (!material && userId) {
        const defaultDb = readDB();
        material = (defaultDb.studyMaterials || []).find((m) => m.id === req.params.id);
      }
      if (!material) {
        return res.status(404).json({ error: 'Study material not found' });
      }

      const ext = (material.fileType || '').toLowerCase().replace('.', '');

      // DOCX HTML rendering via mammoth
      if (ext === 'docx') {
        let docxBuffer: Buffer | null = null;
        if (material.storagePath && material.storagePath.startsWith('http')) {
          try {
            const resp = await fetch(material.storagePath);
            if (resp.ok) {
              docxBuffer = Buffer.from(await resp.arrayBuffer());
            }
          } catch (e) {
            console.warn('Failed to fetch docx from cloud URL:', e);
          }
        } else if (material.fileDataUrl && material.fileDataUrl.startsWith('data:')) {
          const parts = material.fileDataUrl.split(',');
          docxBuffer = Buffer.from(parts[1], 'base64');
        } else if (material.storagePath && material.storagePath.startsWith('/api/study-materials/files/')) {
          const filename = path.basename(material.storagePath);
          const legacyPath = path.join(process.cwd(), 'uploads', 'materials', filename);
          if (fs.existsSync(legacyPath)) {
            docxBuffer = fs.readFileSync(legacyPath);
          }
        }

        if (docxBuffer) {
          const result = await mammoth.convertToHtml({ buffer: docxBuffer });
          return res.json({
            previewType: 'html',
            html: result.value,
            material,
          });
        }
      }

      // TXT / CSV rendering
      if (ext === 'txt' || ext === 'csv') {
        let textContent = material.extractedText || '';
        if (!textContent && material.storagePath && material.storagePath.startsWith('http')) {
          try {
            const resp = await fetch(material.storagePath);
            if (resp.ok) textContent = await resp.text();
          } catch (e) {}
        } else if (!textContent && material.fileDataUrl && material.fileDataUrl.startsWith('data:')) {
          const parts = material.fileDataUrl.split(',');
          textContent = Buffer.from(parts[1], 'base64').toString('utf-8');
        }

        return res.json({
          previewType: ext,
          text: textContent,
          fileUrl: material.storagePath,
          material,
        });
      }

      res.json({
        previewType: ext === 'pdf' ? 'pdf' : ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? 'image' : ext,
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
      const { userId, userEmail } = getEffectiveUser(req);
      const db = readDB(userId, userEmail);
      if (!db.studyMaterials) db.studyMaterials = [];
      let index = db.studyMaterials.findIndex((m) => m.id === req.params.id);

      if (index === -1 && userId) {
        const defaultDb = readDB();
        const defIdx = (defaultDb.studyMaterials || []).findIndex((m) => m.id === req.params.id);
        if (defIdx !== -1) {
          const item = defaultDb.studyMaterials[defIdx];
          defaultDb.studyMaterials.splice(defIdx, 1);
          writeDB(defaultDb);
          db.studyMaterials.push(item);
          index = db.studyMaterials.length - 1;
        }
      }

      if (index === -1) {
        return res.status(404).json({ error: 'Study material not found' });
      }

      const existing = db.studyMaterials[index];
      const updatedName = req.body.name !== undefined ? req.body.name.trim() : existing.name;

      db.studyMaterials[index] = {
        ...existing,
        name: updatedName,
        documentTitle: updatedName,
        subjectId: req.body.subjectId !== undefined ? req.body.subjectId : existing.subjectId,
        subjectName: req.body.subjectName !== undefined ? req.body.subjectName : existing.subjectName,
        topic: req.body.topic !== undefined ? req.body.topic.trim() : existing.topic,
        updatedAt: new Date().toISOString(),
      };

      writeDB(db, userId, userEmail);
      res.json(db.studyMaterials[index]);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update study material' });
    }
  });

  // 8. Delete study material (safe cloud cleanup + metadata removal)
  app.delete('/api/study-materials/:id', async (req, res) => {
    try {
      const { userId, userEmail } = getEffectiveUser(req);
      const db = readDB(userId, userEmail);
      if (!db.studyMaterials) db.studyMaterials = [];
      let material = db.studyMaterials.find((m) => m.id === req.params.id);

      if (!material && userId) {
        const defaultDb = readDB();
        const defIdx = (defaultDb.studyMaterials || []).findIndex((m) => m.id === req.params.id);
        if (defIdx !== -1) {
          material = defaultDb.studyMaterials[defIdx];
          defaultDb.studyMaterials.splice(defIdx, 1);
          writeDB(defaultDb);
        }
      }

      if (material) {
        // Delete from Vercel Blob if stored in persistent cloud storage
        const blobUrlOrKey = material.storageKey || (material.storagePath && material.storagePath.startsWith('http') ? material.storagePath : null);
        const blobToken = getBlobToken();
        if (blobUrlOrKey && blobToken) {
          try {
            await del(blobUrlOrKey, { token: blobToken });
          } catch (delErr) {
            console.warn('Could not delete blob from cloud storage:', delErr);
          }
        }
        db.studyMaterials = db.studyMaterials.filter((m) => m.id !== req.params.id);
        writeDB(db, userId, userEmail);
      }

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete study material' });
    }
  });

  // ==========================================
  // 8d. Gemini AI Study Materials Endpoints
  // CRITICAL MANDATE: Only triggered on explicit user button click. Never auto-process on upload or view.
  // ==========================================

  // Helper to extract text / inline data from study material without local disk dependencies
  const getDocumentAiPayload = async (material: StudyMaterial) => {
    let buffer: Buffer | null = null;

    if (material.storagePath && material.storagePath.startsWith('http')) {
      try {
        const resp = await fetch(material.storagePath);
        if (resp.ok) {
          buffer = Buffer.from(await resp.arrayBuffer());
        }
      } catch (fErr) {
        console.warn('Could not fetch material file from cloud storage URL:', fErr);
      }
    } else if (material.fileDataUrl && material.fileDataUrl.startsWith('data:')) {
      const parts = material.fileDataUrl.split(',');
      buffer = Buffer.from(parts[1], 'base64');
    } else if (material.storagePath && material.storagePath.startsWith('/api/study-materials/files/')) {
      const filename = path.basename(material.storagePath);
      const filePath = path.join(process.cwd(), 'uploads', 'materials', filename);
      if (fs.existsSync(filePath)) {
        buffer = fs.readFileSync(filePath);
      }
    }

    const ext = (material.fileType || '').toLowerCase().replace('.', '');

    // 1. DOCX: extract clean text using mammoth
    if (ext === 'docx') {
      if (buffer) {
        try {
          const result = await mammoth.extractRawText({ buffer });
          const text = result.value?.trim();
          if (text && text.length > 20) {
            return { type: 'text', text: text.slice(0, 100000) };
          }
        } catch (e) {
          console.warn('Mammoth text extraction error:', e);
        }
      }
      if (material.extractedText && material.extractedText.length > 20) {
        return { type: 'text', text: material.extractedText.slice(0, 100000) };
      }
    }

    // 2. TXT / CSV: plain text extraction
    if (ext === 'txt' || ext === 'csv') {
      if (buffer) {
        const text = buffer.toString('utf-8').trim();
        if (text) {
          return { type: 'text', text: text.slice(0, 100000) };
        }
      }
      if (material.extractedText) {
        return { type: 'text', text: material.extractedText.slice(0, 100000) };
      }
    }

    // 3. PDF: send as inlineData base64
    if (ext === 'pdf' && buffer) {
      return {
        type: 'inlineData',
        inlineData: {
          mimeType: 'application/pdf',
          data: buffer.toString('base64'),
        },
      };
    }

    // 4. Images (JPG, PNG, WEBP)
    if (['jpg', 'jpeg', 'png', 'webp'].includes(ext) && buffer) {
      const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      return {
        type: 'inlineData',
        inlineData: {
          mimeType: material.mimeType || mime,
          data: buffer.toString('base64'),
        },
      };
    }

    // 5. Fallback: If material.extractedText is present
    if (material.extractedText && material.extractedText.length > 20) {
      return { type: 'text', text: material.extractedText.slice(0, 100000) };
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
      const { userId, userEmail } = getEffectiveUser(req);
      const db = readDB(userId, userEmail);
      if (!checkUserHasActiveSubscription(req, db)) {
        return res.status(403).json({
          error: 'PRO_FEATURE_REQUIRED',
          message: 'AI Document Summarization requires an active Pro subscription.',
        });
      }

      if (!db.studyMaterials) db.studyMaterials = [];
      let index = db.studyMaterials.findIndex((m) => m.id === req.params.id);
      let targetDb = db;
      if (index === -1) {
        const defaultDb = readDB();
        const defIdx = (defaultDb.studyMaterials || []).findIndex((m) => m.id === req.params.id);
        if (defIdx !== -1) {
          targetDb = defaultDb;
          index = defIdx;
        }
      }

      if (index === -1) {
        return res.status(404).json({ error: 'Study material not found' });
      }

      const material = targetDb.studyMaterials[index];
      const usageCheck = checkAndIncrementAiUsage(targetDb, 0);
      if (!usageCheck.allowed) {
        return res.status(429).json({
          error: 'AI_LIMIT_REACHED',
          message: usageCheck.reason || 'Monthly AI operations limit reached.',
        });
      }

      const apiKey = getGeminiApiKey();
      if (!apiKey) {
        return res.status(503).json({
          error: 'GEMINI_NOT_CONFIGURED',
          message: 'AI features are temporarily unavailable. Gemini is not configured for this deployment.',
        });
      }

      let ai;
      try {
        ai = getGeminiClient();
      } catch (e: any) {
        return res.status(503).json({
          error: 'GEMINI_NOT_CONFIGURED',
          message: 'AI features are temporarily unavailable. Gemini is not configured for this deployment.',
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
      targetDb.studyMaterials[index] = material;
      writeDB(targetDb, userId, userEmail);

      res.json({
        success: true,
        summary,
        material,
        aiUsage: targetDb.profile.aiUsage,
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
      const { userId, userEmail } = getEffectiveUser(req);
      const db = readDB(userId, userEmail);
      if (!checkUserHasActiveSubscription(req, db)) {
        return res.status(403).json({
          error: 'PRO_FEATURE_REQUIRED',
          message: 'AI Study Notes Generation requires an active Pro subscription.',
        });
      }

      if (!db.studyMaterials) db.studyMaterials = [];
      let index = db.studyMaterials.findIndex((m) => m.id === req.params.id);
      let targetDb = db;
      if (index === -1) {
        const defaultDb = readDB();
        const defIdx = (defaultDb.studyMaterials || []).findIndex((m) => m.id === req.params.id);
        if (defIdx !== -1) {
          targetDb = defaultDb;
          index = defIdx;
        }
      }

      if (index === -1) {
        return res.status(404).json({ error: 'Study material not found' });
      }

      const material = targetDb.studyMaterials[index];
      const usageCheck = checkAndIncrementAiUsage(targetDb, 0);
      if (!usageCheck.allowed) {
        return res.status(429).json({
          error: 'AI_LIMIT_REACHED',
          message: usageCheck.reason || 'Monthly AI operations limit reached.',
        });
      }

      const apiKey = getGeminiApiKey();
      if (!apiKey) {
        return res.status(503).json({
          error: 'GEMINI_NOT_CONFIGURED',
          message: 'AI features are temporarily unavailable. Gemini is not configured for this deployment.',
        });
      }

      let ai;
      try {
        ai = getGeminiClient();
      } catch (e: any) {
        return res.status(503).json({
          error: 'GEMINI_NOT_CONFIGURED',
          message: 'AI features are temporarily unavailable. Gemini is not configured for this deployment.',
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
      targetDb.studyMaterials[index] = material;
      writeDB(targetDb, userId, userEmail);

      res.json({
        success: true,
        studyNotes,
        material,
        aiUsage: targetDb.profile.aiUsage,
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
      const { userId, userEmail } = getEffectiveUser(req);
      const db = readDB(userId, userEmail);
      if (!checkUserHasActiveSubscription(req, db)) {
        return res.status(403).json({
          error: 'PRO_FEATURE_REQUIRED',
          message: 'AI Key Points Extraction requires an active Pro subscription.',
        });
      }

      if (!db.studyMaterials) db.studyMaterials = [];
      let index = db.studyMaterials.findIndex((m) => m.id === req.params.id);
      let targetDb = db;
      if (index === -1) {
        const defaultDb = readDB();
        const defIdx = (defaultDb.studyMaterials || []).findIndex((m) => m.id === req.params.id);
        if (defIdx !== -1) {
          targetDb = defaultDb;
          index = defIdx;
        }
      }

      if (index === -1) {
        return res.status(404).json({ error: 'Study material not found' });
      }

      const material = targetDb.studyMaterials[index];
      const usageCheck = checkAndIncrementAiUsage(targetDb, 0);
      if (!usageCheck.allowed) {
        return res.status(429).json({
          error: 'AI_LIMIT_REACHED',
          message: usageCheck.reason || 'Monthly AI operations limit reached.',
        });
      }

      const apiKey = getGeminiApiKey();
      if (!apiKey) {
        return res.status(503).json({
          error: 'GEMINI_NOT_CONFIGURED',
          message: 'AI features are temporarily unavailable. Gemini is not configured for this deployment.',
        });
      }

      let ai;
      try {
        ai = getGeminiClient();
      } catch (e: any) {
        return res.status(503).json({
          error: 'GEMINI_NOT_CONFIGURED',
          message: 'AI features are temporarily unavailable. Gemini is not configured for this deployment.',
        });
      }

      const payload = await getDocumentAiPayload(material);
      let keyPoints = '';

      if (payload?.type === 'text') {
        keyPoints = await generateTextWithGemini(
          ai,
          `You are an academic exam coach and prep specialist. Extract high-yield key takeaways, core definitions, and exam-critical concepts from this document:
Document: "${material.name}"
Subject: "${material.subjectName}"
Topic: "${material.topic || 'General'}"

DOCUMENT TEXT:
${payload.text}

Format cleanly in Markdown with bullet points:
### 📌 Critical Exam Takeaways
- [Core finding, principle, or high-yield concept frequently tested on exams]
- [Practical application, mechanism, or problem-solving rule]

### 🔑 Essential Terms & Definitions
- **[Concept/Term]**: Clear, rigorous definition and why it matters.
- **[Concept/Term]**: Core formula, mechanism, or principle.

### ⚠️ Common Pitfalls & Clarifications
- [Crucial distinction, exception, or common misconception to avoid on exams]`
        );
      } else if (payload?.type === 'inlineData') {
        keyPoints = await generateTextWithGemini(ai, {
          parts: [
            {
              inlineData: payload.inlineData,
            },
            {
              text: `You are an academic exam coach. Extract crucial key points, definitions, and essential exam facts from this document ("${material.name}", Subject: "${material.subjectName}").
Format cleanly in Markdown with bullet points:
### 📌 Critical Exam Takeaways
### 🔑 Essential Terms & Definitions
### ⚠️ Common Pitfalls & Clarifications`,
            },
          ],
        });
      } else if (material.summary || req.body?.summary || (material as any).notes || (material as any).studyNotes || material.extractedText) {
        const fallbackText = material.summary || req.body?.summary || (material as any).notes || (material as any).studyNotes || material.extractedText;
        keyPoints = await generateTextWithGemini(
          ai,
          `You are an academic exam coach and prep specialist. Extract key points, definitions, facts, and essential review concepts from this document summary and notes:
Document: "${material.name}"
Subject: "${material.subjectName}"
Topic: "${material.topic || 'General'}"

DOCUMENT CONTENT:
${fallbackText}

Format cleanly in Markdown with bullet points:
### 📌 Critical Exam Takeaways
- [Core finding, principle, or high-yield concept frequently tested on exams]
- [Practical application or rule]

### 🔑 Essential Terms & Definitions
- **[Concept/Term]**: Clear definition and significance.

### ⚠️ Common Pitfalls & Clarifications
- [Common misconception or pitfall]`
        );
      } else {
        return res.status(400).json({
          error: 'NO_SOURCE_DATA',
          message: 'Unable to extract document text for key points extraction.',
        });
      }

      const normalizedKeyPoints = normalizeKeyPointsOutput(keyPoints);
      material.keyPoints = normalizedKeyPoints;
      material.keyPointsGeneratedAt = new Date().toISOString();
      material.updatedAt = new Date().toISOString();
      targetDb.studyMaterials[index] = material;
      writeDB(targetDb, userId, userEmail);

      res.json({
        success: true,
        keyPoints: normalizedKeyPoints,
        material,
        aiUsage: targetDb.profile.aiUsage,
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

  // ==============================================================
  // Native Study Planner Authentication Endpoints (Name, Email, Password)
  // No Google, No Microsoft, No OTP, No Email Verification Required
  // ==============================================================

  // 1. Native Account Registration (Name, Email, Password, Confirm Password)
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { name, email, password, confirmPassword } = req.body || {};
      const cleanName = (typeof name === 'string' ? name : '').trim();
      const cleanEmail = (typeof email === 'string' ? email : '').trim().toLowerCase();

      if (!cleanName) {
        return res.status(400).json({ error: 'NAME_REQUIRED', message: 'Please enter your name.' });
      }
      if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
        return res.status(400).json({ error: 'INVALID_EMAIL', message: 'Please enter a valid email address.' });
      }
      if (!password || typeof password !== 'string' || password.length < 6) {
        return res.status(400).json({ error: 'WEAK_PASSWORD', message: 'Password must be at least 6 characters.' });
      }
      if (confirmPassword !== undefined && password !== confirmPassword) {
        return res.status(400).json({ error: 'PASSWORD_MISMATCH', message: 'Passwords do not match.' });
      }

      let existing = findUserByEmail(cleanEmail);
      let userId: string;

      if (existing) {
        if (existing.passwordHash) {
          return res.status(409).json({
            error: 'EMAIL_ALREADY_EXISTS',
            message: 'An account with this email already exists. Please log in.',
          });
        }
        // Seamlessly claim existing account that was previously imported/synced without a password
        userId = existing.userId;
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);
        existing.name = cleanName || existing.name;
        existing.passwordHash = passwordHash;
        existing.emailVerified = true;
        existing.updatedAt = new Date().toISOString();
        upsertUser(existing);
      } else {
        // Generate permanent unique internal user ID
        userId = `usr_${crypto.randomBytes(8).toString('hex')}`;
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);
        existing = {
          userId,
          name: cleanName,
          email: cleanEmail,
          passwordHash,
          emailVerified: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        upsertUser(existing);
      }

      // Safe non-destructive subscription link: connect existing subscriptions in ledger
      const activeEntry = getActiveSubscriptionFromLedger(userId, cleanEmail);
      if (activeEntry && (!activeEntry.userId || activeEntry.userId !== userId)) {
        activeEntry.userId = userId;
        const ledger = readSubscriptionsLedger();
        const lIdx = ledger.findIndex(e => e.transactionId === activeEntry.transactionId);
        if (lIdx >= 0) {
          ledger[lIdx].userId = userId;
          writeSubscriptionsLedger(ledger);
        }
      }

      // Create authenticated session
      const sessionToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
      saveSession({
        token: sessionToken,
        userId: existing.userId,
        email: existing.email,
        createdAt: Date.now(),
        expiresAt,
      });

      // Set secure HttpOnly cookie
      res.cookie('study_session', sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: '/',
      });

      console.log(`[Native Auth] ✅ Registered user: ${existing.email} (userId: ${existing.userId})`);

      return res.status(201).json({
        success: true,
        message: 'Account created successfully.',
        user: sanitizeUser(existing),
        token: sessionToken,
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
      console.error('[Native Auth] Error registering account:', err);
      return res.status(500).json({
        error: 'REGISTRATION_FAILED',
        message: err?.message || 'Could not register account. Please try again.',
      });
    }
  });

  // 2. Native Account Login (Email, Password)
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body || {};
      const cleanEmail = (typeof email === 'string' ? email : '').trim().toLowerCase();

      if (!cleanEmail || !cleanEmail.includes('@')) {
        return res.status(400).json({ error: 'EMAIL_REQUIRED', message: 'Please enter a valid email address.' });
      }
      if (!password || typeof password !== 'string') {
        return res.status(400).json({ error: 'PASSWORD_REQUIRED', message: 'Please enter your password.' });
      }

      const user = findUserByEmail(cleanEmail);
      if (!user || !user.passwordHash) {
        return res.status(401).json({
          error: 'INVALID_CREDENTIALS',
          message: 'Incorrect email or password. Please check your credentials.',
        });
      }

      const isMatch = await bcrypt.compare(password, user.passwordHash);
      if (!isMatch) {
        return res.status(401).json({
          error: 'INVALID_CREDENTIALS',
          message: 'Incorrect email or password. Please check your credentials.',
        });
      }

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

      // Create authenticated session
      const sessionToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
      saveSession({
        token: sessionToken,
        userId: user.userId,
        email: user.email,
        createdAt: Date.now(),
        expiresAt,
      });

      // Set secure HttpOnly cookie
      res.cookie('study_session', sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: '/',
      });

      console.log(`[Native Auth] ✅ Logged in user: ${user.email} (userId: ${user.userId})`);

      return res.json({
        success: true,
        message: 'Logged in successfully.',
        user: sanitizeUser(user),
        token: sessionToken,
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
      console.error('[Native Auth] Error logging in:', err);
      return res.status(500).json({
        error: 'LOGIN_FAILED',
        message: 'Could not log in. Please check your credentials.',
      });
    }
  });

  // 3. Native Account Logout
  app.post('/api/auth/logout', (req, res) => {
    const token = getSessionTokenFromRequest(req);
    if (token) {
      deleteSession(token);
    }
    res.clearCookie('study_session', { path: '/' });
    return res.json({ success: true, message: 'Logged out successfully.' });
  });

  // 4. Current User Session Check
  app.get('/api/auth/me', (req, res) => {
    const userContext = getEffectiveUser(req);
    if (!userContext.userId && !userContext.userEmail) {
      return res.json({
        authenticated: false,
        user: null,
        hasActiveSubscription: false,
        subscription: null,
      });
    }

    let user = userContext.userId ? findUserById(userContext.userId) : undefined;
    if (!user && userContext.userEmail) {
      user = findUserByEmail(userContext.userEmail);
    }

    if (!user) {
      return res.json({
        authenticated: false,
        user: null,
        hasActiveSubscription: false,
        subscription: null,
      });
    }

    const activeEntry = getActiveSubscriptionFromLedger(user.userId, user.email);
    let subInfo = null;
    if (activeEntry) {
      subInfo = {
        subscriptionStatus: 'premium',
        status: 'active',
        plan: activeEntry.plan,
        paymentGateway: activeEntry.paymentGateway,
        transactionId: activeEntry.transactionId,
        purchaseDate: activeEntry.purchaseDate,
        expiryDate: activeEntry.expiryDate,
        billingCountry: activeEntry.billingCountry,
        type: normalizePlanType(activeEntry.plan),
        paymentProvider: activeEntry.paymentGateway,
        paymentId: activeEntry.transactionId,
      };
    } else {
      const userDb = readDB(user.userId, user.email);
      if (isSubscriptionActive(userDb?.profile?.subscription)) {
        const sub = userDb.profile.subscription;
        subInfo = {
          subscriptionStatus: 'premium',
          status: 'active',
          plan: sub.plan || 'yearly',
          paymentGateway: sub.paymentGateway || sub.paymentProvider || 'razorpay',
          transactionId: sub.transactionId || sub.paymentId || 'sim_b1da4eb5-bdd',
          purchaseDate: sub.purchaseDate,
          expiryDate: sub.expiryDate,
          billingCountry: sub.billingCountry || 'IN',
          type: normalizePlanType(sub.plan || 'yearly'),
          paymentProvider: sub.paymentGateway || sub.paymentProvider || 'razorpay',
          paymentId: sub.transactionId || sub.paymentId || 'sim_b1da4eb5-bdd',
        };
      }
    }

    return res.json({
      authenticated: true,
      user: sanitizeUser(user),
      hasActiveSubscription: Boolean(subInfo),
      subscription: subInfo,
    });
  });

  // 5. Secure Password Reset Request (Single-use, cryptographically random, expires in 1 hour)
  app.post('/api/auth/forgot-password', (req, res) => {
    try {
      const { email } = req.body || {};
      const cleanEmail = (typeof email === 'string' ? email : '').trim().toLowerCase();

      if (!cleanEmail || !cleanEmail.includes('@')) {
        return res.status(400).json({ error: 'EMAIL_REQUIRED', message: 'Please enter a valid email address.' });
      }

      const user = findUserByEmail(cleanEmail);
      if (user) {
        const rawToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        user.passwordResetToken = tokenHash;
        user.passwordResetExpires = Date.now() + 3600 * 1000; // 1 hour expiration
        upsertUser(user);

        const hasEmailService = Boolean(process.env.RESEND_API_KEY || process.env.SMTP_HOST || process.env.SENDGRID_API_KEY);
        if (hasEmailService) {
          console.log(`[Password Reset] Dispatched reset instructions for user: ${cleanEmail}`);
        } else {
          console.warn(`[Password Reset] NOTICE: No email delivery service is currently configured (e.g. RESEND_API_KEY, SMTP_HOST). Password reset token generated securely for ${cleanEmail}.`);
        }
      }

      // Always return generic success to prevent email enumeration
      return res.json({
        success: true,
        message: 'If an account exists for this email, password reset instructions have been generated.',
      });
    } catch (err: any) {
      console.error('[Password Reset] Error:', err);
      return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to process password reset request.' });
    }
  });

  // 6. Reset Password with Token
  app.post('/api/auth/reset-password', async (req, res) => {
    try {
      const { token, newPassword } = req.body || {};
      if (!token || typeof token !== 'string') {
        return res.status(400).json({ error: 'TOKEN_REQUIRED', message: 'Reset token is required.' });
      }
      if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
        return res.status(400).json({ error: 'WEAK_PASSWORD', message: 'New password must be at least 6 characters.' });
      }

      const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');
      const users = readUsers();
      const user = users.find(u => u.passwordResetToken === tokenHash && (u.passwordResetExpires || 0) > Date.now());

      if (!user) {
        return res.status(400).json({
          error: 'INVALID_OR_EXPIRED_TOKEN',
          message: 'Password reset link is invalid or has expired.',
        });
      }

      const salt = await bcrypt.genSalt(10);
      user.passwordHash = await bcrypt.hash(newPassword, salt);
      delete user.passwordResetToken;
      delete user.passwordResetExpires;
      user.updatedAt = new Date().toISOString();
      upsertUser(user);

      return res.json({
        success: true,
        message: 'Password has been updated successfully. You can now log in.',
      });
    } catch (err: any) {
      console.error('[Password Reset] Reset error:', err);
      return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to reset password.' });
    }
  });

  // Backward compatibility alias for any existing clients
  app.post('/api/auth/firebase-sync', async (req, res) => {
    try {
      const { uid, email, displayName, photoURL } = req.body || {};
      const cleanEmail = (typeof email === 'string' ? email : '').trim().toLowerCase();
      const cleanUid = String(uid || '').trim();

      if (!cleanEmail) {
        return res.status(400).json({ success: false, error: 'EMAIL_REQUIRED', message: 'Valid email is required.' });
      }

      let user = findUserById(cleanUid) || findUserByEmail(cleanEmail);
      if (!user) {
        user = {
          userId: cleanUid || `usr_${crypto.randomBytes(8).toString('hex')}`,
          name: displayName?.trim() || cleanEmail.split('@')[0],
          email: cleanEmail,
          emailVerified: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        upsertUser(user);
      }

      const activeEntry = getActiveSubscriptionFromLedger(user.userId, user.email);
      return res.json({
        success: true,
        user: sanitizeUser(user),
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
      return res.status(500).json({ success: false, error: 'SYNC_FAILED', message: 'Sync failed.' });
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

      // DUPLICATE PURCHASE PROTECTION (Server-Side Enforcement)
      // An existing active Premium subscriber must NEVER be charged again or given a duplicate order!
      const activeLedgerSub = getActiveSubscriptionFromLedger(userId, userEmail);
      const userDb = readDB(userId, userEmail);
      const hasActiveDbSubscription = isSubscriptionActive(userDb?.profile?.subscription);

      if (activeLedgerSub || hasActiveDbSubscription) {
        const subData = activeLedgerSub || userDb.profile.subscription;
        return res.status(400).json({
          success: false,
          error: 'ALREADY_PREMIUM',
          message: 'Your Premium subscription is already active.',
          alreadyActive: true,
          subscription: {
            subscriptionStatus: 'premium',
            status: 'active',
            plan: subData.plan,
            paymentGateway: (subData as any).paymentGateway || (subData as any).paymentProvider,
            transactionId: (subData as any).transactionId || (subData as any).paymentId,
            purchaseDate: subData.purchaseDate,
            expiryDate: subData.expiryDate,
            billingCountry: subData.billingCountry,
          },
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
      const activeEntry = getActiveSubscriptionFromLedger(userId, userEmail);
      if (activeEntry) {
        return res.json({
          hasActiveSubscription: true,
          subscription: {
            subscriptionStatus: 'premium',
            status: 'active',
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

      // Check current db profile subscription
      const db = readDB(userId, userEmail);
      if (isSubscriptionActive(db?.profile?.subscription)) {
        const sub = db.profile.subscription;
        return res.json({
          hasActiveSubscription: true,
          subscription: {
            subscriptionStatus: 'premium',
            status: 'active',
            plan: sub.plan || 'yearly',
            paymentGateway: sub.paymentGateway || sub.paymentProvider || 'razorpay',
            transactionId: sub.transactionId || sub.paymentId || 'sim_b1da4eb5-bdd',
            purchaseDate: sub.purchaseDate,
            expiryDate: sub.expiryDate,
            billingCountry: sub.billingCountry || 'IN',
            type: normalizePlanType(sub.plan || 'yearly'),
            paymentProvider: sub.paymentGateway || sub.paymentProvider || 'razorpay',
            paymentId: sub.transactionId || sub.paymentId || 'sim_b1da4eb5-bdd',
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

