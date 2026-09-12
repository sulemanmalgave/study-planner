import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, BookOpen, Plus, AlertCircle, Check, Loader2 } from 'lucide-react';
import { Course } from '../types';
import { useTranslation } from '../lib/i18n';

interface AddSubjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddCourse: (course: Omit<Course, 'id'>) => Promise<{ success: boolean; error?: string }>;
  existingCourses: Course[];
  onSuccess?: (newCourseId?: string) => void;
  dark?: boolean;
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

export default function AddSubjectModal({
  isOpen,
  onClose,
  onAddCourse,
  existingCourses,
  onSuccess,
  dark = false,
}: AddSubjectModalProps) {
  const { t, language } = useTranslation();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [color, setColor] = useState('#3b82f6');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e?: React.FormEvent | React.KeyboardEvent | React.MouseEvent) => {
    if (e) e.preventDefault();
    setErrorMessage('');

    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMessage(language === 'fr-FR' ? 'Veuillez saisir un nom de matière.' : 'Please enter a subject name.');
      return;
    }

    // Prevent duplicate subject names (ignoring capitalization and surrounding whitespace)
    const normalizedNew = trimmedName.toLowerCase();
    const isDuplicate = existingCourses.some(
      (c) => c.name.trim().toLowerCase() === normalizedNew
    );

    if (isDuplicate) {
      setErrorMessage(
        language === 'fr-FR' 
          ? `« ${trimmedName} » existe déjà. Veuillez choisir un autre nom.`
          : `"${trimmedName}" already exists. Please choose a different name.`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await onAddCourse({
        name: trimmedName,
        code: code.trim(),
        color,
      });

      if (!res.success) {
        setErrorMessage(res.error || (language === 'fr-FR' ? 'Échec de la création de la matière.' : 'Failed to create subject.'));
        setIsSubmitting(false);
        return;
      }

      // Find the newly created subject in existing list or handle success
      const updatedMatch = existingCourses.find(
        (c) => c.name.trim().toLowerCase() === normalizedNew
      );

      setName('');
      setCode('');
      setColor('#3b82f6');
      setIsSubmitting(false);

      if (onSuccess) {
        onSuccess(updatedMatch?.id);
      }
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || (language === 'fr-FR' ? 'Une erreur inattendue est survenue.' : 'An unexpected error occurred.'));
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const modalContent = (
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[9999] animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      id="add-subject-modal-backdrop"
    >
      <div
        className={`w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border p-5 ${
          dark
            ? 'bg-[#0f172a] border-slate-800 text-white'
            : 'bg-white border-slate-200 text-[#1D1B20]'
        }`}
        id="add-subject-modal-card"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b pb-3 mb-4 border-slate-200/60 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-[#6750A4]/10 text-[#6750A4]">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold tracking-tight">
                {language === 'fr-FR' ? 'Ajouter une matière' : 'Add New Subject'}
              </h3>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                {language === 'fr-FR'
                  ? 'Créez une matière pour la lier aux devoirs, cours, notes et examens'
                  : 'Create a subject to link with tasks, classes, notes & exams'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
            id="close-add-subject-modal-btn"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Error Notification */}
        {errorMessage && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2 text-xs text-red-600 dark:text-red-400 font-medium">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Form Body (using div to prevent invalid nested <form> elements) */}
        <div className="space-y-4" onKeyDown={handleKeyDown}>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {language === 'fr-FR' ? 'Nom de la matière' : 'Subject Name'} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errorMessage) setErrorMessage('');
              }}
              placeholder={language === 'fr-FR' ? 'ex. Mathématiques, Physique, Chimie' : 'e.g. Mathematics, Physics, Organic Chemistry'}
              className={`w-full text-xs rounded-xl px-3.5 py-2.5 outline-none border transition-all ${
                dark
                  ? 'bg-slate-800/80 border-slate-700 text-white focus:border-[#6750A4]'
                  : 'bg-slate-50 border-slate-200 text-[#1D1B20] focus:ring-1 focus:ring-[#6750A4]'
              }`}
              id="add-subject-name-input"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {language === 'fr-FR' ? 'Code / Abréviation' : 'Subject Code / Abbreviation'}{' '}
              <span className="text-slate-400 font-normal">({language === 'fr-FR' ? 'Optionnel' : 'Optional'})</span>
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. MATH101, PHY202"
              className={`w-full text-xs rounded-xl px-3.5 py-2.5 outline-none border transition-all ${
                dark
                  ? 'bg-slate-800/80 border-slate-700 text-white focus:border-[#6750A4]'
                  : 'bg-slate-50 border-slate-200 text-[#1D1B20] focus:ring-1 focus:ring-[#6750A4]'
              }`}
              id="add-subject-code-input"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
              {language === 'fr-FR' ? 'Pastille de couleur' : 'Color Tag'}
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  onClick={() => setColor(c.hex)}
                  style={{ backgroundColor: c.hex }}
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-white transition-transform cursor-pointer ${
                    color === c.hex ? 'scale-110 ring-2 ring-offset-2 ring-[#6750A4]' : 'hover:scale-105'
                  }`}
                  title={c.label}
                  id={`color-preset-${c.hex.replace('#', '')}`}
                >
                  {color === c.hex && <Check className="w-4 h-4 drop-shadow-xs" />}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                dark
                  ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
              id="cancel-add-subject-btn"
            >
              {language === 'fr-FR' ? 'Annuler' : 'Cancel'}
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleSubmit}
              className="px-5 py-2 rounded-xl bg-[#6750A4] hover:bg-[#503E84] text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer disabled:opacity-50"
              id="submit-add-subject-btn"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{language === 'fr-FR' ? 'Enregistrement...' : 'Saving...'}</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  <span>{language === 'fr-FR' ? 'Enregistrer la matière' : 'Save Subject'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
