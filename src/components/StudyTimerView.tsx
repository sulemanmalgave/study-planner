import React, { useState, useEffect, useRef } from 'react';
import {
  Clock,
  Play,
  Pause,
  RotateCcw,
  Award,
  CheckCircle,
  Volume2,
  Timer,
  Loader2,
  Target,
  Zap,
  Plus,
  BookOpen,
  Sparkles,
  AlertCircle,
  X,
  Check,
  Calendar,
  Flame
} from 'lucide-react';
import { Course, StudySession } from '../types';
import { useTranslation } from '../lib/i18n';

interface StudyTimerViewProps {
  courses: Course[];
  studySessions: StudySession[];
  onLogSession: (session: Omit<StudySession, 'id' | 'date'> & { date?: string }) => Promise<any>;
  onAddCourse?: (course: Omit<Course, 'id'>) => Promise<any>;
  onNavigateToTab?: (tab: string) => void;
}

export default function StudyTimerView({
  courses,
  studySessions,
  onLogSession,
  onAddCourse,
  onNavigateToTab
}: StudyTimerViewProps) {
  const { t, language, formatDate } = useTranslation();
  // Preset selection: 25 Min (1500s), 50 Min (3000s), Custom
  const [preset, setPreset] = useState<'25' | '50' | 'custom'>('25');
  const [customInputMinutes, setCustomInputMinutes] = useState(45);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');

  // Timer Core States
  const [duration, setDuration] = useState(1500); // in seconds
  const [timeLeft, setTimeLeft] = useState(1500);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  // Time & Session Tracking State
  const [startTime, setStartTime] = useState<string | null>(null);
  const [actualFocusedSeconds, setActualFocusedSeconds] = useState(0);
  const [pausedDurationSeconds, setPausedDurationSeconds] = useState(0);

  // Focus Mode State
  const [isFocusModeEnabled, setIsFocusModeEnabled] = useState(true);

  // Clean legacy notification storage keys if present
  useEffect(() => {
    try {
      localStorage.removeItem('study_planner_distraction_apps_v2');
      localStorage.removeItem('study_planner_distraction_apps');
      localStorage.removeItem('study_planner_win_notif_status');
    } catch (e) {
      // Ignore
    }
  }, []);

  // Modals
  const [isCompletionModalOpen, setIsCompletionModalOpen] = useState(false);
  const [lastCompletedMins, setLastCompletedMins] = useState(0);
  const [isInterruptedModalOpen, setIsInterruptedModalOpen] = useState(false);
  const [isAddCourseModalOpen, setIsAddCourseModalOpen] = useState(false);

  // New Subject Form
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectColor, setNewSubjectColor] = useState('#6750A4');

  // Loading state
  const [isLogging, setIsLogging] = useState(false);

  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Set default selected subject
  useEffect(() => {
    if (courses.length > 0 && !selectedCourseId) {
      setSelectedCourseId(courses[0].id);
    }
  }, [courses, selectedCourseId]);

  // Handle Preset changes
  useEffect(() => {
    if (!isRunning && !isPaused) {
      if (preset === '25') {
        setDuration(1500);
        setTimeLeft(1500);
      } else if (preset === '50') {
        setDuration(3000);
        setTimeLeft(3000);
      } else {
        const secs = Math.max(1, customInputMinutes) * 60;
        setDuration(secs);
        setTimeLeft(secs);
      }
    }
  }, [preset, customInputMinutes, isRunning, isPaused]);

  // Timer interval effect
  useEffect(() => {
    if (isRunning) {
      countdownIntervalRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            handleTimerComplete();
            return 0;
          }
          return prev - 1;
        });
        setActualFocusedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    }

    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [isRunning]);

  // Track paused time
  useEffect(() => {
    let pauseInterval: NodeJS.Timeout | null = null;
    if (isPaused) {
      pauseInterval = setInterval(() => {
        setPausedDurationSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (pauseInterval) clearInterval(pauseInterval);
    }
    return () => {
      if (pauseInterval) clearInterval(pauseInterval);
    };
  }, [isPaused]);

  // Audio completion sound
  const playAlertBuzzer = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const playBeep = (startTimeOffset: number, freq: number) => {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTimeOffset);

        gainNode.gain.setValueAtTime(0, startTimeOffset);
        gainNode.gain.linearRampToValueAtTime(0.3, startTimeOffset + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.01, startTimeOffset + 0.35);

        osc.start(startTimeOffset);
        osc.stop(startTimeOffset + 0.4);
      };

      playBeep(audioCtx.currentTime, 587.33); // D5
      playBeep(audioCtx.currentTime + 0.35, 659.25); // E5
      playBeep(audioCtx.currentTime + 0.7, 880.0); // A5
    } catch (e) {
      console.warn('Audio synthesis failed or blocked by autoplay rules:', e);
    }
  };

  // Start Focus Handler
  const handleStartFocus = () => {
    if (courses.length === 0) {
      setIsAddCourseModalOpen(true);
      return;
    }

    if (!selectedCourseId) {
      alert('Please select a subject first.');
      return;
    }

    if (!startTime) {
      setStartTime(new Date().toISOString());
    }

    setIsRunning(true);
    setIsPaused(false);
  };

  // Pause Timer Handler
  const handlePauseFocus = () => {
    setIsRunning(false);
    setIsPaused(true);
  };

  // Resume Timer Handler
  const handleResumeFocus = () => {
    setIsRunning(true);
    setIsPaused(false);
  };

  // Reset Timer Handler
  const handleResetTimer = () => {
    setIsRunning(false);
    setIsPaused(false);
    setStartTime(null);
    setActualFocusedSeconds(0);
    setPausedDurationSeconds(0);

    if (preset === '25') {
      setDuration(1500);
      setTimeLeft(1500);
    } else if (preset === '50') {
      setDuration(3000);
      setTimeLeft(3000);
    } else {
      const secs = Math.max(1, customInputMinutes) * 60;
      setDuration(secs);
      setTimeLeft(secs);
    }
  };

  // Handle Early End Session Trigger
  const handleEndSessionClick = () => {
    if (isRunning || isPaused || actualFocusedSeconds > 0) {
      setIsRunning(false);
      setIsPaused(false);
      setIsInterruptedModalOpen(true);
    } else {
      handleResetTimer();
    }
  };

  // Timer Reached Zero
  const handleTimerComplete = async () => {
    setIsRunning(false);
    setIsPaused(false);
    playAlertBuzzer();

    const selectedCourse = courses.find((c) => c.id === selectedCourseId);
    const focusedMins = Math.max(1, Math.round(actualFocusedSeconds / 60));
    setLastCompletedMins(focusedMins);

    setIsLogging(true);
    try {
      await onLogSession({
        durationMinutes: focusedMins,
        type: preset === '25' || preset === '50' ? 'pomodoro' : 'custom',
        courseId: selectedCourseId,
        subjectName: selectedCourse?.name || 'General',
        startTime: startTime || new Date().toISOString(),
        endTime: new Date().toISOString(),
        plannedDurationMinutes: Math.round(duration / 60),
        actualFocusedDurationSeconds: actualFocusedSeconds,
        pausedDurationSeconds: pausedDurationSeconds,
        status: 'completed',
        completed: true,
      });
    } catch (err) {
      console.error('Failed to log study session:', err);
    } finally {
      setIsLogging(false);
      setIsCompletionModalOpen(true);
    }
  };

  // Save Interrupted Session
  const handleSaveInterruptedSession = async () => {
    setIsInterruptedModalOpen(false);
    if (actualFocusedSeconds < 10) {
      handleResetTimer();
      return;
    }

    const selectedCourse = courses.find((c) => c.id === selectedCourseId);
    const focusedMins = Math.max(1, Math.round(actualFocusedSeconds / 60));

    setIsLogging(true);
    try {
      await onLogSession({
        durationMinutes: focusedMins,
        type: preset === '25' || preset === '50' ? 'pomodoro' : 'custom',
        courseId: selectedCourseId,
        subjectName: selectedCourse?.name || 'General',
        startTime: startTime || new Date().toISOString(),
        endTime: new Date().toISOString(),
        plannedDurationMinutes: Math.round(duration / 60),
        actualFocusedDurationSeconds: actualFocusedSeconds,
        pausedDurationSeconds: pausedDurationSeconds,
        status: 'interrupted',
        completed: focusedMins >= 1,
      });
    } catch (err) {
      console.error('Failed to save interrupted session:', err);
    } finally {
      setIsLogging(false);
      handleResetTimer();
    }
  };

  // Create New Subject
  const handleCreateSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubjectName.trim() || !onAddCourse) return;

    try {
      const created = await onAddCourse({
        name: newSubjectName.trim(),
        color: newSubjectColor,
      });
      if (created && created.id) {
        setSelectedCourseId(created.id);
      }
      setNewSubjectName('');
      setIsAddCourseModalOpen(false);
    } catch (err) {
      console.error('Failed to create course:', err);
    }
  };

  // Formatting helpers
  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const mStr = String(mins).padStart(2, '0');
    const sStr = String(secs).padStart(2, '0');

    if (hrs > 0) {
      const hStr = String(hrs).padStart(2, '0');
      return `${hStr}:${mStr}:${sStr}`;
    }
    return `${mStr}:${sStr}`;
  };

  const selectedCourse = courses.find((c) => c.id === selectedCourseId);

  // TODAY'S METRICS CALCULATIONS
  const todayStr = new Date().toISOString().split('T')[0];
  const todaySessions = studySessions.filter((s) => s.date === todayStr);

  const todayFocusedMins = todaySessions.reduce((acc, curr) => {
    if (curr.actualFocusedDurationSeconds) {
      return acc + Math.round(curr.actualFocusedDurationSeconds / 60);
    }
    return acc + (curr.durationMinutes || 0);
  }, 0);

  const todayHours = (todayFocusedMins / 60).toFixed(1);

  // Find most studied subject today
  const todaySubjectMap: Record<string, number> = {};
  todaySessions.forEach((s) => {
    const sName = s.subjectName || 'General';
    const mins = s.actualFocusedDurationSeconds
      ? Math.round(s.actualFocusedDurationSeconds / 60)
      : s.durationMinutes || 0;
    todaySubjectMap[sName] = (todaySubjectMap[sName] || 0) + mins;
  });

  let mostStudiedToday = 'None';
  let maxMins = 0;
  Object.entries(todaySubjectMap).forEach(([sName, mins]) => {
    if (mins > maxMins) {
      maxMins = mins;
      mostStudiedToday = sName;
    }
  });

  // Daily goal: 3 hours (180 mins)
  const dailyGoalMins = 180;
  const dailyProgressPercent = Math.min(100, Math.round((todayFocusedMins / dailyGoalMins) * 100));

  // Circular progress calculations
  const radius = 84;
  const circumference = 2 * Math.PI * radius;
  const progressRatio = duration > 0 ? (duration - timeLeft) / duration : 0;
  const strokeDashoffset = circumference * (1 - progressRatio);

  return (
    <div className="space-y-6 text-[#1D1B20]" id="study-timer-view-root">
      {/* TODAY'S STUDY COMPACT DASHBOARD CARD */}
      <div
        className="bg-white border border-[#E1E3E1] rounded-3xl p-4 sm:p-5 shadow-xs grid grid-cols-1 sm:grid-cols-12 gap-4 items-center"
        id="todays-study-compact-card"
      >
        <div className="sm:col-span-5 flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[#EADDFF] text-[#21005D] flex items-center justify-center shrink-0 border border-[#D0BCFF]/60 shadow-2xs">
            <Flame className="w-6 h-6 text-[#6750A4]" />
          </div>
          <div>
            <div className="text-[10px] font-extrabold text-[#79747E] uppercase tracking-wider">
              {language === 'fr-FR' ? 'Étude d\'aujourd\'hui' : "Today's Study"}
            </div>
            <div className="text-xl sm:text-2xl font-black text-[#1D1B20] tracking-tight">
              {todayFocusedMins >= 60 ? `${todayHours}h` : `${todayFocusedMins}m`}{' '}
              <span className="text-xs font-bold text-[#49454F]">
                ({todaySessions.length} {language === 'fr-FR' ? (todaySessions.length === 1 ? 'session' : 'sessions') : (todaySessions.length === 1 ? 'Session' : 'Sessions')})
              </span>
            </div>
            {mostStudiedToday !== 'None' && (
              <div className="text-xs font-semibold text-[#6750A4] mt-0.5">
                {language === 'fr-FR' ? 'Matière la plus étudiée :' : 'Most Studied:'} <strong className="font-extrabold">{mostStudiedToday}</strong>
              </div>
            )}
          </div>
        </div>

        {/* Daily Progress Goal Bar */}
        <div className="sm:col-span-7 flex flex-col justify-center space-y-1.5 border-t sm:border-t-0 sm:border-l border-slate-100 sm:pl-5 pt-3 sm:pt-0">
          <div className="flex justify-between items-center text-xs font-extrabold">
            <span className="text-[#1D1B20] uppercase tracking-wider text-[11px]">
              {language === 'fr-FR' ? 'Objectif quotidien (3h)' : 'Daily Progress Goal (3h)'}
            </span>
            <span className="text-[#6750A4]">{dailyProgressPercent}%</span>
          </div>
          <div className="w-full h-3 bg-[#F3EDF7] rounded-full overflow-hidden border border-[#E1E3E1]">
            <div
              className="h-full bg-[#6750A4] rounded-full transition-all duration-500"
              style={{ width: `${dailyProgressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* MAIN TIMER & FOCUS CONFIGURATION SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="focus-timer-main-grid">
        {/* LEFT COLUMN: TIMER STAGE */}
        <div className="lg:col-span-8 bg-white border border-[#E1E3E1] rounded-3xl p-6 sm:p-8 flex flex-col items-center justify-between space-y-6 shadow-xs">
          {/* Header & Subject Selector */}
          <div className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E1E3E1] pb-4">
            <div className="flex items-center gap-2">
              <Timer className="w-5 h-5 text-[#6750A4]" />
              <h3 className="text-base font-black text-[#1D1B20] tracking-tight">
                {language === 'fr-FR' ? 'Minuteur d\'étude' : 'Focus Study Timer'}
              </h3>
            </div>

            {/* Subject Dropdown / Add Subject */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold text-[#79747E] uppercase">
                {language === 'fr-FR' ? 'Matière :' : 'Subject:'}
              </span>
              {courses.length > 0 ? (
                <div className="relative">
                  <select
                    value={selectedCourseId}
                    onChange={(e) => setSelectedCourseId(e.target.value)}
                    disabled={isRunning || isPaused}
                    className="px-3.5 py-1.5 bg-[#F3EDF7] hover:bg-[#EADDFF]/50 border border-[#D0BCFF] text-[#1D1B20] font-extrabold text-xs sm:text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-[#6750A4] cursor-pointer disabled:opacity-75"
                    id="subject-selector-dropdown"
                  >
                    {courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <button
                  onClick={() => setIsAddCourseModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold rounded-xl hover:bg-rose-100 transition-colors cursor-pointer"
                  id="no-subjects-add-btn"
                >
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>
                    {language === 'fr-FR' ? 'Aucune matière — Ajouter une matière' : 'No subjects added yet — Add Subject'}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Active Subject Badge Display */}
          <div className="text-center space-y-1 my-2">
            <span
              className="inline-block px-3.5 py-1 rounded-full text-xs font-black uppercase tracking-wider text-white shadow-2xs"
              style={{ backgroundColor: selectedCourse?.color || '#6750A4' }}
              id="active-subject-badge"
            >
              {selectedCourse ? selectedCourse.name : (language === 'fr-FR' ? 'Sélectionner une matière' : 'Select a Subject')}
            </span>
          </div>

          {/* Preset Buttons */}
          <div className="flex items-center justify-center gap-2 bg-[#F3EDF7] p-1.5 rounded-2xl border border-[#E1E3E1]">
            <button
              onClick={() => setPreset('25')}
              disabled={isRunning || isPaused}
              className={`px-4 py-2 text-xs font-extrabold rounded-xl transition-all cursor-pointer ${
                preset === '25'
                  ? 'bg-[#6750A4] text-white shadow-2xs'
                  : 'text-[#49454F] hover:text-[#1D1B20]'
              }`}
            >
              {language === 'fr-FR' ? '25 min' : '25 Min'}
            </button>
            <button
              onClick={() => setPreset('50')}
              disabled={isRunning || isPaused}
              className={`px-4 py-2 text-xs font-extrabold rounded-xl transition-all cursor-pointer ${
                preset === '50'
                  ? 'bg-[#6750A4] text-white shadow-2xs'
                  : 'text-[#49454F] hover:text-[#1D1B20]'
              }`}
            >
              {language === 'fr-FR' ? '50 min' : '50 Min'}
            </button>
            <button
              onClick={() => setPreset('custom')}
              disabled={isRunning || isPaused}
              className={`px-4 py-2 text-xs font-extrabold rounded-xl transition-all cursor-pointer ${
                preset === 'custom'
                  ? 'bg-[#6750A4] text-white shadow-2xs'
                  : 'text-[#49454F] hover:text-[#1D1B20]'
              }`}
            >
              {language === 'fr-FR' ? 'Personnalisé' : 'Custom'}
            </button>
          </div>

          {/* Custom Duration Input */}
          {preset === 'custom' && (
            <div className="flex items-center gap-3 bg-[#F3EDF7]/60 p-2.5 rounded-2xl border border-[#E1E3E1]">
              <span className="text-xs font-bold text-[#49454F]">
                {language === 'fr-FR' ? 'Définir la durée (Minutes) :' : 'Set Duration (Minutes):'}
              </span>
              <input
                type="number"
                min={1}
                max={300}
                value={customInputMinutes}
                onChange={(e) => setCustomInputMinutes(Math.max(1, parseInt(e.target.value) || 1))}
                disabled={isRunning || isPaused}
                className="w-20 bg-white border border-[#D0BCFF] text-center text-sm font-extrabold text-[#1D1B20] py-1 rounded-xl outline-none focus:ring-2 focus:ring-[#6750A4]"
              />
            </div>
          )}

          {/* CIRCULAR TIMER DISPLAY */}
          <div className="relative w-56 h-56 sm:w-64 sm:h-64 flex items-center justify-center my-4" id="visual-timer-ring">
            <svg className="absolute inset-0 w-full h-full rotate-[-90deg]">
              <circle
                cx="50%"
                cy="50%"
                r={radius}
                className="stroke-[#E1E3E1]"
                strokeWidth={10}
                fill="none"
              />
              <circle
                cx="50%"
                cy="50%"
                r={radius}
                className="stroke-[#6750A4] transition-all duration-300"
                strokeWidth={10}
                fill="none"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
              />
            </svg>

            <div className="text-center space-y-1 z-10">
              <div className="text-4xl sm:text-5xl font-black text-[#1D1B20] tracking-wider font-mono">
                {formatTime(timeLeft)}
              </div>
              <div className="text-xs font-extrabold text-[#6750A4] uppercase tracking-widest">
                {isRunning
                  ? (language === 'fr-FR' ? 'Concentration en cours' : 'Focused Study')
                  : isPaused
                  ? (language === 'fr-FR' ? 'En pause' : 'Paused')
                  : (language === 'fr-FR' ? 'Prêt' : 'Ready')}
              </div>
            </div>
          </div>

          {/* TIMER CONTROLS BUTTONS */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            {!isRunning && !isPaused ? (
              <button
                onClick={handleStartFocus}
                className="px-8 py-3.5 bg-[#6750A4] hover:bg-[#503E84] text-white font-extrabold text-sm sm:text-base rounded-2xl tracking-wide flex items-center gap-2.5 transition-all shadow-md hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                id="start-focus-btn"
              >
                <Play className="w-5 h-5 fill-current" />
                <span>{language === 'fr-FR' ? 'Démarrer' : 'Start Focus'}</span>
              </button>
            ) : isRunning ? (
              <button
                onClick={handlePauseFocus}
                className="px-6 py-3.5 bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-sm rounded-2xl tracking-wide flex items-center gap-2 transition-all shadow-sm hover:scale-[1.02] cursor-pointer"
                id="pause-focus-btn"
              >
                <Pause className="w-5 h-5 fill-current" />
                <span>{language === 'fr-FR' ? 'Pause' : 'Pause'}</span>
              </button>
            ) : (
              <button
                onClick={handleResumeFocus}
                className="px-6 py-3.5 bg-[#6750A4] hover:bg-[#503E84] text-white font-extrabold text-sm rounded-2xl tracking-wide flex items-center gap-2 transition-all shadow-sm hover:scale-[1.02] cursor-pointer"
                id="resume-focus-btn"
              >
                <Play className="w-5 h-5 fill-current" />
                <span>{language === 'fr-FR' ? 'Reprendre' : 'Resume'}</span>
              </button>
            )}

            {(isRunning || isPaused || actualFocusedSeconds > 0) && (
              <button
                onClick={handleEndSessionClick}
                className="px-5 py-3.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-extrabold text-xs sm:text-sm rounded-2xl transition-all cursor-pointer"
                id="end-session-btn"
              >
                {language === 'fr-FR' ? 'Terminer la session' : 'End Session'}
              </button>
            )}

            <button
              onClick={handleResetTimer}
              className="p-3.5 bg-[#F3EDF7] hover:bg-[#EADDFF] text-[#1D1B20] border border-[#E1E3E1] rounded-2xl transition-all cursor-pointer"
              title={language === 'fr-FR' ? 'Réinitialiser le minuteur' : 'Reset Timer'}
              id="reset-timer-btn"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
          </div>

          {isLogging && (
            <div className="flex items-center gap-2 text-xs font-bold text-[#6750A4] animate-pulse">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{language === 'fr-FR' ? 'Enregistrement de la session...' : 'Saving focused study session...'}</span>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: FOCUS MODE & NOTIFICATIONS & SESSION HISTORY */}
        <div className="lg:col-span-4 space-y-6">
          {/* FOCUS MODE CARD */}
          <div className="bg-white border border-[#E1E3E1] rounded-3xl p-5 space-y-3 shadow-xs" id="focus-mode-card">
            <div className="flex items-center justify-between border-b border-[#E1E3E1] pb-3">
              <div className="flex items-center gap-2">
                <Target className="w-5 h-5 text-[#6750A4]" />
                <h4 className="text-sm font-black text-[#1D1B20] tracking-tight">
                  {language === 'fr-FR' ? 'Mode concentration' : 'Focus Mode'}
                </h4>
              </div>

              {/* Toggle switch */}
              <button
                onClick={() => setIsFocusModeEnabled(!isFocusModeEnabled)}
                className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer p-0.5 ${
                  isFocusModeEnabled ? 'bg-[#6750A4]' : 'bg-slate-300'
                }`}
                id="focus-mode-toggle"
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    isFocusModeEnabled ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <p className="text-xs text-[#49454F] font-medium leading-relaxed">
              {language === 'fr-FR'
                ? 'Restez concentré et enregistrez vos progrès d\'étude.'
                : 'Stay focused and track your study session.'}
            </p>

            <div className="p-3 rounded-2xl bg-[#F3EDF7]/60 border border-[#E1E3E1] flex items-center gap-2 text-xs font-semibold text-[#1D1B20]">
              <Zap className="w-4 h-4 text-[#6750A4] shrink-0" />
              <span>
                {isFocusModeEnabled
                  ? (language === 'fr-FR'
                      ? 'Suivi actif. Lancez le minuteur lorsque vous êtes prêt.'
                      : 'Focus tracking active. Start timer when ready.')
                  : (language === 'fr-FR' ? 'Mode concentration suspendu.' : 'Focus Mode paused.')}
              </span>
            </div>
          </div>

          {/* SESSION HISTORY LIST */}
          <div className="bg-white border border-[#E1E3E1] rounded-3xl p-5 space-y-3 shadow-xs" id="session-history-card">
            <div className="flex items-center justify-between border-b border-[#E1E3E1] pb-3">
              <h4 className="text-sm font-black text-[#1D1B20] tracking-tight flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#6750A4]" />
                <span>{language === 'fr-FR' ? 'Historique des sessions' : 'Session History'}</span>
              </h4>
              <span className="text-xs font-bold text-[#79747E]">
                {studySessions.length} {language === 'fr-FR' ? 'au total' : 'Total'}
              </span>
            </div>

            <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1" id="session-history-list">
              {studySessions.length > 0 ? (
                studySessions
                  .slice()
                  .reverse()
                  .map((session) => {
                    const course = courses.find((c) => c.id === session.courseId);
                    const subjectName = session.subjectName || course?.name || (language === 'fr-FR' ? 'Général' : 'General');
                    const focusedMins = session.actualFocusedDurationSeconds
                      ? Math.round(session.actualFocusedDurationSeconds / 60)
                      : session.durationMinutes || 0;

                    return (
                      <div
                        key={session.id}
                        className="p-3 bg-[#F3EDF7]/40 border border-[#E1E3E1] rounded-2xl flex items-center justify-between gap-3 hover:bg-[#F3EDF7] transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: course?.color || '#6750A4' }}
                            />
                            <h5 className="text-xs font-extrabold text-[#1D1B20] truncate">
                              {subjectName}
                            </h5>
                          </div>
                          <div className="text-[11px] font-medium text-[#79747E]">
                            {formatDate(session.date)} • {focusedMins} {language === 'fr-FR' ? 'min de révision' : 'min focused'}
                          </div>
                        </div>

                        <span
                          className={`px-2 py-0.5 text-[10px] font-extrabold rounded-md uppercase tracking-wider shrink-0 ${
                            session.status === 'interrupted' || session.completed === false
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {session.status === 'interrupted'
                            ? (language === 'fr-FR' ? 'Interrompue' : 'Interrupted')
                            : (language === 'fr-FR' ? 'Terminée' : 'Completed')}
                        </span>
                      </div>
                    );
                  })
              ) : (
                <div className="text-center py-8 text-xs text-[#79747E] font-medium">
                  {language === 'fr-FR'
                    ? 'Aucune session enregistrée pour le moment. Sélectionnez une matière et lancez votre première session !'
                    : 'No sessions recorded yet. Select a subject and start your first focus session!'}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* SESSION COMPLETION MODAL */}
      {isCompletionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs" id="session-completion-modal">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-5 text-center shadow-2xl border border-[#E1E3E1]">
            <div className="w-16 h-16 rounded-full bg-[#EADDFF] text-[#6750A4] flex items-center justify-center mx-auto shadow-sm">
              <Sparkles className="w-8 h-8" />
            </div>

            <h3 className="text-xl font-black text-[#1D1B20] tracking-tight">
              {language === 'fr-FR' ? 'Session d\'étude terminée ! 🎉' : 'Study Session Complete! 🎉'}
            </h3>

            <div className="p-4 bg-[#F3EDF7] rounded-2xl border border-[#E1E3E1] space-y-1">
              <div className="text-xs font-bold text-[#79747E] uppercase tracking-wider">
                {selectedCourse?.name || (language === 'fr-FR' ? 'Général' : 'General')}
              </div>
              <div className="text-2xl font-black text-[#1D1B20]">
                {lastCompletedMins} {language === 'fr-FR' ? 'minutes de concentration' : 'minutes focused'}
              </div>
              <p className="text-xs text-[#49454F] font-semibold pt-1">
                {language === 'fr-FR'
                  ? 'Bravo ! Votre temps de travail a été ajouté aux statistiques de la matière.'
                  : 'Great job! Your focus time has been added to your subject statistics.'}
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => {
                  setIsCompletionModalOpen(false);
                  handleResetTimer();
                }}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-[#1D1B20] font-extrabold text-xs rounded-full transition-colors cursor-pointer"
                id="completion-modal-done-btn"
              >
                {language === 'fr-FR' ? 'Terminé' : 'Done'}
              </button>

              <button
                onClick={() => {
                  setIsCompletionModalOpen(false);
                  handleResetTimer();
                  if (onNavigateToTab) onNavigateToTab('progress');
                }}
                className="flex-1 py-2.5 bg-[#6750A4] hover:bg-[#503E84] text-white font-extrabold text-xs rounded-full transition-colors shadow-xs cursor-pointer"
                id="completion-modal-view-progress-btn"
              >
                {language === 'fr-FR' ? 'Voir mes progrès' : 'View Progress'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* INTERRUPTED SESSION MODAL */}
      {isInterruptedModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs" id="interrupted-session-modal">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 space-y-4 text-center shadow-2xl border border-[#E1E3E1]">
            <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>

            <h3 className="text-lg font-black text-[#1D1B20]">
              {language === 'fr-FR' ? 'Terminer la session d\'étude ?' : 'End Study Session?'}
            </h3>

            <p className="text-xs text-[#49454F] font-medium">
              {language === 'fr-FR' ? 'Temps étudié :' : 'You studied for:'}{' '}
              <strong className="text-[#1D1B20]">
                {Math.floor(actualFocusedSeconds / 60)} min {actualFocusedSeconds % 60} {language === 'fr-FR' ? 's' : 'sec'}
              </strong>
            </p>

            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={() => {
                  setIsInterruptedModalOpen(false);
                  setIsRunning(true);
                }}
                className="w-full py-2.5 bg-[#6750A4] text-white font-extrabold text-xs rounded-full cursor-pointer shadow-xs"
              >
                {language === 'fr-FR' ? 'Continuer la session' : 'Continue Studying'}
              </button>

              <button
                onClick={handleSaveInterruptedSession}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-[#1D1B20] font-extrabold text-xs rounded-full cursor-pointer"
              >
                {language === 'fr-FR' ? 'Terminer & Enregistrer' : 'End & Save'}
              </button>

              <button
                onClick={() => {
                  setIsInterruptedModalOpen(false);
                  handleResetTimer();
                }}
                className="w-full py-2 bg-transparent text-rose-600 hover:text-rose-700 font-bold text-xs cursor-pointer"
              >
                {language === 'fr-FR' ? 'Abandonner' : 'Discard'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD SUBJECT MODAL */}
      {isAddCourseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs" id="add-subject-modal">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl border border-[#E1E3E1]">
            <div className="flex items-center justify-between border-b border-[#E1E3E1] pb-3">
              <h3 className="text-base font-black text-[#1D1B20] flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-[#6750A4]" />
                <span>{language === 'fr-FR' ? 'Ajouter une matière' : 'Add New Subject'}</span>
              </h3>
              <button
                onClick={() => setIsAddCourseModalOpen(false)}
                className="p-1 text-[#79747E] hover:text-[#1D1B20] rounded-full cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubject} className="space-y-4">
              <div>
                <label className="block text-xs font-extrabold text-[#1D1B20] uppercase tracking-wider mb-1.5">
                  {language === 'fr-FR' ? 'Nom de la matière *' : 'Subject Name *'}
                </label>
                <input
                  type="text"
                  required
                  value={newSubjectName}
                  onChange={(e) => setNewSubjectName(e.target.value)}
                  placeholder={language === 'fr-FR' ? 'ex. Mathématiques, Anglais, Physique' : 'e.g. Mathematics, English, Physics'}
                  className="w-full px-3.5 py-2.5 bg-white border border-[#E1E3E1] rounded-xl text-xs sm:text-sm text-[#1D1B20] focus:outline-none focus:border-[#6750A4]"
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold text-[#1D1B20] uppercase tracking-wider mb-1.5">
                  {language === 'fr-FR' ? 'Couleur de l\'étiquette' : 'Badge Color'}
                </label>
                <div className="flex items-center gap-2">
                  {['#6750A4', '#2563eb', '#16a34a', '#d97706', '#dc2626', '#9333ea'].map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setNewSubjectColor(color)}
                      className={`w-7 h-7 rounded-full transition-transform cursor-pointer ${
                        newSubjectColor === color ? 'scale-110 ring-2 ring-offset-2 ring-[#6750A4]' : ''
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-[#E1E3E1] pt-3">
                <button
                  type="button"
                  onClick={() => setIsAddCourseModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-[#49454F] hover:bg-slate-100 rounded-full cursor-pointer"
                >
                  {language === 'fr-FR' ? 'Annuler' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={!newSubjectName.trim()}
                  className="px-5 py-2 bg-[#6750A4] disabled:opacity-50 text-white text-xs font-extrabold rounded-full cursor-pointer shadow-xs"
                >
                  {language === 'fr-FR' ? 'Créer la matière' : 'Create Subject'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
