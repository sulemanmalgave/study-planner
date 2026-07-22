import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Plus, 
  Bell, 
  Sparkles, 
  AlertCircle, 
  Loader2, 
  RefreshCw 
} from 'lucide-react';

import Sidebar from './components/Sidebar';
import DashboardView from './components/DashboardView';
import CalendarView from './components/CalendarView';
import TimetableView from './components/TimetableView';
import AssignmentsView from './components/AssignmentsView';
import ExamsView from './components/ExamsView';
import NotesView from './components/NotesView';
import StudyTimerView from './components/StudyTimerView';
import ProgressView from './components/ProgressView';
import SettingsView from './components/SettingsView';

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
  Subscription 
} from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [dbState, setDbState] = useState<DatabaseSchema | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Global search query
  const [globalSearchQuery, setGlobalSearchQuery] = useState<string>('');

  // Modals state
  const [isUpgradeOpen, setIsUpgradeOpen] = useState<boolean>(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState<boolean>(false);
  const [quickAddDefaultType, setQuickAddDefaultType] = useState<'task' | 'class' | 'note' | 'exam'>('task');
  const [isLimitDialogOpen, setIsLimitDialogOpen] = useState<boolean>(false);
  const [limitType, setLimitType] = useState<'assignments' | 'exams' | 'notes' | 'courses' | 'timetables'>('assignments');

  // Load backend state on mount
  const fetchState = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/state');
      if (!response.ok) throw new Error('Failed to load database. Please restart backend server.');
      const data = await response.json();
      setDbState(data);
    } catch (err: any) {
      setError(err.message || 'An error occurred loading the student workspace data.');
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
        <p className="text-xs font-mono text-slate-400 uppercase tracking-widest animate-pulse">Initializing Digital Study Planner...</p>
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
  const isPremium = profile.subscription.plan === 'premium';

  // API Call Handlers (With direct UI state sync updates on success)
  const handleUpdateProfile = async (updatedProfile: Partial<UserProfile>) => {
    try {
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedProfile),
      });
      if (!response.ok) throw new Error('Failed to save profile on the backend.');
      const data = await response.json();
      setDbState(prev => prev ? { ...prev, profile: data } : null);
    } catch (e) {
      console.error(e);
      throw e;
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
    if (!isPremium && timetable.length >= 2) {
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
    if (!isPremium && assignments.length >= 20) {
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
    if (!isPremium && notes.length >= 15) {
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
    const response = await fetch('/api/reset', { method: 'POST' });
    if (response.ok) {
      const data = await response.json();
      setDbState(data.state);
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
      return {
        ...prev,
        profile: {
          ...prev.profile,
          subscription: updatedSubscription
        }
      };
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

  return (
    <div className="flex h-screen bg-[#F7F9FC] overflow-hidden text-[#1D1B20]" id="study-planner-workspace">
      
      {/* 1. Left Navigation Sidebar */}
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        profile={profile} 
        onUpgradeClick={() => setIsUpgradeOpen(true)} 
      />

      {/* 2. Main Workspace (Right Panel) */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden" id="workspace-main-panel">
        
        {/* Top Header Bar */}
        <header className="h-16 border-b border-[#E1E3E1] bg-white px-6 flex items-center justify-between shrink-0 z-10" id="main-header">
          {/* Global search input */}
          <div className="relative w-full max-w-sm" id="header-global-search">
            <Search className="absolute left-3.5 top-3 w-4 h-4 text-[#49454F]" />
            <input
              type="text"
              value={globalSearchQuery}
              onChange={(e) => setGlobalSearchQuery(e.target.value)}
              placeholder="Search notes, assignments..."
              className="w-full bg-[#F3EDF7] border-none rounded-full pl-10 pr-4 py-2 text-xs text-[#1D1B20] placeholder:text-[#49454F] focus:ring-2 focus:ring-[#6750A4] focus:outline-none"
            />
          </div>

          {/* Right Header Quick Controls */}
          <div className="flex items-center gap-3" id="header-quick-actions">
            <button
              onClick={() => handleQuickAddClick('task')}
              className="flex items-center gap-1 px-3 py-1.5 bg-[#EADDFF] hover:bg-[#D0BCFF] text-[10px] font-black text-[#21005D] rounded-full border border-[#E1E3E1] transition-colors"
              id="header-quick-add-btn"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>QUICK ADD</span>
            </button>

            {/* Notification bell alert triggers */}
            <button className="p-2 bg-[#F3EDF7] hover:bg-[#EADDFF] rounded-full text-[#49454F] border border-[#E1E3E1] transition-colors relative" title="Notifications">
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-rose-500 rounded-full" />
            </button>

            {/* Account Status Badge */}
            <div className="flex items-center gap-2 border-l border-[#E1E3E1] pl-3">
              <div 
                onClick={() => setActiveTab('settings')}
                className="w-8 h-8 rounded-full bg-[#6750A4] hover:bg-[#503E84] flex items-center justify-center text-xs font-bold text-white shadow cursor-pointer transition-all"
              >
                {profile.initials}
              </div>
            </div>
          </div>
        </header>

        {/* Dynamic Workspace Container */}
        <main className="flex-1 overflow-y-auto p-6 bg-[#F7F9FC]" id="workspace-viewports">
          
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

        </main>
      </div>

      {/* 3. Global Action Modal Overlays */}
      <UpgradeModal 
        isOpen={isUpgradeOpen} 
        onClose={() => setIsUpgradeOpen(false)} 
        onSuccess={handleUpgradeSuccess}
        currentCountry={profile.subscription.billingCountry}
      />

      <QuickAddModal 
        isOpen={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
        courses={courses}
        defaultType={quickAddDefaultType}
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

    </div>
  );
}
