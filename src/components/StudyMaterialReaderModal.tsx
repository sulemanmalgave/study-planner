import React, { useState, useEffect } from 'react';
import {
  X,
  Download,
  ExternalLink,
  Sparkles,
  BookOpen,
  FileText,
  Copy,
  Check,
  RotateCw,
  Loader2,
  AlertCircle,
  Maximize2,
  Minimize2,
  PlusCircle,
  HelpCircle,
  Layers,
  ChevronRight
} from 'lucide-react';
import { Course, StudyMaterial, Note } from '../types';

interface StudyMaterialReaderModalProps {
  isOpen: boolean;
  onClose: () => void;
  material: StudyMaterial | null;
  courses: Course[];
  isPremium: boolean;
  onTriggerUpgrade: () => void;
  onUpdateMaterial: (id: string, updates: Partial<StudyMaterial>) => Promise<void>;
  onAddNoteFromAI?: (note: Omit<Note, 'id' | 'updatedAt'>) => Promise<{ success: boolean; error?: string }>;
}

export default function StudyMaterialReaderModal({
  isOpen,
  onClose,
  material,
  courses,
  isPremium,
  onTriggerUpgrade,
  onUpdateMaterial,
  onAddNoteFromAI,
}: StudyMaterialReaderModalProps) {
  const [activeTab, setActiveTab] = useState<'document' | 'summary' | 'notes' | 'keypoints'>('document');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // AI loading and error states
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [noteCreatedNotice, setNoteCreatedNotice] = useState<string | null>(null);

  const courseColor = courses.find((c) => c.id === material?.subjectId)?.color || '#6750A4';
  const fileExt = material?.fileType?.toLowerCase() || '';

  // Reset tab when modal opens or material changes
  useEffect(() => {
    if (isOpen && material) {
      setActiveTab('document');
      setAiError(null);
      setNoteCreatedNotice(null);
    }
  }, [isOpen, material?.id]);

  // Load preview for DOCX if applicable
  useEffect(() => {
    let isMounted = true;
    if (isOpen && material && fileExt === 'docx') {
      setIsLoadingPreview(true);
      fetch(`/api/study-materials/${material.id}/preview`)
        .then((res) => res.json())
        .then((data) => {
          if (isMounted) {
            if (data.previewType === 'html' && data.html) {
              setHtmlContent(data.html);
            }
          }
        })
        .catch((err) => {
          console.warn('Could not load docx html preview:', err);
        })
        .finally(() => {
          if (isMounted) setIsLoadingPreview(false);
        });
    } else {
      setHtmlContent(null);
    }
    return () => {
      isMounted = false;
    };
  }, [isOpen, material?.id, fileExt]);

  if (!isOpen || !material) return null;

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleTriggerAi = async (type: 'summary' | 'notes' | 'key-points') => {
    if (!isPremium) {
      onTriggerUpgrade();
      return;
    }

    setIsAiLoading(true);
    setAiError(null);

    try {
      const endpoint = `/api/ai/study-materials/${material.id}/${type}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json();
      if (!response.ok) {
        if (data.error === 'PREMIUM_REQUIRED' || data.error === 'PRO_FEATURE_REQUIRED' || response.status === 403) {
          onTriggerUpgrade();
          return;
        }
        throw new Error(data.message || 'AI request failed');
      }

      // Update local and parent state
      if (type === 'summary') {
        await onUpdateMaterial(material.id, {
          summary: data.summary,
          summaryGeneratedAt: new Date().toISOString(),
        });
      } else if (type === 'notes') {
        await onUpdateMaterial(material.id, {
          studyNotes: data.studyNotes,
          studyNotesGeneratedAt: new Date().toISOString(),
        });
      } else if (type === 'key-points') {
        await onUpdateMaterial(material.id, {
          keyPoints: data.keyPoints,
          keyPointsGeneratedAt: new Date().toISOString(),
        });
      }
    } catch (err: any) {
      console.error('AI Error:', err);
      setAiError(err.message || 'Failed to process AI request.');
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleCreateNotebookPageFromNotes = async () => {
    if (!material.studyNotes || !onAddNoteFromAI) return;
    try {
      const result = await onAddNoteFromAI({
        title: `AI Notes: ${material.name}`,
        content: material.studyNotes,
        courseId: material.subjectId || courses[0]?.id || '',
      });
      if (result.success) {
        setNoteCreatedNotice('Saved to your Notebook Pages!');
        setTimeout(() => setNoteCreatedNotice(null), 4000);
      } else {
        setAiError(result.error || 'Failed to save note.');
      }
    } catch (e: any) {
      setAiError(e.message || 'Failed to save note.');
    }
  };

  const getViewerUrl = () => {
    if (material.storagePath) {
      return material.storagePath;
    }
    if (material.fileDataUrl) {
      return material.fileDataUrl;
    }
    return `/api/study-materials/${material.id}/download`;
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-xs`}
      id="study-material-reader-modal"
    >
      <div
        className={`bg-white border border-[#E1E3E1] rounded-3xl flex flex-col overflow-hidden shadow-2xl transition-all duration-200 ${
          isFullscreen
            ? 'w-full h-full rounded-none'
            : 'w-full max-w-6xl h-[92vh]'
        }`}
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-[#E1E3E1] bg-[#F3EDF7]/50 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-[#EADDFF] text-[#21005D] rounded-xl shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black text-[#1D1B20] truncate max-w-xs sm:max-w-md">
                  {material.name}
                </h3>
                <span className="px-2 py-0.5 text-[9px] font-bold uppercase rounded-md bg-[#6750A4]/10 text-[#6750A4] font-mono shrink-0">
                  {fileExt}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[#49454F]">
                <span
                  className="font-bold px-1.5 py-0.2 rounded-sm"
                  style={{
                    backgroundColor: courseColor + '18',
                    color: courseColor,
                  }}
                >
                  {material.subjectName}
                </span>
                {material.topic && (
                  <>
                    <span>•</span>
                    <span className="text-[#79747E] font-medium">{material.topic}</span>
                  </>
                )}
                <span>•</span>
                <span className="font-mono text-[9px] text-[#79747E]">
                  {(material.fileSize / (1024 * 1024)).toFixed(1)} MB
                </span>
              </div>
            </div>
          </div>

          {/* Top Controls */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <a
              href={`/api/study-materials/${material.id}/download`}
              download={material.originalFileName}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-[#F3EDF7] text-xs font-bold text-[#1D1B20] border border-[#E1E3E1] rounded-xl transition-colors shadow-xs"
              title="Download original file"
              id="download-material-btn"
            >
              <Download className="w-3.5 h-3.5 text-[#6750A4]" />
              <span className="hidden sm:inline">Download</span>
            </a>

            <a
              href={getViewerUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 sm:p-2 bg-white hover:bg-[#F3EDF7] text-[#49454F] border border-[#E1E3E1] rounded-xl transition-colors shadow-xs"
              title="Open in new window"
              id="open-in-tab-btn"
            >
              <ExternalLink className="w-4 h-4" />
            </a>

            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 sm:p-2 bg-white hover:bg-[#F3EDF7] text-[#49454F] border border-[#E1E3E1] rounded-xl transition-colors shadow-xs"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              id="fullscreen-reader-btn"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            <button
              onClick={onClose}
              className="p-1.5 sm:p-2 text-[#49454F] hover:text-[#1D1B20] hover:bg-[#EADDFF]/60 rounded-full transition-colors ml-1 cursor-pointer"
              id="close-reader-modal-btn"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-2 border-b border-[#E1E3E1] bg-white text-xs font-bold shrink-0">
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => setActiveTab('document')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all cursor-pointer ${
                activeTab === 'document'
                  ? 'bg-[#EADDFF] text-[#21005D]'
                  : 'text-[#49454F] hover:bg-[#F3EDF7]'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Document</span>
            </button>

            <button
              onClick={() => setActiveTab('summary')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all cursor-pointer ${
                activeTab === 'summary'
                  ? 'bg-[#EADDFF] text-[#21005D]'
                  : 'text-[#49454F] hover:bg-[#F3EDF7]'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-[#6750A4]" />
              <span>AI Summary</span>
              {material.summary && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              )}
            </button>

            <button
              onClick={() => setActiveTab('notes')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all cursor-pointer ${
                activeTab === 'notes'
                  ? 'bg-[#EADDFF] text-[#21005D]'
                  : 'text-[#49454F] hover:bg-[#F3EDF7]'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5 text-[#6750A4]" />
              <span>AI Study Notes</span>
              {material.studyNotes && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              )}
            </button>

            <button
              onClick={() => setActiveTab('keypoints')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all cursor-pointer ${
                activeTab === 'keypoints'
                  ? 'bg-[#EADDFF] text-[#21005D]'
                  : 'text-[#49454F] hover:bg-[#F3EDF7]'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-[#6750A4]" />
              <span>Key Points</span>
              {material.keyPoints && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              )}
            </button>
          </div>

          <div className="hidden md:flex items-center gap-1 text-[10px] text-[#79747E] font-mono">
            <span>Explicit AI processing only</span>
          </div>
        </div>

        {/* Modal Main Body */}
        <div className="flex-1 overflow-hidden relative bg-[#F8F9FA]" id="reader-content-body">
          
          {/* TAB 1: Document Viewer */}
          {activeTab === 'document' && (
            <div className="w-full h-full flex flex-col">
              {fileExt === 'pdf' ? (
                <iframe
                  src={getViewerUrl()}
                  title={material.name}
                  className="w-full h-full border-0 bg-slate-100"
                />
              ) : fileExt === 'docx' ? (
                <div className="w-full h-full overflow-y-auto p-4 sm:p-8 bg-[#F3EDF7]/20">
                  <div className="max-w-3xl mx-auto bg-white border border-[#E1E3E1] rounded-2xl p-6 sm:p-10 shadow-sm">
                    {isLoadingPreview ? (
                      <div className="py-20 flex flex-col items-center justify-center space-y-3">
                        <Loader2 className="w-8 h-8 animate-spin text-[#6750A4]" />
                        <p className="text-xs text-[#49454F] font-mono">Rendering Word document preview...</p>
                      </div>
                    ) : htmlContent ? (
                      <div
                        className="prose prose-sm max-w-none text-[#1D1B20] leading-relaxed font-sans"
                        dangerouslySetInnerHTML={{ __html: htmlContent }}
                      />
                    ) : (
                      <div className="text-center py-12 space-y-4">
                        <FileText className="w-12 h-12 text-[#6750A4] mx-auto" />
                        <div>
                          <h4 className="text-sm font-bold text-[#1D1B20]">Word Document (DOCX)</h4>
                          <p className="text-xs text-[#49454F] mt-1">
                            {material.originalFileName} ({(material.fileSize / (1024 * 1024)).toFixed(1)} MB)
                          </p>
                        </div>
                        <a
                          href={`/api/study-materials/${material.id}/download`}
                          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#6750A4] text-white text-xs font-bold rounded-xl shadow-sm hover:bg-[#503E84]"
                        >
                          <Download className="w-4 h-4" />
                          <span>Download to Open in Microsoft Word</span>
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* DOC legacy */
                <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center space-y-4">
                  <div className="p-4 bg-[#EADDFF] text-[#21005D] rounded-3xl">
                    <FileText className="w-12 h-12" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-[#1D1B20]">{material.name}</h4>
                    <p className="text-xs text-[#49454F] mt-1 max-w-md">
                      This is a Microsoft Word DOC file ({material.originalFileName}). Download the original document to view and edit in your native word processor.
                    </p>
                  </div>
                  <a
                    href={`/api/study-materials/${material.id}/download`}
                    className="flex items-center gap-2 px-6 py-3 bg-[#6750A4] hover:bg-[#503E84] text-white text-xs font-bold rounded-2xl shadow-sm transition-all"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Original Document</span>
                  </a>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: AI Summary */}
          {activeTab === 'summary' && (
            <div className="w-full h-full overflow-y-auto p-4 sm:p-8">
              <div className="max-w-3xl mx-auto bg-white border border-[#E1E3E1] rounded-2xl p-6 sm:p-8 shadow-sm space-y-5">
                
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-[#E1E3E1]">
                  <div>
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-[#6750A4]" />
                      <h4 className="text-sm font-black text-[#1D1B20] uppercase tracking-wide">
                        AI Document Summary
                      </h4>
                    </div>
                    {material.summaryGeneratedAt && (
                      <p className="text-[10px] text-[#79747E] font-mono mt-0.5">
                        Generated {new Date(material.summaryGeneratedAt).toLocaleString()}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {material.summary && (
                      <>
                        <button
                          onClick={() => handleCopy(material.summary!, 'summary')}
                          className="flex items-center gap-1 px-3 py-1.5 bg-[#F3EDF7] hover:bg-[#EADDFF] text-xs font-bold text-[#1D1B20] rounded-xl border border-[#E1E3E1] transition-colors"
                        >
                          {copiedKey === 'summary' ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => handleTriggerAi('summary')}
                          disabled={isAiLoading}
                          className="flex items-center gap-1 px-3 py-1.5 bg-white hover:bg-[#F3EDF7] text-xs font-bold text-[#6750A4] rounded-xl border border-[#E1E3E1] transition-colors"
                        >
                          <RotateCw className={`w-3.5 h-3.5 ${isAiLoading ? 'animate-spin' : ''}`} />
                          <span>Regenerate</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {aiError && (
                  <div className="p-3 text-xs text-[#B3261E] bg-[#FDECEB] border border-[#F9DEDC] rounded-xl flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{aiError}</span>
                  </div>
                )}

                {isAiLoading ? (
                  <div className="py-16 text-center space-y-3">
                    <Loader2 className="w-8 h-8 animate-spin text-[#6750A4] mx-auto" />
                    <p className="text-xs font-bold text-[#1D1B20]">Gemini is analyzing your document...</p>
                    <p className="text-[10px] text-[#79747E] font-mono">Synthesizing core themes and takeaways</p>
                  </div>
                ) : material.summary ? (
                  <div className="prose prose-sm max-w-none text-[#1D1B20] font-sans leading-relaxed whitespace-pre-wrap">
                    {material.summary}
                  </div>
                ) : (
                  <div className="py-12 text-center space-y-4">
                    <div className="w-12 h-12 rounded-2xl bg-[#EADDFF] text-[#6750A4] mx-auto flex items-center justify-center">
                      <Sparkles className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-[#1D1B20]">No Summary Generated Yet</h4>
                      <p className="text-xs text-[#49454F] max-w-md mx-auto mt-1">
                        Generate an instant, high-yield academic summary of "{material.name}" using Gemini.
                      </p>
                    </div>
                    <button
                      onClick={() => handleTriggerAi('summary')}
                      className="px-6 py-2.5 bg-[#6750A4] hover:bg-[#503E84] text-white text-xs font-bold rounded-xl shadow-sm transition-all inline-flex items-center gap-2 cursor-pointer"
                      id="generate-ai-summary-btn"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>Generate AI Summary with Gemini</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: AI Study Notes */}
          {activeTab === 'notes' && (
            <div className="w-full h-full overflow-y-auto p-4 sm:p-8">
              <div className="max-w-3xl mx-auto bg-white border border-[#E1E3E1] rounded-2xl p-6 sm:p-8 shadow-sm space-y-5">
                
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-[#E1E3E1]">
                  <div>
                    <div className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-[#6750A4]" />
                      <h4 className="text-sm font-black text-[#1D1B20] uppercase tracking-wide">
                        Structured Study Notes
                      </h4>
                    </div>
                    {material.studyNotesGeneratedAt && (
                      <p className="text-[10px] text-[#79747E] font-mono mt-0.5">
                        Generated {new Date(material.studyNotesGeneratedAt).toLocaleString()}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {material.studyNotes && (
                      <>
                        <button
                          onClick={handleCreateNotebookPageFromNotes}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#6750A4] hover:bg-[#503E84] text-xs font-bold text-white rounded-xl shadow-xs transition-colors"
                          title="Save as a new page in your Notebook"
                        >
                          <PlusCircle className="w-3.5 h-3.5" />
                          <span>Save to Notebook</span>
                        </button>
                        <button
                          onClick={() => handleCopy(material.studyNotes!, 'notes')}
                          className="flex items-center gap-1 px-3 py-1.5 bg-[#F3EDF7] hover:bg-[#EADDFF] text-xs font-bold text-[#1D1B20] rounded-xl border border-[#E1E3E1] transition-colors"
                        >
                          {copiedKey === 'notes' ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => handleTriggerAi('notes')}
                          disabled={isAiLoading}
                          className="flex items-center gap-1 px-3 py-1.5 bg-white hover:bg-[#F3EDF7] text-xs font-bold text-[#6750A4] rounded-xl border border-[#E1E3E1] transition-colors"
                        >
                          <RotateCw className={`w-3.5 h-3.5 ${isAiLoading ? 'animate-spin' : ''}`} />
                          <span>Regenerate</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {noteCreatedNotice && (
                  <div className="p-3 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span>{noteCreatedNotice}</span>
                  </div>
                )}

                {aiError && (
                  <div className="p-3 text-xs text-[#B3261E] bg-[#FDECEB] border border-[#F9DEDC] rounded-xl flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{aiError}</span>
                  </div>
                )}

                {isAiLoading ? (
                  <div className="py-16 text-center space-y-3">
                    <Loader2 className="w-8 h-8 animate-spin text-[#6750A4] mx-auto" />
                    <p className="text-xs font-bold text-[#1D1B20]">Generating comprehensive study notes...</p>
                    <p className="text-[10px] text-[#79747E] font-mono">Organizing formulas, definitions, and mechanisms</p>
                  </div>
                ) : material.studyNotes ? (
                  <div className="prose prose-sm max-w-none text-[#1D1B20] font-sans leading-relaxed whitespace-pre-wrap">
                    {material.studyNotes}
                  </div>
                ) : (
                  <div className="py-12 text-center space-y-4">
                    <div className="w-12 h-12 rounded-2xl bg-[#EADDFF] text-[#6750A4] mx-auto flex items-center justify-center">
                      <BookOpen className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-[#1D1B20]">No Study Notes Generated Yet</h4>
                      <p className="text-xs text-[#49454F] max-w-md mx-auto mt-1">
                        Turn this document into in-depth study notes with concepts, definitions, and exam formulas.
                      </p>
                    </div>
                    <button
                      onClick={() => handleTriggerAi('notes')}
                      className="px-6 py-2.5 bg-[#6750A4] hover:bg-[#503E84] text-white text-xs font-bold rounded-xl shadow-sm transition-all inline-flex items-center gap-2 cursor-pointer"
                      id="generate-ai-notes-btn"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>Generate Study Notes with Gemini</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: Key Points */}
          {activeTab === 'keypoints' && (
            <div className="w-full h-full overflow-y-auto p-4 sm:p-8">
              <div className="max-w-3xl mx-auto bg-white border border-[#E1E3E1] rounded-2xl p-6 sm:p-8 shadow-sm space-y-5">
                
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-[#E1E3E1]">
                  <div>
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-[#6750A4]" />
                      <h4 className="text-sm font-black text-[#1D1B20] uppercase tracking-wide">
                        Key Points &amp; Flashcard Concepts
                      </h4>
                    </div>
                    {material.keyPointsGeneratedAt && (
                      <p className="text-[10px] text-[#79747E] font-mono mt-0.5">
                        Generated {new Date(material.keyPointsGeneratedAt).toLocaleString()}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {material.keyPoints && (
                      <>
                        <button
                          onClick={() => handleCopy(material.keyPoints!, 'keypoints')}
                          className="flex items-center gap-1 px-3 py-1.5 bg-[#F3EDF7] hover:bg-[#EADDFF] text-xs font-bold text-[#1D1B20] rounded-xl border border-[#E1E3E1] transition-colors"
                        >
                          {copiedKey === 'keypoints' ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => handleTriggerAi('key-points')}
                          disabled={isAiLoading}
                          className="flex items-center gap-1 px-3 py-1.5 bg-white hover:bg-[#F3EDF7] text-xs font-bold text-[#6750A4] rounded-xl border border-[#E1E3E1] transition-colors"
                        >
                          <RotateCw className={`w-3.5 h-3.5 ${isAiLoading ? 'animate-spin' : ''}`} />
                          <span>Regenerate</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {aiError && (
                  <div className="p-3 text-xs text-[#B3261E] bg-[#FDECEB] border border-[#F9DEDC] rounded-xl flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{aiError}</span>
                  </div>
                )}

                {isAiLoading ? (
                  <div className="py-16 text-center space-y-3">
                    <Loader2 className="w-8 h-8 animate-spin text-[#6750A4] mx-auto" />
                    <p className="text-xs font-bold text-[#1D1B20]">Extracting high-yield key points...</p>
                    <p className="text-[10px] text-[#79747E] font-mono">Filtering definitions and exam facts</p>
                  </div>
                ) : material.keyPoints ? (
                  <div className="prose prose-sm max-w-none text-[#1D1B20] font-sans leading-relaxed whitespace-pre-wrap">
                    {material.keyPoints}
                  </div>
                ) : (
                  <div className="py-12 text-center space-y-4">
                    <div className="w-12 h-12 rounded-2xl bg-[#EADDFF] text-[#6750A4] mx-auto flex items-center justify-center">
                      <Layers className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-[#1D1B20]">No Key Points Extracted Yet</h4>
                      <p className="text-xs text-[#49454F] max-w-md mx-auto mt-1">
                        Extract bulleted cheat sheets and exam review takeaways from "{material.name}".
                      </p>
                    </div>
                    <button
                      onClick={() => handleTriggerAi('key-points')}
                      className="px-6 py-2.5 bg-[#6750A4] hover:bg-[#503E84] text-white text-xs font-bold rounded-xl shadow-sm transition-all inline-flex items-center gap-2 cursor-pointer"
                      id="generate-ai-keypoints-btn"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>Extract Key Points with Gemini</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
