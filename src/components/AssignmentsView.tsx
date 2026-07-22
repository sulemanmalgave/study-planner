import React, { useState } from 'react';
import { CheckSquare, Plus, Trash2, Edit2, Check, Clock, AlertCircle, Loader2 } from 'lucide-react';
import { Course, Assignment } from '../types';

interface AssignmentsViewProps {
  courses: Course[];
  assignments: Assignment[];
  isPremium: boolean;
  onAddAssignment: (assignment: Omit<Assignment, 'id'>) => Promise<{ success: boolean; error?: string }>;
  onUpdateAssignment: (id: string, assignment: Partial<Assignment>) => Promise<void>;
  onDeleteAssignment: (id: string) => Promise<void>;
  onTriggerUpgrade: () => void;
}

export default function AssignmentsView({
  courses,
  assignments,
  isPremium,
  onAddAssignment,
  onUpdateAssignment,
  onDeleteAssignment,
  onTriggerUpgrade
}: AssignmentsViewProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form states
  const [title, setTitle] = useState('');
  const [courseId, setCourseId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [description, setDescription] = useState('');

  // Filters
  const [filterCourse, setFilterCourse] = useState('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'completed'>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');

  const getCourseColor = (cId: string) => {
    return courses.find(c => c.id === cId)?.color || '#3b82f6';
  };

  const handleOpenCreate = () => {
    setEditingAssignment(null);
    setTitle('');
    setCourseId(courses[0]?.id || '');
    setDueDate(new Date().toISOString().split('T')[0]);
    setPriority('medium');
    setDescription('');
    setErrorMessage(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (assignment: Assignment) => {
    setEditingAssignment(assignment);
    setTitle(assignment.title);
    setCourseId(assignment.courseId);
    setDueDate(assignment.dueDate);
    setPriority(assignment.priority);
    setDescription(assignment.description || '');
    setErrorMessage(null);
    setIsFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) {
      setErrorMessage('Please enter a task title.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      if (editingAssignment) {
        await onUpdateAssignment(editingAssignment.id, {
          title,
          courseId,
          dueDate,
          priority,
          description
        });
        setIsFormOpen(false);
      } else {
        const result = await onAddAssignment({
          title,
          courseId,
          dueDate,
          priority,
          status: 'pending',
          description
        });

        if (!result.success) {
          if (result.error === 'LIMIT_REACHED') {
            onTriggerUpgrade();
          } else {
            setErrorMessage(result.error || 'Failed to create assignment.');
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

  const handleToggleStatus = async (assignment: Assignment) => {
    const newStatus = assignment.status === 'pending' ? 'completed' : 'pending';
    await onUpdateAssignment(assignment.id, { status: newStatus });
  };

  // Apply filters
  const filteredAssignments = assignments.filter(a => {
    const matchesCourse = filterCourse === 'all' || a.courseId === filterCourse;
    const matchesStatus = filterStatus === 'all' || a.status === filterStatus;
    const matchesPriority = filterPriority === 'all' || a.priority === filterPriority;
    return matchesCourse && matchesStatus && matchesPriority;
  });

  return (
    <div className="space-y-6 text-[#1D1B20]" id="assignments-view-root">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 bg-white border border-[#E1E3E1] rounded-2xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-[#EADDFF] text-[#21005D] rounded-xl border border-[#D0BCFF]">
            <CheckSquare className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#1D1B20] tracking-wide uppercase">Assignment Tracker</h2>
            <p className="text-[10px] font-mono text-[#49454F] mt-1 uppercase">Track due dates, workloads & marks releases</p>
          </div>
        </div>

        <button
          onClick={handleOpenCreate}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#6750A4] hover:bg-[#503E84] text-xs font-bold text-white rounded-full transition-all active:scale-[0.98]"
          id="add-assignment-button"
        >
          <Plus className="w-4 h-4" />
          <span>New Assignment</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="p-4 bg-white border border-[#E1E3E1] rounded-2xl flex flex-wrap gap-3 items-center justify-between shadow-sm" id="assignment-filters-bar">
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          {/* Course filter */}
          <div className="space-y-1">
            <span className="text-[9px] font-bold text-[#49454F] uppercase tracking-wider block">Course</span>
            <select
              value={filterCourse}
              onChange={(e) => setFilterCourse(e.target.value)}
              className="bg-[#F3EDF7] border border-[#E1E3E1] text-[11px] font-medium text-[#1D1B20] rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-[#6750A4] outline-none"
            >
              <option value="all" className="bg-white text-slate-900">All Courses</option>
              {courses.map(c => (
                <option key={c.id} value={c.id} className="bg-white text-slate-900">{c.name}</option>
              ))}
            </select>
          </div>

          {/* Status filter */}
          <div className="space-y-1">
            <span className="text-[9px] font-bold text-[#49454F] uppercase tracking-wider block">Status</span>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="bg-[#F3EDF7] border border-[#E1E3E1] text-[11px] font-medium text-[#1D1B20] rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-[#6750A4] outline-none"
            >
              <option value="all" className="bg-white text-slate-900">All States</option>
              <option value="pending" className="bg-white text-slate-900">Pending Only</option>
              <option value="completed" className="bg-white text-slate-900">Completed Only</option>
            </select>
          </div>

          {/* Priority filter */}
          <div className="space-y-1">
            <span className="text-[9px] font-bold text-[#49454F] uppercase tracking-wider block">Priority</span>
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              className="bg-[#F3EDF7] border border-[#E1E3E1] text-[11px] font-medium text-[#1D1B20] rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-[#6750A4] outline-none"
            >
              <option value="all" className="bg-white text-slate-900">All Priorities</option>
              <option value="high" className="bg-white text-slate-900">High</option>
              <option value="medium" className="bg-white text-slate-900">Medium</option>
              <option value="low" className="bg-white text-slate-900">Low</option>
            </select>
          </div>
        </div>

        <div className="text-[10px] font-bold text-[#49454F] font-mono">
          Showing {filteredAssignments.length} of {assignments.length} Tasks
        </div>
      </div>

      {/* Form Dialog Box */}
      {isFormOpen && (
        <div className="p-5 bg-white border border-[#E1E3E1] rounded-2xl space-y-4 animate-fade-in shadow-sm" id="assignment-form-panel">
          <div className="flex items-center justify-between border-b border-[#E1E3E1] pb-2">
            <h3 className="text-xs font-bold text-[#1D1B20] uppercase tracking-wider">
              {editingAssignment ? 'Modify Assignment Details' : 'Create New Study Assignment'}
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
              <label className="text-[10px] font-bold text-[#49454F] uppercase block">Task Title / Assignment Topic</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Solve Integral Exercises Chapter 3"
                className="w-full bg-[#F3EDF7] border border-[#E1E3E1] text-xs text-[#1D1B20] rounded-xl px-3.5 py-2.5 focus:ring-1 focus:ring-[#6750A4] outline-none"
              />
            </div>

            {/* Course Link */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-[#49454F] uppercase block">Course Subject</label>
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

            {/* Due Date */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-[#49454F] uppercase block">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full bg-[#F3EDF7] border border-[#E1E3E1] text-xs text-[#1D1B20] rounded-xl px-3.5 py-2.5 focus:ring-1 focus:ring-[#6750A4] outline-none"
              />
            </div>

            {/* Priority */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-[#49454F] uppercase block">Priority Level</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as any)}
                className="w-full bg-[#F3EDF7] border border-[#E1E3E1] text-xs text-[#1D1B20] rounded-xl px-3 py-2.5 focus:ring-1 focus:ring-[#6750A4] outline-none"
              >
                <option value="low" className="text-slate-900 bg-white">Low Priority</option>
                <option value="medium" className="text-slate-900 bg-white">Medium Priority</option>
                <option value="high" className="text-slate-900 bg-white">High Priority</option>
              </select>
            </div>

            {/* Description */}
            <div className="space-y-1 md:col-span-2">
              <label className="text-[10px] font-bold text-[#49454F] uppercase block">Additional Instructions / Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="List textbooks, submission link portals, or custom tasks..."
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
                  <span>{editingAssignment ? 'Save Changes' : 'Create Assignment'}</span>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Grid of Tasks */}
      <div className="grid grid-cols-1 gap-3" id="assignments-list-grid">
        {filteredAssignments.length > 0 ? (
          filteredAssignments.map((assignment) => {
            const isCompleted = assignment.status === 'completed';
            const color = getCourseColor(assignment.courseId);

            return (
              <div
                key={assignment.id}
                className={`p-4 bg-white border rounded-2xl flex items-center justify-between gap-4 transition-all hover:shadow-sm ${
                  isCompleted ? 'border-[#E1E3E1]/70 opacity-75' : 'border-[#E1E3E1]'
                }`}
                id={`assignment-card-${assignment.id}`}
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  {/* Status checkbox */}
                  <button
                    onClick={() => handleToggleStatus(assignment)}
                    className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                      isCompleted
                        ? 'bg-[#EADDFF] border-[#6750A4] text-[#21005D]'
                        : 'border-[#79747E] hover:border-[#6750A4] text-transparent'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>

                  <div className="min-w-0">
                    <h4 className={`text-xs font-bold leading-snug truncate ${isCompleted ? 'line-through text-[#79747E]' : 'text-[#1D1B20]'}`}>
                      {assignment.title}
                    </h4>
                    {assignment.description && (
                      <p className="text-[10px] text-[#49454F] truncate mt-1 max-w-md">{assignment.description}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full border" style={{ backgroundColor: color + '12', borderColor: color + '25', color }}>
                        {courses.find(c => c.id === assignment.courseId)?.name || 'Subject'}
                      </span>
                      <span className="flex items-center gap-1 text-[9px] text-[#49454F] font-semibold font-mono">
                        <Clock className="w-3 h-3 text-[#49454F]" />
                        Due: {assignment.dueDate}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {/* Priority indicator tag */}
                  <span className={`text-[8px] font-black tracking-wider uppercase px-2 py-0.5 rounded-lg border ${
                    assignment.priority === 'high' ? 'bg-[#FDECEB] border-[#F9DEDC] text-[#B3261E]' :
                    assignment.priority === 'medium' ? 'bg-[#FFF4E5] border-[#FFE2CC] text-[#D05C00]' :
                    'bg-[#F7F9FC] border-[#E1E3E1] text-[#49454F]'
                  }`}>
                    {assignment.priority}
                  </span>

                  <div className="flex items-center gap-1.5 border-l border-[#E1E3E1] pl-3">
                    <button
                      onClick={() => handleOpenEdit(assignment)}
                      className="p-1.5 bg-[#F3EDF7] hover:bg-[#EADDFF] text-[#1D1B20] rounded-lg border border-[#E1E3E1] transition-colors"
                      title="Edit Assignment"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onDeleteAssignment(assignment.id)}
                      className="p-1.5 bg-[#FDECEB] hover:bg-[#F9DEDC] text-[#B3261E] rounded-lg border border-[#F9DEDC] transition-colors"
                      title="Delete Assignment"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="p-8 bg-white border border-[#E1E3E1] rounded-2xl text-center space-y-3" id="assignments-empty-state">
            <CheckSquare className="w-10 h-10 text-[#79747E] mx-auto" />
            <h4 className="text-xs font-bold text-[#1D1B20]">No matching assignments!</h4>
            <p className="text-[10px] text-[#49454F] max-w-sm mx-auto">Click "New Assignment" above to track upcoming homework items.</p>
          </div>
        )}
      </div>

    </div>
  );
}
