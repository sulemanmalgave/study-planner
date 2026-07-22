import React from 'react';
import { 
  CheckSquare, 
  GraduationCap, 
  Clock, 
  Star, 
  Plus, 
  FileText, 
  Timer, 
  CheckCircle, 
  CalendarDays, 
  Trophy 
} from 'lucide-react';
import { Course, TimetablePeriod, Assignment, Exam, StudySession } from '../types';

interface DashboardViewProps {
  courses: Course[];
  timetable: TimetablePeriod[];
  assignments: Assignment[];
  exams: Exam[];
  studySessions: StudySession[];
  onQuickAddClick: (type: 'task' | 'class' | 'note' | 'exam') => void;
  onFocusNowClick: () => void;
  onNavigateToTab: (tab: string) => void;
}

export default function DashboardView({
  courses,
  timetable,
  assignments,
  exams,
  studySessions,
  onQuickAddClick,
  onFocusNowClick,
  onNavigateToTab
}: DashboardViewProps) {

  // 1. Calculate Stats
  const pendingTasks = assignments.filter(a => a.status === 'pending').length;
  const upcomingExamsCount = exams.filter(e => e.status === 'upcoming').length;
  
  // Study Hours from sessions (accumulated duration converted to hours)
  const totalStudyMinutes = studySessions
    .filter(s => s.type !== 'break')
    .reduce((acc, curr) => acc + curr.durationMinutes, 0);
  const studyHours = (totalStudyMinutes / 60).toFixed(1);

  // Completion Rate: assignments completed percentage
  const totalAssignments = assignments.length;
  const completedAssignments = assignments.filter(a => a.status === 'completed').length;
  const completionRate = totalAssignments > 0 
    ? Math.round((completedAssignments / totalAssignments) * 100) 
    : 0;

  // 2. Filter tasks due today (e.g. matches today's local date, or default to any pending task to show rich dashboard items)
  const todayStr = new Date().toISOString().split('T')[0];
  const todayTasks = assignments.filter(a => a.dueDate === todayStr && a.status === 'pending');

  // 3. Weekly Overview Days mapping (MON to SUN)
  // We will map timetable classes to each day
  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const dayAbbreviations: Record<string, { label: string; offset: number }> = {
    'Monday': { label: 'MON 13', offset: 0 },
    'Tuesday': { label: 'TUE 14', offset: 1 },
    'Wednesday': { label: 'WED 15', offset: 2 },
    'Thursday': { label: 'THU 16', offset: 3 },
    'Friday': { label: 'FRI 17', offset: 4 },
    'Saturday': { label: 'SAT 18', offset: 5 },
    'Sunday': { label: 'SUN 19', offset: 6 },
  };

  // Helper to find course color
  const getCourseColor = (courseId: string) => {
    const course = courses.find(c => c.id === courseId);
    return course?.color || '#3b82f6';
  };

  return (
    <div className="space-y-4 text-[#1D1B20]" id="dashboard-view-container">
      
      {/* 4 Bento Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4" id="dashboard-stats-bento">
        {/* Pending Tasks */}
        <div className="p-3.5 bg-white border border-[#E1E3E1] rounded-2xl flex items-center gap-3.5 hover:shadow-sm transition-all cursor-pointer" onClick={() => onNavigateToTab('assignments')}>
          <div className="p-2.5 bg-amber-50 text-amber-700 border border-amber-200/60 rounded-xl">
            <CheckSquare className="w-4.5 h-4.5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-[#49454F] tracking-wider uppercase block">Pending Tasks</span>
            <span className="text-base font-black text-[#1D1B20] mt-0.5 block">{pendingTasks} Tasks</span>
          </div>
        </div>

        {/* Upcoming Exams */}
        <div className="p-3.5 bg-white border border-[#E1E3E1] rounded-2xl flex items-center gap-3.5 hover:shadow-sm transition-all cursor-pointer" onClick={() => onNavigateToTab('exams')}>
          <div className="p-2.5 bg-purple-50 text-purple-700 border border-purple-200/60 rounded-xl">
            <GraduationCap className="w-4.5 h-4.5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-[#49454F] tracking-wider uppercase block">Upcoming Exams</span>
            <span className="text-base font-black text-[#1D1B20] mt-0.5 block">{upcomingExamsCount} Exams</span>
          </div>
        </div>

        {/* Study Hours */}
        <div className="p-3.5 bg-white border border-[#E1E3E1] rounded-2xl flex items-center gap-3.5 hover:shadow-sm transition-all cursor-pointer" onClick={() => onNavigateToTab('study-timer')}>
          <div className="p-2.5 bg-teal-50 text-teal-700 border border-teal-200/60 rounded-xl">
            <Clock className="w-4.5 h-4.5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-[#49454F] tracking-wider uppercase block">Study Hours</span>
            <span className="text-base font-black text-[#1D1B20] mt-0.5 block">{studyHours} hrs</span>
          </div>
        </div>

        {/* Completion Rate */}
        <div className="p-3.5 bg-white border border-[#E1E3E1] rounded-2xl flex items-center gap-3.5 hover:shadow-sm transition-all cursor-pointer" onClick={() => onNavigateToTab('assignments')}>
          <div className="p-2.5 bg-blue-50 text-blue-700 border border-blue-200/60 rounded-xl">
            <Star className="w-4.5 h-4.5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-[#49454F] tracking-wider uppercase block">Completion Rate</span>
            <span className="text-base font-black text-[#1D1B20] mt-0.5 block">{completionRate}%</span>
          </div>
        </div>
      </div>

      {/* Quick Controls Section (Exactly matches layout & color) */}
      <div className="p-3.5 bg-white border border-[#E1E3E1] rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4" id="dashboard-quick-controls">
        <h3 className="text-xs font-bold text-[#1D1B20] uppercase tracking-wider flex items-center gap-2">
          <span className="text-amber-500">⚡</span> Quick Student Workspace Controls
        </h3>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
          <button
            onClick={() => onQuickAddClick('task')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F3EDF7] hover:bg-[#EADDFF] text-xs font-semibold text-[#49454F] hover:text-[#21005D] rounded-full transition-colors border border-[#E1E3E1] cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-[#6750A4]" />
            <span>Add Task</span>
          </button>
          <button
            onClick={() => onQuickAddClick('class')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F3EDF7] hover:bg-[#EADDFF] text-xs font-semibold text-[#49454F] hover:text-[#21005D] rounded-full transition-colors border border-[#E1E3E1] cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-emerald-600" />
            <span>Schedule Class</span>
          </button>
          <button
            onClick={() => onQuickAddClick('note')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F3EDF7] hover:bg-[#EADDFF] text-xs font-semibold text-[#49454F] hover:text-[#21005D] rounded-full transition-colors border border-[#E1E3E1] cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5 text-purple-600" />
            <span>Write Note</span>
          </button>
          <button
            onClick={onFocusNowClick}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#6750A4] hover:bg-[#503E84] text-xs font-bold text-white rounded-full transition-colors shadow-sm cursor-pointer"
          >
            <Timer className="w-3.5 h-3.5 text-white" />
            <span>Focus Now</span>
          </button>
        </div>
      </div>

      {/* Main Bottom Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5" id="dashboard-bottom-grid">
        
        {/* Column 1: Today's Tasks */}
        <div className="lg:col-span-3 flex flex-col bg-white border border-[#E1E3E1] rounded-2xl p-4" id="today-tasks-container">
          <div className="flex items-center justify-between mb-3 border-b border-[#E1E3E1] pb-2">
            <h4 className="text-xs font-extrabold text-[#1D1B20] uppercase tracking-wider flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-[#6750A4]" /> TODAY'S TASKS
            </h4>
            <span className="text-[10px] font-bold bg-[#EADDFF] text-[#21005D] px-2 py-0.5 rounded-full" id="today-tasks-count">
              {todayTasks.length} left
            </span>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[340px] pr-1 py-1" id="today-tasks-inner">
            {todayTasks.length > 0 ? (
              <div className="space-y-2 w-full">
                {todayTasks.map(task => (
                  <div key={task.id} className="p-2.5 bg-[#F7F9FC] border border-[#E1E3E1] rounded-xl flex items-center justify-between gap-2 hover:border-[#6750A4]/30 transition-colors">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#1D1B20] truncate">{task.title}</p>
                      <span className="text-[9px] font-mono mt-0.5 inline-block" style={{ color: getCourseColor(task.courseId) }}>
                        {courses.find(c => c.id === task.courseId)?.name || 'Course'}
                      </span>
                    </div>
                    <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${
                      task.priority === 'high' ? 'bg-rose-100 text-rose-800' :
                      task.priority === 'medium' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
                    }`}>
                      {task.priority}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-left py-1 flex items-center gap-3" id="today-tasks-empty">
                <div className="inline-flex items-center justify-center w-10 h-10 bg-emerald-100 text-emerald-800 rounded-xl shrink-0">
                  <CheckCircle className="w-5 h-5" />
                </div>
                <div>
                  <h5 className="text-xs font-bold text-[#1D1B20]">All clear for today!</h5>
                  <p className="text-[10px] text-[#49454F] mt-0.5">No pending assignments or due items today.</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Column 2: Weekly Overview */}
        <div className="lg:col-span-6 bg-white border border-[#E1E3E1] rounded-2xl p-4" id="weekly-overview-container">
          <div className="flex items-center justify-between mb-3 border-b border-[#E1E3E1] pb-2">
            <h4 className="text-xs font-extrabold text-[#1D1B20] uppercase tracking-wider flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-emerald-600" /> WEEKLY OVERVIEW
            </h4>
            <button
              onClick={() => onNavigateToTab('calendar')}
              className="text-[10px] font-bold text-[#6750A4] hover:text-[#503E84] uppercase tracking-widest transition-colors cursor-pointer"
            >
              Month View
            </button>
          </div>

          <div className="space-y-1.5" id="weekly-overview-list">
            {daysOfWeek.map((day) => {
              const dateInfo = dayAbbreviations[day] || { label: day.substring(0, 3).toUpperCase(), offset: 0 };
              const periods = timetable.filter(t => t.day === day);

              return (
                <div key={day} className="flex items-center gap-3 p-2 bg-[#F7F9FC] rounded-xl hover:bg-[#EADDFF]/20 border border-[#E1E3E1] transition-all">
                  <div className="w-12 shrink-0 text-center border-r border-[#E1E3E1] pr-2">
                    <span className="text-[10px] font-black text-[#1D1B20] tracking-wide uppercase leading-tight block">{dateInfo.label.split(' ')[0]}</span>
                    <span className="text-[11px] font-bold text-[#49454F] mt-0.5 block">{dateInfo.label.split(' ')[1] || ''}</span>
                  </div>
                  <div className="flex-1 flex flex-wrap gap-1.5 items-center">
                    {periods.length > 0 ? (
                      periods.map(period => (
                        <div
                          key={period.id}
                          className="px-2 py-0.5 rounded-lg text-[10px] font-bold flex items-center gap-1.5 border"
                          style={{
                            backgroundColor: getCourseColor(period.courseId) + '15',
                            borderColor: getCourseColor(period.courseId) + '30',
                            color: getCourseColor(period.courseId),
                          }}
                        >
                          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: getCourseColor(period.courseId) }} />
                          <span>{period.subject}</span>
                          <span className="text-[8px] opacity-75 font-mono">({period.startTime})</span>
                        </div>
                      ))
                    ) : (
                      <span className="text-[10px] text-slate-400 italic font-medium">No classes scheduled</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Column 3: Exams Countdown */}
        <div className="lg:col-span-3 flex flex-col bg-white border border-[#E1E3E1] rounded-2xl p-4" id="exams-countdown-container">
          <div className="flex items-center justify-between mb-3 border-b border-[#E1E3E1] pb-2">
            <h4 className="text-xs font-extrabold text-[#1D1B20] uppercase tracking-wider flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-600" /> EXAMS COUNTDOWN
            </h4>
            <span className="text-[10px] font-bold text-[#49454F]">🚨 Alert</span>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[340px] pr-1 py-1" id="exams-countdown-inner">
            {exams.filter(e => e.status === 'upcoming').length > 0 ? (
              <div className="space-y-2.5 w-full">
                {exams.filter(e => e.status === 'upcoming').map(exam => {
                  const examDate = new Date(exam.date);
                  const today = new Date();
                  const diffTime = examDate.getTime() - today.getTime();
                  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                  const isOverdue = diffDays < 0;

                  return (
                    <div key={exam.id} className="p-3 bg-[#F7F9FC] border border-[#E1E3E1] rounded-xl space-y-1.5 hover:border-[#6750A4]/30 transition-all">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold text-[#1D1B20] truncate">{exam.name}</span>
                        <span className="text-[9px] font-mono" style={{ color: getCourseColor(exam.courseId) }}>
                          {courses.find(c => c.id === exam.courseId)?.name || 'Course'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between border-t border-[#E1E3E1] pt-1.5">
                        <span className="text-[10px] text-[#49454F] font-medium">{exam.date}</span>
                        <span className={`text-[10px] font-black ${isOverdue ? 'text-rose-600' : 'text-amber-600 animate-pulse'}`}>
                          {isOverdue ? 'Passed' : `${diffDays} days left`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-left py-1 flex items-center gap-3" id="exams-countdown-empty">
                <div className="inline-flex items-center justify-center w-10 h-10 bg-amber-100 text-amber-700 rounded-xl shrink-0">
                  <Trophy className="w-5 h-5" />
                </div>
                <div>
                  <h5 className="text-xs font-bold text-[#1D1B20]">No upcoming exams!</h5>
                  <p className="text-[10px] text-[#49454F] mt-0.5">Relax or create study sessions in Focus tab.</p>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
