import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import { FREE_PLAN_LIMITS, DatabaseSchema } from './src/types.js';

const PORT = 3000;
const DB_FILE = path.join(process.cwd(), 'server_db.json');

const sanitizeEnvVar = (val: string | undefined): string | undefined => {
  if (!val) return undefined;
  // Strip whitespace, tabs, newlines, carriage returns
  let clean = val.trim().replace(/[\r\n\t]/g, '');
  // Strip surrounding double/single quotes if present
  clean = clean.replace(/^["']|["']$/g, '').trim();
  return clean || undefined;
};

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
}>();

const verifiedPayments = new Set<string>();

// Seed Initial Mock Data (Exactly matching screenshots & UI specs)
const getInitialDatabaseState = (): DatabaseSchema => {
  return {
    profile: {
      name: 'Alex Mercer',
      email: 'alex.mercer@example.com',
      initials: 'AL',
      subscription: {
        subscriptionStatus: 'free',
        plan: null,
        paymentGateway: null,
        transactionId: null,
        purchaseDate: null,
        expiryDate: null,
        billingCountry: 'IN', // Default to India, auto-detected or manually toggled
        paymentProvider: null,
        paymentId: null,
      },
    },
    courses: [
      { id: 'c1', name: 'Mathematics', color: '#3b82f6', code: 'MATH-301' },
      { id: 'c2', name: 'Physics', color: '#06b6d4', code: 'PHYS-202' },
      { id: 'c3', name: 'Chemistry', color: '#f43f5e', code: 'CHEM-101' },
      { id: 'c4', name: 'Literature', color: '#a855f7', code: 'LIT-110' },
      { id: 'c5', name: 'History', color: '#eab308', code: 'HIST-120' },
    ],
    timetable: [
      { id: 't1', day: 'Monday', subject: 'Mathematics', startTime: '09:00', endTime: '10:30', courseId: 'c1' },
      { id: 't2', day: 'Monday', subject: 'Physics', startTime: '11:00', endTime: '12:30', courseId: 'c2' },
      { id: 't3', day: 'Tuesday', subject: 'Chemistry', startTime: '10:00', endTime: '11:30', courseId: 'c3' },
      { id: 't4', day: 'Wednesday', subject: 'Literature', startTime: '13:00', endTime: '14:30', courseId: 'c4' },
      { id: 't5', day: 'Thursday', subject: 'History', startTime: '14:00', endTime: '15:30', courseId: 'c5' },
    ],
    assignments: [
      { id: 'a1', title: 'Calculus Problem Set 4', courseId: 'c1', dueDate: '2026-07-22', status: 'pending', priority: 'high', description: 'Solve chapters 4 and 5 questions.' },
      { id: 'a2', title: 'Electromagnetism Lab Report', courseId: 'c2', dueDate: '2026-07-25', status: 'pending', priority: 'medium', description: 'Analyze the flux results and submit.' },
      { id: 'a3', title: 'Organic Chemistry Essay', courseId: 'c3', dueDate: '2026-07-15', status: 'completed', priority: 'low', description: 'Carbon compounds research writeup.' },
    ],
    exams: [
      { id: 'e1', name: 'Maths Midterms', courseId: 'c1', date: '2026-07-28', status: 'upcoming', description: 'Algebra, geometry, calculus coverage.' },
      { id: 'e2', name: 'Physics Final Prep', courseId: 'c2', date: '2026-08-05', status: 'upcoming', description: 'Full syllabus overview and trial run.' },
    ],
    notes: [
      { id: 'n1', title: 'Linear Algebra Notes', content: 'Vectors are mathematical entities with magnitude and direction. Matrices represent transformations.', courseId: 'c1', updatedAt: new Date().toISOString() },
      { id: 'n2', title: 'Newtonian Laws Cheat Sheet', content: '1. Inertia: An object remains at rest unless acted on by external force.\n2. F = ma.\n3. Action/Reaction.', courseId: 'c2', updatedAt: new Date().toISOString() },
    ],
    studySessions: [
      { id: 's1', durationMinutes: 50, type: 'pomodoro', date: '2026-07-18' },
      { id: 's2', durationMinutes: 25, type: 'pomodoro', date: '2026-07-18' },
      { id: 's3', durationMinutes: 15, type: 'break', date: '2026-07-18' },
    ],
  };
};

const getDbFilePath = () => {
  if (process.env.VERCEL || process.env.TMPDIR) {
    return path.join('/tmp', 'server_db.json');
  }
  return DB_FILE;
};

let inMemoryDb: DatabaseSchema | null = null;

// Database utility helpers
const readDB = (): DatabaseSchema => {
  try {
    const filePath = getDbFilePath();
    if (!fs.existsSync(filePath)) {
      const defaultState = getInitialDatabaseState();
      try {
        fs.writeFileSync(filePath, JSON.stringify(defaultState, null, 2));
      } catch (e) {
        inMemoryDb = defaultState;
      }
      return defaultState;
    }
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data) as DatabaseSchema;
  } catch (err) {
    console.error('Error reading database file, using fallback state:', err);
    if (!inMemoryDb) {
      inMemoryDb = getInitialDatabaseState();
    }
    return inMemoryDb;
  }
};

const writeDB = (data: DatabaseSchema) => {
  inMemoryDb = data;
  try {
    const filePath = getDbFilePath();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.warn('Could not write database file to disk (in-memory state updated):', err);
  }
};

export const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware for API endpoints
app.use('/api', (req, res, next) => {
  console.log(`[API ${req.method}] ${req.originalUrl}`);
  next();
});

// API Routes
// 1. Get entire state
app.get('/api/state', (req, res) => {
  try {
    const db = readDB();
    res.json(db);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read database state' });
  }
});

  // 2. Update user profile
  app.put('/api/profile', (req, res) => {
    try {
      const db = readDB();
      db.profile = { ...db.profile, ...req.body };
      writeDB(db);
      res.json(db.profile);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update profile' });
    }
  });

  // 3. Courses CRUD with limit check
  app.post('/api/courses', (req, res) => {
    try {
      const db = readDB();
      if (db.profile.subscription.subscriptionStatus !== 'premium' && db.courses.length >= FREE_PLAN_LIMITS.courses) {
        return res.status(403).json({
          error: 'LIMIT_REACHED',
          message: 'You have reached the free plan limit of 5 courses. Upgrade to Premium for unlimited access.',
        });
      }
      const newCourse = {
        id: 'c_' + crypto.randomUUID().slice(0, 8),
        name: req.body.name || 'Untitled Course',
        color: req.body.color || '#3b82f6',
        code: req.body.code || '',
      };
      db.courses.push(newCourse);
      writeDB(db);
      res.json(newCourse);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create course' });
    }
  });

  app.put('/api/courses/:id', (req, res) => {
    try {
      const db = readDB();
      const index = db.courses.findIndex((c) => c.id === req.params.id);
      if (index === -1) return res.status(404).json({ error: 'Course not found' });
      db.courses[index] = { ...db.courses[index], ...req.body };
      writeDB(db);
      res.json(db.courses[index]);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update course' });
    }
  });

  app.delete('/api/courses/:id', (req, res) => {
    try {
      const db = readDB();
      db.courses = db.courses.filter((c) => c.id !== req.params.id);
      db.timetable = db.timetable.filter((t) => t.courseId !== req.params.id);
      db.assignments = db.assignments.filter((a) => a.courseId !== req.params.id);
      db.exams = db.exams.filter((e) => e.courseId !== req.params.id);
      writeDB(db);
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
      if (db.profile.subscription.subscriptionStatus !== 'premium' && totalPeriods >= FREE_PLAN_LIMITS.timetables) {
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
        db.profile.subscription.subscriptionStatus !== 'premium' &&
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
      if (db.profile.subscription.subscriptionStatus !== 'premium' && db.exams.length >= FREE_PLAN_LIMITS.exams) {
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
      if (db.profile.subscription.subscriptionStatus !== 'premium' && db.notes.length >= FREE_PLAN_LIMITS.notes) {
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
        durationMinutes: parseInt(req.body.durationMinutes) || 25,
        type: req.body.type || 'pomodoro',
        date: req.body.date || new Date().toISOString().split('T')[0],
      };
      db.studySessions.push(newSession);
      writeDB(db);
      res.json(newSession);
    } catch (error) {
      res.status(500).json({ error: 'Failed to save study session' });
    }
  });

  // 9. Subscriptions & Billing Status
  // Detect country based on headers, IP, or timezone
  app.get('/api/subscription/detect-country', (req, res) => {
    const cfCountry = req.headers['cf-ipcountry'] as string;
    const acceptLanguage = req.headers['accept-language'] as string;
    
    let country = 'US';
    if (cfCountry) {
      country = cfCountry.toUpperCase();
    } else if (acceptLanguage && acceptLanguage.toLowerCase().includes('in')) {
      country = 'IN';
    } else {
      const ipTimezone = req.headers['x-appengine-user-timezone'] as string;
      if (ipTimezone && (ipTimezone.includes('Calcutta') || ipTimezone.includes('Kolkata') || ipTimezone.includes('Asia/Kolkata'))) {
        country = 'IN';
      }
    }
    res.json({ country });
  });

  // Create Checkout Order securely on the backend
  app.post('/api/subscription/create-order', async (req, res) => {
    try {
      const { planType, country } = req.body || {};
      const validPlan = planType === 'monthly' || planType === 'quarterly' || planType === 'yearly';
      if (!planType || !validPlan) {
        return res.status(400).json({
          success: false,
          error: 'Valid planType (monthly, quarterly, or yearly) is required'
        });
      }

      const selectedCountry = country ? String(country).trim().toUpperCase() : 'US';
      const isIndia = selectedCountry === 'IN';
      const provider = isIndia ? 'razorpay' : 'paypal';

      let amount = 0;
      let currency = 'USD';

      if (isIndia) {
        currency = 'INR';
        // India pricing: Monthly ₹199, Quarterly ₹399
        amount = planType === 'monthly' ? 199 : 399;
      } else {
        currency = 'USD';
        // International pricing: Monthly $4.99, Yearly $19.99
        amount = planType === 'monthly' ? 4.99 : 19.99;
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

      const db = readDB();
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

      writeDB(db);
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

  // Manual Reset to default state
  app.post('/api/reset', (req, res) => {
    try {
      const defaultState = getInitialDatabaseState();
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

