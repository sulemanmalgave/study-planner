import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { DayOfWeek } from '../types';

export type Language = 'en' | 'fr-FR';

export interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  locale: string;
  formatDate: (date: string | Date | number, options?: Intl.DateTimeFormatOptions) => string;
  formatTime: (time: string | Date | number, options?: { withSeconds?: boolean }) => string;
  formatDateTime: (dateTime: string | Date | number, options?: Intl.DateTimeFormatOptions) => string;
  formatSlot: (startTime: string, endTime: string) => string;
  formatNumber: (num: number, options?: Intl.NumberFormatOptions) => string;
  getDayLabel: (day: DayOfWeek | string, short?: boolean) => string;
  getPriorityLabel: (priority: string) => string;
  getStatusLabel: (status: string) => string;
}

// Standalone French (fr-FR) Date & Time formatters to ensure consistent 24h & DD/MM/YYYY formatting
export const formatFrDate = (date: string | Date | number, options?: Intl.DateTimeFormatOptions): string => {
  if (!date && date !== 0) return '';
  try {
    // Pure YYYY-MM-DD strings (prevent UTC-day offset glitches)
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const [y, m, d] = date.split('-');
      if (!options) {
        return `${d}/${m}/${y}`;
      }
      const parsedDate = new Date(`${date}T12:00:00Z`);
      return new Intl.DateTimeFormat('fr-FR', options).format(parsedDate);
    }
    const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
    if (isNaN(d.getTime())) return String(date);
    if (!options) {
      return new Intl.DateTimeFormat('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(d);
    }
    return new Intl.DateTimeFormat('fr-FR', options).format(d);
  } catch {
    return String(date);
  }
};

export const formatFrTime = (
  time: string | Date | number,
  options?: { withSeconds?: boolean }
): string => {
  if (!time && time !== 0) return '';
  if (typeof time === 'string') {
    // If HH:MM or H:MM or HH:MM:SS
    const match = time.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (match) {
      const hours = match[1].padStart(2, '0');
      const mins = match[2];
      const secs = match[3];
      if (options?.withSeconds && secs) {
        return `${hours}:${mins}:${secs}`;
      }
      return `${hours}:${mins}`;
    }
  }
  try {
    const d = typeof time === 'string' || typeof time === 'number' ? new Date(time) : time;
    if (!isNaN(d.getTime())) {
      return new Intl.DateTimeFormat('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
        second: options?.withSeconds ? '2-digit' : undefined,
        hour12: false,
      }).format(d);
    }
  } catch {}
  return String(time);
};

export const formatFrDateTime = (
  dateTime: string | Date | number,
  options?: Intl.DateTimeFormatOptions
): string => {
  if (!dateTime && dateTime !== 0) return '';
  try {
    if (typeof dateTime === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateTime)) {
      return formatFrDate(dateTime, options);
    }
    const d = typeof dateTime === 'string' || typeof dateTime === 'number' ? new Date(dateTime) : dateTime;
    if (isNaN(d.getTime())) return String(dateTime);
    return new Intl.DateTimeFormat('fr-FR', options || {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d);
  } catch {
    return String(dateTime);
  }
};

export const formatFrSlot = (startTime: string, endTime: string): string => {
  const start = formatFrTime(startTime);
  const end = formatFrTime(endTime);
  if (!start && !end) return '';
  if (!end) return start;
  if (!start) return end;
  return `${start} – ${end}`;
};

const LANGUAGE_STORAGE_KEY = 'studyflow_language';

// Comprehensive dictionary for English and French (France)
export const translations: Record<Language, Record<string, string>> = {
  en: {
    // Brand & App
    'app.name': 'Study Planner',
    'app.subtitle': 'Timetable, Study Timer & Notes',
    'app.version': 'v1.2',
    'app.rights': '© 2026 All rights reserved',
    'app.privacyPolicy': 'Privacy Policy',
    'app.backToHome': 'Back to Workspace',
    'app.loading': 'Initializing Study Planner...',
    'app.connectionLost': 'Workspace Connection Lost',
    'app.retryConnecting': 'Re-try Connecting',

    // Navigation
    'nav.dashboard': 'Dashboard',
    'nav.subjects': 'Subjects',
    'nav.calendar': 'Calendar',
    'nav.timetable': 'Timetable',
    'nav.assignments': 'Assignments',
    'nav.exams': 'Exams',
    'nav.studySessions': 'Study Sessions',
    'nav.studyTimer': 'Study Sessions',
    'nav.audioLectures': 'Audio Lectures',
    'nav.notes': 'Notes',
    'nav.progress': 'Progress',
    'nav.mobileCompanion': 'Mobile Companion',
    'nav.settings': 'Settings',
    'nav.home': 'Home',
    'nav.tasks': 'Tasks',
    'nav.timer': 'Timer',
    'nav.more': 'More',
    'nav.proBadge': 'PRO',

    // Header & Actions
    'header.searchPlaceholder': 'Search notes, assignments...',
    'header.quickAdd': 'QUICK ADD',
    'header.notifications': 'Notifications',

    // Dashboard Bento & Stats
    'dashboard.pendingTasks': 'Pending Tasks',
    'dashboard.upcomingExams': 'Upcoming Exams',
    'dashboard.studyHours': 'Study Hours',
    'dashboard.completionRate': 'Completion Rate',
    'dashboard.tasksCount': '{count} Tasks',
    'dashboard.examsCount': '{count} Exams',
    'dashboard.hoursUnit': 'hrs',

    // Dashboard Quick Controls
    'dashboard.quickControls': 'QUICK STUDENT WORKSPACE CONTROLS',
    'dashboard.addTask': 'Add Task',
    'dashboard.scheduleClass': 'Schedule Class',
    'dashboard.writeNote': 'Write Note',
    'dashboard.focusNow': 'Focus Now',

    // Dashboard Sections
    'dashboard.todaysTasks': "TODAY'S TASKS",
    'dashboard.leftCount': '{count} left',
    'dashboard.allClearTitle': 'All clear for today!',
    'dashboard.allClearDesc': 'No pending assignments or due items today.',
    'dashboard.weeklyOverview': 'WEEKLY OVERVIEW',
    'dashboard.monthView': 'MONTH VIEW',
    'dashboard.noClassesScheduled': 'No classes scheduled',
    'dashboard.examsCountdown': 'EXAMS COUNTDOWN',
    'dashboard.alert': 'Alert',
    'dashboard.daysLeft': '{count} days left',
    'dashboard.dayLeft': '{count} day left',
    'dashboard.today': 'Today',
    'dashboard.tomorrow': 'Tomorrow',
    'dashboard.overdue': 'Overdue',
    'dashboard.noExamsTitle': 'No Upcoming Exams',
    'dashboard.noExamsDesc': 'You have no scheduled exams in your queue.',

    // Common Actions
    'action.save': 'Save',
    'action.cancel': 'Cancel',
    'action.delete': 'Delete',
    'action.edit': 'Edit',
    'action.close': 'Close',
    'action.add': 'Add',
    'action.create': 'Create',
    'action.update': 'Update',
    'action.upgrade': 'Upgrade',
    'action.restore': 'Restore',
    'action.search': 'Search',
    'action.confirm': 'Confirm',
    'action.back': 'Back',
    'action.filter': 'Filter',
    'action.all': 'All',
    'action.signOut': 'Sign out',
    'action.signIn': 'Sign in',
    'action.details': 'Details',
    'action.saving': 'Saving...',
    'action.uploading': 'Uploading...',

    // Priorities & Statuses
    'priority.high': 'High',
    'priority.medium': 'Medium',
    'priority.low': 'Low',
    'priority.label': 'Priority',
    'status.pending': 'Pending',
    'status.completed': 'Completed',
    'status.upcoming': 'Upcoming',
    'status.all': 'All Statuses',
    'status.label': 'Status',

    // Days of Week
    'day.monday': 'Monday',
    'day.tuesday': 'Tuesday',
    'day.wednesday': 'Wednesday',
    'day.thursday': 'Thursday',
    'day.friday': 'Friday',
    'day.saturday': 'Saturday',
    'day.sunday': 'Sunday',
    'day.short.mon': 'Mon',
    'day.short.tue': 'Tue',
    'day.short.wed': 'Wed',
    'day.short.thu': 'Thu',
    'day.short.fri': 'Fri',
    'day.short.sat': 'Sat',
    'day.short.sun': 'Sun',

    // Quick Add Modal
    'quickAdd.title': 'Quick Workspace Creator',
    'quickAdd.tabTask': 'Add Task',
    'quickAdd.tabClass': 'Schedule Class',
    'quickAdd.tabNote': 'Write Note',
    'quickAdd.tabExam': 'Add Exam',
    'quickAdd.taskTitlePlaceholder': 'e.g., Read chapter 4 & complete problem set',
    'quickAdd.classTitlePlaceholder': 'e.g., Organic Chemistry Lecture',
    'quickAdd.noteTitlePlaceholder': 'e.g., Summary of cell biology principles',
    'quickAdd.examTitlePlaceholder': 'e.g., Calculus Midterm Exam',
    'quickAdd.titleLabel': 'Title / Name',
    'quickAdd.subjectLabel': 'Subject / Course',
    'quickAdd.dueDateLabel': 'Due Date',
    'quickAdd.dayLabel': 'Day of Week',
    'quickAdd.timeLabel': 'Class Time',
    'quickAdd.examDateLabel': 'Exam Date & Time',
    'quickAdd.descriptionLabel': 'Description / Notes',
    'quickAdd.descPlaceholder': 'Add any helpful notes, room numbers or links...',
    'quickAdd.submitTask': 'Create Task',
    'quickAdd.submitClass': 'Add to Timetable',
    'quickAdd.submitNote': 'Save Note',
    'quickAdd.submitExam': 'Schedule Exam',
    'quickAdd.titleRequired': 'Please enter a title or subject name.',

    // Subjects View
    'subjects.title': 'Academic Subjects',
    'subjects.subtitle': 'Manage your courses, syllabi, color-coding and linked assignments',
    'subjects.addSubject': 'Add Subject',
    'subjects.editSubject': 'Edit Subject',
    'subjects.subjectName': 'Subject Name',
    'subjects.subjectNamePlaceholder': 'e.g., Advanced Mathematics',
    'subjects.courseCode': 'Course Code (Optional)',
    'subjects.courseCodePlaceholder': 'e.g., MATH-301',
    'subjects.accentColor': 'Color Accent',
    'subjects.noSubjectsTitle': 'No Subjects Yet',
    'subjects.noSubjectsDesc': 'Create your academic subjects to organize your classes, tasks and notes.',
    'subjects.linkedClasses': 'Classes',
    'subjects.linkedTasks': 'Tasks',
    'subjects.linkedExams': 'Exams',
    'subjects.linkedNotes': 'Notes',
    'subjects.deleteConfirm': 'Are you sure you want to delete this subject? All associated timetable entries will also be removed.',

    // Assignments View
    'assignments.title': 'Assignments & Tasks',
    'assignments.subtitle': 'Track homework, projects, readings, and pending academic deadlines',
    'assignments.addTask': 'Add Task',
    'assignments.editTask': 'Edit Task',
    'assignments.taskTitle': 'Task Title',
    'assignments.taskTitlePlaceholder': 'e.g., Problem Set 3',
    'assignments.dueDate': 'Due Date',
    'assignments.filterSubject': 'Filter by Subject',
    'assignments.filterStatus': 'Filter by Status',
    'assignments.filterPriority': 'Filter by Priority',
    'assignments.noTasksTitle': 'No Assignments Found',
    'assignments.noTasksDesc': 'You have no assignments matching the selected criteria.',
    'assignments.markCompleted': 'Mark as completed',
    'assignments.markPending': 'Mark as pending',
    'assignments.deleteConfirm': 'Are you sure you want to delete this assignment?',
    'assignments.titleRequired': 'Please enter a task title.',

    // Exams View
    'exams.title': 'Exams & Tests',
    'exams.subtitle': 'Prepare for upcoming finals, midterms, quizzes, and track study countdowns',
    'exams.addExam': 'Add Exam',
    'exams.editExam': 'Edit Exam',
    'exams.examName': 'Exam Name',
    'exams.examNamePlaceholder': 'e.g., Physics Final Exam',
    'exams.dateTime': 'Date & Time',
    'exams.daysUntil': '{count} days remaining',
    'exams.noExamsTitle': 'No Exams Scheduled',
    'exams.noExamsDesc': 'Add upcoming tests to get reminders and countdown alerts.',
    'exams.deleteConfirm': 'Are you sure you want to delete this exam?',
    'exams.nameRequired': 'Please enter an exam name.',

    // Timetable View
    'timetable.title': 'Weekly Timetable',
    'timetable.subtitle': 'Your recurring weekly schedule of lectures, labs, and tutorials',
    'timetable.addClass': 'Schedule Class',
    'timetable.editClass': 'Edit Class',
    'timetable.className': 'Class / Subject Name',
    'timetable.startTime': 'Start Time',
    'timetable.endTime': 'End Time',
    'timetable.dayOfWeek': 'Day of Week',
    'timetable.noClassTitle': 'No Classes for this Day',
    'timetable.noClassDesc': 'Enjoy your free time or add a recurring class schedule.',
    'timetable.deleteConfirm': 'Are you sure you want to delete this scheduled class?',
    'timetable.timeOrderError': 'End time must be after start time.',

    // Calendar View
    'calendar.title': 'Academic Calendar',
    'calendar.subtitle': 'Monthly and weekly view of all your classes, deadlines, and exams',
    'calendar.month': 'Month',
    'calendar.week': 'Week',
    'calendar.today': 'Today',
    'calendar.noEvents': 'No events scheduled for this day',

    // Notes View & Study Materials
    'notes.title': 'Study Notes & Materials',
    'notes.subtitle': 'Document class notes, lecture insights, formulas, and course reading materials',
    'notes.addNote': 'Write Note',
    'notes.editNote': 'Edit Note',
    'notes.noteTitle': 'Note Title',
    'notes.noteTitlePlaceholder': 'e.g., Molecular Biology Summary',
    'notes.noteContent': 'Content',
    'notes.noteContentPlaceholder': 'Write your notes here in Markdown or plain text...',
    'notes.studyMaterialsTab': 'Study Materials',
    'notes.notesTab': 'Notes',
    'notes.uploadMaterial': 'Upload Material',
    'notes.searchNotes': 'Search notes...',
    'notes.noNotesTitle': 'No Notes Yet',
    'notes.noNotesDesc': 'Create your first note or upload lecture materials.',
    'notes.lastUpdated': 'Updated {date}',
    'notes.deleteConfirm': 'Are you sure you want to delete this note?',

    // Study Timer / Focus Sessions
    'timer.title': 'Study Sessions & Focus Timer',
    'timer.subtitle': 'Pomodoro technique, deep focus clocks, and recorded study intervals',
    'timer.pomodoro': 'Pomodoro',
    'timer.shortBreak': 'Short Break',
    'timer.longBreak': 'Long Break',
    'timer.customTimer': 'Custom Focus',
    'timer.start': 'Start',
    'timer.pause': 'Pause',
    'timer.resume': 'Resume',
    'timer.reset': 'Reset',
    'timer.finish': 'Complete Session',
    'timer.focusingOn': 'Focusing on',
    'timer.selectSubject': 'Select Subject',
    'timer.sessionCompleted': 'Session completed! Great work.',
    'timer.totalFocused': 'Total focused time',
    'timer.recentSessions': 'Recent Study Sessions',
    'timer.noSessions': 'No study sessions logged yet. Start a timer to log your hours.',
    'timer.minutesUnit': 'min',

    // Audio Lectures & AI
    'audio.title': 'Audio Lectures & AI Studio',
    'audio.subtitle': 'Record or upload lectures, generate AI transcripts, summaries, and key points',
    'audio.uploadLecture': 'Upload Lecture Audio',
    'audio.recordLecture': 'Record Lecture',
    'audio.noLecturesTitle': 'No Audio Lectures Recorded',
    'audio.noLecturesDesc': 'Upload or record lectures to unlock automatic AI transcription and summaries.',
    'audio.generateAI': 'Generate AI Study Guide',
    'audio.transcript': 'Transcript',
    'audio.summary': 'Summary',
    'audio.keyPoints': 'Key Points',
    'audio.studyNotes': 'Study Notes',
    'audio.processing': 'Analyzing audio with Gemini AI...',
    'audio.headerTitle': 'Audio Lectures',
    'audio.headerDesc': 'Save, listen to, and organize your recorded lectures by subject and topic.',
    'audio.proUnlimited': 'Pro Plan • Unlimited',
    'audio.usageUsed': '{used} / {total} used',
    'audio.addLecture': 'Add Lecture',
    'audio.addLectureUpgrade': 'Add Lecture (Upgrade to Pro)',
    'audio.limitReachedTitle': 'Free plan limit reached (2 Audio Lectures)',
    'audio.limitReachedDesc': 'Upgrade to Pro to add unlimited audio lectures. All existing recordings remain fully playable and downloadable.',
    'audio.upgradeToPro': 'Upgrade to Pro',
    'audio.searchPlaceholder': 'Search by subject, section, or topic title...',
    'audio.allSubjects': 'All Subjects',
    'audio.noLectures': 'No lectures yet',
    'audio.noLecturesSubtitle': 'Upload your first lecture and organize it by subject and topic for easy listening and revision.',
    'audio.playingAudio': 'Playing Audio',
    'audio.audioPlayer': 'Audio Player',
    'audio.lectureInfo': 'Lecture Information',
    'audio.subjectLabel': 'Subject:',
    'audio.sectionLabel': 'Section:',
    'audio.topicLabel': 'Topic:',
    'audio.durationLabel': 'Duration:',
    'audio.dateAddedLabel': 'Date Added:',
    'audio.fileLabel': 'File:',
    'audio.notesAndText': 'Lecture Notes & Text',
    'audio.notesAndTextDesc': 'Personal study notes, transcripts, and AI-powered study intelligence.',
    'audio.geminiActions': 'Gemini AI Lecture Actions',
    'audio.premiumActive': 'Premium Active ✓',
    'audio.copyNotes': 'Copy Notes',
    'audio.copyTranscript': 'Copy Transcript',
    'audio.copySummary': 'Copy Summary',
    'audio.copyKeyPoints': 'Copy Key Points',
    'audio.copied': 'Copied',
    'audio.saveNotes': 'Save Notes',
    'audio.saveTranscript': 'Save Transcript',
    'audio.saveSummary': 'Save Summary',
    'audio.saveKeyPoints': 'Save Key Points',
    'audio.downloadSection': 'Download & Offline Audio',
    'audio.downloadDesc': 'Save a local audio copy of this lecture recording on your device.',
    'audio.downloadFileBtn': 'Download Audio File',
    'audio.edit': 'Edit',
    'audio.delete': 'Delete',
    'audio.cancel': 'Cancel',
    'audio.saveChanges': 'Save Changes',
    'audio.deleteTitle': 'Delete this lecture?',
    'audio.deleteDesc': 'This audio recording and its notes will be permanently removed.',

    // Progress View
    'progress.title': 'Academic Progress & Analytics',
    'progress.subtitle': 'Visualize your study hours, assignment completion rate, and workload balance',
    'progress.studyTimeOverview': 'Study Time Overview',
    'progress.taskCompletion': 'Task Completion',
    'progress.subjectDistribution': 'Subject Workload Distribution',
    'progress.weeklyStudyHours': 'Weekly Study Hours',
    'progress.totalStudyTime': 'Total Study Time',
    'progress.completedTasksCount': 'Completed Tasks',
    'progress.activeSubjectsCount': 'Active Subjects',
    'progress.excellentPace': 'You are maintaining an excellent study pace this week!',
    'progress.headerTitle': 'Performance & Focus Progress',
    'progress.headerSubtitle': 'Analyze study milestones, focus sessions & academic pacing',
    'progress.freePlanLimitTitle': 'Free Plan History Limit',
    'progress.freePlanLimitDesc': 'Viewing statistics from the last 7 days. Upgrade to Premium for lifetime history analytics.',
    'progress.upgrade': 'Upgrade',
    'progress.todaysStudy': "Today's Study",
    'progress.session': 'Session',
    'progress.sessions': 'Sessions',
    'progress.totalFocusedTime': 'Total Focused Time',
    'progress.dailyGoal': 'Daily Goal',
    'progress.weeklyGoalProgress': 'Weekly Goal Progress',
    'progress.thisWeekFocused': 'This Week Focused',
    'progress.weeklyTarget': 'Weekly Target',
    'progress.hoursUnit': 'Hours',
    'progress.subjectProgressTitle': 'Subject Progress & Statistics',
    'progress.subjectsCount': '{count} Subjects',
    'progress.sessionsLabel': 'Sessions',
    'progress.avgDuration': 'Avg Duration',
    'progress.todayLabel': 'Today',
    'progress.thisWeekLabel': 'This Week',
    'progress.minsUnit': 'mins',
    'progress.noSubjectsTracked': 'No subjects added yet. Add subjects in the Study Timer or Settings to track focus statistics!',
    'progress.assignmentCompletion': 'Assignment Completion',
    'progress.completedOutOf': '{completed}/{total} Completed',
    'progress.totalRevisionFocus': 'Total Revision Focus',
    'progress.focusSessionsCount': '{count} Focus Sessions',
    'progress.revisionHelpText': 'Accumulated revision blocks tracked server-side inside your Pomodoro database.',
    'progress.examsStatusPacing': 'Exams Status Pacing',
    'progress.totalExams': '{count} total',
    'progress.upcomingAlerts': '{count} Upcoming Alerts',
    'progress.calendarHelpText': 'Schedule exam dates in the Calendar to trigger automatic alarms.',

    // Settings View
    'settings.title': 'Settings & Preferences',
    'settings.subtitle': 'Manage your student account, security verification, language, and subscription',
    'settings.syncWorkspace': 'Sync Workspace',
    'settings.savedSuccess': 'Profile details successfully saved.',
    'settings.saveFailed': 'Failed to update profile.',
    'settings.accountProtection': 'Account & Entitlement Protection',
    'settings.verifiedAccount': 'Verified Account',
    'settings.profileSettings': 'Student Profile Settings',
    'settings.studentName': 'Student Name',
    'settings.emailAddress': 'Email Address',
    'settings.saveProfile': 'Save Profile',
    'settings.languageSection': 'Language & Region',
    'settings.interfaceLanguage': 'Interface Language',
    'settings.interfaceLanguageDesc': 'Choose your preferred language for the Study Planner interface.',
    'settings.langEn': 'English (US)',
    'settings.langFr': 'Français (France)',
    'settings.languageSaved': 'Language preference updated to {lang}.',
    'settings.subscriptionStatus': 'Subscription Status',
    'settings.premiumActive': 'Premium Active',
    'settings.validUntil': 'Valid until:',
    'settings.planLabel': 'Plan:',
    'settings.gatewayLabel': 'Gateway:',
    'settings.refLabel': 'Ref:',
    'settings.viewSubscriptionDetails': 'View Subscription Details',
    'settings.proExpired': 'Pro Plan Expired',
    'settings.renewPro': 'Renew Pro Subscription',
    'settings.restorePurchase': 'Restore Existing Purchase',
    'settings.freeAccountTitle': 'Standard Free Account',
    'settings.freeAccountDesc': 'You are currently on the basic free plan. Upgrade to Study Planner Premium to unlock unlimited courses, notes, and timetable sync.',
    'settings.upgradeToPremium': 'Upgrade to Premium',
    'settings.workspaceBackup': 'Workspace Backup',
    'settings.workspaceBackupDesc': 'Export an offline JSON backup of your current courses, assignments, exams, and notes.',
    'settings.exportBackup': 'Export JSON Workspace Backup',
    'settings.exportLocked': 'Export Data (Premium Only)',
    'settings.devSandbox': 'Developer Sandbox Control',
    'settings.devSandboxDesc': 'Test subscription lifecycle and data preservation without losing any custom items.',
    'settings.simulateExpire': 'Simulate Pro Expiration (Safe)',
    'settings.simulatePro': 'Simulate Pro Activation (Safe)',
    'settings.restoreSandbox': 'Restore Factory Sandbox',
    'settings.resetConfirm': 'Are you sure you want to reset demo sample data to factory defaults? This will not remove your Premium status.',

    // Premium & Upgrade Modal
    'premium.upgradeTitle': 'Unlock Study Planner Premium',
    'premium.upgradeSubtitle': 'Elevate your academic workflow with unlimited capacity and AI tools',
    'premium.unlimitedNotes': 'Unlimited Notes & Study Materials',
    'premium.unlimitedTimetable': 'Unlimited Timetable Slots & Classes',
    'premium.unlimitedTasks': 'Unlimited Tasks & Upcoming Exams',
    'premium.aiStudio': 'Gemini AI Lecture Studio & Summaries',
    'premium.analytics': 'Advanced Academic Analytics & Export',
    'premium.selectPlan': 'Choose Your Membership Plan',
    'premium.monthlyPlan': 'Monthly Plan',
    'premium.yearlyPlan': 'Annual Pro Plan',
    'premium.popularBadge': 'BEST VALUE',
    'premium.perMonth': '/ month',
    'premium.perYear': '/ year',
    'premium.secureCheckout': '100% Secure Checkout with Razorpay / PayPal',
    'premium.restoreLink': 'Already purchased? Restore your subscription',
    'premium.activeTitle': 'Study Planner Premium Active',
    'premium.activeSubtitle': 'Your account has full access to all premium features',

    // Limit Dialog
    'limit.title': 'Free Plan Limit Reached',
    'limit.desc': 'You have reached the free allowance limit for this section. Upgrade to Premium for unlimited academic resources.',
    'limit.upgradeBtn': 'Upgrade to Premium',
    'limit.cancelBtn': 'Continue with Free Plan',

    // Mobile Companion
    'mobile.title': 'Mobile Companion & PWA',
    'mobile.subtitle': 'Sync your timetable, alerts, and quick tasks across phone, tablet, and desktop',
    'mobile.pairDevice': 'Pair New Device',
    'mobile.scanQR': 'Scan QR code with your phone camera to pair instantly',
    'mobile.offlineReady': 'Offline-Ready PWA: Install Study Planner to your home screen or desktop',
  },

  'fr-FR': {
    // Brand & App
    'app.name': 'Study Planner',
    'app.subtitle': 'Emploi du temps, Séances d\'étude & Notes',
    'app.version': 'v1.2',
    'app.rights': '© 2026 Tous droits réservés',
    'app.privacyPolicy': 'Politique de confidentialité',
    'app.backToHome': 'Retour à l\'espace de travail',
    'app.loading': 'Initialisation de Study Planner...',
    'app.connectionLost': 'Connexion à l\'espace de travail interrompue',
    'app.retryConnecting': 'Réessayer la connexion',

    // Navigation
    'nav.dashboard': 'Tableau de bord',
    'nav.subjects': 'Matières',
    'nav.calendar': 'Calendrier',
    'nav.timetable': 'Emploi du temps',
    'nav.assignments': 'Devoirs',
    'nav.exams': 'Examens',
    'nav.studySessions': 'Séances d\'étude',
    'nav.studyTimer': 'Séances d\'étude',
    'nav.audioLectures': 'Cours audio',
    'nav.notes': 'Notes',
    'nav.progress': 'Progression',
    'nav.mobileCompanion': 'Compagnon mobile',
    'nav.settings': 'Paramètres',
    'nav.home': 'Accueil',
    'nav.tasks': 'Devoirs',
    'nav.timer': 'Minuteur',
    'nav.more': 'Plus',
    'nav.proBadge': 'PRO',

    // Header & Actions
    'header.searchPlaceholder': 'Rechercher des devoirs, notes...',
    'header.quickAdd': 'AJOUT RAPIDE',
    'header.notifications': 'Notifications',

    // Dashboard Bento & Stats
    'dashboard.pendingTasks': 'Devoirs en attente',
    'dashboard.upcomingExams': 'Examens à venir',
    'dashboard.studyHours': 'Temps d\'étude',
    'dashboard.completionRate': 'Taux d\'achèvement',
    'dashboard.tasksCount': '{count} Devoirs',
    'dashboard.examsCount': '{count} Examens',
    'dashboard.hoursUnit': 'h',

    // Dashboard Quick Controls
    'dashboard.quickControls': 'ACCÈS RAPIDE À L\'ESPACE DE TRAVAIL',
    'dashboard.addTask': 'Ajouter un devoir',
    'dashboard.scheduleClass': 'Planifier un cours',
    'dashboard.writeNote': 'Écrire une note',
    'dashboard.focusNow': 'Se concentrer',

    // Dashboard Sections
    'dashboard.todaysTasks': 'DEVOIRS D\'AUJOURD\'HUI',
    'dashboard.leftCount': '{count} restant(s)',
    'dashboard.allClearTitle': 'Rien à signaler aujourd\'hui !',
    'dashboard.allClearDesc': 'Aucun devoir en attente pour aujourd\'hui.',
    'dashboard.weeklyOverview': 'APERÇU HEBDOMADAIRE',
    'dashboard.monthView': 'VUE MENSUELLE',
    'dashboard.noClassesScheduled': 'Aucun cours prévu',
    'dashboard.examsCountdown': 'COMPTE À REBOURS DES EXAMENS',
    'dashboard.alert': 'Alerte',
    'dashboard.daysLeft': '{count} jours restants',
    'dashboard.dayLeft': '{count} jour restant',
    'dashboard.today': 'Aujourd\'hui',
    'dashboard.tomorrow': 'Demain',
    'dashboard.overdue': 'En retard',
    'dashboard.noExamsTitle': 'Aucun examen à venir',
    'dashboard.noExamsDesc': 'Vous n\'avez aucun examen programmé dans votre planning.',

    // Common Actions
    'action.save': 'Enregistrer',
    'action.cancel': 'Annuler',
    'action.delete': 'Supprimer',
    'action.edit': 'Modifier',
    'action.close': 'Fermer',
    'action.add': 'Ajouter',
    'action.create': 'Créer',
    'action.update': 'Mettre à jour',
    'action.upgrade': 'Passer à Premium',
    'action.restore': 'Restaurer',
    'action.search': 'Rechercher',
    'action.confirm': 'Confirmer',
    'action.back': 'Retour',
    'action.filter': 'Filtrer',
    'action.all': 'Tous',
    'action.signOut': 'Se déconnecter',
    'action.signIn': 'Se connecter',
    'action.details': 'Détails',
    'action.saving': 'Enregistrement...',
    'action.uploading': 'Téléversement...',

    // Priorities & Statuses
    'priority.high': 'Élevée',
    'priority.medium': 'Moyenne',
    'priority.low': 'Basse',
    'priority.label': 'Priorité',
    'status.pending': 'En attente',
    'status.completed': 'Terminé',
    'status.upcoming': 'À venir',
    'status.all': 'Tous les statuts',
    'status.label': 'Statut',

    // Days of Week
    'day.monday': 'Lundi',
    'day.tuesday': 'Mardi',
    'day.wednesday': 'Mercredi',
    'day.thursday': 'Jeudi',
    'day.friday': 'Vendredi',
    'day.saturday': 'Samedi',
    'day.sunday': 'Dimanche',
    'day.short.mon': 'Lun',
    'day.short.tue': 'Mar',
    'day.short.wed': 'Mer',
    'day.short.thu': 'Jeu',
    'day.short.fri': 'Ven',
    'day.short.sat': 'Sam',
    'day.short.sun': 'Dim',

    // Quick Add Modal
    'quickAdd.title': 'Création rapide',
    'quickAdd.tabTask': 'Ajouter un devoir',
    'quickAdd.tabClass': 'Planifier un cours',
    'quickAdd.tabNote': 'Écrire une note',
    'quickAdd.tabExam': 'Ajouter un examen',
    'quickAdd.taskTitlePlaceholder': 'ex. : Exercices de maths chap. 4',
    'quickAdd.classTitlePlaceholder': 'ex. : Cours de Chimie organique',
    'quickAdd.noteTitlePlaceholder': 'ex. : Fiche de révision biologie cellulaire',
    'quickAdd.examTitlePlaceholder': 'ex. : Partiel de physique quantique',
    'quickAdd.titleLabel': 'Titre / Intitulé',
    'quickAdd.subjectLabel': 'Matière',
    'quickAdd.dueDateLabel': 'Date d\'échéance',
    'quickAdd.dayLabel': 'Jour de la semaine',
    'quickAdd.timeLabel': 'Horaires du cours',
    'quickAdd.examDateLabel': 'Date et heure de l\'examen',
    'quickAdd.descriptionLabel': 'Description / Remarques',
    'quickAdd.descPlaceholder': 'Ajoutez des détails, salle de cours ou consignes...',
    'quickAdd.submitTask': 'Créer le devoir',
    'quickAdd.submitClass': 'Ajouter à l\'emploi du temps',
    'quickAdd.submitNote': 'Enregistrer la note',
    'quickAdd.submitExam': 'Planifier l\'examen',
    'quickAdd.titleRequired': 'Veuillez saisir un intitulé ou un nom de matière.',

    // Subjects View
    'subjects.title': 'Matières',
    'subjects.subtitle': 'Gérez vos cours, codes couleur et devoirs associés',
    'subjects.addSubject': 'Ajouter une matière',
    'subjects.editSubject': 'Modifier la matière',
    'subjects.subjectName': 'Nom de la matière',
    'subjects.subjectNamePlaceholder': 'ex. : Mathématiques appliquées',
    'subjects.courseCode': 'Code du cours (Facultatif)',
    'subjects.courseCodePlaceholder': 'ex. : MATH-101',
    'subjects.accentColor': 'Couleur distinctive',
    'subjects.noSubjectsTitle': 'Aucune matière enregistrée',
    'subjects.noSubjectsDesc': 'Ajoutez vos matières pour organiser vos cours, devoirs et fiches de révision.',
    'subjects.linkedClasses': 'Cours',
    'subjects.linkedTasks': 'Devoirs',
    'subjects.linkedExams': 'Examens',
    'subjects.linkedNotes': 'Notes',
    'subjects.deleteConfirm': 'Êtes-vous certain de vouloir supprimer cette matière ? Les créneaux associés dans l\'emploi du temps seront également supprimés.',

    // Assignments View
    'assignments.title': 'Devoirs & Tâches',
    'assignments.subtitle': 'Suivez vos devoirs maison, projets, lectures et échéances académiques',
    'assignments.addTask': 'Ajouter un devoir',
    'assignments.editTask': 'Modifier le devoir',
    'assignments.taskTitle': 'Intitulé du devoir',
    'assignments.taskTitlePlaceholder': 'ex. : Devoir surveillé n°2',
    'assignments.dueDate': 'Date de rendu',
    'assignments.filterSubject': 'Filtrer par matière',
    'assignments.filterStatus': 'Filtrer par statut',
    'assignments.filterPriority': 'Filtrer par priorité',
    'assignments.noTasksTitle': 'Aucun devoir trouvé',
    'assignments.noTasksDesc': 'Aucun devoir ne correspond à vos critères de recherche.',
    'assignments.markCompleted': 'Marquer comme terminé',
    'assignments.markPending': 'Marquer comme en attente',
    'assignments.deleteConfirm': 'Êtes-vous certain de vouloir supprimer ce devoir ?',
    'assignments.titleRequired': 'Veuillez indiquer un intitulé de devoir.',

    // Exams View
    'exams.title': 'Examens & Évaluations',
    'exams.subtitle': 'Préparez vos partiels, épreuves finales et suivez le compte à rebours de révision',
    'exams.addExam': 'Ajouter un examen',
    'exams.editExam': 'Modifier l\'examen',
    'exams.examName': 'Nom de l\'épreuve / Examen',
    'exams.examNamePlaceholder': 'ex. : Épreuve terminale d\'histoire',
    'exams.dateTime': 'Date et heure',
    'exams.daysUntil': '{count} jours restants',
    'exams.noExamsTitle': 'Aucun examen prévu',
    'exams.noExamsDesc': 'Ajoutez vos épreuves pour recevoir des rappels et suivre le compte à rebours.',
    'exams.deleteConfirm': 'Êtes-vous certain de vouloir supprimer cet examen ?',
    'exams.nameRequired': 'Veuillez indiquer un intitulé d\'examen.',

    // Timetable View
    'timetable.title': 'Emploi du temps',
    'timetable.subtitle': 'Votre planning hebdomadaire régulier de cours, travaux dirigés et ateliers',
    'timetable.addClass': 'Planifier un cours',
    'timetable.editClass': 'Modifier le cours',
    'timetable.className': 'Intitulé du cours / Matière',
    'timetable.startTime': 'Heure de début',
    'timetable.endTime': 'Heure de fin',
    'timetable.dayOfWeek': 'Jour de la semaine',
    'timetable.noClassTitle': 'Aucun cours ce jour-là',
    'timetable.noClassDesc': 'Profitez de votre temps libre ou ajoutez un créneau à votre emploi du temps.',
    'timetable.deleteConfirm': 'Êtes-vous certain de vouloir supprimer ce créneau de cours ?',
    'timetable.timeOrderError': 'L\'heure de fin doit être postérieure à l\'heure de début.',

    // Calendar View
    'calendar.title': 'Calendrier',
    'calendar.subtitle': 'Vue mensuelle et hebdomadaire de l\'ensemble de vos cours, devoirs et examens',
    'calendar.month': 'Mois',
    'calendar.week': 'Semaine',
    'calendar.today': 'Aujourd\'hui',
    'calendar.noEvents': 'Aucun événement prévu pour cette journée',

    // Notes View & Study Materials
    'notes.title': 'Notes & Supports d\'étude',
    'notes.subtitle': 'Rédigez vos notes de cours, fiches de synthèse, formules et documents d\'étude',
    'notes.addNote': 'Écrire une note',
    'notes.editNote': 'Modifier la note',
    'notes.noteTitle': 'Titre de la note',
    'notes.noteTitlePlaceholder': 'ex. : Résumé de cours de génétique',
    'notes.noteContent': 'Contenu',
    'notes.noteContentPlaceholder': 'Saisissez vos notes ici en texte enrichi ou Markdown...',
    'notes.studyMaterialsTab': 'Supports d\'étude',
    'notes.notesTab': 'Fiches & Notes',
    'notes.uploadMaterial': 'Importer un document',
    'notes.searchNotes': 'Rechercher dans les notes...',
    'notes.noNotesTitle': 'Aucune note pour le moment',
    'notes.noNotesDesc': 'Rédigez votre première fiche ou importez vos supports de cours.',
    'notes.lastUpdated': 'Mis à jour le {date}',
    'notes.deleteConfirm': 'Êtes-vous certain de vouloir supprimer cette note ?',

    // Study Timer / Focus Sessions
    'timer.title': 'Séances d\'étude & Minuteur',
    'timer.subtitle': 'Technique Pomodoro, minuteur de concentration et historique des temps de révision',
    'timer.pomodoro': 'Pomodoro',
    'timer.shortBreak': 'Pause courte',
    'timer.longBreak': 'Pause longue',
    'timer.customTimer': 'Personnalisé',
    'timer.start': 'Démarrer',
    'timer.pause': 'Pause',
    'timer.resume': 'Reprendre',
    'timer.reset': 'Réinitialiser',
    'timer.finish': 'Terminer la séance',
    'timer.focusingOn': 'Concentration sur',
    'timer.selectSubject': 'Choisir une matière',
    'timer.sessionCompleted': 'Séance terminée ! Excellent travail.',
    'timer.totalFocused': 'Temps de concentration total',
    'timer.recentSessions': 'Séances d\'étude récentes',
    'timer.noSessions': 'Aucune séance enregistrée pour le moment. Lancez le minuteur pour comptabiliser votre temps d\'étude.',
    'timer.minutesUnit': 'min',

    // Audio Lectures & AI
    'audio.title': 'Cours audio & Studio IA',
    'audio.subtitle': 'Enregistrez ou importez des cours audio, générez des transcriptions et synthèses avec l\'IA',
    'audio.uploadLecture': 'Importer un cours audio',
    'audio.recordLecture': 'Enregistrer le cours',
    'audio.noLecturesTitle': 'Aucun cours audio enregistré',
    'audio.noLecturesDesc': 'Importez ou enregistrez un cours audio pour activer la transcription et les résumés automatiques par l\'IA.',
    'audio.generateAI': 'Générer la fiche de synthèse IA',
    'audio.transcript': 'Transcription',
    'audio.summary': 'Résumé',
    'audio.keyPoints': 'Points clés',
    'audio.studyNotes': 'Notes de révision',
    'audio.processing': 'Analyse du cours audio avec Gemini IA...',
    'audio.headerTitle': 'Cours audio',
    'audio.headerDesc': 'Enregistrez, écoutez et organisez vos cours magistraux par matière et par thème.',
    'audio.proUnlimited': 'Offre Pro • Illimité',
    'audio.usageUsed': '{used} / {total} utilisés',
    'audio.addLecture': 'Ajouter un cours',
    'audio.addLectureUpgrade': 'Ajouter un cours (Passer à Pro)',
    'audio.limitReachedTitle': 'Limite de l\'offre gratuite atteinte (2 cours audio)',
    'audio.limitReachedDesc': 'Passez à Pro pour ajouter des cours audio illimités. Vos enregistrements existants restent pleinement accessibles et téléchargeables.',
    'audio.upgradeToPro': 'Passer à Pro',
    'audio.searchPlaceholder': 'Rechercher par matière, section ou titre de cours...',
    'audio.allSubjects': 'Toutes les matières',
    'audio.noLectures': 'Aucun cours audio pour l\'instant',
    'audio.noLecturesSubtitle': 'Importez votre premier cours audio et organisez-le par matière et par thème pour vos révisions.',
    'audio.playingAudio': 'Lecture en cours',
    'audio.audioPlayer': 'Lecteur audio',
    'audio.lectureInfo': 'Informations sur le cours',
    'audio.subjectLabel': 'Matière :',
    'audio.sectionLabel': 'Section :',
    'audio.topicLabel': 'Thème :',
    'audio.durationLabel': 'Durée :',
    'audio.dateAddedLabel': 'Date d\'ajout :',
    'audio.fileLabel': 'Fichier :',
    'audio.notesAndText': 'Notes & Fiches du cours',
    'audio.notesAndTextDesc': 'Notes de cours personnelles, transcriptions et synthèses générées par l\'IA.',
    'audio.geminiActions': 'Actions IA Gemini',
    'audio.premiumActive': 'Premium Actif ✓',
    'audio.copyNotes': 'Copier les notes',
    'audio.copyTranscript': 'Copier la transcription',
    'audio.copySummary': 'Copier le résumé',
    'audio.copyKeyPoints': 'Copier les points clés',
    'audio.copied': 'Copié',
    'audio.saveNotes': 'Enregistrer les notes',
    'audio.saveTranscript': 'Enregistrer la transcription',
    'audio.saveSummary': 'Enregistrer le résumé',
    'audio.saveKeyPoints': 'Enregistrer les points clés',
    'audio.downloadSection': 'Téléchargement & Écoute hors-ligne',
    'audio.downloadDesc': 'Téléchargez une copie audio locale de ce cours sur votre appareil.',
    'audio.downloadFileBtn': 'Télécharger le fichier audio',
    'audio.edit': 'Modifier',
    'audio.delete': 'Supprimer',
    'audio.cancel': 'Annuler',
    'audio.saveChanges': 'Enregistrer les modifications',
    'audio.deleteTitle': 'Supprimer ce cours audio ?',
    'audio.deleteDesc': 'Cet enregistrement audio et toutes ses notes associées seront définitivement supprimés.',

    // Progress View
    'progress.title': 'Progression & Statistiques',
    'progress.subtitle': 'Visualisez votre temps d\'étude, votre taux de devoirs rendus et la répartition de votre charge de travail',
    'progress.studyTimeOverview': 'Aperçu du temps d\'étude',
    'progress.taskCompletion': 'Avancement des devoirs',
    'progress.subjectDistribution': 'Répartition de la charge par matière',
    'progress.weeklyStudyHours': 'Heures d\'étude hebdomadaires',
    'progress.totalStudyTime': 'Temps d\'étude global',
    'progress.completedTasksCount': 'Devoirs achevés',
    'progress.activeSubjectsCount': 'Matières actives',
    'progress.excellentPace': 'Vous maintenez un rythme de travail exemplaire cette semaine !',
    'progress.headerTitle': 'Performance & Suivi de concentration',
    'progress.headerSubtitle': 'Analysez vos objectifs d\'étude, vos séances de concentration et votre rythme académique',
    'progress.freePlanLimitTitle': 'Limite d\'historique de l\'offre gratuite',
    'progress.freePlanLimitDesc': 'Affichage des statistiques des 7 derniers jours. Passez à Premium pour un historique d\'analyse illimité.',
    'progress.upgrade': 'Passer à Premium',
    'progress.todaysStudy': 'Étude d\'aujourd\'hui',
    'progress.session': 'séance',
    'progress.sessions': 'séances',
    'progress.totalFocusedTime': 'Temps de concentration total',
    'progress.dailyGoal': 'Objectif quotidien',
    'progress.weeklyGoalProgress': 'Progression de l\'objectif hebdomadaire',
    'progress.thisWeekFocused': 'Temps concentré cette semaine',
    'progress.weeklyTarget': 'Cible hebdomadaire',
    'progress.hoursUnit': 'heures',
    'progress.subjectProgressTitle': 'Progression & Statistiques par matière',
    'progress.subjectsCount': '{count} matières',
    'progress.sessionsLabel': 'Séances',
    'progress.avgDuration': 'Durée moyenne',
    'progress.todayLabel': 'Aujourd\'hui',
    'progress.thisWeekLabel': 'Cette semaine',
    'progress.minsUnit': 'min',
    'progress.noSubjectsTracked': 'Aucune matière ajoutée pour le moment. Ajoutez des matières dans le Minuteur ou les Paramètres pour suivre vos statistiques !',
    'progress.assignmentCompletion': 'Finalisation des devoirs',
    'progress.completedOutOf': '{completed}/{total} terminés',
    'progress.totalRevisionFocus': 'Temps total de révision',
    'progress.focusSessionsCount': '{count} séances de concentration',
    'progress.revisionHelpText': 'Blocs de révision cumulés et enregistrés dans votre base de données.',
    'progress.examsStatusPacing': 'Rythme & Calendrier des examens',
    'progress.totalExams': '{count} au total',
    'progress.upcomingAlerts': '{count} alertes à venir',
    'progress.calendarHelpText': 'Planifiez vos dates d\'examens dans le Calendrier pour activer des alertes automatiques.',

    // Settings View
    'settings.title': 'Paramètres & Préférences',
    'settings.subtitle': 'Gérez votre compte étudiant, votre sécurité, votre langue et votre abonnement',
    'settings.syncWorkspace': 'Synchroniser l\'espace',
    'settings.savedSuccess': 'Profil étudiant mis à jour avec succès.',
    'settings.saveFailed': 'Impossible de mettre à jour le profil.',
    'settings.accountProtection': 'Protection du compte & Droits d\'accès',
    'settings.verifiedAccount': 'Compte vérifié',
    'settings.profileSettings': 'Paramètres du profil étudiant',
    'settings.studentName': 'Nom de l\'étudiant',
    'settings.emailAddress': 'Adresse e-mail',
    'settings.saveProfile': 'Enregistrer le profil',
    'settings.languageSection': 'Langue & Région',
    'settings.interfaceLanguage': 'Langue de l\'interface',
    'settings.interfaceLanguageDesc': 'Choisissez votre langue pour l\'interface de Study Planner.',
    'settings.langEn': 'English (US)',
    'settings.langFr': 'Français (France)',
    'settings.languageSaved': 'Langue configurée sur {lang}.',
    'settings.subscriptionStatus': 'Statut de l\'abonnement',
    'settings.premiumActive': 'Premium actif',
    'settings.validUntil': 'Valable jusqu\'au :',
    'settings.planLabel': 'Formule :',
    'settings.gatewayLabel': 'Passerelle :',
    'settings.refLabel': 'Réf. :',
    'settings.viewSubscriptionDetails': 'Voir les détails de l\'abonnement',
    'settings.proExpired': 'Abonnement Pro expiré',
    'settings.renewPro': 'Renouveler l\'abonnement Pro',
    'settings.restorePurchase': 'Restaurer un achat existant',
    'settings.freeAccountTitle': 'Compte gratuit standard',
    'settings.freeAccountDesc': 'Vous utilisez actuellement la version gratuite. Passez à Study Planner Premium pour débloquer un nombre illimité de matières, notes et synchronisation de l\'emploi du temps.',
    'settings.upgradeToPremium': 'Passer à Premium',
    'settings.workspaceBackup': 'Sauvegarde de l\'espace de travail',
    'settings.workspaceBackupDesc': 'Exportez une sauvegarde JSON hors-ligne de vos matières, devoirs, examens et fiches de notes.',
    'settings.exportBackup': 'Exporter la sauvegarde JSON',
    'settings.exportLocked': 'Exporter les données (Réservé à Premium)',
    'settings.devSandbox': 'Espace d\'expérimentation développeur',
    'settings.devSandboxDesc': 'Testez le cycle de vie de l\'abonnement et la conservation des données sans altérer vos éléments personnalisés.',
    'settings.simulateExpire': 'Simuler l\'expiration Pro (Sans risque)',
    'settings.simulatePro': 'Simuler l\'activation Pro (Sans risque)',
    'settings.restoreSandbox': 'Restaurer l\'état d\'usine du bac à sable',
    'settings.resetConfirm': 'Êtes-vous certain de vouloir réinitialiser les données de démonstration aux paramètres d\'usine ? Cela ne révoquera pas votre statut Premium.',

    // Premium & Upgrade Modal
    'premium.upgradeTitle': 'Débloquez Study Planner Premium',
    'premium.upgradeSubtitle': 'Optimisez votre travail universitaire grâce à une capacité illimitée et aux outils d\'IA',
    'premium.unlimitedNotes': 'Fiches de notes et supports de cours illimités',
    'premium.unlimitedTimetable': 'Créneaux d\'emploi du temps et cours illimités',
    'premium.unlimitedTasks': 'Devoirs et examens à venir sans restriction',
    'premium.aiStudio': 'Studio de cours audio & Synthèses Gemini IA',
    'premium.analytics': 'Statistiques de progression avancées & Export',
    'premium.selectPlan': 'Choisissez votre formule d\'abonnement',
    'premium.monthlyPlan': 'Formule mensuelle',
    'premium.yearlyPlan': 'Formule annuelle Pro',
    'premium.popularBadge': 'MEILLEURE OFFRE',
    'premium.perMonth': '/ mois',
    'premium.perYear': '/ an',
    'premium.secureCheckout': 'Paiement 100 % sécurisé avec Razorpay / PayPal',
    'premium.restoreLink': 'Déjà abonné ? Restaurer votre abonnement',
    'premium.activeTitle': 'Study Planner Premium actif',
    'premium.activeSubtitle': 'Votre compte bénéficie d\'un accès complet à l\'ensemble des fonctionnalités Premium',

    // Limit Dialog
    'limit.title': 'Limite du forfait gratuit atteinte',
    'limit.desc': 'Vous avez atteint la limite de capacité de la version gratuite pour cette section. Passez à Premium pour bénéficier de ressources académiques illimitées.',
    'limit.upgradeBtn': 'Passer à Premium',
    'limit.cancelBtn': 'Continuer avec la version gratuite',

    // Mobile Companion
    'mobile.title': 'Compagnon mobile & PWA',
    'mobile.subtitle': 'Synchronisez votre emploi du temps, vos alertes et vos devoirs sur téléphone, tablette et ordinateur',
    'mobile.pairDevice': 'Associer un nouvel appareil',
    'mobile.scanQR': 'Scannez le QR code avec l\'appareil photo de votre smartphone pour lier votre compte instantanément',
    'mobile.offlineReady': 'PWA utilisable hors-ligne : Installez Study Planner sur votre écran d\'accueil ou votre ordinateur',
  }
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ 
  children, 
  initialLanguage,
  onLanguageChange 
}: { 
  children: ReactNode; 
  initialLanguage?: Language;
  onLanguageChange?: (lang: Language) => void;
}) {
  const [language, setLanguageState] = useState<Language>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY) as Language | null;
      if (stored === 'fr-FR' || stored === 'en') {
        return stored;
      }
    }
    return initialLanguage || 'en';
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
      } catch (e) {
        console.warn('Failed to save language to localStorage:', e);
      }
    }
    if (onLanguageChange) {
      onLanguageChange(lang);
    }
  };

  const locale = language === 'fr-FR' ? 'fr-FR' : 'en-US';

  const t = (key: string, vars?: Record<string, string | number>): string => {
    const langDict = translations[language] || translations.en;
    let text = langDict[key] || translations.en[key] || key;
    if (vars) {
      Object.entries(vars).forEach(([k, v]) => {
        text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      });
    }
    return text;
  };

  const formatDate = (date: string | Date | number, options?: Intl.DateTimeFormatOptions): string => {
    return formatFrDate(date, options);
  };

  const formatTime = (time: string | Date | number, options?: { withSeconds?: boolean }): string => {
    return formatFrTime(time, options);
  };

  const formatDateTime = (dateTime: string | Date | number, options?: Intl.DateTimeFormatOptions): string => {
    return formatFrDateTime(dateTime, options);
  };

  const formatSlot = (startTime: string, endTime: string): string => {
    return formatFrSlot(startTime, endTime);
  };

  const formatNumber = (num: number, options?: Intl.NumberFormatOptions): string => {
    try {
      return new Intl.NumberFormat('fr-FR', options).format(num);
    } catch {
      return String(num);
    }
  };

  const getDayLabel = (day: DayOfWeek | string, short: boolean = false): string => {
    const key = `day.${String(day).toLowerCase()}`;
    const shortKey = `day.short.${String(day).toLowerCase().slice(0, 3)}`;
    if (short) {
      return t(shortKey) || t(key) || day;
    }
    return t(key) || day;
  };

  const getPriorityLabel = (priority: string): string => {
    const key = `priority.${priority.toLowerCase()}`;
    return t(key) || priority;
  };

  const getStatusLabel = (status: string): string => {
    const key = `status.${status.toLowerCase()}`;
    return t(key) || status;
  };

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage,
        t,
        locale,
        formatDate,
        formatTime,
        formatDateTime,
        formatSlot,
        formatNumber,
        getDayLabel,
        getPriorityLabel,
        getStatusLabel,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(LanguageContext);
  if (!context) {
    // Fallback if rendered outside provider
    const fallbackLocale = 'fr-FR';
    return {
      language: 'fr-FR' as Language,
      setLanguage: () => {},
      t: (key: string, vars?: Record<string, string | number>) => {
        let text = translations['fr-FR']?.[key] || translations.en[key] || key;
        if (vars) {
          Object.entries(vars).forEach(([k, v]) => {
            text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
          });
        }
        return text;
      },
      locale: fallbackLocale,
      formatDate: formatFrDate,
      formatTime: formatFrTime,
      formatDateTime: formatFrDateTime,
      formatSlot: formatFrSlot,
      formatNumber: (n: number) => {
        try {
          return new Intl.NumberFormat('fr-FR').format(n);
        } catch {
          return String(n);
        }
      },
      getDayLabel: (d: string) => d,
      getPriorityLabel: (p: string) => p,
      getStatusLabel: (s: string) => s,
    };
  }
  return context;
}
