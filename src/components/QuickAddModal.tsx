import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, CheckSquare, CalendarDays, FileText, GraduationCap, Loader2, AlertCircle } from 'lucide-react';
import { Course, DayOfWeek, Assignment, TimetablePeriod, Note, Exam } from '../types';
import SubjectSelect from './SubjectSelect';
import { modalBackdropVariants, modalPanelVariants } from '../lib/animations';

interface QuickAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  courses: Course[];
  defaultType?: 'task' | 'class' | 'note' | 'exam';
  onAddCourse: (course: Omit<Course, 'id'>) => Promise<{ success: boolean; error?: string }>;
  onAddAssignment: (assignment: Omit<Assignment, 'id'>) => Promise<{ success: boolean; error?: string }>;
  onAddTimetable: (period: Omit<TimetablePeriod, 'id'>) => Promise<{ success: boolean; error?: string }>;
  onAddNote: (note: Omit<Note, 'id' | 'updatedAt'>) => Promise<{ success: boolean; error?: string }>;
  onAddExam: (exam: Omit<Exam, 'id'>) => Promise<{ success: boolean; error?: string }>;
  onTriggerUpgrade: () => void;
}

export default function QuickAddModal({
  isOpen,
  onClose,
  courses,
  defaultType = 'task',
  onAddCourse,
  onAddAssignment,
  onAddTimetable,
  onAddNote,
  onAddExam,
  onTriggerUpgrade
}: QuickAddModalProps) {
  const [activeType, setActiveType] = useState<'task' | 'class' | 'note' | 'exam'>(defaultType);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Shared form inputs
  const [title, setTitle] = useState('');
  const [courseId, setCourseId] = useState('');
  const [description, setDescription] = useState('');

  // Class inputs
  const [day, setDay] = useState<DayOfWeek>('Monday');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');

  // Assignment inputs
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');

  // Exam inputs
  const [examDate, setExamDate] = useState('');

  useEffect(() => {
    if (isOpen) {
      setActiveType(defaultType);
      setTitle('');
      setCourseId(courses[0]?.id || '');
      setDescription('');
      setDay('Monday');
      setStartTime('09:00');
      setEndTime('10:00');
      setDueDate(new Date().toISOString().split('T')[0]);
      setExamDate(new Date().toISOString().slice(0, 16)); // YYYY-MM-DDTHH:MM
      setPriority('medium');
      setErrorMessage(null);
    }
  }, [isOpen, defaultType, courses]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) {
      setErrorMessage('Please enter a title/subject name.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      let result: { success: boolean; error?: string } = { success: true };

      if (activeType === 'task') {
        result = await onAddAssignment({
          title,
          courseId,
          dueDate,
          priority,
          status: 'pending',
          description
        });
      } else if (activeType === 'class') {
        result = await onAddTimetable({
          day,
          subject: title,
          startTime,
          endTime,
          courseId
        });
      } else if (activeType === 'note') {
        result = await onAddNote({
          title,
          content: description,
          courseId
        });
      } else if (activeType === 'exam') {
        result = await onAddExam({
          name: title,
          courseId,
          date: examDate,
          status: 'upcoming',
          description
        });
      }

      if (!result.success) {
        if (result.error === 'LIMIT_REACHED') {
          onTriggerUpgrade();
          onClose();
        } else {
          setErrorMessage(result.error || 'Failed to execute quick action.');
        }
      } else {
        onClose();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" id="quick-add-backdrop">
          <motion.div
            variants={modalBackdropVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div 
            variants={modalPanelVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="relative w-full max-w-md bg-[#131d31] border border-slate-700/60 rounded-2xl shadow-2xl overflow-hidden flex flex-col z-10" 
            id="quick-add-card"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-850 bg-[#0e1627]">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Quick Studio Recorder</h3>
              <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition-colors btn-press">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tab Selection */}
            <div className="grid grid-cols-4 border-b border-slate-850 p-1.5 bg-[#0e1627]">
              <button
                onClick={() => { setActiveType('task'); setTitle(''); }}
                className={`py-2 text-[10px] font-black uppercase rounded-lg flex flex-col items-center gap-1 transition-all btn-press ${
                  activeType === 'task' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:bg-slate-800/50'
                }`}
              >
                <CheckSquare className="w-4 h-4" />
                <span>Task</span>
              </button>
              <button
                onClick={() => { setActiveType('class'); setTitle(''); }}
                className={`py-2 text-[10px] font-black uppercase rounded-lg flex flex-col items-center gap-1 transition-all btn-press ${
                  activeType === 'class' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:bg-slate-800/50'
                }`}
              >
                <CalendarDays className="w-4 h-4" />
                <span>Class</span>
              </button>
              <button
                onClick={() => { setActiveType('note'); setTitle(''); }}
                className={`py-2 text-[10px] font-black uppercase rounded-lg flex flex-col items-center gap-1 transition-all btn-press ${
                  activeType === 'note' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:bg-slate-800/50'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>Note</span>
              </button>
              <button
                onClick={() => { setActiveType('exam'); setTitle(''); }}
                className={`py-2 text-[10px] font-black uppercase rounded-lg flex flex-col items-center gap-1 transition-all btn-press ${
                  activeType === 'exam' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:bg-slate-800/50'
                }`}
              >
                <GraduationCap className="w-4 h-4" />
                <span>Exam</span>
              </button>
            </div>

            {/* Form Content */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {errorMessage && (
                <div className="p-3 text-xs text-rose-200 bg-rose-950/40 border border-rose-800/50 rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Title Text */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">
                  {activeType === 'task' && 'Assignment Topic'}
                  {activeType === 'class' && 'Class / Lecture Topic'}
                  {activeType === 'note' && 'Note Title'}
                  {activeType === 'exam' && 'Exam Title'}
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={`Enter title...`}
                  className="w-full bg-[#1e293b]/50 border border-slate-800 text-xs text-white rounded-xl px-3.5 py-2.5 focus:border-blue-500 outline-none"
                />
              </div>

              {/* Subject link */}
              <SubjectSelect
                courses={courses}
                value={courseId}
                onChange={setCourseId}
                onAddCourse={onAddCourse}
                dark={true}
                label="Linked Subject"
                id="quick-add-subject-select"
              />

              {/* Type specific fields */}
              {activeType === 'task' && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Due Date</label>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="w-full bg-[#1e293b]/50 border border-slate-800 text-xs text-white rounded-xl px-3 py-2 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Priority</label>
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as any)}
                      className="w-full bg-[#1e293b]/50 border border-slate-800 text-xs text-white rounded-xl px-3 py-2 focus:border-blue-500 outline-none"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                </div>
              )}

              {activeType === 'class' && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Day Of Week</label>
                    <select
                      value={day}
                      onChange={(e) => setDay(e.target.value as DayOfWeek)}
                      className="w-full bg-[#1e293b]/50 border border-slate-800 text-xs text-white rounded-xl px-3 py-2 focus:border-blue-500 outline-none"
                    >
                      {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Start time</label>
                      <input
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="w-full bg-[#1e293b]/50 border border-slate-800 text-xs text-white rounded-xl px-3 py-2 focus:border-blue-500 outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">End time</label>
                      <input
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className="w-full bg-[#1e293b]/50 border border-slate-800 text-xs text-white rounded-xl px-3 py-2 focus:border-blue-500 outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {activeType === 'exam' && (
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Exam Date & Time</label>
                  <input
                    type="datetime-local"
                    value={examDate}
                    onChange={(e) => setExamDate(e.target.value)}
                    className="w-full bg-[#1e293b]/50 border border-slate-800 text-xs text-white rounded-xl px-3.5 py-2.5 focus:border-blue-500 outline-none"
                  />
                </div>
              )}

              {/* Description / Note body */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">
                  {activeType === 'note' ? 'Notebook Page Content' : 'Additional Information / Notes'}
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder={activeType === 'note' ? 'Write main content guidelines...' : 'Add descriptions...'}
                  className="w-full bg-[#1e293b]/50 border border-slate-800 text-xs text-white rounded-xl px-3.5 py-2.5 focus:border-blue-500 outline-none resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 btn-press cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Recording...</span>
                  </>
                ) : (
                  <span>Quick Save Record</span>
                )}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

