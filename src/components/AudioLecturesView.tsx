import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  Plus,
  Search,
  Play,
  Pause,
  Download,
  Copy,
  Edit3,
  Trash2,
  Volume2,
  VolumeX,
  Clock,
  FileAudio,
  Check,
  X,
  Filter,
  Sparkles,
  AlertCircle,
  BookOpen,
  Tag,
  RotateCcw,
  SlidersHorizontal,
  Loader2
} from 'lucide-react';
import { AudioLecture, Course } from '../types';
import {
  saveAudioBlob,
  getAudioBlob,
  deleteAudioBlob,
  getAudioObjectUrl
} from '../lib/audioStorage';

interface AudioLecturesViewProps {
  courses: Course[];
  audioLectures: AudioLecture[];
  isPremium?: boolean;
  onUpgradeClick?: () => void;
  onAddLecture: (lecture: Omit<AudioLecture, 'id' | 'createdAt' | 'updatedAt'>, audioBlob?: Blob) => Promise<AudioLecture>;
  onUpdateLecture: (id: string, updates: Partial<AudioLecture>) => Promise<void>;
  onDeleteLecture: (id: string) => Promise<void>;
  onAddCourse?: (course: Omit<Course, 'id'>) => Promise<any>;
}

export default function AudioLecturesView({
  courses,
  audioLectures,
  isPremium = true,
  onUpgradeClick,
  onAddLecture,
  onUpdateLecture,
  onDeleteLecture,
  onAddCourse
}: AudioLecturesViewProps) {
  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState('ALL');

  // Modals & Selected Lecture
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedLecture, setSelectedLecture] = useState<AudioLecture | null>(null);
  const [editingLecture, setEditingLecture] = useState<AudioLecture | null>(null);
  const [deletingLectureId, setDeletingLectureId] = useState<string | null>(null);

  if (!isPremium) {
    return (
      <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6" id="audio-lectures-free-view">
        <div className="border-b border-[#E1E3E1] pb-5" id="audio-lectures-header">
          <h2 className="text-xl sm:text-2xl font-black text-[#1D1B20] tracking-tight flex items-center gap-2.5">
            <Mic className="w-6 h-6 text-[#6750A4]" /> Audio Lectures
          </h2>
          <p className="text-xs sm:text-sm text-[#49454F] font-medium mt-1">
            Organize your recorded lectures by subject and topic.
          </p>
        </div>

        <div className="bg-gradient-to-br from-[#F3EDF7] via-white to-[#EADDFF]/30 border border-[#D0BCFF] rounded-3xl p-8 sm:p-12 text-center flex flex-col items-center justify-center my-6 space-y-6 shadow-sm">
          <div className="w-16 h-16 rounded-full bg-[#EADDFF] flex items-center justify-center text-[#6750A4] shadow-xs">
            <Sparkles className="w-8 h-8" />
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#6750A4] text-white text-xs font-black rounded-full uppercase tracking-wider">
            Pro Feature
          </div>

          <p className="text-sm sm:text-base text-[#1D1B20] font-bold max-w-xl leading-relaxed">
            “Save your lecture recordings, organize them by subject and topic, play them anytime, and download them with automatically organized filenames for easy use with your preferred AI.”
          </p>

          <button
            onClick={onUpgradeClick}
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#6750A4] hover:bg-[#503E84] text-white font-extrabold text-sm rounded-full tracking-wide shadow-md transition-all transform hover:scale-[1.02] cursor-pointer"
            id="audio-lectures-upgrade-button"
          >
            <Sparkles className="w-4 h-4" />
            <span>✨ Upgrade to Pro</span>
          </button>
        </div>
      </div>
    );
  }

  // Audio Player State
  const [currentPlayingId, setCurrentPlayingId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [audioObjectUrl, setAudioObjectUrl] = useState<string | null>(null);

  // Audio element reference
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Copy toast state
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  // Form states for Add Lecture
  const [formSubjectName, setFormSubjectName] = useState('');
  const [formCourseId, setFormCourseId] = useState('');
  const [formSection, setFormSection] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [detectedDuration, setDetectedDuration] = useState<number>(0);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states for Edit Lecture
  const [editSubjectName, setEditSubjectName] = useState('');
  const [editCourseId, setEditCourseId] = useState('');
  const [editSection, setEditSection] = useState('');
  const [editTitle, setEditTitle] = useState('');

  // Audio player cleanup
  useEffect(() => {
    return () => {
      if (audioObjectUrl) {
        URL.revokeObjectURL(audioObjectUrl);
      }
    };
  }, [audioObjectUrl]);

  // Handle playing audio lecture
  const loadAndPlayLecture = async (lecture: AudioLecture) => {
    try {
      if (currentPlayingId === lecture.id && audioRef.current) {
        if (isPlaying) {
          audioRef.current.pause();
          setIsPlaying(false);
        } else {
          audioRef.current.play();
          setIsPlaying(true);
        }
        return;
      }

      // Cleanup previous Object URL
      if (audioObjectUrl) {
        URL.revokeObjectURL(audioObjectUrl);
        setAudioObjectUrl(null);
      }

      // Retrieve audio from IndexedDB or fallback data URL
      const objectUrl = await getAudioObjectUrl(lecture.id, lecture.audioDataUrl);

      if (!objectUrl) {
        alert('Could not load audio file for this lecture.');
        return;
      }

      setAudioObjectUrl(objectUrl);
      setCurrentPlayingId(lecture.id);
      setSelectedLecture(lecture);

      if (audioRef.current) {
        audioRef.current.src = objectUrl;
        audioRef.current.currentTime = 0;
        audioRef.current.playbackRate = playbackRate;
        audioRef.current.volume = isMuted ? 0 : volume;
        audioRef.current.play().then(() => {
          setIsPlaying(true);
        }).catch((e) => {
          console.warn('Autoplay failed or interrupted:', e);
        });
      }
    } catch (err) {
      console.error('Error playing audio lecture:', err);
    }
  };

  // Audio element event listeners
  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      setDuration(audioRef.current.duration || 0);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleSeek = (newTime: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const handlePlaybackRateChange = (rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  };

  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    setIsMuted(newVol === 0);
    if (audioRef.current) {
      audioRef.current.volume = newVol;
    }
  };

  const toggleMute = () => {
    if (audioRef.current) {
      if (isMuted) {
        audioRef.current.volume = volume || 1;
        setIsMuted(false);
      } else {
        audioRef.current.volume = 0;
        setIsMuted(true);
      }
    }
  };

  // Format seconds to mm:ss or hh:mm:ss
  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '00:00';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);

    const mStr = m.toString().padStart(2, '0');
    const sStr = s.toString().padStart(2, '0');

    if (h > 0) {
      return `${h}:${mStr}:${sStr}`;
    }
    return `${mStr}:${sStr}`;
  };

  // Format file size
  const formatFileSize = (bytes?: number) => {
    if (!bytes || bytes <= 0) return 'Unknown size';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Sanitize characters for valid filename
  const sanitizeFilename = (str: string) => {
    return str
      .replace(/[\\/:*?"<>|]/g, '-') // Replace invalid filename characters
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .trim();
  };

  // Generate automated download filename
  const generateDownloadFilename = (lecture: AudioLecture) => {
    const subject = sanitizeFilename(lecture.subjectName || '');
    const section = sanitizeFilename(lecture.section || '');
    const topic = sanitizeFilename(lecture.title || '');

    // Extract file extension from originalFileName
    let ext = 'mp3';
    if (lecture.originalFileName && lecture.originalFileName.includes('.')) {
      ext = lecture.originalFileName.split('.').pop() || 'mp3';
    }

    const parts = [subject, section, topic].filter((p) => p.length > 0);
    const baseName = parts.length > 0 ? parts.join(' - ') : 'Audio Lecture';

    return `${baseName}.${ext}`;
  };

  // Download Audio handler
  const handleDownloadAudio = async (lecture: AudioLecture) => {
    try {
      const objectUrl = await getAudioObjectUrl(lecture.id, lecture.audioDataUrl);
      if (!objectUrl) {
        alert('Could not retrieve audio file for download.');
        return;
      }

      const filename = generateDownloadFilename(lecture);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    } catch (err) {
      console.error('Error downloading audio:', err);
      alert('Failed to download audio file.');
    }
  };

  // Copy AI Prompt
  const handleCopyAiPrompt = () => {
    const promptText = `Analyze this lecture recording for a student. Create a clear summary, key points, important definitions, important concepts, and useful revision questions. Keep the information based on the lecture and organize it for easy studying.`;

    navigator.clipboard.writeText(promptText).then(() => {
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 3000);
    }).catch(() => {
      alert('Failed to copy to clipboard.');
    });
  };

  // Handle audio file selection in Add Lecture Modal
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError(null);
    const file = e.target.files?.[0];
    if (!file) {
      setSelectedFile(null);
      setDetectedDuration(0);
      return;
    }

    // Check if video file selected
    if (file.type.startsWith('video/') || /\.(mp4|avi|mov|mkv|webm|wmv|flv)$/i.test(file.name)) {
      setFileError('Video files are not allowed. Please select an audio file (MP3, M4A, WAV, AAC, etc.).');
      setSelectedFile(null);
      setDetectedDuration(0);
      e.target.value = '';
      return;
    }

    setSelectedFile(file);

    // Measure exact audio duration
    const tempUrl = URL.createObjectURL(file);
    const tempAudio = new Audio(tempUrl);
    tempAudio.onloadedmetadata = () => {
      setDetectedDuration(tempAudio.duration || 0);
      URL.revokeObjectURL(tempUrl);
    };
    tempAudio.onerror = () => {
      setDetectedDuration(0);
      URL.revokeObjectURL(tempUrl);
    };
  };

  // Handle Save New Lecture
  const handleSaveLecture = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      alert('Please enter a Topic / Lecture Title.');
      return;
    }
    if (!selectedFile) {
      alert('Please select an audio file.');
      return;
    }

    setIsSubmitting(true);
    try {
      const subjectName = formSubjectName.trim() || 'General';

      const newLectureData = {
        courseId: formCourseId || '',
        subjectName,
        section: formSection.trim(),
        title: formTitle.trim(),
        originalFileName: selectedFile.name,
        fileSize: selectedFile.size,
        fileType: selectedFile.type || 'audio/mpeg',
        duration: Math.round(detectedDuration),
      };

      // Save lecture record
      const createdLecture = await onAddLecture(newLectureData, selectedFile);

      // Save audio Blob directly to IndexedDB using lecture ID
      await saveAudioBlob(createdLecture.id, selectedFile);

      // Reset form
      setFormSubjectName('');
      setFormCourseId('');
      setFormSection('');
      setFormTitle('');
      setSelectedFile(null);
      setDetectedDuration(0);
      setIsAddModalOpen(false);
    } catch (err) {
      console.error('Error saving audio lecture:', err);
      alert('An error occurred while saving the lecture.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Open Edit Modal
  const handleOpenEdit = (lecture: AudioLecture) => {
    setEditingLecture(lecture);
    setEditSubjectName(lecture.subjectName || '');
    setEditCourseId(lecture.courseId || '');
    setEditSection(lecture.section || '');
    setEditTitle(lecture.title || '');
  };

  // Handle Save Edit
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLecture) return;
    if (!editTitle.trim()) {
      alert('Please enter a Topic / Lecture Title.');
      return;
    }

    try {
      const updates = {
        subjectName: editSubjectName.trim() || 'General',
        courseId: editCourseId || '',
        section: editSection.trim(),
        title: editTitle.trim(),
      };

      await onUpdateLecture(editingLecture.id, updates);

      // If selected lecture is active, update in view
      if (selectedLecture?.id === editingLecture.id) {
        setSelectedLecture((prev) => prev ? { ...prev, ...updates } : null);
      }

      setEditingLecture(null);
    } catch (err) {
      console.error('Error updating lecture:', err);
      alert('Failed to update lecture.');
    }
  };

  // Handle Delete Lecture
  const ConfirmDeleteLecture = async () => {
    if (!deletingLectureId) return;

    try {
      const idToDelete = deletingLectureId;
      await onDeleteLecture(idToDelete);
      await deleteAudioBlob(idToDelete);

      if (currentPlayingId === idToDelete) {
        if (audioRef.current) {
          audioRef.current.pause();
        }
        setIsPlaying(false);
        setCurrentPlayingId(null);
        setSelectedLecture(null);
      } else if (selectedLecture?.id === idToDelete) {
        setSelectedLecture(null);
      }

      setDeletingLectureId(null);
    } catch (err) {
      console.error('Error deleting lecture:', err);
      alert('Failed to delete lecture.');
    }
  };

  // Filter & Search lectures
  const filteredLectures = audioLectures.filter((lecture) => {
    const matchesSearch =
      lecture.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lecture.subjectName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (lecture.section && lecture.section.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesSubject =
      selectedSubjectFilter === 'ALL' ||
      lecture.subjectName === selectedSubjectFilter ||
      lecture.courseId === selectedSubjectFilter;

    return matchesSearch && matchesSubject;
  });

  // Unique subject names for filter
  const uniqueSubjects = Array.from(
    new Set([
      ...courses.map((c) => c.name),
      ...audioLectures.map((l) => l.subjectName).filter(Boolean),
    ])
  );

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6" id="audio-lectures-view-container">
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        className="hidden"
      />

      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E1E3E1] pb-5" id="audio-lectures-header">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-[#1D1B20] tracking-tight flex items-center gap-2.5">
            <Mic className="w-6 h-6 text-[#6750A4]" /> Audio Lectures
          </h2>
          <p className="text-xs sm:text-sm text-[#49454F] font-medium mt-1">
            Save and organize your recorded lectures by subject and topic.
          </p>
        </div>

        <button
          onClick={() => {
            setIsAddModalOpen(true);
            setFormSubjectName(courses[0]?.name || '');
            setFormCourseId(courses[0]?.id || '');
          }}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#6750A4] hover:bg-[#503E84] text-white font-bold text-xs sm:text-sm rounded-full tracking-wide transition-all shadow-sm hover:shadow cursor-pointer shrink-0"
          id="add-lecture-button"
        >
          <Plus className="w-4 h-4" />
          <span>Add Lecture</span>
        </button>
      </div>

      {/* Search & Subject Filter Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3" id="search-filter-bar">
        <div className="sm:col-span-8 relative">
          <Search className="w-4 h-4 text-[#79747E] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by subject, section, or topic title..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#E1E3E1] rounded-full text-xs sm:text-sm text-[#1D1B20] placeholder-[#79747E] focus:outline-none focus:border-[#6750A4] focus:ring-1 focus:ring-[#6750A4] transition-all"
            id="search-lectures-input"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#79747E] hover:text-[#1D1B20] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="sm:col-span-4 relative">
          <div className="flex items-center bg-white border border-[#E1E3E1] rounded-full px-3.5 py-1">
            <Filter className="w-4 h-4 text-[#6750A4] mr-2 shrink-0" />
            <select
              value={selectedSubjectFilter}
              onChange={(e) => setSelectedSubjectFilter(e.target.value)}
              className="w-full py-1.5 bg-transparent text-xs sm:text-sm font-semibold text-[#1D1B20] focus:outline-none cursor-pointer"
              id="subject-filter-select"
            >
              <option value="ALL">All Subjects</option>
              {uniqueSubjects.map((subject) => (
                <option key={subject} value={subject}>
                  {subject}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {filteredLectures.length === 0 ? (
        /* Empty State */
        <div className="bg-white border border-[#E1E3E1] rounded-3xl p-8 sm:p-12 text-center flex flex-col items-center justify-center my-6" id="empty-lectures-state">
          <div className="w-16 h-16 rounded-full bg-[#EADDFF] flex items-center justify-center text-[#6750A4] mb-4">
            <Mic className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-black text-[#1D1B20] tracking-tight" id="empty-state-title">
            No lectures yet
          </h3>
          <p className="text-xs sm:text-sm text-[#49454F] font-medium max-w-md mt-1.5 leading-relaxed" id="empty-state-subtitle">
            Upload your first lecture and organize it by subject and topic for easy revision.
          </p>
          <button
            onClick={() => {
              setIsAddModalOpen(true);
              setFormSubjectName(courses[0]?.name || '');
              setFormCourseId(courses[0]?.id || '');
            }}
            className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-[#6750A4] hover:bg-[#503E84] text-white font-bold text-xs sm:text-sm rounded-full tracking-wide transition-all shadow cursor-pointer"
            id="empty-state-add-button"
          >
            <Plus className="w-4 h-4" />
            <span>Add Lecture</span>
          </button>
        </div>
      ) : (
        /* Lectures List & Player Split View */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="lectures-grid">
          {/* Lecture Cards List Column */}
          <div className={`${selectedLecture ? 'lg:col-span-6' : 'lg:col-span-12'} space-y-3`} id="lectures-list-column">
            {filteredLectures.map((lecture) => {
              const isSelected = selectedLecture?.id === lecture.id;
              const isThisPlaying = currentPlayingId === lecture.id && isPlaying;

              return (
                <div
                  key={lecture.id}
                  className={`bg-white border transition-all rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer hover:border-[#6750A4]/60 ${
                    isSelected
                      ? 'border-[#6750A4] ring-2 ring-[#6750A4]/20 shadow-sm bg-[#F3EDF7]/30'
                      : 'border-[#E1E3E1]'
                  }`}
                  onClick={() => setSelectedLecture(lecture)}
                  id={`lecture-card-${lecture.id}`}
                >
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        loadAndPlayLecture(lecture);
                      }}
                      className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-95 cursor-pointer ${
                        isThisPlaying
                          ? 'bg-[#6750A4] text-white shadow-md'
                          : 'bg-[#EADDFF] text-[#21005D] hover:bg-[#D0BCFF]'
                      }`}
                      title={isThisPlaying ? 'Pause' : 'Play'}
                      id={`play-btn-${lecture.id}`}
                    >
                      {isThisPlaying ? (
                        <Pause className="w-5 h-5 fill-current" />
                      ) : (
                        <Play className="w-5 h-5 fill-current ml-0.5" />
                      )}
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="px-2.5 py-0.5 bg-[#EADDFF] text-[#21005D] text-[10px] font-extrabold rounded-md uppercase tracking-wider">
                          {lecture.subjectName}
                        </span>
                        {lecture.section && (
                          <span className="px-2 py-0.5 bg-slate-100 text-[#49454F] text-[10px] font-semibold rounded-md border border-slate-200">
                            {lecture.section}
                          </span>
                        )}
                      </div>

                      <h4 className="text-sm sm:text-base font-extrabold text-[#1D1B20] truncate leading-snug">
                        {lecture.title}
                      </h4>

                      <div className="flex items-center gap-4 text-[11px] text-[#79747E] font-medium mt-1.5 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-[#6750A4]" />
                          {formatTime(lecture.duration)}
                        </span>
                        <span>•</span>
                        <span>Added {new Date(lecture.createdAt).toLocaleDateString()}</span>
                        {lecture.fileSize ? (
                          <>
                            <span>•</span>
                            <span>{formatFileSize(lecture.fileSize)}</span>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100 justify-end" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleDownloadAudio(lecture)}
                      className="p-2 text-[#49454F] hover:text-[#6750A4] hover:bg-[#F3EDF7] rounded-full transition-colors cursor-pointer"
                      title="Download Audio"
                      id={`download-btn-${lecture.id}`}
                    >
                      <Download className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => handleOpenEdit(lecture)}
                      className="p-2 text-[#49454F] hover:text-[#6750A4] hover:bg-[#F3EDF7] rounded-full transition-colors cursor-pointer"
                      title="Edit Lecture"
                      id={`edit-btn-${lecture.id}`}
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => setDeletingLectureId(lecture.id)}
                      className="p-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-full transition-colors cursor-pointer"
                      title="Delete Lecture"
                      id={`delete-btn-${lecture.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Lecture Detail & Audio Player Panel */}
          {selectedLecture && (
            <div className="lg:col-span-6 bg-white border border-[#E1E3E1] rounded-3xl p-5 sm:p-6 space-y-6 shadow-sm sticky top-6 self-start" id="lecture-detail-panel">
              <div className="flex items-start justify-between gap-3 border-b border-[#E1E3E1] pb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="px-3 py-1 bg-[#EADDFF] text-[#21005D] text-xs font-black rounded-lg uppercase tracking-wider">
                      {selectedLecture.subjectName}
                    </span>
                    {selectedLecture.section && (
                      <span className="px-2.5 py-1 bg-slate-100 text-[#49454F] text-xs font-bold rounded-lg border border-slate-200">
                        {selectedLecture.section}
                      </span>
                    )}
                  </div>
                  <h3 className="text-lg sm:text-xl font-black text-[#1D1B20] leading-snug">
                    {selectedLecture.title}
                  </h3>
                </div>

                <button
                  onClick={() => setSelectedLecture(null)}
                  className="p-1.5 text-[#79747E] hover:text-[#1D1B20] hover:bg-slate-100 rounded-full cursor-pointer shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Audio Player Controls */}
              <div className="bg-[#F3EDF7]/60 border border-[#EADDFF] rounded-2xl p-4 space-y-4" id="audio-player-controls">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => loadAndPlayLecture(selectedLecture)}
                      className={`w-12 h-12 rounded-full flex items-center justify-center transition-all cursor-pointer shadow ${
                        currentPlayingId === selectedLecture.id && isPlaying
                          ? 'bg-[#6750A4] text-white'
                          : 'bg-[#21005D] text-white hover:bg-[#6750A4]'
                      }`}
                      id="detail-player-play-btn"
                    >
                      {currentPlayingId === selectedLecture.id && isPlaying ? (
                        <Pause className="w-6 h-6 fill-current" />
                      ) : (
                        <Play className="w-6 h-6 fill-current ml-0.5" />
                      )}
                    </button>

                    <div>
                      <div className="text-xs font-bold text-[#1D1B20]">
                        {currentPlayingId === selectedLecture.id && isPlaying ? 'Playing Audio' : 'Audio Player'}
                      </div>
                      <div className="text-[11px] font-mono text-[#6750A4] font-bold">
                        {formatTime(currentPlayingId === selectedLecture.id ? currentTime : 0)} / {formatTime(selectedLecture.duration)}
                      </div>
                    </div>
                  </div>

                  {/* Playback Speed selector */}
                  <div className="flex items-center gap-1 bg-white border border-[#E1E3E1] rounded-full px-2 py-1">
                    {[0.75, 1, 1.25, 1.5, 2].map((rate) => (
                      <button
                        key={rate}
                        onClick={() => handlePlaybackRateChange(rate)}
                        className={`px-2 py-0.5 text-[10px] font-extrabold rounded-full transition-colors cursor-pointer ${
                          playbackRate === rate
                            ? 'bg-[#6750A4] text-white'
                            : 'text-[#49454F] hover:bg-slate-100'
                        }`}
                      >
                        {rate}x
                      </button>
                    ))}
                  </div>
                </div>

                {/* Timeline Seek Bar */}
                <div className="space-y-1">
                  <input
                    type="range"
                    min={0}
                    max={currentPlayingId === selectedLecture.id && duration ? duration : selectedLecture.duration || 100}
                    value={currentPlayingId === selectedLecture.id ? currentTime : 0}
                    onChange={(e) => handleSeek(parseFloat(e.target.value))}
                    className="w-full accent-[#6750A4] h-2 bg-[#EADDFF] rounded-lg cursor-pointer"
                    id="audio-timeline-seek"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-[#79747E]">
                    <span>{formatTime(currentPlayingId === selectedLecture.id ? currentTime : 0)}</span>
                    <span>{formatTime(selectedLecture.duration)}</span>
                  </div>
                </div>

                {/* Volume Slider & Controls */}
                <div className="flex items-center justify-between text-xs pt-1">
                  <div className="flex items-center gap-2">
                    <button onClick={toggleMute} className="text-[#6750A4] hover:text-[#21005D] cursor-pointer">
                      {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={isMuted ? 0 : volume}
                      onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                      className="w-20 accent-[#6750A4] h-1.5 bg-[#EADDFF] rounded-lg cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* Lecture Metadata Info */}
              <div className="space-y-2 text-xs font-medium text-[#49454F] bg-slate-50 border border-slate-200/80 rounded-2xl p-4">
                <h4 className="font-extrabold text-[#1D1B20] text-xs uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-[#6750A4]" /> Lecture Information
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  <div><span className="text-[#79747E]">Subject:</span> <strong className="text-[#1D1B20]">{selectedLecture.subjectName}</strong></div>
                  <div><span className="text-[#79747E]">Section:</span> <strong className="text-[#1D1B20]">{selectedLecture.section || '—'}</strong></div>
                  <div><span className="text-[#79747E]">Topic:</span> <strong className="text-[#1D1B20]">{selectedLecture.title}</strong></div>
                  <div><span className="text-[#79747E]">Duration:</span> <strong className="text-[#1D1B20]">{formatTime(selectedLecture.duration)}</strong></div>
                  <div><span className="text-[#79747E]">Date Added:</span> <strong className="text-[#1D1B20]">{new Date(selectedLecture.createdAt).toLocaleDateString()}</strong></div>
                  <div className="truncate"><span className="text-[#79747E]">File:</span> <strong className="text-[#1D1B20] truncate">{selectedLecture.originalFileName}</strong></div>
                </div>
              </div>

              {/* Use with AI Section */}
              <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-4 space-y-3" id="use-with-ai-section">
                <div className="flex items-center gap-2 text-amber-900 font-extrabold text-xs uppercase tracking-wider">
                  <Sparkles className="w-4 h-4 text-amber-600" /> Use with AI
                </div>
                <p className="text-xs text-amber-900/90 leading-relaxed font-medium">
                  Download this lecture and upload it to Gemini, ChatGPT, Copilot, or any AI that supports audio to create summaries, key points, notes, or revision questions.
                </p>

                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  <button
                    onClick={() => handleDownloadAudio(selectedLecture)}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-3.5 py-2 bg-[#6750A4] hover:bg-[#503E84] text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                    id="detail-download-btn"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Audio</span>
                  </button>

                  <button
                    onClick={handleCopyAiPrompt}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-3.5 py-2 bg-white hover:bg-slate-50 border border-amber-300 text-amber-950 font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                    id="copy-ai-prompt-btn"
                  >
                    {copiedPrompt ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-600" />
                        <span className="text-emerald-700">Prompt Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 text-amber-700" />
                        <span>Copy AI Prompt</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between border-t border-[#E1E3E1] pt-4">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleOpenEdit(selectedLecture)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-[#1D1B20] text-xs font-bold rounded-lg transition-colors cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" /> Edit
                  </button>
                  <button
                    onClick={() => setDeletingLectureId(selectedLecture.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ADD LECTURE MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs" id="add-lecture-modal">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl border border-[#E1E3E1] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#E1E3E1] pb-3">
              <h3 className="text-lg font-black text-[#1D1B20] tracking-tight flex items-center gap-2">
                <Mic className="w-5 h-5 text-[#6750A4]" /> Add Lecture
              </h3>
              <button
                onClick={() => {
                  setIsAddModalOpen(false);
                  setSelectedFile(null);
                  setFileError(null);
                }}
                className="p-1 text-[#79747E] hover:text-[#1D1B20] rounded-full cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveLecture} className="space-y-4">
              {/* Subject Selection */}
              <div>
                <label className="block text-xs font-extrabold text-[#1D1B20] uppercase tracking-wider mb-1.5">
                  Subject *
                </label>
                <select
                  value={formCourseId}
                  onChange={(e) => {
                    const cid = e.target.value;
                    setFormCourseId(cid);
                    const matched = courses.find((c) => c.id === cid);
                    if (matched) {
                      setFormSubjectName(matched.name);
                    }
                  }}
                  className="w-full px-3.5 py-2.5 bg-white border border-[#E1E3E1] rounded-xl text-xs sm:text-sm text-[#1D1B20] focus:outline-none focus:border-[#6750A4] focus:ring-1 focus:ring-[#6750A4]"
                  id="add-modal-subject-select"
                >
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.name}
                    </option>
                  ))}
                  {courses.length === 0 && <option value="">General</option>}
                </select>
              </div>

              {/* Section / Chapter */}
              <div>
                <label className="block text-xs font-extrabold text-[#1D1B20] uppercase tracking-wider mb-1.5">
                  Section / Chapter
                </label>
                <input
                  type="text"
                  value={formSection}
                  onChange={(e) => setFormSection(e.target.value)}
                  placeholder="e.g. Biology"
                  className="w-full px-3.5 py-2.5 bg-white border border-[#E1E3E1] rounded-xl text-xs sm:text-sm text-[#1D1B20] placeholder-[#79747E] focus:outline-none focus:border-[#6750A4] focus:ring-1 focus:ring-[#6750A4]"
                  id="add-modal-section-input"
                />
              </div>

              {/* Topic / Lecture Title */}
              <div>
                <label className="block text-xs font-extrabold text-[#1D1B20] uppercase tracking-wider mb-1.5">
                  Topic / Lecture Title *
                </label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. Reproduction System"
                  className="w-full px-3.5 py-2.5 bg-white border border-[#E1E3E1] rounded-xl text-xs sm:text-sm text-[#1D1B20] placeholder-[#79747E] focus:outline-none focus:border-[#6750A4] focus:ring-1 focus:ring-[#6750A4]"
                  id="add-modal-title-input"
                />
              </div>

              {/* Audio File Input */}
              <div>
                <label className="block text-xs font-extrabold text-[#1D1B20] uppercase tracking-wider mb-1.5">
                  Audio File *
                </label>

                <div className="border-2 border-dashed border-[#D0BCFF] hover:border-[#6750A4] bg-[#F3EDF7]/40 rounded-2xl p-4 text-center cursor-pointer transition-colors relative">
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={handleFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    id="add-modal-file-input"
                  />
                  <FileAudio className="w-8 h-8 text-[#6750A4] mx-auto mb-2" />
                  <p className="text-xs font-bold text-[#1D1B20]">
                    {selectedFile ? selectedFile.name : 'Click or drop audio recording file here'}
                  </p>
                  <p className="text-[10px] text-[#79747E] mt-0.5">
                    Supports MP3, M4A, WAV, AAC &amp; web audio formats
                  </p>
                </div>

                {fileError && (
                  <div className="mt-2 p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{fileError}</span>
                  </div>
                )}

                {selectedFile && !fileError && (
                  <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs font-medium space-y-1">
                    <div><span className="font-bold">Filename:</span> {selectedFile.name}</div>
                    <div><span className="font-bold">Duration:</span> {formatTime(detectedDuration)}</div>
                    <div><span className="font-bold">Size:</span> {formatFileSize(selectedFile.size)}</div>
                    <div><span className="font-bold">Type:</span> {selectedFile.type || 'audio file'}</div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-[#E1E3E1] pt-4">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-[#49454F] hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting || !selectedFile || !formTitle.trim()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#6750A4] hover:bg-[#503E84] disabled:opacity-50 text-white font-bold text-xs sm:text-sm rounded-full transition-all cursor-pointer shadow-xs"
                  id="add-modal-submit-btn"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save Lecture</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT LECTURE MODAL */}
      {editingLecture && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs" id="edit-lecture-modal">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl border border-[#E1E3E1]">
            <div className="flex items-center justify-between border-b border-[#E1E3E1] pb-3">
              <h3 className="text-lg font-black text-[#1D1B20] tracking-tight flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-[#6750A4]" /> Edit Lecture
              </h3>
              <button
                onClick={() => setEditingLecture(null)}
                className="p-1 text-[#79747E] hover:text-[#1D1B20] rounded-full cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-extrabold text-[#1D1B20] uppercase tracking-wider mb-1.5">
                  Subject
                </label>
                <select
                  value={editCourseId}
                  onChange={(e) => {
                    const cid = e.target.value;
                    setEditCourseId(cid);
                    const matched = courses.find((c) => c.id === cid);
                    if (matched) {
                      setEditSubjectName(matched.name);
                    }
                  }}
                  className="w-full px-3.5 py-2.5 bg-white border border-[#E1E3E1] rounded-xl text-xs sm:text-sm text-[#1D1B20] focus:outline-none focus:border-[#6750A4]"
                >
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.name}
                    </option>
                  ))}
                  {courses.length === 0 && <option value="">General</option>}
                </select>
              </div>

              <div>
                <label className="block text-xs font-extrabold text-[#1D1B20] uppercase tracking-wider mb-1.5">
                  Section / Chapter
                </label>
                <input
                  type="text"
                  value={editSection}
                  onChange={(e) => setEditSection(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-[#E1E3E1] rounded-xl text-xs sm:text-sm text-[#1D1B20] focus:outline-none focus:border-[#6750A4]"
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold text-[#1D1B20] uppercase tracking-wider mb-1.5">
                  Topic / Lecture Title *
                </label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-[#E1E3E1] rounded-xl text-xs sm:text-sm text-[#1D1B20] focus:outline-none focus:border-[#6750A4]"
                />
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-[#49454F]">
                <p className="font-semibold text-[#1D1B20] mb-0.5">Automated Filename Update:</p>
                Next download filename will be: <code className="bg-white px-1.5 py-0.5 rounded border font-mono text-[#6750A4] font-bold">{generateDownloadFilename({ ...editingLecture, subjectName: editSubjectName || editingLecture.subjectName, section: editSection, title: editTitle })}</code>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-[#E1E3E1] pt-4">
                <button
                  type="button"
                  onClick={() => setEditingLecture(null)}
                  className="px-4 py-2 text-xs font-bold text-[#49454F] hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-[#6750A4] hover:bg-[#503E84] text-white font-bold text-xs sm:text-sm rounded-full transition-all cursor-pointer shadow-xs"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deletingLectureId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs" id="delete-confirmation-modal">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 space-y-4 text-center shadow-2xl border border-[#E1E3E1]">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>

            <h3 className="text-lg font-black text-[#1D1B20]">
              Delete this lecture?
            </h3>

            <p className="text-xs text-[#49454F] font-medium leading-relaxed">
              This audio recording will be permanently removed.
            </p>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingLectureId(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-[#1D1B20] text-xs font-bold rounded-full transition-colors cursor-pointer"
                id="cancel-delete-lecture-btn"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={ConfirmDeleteLecture}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-full transition-colors shadow-xs cursor-pointer"
                id="confirm-delete-lecture-btn"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
