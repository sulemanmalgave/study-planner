import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  CalendarDays, 
  CheckSquare, 
  GraduationCap, 
  FileText, 
  Settings, 
  RefreshCw, 
  Plus, 
  CheckCircle2, 
  Clock, 
  BookOpen, 
  Wifi, 
  WifiOff, 
  Smartphone,
  ChevronRight,
  Sparkles,
  Calendar
} from 'lucide-react';
import { DatabaseSchema, DayOfWeek, Assignment, TimetablePeriod, Exam, Note } from '../types';
import { formatFrDate, formatFrTime, formatFrDateTime, formatFrSlot } from '../lib/i18n';

interface MobileHomeViewProps {
  dbState: DatabaseSchema;
  onUpdateState: (newState: DatabaseSchema) => void;
  onRefreshState: () => void;
}

export default function MobileHomeView({
  dbState,
  onUpdateState,
  onRefreshState,
}: MobileHomeViewProps) {
  const [activeTab, setActiveTab] = useState<'today' | 'timetable' | 'tasks' | 'exams' | 'notes' | 'sync'>('today');
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncedTime, setLastSyncedTime] = useState<string>('Just now');

  // Network offline/online listeners
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      handleSync();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Current day of week string
  const days: DayOfWeek[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const todayDayName = days[new Date().getDay()];

  // Sync data with server
  const handleSync = async () => {
    if (!navigator.onLine) return;
    setIsSyncing(true);
    try {
      const res = await fetch('/api/mobile-companion/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientState: dbState }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.state) {
          onUpdateState(data.state);
        }
        setLastSyncedTime(formatFrTime(new Date()));
      }
    } catch (e) {
      console.warn('Sync failed:', e);
    } finally {
      setIsSyncing(false);
    }
  };

  // Quick toggle assignment completion
  const handleToggleTask = (taskId: string) => {
    const updatedAssignments = dbState.assignments.map((a) => {
      if (a.id === taskId) {
        return { ...a, status: a.status === 'completed' ? 'pending' : 'completed' } as Assignment;
      }
      return a;
    });

    const newState = { ...dbState, assignments: updatedAssignments };
    onUpdateState(newState);

    // Sync to server
    if (navigator.onLine) {
      fetch(`/api/assignments/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: updatedAssignments.find((a) => a.id === taskId)?.status,
        }),
      }).catch(() => {});
    }
  };

  // Filter today's timetable classes
  const todayClasses = dbState.timetable.filter((t) => t.day === todayDayName);
  const pendingTasks = dbState.assignments.filter((a) => a.status === 'pending');
  const upcomingExams = dbState.exams.filter((e) => e.status === 'upcoming');

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col pb-20 text-slate-800 font-sans" id="mobile-planner-root">
      
      {/* Top Mobile App Header */}
      <header className="bg-white border-b border-slate-200/80 sticky top-0 z-30 px-4 py-3 flex items-center justify-between shadow-2xs">
        <div className="flex items-center gap-2.5">
          <img 
            src={`${(import.meta.env.BASE_URL || '/').replace(/\/$/, '')}/logo.png`}
            alt="Study Planner Logo" 
            className="w-8 h-8 rounded-lg object-cover shadow-2xs border border-slate-200" 
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
          <div>
            <h1 className="text-xs font-extrabold text-[#1D1B20] leading-none">Study Planner</h1>
            <span className="text-[8px] font-mono font-bold text-[#6750A4] uppercase">Mobile Edition</span>
          </div>
        </div>

        {/* Sync Status Badge */}
        <button 
          onClick={handleSync} 
          disabled={isSyncing}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all cursor-pointer bg-slate-50 border-slate-200 text-slate-700"
          id="mobile-sync-badge"
        >
          {isSyncing ? (
            <RefreshCw className="w-3 h-3 text-[#6750A4] animate-spin" />
          ) : isOnline ? (
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          ) : (
            <WifiOff className="w-3 h-3 text-rose-500" />
          )}
          <span>{isSyncing ? 'Syncing...' : isOnline ? 'Synced' : 'Offline'}</span>
        </button>
      </header>

      {/* Main Scrollable View Area */}
      <main className="flex-1 p-4 space-y-5 overflow-y-auto">

        {/* TAB 1: TODAY / HOME OVERVIEW */}
        {activeTab === 'today' && (
          <div className="space-y-5 animate-fade-in text-left" id="mobile-tab-today">
            
            {/* Welcome Banner */}
            <div className="p-4 bg-gradient-to-r from-[#6750A4] to-[#503E84] text-white rounded-2xl shadow-md space-y-1">
              <div className="flex justify-between items-center text-[10px] uppercase font-bold text-purple-200 tracking-wider">
                <span>{todayDayName}, {formatFrDate(new Date(), { month: 'short', day: 'numeric' })}</span>
                <span className="bg-white/20 px-2 py-0.5 rounded-full">Mobile Active</span>
              </div>
              <h2 className="text-base font-extrabold">Welcome, {dbState.profile.name}! 👋</h2>
              <p className="text-[11px] text-purple-100 font-medium">
                {todayClasses.length} class{todayClasses.length !== 1 ? 'es' : ''} scheduled today • {pendingTasks.length} pending task{pendingTasks.length !== 1 ? 's' : ''}
              </p>
            </div>

            {/* Today's Classes */}
            <div className="space-y-2.5">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-extrabold text-[#1D1B20] uppercase tracking-wider flex items-center gap-1.5">
                  <CalendarDays className="w-4 h-4 text-[#6750A4]" />
                  <span>Today's Classes ({todayDayName})</span>
                </h3>
                <button onClick={() => setActiveTab('timetable')} className="text-[11px] font-bold text-[#6750A4]">
                  View All
                </button>
              </div>

              {todayClasses.length > 0 ? (
                <div className="space-y-2">
                  {todayClasses.map((item) => {
                    const course = dbState.courses.find((c) => c.id === item.courseId);
                    return (
                      <div key={item.id} className="p-3.5 bg-white rounded-xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
                        <div className="space-y-0.5 min-w-0">
                          <h4 className="text-xs font-bold text-[#1D1B20] truncate">{item.subject}</h4>
                          <p className="text-[10px] text-slate-500 font-medium">
                            ⏱️ {formatFrSlot(item.startTime, item.endTime)}
                          </p>
                        </div>
                        {course && (
                          <span 
                            className="px-2.5 py-1 text-[9px] font-bold rounded-full text-white shrink-0 shadow-2xs"
                            style={{ backgroundColor: course.color || '#6750A4' }}
                          >
                            {course.name}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-4 bg-white rounded-xl border border-slate-200/60 text-center text-xs text-slate-500">
                  🎉 No classes scheduled for {todayDayName}.
                </div>
              )}
            </div>

            {/* Urgent Tasks */}
            <div className="space-y-2.5">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-extrabold text-[#1D1B20] uppercase tracking-wider flex items-center gap-1.5">
                  <CheckSquare className="w-4 h-4 text-[#6750A4]" />
                  <span>Pending Tasks ({pendingTasks.length})</span>
                </h3>
                <button onClick={() => setActiveTab('tasks')} className="text-[11px] font-bold text-[#6750A4]">
                  Manage
                </button>
              </div>

              {pendingTasks.length > 0 ? (
                <div className="space-y-2">
                  {pendingTasks.slice(0, 4).map((task) => (
                    <div key={task.id} className="p-3 bg-white rounded-xl border border-slate-200/80 shadow-2xs flex items-center gap-3">
                      <button
                        onClick={() => handleToggleTask(task.id)}
                        className="w-5 h-5 rounded-md border-2 border-slate-300 flex items-center justify-center cursor-pointer shrink-0 hover:border-[#6750A4]"
                      >
                        {task.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs font-bold text-[#1D1B20] truncate">{task.title}</h4>
                        <p className="text-[10px] text-slate-500">Due: {formatFrDate(task.dueDate)}</p>
                      </div>
                      <span className={`px-2 py-0.5 text-[8px] font-bold rounded uppercase ${
                        task.priority === 'high' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {task.priority}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 bg-white rounded-xl border border-slate-200/60 text-center text-xs text-slate-500">
                  ✨ All tasks completed! Great job.
                </div>
              )}
            </div>

            {/* Upcoming Exams */}
            {upcomingExams.length > 0 && (
              <div className="space-y-2.5">
                <h3 className="text-xs font-extrabold text-[#1D1B20] uppercase tracking-wider flex items-center gap-1.5">
                  <GraduationCap className="w-4 h-4 text-[#6750A4]" />
                  <span>Upcoming Exams</span>
                </h3>
                <div className="space-y-2">
                  {upcomingExams.slice(0, 2).map((exam) => (
                    <div key={exam.id} className="p-3 bg-[#EADDFF]/30 rounded-xl border border-[#D0BCFF]/40 flex justify-between items-center">
                      <div>
                        <h4 className="text-xs font-bold text-[#21005D]">{exam.name}</h4>
                        <p className="text-[10px] text-slate-600">Date: {formatFrDateTime(exam.date)}</p>
                      </div>
                      <span className="text-[10px] font-bold bg-[#6750A4] text-white px-2 py-0.5 rounded-full">
                        Upcoming
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}

        {/* TAB 2: TIMETABLE */}
        {activeTab === 'timetable' && (
          <div className="space-y-4 animate-fade-in text-left" id="mobile-tab-timetable">
            <h2 className="text-sm font-extrabold text-[#1D1B20] uppercase tracking-wider flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-[#6750A4]" />
              <span>Full Weekly Timetable</span>
            </h2>

            {days.slice(1).concat('Sunday' as DayOfWeek).map((dayName) => {
              const daySchedule = dbState.timetable.filter((t) => t.day === dayName);
              if (daySchedule.length === 0) return null;
              return (
                <div key={dayName} className="p-3 bg-white rounded-2xl border border-slate-200/80 space-y-2">
                  <h3 className="text-xs font-bold text-[#6750A4] border-b border-slate-100 pb-1">{dayName}</h3>
                  <div className="space-y-1.5">
                    {daySchedule.map((item) => (
                      <div key={item.id} className="flex justify-between items-center text-xs py-1">
                        <span className="font-bold text-[#1D1B20]">{item.subject}</span>
                        <span className="text-[10px] font-mono text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                          {formatFrSlot(item.startTime, item.endTime)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* TAB 3: TASKS */}
        {activeTab === 'tasks' && (
          <div className="space-y-3 animate-fade-in text-left" id="mobile-tab-tasks">
            <h2 className="text-sm font-extrabold text-[#1D1B20] uppercase tracking-wider flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-[#6750A4]" />
              <span>Assignments &amp; Tasks</span>
            </h2>

            <div className="space-y-2">
              {dbState.assignments.map((task) => (
                <div key={task.id} className="p-3 bg-white rounded-xl border border-slate-200/80 shadow-2xs flex items-center gap-3">
                  <button
                    onClick={() => handleToggleTask(task.id)}
                    className="w-5 h-5 rounded-md border-2 border-slate-300 flex items-center justify-center cursor-pointer shrink-0"
                  >
                    {task.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <h4 className={`text-xs font-bold ${task.status === 'completed' ? 'line-through text-slate-400' : 'text-[#1D1B20]'}`}>
                      {task.title}
                    </h4>
                    <p className="text-[10px] text-slate-500">Due: {formatFrDate(task.dueDate)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: EXAMS */}
        {activeTab === 'exams' && (
          <div className="space-y-3 animate-fade-in text-left" id="mobile-tab-exams">
            <h2 className="text-sm font-extrabold text-[#1D1B20] uppercase tracking-wider flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-[#6750A4]" />
              <span>Exams Schedule</span>
            </h2>

            <div className="space-y-2">
              {dbState.exams.map((exam) => (
                <div key={exam.id} className="p-3 bg-white rounded-xl border border-slate-200/80 shadow-2xs flex justify-between items-center">
                  <div>
                    <h4 className="text-xs font-bold text-[#1D1B20]">{exam.name}</h4>
                    <p className="text-[10px] text-slate-500">Date: {formatFrDateTime(exam.date)}</p>
                  </div>
                  <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded bg-purple-100 text-[#21005D]">
                    {exam.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 5: NOTES */}
        {activeTab === 'notes' && (
          <div className="space-y-3 animate-fade-in text-left" id="mobile-tab-notes">
            <h2 className="text-sm font-extrabold text-[#1D1B20] uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#6750A4]" />
              <span>Study Notes ({dbState.notes.length})</span>
            </h2>

            <div className="grid grid-cols-1 gap-2.5">
              {dbState.notes.map((note) => (
                <div key={note.id} className="p-3.5 bg-white rounded-xl border border-slate-200/80 shadow-2xs space-y-1">
                  <h4 className="text-xs font-bold text-[#1D1B20]">{note.title}</h4>
                  <p className="text-[11px] text-slate-600 line-clamp-2">{note.content}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 6: SYNC & DEVICE */}
        {activeTab === 'sync' && (
          <div className="space-y-4 animate-fade-in text-left" id="mobile-tab-sync">
            <h2 className="text-sm font-extrabold text-[#1D1B20] uppercase tracking-wider flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-[#6750A4]" />
              <span>Mobile Sync Profile</span>
            </h2>

            <div className="p-4 bg-white rounded-2xl border border-slate-200/80 space-y-3 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Connection Status:</span>
                <span className="font-bold text-emerald-600 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Paired &amp; Synced</span>
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Student Account:</span>
                <span className="font-bold text-[#1D1B20]">{dbState.profile.name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Subscription:</span>
                <span className="font-bold text-[#6750A4] uppercase">Premium Active</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Last Synced:</span>
                <span className="font-mono text-slate-600">{lastSyncedTime}</span>
              </div>

              <button
                onClick={handleSync}
                disabled={isSyncing}
                className="w-full mt-2 py-3 bg-[#6750A4] hover:bg-[#503E84] text-white font-bold rounded-xl transition-all shadow-2xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'Syncing...' : 'Force Sync Now'}</span>
              </button>
            </div>
          </div>
        )}

      </main>

      {/* Bottom Sticky Mobile Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200/80 px-2 py-2 flex items-center justify-around z-40 shadow-lg">
        <button
          onClick={() => setActiveTab('today')}
          className={`flex flex-col items-center gap-1 text-[10px] font-bold transition-all ${
            activeTab === 'today' ? 'text-[#6750A4]' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <LayoutDashboard className="w-5 h-5" />
          <span>Today</span>
        </button>

        <button
          onClick={() => setActiveTab('timetable')}
          className={`flex flex-col items-center gap-1 text-[10px] font-bold transition-all ${
            activeTab === 'timetable' ? 'text-[#6750A4]' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <CalendarDays className="w-5 h-5" />
          <span>Schedule</span>
        </button>

        <button
          onClick={() => setActiveTab('tasks')}
          className={`flex flex-col items-center gap-1 text-[10px] font-bold transition-all ${
            activeTab === 'tasks' ? 'text-[#6750A4]' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <CheckSquare className="w-5 h-5" />
          <span>Tasks</span>
        </button>

        <button
          onClick={() => setActiveTab('exams')}
          className={`flex flex-col items-center gap-1 text-[10px] font-bold transition-all ${
            activeTab === 'exams' ? 'text-[#6750A4]' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <GraduationCap className="w-5 h-5" />
          <span>Exams</span>
        </button>

        <button
          onClick={() => setActiveTab('notes')}
          className={`flex flex-col items-center gap-1 text-[10px] font-bold transition-all ${
            activeTab === 'notes' ? 'text-[#6750A4]' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <FileText className="w-5 h-5" />
          <span>Notes</span>
        </button>

        <button
          onClick={() => setActiveTab('sync')}
          className={`flex flex-col items-center gap-1 text-[10px] font-bold transition-all ${
            activeTab === 'sync' ? 'text-[#6750A4]' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <Smartphone className="w-5 h-5" />
          <span>Device</span>
        </button>
      </nav>

    </div>
  );
}
