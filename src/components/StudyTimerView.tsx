import React, { useState, useEffect, useRef } from 'react';
import { Clock, Play, Pause, RotateCcw, Award, CheckCircle, Volume2, Timer, Loader2 } from 'lucide-react';
import { StudySession } from '../types';

interface StudyTimerViewProps {
  studySessions: StudySession[];
  onLogSession: (session: Omit<StudySession, 'id' | 'date'>) => Promise<void>;
}

export default function StudyTimerView({ studySessions, onLogSession }: StudyTimerViewProps) {
  const [timerType, setTimerType] = useState<'pomodoro' | 'custom' | 'break'>('pomodoro');
  
  // Timer settings in seconds
  const [duration, setDuration] = useState(1500); // 25 mins by default
  const [timeLeft, setTimeLeft] = useState(1500);
  const [isRunning, setIsRunning] = useState(false);
  const [customInputMinutes, setCustomInputMinutes] = useState(45);
  const [isLogging, setIsLogging] = useState(false);

  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize timers when type changes
  useEffect(() => {
    setIsRunning(false);
    if (timerType === 'pomodoro') {
      setDuration(1500);
      setTimeLeft(1500);
    } else if (timerType === 'break') {
      setDuration(300); // 5 mins break
      setTimeLeft(300);
    } else {
      const secs = customInputMinutes * 60;
      setDuration(secs);
      setTimeLeft(secs);
    }
  }, [timerType, customInputMinutes]);

  // Handle countdown
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
      }, 1000);
    } else {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    }

    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [isRunning]);

  // Synthesize Web Audio alert on completion
  const playAlertBuzzer = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Play alarm chime (3 beeps)
      const playBeep = (startTime: number, freq: number) => {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);
        
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(0.3, startTime + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.3);

        osc.start(startTime);
        osc.stop(startTime + 0.35);
      };

      playBeep(audioCtx.currentTime, 587.33); // D5
      playBeep(audioCtx.currentTime + 0.4, 659.25); // E5
      playBeep(audioCtx.currentTime + 0.8, 880); // A5
    } catch (e) {
      console.warn('Audio synthesis failed or was blocked by browser autoplay rules:', e);
    }
  };

  const handleTimerComplete = async () => {
    setIsRunning(false);
    playAlertBuzzer();
    
    // Auto Log session to database (exclude breaks)
    if (timerType !== 'break') {
      setIsLogging(true);
      try {
        const activeMinutes = Math.round(duration / 60);
        await onLogSession({
          durationMinutes: activeMinutes,
          type: timerType
        });
      } catch (err) {
        console.error('Failed to auto-log study session:', err);
      } finally {
        setIsLogging(false);
      }
    }
  };

  const handleToggleTimer = () => {
    setIsRunning(!isRunning);
  };

  const handleResetTimer = () => {
    setIsRunning(false);
    setTimeLeft(duration);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Calculate session logs count and total hours
  const activeSessions = studySessions.filter(s => s.type !== 'break');
  const loggedMinutesTotal = activeSessions.reduce((acc, curr) => acc + curr.durationMinutes, 0);
  const totalLoggedHours = (loggedMinutesTotal / 60).toFixed(1);

  // SVG Progress Arc Circle Calculations
  const radius = 80;
  const circumference = 2 * Math.PI * radius;
  const progressRatio = duration > 0 ? (duration - timeLeft) / duration : 0;
  const strokeDashoffset = circumference * (1 - progressRatio);

  return (
    <div className="space-y-6 text-[#1D1B20]" id="study-timer-view-root">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 bg-white border border-[#E1E3E1] rounded-2xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-[#EADDFF] text-[#21005D] rounded-xl border border-[#D0BCFF]">
            <Timer className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#1D1B20] tracking-wide uppercase">Deep Work Study Timer</h2>
            <p className="text-[10px] font-mono text-[#49454F] mt-1 uppercase">Maximize focus with Pomodoro or Custom Intervals</p>
          </div>
        </div>

        <div className="flex bg-[#F3EDF7] p-1 rounded-xl border border-[#E1E3E1]">
          <button
            onClick={() => setTimerType('pomodoro')}
            className={`px-3 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all ${
              timerType === 'pomodoro'
                ? 'bg-[#6750A4] text-white'
                : 'text-[#49454F] hover:text-[#1D1B20]'
            }`}
          >
            Pomodoro (25m)
          </button>
          <button
            onClick={() => setTimerType('custom')}
            className={`px-3 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all ${
              timerType === 'custom'
                ? 'bg-[#6750A4] text-white'
                : 'text-[#49454F] hover:text-[#1D1B20]'
            }`}
          >
            Custom Interval
          </button>
          <button
            onClick={() => setTimerType('break')}
            className={`px-3 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all ${
              timerType === 'break'
                ? 'bg-[#6750A4] text-white'
                : 'text-[#49454F] hover:text-[#1D1B20]'
            }`}
          >
            Short Break (5m)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5" id="timer-layout-grid">
        
        {/* Left Side: Dynamic Timer Controls */}
        <div className="lg:col-span-8 bg-white border border-[#E1E3E1] rounded-2xl p-8 flex flex-col items-center justify-center space-y-8 min-h-[450px]">
          
          {timerType === 'custom' && (
            <div className="flex items-center gap-3 bg-[#F3EDF7] p-3 rounded-xl border border-[#E1E3E1]" id="custom-minutes-picker">
              <span className="text-[10px] font-bold text-[#49454F] uppercase">Set Study Minutes:</span>
              <input
                type="number"
                min={5}
                max={180}
                value={customInputMinutes}
                onChange={(e) => setCustomInputMinutes(Math.max(5, parseInt(e.target.value) || 5))}
                disabled={isRunning}
                className="w-16 bg-white border border-[#E1E3E1] text-center text-xs font-bold text-[#1D1B20] py-1 rounded-lg focus:ring-1 focus:ring-[#6750A4] outline-none"
              />
            </div>
          )}

          {/* Visual Circular Progress Arc Timer Display */}
          <div className="relative w-48 h-48 flex items-center justify-center" id="visual-countdown-ring">
            <svg className="absolute inset-0 w-full h-full rotate-[-90deg]">
              {/* Back track */}
              <circle
                cx={96}
                cy={96}
                r={radius}
                className="stroke-[#E1E3E1]"
                strokeWidth={8}
                fill="none"
              />
              {/* Progress track */}
              <circle
                cx={96}
                cy={96}
                r={radius}
                className="stroke-[#6750A4] transition-all duration-300"
                strokeWidth={8}
                fill="none"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
              />
            </svg>

            {/* Middle Countdown Text */}
            <div className="text-center space-y-1">
              <div className="text-3xl font-black text-[#1D1B20] tracking-widest font-mono">
                {formatTime(timeLeft)}
              </div>
              <span className="text-[9px] font-bold text-[#49454F] uppercase tracking-widest block">
                {timerType === 'break' ? 'Breather Break' : 'Deep Studying'}
              </span>
            </div>
          </div>

          {/* Controls button triggers */}
          <div className="flex items-center gap-4">
            <button
              onClick={handleResetTimer}
              className="p-3 bg-[#F3EDF7] hover:bg-[#EADDFF] text-[#1D1B20] border border-[#E1E3E1] rounded-xl transition-all hover:scale-[1.03] active:scale-[0.97]"
              title="Reset Timer"
              id="reset-timer-button"
            >
              <RotateCcw className="w-5 h-5" />
            </button>

            <button
              onClick={handleToggleTimer}
              className={`px-8 py-3.5 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-2.5 transition-all shadow-sm hover:scale-[1.03] active:scale-[0.97] ${
                isRunning
                  ? 'bg-[#FFF4E5] text-[#D05C00] border border-[#FFE2CC]'
                  : 'bg-[#6750A4] text-white shadow-sm'
              }`}
              id="start-timer-button"
            >
              {isRunning ? (
                <>
                  <Pause className="w-4 h-4 fill-[#D05C00] text-[#D05C00]" />
                  <span>Pause Session</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white text-white" />
                  <span>Resume Focus</span>
                </>
              )}
            </button>

            <button
              onClick={playAlertBuzzer}
              className="p-3 bg-[#F3EDF7] hover:bg-[#EADDFF] text-[#49454F] hover:text-[#1D1B20] border border-[#E1E3E1] rounded-xl transition-all"
              title="Test Sound synth"
            >
              <Volume2 className="w-5 h-5" />
            </button>
          </div>

          {isLogging && (
            <div className="flex items-center gap-1.5 text-[10px] text-[#0f5132] font-bold animate-pulse">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Auto-logging focus minutes...</span>
            </div>
          )}
        </div>

        {/* Right Side: Logged Stats History list */}
        <div className="lg:col-span-4 bg-white border border-[#E1E3E1] rounded-2xl p-5 flex flex-col justify-between">
          <div className="space-y-4">
            <h3 className="text-xs font-extrabold text-[#1D1B20] uppercase tracking-wider border-b border-[#E1E3E1] pb-3">
              Timer Session Stats
            </h3>

            {/* Quick Metrics */}
            <div className="grid grid-cols-2 gap-3" id="timer-stats-cards">
              <div className="p-3 bg-[#F3EDF7] rounded-xl border border-[#E1E3E1] text-center">
                <Clock className="w-4 h-4 text-[#6750A4] mx-auto mb-1" />
                <span className="text-[9px] font-bold text-[#49454F] uppercase">Logged Hours</span>
                <span className="text-lg font-black text-[#1D1B20] mt-0.5 block">{totalLoggedHours}h</span>
              </div>

              <div className="p-3 bg-[#F3EDF7] rounded-xl border border-[#E1E3E1] text-center">
                <Award className="w-4 h-4 text-[#0f5132] mx-auto mb-1" />
                <span className="text-[9px] font-bold text-[#49454F] uppercase">Intervals Done</span>
                <span className="text-lg font-black text-[#1D1B20] mt-0.5 block">{activeSessions.length}</span>
              </div>
            </div>

            {/* Log list */}
            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1" id="timer-sessions-log-list">
              <div className="text-[10px] font-bold text-[#49454F] tracking-wider uppercase mb-1">Recent Sessions</div>
              {activeSessions.length > 0 ? (
                activeSessions.slice().reverse().map((session) => (
                  <div key={session.id} className="p-2.5 bg-[#F3EDF7]/50 border border-[#E1E3E1] rounded-xl flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-3.5 h-3.5 text-[#0f5132] shrink-0" />
                      <span className="text-[10px] font-bold text-[#1D1B20]">
                        {session.type === 'pomodoro' ? 'Pomodoro Session' : 'Custom Interval'}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono font-bold text-[#49454F]">
                      {session.durationMinutes} mins
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-[10px] text-[#79747E] italic">
                  No sessions logged today yet. Complete a countdown timer above!
                </div>
              )}
            </div>
          </div>

          <div className="p-3.5 bg-[#EADDFF]/20 border border-[#D0BCFF]/30 rounded-xl" id="timer-pro-tip">
            <h5 className="text-[10px] font-bold text-[#6750A4] uppercase">Focus Tip:</h5>
            <p className="text-[9px] text-[#49454F] mt-1 leading-relaxed">
              Research shows studying in blocks of 25–50 minutes with active 5-minute breather intervals maximizes spatial memory retention.
            </p>
          </div>
        </div>

      </div>

    </div>
  );
}
