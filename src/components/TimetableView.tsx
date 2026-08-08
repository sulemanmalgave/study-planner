import React, { useState } from 'react';
import { CalendarDays, Plus, Trash2, Edit2, Clock, MapPin, Loader2, Sparkles, AlertCircle, Lock } from 'lucide-react';
import { Course, TimetablePeriod, DayOfWeek } from '../types';
import SubjectSelect from './SubjectSelect';

interface TimetableViewProps {
  courses: Course[];
  timetable: TimetablePeriod[];
  isPremium: boolean;
  onAddCourse: (course: Omit<Course, 'id'>) => Promise<{ success: boolean; error?: string }>;
  onAddPeriod: (period: Omit<TimetablePeriod, 'id'>) => Promise<{ success: boolean; error?: string }>;
  onUpdatePeriod: (id: string, period: Partial<TimetablePeriod>) => Promise<void>;
  onDeletePeriod: (id: string) => Promise<void>;
  onTriggerUpgrade: () => void;
}

export default function TimetableView({
  courses,
  timetable,
  isPremium,
  onAddCourse,
  onAddPeriod,
  onUpdatePeriod,
  onDeletePeriod,
  onTriggerUpgrade
}: TimetableViewProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPeriod, setEditingPeriod] = useState<TimetablePeriod | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form State
  const [day, setDay] = useState<DayOfWeek>('Monday');
  const [subject, setSubject] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [courseId, setCourseId] = useState('');

  const daysOfWeek: DayOfWeek[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  const getCourseColor = (cId: string) => {
    return courses.find(c => c.id === cId)?.color || '#3b82f6';
  };

  const handleOpenCreate = () => {
    setEditingPeriod(null);
    setSubject('');
    setStartTime('09:00');
    setEndTime('10:00');
    setCourseId(courses[0]?.id || '');
    setErrorMessage(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (period: TimetablePeriod) => {
    setEditingPeriod(period);
    setDay(period.day);
    setSubject(period.subject);
    setStartTime(period.startTime);
    setEndTime(period.endTime);
    setCourseId(period.courseId);
    setErrorMessage(null);
    setIsFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject) {
      setErrorMessage('Please enter a subject / class name.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      if (editingPeriod) {
        // Update
        await onUpdatePeriod(editingPeriod.id, { day, subject, startTime, endTime, courseId });
        setIsFormOpen(false);
      } else {
        // Create
        const result = await onAddPeriod({ day, subject, startTime, endTime, courseId });
        if (!result.success) {
          if (result.error === 'LIMIT_REACHED') {
            onTriggerUpgrade();
          } else {
            setErrorMessage(result.error || 'Failed to schedule class.');
          }
        } else {
          setIsFormOpen(false);
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 text-[#1D1B20]" id="timetable-view-root">
      
      {/* View Header */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 bg-white border border-[#E1E3E1] rounded-2xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-[#EADDFF] text-[#21005D] rounded-xl border border-[#D0BCFF]">
            <CalendarDays className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#1D1B20] tracking-wide uppercase">Weekly Class Schedule</h2>
            <p className="text-[10px] font-mono text-[#49454F] mt-1 uppercase">Configure study hours & lecture slots</p>
          </div>
        </div>

        <button
          onClick={handleOpenCreate}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#6750A4] hover:bg-[#503E84] text-xs font-bold text-white rounded-full transition-all active:scale-[0.98]"
          id="add-class-period-button"
        >
          <Plus className="w-4 h-4" />
          <span>Add Lecture Slot</span>
        </button>
      </div>

      {/* Form Dialog Panel */}
      {isFormOpen && (
        <div className="p-5 bg-white border border-[#E1E3E1] rounded-2xl space-y-4 animate-fade-in shadow-sm" id="timetable-class-form-panel">
          <div className="flex items-center justify-between border-b border-[#E1E3E1] pb-2">
            <h3 className="text-xs font-bold text-[#1D1B20] uppercase tracking-wider">
              {editingPeriod ? 'Modify Lecture Slot' : 'Schedule New Lecture'}
            </h3>
            <button onClick={() => setIsFormOpen(false)} className="text-xs text-[#49454F] hover:text-[#1D1B20] font-medium">Cancel</button>
          </div>

          {errorMessage && (
            <div className="p-3 text-xs text-[#410E0B] bg-[#FDECEB] border border-[#F9DEDC] rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
            {/* Subject */}
            <div className="space-y-1 md:col-span-1">
              <label className="text-[10px] font-bold text-[#49454F] uppercase">Class Name</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Adv Algebra"
                className="w-full bg-[#F3EDF7] border border-[#E1E3E1] text-xs text-[#1D1B20] rounded-xl px-3 py-2 focus:ring-1 focus:ring-[#6750A4] outline-none"
              />
            </div>

            {/* Course Link */}
            <SubjectSelect
              courses={courses}
              value={courseId}
              onChange={setCourseId}
              onAddCourse={onAddCourse}
              label="Related Course"
              className="md:col-span-1"
              id="timetable-course-select"
            />

            {/* Day */}
            <div className="space-y-1 md:col-span-1">
              <label className="text-[10px] font-bold text-[#49454F] uppercase">Day</label>
              <select
                value={day}
                onChange={(e) => setDay(e.target.value as DayOfWeek)}
                className="w-full bg-[#F3EDF7] border border-[#E1E3E1] text-xs text-[#1D1B20] rounded-xl px-2 py-2 focus:ring-1 focus:ring-[#6750A4] outline-none"
              >
                {daysOfWeek.map(d => (
                  <option key={d} value={d} className="text-slate-900 bg-white">{d}</option>
                ))}
              </select>
            </div>

            {/* Times */}
            <div className="grid grid-cols-2 gap-2 md:col-span-1">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-[#49454F] uppercase">Start</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full bg-[#F3EDF7] border border-[#E1E3E1] text-xs text-[#1D1B20] rounded-xl px-2 py-2 focus:ring-1 focus:ring-[#6750A4] outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-[#49454F] uppercase">End</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full bg-[#F3EDF7] border border-[#E1E3E1] text-xs text-[#1D1B20] rounded-xl px-2 py-2 focus:ring-1 focus:ring-[#6750A4] outline-none"
                />
              </div>
            </div>

            {/* Submit */}
            <div className="md:col-span-1">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2 bg-[#6750A4] hover:bg-[#503E84] text-xs font-bold text-white rounded-full flex items-center justify-center gap-1.5 transition-colors"
              >
                {isSubmitting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <span>{editingPeriod ? 'Save Changes' : 'Schedule Class'}</span>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Week Grid */}
      <div className="grid grid-cols-1 gap-4" id="timetable-weekly-schedule-grid">
        {daysOfWeek.map((dayName) => {
          const periods = timetable
            .filter(t => t.day === dayName)
            .sort((a, b) => a.startTime.localeCompare(b.startTime));

          const getDaysInOrder = () => {
            const days: DayOfWeek[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const todayIndex = new Date().getDay(); // 0 is Sunday, 1 is Monday, etc.
            const todayDay = days[todayIndex];
            const tomorrowDay = days[(todayIndex + 1) % 7];
            const dayAfterTomorrowDay = days[(todayIndex + 2) % 7];
            return [todayDay, tomorrowDay, dayAfterTomorrowDay];
          };

          const allowedDays = getDaysInOrder();
          const isDayLocked = !isPremium && !allowedDays.includes(dayName);

          return (
            <div key={dayName} className="p-5 bg-white border border-[#E1E3E1] rounded-2xl space-y-4 hover:shadow-sm transition-all relative overflow-hidden">
              {isDayLocked && (
                <div className="absolute inset-0 bg-slate-50/80 backdrop-blur-[4px] z-20 flex flex-col items-center justify-center p-4 text-center" id={`locked-day-overlay-${dayName}`}>
                  <div className="p-2 bg-[#EADDFF] text-[#21005D] rounded-full mb-1 border border-[#D0BCFF]">
                    <Lock className="w-3.5 h-3.5" />
                  </div>
                  <h4 className="text-[11px] font-black text-[#1D1B20] uppercase tracking-wide">Locked on Free Plan</h4>
                  <p className="text-[9px] text-[#49454F] max-w-[280px] mt-1 font-medium leading-relaxed">
                    View only Today, Tomorrow, and Day After Tomorrow. Upgrade to Study Planner Premium to unlock the full weekly timetable schedule.
                  </p>
                  <button
                    onClick={onTriggerUpgrade}
                    className="mt-2.5 px-3 py-1 bg-[#6750A4] hover:bg-[#503E84] text-[9px] font-bold text-white rounded-full transition-all uppercase tracking-wider cursor-pointer"
                  >
                    Upgrade to Premium
                  </button>
                </div>
              )}

              <div className={isDayLocked ? "filter blur-[3px] select-none pointer-events-none opacity-30" : ""}>
                <div className="flex items-center justify-between border-b border-[#E1E3E1] pb-2">
                  <h3 className="text-xs font-extrabold text-[#1D1B20] uppercase tracking-wider">{dayName}</h3>
                  <span className="text-[10px] text-[#49454F] font-mono font-bold uppercase">{periods.length} Lecture slots</span>
                </div>

                {periods.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
                    {periods.map((period) => {
                      const color = getCourseColor(period.courseId);
                      return (
                        <div
                          key={period.id}
                          className="p-4 rounded-xl border flex justify-between items-center gap-3 group hover:bg-[#F3EDF7]/10 transition-all"
                          style={{
                            backgroundColor: color + '10',
                            borderColor: color + '25',
                          }}
                        >
                          <div className="min-w-0">
                            <h4 className="text-xs font-bold truncate" style={{ color }}>
                              {period.subject}
                            </h4>
                            <div className="flex items-center gap-1.5 text-[10px] text-[#49454F] font-medium mt-1">
                              <Clock className="w-3.5 h-3.5 text-[#49454F]" />
                              <span>{period.startTime} - {period.endTime}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleOpenEdit(period)}
                              className="p-1.5 bg-[#F3EDF7] hover:bg-[#EADDFF] text-[#1D1B20] rounded-lg border border-[#E1E3E1] transition-colors"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => onDeletePeriod(period.id)}
                              className="p-1.5 bg-[#FDECEB] hover:bg-[#F9DEDC] text-[#B3261E] border border-[#F9DEDC] rounded-lg transition-colors"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-400 italic py-1 font-medium mt-3">No classes scheduled for {dayName}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
