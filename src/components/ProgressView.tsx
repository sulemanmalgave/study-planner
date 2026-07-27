import React from 'react';
import { BookOpen, Star, Clock, CheckSquare, GraduationCap, ChevronRight, TrendingUp } from 'lucide-react';
import { Course, TimetablePeriod, Assignment, Exam, StudySession } from '../types';

interface ProgressViewProps {
  courses: Course[];
  timetable: TimetablePeriod[];
  assignments: Assignment[];
  exams: Exam[];
  studySessions: StudySession[];
  isPremium: boolean;
  onTriggerUpgrade: () => void;
}

export default function ProgressView({ courses, timetable, assignments, exams, studySessions, isPremium, onTriggerUpgrade }: ProgressViewProps) {
  
  // Cutoff calculation for last 7 days
  const getCutoffDateStr = () => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  };

  const cutoffDateStr = getCutoffDateStr();

  // Filter lists based on premium plan limits (last 7 days only for free plan)
  const displaySessions = isPremium 
    ? studySessions 
    : studySessions.filter(s => s.date >= cutoffDateStr);

  const displayAssignments = isPremium
    ? assignments
    : assignments.filter(a => a.dueDate >= cutoffDateStr);

  const displayExams = isPremium
    ? exams
    : exams.filter(e => {
        const examDateStr = e.date.split('T')[0];
        return examDateStr >= cutoffDateStr;
      });

  // 1. Calculations
  const pendingTasks = displayAssignments.filter(a => a.status === 'pending').length;
  const completedTasks = displayAssignments.filter(a => a.status === 'completed').length;
  const totalTasks = displayAssignments.length;
  const taskCompletionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const totalStudyMins = displaySessions.filter(s => s.type !== 'break').reduce((acc, curr) => acc + curr.durationMinutes, 0);
  const studyHrs = (totalStudyMins / 60).toFixed(1);

  const upcomingExams = displayExams.filter(e => e.status === 'upcoming').length;
  const completedExams = displayExams.filter(e => e.status === 'completed').length;

  // 2. Calculate distribution of tasks per course for workload visualization
  const courseDistribution = courses.map(course => {
    const courseAssignments = displayAssignments.filter(a => a.courseId === course.id);
    const total = courseAssignments.length;
    const completed = courseAssignments.filter(a => a.status === 'completed').length;
    const rate = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      courseName: course.name,
      color: course.color,
      total,
      completed,
      rate
    };
  });

  // 3. Weekly hours distribution (Timetable workload per day)
  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const dayWorkload = daysOfWeek.map(day => {
    const periods = timetable.filter(t => t.day === day);
    // Suppose each period is roughly 1.5 hours on average, or we can compute actual duration
    let totalMins = 0;
    periods.forEach(p => {
      try {
        const [sh, sm] = p.startTime.split(':').map(Number);
        const [eh, em] = p.endTime.split(':').map(Number);
        const diff = (eh * 60 + em) - (sh * 60 + sm);
        totalMins += diff > 0 ? diff : 60; // fallback to 60 mins if times are corrupted
      } catch (e) {
        totalMins += 60;
      }
    });

    return {
      day,
      hours: (totalMins / 60).toFixed(1),
      count: periods.length
    };
  });

  return (
    <div className="space-y-6" id="progress-view-root">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 bg-[#131d31] border border-slate-800/80 rounded-2xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-xl">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white tracking-wide uppercase">Performance & Progress</h2>
            <p className="text-[10px] font-mono text-slate-400 mt-1 uppercase">Analyze study milestones & academic pacing</p>
          </div>
        </div>
      </div>

      {/* History Limit Warning Banner */}
      {!isPremium && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 text-amber-200 rounded-2xl flex items-center justify-between gap-4" id="progress-history-limit-banner">
          <div className="flex items-center gap-2.5">
            <Star className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="text-left">
              <p className="text-xs font-bold text-amber-200">Free Plan History Limit</p>
              <p className="text-[10px] text-amber-300/80 mt-0.5">You are currently viewing academic statistics from only the last 7 days. Upgrade to Study Planner Premium to access lifetime history analytics.</p>
            </div>
          </div>
          <button
            onClick={onTriggerUpgrade}
            className="px-3.5 py-1.5 bg-[#6750A4] hover:bg-[#503E84] text-[9px] font-black text-white rounded-full transition-all uppercase tracking-wider shrink-0 cursor-pointer"
          >
            Upgrade
          </button>
        </div>
      )}

      {/* Grid: Overview Bento Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4" id="progress-stats-bento">
        {/* Metric 1: Assignment Completion */}
        <div className="p-5 bg-[#131d31] border border-slate-800/80 rounded-2xl space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Assignment Completion</span>
            <CheckSquare className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-white">{taskCompletionRate}%</span>
            <span className="text-[10px] font-semibold text-slate-400">{completedTasks}/{totalTasks} Completed</span>
          </div>
          {/* Progress bar */}
          <div className="w-full bg-slate-850 h-2 rounded-full overflow-hidden">
            <div className="bg-emerald-500 h-full rounded-full transition-all" style={{ width: `${taskCompletionRate}%` }} />
          </div>
        </div>

        {/* Metric 2: Revision Study Hours */}
        <div className="p-5 bg-[#131d31] border border-slate-800/80 rounded-2xl space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Revision Focus Hours</span>
            <Clock className="w-4 h-4 text-blue-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-white">{studyHrs} hrs</span>
            <span className="text-[10px] font-semibold text-slate-400">{displaySessions.length} Focus Sessions</span>
          </div>
          <div className="text-[10px] text-slate-400 leading-relaxed font-medium">
            Accumulated revision blocks tracked server-side inside your Pomodoro database.
          </div>
        </div>

        {/* Metric 3: Exams Pacing */}
        <div className="p-5 bg-[#131d31] border border-slate-800/80 rounded-2xl space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Exams Status Pacing</span>
            <GraduationCap className="w-4 h-4 text-purple-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-white">{completedExams + upcomingExams} total</span>
            <span className="text-[10px] font-semibold text-slate-400">{upcomingExams} Upcoming Alerts</span>
          </div>
          <div className="text-[10px] text-slate-400 leading-relaxed font-medium">
            Make sure to schedule exam dates in the Calendar to trigger automatic alarms.
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5" id="progress-charts-section">
        
        {/* Workload per Course (Workload Distribution) */}
        <div className="lg:col-span-6 p-5 bg-[#131d31] border border-slate-800/80 rounded-2xl space-y-4">
          <h3 className="text-xs font-extrabold text-white uppercase tracking-wider border-b border-slate-800 pb-2">
            Workload Distribution per Subject
          </h3>

          <div className="space-y-4" id="course-workload-progress-list">
            {courseDistribution.map((course, index) => (
              <div key={index} className="space-y-1.5 p-3.5 bg-[#1e293b]/25 rounded-xl border border-slate-800/40">
                <div className="flex justify-between items-center text-xs">
                  <div className="flex items-center gap-2 font-bold text-slate-200">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: course.color }} />
                    <span>{course.courseName}</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 font-bold">
                    {course.completed}/{course.total} Tasks ({course.rate}%)
                  </span>
                </div>
                <div className="w-full bg-slate-850 h-2 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${course.rate}%`,
                      backgroundColor: course.color
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Timetable schedule weight per day */}
        <div className="lg:col-span-6 p-5 bg-[#131d31] border border-slate-800/80 rounded-2xl space-y-4">
          <h3 className="text-xs font-extrabold text-white uppercase tracking-wider border-b border-slate-800 pb-2">
            Weekly Class Workload hours (Lecture block weight)
          </h3>

          <div className="flex items-end justify-between h-48 gap-2 pt-4 px-2" id="day-workload-bars-chart">
            {dayWorkload.map((workload, index) => {
              // Convert hours to percentage of a max day weight (e.g. max 8 hours)
              const hrsNum = parseFloat(workload.hours);
              const percent = Math.min(100, Math.round((hrsNum / 8) * 100));

              return (
                <div key={index} className="flex-1 flex flex-col items-center h-full justify-end group">
                  {/* Tooltip */}
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 border border-slate-800 text-[9px] font-bold text-slate-200 rounded px-1.5 py-0.5 absolute translate-y-[-165px] z-10">
                    {workload.hours} hrs ({workload.count} slots)
                  </div>

                  {/* Visual Bar */}
                  <div
                    className="w-full bg-blue-600/35 hover:bg-blue-500 rounded-t-lg transition-all"
                    style={{ height: `${Math.max(6, percent)}%` }}
                  />

                  {/* Day label */}
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-2 block">
                    {workload.day.substring(0, 3)}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="p-3 bg-blue-950/20 border border-blue-900/35 rounded-xl flex items-center gap-2 mt-4">
            <TrendingUp className="w-4 h-4 text-blue-400 shrink-0" />
            <p className="text-[9px] text-slate-300 leading-relaxed font-medium">
              Daily timetables are analyzed to compute class workload density weights, allowing you to visually pinpoint heavy lecture days!
            </p>
          </div>
        </div>

      </div>

    </div>
  );
}
