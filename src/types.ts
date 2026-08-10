export interface Subscription {
  subscriptionStatus: 'free' | 'premium';
  plan: 'free' | 'premium' | 'monthly' | 'yearly' | 'quarterly' | null;
  paymentGateway: 'razorpay' | 'paypal' | null;
  transactionId: string | null;
  purchaseDate: string | null;
  expiryDate: string | null;
  billingCountry: string;
  type?: 'monthly' | 'yearly' | 'quarterly' | null; // For legacy compatibility
  paymentProvider?: string | null;
  paymentId?: string | null;
}

export interface MobileDevice {
  id: string;
  name: string;
  pairedAt: string;
  lastSyncedAt: string;
  status: 'connected' | 'disconnected';
  deviceToken: string;
}

export interface UserProfile {
  name: string;
  email: string;
  initials: string;
  subscription: Subscription;
  mobileDevice?: MobileDevice | null;
}

export interface Course {
  id: string;
  name: string;
  color: string; // Tailwind bg color or hex
  code?: string;
}

export type DayOfWeek = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';

export interface TimetablePeriod {
  id: string;
  day: DayOfWeek;
  subject: string;
  startTime: string; // e.g. "09:00"
  endTime: string; // e.g. "10:30"
  courseId: string;
}

export interface Assignment {
  id: string;
  title: string;
  courseId: string;
  dueDate: string; // YYYY-MM-DD
  status: 'pending' | 'completed';
  priority: 'low' | 'medium' | 'high';
  description?: string;
}

export interface Exam {
  id: string;
  name: string;
  courseId: string;
  date: string; // YYYY-MM-DD HH:MM or YYYY-MM-DD
  status: 'upcoming' | 'completed';
  description?: string;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  courseId?: string;
  updatedAt: string; // ISO string
}

export interface StudySession {
  id: string;
  durationMinutes: number;
  type: 'pomodoro' | 'custom' | 'break';
  date: string; // ISO date YYYY-MM-DD
  // Focus Mode & Subject Tracking fields (additive & backward-compatible):
  sessionId?: string;
  userId?: string;
  courseId?: string;
  subjectName?: string;
  startTime?: string;
  endTime?: string;
  plannedDurationMinutes?: number;
  actualFocusedDurationSeconds?: number;
  pausedDurationSeconds?: number;
  status?: 'completed' | 'cancelled' | 'interrupted';
  completed?: boolean;
  createdAt?: string;
}

export interface DistractionApp {
  id: string;
  name: string;
  category: string;
  iconName?: string;
  selected: boolean;
}

export interface AudioLecture {
  id: string;
  userId?: string;
  courseId?: string;
  subjectName: string;
  section?: string; // Section / Chapter
  title: string; // Topic / Lecture Title
  audioDataUrl?: string; // Base64 or IndexedDB audio storage reference
  originalFileName: string;
  fileSize?: number; // bytes
  fileType?: string; // e.g., "audio/mp3", "audio/m4a"
  duration: number; // duration in seconds
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

export interface DatabaseSchema {
  profile: UserProfile;
  courses: Course[];
  timetable: TimetablePeriod[];
  assignments: Assignment[];
  exams: Exam[];
  notes: Note[];
  studySessions: StudySession[];
  audioLectures?: AudioLecture[];
}

export interface PlanLimits {
  tasks: number;
  courses: number;
  timetables: number; // Maximum 10 timetable entries
  assignments: number; // Maximum 10 assignments
  notes: number; // Maximum 10 notes
  exams: number; // Maximum 5 exams
  statsDays: number; // 7 days history limit for free plan
}

export const FREE_PLAN_LIMITS: PlanLimits = {
  tasks: 20,
  courses: 5,
  timetables: 10,
  assignments: 10,
  notes: 10,
  exams: 5,
  statsDays: 7,
};
