import React from 'react';
import { BookOpen, Star, Clock, CheckSquare, GraduationCap, Flame, Target, Award, Sparkles } from 'lucide-react';
import { Course, TimetablePeriod, Assignment, Exam, StudySession } from '../types';
import { useTranslation } from '../lib/i18n';

interface ProgressViewProps {
  courses: Course[];
  timetable: TimetablePeriod[];
  assignments: Assignment[];
  exams: Exam[];
  studySessions: StudySession[];
  isPremium: boolean;
  onTriggerUpgrade: () => void;
}

export default function ProgressView({
  courses,
  timetable,
  assignments,
  exams,
  studySessions,
  isPremium,
  onTriggerUpgrade
}: ProgressViewProps) {
  const { t, language } = useTranslation();

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
    : studySessions.filter((s) => s.date >= cutoffDateStr);

  const displayAssignments = isPremium
    ? assignments
    : assignments.filter((a) => a.dueDate >= cutoffDateStr);

  const displayExams = isPremium
    ? exams
    : exams.filter((e) => {
        const examDateStr = e.date.split('T')[0];
        return examDateStr >= cutoffDateStr;
      });

  // 1. Calculations
  const pendingTasks = displayAssignments.filter((a) => a.status === 'pending').length;
  const completedTasks = displayAssignments.filter((a) => a.status === 'completed').length;
  const totalTasks = displayAssignments.length;
  const taskCompletionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const totalStudyMins = displaySessions
    .filter((s) => s.type !== 'break')
    .reduce((acc, curr) => {
      if (curr.actualFocusedDurationSeconds) {
        return acc + Math.round(curr.actualFocusedDurationSeconds / 60);
      }
      return acc + (curr.durationMinutes || 0);
    }, 0);

  const studyHrs = (totalStudyMins / 60).toFixed(1);

  const upcomingExams = displayExams.filter((e) => e.status === 'upcoming').length;
  const completedExams = displayExams.filter((e) => e.status === 'completed').length;

  // TODAY'S STUDY STATS
  const todayStr = new Date().toISOString().split('T')[0];
  const todaySessions = displaySessions.filter((s) => s.date === todayStr);
  const todayFocusedMins = todaySessions.reduce((acc, curr) => {
    if (curr.actualFocusedDurationSeconds) {
      return acc + Math.round(curr.actualFocusedDurationSeconds / 60);
    }
    return acc + (curr.durationMinutes || 0);
  }, 0);

  const todayHoursStr =
    todayFocusedMins >= 60
      ? `${Math.floor(todayFocusedMins / 60)}h ${todayFocusedMins % 60}m`
      : `${todayFocusedMins}m`;

  // WEEK'S STUDY STATS
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const weekCutoff = sevenDaysAgo.toISOString().split('T')[0];
  const weekSessions = displaySessions.filter((s) => s.date >= weekCutoff);

  // SUBJECT-WISE STUDY STATS
  const subjectStatsMap = courses.map((course) => {
    // Match sessions for this course
    const courseSessions = displaySessions.filter((s) => {
      if (s.status === 'cancelled') return false; // Do not count cancelled sessions
      if (s.courseId) return s.courseId === course.id;
      if (s.subjectName) return s.subjectName.toLowerCase() === course.name.toLowerCase();
      return false;
    });

    const completedSessions = courseSessions.filter((s) => s.status !== 'interrupted' && s.completed !== false);

    const totalMins = courseSessions.reduce((acc, curr) => {
      if (curr.actualFocusedDurationSeconds) {
        return acc + Math.round(curr.actualFocusedDurationSeconds / 60);
      }
      return acc + (curr.durationMinutes || 0);
    }, 0);

    const todayMins = courseSessions
      .filter((s) => s.date === todayStr)
      .reduce((acc, curr) => {
        if (curr.actualFocusedDurationSeconds) {
          return acc + Math.round(curr.actualFocusedDurationSeconds / 60);
        }
        return acc + (curr.durationMinutes || 0);
      }, 0);

    const weekMins = courseSessions
      .filter((s) => s.date >= weekCutoff)
      .reduce((acc, curr) => {
        if (curr.actualFocusedDurationSeconds) {
          return acc + Math.round(curr.actualFocusedDurationSeconds / 60);
        }
        return acc + (curr.durationMinutes || 0);
      }, 0);

    const sessionCount = completedSessions.length;
    const avgMins = sessionCount > 0 ? Math.round(totalMins / sessionCount) : 0;

    const formattedTotal =
      totalMins >= 60
        ? `${Math.floor(totalMins / 60)}h ${totalMins % 60}m`
        : `${totalMins}m`;

    return {
      courseId: course.id,
      courseName: course.name,
      color: course.color,
      totalMins,
      formattedTotal,
      sessionCount,
      avgMins,
      todayMins,
      weekMins,
    };
  });

  // Calculate distribution of tasks per course
  const courseDistribution = courses.map((course) => {
    const courseAssignments = displayAssignments.filter((a) => a.courseId === course.id);
    const total = courseAssignments.length;
    const completed = courseAssignments.filter((a) => a.status === 'completed').length;
    const rate = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      courseName: course.name,
      color: course.color,
      total,
      completed,
      rate,
    };
  });

  // Daily & Weekly Goal
  const dailyGoalMins = 180; // 3 hours
  const dailyGoalPercent = Math.min(100, Math.round((todayFocusedMins / dailyGoalMins) * 100));

  const weeklyGoalMins = 900; // 15 hours
  const weekFocusedMins = weekSessions.reduce((acc, curr) => {
    if (curr.actualFocusedDurationSeconds) {
      return acc + Math.round(curr.actualFocusedDurationSeconds / 60);
    }
    return acc + (curr.durationMinutes || 0);
  }, 0);
  const weeklyGoalPercent = Math.min(100, Math.round((weekFocusedMins / weeklyGoalMins) * 100));

  return (
    <div className="space-y-6 text-[#1D1B20]" id="progress-view-root">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 bg-[#131d31] border border-slate-800/80 rounded-3xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-2xl">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white tracking-wide uppercase">
              {t('progress.headerTitle')}
            </h2>
            <p className="text-[10px] font-mono text-slate-400 mt-1 uppercase">
              {t('progress.headerSubtitle')}
            </p>
          </div>
        </div>
      </div>

      {/* History Limit Warning Banner */}
      {!isPremium && (
        <div
          className="p-4 bg-amber-500/10 border border-amber-500/20 text-amber-200 rounded-3xl flex items-center justify-between gap-4"
          id="progress-history-limit-banner"
        >
          <div className="flex items-center gap-2.5">
            <Star className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="text-left">
              <p className="text-xs font-bold text-amber-200">{t('progress.freePlanLimitTitle')}</p>
              <p className="text-[10px] text-amber-300/80 mt-0.5">
                {t('progress.freePlanLimitDesc')}
              </p>
            </div>
          </div>
          <button
            onClick={onTriggerUpgrade}
            className="px-3.5 py-1.5 bg-[#6750A4] hover:bg-[#503E84] text-[9px] font-black text-white rounded-full transition-all uppercase tracking-wider shrink-0 cursor-pointer"
          >
            {t('progress.upgrade')}
          </button>
        </div>
      )}

      {/* TODAY'S STUDY & GOALS CARD */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4" id="todays-study-progress-card">
        {/* Today's Study Card */}
        <div className="p-5 bg-white border border-[#E1E3E1] rounded-3xl space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-[#E1E3E1] pb-3">
            <span className="text-xs font-black text-[#1D1B20] uppercase tracking-wider flex items-center gap-2">
              <Flame className="w-4 h-4 text-[#6750A4]" />
              <span>{t('progress.todaysStudy')}</span>
            </span>
            <span className="text-xs font-extrabold text-[#6750A4]">
              {todaySessions.length} {todaySessions.length === 1 ? t('progress.session') : t('progress.sessions')}
            </span>
          </div>

          <div className="flex items-baseline justify-between">
            <div>
              <div className="text-xs font-bold text-[#79747E] uppercase">{t('progress.totalFocusedTime')}</div>
              <div className="text-3xl font-black text-[#1D1B20] tracking-tight">{todayHoursStr}</div>
            </div>

            <div className="text-right">
              <div className="text-xs font-bold text-[#79747E] uppercase">{t('progress.dailyGoal')}</div>
              <div className="text-base font-extrabold text-[#6750A4]">
                {Math.floor(todayFocusedMins / 60)}h / 3h ({dailyGoalPercent}%)
              </div>
            </div>
          </div>

          <div className="w-full bg-[#F3EDF7] h-3 rounded-full overflow-hidden border border-[#E1E3E1]">
            <div
              className="bg-[#6750A4] h-full rounded-full transition-all duration-500"
              style={{ width: `${dailyGoalPercent}%` }}
            />
          </div>
        </div>

        {/* Weekly Goal Card */}
        <div className="p-5 bg-white border border-[#E1E3E1] rounded-3xl space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-[#E1E3E1] pb-3">
            <span className="text-xs font-black text-[#1D1B20] uppercase tracking-wider flex items-center gap-2">
              <Target className="w-4 h-4 text-emerald-600" />
              <span>{t('progress.weeklyGoalProgress')}</span>
            </span>
            <span className="text-xs font-extrabold text-emerald-700">
              {weeklyGoalPercent}%
            </span>
          </div>

          <div className="flex items-baseline justify-between">
            <div>
              <div className="text-xs font-bold text-[#79747E] uppercase">{t('progress.thisWeekFocused')}</div>
              <div className="text-3xl font-black text-[#1D1B20] tracking-tight">
                {Math.floor(weekFocusedMins / 60)}h {weekFocusedMins % 60}m
              </div>
            </div>

            <div className="text-right">
              <div className="text-xs font-bold text-[#79747E] uppercase">{t('progress.weeklyTarget')}</div>
              <div className="text-base font-extrabold text-emerald-700">15 {t('progress.hoursUnit')}</div>
            </div>
          </div>

          <div className="w-full bg-[#F3EDF7] h-3 rounded-full overflow-hidden border border-[#E1E3E1]">
            <div
              className="bg-emerald-600 h-full rounded-full transition-all duration-500"
              style={{ width: `${weeklyGoalPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* SUBJECT PROGRESS TRACKING */}
      <div className="p-6 bg-white border border-[#E1E3E1] rounded-3xl space-y-5 shadow-xs" id="subject-progress-section">
        <div className="flex items-center justify-between border-b border-[#E1E3E1] pb-3">
          <h3 className="text-base font-black text-[#1D1B20] flex items-center gap-2">
            <Award className="w-5 h-5 text-[#6750A4]" />
            <span>{t('progress.subjectProgressTitle')}</span>
          </h3>
          <span className="text-xs font-extrabold text-[#79747E]">
            {t('progress.subjectsCount', { count: courses.length })}
          </span>
        </div>

        {subjectStatsMap.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" id="subject-stats-grid">
            {subjectStatsMap.map((subj) => (
              <div
                key={subj.courseId}
                className="p-4 bg-[#F3EDF7]/40 border border-[#E1E3E1] rounded-2xl space-y-3 hover:bg-[#F3EDF7] transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: subj.color }}
                    />
                    <h4 className="text-sm font-black text-[#1D1B20] truncate">
                      {subj.courseName}
                    </h4>
                  </div>
                  <span className="text-xs font-black text-[#6750A4] bg-white px-2.5 py-1 rounded-lg border border-[#E1E3E1]">
                    {subj.formattedTotal}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-[#E1E3E1]/60">
                  <div>
                    <span className="text-[10px] font-bold text-[#79747E] uppercase block">{t('progress.sessionsLabel')}</span>
                    <span className="font-extrabold text-[#1D1B20]">
                      {subj.sessionCount} {subj.sessionCount === 1 ? t('progress.session') : t('progress.sessions')}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-[#79747E] uppercase block">{t('progress.avgDuration')}</span>
                    <span className="font-extrabold text-[#1D1B20]">{subj.avgMins} {t('progress.minsUnit')}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-[#79747E] uppercase block">{t('progress.todayLabel')}</span>
                    <span className="font-extrabold text-[#1D1B20]">{subj.todayMins} {t('progress.minsUnit')}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-[#79747E] uppercase block">{t('progress.thisWeekLabel')}</span>
                    <span className="font-extrabold text-[#1D1B20]">
                      {subj.weekMins >= 60 ? `${(subj.weekMins / 60).toFixed(1)}h` : `${subj.weekMins}m`}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-xs text-[#79747E] font-medium">
            {t('progress.noSubjectsTracked')}
          </div>
        )}
      </div>

      {/* OTHER PERFORMANCE METRICS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4" id="progress-stats-bento">
        {/* Metric 1: Assignment Completion */}
        <div className="p-5 bg-[#131d31] border border-slate-800/80 rounded-3xl space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {t('progress.assignmentCompletion')}
            </span>
            <CheckSquare className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-white">{taskCompletionRate}%</span>
            <span className="text-[10px] font-semibold text-slate-400">
              {t('progress.completedOutOf', { completed: completedTasks, total: totalTasks })}
            </span>
          </div>
          <div className="w-full bg-slate-850 h-2 rounded-full overflow-hidden">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all"
              style={{ width: `${taskCompletionRate}%` }}
            />
          </div>
        </div>

        {/* Metric 2: Revision Focus Hours */}
        <div className="p-5 bg-[#131d31] border border-slate-800/80 rounded-3xl space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {t('progress.totalRevisionFocus')}
            </span>
            <Clock className="w-4 h-4 text-blue-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-white">{studyHrs} {language === 'fr-FR' ? 'h' : 'hrs'}</span>
            <span className="text-[10px] font-semibold text-slate-400">
              {t('progress.focusSessionsCount', { count: displaySessions.length })}
            </span>
          </div>
          <div className="text-[10px] text-slate-400 leading-relaxed font-medium">
            {t('progress.revisionHelpText')}
          </div>
        </div>

        {/* Metric 3: Exams Pacing */}
        <div className="p-5 bg-[#131d31] border border-slate-800/80 rounded-3xl space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {t('progress.examsStatusPacing')}
            </span>
            <GraduationCap className="w-4 h-4 text-purple-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-white">
              {t('progress.totalExams', { count: completedExams + upcomingExams })}
            </span>
            <span className="text-[10px] font-semibold text-slate-400">
              {t('progress.upcomingAlerts', { count: upcomingExams })}
            </span>
          </div>
          <div className="text-[10px] text-slate-400 leading-relaxed font-medium">
            {t('progress.calendarHelpText')}
          </div>
        </div>
      </div>
    </div>
  );
}
