import React, { useState, useMemo } from 'react';
import {
  FileText,
  Upload,
  Search,
  Filter,
  Download,
  Eye,
  Trash2,
  Edit2,
  Sparkles,
  BookOpen,
  FolderOpen,
  Calendar,
  Layers,
  MoreVertical,
  Plus,
  ArrowUpDown
} from 'lucide-react';
import { Course, StudyMaterial, Note } from '../types';
import StudyMaterialUploadModal from './StudyMaterialUploadModal';
import StudyMaterialEditModal from './StudyMaterialEditModal';
import StudyMaterialReaderModal from './StudyMaterialReaderModal';
import { useTranslation } from '../lib/i18n';

interface StudyMaterialsSectionProps {
  courses: Course[];
  materials: StudyMaterial[];
  isPremium: boolean;
  onAddCourse: (course: Omit<Course, 'id'>) => Promise<{ success: boolean; error?: string }>;
  onUploadSuccess: (material: StudyMaterial) => void;
  onUpdateMaterial: (id: string, updates: Partial<StudyMaterial>) => Promise<void>;
  onDeleteMaterial: (id: string) => Promise<void>;
  onTriggerUpgrade: () => void;
  onAddNoteFromAI?: (note: Omit<Note, 'id' | 'updatedAt'>) => Promise<{ success: boolean; error?: string }>;
}

export default function StudyMaterialsSection({
  courses,
  materials,
  isPremium,
  onAddCourse,
  onUploadSuccess,
  onUpdateMaterial,
  onDeleteMaterial,
  onTriggerUpgrade,
  onAddNoteFromAI,
}: StudyMaterialsSectionProps) {
  const { t, language, formatDate } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('all');
  const [selectedTopic, setSelectedTopic] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'name' | 'size'>('newest');

  // Modals state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<StudyMaterial | null>(null);
  const [readingMaterial, setReadingMaterial] = useState<StudyMaterial | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Available topics for the selected subject (or all)
  const availableTopics = useMemo(() => {
    const topics = new Set<string>();
    materials.forEach((m) => {
      if (selectedSubjectId === 'all' || m.subjectId === selectedSubjectId) {
        if (m.topic && m.topic.trim()) {
          topics.add(m.topic.trim());
        }
      }
    });
    return Array.from(topics);
  }, [materials, selectedSubjectId]);

  // Filtered and sorted materials
  const filteredMaterials = useMemo(() => {
    return materials
      .filter((m) => {
        // Subject filter
        if (selectedSubjectId !== 'all' && m.subjectId !== selectedSubjectId) {
          return false;
        }
        // Topic filter
        if (selectedTopic !== 'all' && m.topic !== selectedTopic) {
          return false;
        }
        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchName = m.name.toLowerCase().includes(q);
          const matchFile = m.originalFileName.toLowerCase().includes(q);
          const matchTopic = (m.topic || '').toLowerCase().includes(q);
          const matchSubject = (m.subjectName || '').toLowerCase().includes(q);
          if (!matchName && !matchFile && !matchTopic && !matchSubject) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'newest') {
          return new Date(b.createdAt || b.uploadedAt).getTime() - new Date(a.createdAt || a.uploadedAt).getTime();
        }
        if (sortBy === 'oldest') {
          return new Date(a.createdAt || a.uploadedAt).getTime() - new Date(b.createdAt || b.uploadedAt).getTime();
        }
        if (sortBy === 'name') {
          return a.name.localeCompare(b.name);
        }
        if (sortBy === 'size') {
          return b.fileSize - a.fileSize;
        }
        return 0;
      });
  }, [materials, selectedSubjectId, selectedTopic, searchQuery, sortBy]);

  const getCourseColor = (subjectId?: string) => {
    if (!subjectId) return '#64748b';
    return courses.find((c) => c.id === subjectId)?.color || '#64748b';
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' Ko';
    return (bytes / (1024 * 1024)).toFixed(1) + ' Mo';
  };

  const getFileTypeBadge = (ext: string) => {
    const clean = ext.toLowerCase().replace('.', '');
    if (clean === 'pdf') {
      return (
        <span className="px-2 py-0.5 text-[9px] font-black uppercase rounded-md bg-red-100 text-red-700 font-mono">
          PDF
        </span>
      );
    }
    if (clean === 'docx') {
      return (
        <span className="px-2 py-0.5 text-[9px] font-black uppercase rounded-md bg-blue-100 text-blue-700 font-mono">
          DOCX
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 text-[9px] font-black uppercase rounded-md bg-indigo-100 text-indigo-700 font-mono">
        DOC
      </span>
    );
  };

  const handleDelete = async (id: string, name: string) => {
    const confirmText =
      language === 'fr-FR'
        ? `Voulez-vous vraiment supprimer « ${name} » ? Cette action est irréversible.`
        : `Are you sure you want to delete "${name}"? This action cannot be undone.`;
    if (window.confirm(confirmText)) {
      setDeletingId(id);
      try {
        await onDeleteMaterial(id);
      } finally {
        setDeletingId(null);
      }
    }
  };

  return (
    <div className="space-y-6" id="study-materials-section">
      {/* Top Action & Search Bar */}
      <div className="bg-white border border-[#E1E3E1] rounded-3xl p-4 sm:p-5 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[#49454F] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              language === 'fr-FR'
                ? 'Rechercher des documents, chapitres ou matières...'
                : 'Search documents, topics, or subjects...'
            }
            className="w-full bg-[#F3EDF7]/50 border border-[#E1E3E1] rounded-2xl pl-10 pr-4 py-2 text-xs font-medium text-[#1D1B20] placeholder-[#79747E] focus:outline-none focus:ring-2 focus:ring-[#6750A4]/30 focus:border-[#6750A4] transition-all"
            id="search-materials-input"
          />
        </div>

        {/* Filters and Upload Button */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Subject Filter */}
          <select
            value={selectedSubjectId}
            onChange={(e) => {
              setSelectedSubjectId(e.target.value);
              setSelectedTopic('all');
            }}
            className="bg-[#F3EDF7]/50 border border-[#E1E3E1] text-[#1D1B20] text-xs font-bold rounded-2xl px-3 py-2 outline-none focus:ring-2 focus:ring-[#6750A4]/30 cursor-pointer"
            id="subject-filter-select"
          >
            <option value="all">
              {language === 'fr-FR' ? `Toutes les matières (${materials.length})` : `All Subjects (${materials.length})`}
            </option>
            {courses.map((c) => {
              const count = materials.filter((m) => m.subjectId === c.id).length;
              return (
                <option key={c.id} value={c.id}>
                  {c.name} ({count})
                </option>
              );
            })}
          </select>

          {/* Topic Filter (if topics exist) */}
          {availableTopics.length > 0 && (
            <select
              value={selectedTopic}
              onChange={(e) => setSelectedTopic(e.target.value)}
              className="bg-[#F3EDF7]/50 border border-[#E1E3E1] text-[#1D1B20] text-xs font-bold rounded-2xl px-3 py-2 outline-none focus:ring-2 focus:ring-[#6750A4]/30 cursor-pointer"
              id="topic-filter-select"
            >
              <option value="all">{language === 'fr-FR' ? 'Tous les chapitres' : 'All Topics'}</option>
              {availableTopics.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          )}

          {/* Sort By */}
          <div className="flex items-center gap-1 bg-[#F3EDF7]/50 border border-[#E1E3E1] rounded-2xl px-2.5 py-1.5 text-xs">
            <ArrowUpDown className="w-3.5 h-3.5 text-[#49454F]" />
            <select
              value={sortBy}
              onChange={(e: any) => setSortBy(e.target.value)}
              className="bg-transparent text-[#1D1B20] text-xs font-bold outline-none cursor-pointer"
              id="sort-materials-select"
            >
              <option value="newest">{language === 'fr-FR' ? 'Plus récents' : 'Newest'}</option>
              <option value="oldest">{language === 'fr-FR' ? 'Plus anciens' : 'Oldest'}</option>
              <option value="name">{language === 'fr-FR' ? 'Nom (A-Z)' : 'Name (A-Z)'}</option>
              <option value="size">{language === 'fr-FR' ? 'Taille' : 'Size'}</option>
            </select>
          </div>

          {/* Upload Button */}
          <button
            onClick={() => setIsUploadOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#6750A4] hover:bg-[#503E84] text-white text-xs font-bold rounded-2xl shadow-sm transition-all cursor-pointer ml-auto md:ml-0"
            id="open-upload-modal-btn"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>{language === 'fr-FR' ? 'Téléverser un document' : 'Upload Document'}</span>
          </button>
        </div>
      </div>

      {/* Materials List / Grid */}
      {filteredMaterials.length === 0 ? (
        <div className="bg-white border border-[#E1E3E1] rounded-3xl p-12 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-[#EADDFF] text-[#6750A4] mx-auto flex items-center justify-center shadow-xs">
            <FolderOpen className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-black text-[#1D1B20]">
              {searchQuery || selectedSubjectId !== 'all'
                ? (language === 'fr-FR' ? 'Aucun document ne correspond à vos filtres' : 'No documents matched your filter')
                : (language === 'fr-FR' ? 'Aucun document de révision pour le moment' : 'No Study Materials Uploaded Yet')}
            </h4>
            <p className="text-xs text-[#49454F] max-w-md mx-auto">
              {searchQuery || selectedSubjectId !== 'all'
                ? (language === 'fr-FR' ? 'Essayez de réinitialiser vos filtres pour afficher tous vos documents.' : 'Try clearing your search filters to see all study materials.')
                : (language === 'fr-FR' ? 'Importez vos documents PDF, Word, images ou texte pour les organiser par matière, les lire dans l\'application et générer des résumés IA.' : 'Upload PDF and Word documents (DOC, DOCX) to organize them by subject, read inside the app, and generate on-demand AI summaries.')}
            </p>
          </div>
          <button
            onClick={() => setIsUploadOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#6750A4] hover:bg-[#503E84] text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            <span>{language === 'fr-FR' ? 'Téléverser votre premier document' : 'Upload Your First Document'}</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" id="study-materials-grid">
          {filteredMaterials.map((item) => {
            const color = getCourseColor(item.subjectId);
            const isDeleting = deletingId === item.id;

            return (
              <div
                key={item.id}
                className="bg-white border border-[#E1E3E1] hover:border-[#6750A4]/40 rounded-3xl p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group"
                id={`material-card-${item.id}`}
              >
                <div>
                  {/* Card Header: Type Badge & Subject Pill */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      {getFileTypeBadge(item.fileType)}
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{
                          backgroundColor: color + '15',
                          color: color,
                        }}
                      >
                        {item.subjectName}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 opacity-90 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setEditingMaterial(item)}
                        className="p-1.5 text-[#49454F] hover:text-[#1D1B20] hover:bg-[#F3EDF7] rounded-lg transition-colors cursor-pointer"
                        title={language === 'fr-FR' ? 'Modifier les détails' : 'Edit Details'}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(item.id, item.name)}
                        disabled={isDeleting}
                        className="p-1.5 text-[#49454F] hover:text-[#B3261E] hover:bg-[#FDECEB] rounded-lg transition-colors cursor-pointer"
                        title={language === 'fr-FR' ? 'Supprimer le document' : 'Delete Document'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Document Title & Topic */}
                  <h4
                    onClick={() => setReadingMaterial(item)}
                    className="text-xs font-black text-[#1D1B20] line-clamp-2 hover:text-[#6750A4] cursor-pointer transition-colors"
                    title={item.name}
                  >
                    {item.name}
                  </h4>

                  {item.topic && (
                    <p className="text-[11px] text-[#79747E] font-medium mt-1 line-clamp-1 flex items-center gap-1">
                      <Layers className="w-3 h-3 text-[#6750A4]" />
                      <span>{item.topic}</span>
                    </p>
                  )}

                  {/* AI Status Badges */}
                  <div className="flex items-center gap-1.5 mt-3">
                    {item.summary && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-[9px] font-bold">
                        <Sparkles className="w-2.5 h-2.5" />
                        <span>{language === 'fr-FR' ? 'Résumé' : 'Summary'}</span>
                      </span>
                    )}
                    {item.studyNotes && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-purple-50 border border-purple-200 text-[#6750A4] text-[9px] font-bold">
                        <BookOpen className="w-2.5 h-2.5" />
                        <span>{language === 'fr-FR' ? 'Notes IA' : 'AI Notes'}</span>
                      </span>
                    )}
                    {item.keyPoints && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-700 text-[9px] font-bold">
                        <Layers className="w-2.5 h-2.5" />
                        <span>{language === 'fr-FR' ? 'Points clés' : 'Key Points'}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Footer: Metadata & Quick Actions */}
                <div className="pt-4 mt-4 border-t border-[#E1E3E1] flex items-center justify-between text-[10px] text-[#79747E]">
                  <div className="font-mono">
                    <span>{formatFileSize(item.fileSize)}</span>
                    <span className="mx-1.5">•</span>
                    <span>{formatDate(new Date(item.uploadedAt || item.createdAt))}</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <a
                      href={`/api/study-materials/${item.id}/download`}
                      download={item.originalFileName}
                      className="p-1.5 text-[#49454F] hover:text-[#1D1B20] hover:bg-[#F3EDF7] rounded-lg transition-colors"
                      title={language === 'fr-FR' ? 'Télécharger le fichier original' : 'Download original file'}
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                    <button
                      onClick={() => setReadingMaterial(item)}
                      className="flex items-center gap-1 px-2.5 py-1 bg-[#6750A4] hover:bg-[#503E84] text-white font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
                    >
                      <Eye className="w-3 h-3" />
                      <span>{language === 'fr-FR' ? 'Lire & IA' : 'Read & AI'}</span>
                    </button>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* Upload Modal */}
      <StudyMaterialUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        courses={courses}
        currentMaterialsCount={materials.length}
        isPremium={isPremium}
        onAddCourse={onAddCourse}
        onUploadSuccess={onUploadSuccess}
        onTriggerUpgrade={onTriggerUpgrade}
      />

      {/* Edit Modal */}
      <StudyMaterialEditModal
        isOpen={!!editingMaterial}
        onClose={() => setEditingMaterial(null)}
        material={editingMaterial}
        courses={courses}
        onAddCourse={onAddCourse}
        onSave={onUpdateMaterial}
      />

      {/* Reader Modal */}
      <StudyMaterialReaderModal
        isOpen={!!readingMaterial}
        onClose={() => setReadingMaterial(null)}
        material={readingMaterial}
        courses={courses}
        isPremium={isPremium}
        onTriggerUpgrade={onTriggerUpgrade}
        onUpdateMaterial={async (id, updates) => {
          await onUpdateMaterial(id, updates);
          // Keep readingMaterial in sync
          if (readingMaterial && readingMaterial.id === id) {
            setReadingMaterial({ ...readingMaterial, ...updates });
          }
        }}
        onAddNoteFromAI={onAddNoteFromAI}
      />
    </div>
  );
}
