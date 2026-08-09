import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Plus, 
  Bell, 
  Sparkles, 
  AlertCircle, 
  Loader2, 
  RefreshCw,
  Menu,
  LayoutDashboard,
  Calendar,
  CheckSquare,
  Clock
} from 'lucide-react';

import Sidebar from './components/Sidebar';
import DashboardView from './components/DashboardView';
import SubjectsView from './components/SubjectsView';
import CalendarView from './components/CalendarView';
import TimetableView from './components/TimetableView';
import AssignmentsView from './components/AssignmentsView';
import ExamsView from './components/ExamsView';
import NotesView from './components/NotesView';
import StudyTimerView from './components/StudyTimerView';
import ProgressView from './components/ProgressView';
import SettingsView from './components/SettingsView';
import PrivacyPolicyView from './components/PrivacyPolicyView';
import MobileCompanionView from './components/MobileCompanionView';
import MobilePairingPage from './components/MobilePairingPage';
import MobileHomeView from './components/MobileHomeView';

import UpgradeModal from './components/UpgradeModal';
import QuickAddModal from './components/QuickAddModal';
import LimitReachedDialog from './components/LimitReachedDialog';

import { 
  DatabaseSchema, 
  UserProfile, 
  Course, 
  TimetablePeriod, 
  Assignment, 
  Exam, 
  Note, 
  StudySession, 
  Subscription,
  FREE_PLAN_LIMITS
} from './types';
import { getInitialClientState } from './defaultState';
import { db, isFirebaseConfigured } from './lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const token = urlParams.get('token') || urlParams.get('pairToken');
      if (token || window.location.pathname.includes('/mobile-pair')) {
        return 'mobile-pair';
      }
      if (window.location.pathname === '/privacy') {
        return 'privacy';
      }
    }
    return 'dashboard';
  });

  const [pairingToken, setPairingToken] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const token = urlParams.get('token') || urlParams.get('pairToken');
      if (token || window.location.pathname.includes('/mobile-pair')) {
        return token || '';
      }
    }
    return null;
  });
  const [dbState, setDbState] = useState<DatabaseSchema | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Sync route and document title
  useEffect(() => {
    const handlePopState = () => {
      if (window.location.pathname === '/privacy') {
        setActiveTab('privacy');
      } else {
        setActiveTab('dashboard');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleNavigateToPrivacy = () => {
    if (window.location.pathname !== '/privacy') {
      window.history.pushState({}, '', '/privacy');
    }
    setActiveTab('privacy');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNavigateToHome = () => {
    if (window.location.pathname !== '/') {
      window.history.pushState({}, '', '/');
    }
    setActiveTab('dashboard');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Global search query
  const [globalSearchQuery, setGlobalSearchQuery] = useState<string>('');

  // Modals & Navigation state
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [isUpgradeOpen, setIsUpgradeOpen] = useState<boolean>(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState<boolean>(false);
  const [quickAddDefaultType, setQuickAddDefaultType] = useState<'task' | 'class' | 'note' | 'exam'>('task');
  const [isLimitDialogOpen, setIsLimitDialogOpen] = useState<boolean>(false);
  const [limitType, setLimitType] = useState<'assignments' | 'exams' | 'notes' | 'courses' | 'timetables'>('assignments');

  // Helper to persist state to LocalStorage and Firestore
  const persistState = async (newState: DatabaseSchema) => {
    try {
      localStorage.setItem('studyflow_db_state', JSON.stringify(newState));
    } catch (e) {
      console.warn('Failed to save state to localStorage:', e);
    }

    if (isFirebaseConfigured && db) {
      try {
        await setDoc(doc(db, 'workspaces', 'default'), newState, { merge: true });
      } catch (fErr) {
        console.warn('Failed to save state to Firestore:', fErr);
      }
    }
  };

  // Load state on mount
  const fetchState = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // 1. Try Express Backend API
      const response = await fetch('/api/state').catch(() => null);
      if (response && response.ok) {
        const data = await response.json();
        setDbState(data);
        persistState(data);
        return;
      }

      // 2. Try Firestore if configured
      if (isFirebaseConfigured && db) {
        try {
          const docRef = doc(db, 'workspaces', 'default');
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const firestoreData = docSnap.data() as DatabaseSchema;
            setDbState(firestoreData);
            localStorage.setItem('studyflow_db_state', JSON.stringify(firestoreData));
            return;
          }
        } catch (fErr) {
          console.warn('[Firebase] Error reading Firestore document:', fErr);
        }
      }

      // 3. Try LocalStorage
      const localData = localStorage.getItem('studyflow_db_state');
      if (localData) {
        try {
          const parsed = JSON.parse(localData);
          setDbState(parsed);
          return;
        } catch (e) {
          console.warn('Failed to parse local state:', e);
        }
      }

      // 4. Default Initial Client State fallback
      const initialState = getInitialClientState();
      setDbState(initialState);
      persistState(initialState);

    } catch (err: any) {
      console.warn('Using initial fallback state:', err);
      const fallback = getInitialClientState();
      setDbState(fallback);
      persistState(fallback);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchState();
  }, []);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a0f1d] text-white space-y-4" id="app-loading-spinner">
        <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
        <p className="text-xs font-mono text-slate-400 uppercase tracking-widest animate-pulse">Initializing Study Planner...</p>
      </div>
    );
  }

  if (error || !dbState) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a0f1d] text-white p-6 space-y-5" id="app-error-panel">
        <div className="p-4 bg-rose-950/40 border border-rose-800 rounded-2xl flex items-center gap-3 max-w-md">
          <AlertCircle className="w-8 h-8 text-rose-500 shrink-0" />
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Workspace Connection Lost</h3>
            <p className="text-[11px] text-rose-200 mt-1 leading-relaxed">{error}</p>
          </div>
        </div>
        <button
          onClick={fetchState}
          className="flex items-center gap-1.5 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-xs font-bold rounded-xl transition-all shadow"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Re-try Connecting</span>
        </button>
      </div>
    );
  }

  const { profile, courses, timetable, assignments, exams, notes, studySessions } = dbState;
  
  // Calculate if subscription is active and valid
  const isSubscriptionValid = () => {
    const sub = profile.subscription;
    if (!sub) return false;
    const isStatusPremium = sub.subscriptionStatus === 'premium' || sub.plan === 'premium';
    if (!isStatusPremium) return false;
    if (sub.expiryDate) {
      return new Date(sub.expiryDate) > new Date();
    }
    return true;
  };

  const isPremium = isSubscriptionValid();

  // API Call Handlers (With direct UI state sync updates on success)
  const handleUpdateProfile = async (updatedProfile: Partial<UserProfile>) => {
    try {
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedProfile),
      }).catch(() => null);

      let data: UserProfile;
      if (response && response.ok) {
        data = await response.json();
      } else {
        data = { ...profile, ...updatedProfile };
      }

      setDbState(prev => {
        if (!prev) return null;
        const next = { ...prev, profile: data };
        persistState(next);
        return next;
      });
    } catch (e) {
      console.error(e);
      const nextProfile = { ...profile, ...updatedProfile };
      setDbState(prev => {
        if (!prev) return null;
        const next = { ...prev, profile: nextProfile };
        persistState(next);
        return next;
      });
    }
  };

  const handleAddCourse = async (course: Omit<Course, 'id'>) => {
    if (!isPremium && courses.length >= 3) {
      setLimitType('courses');
      setIsLimitDialogOpen(true);
      return { success: false, error: 'LIMIT_REACHED' };
    }
    try {
      const response = await fetch('/api/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(course),
      });
      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.error || 'Failed to add course.' };
      }
      setDbState(prev => prev ? { ...prev, courses: [...prev.courses, data] } : null);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  };

  const handleUpdateCourse = async (id: string, course: Partial<Course>) => {
    try {
      const response = await fetch(`/api/courses/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(course),
      });
      const data = await response.json();
      if (response.ok) {
        setDbState(prev => {
          if (!prev) return null;
          return {
            ...prev,
            courses: prev.courses.map(c => c.id === id ? data : c)
          };
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteCourse = async (id: string) => {
    try {
      const response = await fetch(`/api/courses/${id}`, { method: 'DELETE' });
      if (response.ok) {
        // Cascade delete cascades done on backend, reload state cleanly
        fetchState();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddTimetable = async (period: Omit<TimetablePeriod, 'id'>) => {
    if (!isPremium && timetable.length >= FREE_PLAN_LIMITS.timetables) {
      setLimitType('timetables');
      setIsLimitDialogOpen(true);
      return { success: false, error: 'LIMIT_REACHED' };
    }
    try {
      const response = await fetch('/api/timetable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(period),
      });
      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.error || 'Failed to add timetable entry.' };
      }
      setDbState(prev => prev ? { ...prev, timetable: [...prev.timetable, data] } : null);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  };

  const handleUpdateTimetable = async (id: string, period: Partial<TimetablePeriod>) => {
    try {
      const response = await fetch(`/api/timetable/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(period),
      });
      const data = await response.json();
      if (response.ok) {
        setDbState(prev => {
          if (!prev) return null;
          return {
            ...prev,
            timetable: prev.timetable.map(t => t.id === id ? data : t)
          };
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteTimetable = async (id: string) => {
    try {
      const response = await fetch(`/api/timetable/${id}`, { method: 'DELETE' });
      if (response.ok) {
        setDbState(prev => prev ? { ...prev, timetable: prev.timetable.filter(t => t.id !== id) } : null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddAssignment = async (assignment: Omit<Assignment, 'id'>) => {
    const activeTasksCount = assignments.filter(a => a.status === 'pending').length;
    if (!isPremium && (assignments.length >= FREE_PLAN_LIMITS.assignments || activeTasksCount >= FREE_PLAN_LIMITS.tasks)) {
      setLimitType('assignments');
      setIsLimitDialogOpen(true);
      return { success: false, error: 'LIMIT_REACHED' };
    }
    try {
      const response = await fetch('/api/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assignment),
      });
      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.error || 'Failed to add assignment.' };
      }
      setDbState(prev => prev ? { ...prev, assignments: [...prev.assignments, data] } : null);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  };

  const handleUpdateAssignment = async (id: string, assignment: Partial<Assignment>) => {
    try {
      const response = await fetch(`/api/assignments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assignment),
      });
      const data = await response.json();
      if (response.ok) {
        setDbState(prev => {
          if (!prev) return null;
          return {
            ...prev,
            assignments: prev.assignments.map(a => a.id === id ? data : a)
          };
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteAssignment = async (id: string) => {
    try {
      const response = await fetch(`/api/assignments/${id}`, { method: 'DELETE' });
      if (response.ok) {
        setDbState(prev => prev ? { ...prev, assignments: prev.assignments.filter(a => a.id !== id) } : null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddExam = async (exam: Omit<Exam, 'id'>) => {
    if (!isPremium && exams.length >= 5) {
      setLimitType('exams');
      setIsLimitDialogOpen(true);
      return { success: false, error: 'LIMIT_REACHED' };
    }
    try {
      const response = await fetch('/api/exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(exam),
      });
      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.error || 'Failed to add exam.' };
      }
      setDbState(prev => prev ? { ...prev, exams: [...prev.exams, data] } : null);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  };

  const handleUpdateExam = async (id: string, exam: Partial<Exam>) => {
    try {
      const response = await fetch(`/api/exams/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(exam),
      });
      const data = await response.json();
      if (response.ok) {
        setDbState(prev => {
          if (!prev) return null;
          return {
            ...prev,
            exams: prev.exams.map(e => e.id === id ? data : e)
          };
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteExam = async (id: string) => {
    try {
      const response = await fetch(`/api/exams/${id}`, { method: 'DELETE' });
      if (response.ok) {
        setDbState(prev => prev ? { ...prev, exams: prev.exams.filter(e => e.id !== id) } : null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddNote = async (note: Omit<Note, 'id' | 'updatedAt'>) => {
    if (!isPremium && notes.length >= FREE_PLAN_LIMITS.notes) {
      setLimitType('notes');
      setIsLimitDialogOpen(true);
      return { success: false, error: 'LIMIT_REACHED' };
    }
    try {
      const response = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(note),
      });
      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.error || 'Failed to add note page.' };
      }
      setDbState(prev => prev ? { ...prev, notes: [...prev.notes, data] } : null);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  };

  const handleUpdateNote = async (id: string, note: Partial<Note>) => {
    try {
      const response = await fetch(`/api/notes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(note),
      });
      const data = await response.json();
      if (response.ok) {
        setDbState(prev => {
          if (!prev) return null;
          return {
            ...prev,
            notes: prev.notes.map(n => n.id === id ? data : n)
          };
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteNote = async (id: string) => {
    try {
      const response = await fetch(`/api/notes/${id}`, { method: 'DELETE' });
      if (response.ok) {
        setDbState(prev => prev ? { ...prev, notes: prev.notes.filter(n => n.id !== id) } : null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleLogStudySession = async (session: Omit<StudySession, 'id' | 'date'>) => {
    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(session),
      });
      const data = await response.json();
      if (response.ok) {
        setDbState(prev => prev ? { ...prev, studySessions: [...prev.studySessions, data] } : null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleResetDatabase = async () => {
    try {
      const response = await fetch('/api/reset', { method: 'POST' }).catch(() => null);
      if (response && response.ok) {
        const data = await response.json();
        setDbState(data.state);
        persistState(data.state);
      } else {
        const initialState = getInitialClientState();
        setDbState(initialState);
        persistState(initialState);
      }
      setActiveTab('dashboard');
    } catch (e) {
      const initialState = getInitialClientState();
      setDbState(initialState);
      persistState(initialState);
      setActiveTab('dashboard');
    }
  };

  // Quick action helper callbacks
  const handleQuickAddClick = (type: 'task' | 'class' | 'note' | 'exam') => {
    setQuickAddDefaultType(type);
    setIsQuickAddOpen(true);
  };

  const handleUpgradeSuccess = (updatedSubscription: Subscription) => {
    setDbState(prev => {
      if (!prev) return null;
      const nextState = {
        ...prev,
        profile: {
          ...prev.profile,
          subscription: updatedSubscription
        }
      };
      persistState(nextState);
      return nextState;
    });
  };

  // Global search filtering mechanism
  const globalFilterAssignments = () => {
    if (!globalSearchQuery) return assignments;
    const query = globalSearchQuery.toLowerCase();
    return assignments.filter(as => {
      const matchedTitle = as.title.toLowerCase().includes(query);
      const matchedDesc = as.description?.toLowerCase().includes(query) || false;
      const matchedCourse = courses.find(c => c.id === as.courseId)?.name.toLowerCase().includes(query) || false;
      return matchedTitle || matchedDesc || matchedCourse;
    });
  };

  // Mobile pairing route handler
  if (pairingToken !== null || activeTab === 'mobile-pair') {
    return (
      <MobilePairingPage
        token={pairingToken || ''}
        onPairingComplete={() => {
          setPairingToken(null);
          if (window.location.search || window.location.pathname !== '/') {
            window.history.pushState({}, '', '/');
          }
          fetchState();
          setActiveTab('mobile-companion');
        }}
        onCancel={() => {
          setPairingToken(null);
          if (window.location.search || window.location.pathname !== '/') {
            window.history.pushState({}, '', '/');
          }
          setActiveTab('dashboard');
        }}
      />
    );
  }

  return (
    <div className="flex h-screen bg-[#F7F9FC] overflow-hidden text-[#1D1B20]" id="study-planner-workspace">
      
      {/* 1. Left Navigation Sidebar */}
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        profile={profile} 
        onUpgradeClick={() => setIsUpgradeOpen(true)} 
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
      />

      {/* 2. Main Workspace (Right Panel) */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden" id="workspace-main-panel">
        
        {/* Top Header Bar */}
        <header className="h-16 border-b border-[#E1E3E1] bg-white px-3 sm:px-6 flex items-center justify-between shrink-0 z-10 gap-2 min-w-0" id="main-header">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Mobile/Tablet Menu Hamburger Button */}
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 lg:hidden text-[#49454F] hover:text-[#1D1B20] hover:bg-[#F3EDF7] rounded-xl transition-colors cursor-pointer shrink-0 min-w-[40px] min-h-[40px] flex items-center justify-center"
              aria-label="Open navigation menu"
              id="mobile-menu-hamburger-btn"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Mobile Brand Logo & Title on smaller screens */}
            <div className="flex items-center gap-2 lg:hidden min-w-0">
              <img 
                src={`${(import.meta.env.BASE_URL || '/').replace(/\/$/, '')}/logo.png`}
                alt="Study Planner Logo" 
                className="w-7 h-7 rounded-lg object-cover shadow-xs border border-slate-200 shrink-0" 
                referrerPolicy="no-referrer"
                onError={(e) => {
                  const target = e.currentTarget;
                  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
                  if (!target.dataset.triedFallback) {
                    target.dataset.triedFallback = '1';
                    target.src = `${base}/logo.jpg`;
                  } else if (target.dataset.triedFallback === '1') {
                    target.dataset.triedFallback = '2';
                    target.src = `${base}/icon-512.png`;
                  }
                }}
              />
              <span className="text-xs font-black tracking-tight text-[#1D1B20] truncate">Study Planner</span>
            </div>

            {/* Global search input */}
            <div className="relative hidden md:block w-full max-w-xs lg:max-w-sm" id="header-global-search">
              <Search className="absolute left-3.5 top-3 w-4 h-4 text-[#49454F]" />
              <input
                type="text"
                value={globalSearchQuery}
                onChange={(e) => setGlobalSearchQuery(e.target.value)}
                placeholder="Search notes, assignments..."
                className="w-full bg-[#F3EDF7] border-none rounded-full pl-10 pr-4 py-2 text-xs text-[#1D1B20] placeholder:text-[#49454F] focus:ring-2 focus:ring-[#6750A4] focus:outline-none"
              />
            </div>
          </div>

          {/* Right Header Quick Controls */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0" id="header-quick-actions">
            <button
              onClick={() => handleQuickAddClick('task')}
              className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 bg-[#EADDFF] hover:bg-[#D0BCFF] text-[10px] font-black text-[#21005D] rounded-full border border-[#E1E3E1] transition-colors cursor-pointer"
              id="header-quick-add-btn"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">QUICK ADD</span>
            </button>

            {/* Notification bell alert triggers */}
            <button className="p-2 bg-[#F3EDF7] hover:bg-[#EADDFF] rounded-full text-[#49454F] border border-[#E1E3E1] transition-colors relative cursor-pointer" title="Notifications">
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-rose-500 rounded-full" />
            </button>

            {/* Account Status Badge */}
            <div className="flex items-center gap-2 border-l border-[#E1E3E1] pl-2 sm:pl-3">
              <div 
                onClick={() => setActiveTab('settings')}
                className="w-8 h-8 rounded-full bg-[#6750A4] hover:bg-[#503E84] flex items-center justify-center text-xs font-bold text-white shadow cursor-pointer transition-all shrink-0"
              >
                {profile.initials}
              </div>
            </div>
          </div>
        </header>

        {/* Dynamic Workspace Container */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 pb-20 md:pb-6 bg-[#F7F9FC] min-w-0" id="workspace-viewports">
          
          {/* Active Tab Dispatcher */}
          {activeTab === 'dashboard' && (
            <DashboardView 
              courses={courses}
              timetable={timetable}
              assignments={globalFilterAssignments()}
              exams={exams}
              studySessions={studySessions}
              onQuickAddClick={handleQuickAddClick}
              onFocusNowClick={() => setActiveTab('study-timer')}
              onNavigateToTab={setActiveTab}
            />
          )}

          {activeTab === 'subjects' && (
            <SubjectsView 
              courses={courses}
              assignments={assignments}
              timetable={timetable}
              exams={exams}
              notes={notes}
              onAddCourse={handleAddCourse}
              onUpdateCourse={handleUpdateCourse}
              onDeleteCourse={handleDeleteCourse}
            />
          )}

          {activeTab === 'calendar' && (
            <CalendarView 
              courses={courses}
              timetable={timetable}
              assignments={globalFilterAssignments()}
              exams={exams}
            />
          )}

          {activeTab === 'timetable' && (
            <TimetableView 
              courses={courses}
              timetable={timetable}
              isPremium={isPremium}
              onAddCourse={handleAddCourse}
              onAddPeriod={handleAddTimetable}
              onUpdatePeriod={handleUpdateTimetable}
              onDeletePeriod={handleDeleteTimetable}
              onTriggerUpgrade={() => setIsUpgradeOpen(true)}
            />
          )}

          {activeTab === 'assignments' && (
            <AssignmentsView 
              courses={courses}
              assignments={globalFilterAssignments()}
              isPremium={isPremium}
              onAddCourse={handleAddCourse}
              onAddAssignment={handleAddAssignment}
              onUpdateAssignment={handleUpdateAssignment}
              onDeleteAssignment={handleDeleteAssignment}
              onTriggerUpgrade={() => setIsUpgradeOpen(true)}
            />
          )}

          {activeTab === 'exams' && (
            <ExamsView 
              courses={courses}
              exams={exams}
              isPremium={isPremium}
              onAddCourse={handleAddCourse}
              onAddExam={handleAddExam}
              onUpdateExam={handleUpdateExam}
              onDeleteExam={handleDeleteExam}
              onTriggerUpgrade={() => setIsUpgradeOpen(true)}
            />
          )}

          {activeTab === 'study-timer' && (
            <StudyTimerView 
              studySessions={studySessions}
              onLogSession={handleLogStudySession}
            />
          )}

          {activeTab === 'notes' && (
            <NotesView 
              courses={courses}
              notes={notes}
              isPremium={isPremium}
              onAddCourse={handleAddCourse}
              onAddNote={handleAddNote}
              onUpdateNote={handleUpdateNote}
              onDeleteNote={handleDeleteNote}
              onTriggerUpgrade={() => setIsUpgradeOpen(true)}
            />
          )}

          {activeTab === 'progress' && (
            <ProgressView 
              courses={courses}
              timetable={timetable}
              assignments={assignments}
              exams={exams}
              studySessions={studySessions}
              isPremium={isPremium}
              onTriggerUpgrade={() => setIsUpgradeOpen(true)}
            />
          )}

          {activeTab === 'mobile-companion' && (
            <MobileCompanionView 
              profile={profile}
              onUpgradeClick={() => setIsUpgradeOpen(true)}
              dbState={dbState}
              onRefreshState={fetchState}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView 
              profile={profile}
              coursesCount={courses.length}
              assignmentsCount={assignments.length}
              timetableCount={timetable.length}
              notesCount={notes.length}
              examsCount={exams.length}
              onUpdateProfile={handleUpdateProfile}
              onResetDatabase={handleResetDatabase}
              onTriggerUpgrade={() => setIsUpgradeOpen(true)}
            />
          )}

          {activeTab === 'privacy' && (
            <PrivacyPolicyView onBackToHome={handleNavigateToHome} />
          )}

          {/* Application Footer */}
          <footer className="mt-12 pt-6 border-t border-[#E1E3E1] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#49454F] font-medium px-2 pb-6" id="app-footer">
            <div className="flex items-center gap-2">
              <span className="font-bold text-[#1D1B20]">Study Planner</span>
              <span>• Timetable, Study Timer &amp; Notes</span>
              <span className="text-[10px] bg-[#EADDFF] text-[#21005D] font-bold px-2 py-0.5 rounded-full border border-[#D0BCFF]/60">v1.2</span>
            </div>
            <div className="flex items-center gap-6">
              <button 
                onClick={handleNavigateToPrivacy}
                className="text-[#6750A4] hover:text-[#503E84] font-bold hover:underline cursor-pointer transition-colors"
                id="footer-link-privacy"
              >
                Privacy Policy
              </button>
              <span className="text-slate-400">© 2026 All rights reserved</span>
            </div>
          </footer>

        </main>
      </div>

      {/* 3. Global Action Modal Overlays */}
      <UpgradeModal 
        isOpen={isUpgradeOpen} 
        onClose={() => setIsUpgradeOpen(false)} 
        onSuccess={handleUpgradeSuccess}
      />

      <QuickAddModal 
        isOpen={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
        courses={courses}
        defaultType={quickAddDefaultType}
        onAddCourse={handleAddCourse}
        onAddAssignment={handleAddAssignment}
        onAddTimetable={handleAddTimetable}
        onAddNote={handleAddNote}
        onAddExam={handleAddExam}
        onTriggerUpgrade={() => setIsUpgradeOpen(true)}
      />

      <LimitReachedDialog 
        isOpen={isLimitDialogOpen}
        onClose={() => setIsLimitDialogOpen(false)}
        onUpgradeClick={() => setIsUpgradeOpen(true)}
        limitType={limitType}
      />

      {/* 4. Mobile Bottom Navigation Bar (< 768px) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-[#E1E3E1] z-40 px-1 py-1 flex items-center justify-around shadow-lg" id="mobile-bottom-nav">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-colors cursor-pointer min-w-[52px] ${
            activeTab === 'dashboard' ? 'text-[#21005D] font-bold' : 'text-[#49454F] hover:text-[#1D1B20]'
          }`}
          id="bottom-nav-home"
        >
          <div className={`p-1 rounded-full ${activeTab === 'dashboard' ? 'bg-[#EADDFF]' : ''}`}>
            <LayoutDashboard className="w-5 h-5" />
          </div>
          <span className="text-[10px] tracking-tight font-medium mt-0.5">Home</span>
        </button>

        <button
          onClick={() => setActiveTab('calendar')}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-colors cursor-pointer min-w-[52px] ${
            activeTab === 'calendar' ? 'text-[#21005D] font-bold' : 'text-[#49454F] hover:text-[#1D1B20]'
          }`}
          id="bottom-nav-calendar"
        >
          <div className={`p-1 rounded-full ${activeTab === 'calendar' ? 'bg-[#EADDFF]' : ''}`}>
            <Calendar className="w-5 h-5" />
          </div>
          <span className="text-[10px] tracking-tight font-medium mt-0.5">Calendar</span>
        </button>

        <button
          onClick={() => setActiveTab('assignments')}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-colors cursor-pointer min-w-[52px] ${
            activeTab === 'assignments' ? 'text-[#21005D] font-bold' : 'text-[#49454F] hover:text-[#1D1B20]'
          }`}
          id="bottom-nav-tasks"
        >
          <div className={`p-1 rounded-full ${activeTab === 'assignments' ? 'bg-[#EADDFF]' : ''}`}>
            <CheckSquare className="w-5 h-5" />
          </div>
          <span className="text-[10px] tracking-tight font-medium mt-0.5">Tasks</span>
        </button>

        <button
          onClick={() => setActiveTab('study-timer')}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-colors cursor-pointer min-w-[52px] ${
            activeTab === 'study-timer' ? 'text-[#21005D] font-bold' : 'text-[#49454F] hover:text-[#1D1B20]'
          }`}
          id="bottom-nav-timer"
        >
          <div className={`p-1 rounded-full ${activeTab === 'study-timer' ? 'bg-[#EADDFF]' : ''}`}>
            <Clock className="w-5 h-5" />
          </div>
          <span className="text-[10px] tracking-tight font-medium mt-0.5">Timer</span>
        </button>

        <button
          onClick={() => setIsMobileMenuOpen(true)}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-colors cursor-pointer min-w-[52px] ${
            ['subjects', 'timetable', 'exams', 'notes', 'progress', 'mobile-companion', 'settings'].includes(activeTab)
              ? 'text-[#21005D] font-bold'
              : 'text-[#49454F] hover:text-[#1D1B20]'
          }`}
          id="bottom-nav-more"
        >
          <div className={`p-1 rounded-full ${['subjects', 'timetable', 'exams', 'notes', 'progress', 'mobile-companion', 'settings'].includes(activeTab) ? 'bg-[#EADDFF]' : ''}`}>
            <Menu className="w-5 h-5" />
          </div>
          <span className="text-[10px] tracking-tight font-medium mt-0.5">More</span>
        </button>
      </nav>

    </div>
  );
}
