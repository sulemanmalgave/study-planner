import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { pageVariants, listItemVariants, modalVariants, backdropVariants } from '../lib/animations';
import { 
  BookOpen, 
  Plus, 
  Pencil, 
  Trash2, 
  AlertTriangle, 
  Check, 
  CheckSquare, 
  GraduationCap, 
  CalendarDays, 
  FileText,
  AlertCircle,
  Loader2,
  X
} from 'lucide-react';
import { Course, Assignment, TimetablePeriod, Exam, Note } from '../types';

interface SubjectsViewProps {
  courses: Course[];
  assignments: Assignment[];
  timetable: TimetablePeriod[];
  exams: Exam[];
  notes: Note[];
  onAddCourse: (course: Omit<Course, 'id'>) => Promise<{ success: boolean; error?: string }>;
  onUpdateCourse: (id: string, course: Partial<Course>) => Promise<void>;
  onDeleteCourse: (id: string) => Promise<void>;
}

const PRESET_COLORS = [
  { hex: '#3b82f6', label: 'Blue' },
  { hex: '#6750A4', label: 'Purple' },
  { hex: '#10b981', label: 'Emerald' },
  { hex: '#f59e0b', label: 'Amber' },
  { hex: '#ec4899', label: 'Pink' },
  { hex: '#06b6d4', label: 'Cyan' },
  { hex: '#ef4444', label: 'Red' },
  { hex: '#6366f1', label: 'Indigo' },
];

export default function SubjectsView({
  courses,
  assignments,
  timetable,
  exams,
  notes,
  onAddCourse,
  onUpdateCourse,
  onDeleteCourse,
}: SubjectsViewProps) {
  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [deletingCourse, setDeletingCourse] = useState<Course | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [color, setColor] = useState('#3b82f6');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Open Add Modal
  const handleOpenAdd = () => {
    setEditingCourse(null);
    setName('');
    setCode('');
    setColor('#3b82f6');
    setErrorMessage('');
    setIsAddModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (course: Course) => {
    setEditingCourse(course);
    setName(course.name);
    setCode(course.code || '');
    setColor(course.color || '#3b82f6');
    setErrorMessage('');
    setIsAddModalOpen(true);
  };

  // Submit Add or Edit Form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMessage('Please enter a subject name.');
      return;
    }

    // Duplicate check ignoring capitalization and whitespace
    const normalizedNew = trimmedName.toLowerCase();
    const isDuplicate = courses.some(
      (c) => c.id !== editingCourse?.id && c.name.trim().toLowerCase() === normalizedNew
    );

    if (isDuplicate) {
      setErrorMessage(`"${trimmedName}" already exists. Please choose a unique subject name.`);
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingCourse) {
        await onUpdateCourse(editingCourse.id, {
          name: trimmedName,
          code: code.trim(),
          color,
        });
      } else {
        const res = await onAddCourse({
          name: trimmedName,
          code: code.trim(),
          color,
        });
        if (!res.success) {
          setErrorMessage(res.error || 'Failed to create subject.');
          setIsSubmitting(false);
          return;
        }
      }

      setIsAddModalOpen(false);
      setName('');
      setCode('');
      setIsSubmitting(false);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save subject.');
      setIsSubmitting(false);
    }
  };

  // Confirm Delete Subject
  const handleConfirmDelete = async () => {
    if (!deletingCourse) return;
    setIsSubmitting(true);
    try {
      await onDeleteCourse(deletingCourse.id);
      setDeletingCourse(null);
      setIsSubmitting(false);
    } catch (err) {
      console.error(err);
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div 
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="space-y-6 max-w-6xl mx-auto pb-12" 
      id="subjects-view-container"
    >
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-[#E1E3E1] shadow-2xs" id="subjects-header">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[#6750A4]" />
            <h2 className="text-xl font-extrabold text-[#1D1B20] tracking-tight">Subjects</h2>
          </div>
          <p className="text-xs text-[#49454F] font-medium mt-1">
            Manage your academic subjects, courses, and study tracks
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="px-4 py-2.5 bg-[#6750A4] hover:bg-[#503E84] text-white rounded-2xl text-xs font-bold flex items-center gap-2 transition-all shadow-sm btn-press cursor-pointer"
          id="add-subject-top-btn"
        >
          <Plus className="w-4 h-4" />
          <span>Add Subject</span>
        </button>
      </div>

      {/* Main Subjects Display */}
      {courses.length === 0 ? (
        /* Empty State */
        <div className="bg-white border border-[#E1E3E1] rounded-3xl p-12 text-center max-w-lg mx-auto space-y-4 my-8 shadow-2xs" id="subjects-empty-state">
          <div className="w-16 h-16 bg-[#EADDFF]/50 text-[#6750A4] rounded-2xl flex items-center justify-center mx-auto shadow-inner">
            <BookOpen className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-extrabold text-[#1D1B20]">No subjects added yet</h3>
            <p className="text-xs text-[#49454F] leading-relaxed max-w-sm mx-auto font-medium">
              Create your subjects to link them with assignments, classes, notes, timetables, and exams.
            </p>
          </div>
          <button
            onClick={handleOpenAdd}
            className="px-6 py-3 bg-[#6750A4] hover:bg-[#503E84] text-white text-xs font-bold rounded-2xl inline-flex items-center gap-2 shadow-sm transition-all btn-press cursor-pointer"
            id="empty-add-subject-btn"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add Subject</span>
          </button>
        </div>
      ) : (
        /* Subject Cards Grid */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" id="subjects-grid">
          <AnimatePresence mode="popLayout">
            {courses.map((course) => {
              const linkedAssignments = assignments.filter((a) => a.courseId === course.id).length;
              const linkedTimetable = timetable.filter((t) => t.courseId === course.id).length;
              const linkedExams = exams.filter((e) => e.courseId === course.id).length;
              const linkedNotes = notes.filter((n) => n.courseId === course.id).length;
              const totalUsage = linkedAssignments + linkedTimetable + linkedExams + linkedNotes;

              return (
                <motion.div
                  key={course.id}
                  layout
                  variants={listItemVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="bg-white rounded-3xl border border-[#E1E3E1] p-5 hover:shadow-md transition-all flex flex-col justify-between space-y-4 group card-interactive"
                  id={`subject-card-${course.id}`}
                >
                  {/* Top Title & Color Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className="w-4 h-4 rounded-full shrink-0 shadow-xs"
                        style={{ backgroundColor: course.color || '#3b82f6' }}
                      />
                      <div className="min-w-0">
                        <h3 className="text-sm font-extrabold text-[#1D1B20] truncate group-hover:text-[#6750A4] transition-colors">
                          {course.name}
                        </h3>
                        {course.code && (
                          <span className="text-[10px] font-mono font-bold text-slate-400 block truncate">
                            {course.code}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleOpenEdit(course)}
                        className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors btn-press cursor-pointer"
                        title="Edit Subject"
                        id={`edit-subject-btn-${course.id}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeletingCourse(course)}
                        className="p-1.5 rounded-xl hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors btn-press cursor-pointer"
                        title="Delete Subject"
                        id={`delete-subject-btn-${course.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Linked Stats Badge Row */}
                  <div className="grid grid-cols-2 gap-2 bg-slate-50/80 p-2.5 rounded-2xl border border-slate-100 text-[11px] font-semibold text-slate-600">
                    <div className="flex items-center gap-1.5">
                      <CheckSquare className="w-3 h-3 text-[#6750A4]" />
                      <span>{linkedAssignments} Tasks</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CalendarDays className="w-3 h-3 text-blue-500" />
                      <span>{linkedTimetable} Classes</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <GraduationCap className="w-3 h-3 text-amber-500" />
                      <span>{linkedExams} Exams</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <FileText className="w-3 h-3 text-emerald-500" />
                      <span>{linkedNotes} Notes</span>
                    </div>
                  </div>

                  {/* Footer status */}
                  <div className="text-[10px] text-slate-400 font-medium flex items-center justify-between pt-1 border-t border-slate-100">
                    <span>{totalUsage === 0 ? 'No linked records' : `${totalUsage} total items linked`}</span>
                    <span className="font-mono text-[9px] uppercase tracking-wider text-[#6750A4] font-bold">
                      Active
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Add / Edit Subject Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
          <motion.div
            variants={backdropVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50"
            onClick={(e) => e.target === e.currentTarget && setIsAddModalOpen(false)}
            id="subject-form-modal-backdrop"
          >
            <motion.div 
              variants={modalVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="w-full max-w-md bg-white border border-slate-200 rounded-3xl p-6 shadow-2xl space-y-4" 
              id="subject-form-modal-card"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-[#6750A4]/10 text-[#6750A4] rounded-xl">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-[#1D1B20]">
                      {editingCourse ? 'Edit Subject' : 'Add New Subject'}
                    </h3>
                    <p className="text-[10px] text-slate-500 font-medium">
                      {editingCourse ? 'Update subject details across all items' : 'Create a subject track'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors btn-press cursor-pointer"
                  id="close-subject-modal-btn"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {errorMessage && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs text-red-700 font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Subject Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (errorMessage) setErrorMessage('');
                    }}
                    placeholder="e.g. Mathematics, Physics, Organic Chemistry"
                    className="w-full bg-slate-50 border border-slate-200 text-xs text-[#1D1B20] rounded-xl px-3.5 py-2.5 outline-none focus:ring-1 focus:ring-[#6750A4]"
                    id="subject-form-name-input"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Subject Code / Abbreviation <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="e.g. MATH101, PHY202"
                    className="w-full bg-slate-50 border border-slate-200 text-xs text-[#1D1B20] rounded-xl px-3.5 py-2.5 outline-none focus:ring-1 focus:ring-[#6750A4]"
                    id="subject-form-code-input"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                    Color Tag
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c.hex}
                        type="button"
                        onClick={() => setColor(c.hex)}
                        style={{ backgroundColor: c.hex }}
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-white transition-transform btn-press cursor-pointer ${
                          color === c.hex ? 'scale-110 ring-2 ring-offset-2 ring-[#6750A4]' : 'hover:scale-105'
                        }`}
                        title={c.label}
                        id={`subject-color-${c.hex.replace('#', '')}`}
                      >
                        {color === c.hex && <Check className="w-4 h-4 drop-shadow-xs" />}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl text-xs font-bold transition-colors btn-press cursor-pointer"
                    id="cancel-subject-form-btn"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2 bg-[#6750A4] hover:bg-[#503E84] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm btn-press cursor-pointer disabled:opacity-50"
                    id="submit-subject-form-btn"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <span>{editingCourse ? 'Update Subject' : 'Save Subject'}</span>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Safety Delete Confirmation Modal */}
      <AnimatePresence>
        {deletingCourse && (
          <motion.div
            variants={backdropVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50"
            onClick={(e) => e.target === e.currentTarget && setDeletingCourse(null)}
            id="subject-delete-modal-backdrop"
          >
            <motion.div 
              variants={modalVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="w-full max-w-md bg-white border border-slate-200 rounded-3xl p-6 shadow-2xl space-y-4" 
              id="subject-delete-modal-card"
            >
              <div className="flex items-start gap-3">
                <div className="p-2.5 bg-amber-500/10 text-amber-600 rounded-2xl shrink-0">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-extrabold text-[#1D1B20]">
                    Delete "{deletingCourse.name}"?
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed font-medium">
                    {assignments.filter((a) => a.courseId === deletingCourse.id).length +
                      timetable.filter((t) => t.courseId === deletingCourse.id).length +
                      exams.filter((e) => e.courseId === deletingCourse.id).length +
                      notes.filter((n) => n.courseId === deletingCourse.id).length >
                    0 ? (
                      <span className="text-amber-800 font-semibold block mb-1">
                        ⚠️ This subject is currently linked to existing tasks, classes, notes or exams.
                      </span>
                    ) : null}
                    Deleting this subject will remove it from your subjects list. Your existing tasks, notes, classes, and exams will remain completely intact.
                  </p>
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setDeletingCourse(null)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl text-xs font-bold transition-colors btn-press cursor-pointer"
                  id="cancel-delete-subject-btn"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleConfirmDelete}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm btn-press cursor-pointer disabled:opacity-50"
                  id="confirm-delete-subject-btn"
                >
                  {isSubmitting ? 'Deleting...' : 'Delete Subject (Keep Records Intact)'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
