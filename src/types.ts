export interface Subscription {
  plan: 'free' | 'premium';
  type: 'monthly' | 'quarterly' | null;
  purchaseDate: string | null;
  expiryDate: string | null;
  paymentProvider: string | null;
  paymentId: string | null;
  billingCountry: string;
}

export interface UserProfile {
  name: string;
  email: string;
  initials: string;
  subscription: Subscription;
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
}

export interface DatabaseSchema {
  profile: UserProfile;
  courses: Course[];
  timetable: TimetablePeriod[];
  assignments: Assignment[];
  exams: Exam[];
  notes: Note[];
  studySessions: StudySession[];
}

export interface PlanLimits {
  courses: number;
  timetables: number; // meaning count of timetable entries
  assignments: number;
  exams: number;
  notes: number;
}

export const FREE_PLAN_LIMITS: PlanLimits = {
  courses: 3,
  timetables: 2, // We will treat "timetables" as unique entries or custom count of timetable entry periods
  assignments: 20,
  exams: 5,
  notes: 15
};
