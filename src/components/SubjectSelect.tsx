import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Plus, Search, BookOpen, Check } from 'lucide-react';
import { Course } from '../types';
import AddSubjectModal from './AddSubjectModal';
import { useTranslation } from '../lib/i18n';

interface SubjectSelectProps {
  courses: Course[];
  value: string;
  onChange: (courseId: string) => void;
  onAddCourse: (course: Omit<Course, 'id'>) => Promise<{ success: boolean; error?: string }>;
  label?: string;
  placeholder?: string;
  dark?: boolean;
  required?: boolean;
  className?: string;
  id?: string;
}

export default function SubjectSelect({
  courses,
  value,
  onChange,
  onAddCourse,
  label,
  placeholder,
  dark = false,
  required = false,
  className = '',
  id = 'subject-select-field',
}: SubjectSelectProps) {
  const { t, language } = useTranslation();
  const defaultPlaceholder = language === 'fr-FR' ? 'Sélectionner une matière...' : 'Select subject...';
  const displayPlaceholder = placeholder || defaultPlaceholder;
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedCourse = courses.find((c) => c.id === value);

  const filteredCourses = courses.filter((c) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return (
      c.name.toLowerCase().includes(query) ||
      (c.code && c.code.toLowerCase().includes(query))
    );
  });

  const handleSelect = (courseId: string) => {
    onChange(courseId);
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleOpenAddModal = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsOpen(false);
    setIsAddModalOpen(true);
  };

  return (
    <div className={`relative space-y-1 ${className}`} ref={containerRef} id={`${id}-container`}>
      {label && (
        <label className={`text-[10px] font-bold uppercase tracking-wider block ${dark ? 'text-slate-400' : 'text-[#49454F]'}`}>
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}

      {/* Select Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between text-xs rounded-xl px-3.5 py-2.5 outline-none border transition-all cursor-pointer text-left ${
          dark
            ? 'bg-[#1e293b]/80 border-slate-700 text-white hover:border-slate-600 focus:border-blue-500'
            : 'bg-[#F3EDF7] border-[#E1E3E1] text-[#1D1B20] hover:border-slate-300 focus:ring-1 focus:ring-[#6750A4]'
        }`}
        id={`${id}-trigger`}
      >
        <div className="flex items-center gap-2 truncate min-w-0 pr-2">
          {selectedCourse ? (
            <>
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: selectedCourse.color || '#3b82f6' }}
              />
              <span className="font-semibold truncate">{selectedCourse.name}</span>
              {selectedCourse.code && (
                <span className="text-[10px] text-slate-400 font-mono">({selectedCourse.code})</span>
              )}
            </>
          ) : (
            <span className={dark ? 'text-slate-400 font-medium' : 'text-slate-500 font-medium'}>
              {displayPlaceholder}
            </span>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''} ${dark ? 'text-slate-400' : 'text-slate-500'}`} />
      </button>

      {/* Floating Dropdown Options */}
      {isOpen && (
        <div
          className={`absolute left-0 right-0 top-full mt-1.5 z-40 rounded-2xl shadow-xl border overflow-hidden animate-fade-in ${
            dark ? 'bg-[#0f172a] border-slate-800 text-white' : 'bg-white border-slate-200 text-[#1D1B20]'
          }`}
          id={`${id}-dropdown`}
        >
          {/* Search Box (if courses exist) */}
          {courses.length > 0 && (
            <div className={`p-2 border-b ${dark ? 'border-slate-800 bg-slate-900/50' : 'border-slate-100 bg-slate-50/80'}`}>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={language === 'fr-FR' ? 'Rechercher des matières...' : 'Search subjects...'}
                  className={`w-full text-xs pl-8 pr-3 py-1.5 rounded-lg border outline-none ${
                    dark
                      ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500'
                      : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400'
                  }`}
                  id={`${id}-search-input`}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>
          )}

          {/* Subject Options List */}
          <div className="max-h-48 overflow-y-auto p-1 space-y-0.5">
            {courses.length === 0 ? (
              <div className="p-3 text-center space-y-1">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{language === 'fr-FR' ? 'Aucune matière ajoutée pour l\'instant' : 'No subjects added yet'}</p>
                <p className="text-[10px] text-slate-400">{language === 'fr-FR' ? 'Ajoutez une matière pour organiser votre planning d\'études.' : 'Add a subject to organize your study planner.'}</p>
              </div>
            ) : filteredCourses.length === 0 ? (
              <div className="p-3 text-center text-xs text-slate-500">
                {language === 'fr-FR' ? 'Aucune matière correspondante trouvée' : 'No matching subjects found'}
              </div>
            ) : (
              filteredCourses.map((course) => {
                const isSelected = course.id === value;
                return (
                  <button
                    key={course.id}
                    type="button"
                    onClick={() => handleSelect(course.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer text-left ${
                      isSelected
                        ? dark
                          ? 'bg-blue-600/20 text-blue-400 font-bold'
                          : 'bg-[#EADDFF] text-[#21005D] font-bold'
                        : dark
                        ? 'hover:bg-slate-800 text-slate-200'
                        : 'hover:bg-slate-100 text-slate-800'
                    }`}
                    id={`${id}-option-${course.id}`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: course.color || '#3b82f6' }}
                      />
                      <span className="truncate">{course.name}</span>
                      {course.code && (
                        <span className="text-[10px] text-slate-400 font-mono">({course.code})</span>
                      )}
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-[#6750A4] dark:text-blue-400 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>

          {/* Add New Subject Button at Bottom */}
          <div className={`p-1.5 border-t ${dark ? 'border-slate-800 bg-slate-900/60' : 'border-slate-100 bg-slate-50'}`}>
            <button
              type="button"
              onClick={handleOpenAddModal}
              className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-[#6750A4] hover:bg-[#503E84] text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
              id={`${id}-add-new-btn`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{language === 'fr-FR' ? '+ Ajouter une matière' : '+ Add New Subject'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Add Subject Modal Popup */}
      <AddSubjectModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAddCourse={onAddCourse}
        existingCourses={courses}
        dark={dark}
        onSuccess={(newCourseId) => {
          if (newCourseId) {
            onChange(newCourseId);
          } else if (courses.length > 0) {
            // Pick last created or fallback
            const latest = courses[courses.length - 1];
            if (latest) onChange(latest.id);
          }
        }}
      />
    </div>
  );
}
