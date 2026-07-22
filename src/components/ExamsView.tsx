import React, { useState, useEffect } from 'react';
import { GraduationCap, Plus, Trash2, Edit2, Trophy, Clock, Loader2, AlertCircle } from 'lucide-react';
import { Course, Exam } from '../types';

interface ExamsViewProps {
  courses: Course[];
  exams: Exam[];
  isPremium: boolean;
  onAddExam: (exam: Omit<Exam, 'id'>) => Promise<{ success: boolean; error?: string }>;
  onUpdateExam: (id: string, exam: Partial<Exam>) => Promise<void>;
  onDeleteExam: (id: string) => Promise<void>;
  onTriggerUpgrade: () => void;
}

export default function ExamsView({
  courses,
  exams,
  isPremium,
  onAddExam,
  onUpdateExam,
  onDeleteExam,
  onTriggerUpgrade
}: ExamsViewProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingExam, setEditingExam] = useState<Exam | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [courseId, setCourseId] = useState('');
  const [date, setDate] = useState('');
  const [description, setDescription] = useState('');

  // Re-render tick for countdown timer accuracy
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 60000); // refresh every minute
    return () => clearInterval(timer);
  }, []);

  const getCourseColor = (cId: string) => {
    return courses.find(c => c.id === cId)?.color || '#3b82f6';
  };

  const handleOpenCreate = () => {
    setEditingExam(null);
    setName('');
    setCourseId(courses[0]?.id || '');
    setDate(new Date().toISOString().split('T')[0]);
    setDescription('');
    setErrorMessage(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (exam: Exam) => {
    setEditingExam(exam);
    setName(exam.name);
    setCourseId(exam.courseId);
    setDate(exam.date);
    setDescription(exam.description || '');
    setErrorMessage(null);
    setIsFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) {
      setErrorMessage('Please enter an exam title.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      if (editingExam) {
        await onUpdateExam(editingExam.id, {
          name,
          courseId,
          date,
          description
        });
        setIsFormOpen(false);
      } else {
        const result = await onAddExam({
          name,
          courseId,
          date,
          status: 'upcoming',
          description
        });

        if (!result.success) {
          if (result.error === 'LIMIT_REACHED') {
            onTriggerUpgrade();
          } else {
            setErrorMessage(result.error || 'Failed to schedule exam.');
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

  const handleToggleStatus = async (exam: Exam) => {
    const nextStatus = exam.status === 'upcoming' ? 'completed' : 'upcoming';
    await onUpdateExam(exam.id, { status: nextStatus });
  };

  const getCountdownString = (targetDateStr: string) => {
    const target = new Date(targetDateStr).getTime();
    const now = new Date().getTime();
    const diff = target - now;

    if (diff <= 0) return 'Concluded';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (days === 0) {
      return `${hours} hrs remaining`;
    }
    return `${days}d ${hours}h remaining`;
  };

  return (
    <div className="space-y-6 text-[#1D1B20]" id="exams-view-root">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 bg-white border border-[#E1E3E1] rounded-2xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-[#EADDFF] text-[#21005D] rounded-xl border border-[#D0BCFF]">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#1D1B20] tracking-wide uppercase">Exam Schedule Boards</h2>
            <p className="text-[10px] font-mono text-[#49454F] mt-1 uppercase">Monitor test bounds & revision timelines</p>
          </div>
        </div>

        <button
          onClick={handleOpenCreate}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#6750A4] hover:bg-[#503E84] text-xs font-bold text-white rounded-full transition-all active:scale-[0.98]"
          id="add-exam-button"
        >
          <Plus className="w-4 h-4" />
          <span>Add Exam Date</span>
        </button>
      </div>

      {/* Form Dialog Panel */}
      {isFormOpen && (
        <div className="p-5 bg-white border border-[#E1E3E1] rounded-2xl space-y-4 animate-fade-in shadow-sm" id="exam-form-panel">
          <div className="flex items-center justify-between border-b border-[#E1E3E1] pb-2">
            <h3 className="text-xs font-bold text-[#1D1B20] uppercase tracking-wider">
              {editingExam ? 'Modify Exam Entry' : 'Create New Exam Board'}
            </h3>
            <button onClick={() => setIsFormOpen(false)} className="text-xs text-[#49454F] hover:text-[#1D1B20] font-medium">Cancel</button>
          </div>

          {errorMessage && (
            <div className="p-3 text-xs text-[#410E0B] bg-[#FDECEB] border border-[#F9DEDC] rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Title */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-[#49454F] uppercase block">Exam Title</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Linear Algebra Finals"
                className="w-full bg-[#F3EDF7] border border-[#E1E3E1] text-xs text-[#1D1B20] rounded-xl px-3.5 py-2.5 focus:ring-1 focus:ring-[#6750A4] outline-none"
              />
            </div>

            {/* Course Link */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-[#49454F] uppercase block">Related Subject</label>
              <select
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                className="w-full bg-[#F3EDF7] border border-[#E1E3E1] text-xs text-[#1D1B20] rounded-xl px-3 py-2.5 focus:ring-1 focus:ring-[#6750A4] outline-none"
              >
                {courses.map(course => (
                  <option key={course.id} value={course.id} className="text-slate-900 bg-white">{course.name}</option>
                ))}
              </select>
            </div>

            {/* Date */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-[#49454F] uppercase block">Exam Date & Time</label>
              <input
                type="datetime-local"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-[#F3EDF7] border border-[#E1E3E1] text-xs text-[#1D1B20] rounded-xl px-3.5 py-2.5 focus:ring-1 focus:ring-[#6750A4] outline-none"
              />
            </div>

            {/* Description */}
            <div className="space-y-1 md:col-span-2">
              <label className="text-[10px] font-bold text-[#49454F] uppercase block">Revision Topics & Study Instructions</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Formulas to remember, locations, required stationary..."
                className="w-full bg-[#F3EDF7] border border-[#E1E3E1] text-xs text-[#1D1B20] rounded-xl px-3.5 py-2.5 focus:ring-1 focus:ring-[#6750A4] outline-none resize-none"
              />
            </div>

            <div className="md:col-span-2 pt-2 flex justify-end">
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2 bg-[#6750A4] hover:bg-[#503E84] text-xs font-bold text-white rounded-full flex items-center justify-center gap-1.5 transition-colors shadow-sm"
              >
                {isSubmitting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <span>{editingExam ? 'Save Changes' : 'Schedule Exam'}</span>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Grid of Scheduled Exams */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" id="exams-grid-list">
        {exams.length > 0 ? (
          exams.map((exam) => {
            const isCompleted = exam.status === 'completed';
            const color = getCourseColor(exam.courseId);
            const countdown = getCountdownString(exam.date);

            return (
              <div
                key={exam.id}
                className={`p-5 bg-white border rounded-2xl flex flex-col justify-between gap-4 transition-all hover:shadow-sm ${
                  isCompleted ? 'border-[#E1E3E1]/70 opacity-70' : 'border-[#E1E3E1]'
                }`}
                id={`exam-card-${exam.id}`}
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className={`text-xs font-bold leading-snug truncate ${isCompleted ? 'line-through text-[#79747E]' : 'text-[#1D1B20]'}`}>
                        {exam.name}
                      </h4>
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full mt-1.5 inline-block" style={{ backgroundColor: color + '15', color }}>
                        {courses.find(c => c.id === exam.courseId)?.name || 'Subject'}
                      </span>
                    </div>

                    <button
                      onClick={() => handleToggleStatus(exam)}
                      className={`px-2 py-1 text-[8px] font-black tracking-wider uppercase rounded-lg border transition-colors ${
                        isCompleted
                          ? 'bg-[#EADDFF] border-[#D0BCFF] text-[#21005D] hover:bg-[#EADDFF]/80'
                          : 'bg-[#FFF4E5] border-[#FFE2CC] text-[#D05C00] hover:bg-[#FFF4E5]/80'
                      }`}
                    >
                      {isCompleted ? 'Completed' : 'Upcoming'}
                    </button>
                  </div>

                  {exam.description && (
                    <p className="text-[10px] text-[#49454F] line-clamp-2 leading-relaxed">{exam.description}</p>
                  )}
                </div>

                <div className="border-t border-[#E1E3E1] pt-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-[10px] text-[#49454F] font-mono font-medium">
                    <Clock className="w-3.5 h-3.5 text-[#79747E]" />
                    <span>{new Date(exam.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                  </div>

                  {!isCompleted && (
                    <span className="text-[10px] font-black text-[#D05C00] uppercase tracking-wider animate-pulse flex items-center gap-1">
                      <Trophy className="w-3 h-3 text-[#D05C00]" />
                      {countdown}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 justify-end border-t border-[#E1E3E1] mt-2 pt-2">
                  <button
                    onClick={() => handleOpenEdit(exam)}
                    className="p-1.5 bg-[#F3EDF7] hover:bg-[#EADDFF] text-[#1D1B20] rounded-lg border border-[#E1E3E1] transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onDeleteExam(exam.id)}
                    className="p-1.5 bg-[#FDECEB] hover:bg-[#F9DEDC] text-[#B3261E] rounded-lg border border-[#F9DEDC] transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="p-8 bg-white border border-[#E1E3E1] rounded-2xl text-center space-y-3 col-span-full" id="exams-empty-state">
            <GraduationCap className="w-10 h-10 text-[#79747E] mx-auto" />
            <h4 className="text-xs font-bold text-[#1D1B20]">No scheduled exam boards!</h4>
            <p className="text-[10px] text-[#49454F] max-w-sm mx-auto">Create exam alerts to get live notifications and countdown clocks.</p>
          </div>
        )}
      </div>

    </div>
  );
}
