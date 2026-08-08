import React, { useState } from 'react';
import { FileText, Plus, Trash2, Edit2, Search, BookOpen, Clock, Loader2, AlertCircle } from 'lucide-react';
import { Course, Note } from '../types';
import SubjectSelect from './SubjectSelect';

interface NotesViewProps {
  courses: Course[];
  notes: Note[];
  isPremium: boolean;
  onAddCourse: (course: Omit<Course, 'id'>) => Promise<{ success: boolean; error?: string }>;
  onAddNote: (note: Omit<Note, 'id' | 'updatedAt'>) => Promise<{ success: boolean; error?: string }>;
  onUpdateNote: (id: string, note: Partial<Note>) => Promise<void>;
  onDeleteNote: (id: string) => Promise<void>;
  onTriggerUpgrade: () => void;
}

export default function NotesView({
  courses,
  notes,
  isPremium,
  onAddCourse,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
  onTriggerUpgrade
}: NotesViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form states
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [courseId, setCourseId] = useState('');

  const getCourseColor = (cId?: string) => {
    if (!cId) return '#64748b';
    return courses.find(c => c.id === cId)?.color || '#64748b';
  };

  const handleOpenCreate = () => {
    setSelectedNote(null);
    setTitle('');
    setContent('');
    setCourseId(courses[0]?.id || '');
    setIsEditing(true);
    setErrorMessage(null);
  };

  const handleOpenView = (note: Note) => {
    setSelectedNote(note);
    setTitle(note.title);
    setContent(note.content);
    setCourseId(note.courseId || '');
    setIsEditing(false);
    setErrorMessage(null);
  };

  const handleOpenEdit = (note: Note) => {
    setSelectedNote(note);
    setTitle(note.title);
    setContent(note.content);
    setCourseId(note.courseId || '');
    setIsEditing(true);
    setErrorMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) {
      setErrorMessage('Please enter a note title.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      if (selectedNote) {
        // Update
        await onUpdateNote(selectedNote.id, { title, content, courseId });
        setIsEditing(false);
        // Refresh local cache
        setSelectedNote({
          ...selectedNote,
          title,
          content,
          courseId,
          updatedAt: new Date().toISOString()
        });
      } else {
        // Create
        const result = await onAddNote({ title, content, courseId });
        if (!result.success) {
          if (result.error === 'LIMIT_REACHED') {
            onTriggerUpgrade();
          } else {
            setErrorMessage(result.error || 'Failed to create note.');
          }
        } else {
          setIsEditing(false);
          setSelectedNote(null);
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this note?')) {
      await onDeleteNote(id);
      setSelectedNote(null);
      setIsEditing(false);
    }
  };

  const filteredNotes = notes.filter(n => {
    const query = searchQuery.toLowerCase();
    const matchesTitle = n.title.toLowerCase().includes(query);
    const matchesContent = n.content.toLowerCase().includes(query);
    const linkedCourse = courses.find(c => c.id === n.courseId)?.name.toLowerCase() || '';
    const matchesCourse = linkedCourse.includes(query);

    return matchesTitle || matchesContent || matchesCourse;
  });

  return (
    <div className="space-y-6 text-[#1D1B20]" id="notes-view-root">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 bg-white border border-[#E1E3E1] rounded-2xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-[#F3EDF7] text-[#6750A4] rounded-xl border border-[#E1E3E1]">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#1D1B20] tracking-wide uppercase">Lectures & Study Notebook</h2>
            <p className="text-[10px] font-mono text-[#49454F] mt-1 uppercase">Store summaries, class reports & cheat sheets</p>
          </div>
        </div>

        <button
          onClick={handleOpenCreate}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#6750A4] hover:bg-[#6750A4]/90 text-xs font-bold text-white rounded-xl shadow-sm transition-all active:scale-[0.98]"
          id="add-note-button"
        >
          <Plus className="w-4 h-4" />
          <span>New Note Page</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5" id="notes-container-split">
        
        {/* Left Side: Directory Search & List */}
        <div className="lg:col-span-4 bg-white border border-[#E1E3E1] rounded-2xl p-4 flex flex-col gap-4 max-h-[70vh]">
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-[#79747E]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search notebook pages..."
              className="w-full bg-[#F3EDF7] border border-[#E1E3E1] rounded-xl pl-10 pr-4 py-2.5 text-xs text-[#1D1B20] focus:ring-1 focus:ring-[#6750A4] outline-none placeholder:text-[#79747E]"
            />
          </div>

          {/* Directory lists */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1" id="notes-directory-list">
            {filteredNotes.length > 0 ? (
              filteredNotes.map(note => {
                const isCurrent = selectedNote?.id === note.id;
                const courseColor = getCourseColor(note.courseId);

                return (
                  <div
                    key={note.id}
                    onClick={() => handleOpenView(note)}
                    className={`p-3.5 border rounded-xl cursor-pointer transition-all ${
                      isCurrent
                        ? 'bg-[#EADDFF] border-[#6750A4]/30 text-[#1D1B20]'
                        : 'bg-[#F3EDF7]/40 border-[#E1E3E1] text-[#49454F] hover:border-[#E1E3E1]/80 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-xs font-bold truncate">{note.title}</h4>
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: courseColor }} />
                    </div>
                    <p className="text-[10px] text-[#49454F] line-clamp-2 mt-1.5 leading-relaxed">{note.content || 'Empty note content...'}</p>
                    <div className="flex items-center gap-1.5 text-[9px] text-[#79747E] mt-2.5 font-medium font-mono">
                      <Clock className="w-3 h-3 text-[#79747E]" />
                      <span>{new Date(note.updatedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-10 text-[#79747E] text-[11px] italic">
                No notebooks matched your query
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Active Note Viewer or Editor */}
        <div className="lg:col-span-8 bg-white border border-[#E1E3E1] rounded-2xl p-5 flex flex-col justify-between min-h-[50vh]">
          {isEditing ? (
            /* Note Editor Form */
            <form onSubmit={handleSubmit} className="flex-1 flex flex-col gap-4" id="note-form-panel">
              {errorMessage && (
                <div className="p-3 text-xs text-[#B3261E] bg-[#FDECEB] border border-[#F9DEDC] rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-3 border-b border-[#E1E3E1]">
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-[#49454F] uppercase">Notebook Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Calculus Derivatives"
                    className="w-full bg-white border border-[#E1E3E1] text-xs font-bold text-[#1D1B20] rounded-xl px-3.5 py-2.5 focus:ring-1 focus:ring-[#6750A4] outline-none"
                  />
                </div>
                <SubjectSelect
                  courses={courses}
                  value={courseId}
                  onChange={setCourseId}
                  onAddCourse={onAddCourse}
                  label="Class Category"
                  id="note-course-select"
                />
              </div>

              <div className="flex-1 space-y-1">
                <label className="text-[9px] font-bold text-[#49454F] uppercase">Note Content (Plain text / Notes)</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={14}
                  placeholder="Record core formulas, key terms, definitions, textbook pages, summary guides..."
                  className="w-full h-[320px] bg-white border border-[#E1E3E1] text-xs text-[#1D1B20] rounded-xl px-4 py-3 focus:ring-1 focus:ring-[#6750A4] outline-none resize-none font-mono leading-relaxed"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-[#E1E3E1]">
                <button
                  type="button"
                  onClick={() => selectedNote ? setIsEditing(false) : setSelectedNote(null)}
                  className="px-4 py-2 bg-[#F3EDF7] hover:bg-[#EADDFF] text-xs font-semibold text-[#1D1B20] rounded-xl border border-[#E1E3E1]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2 bg-[#6750A4] hover:bg-[#6750A4]/90 text-xs font-bold text-white rounded-xl shadow-sm flex items-center gap-1.5"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <span>Save Page</span>
                  )}
                </button>
              </div>
            </form>
          ) : selectedNote ? (
            /* Note Viewer Mode */
            <div className="flex-1 flex flex-col justify-between" id="note-reader-panel">
              <div className="space-y-4">
                <div className="flex items-start justify-between border-b border-[#E1E3E1] pb-3">
                  <div>
                    <h3 className="text-sm font-black text-[#1D1B20]">{selectedNote.title}</h3>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[9px] font-bold px-2.5 py-0.5 rounded-full border" style={{
                        backgroundColor: getCourseColor(selectedNote.courseId) + '12',
                        borderColor: getCourseColor(selectedNote.courseId) + '25',
                        color: getCourseColor(selectedNote.courseId),
                      }}>
                        {courses.find(c => c.id === selectedNote.courseId)?.name || 'General Notes'}
                      </span>
                      <span className="text-[9px] text-[#79747E] font-mono font-medium">
                        Updated {new Date(selectedNote.updatedAt).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleOpenEdit(selectedNote)}
                      className="p-2 bg-[#F3EDF7] hover:bg-[#EADDFF] text-[#1D1B20] border border-[#E1E3E1] rounded-lg transition-colors"
                      title="Edit Note"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(selectedNote.id)}
                      className="p-2 bg-[#FDECEB] hover:bg-[#F9DEDC] text-[#B3261E] border border-[#F9DEDC] rounded-lg transition-colors"
                      title="Delete Note"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="p-4 bg-[#F3EDF7]/30 rounded-xl border border-[#E1E3E1] min-h-[300px]">
                  <p className="text-xs text-[#49454F] font-mono whitespace-pre-wrap leading-relaxed">
                    {selectedNote.content || 'Empty note contents. Click the pencil edit icon above to add text.'}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            /* Editor Empty Screen */
            <div className="flex-1 flex flex-col items-center justify-center py-10 space-y-3" id="notes-unselected-viewer">
              <FileText className="w-12 h-12 text-[#79747E]" />
              <h4 className="text-xs font-bold text-[#1D1B20]">No notebook page selected</h4>
              <p className="text-[10px] text-[#49454F] max-w-sm mx-auto text-center">
                Select a notebook page from the left list directory, or click "New Note Page" to start writing class logs.
              </p>
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
