import React, { useState } from 'react';
import { X, Edit2, Loader2, AlertCircle, Save } from 'lucide-react';
import { Course, StudyMaterial } from '../types';
import SubjectSelect from './SubjectSelect';

interface StudyMaterialEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  material: StudyMaterial | null;
  courses: Course[];
  onAddCourse: (course: Omit<Course, 'id'>) => Promise<{ success: boolean; error?: string }>;
  onSave: (id: string, updates: Partial<StudyMaterial>) => Promise<void>;
}

export default function StudyMaterialEditModal({
  isOpen,
  onClose,
  material,
  courses,
  onAddCourse,
  onSave,
}: StudyMaterialEditModalProps) {
  const [name, setName] = useState(material?.name || '');
  const [subjectId, setSubjectId] = useState(material?.subjectId || '');
  const [topic, setTopic] = useState(material?.topic || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Synchronize state when material or isOpen changes
  React.useEffect(() => {
    if (material) {
      setName(material.name || '');
      setSubjectId(material.subjectId || '');
      setTopic(material.topic || '');
      setErrorMessage(null);
    }
  }, [material, isOpen]);

  if (!isOpen || !material) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMessage('Please enter a document title.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const selectedCourse = courses.find((c) => c.id === subjectId);
    const subjectName = selectedCourse?.name || 'General';

    try {
      await onSave(material.id, {
        name: name.trim(),
        subjectId,
        subjectName,
        topic: topic.trim(),
      });
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update study material details.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs" id="material-edit-modal">
      <div className="bg-white border border-[#E1E3E1] rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E1E3E1] bg-[#F3EDF7]/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-[#EADDFF] text-[#21005D] rounded-xl">
              <Edit2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-[#1D1B20]">Edit Study Material</h3>
              <p className="text-[10px] text-[#49454F] font-mono truncate max-w-xs">{material.originalFileName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#49454F] hover:text-[#1D1B20] hover:bg-[#EADDFF]/50 rounded-full transition-colors cursor-pointer"
            id="close-edit-modal-btn"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMessage && (
            <div className="p-3 text-xs text-[#B3261E] bg-[#FDECEB] border border-[#F9DEDC] rounded-2xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div>
            <label className="text-[10px] font-bold text-[#49454F] uppercase tracking-wider block mb-1">
              Document Title
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-white border border-[#E1E3E1] text-xs font-medium text-[#1D1B20] rounded-xl px-3.5 py-2.5 focus:ring-2 focus:ring-[#6750A4]/30 focus:border-[#6750A4] outline-none"
              required
            />
          </div>

          <div>
            <SubjectSelect
              courses={courses}
              value={subjectId}
              onChange={setSubjectId}
              onAddCourse={onAddCourse}
              label="Subject / Class"
              id="edit-material-subject-select"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-[#49454F] uppercase tracking-wider block mb-1">
              Topic / Chapter
            </label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Unit 3, Final Review"
              className="w-full bg-white border border-[#E1E3E1] text-xs font-medium text-[#1D1B20] rounded-xl px-3.5 py-2.5 focus:ring-2 focus:ring-[#6750A4]/30 focus:border-[#6750A4] outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#E1E3E1]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-[#F3EDF7] hover:bg-[#EADDFF] text-xs font-bold text-[#1D1B20] rounded-xl border border-[#E1E3E1] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-[#6750A4] hover:bg-[#503E84] text-xs font-bold text-white rounded-xl shadow-sm flex items-center gap-1.5 cursor-pointer"
              id="save-edit-material-btn"
            >
              {isSubmitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>Save Changes</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
