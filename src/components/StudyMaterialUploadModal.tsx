import React, { useState, useRef } from 'react';
import { 
  X, 
  Upload, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  BookOpen, 
  Sparkles,
  Layers,
  Image as ImageIcon
} from 'lucide-react';
import { upload } from '@vercel/blob/client';
import { Course, StudyMaterial, FREE_PLAN_LIMITS } from '../types';
import SubjectSelect from './SubjectSelect';
import { getAuthHeaders } from '../lib/emailAuth';

const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.webp', '.txt', '.csv'];

interface StudyMaterialUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  courses: Course[];
  currentMaterialsCount: number;
  isPremium: boolean;
  onAddCourse: (course: Omit<Course, 'id'>) => Promise<{ success: boolean; error?: string }>;
  onUploadSuccess: (material: StudyMaterial) => void;
  onTriggerUpgrade: () => void;
}

export default function StudyMaterialUploadModal({
  isOpen,
  onClose,
  courses,
  currentMaterialsCount,
  isPremium,
  onAddCourse,
  onUploadSuccess,
  onTriggerUpgrade,
}: StudyMaterialUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [subjectId, setSubjectId] = useState(courses[0]?.id || '');
  const [topic, setTopic] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const isLimitReached = !isPremium && currentMaterialsCount >= FREE_PLAN_LIMITS.studyMaterials;

  const validateAndSetFile = (selectedFile: File) => {
    setErrorMessage(null);
    const ext = '.' + selectedFile.name.split('.').pop()?.toLowerCase();

    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setErrorMessage('Unsupported file format. Supported formats: PDF, Word (DOC, DOCX), Images (JPG, PNG, WEBP), Text (TXT), and CSV.');
      return;
    }

    if (selectedFile.size > 30 * 1024 * 1024) {
      setErrorMessage('File size exceeds the 30MB maximum limit. Please select a document under 30MB.');
      return;
    }

    setFile(selectedFile);
    // Prefill title if empty
    if (!title) {
      const cleanName = selectedFile.name.replace(/\.[^/.]+$/, '');
      setTitle(cleanName);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isLimitReached) {
      onTriggerUpgrade();
      return;
    }

    if (!file) {
      setErrorMessage('Please select a file to upload.');
      return;
    }

    setIsUploading(true);
    setUploadProgress(15);
    setErrorMessage(null);

    const selectedCourse = courses.find((c) => c.id === subjectId);
    const subjectName = selectedCourse?.name || 'General';
    const documentTitle = title.trim() || file.name.replace(/\.[^/.]+$/, '');
    const cleanExt = file.name.split('.').pop()?.toLowerCase() || 'pdf';

    try {
      let savedMaterial: StudyMaterial | null = null;
      const baseAuthHeaders = getAuthHeaders();
      const tokenOnlyHeaders: Record<string, string> = {};
      if (baseAuthHeaders['Authorization']) tokenOnlyHeaders['Authorization'] = baseAuthHeaders['Authorization'];
      if (baseAuthHeaders['x-session-token']) tokenOnlyHeaders['x-session-token'] = baseAuthHeaders['x-session-token'];
      if (baseAuthHeaders['x-user-id']) tokenOnlyHeaders['x-user-id'] = baseAuthHeaders['x-user-id'];
      if (baseAuthHeaders['x-user-email']) tokenOnlyHeaders['x-user-email'] = baseAuthHeaders['x-user-email'];

      // Strategy 1: Fast direct multipart server upload (supports up to 30MB, resilient local/cloud storage)
      try {
        setUploadProgress(40);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('name', documentTitle);
        formData.append('subjectId', subjectId);
        formData.append('subjectName', subjectName);
        formData.append('topic', topic.trim());

        const response = await fetch('/api/study-materials/upload', {
          method: 'POST',
          headers: tokenOnlyHeaders,
          body: formData,
        });

        const data = await response.json().catch(() => ({}));

        if (response.ok && data && data.id) {
          savedMaterial = data;
        } else if (data.error === 'LIMIT_REACHED') {
          onTriggerUpgrade();
          onClose();
          return;
        } else {
          console.warn('Multipart upload encountered an issue, trying alternative upload strategy:', data?.message || data?.error);
        }
      } catch (multipartErr: any) {
        console.warn('Multipart upload failed, attempting fallback upload:', multipartErr?.message);
      }

      // Strategy 2: Attempt client-side Vercel Blob upload if configured
      if (!savedMaterial) {
        try {
          setUploadProgress(60);
          const blob = await upload(file.name, file, {
            access: 'public',
            handleUploadUrl: '/api/study-materials/upload-token',
            headers: tokenOnlyHeaders,
          });

          setUploadProgress(80);

          // Save material metadata with the permanent blob identifier & URL
          const metaResp = await fetch('/api/study-materials', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...tokenOnlyHeaders,
            },
            body: JSON.stringify({
              name: documentTitle,
              subjectId,
              subjectName,
              topic: topic.trim(),
              originalFileName: file.name,
              fileType: cleanExt,
              mimeType: file.type || 'application/octet-stream',
              fileSize: file.size,
              storagePath: blob.url,
              storageKey: blob.pathname,
              storageUrl: blob.url,
              downloadUrl: blob.downloadUrl,
            }),
          });

          if (metaResp.ok) {
            savedMaterial = await metaResp.json();
          }
        } catch (blobError: any) {
          console.warn('Client blob upload not available, falling back to base64 encoding:', blobError?.message);
        }
      }

      // Strategy 3: Resilient client-side FileReader Base64 fallback (guarantees upload even if server limits or network issues occur)
      if (!savedMaterial) {
        setUploadProgress(70);
        const base64DataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        setUploadProgress(85);
        const metaResp = await fetch('/api/study-materials', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...tokenOnlyHeaders,
          },
          body: JSON.stringify({
            name: documentTitle,
            subjectId,
            subjectName,
            topic: topic.trim(),
            originalFileName: file.name,
            fileType: cleanExt,
            mimeType: file.type || 'application/octet-stream',
            fileSize: file.size,
            fileDataUrl: base64DataUrl,
            fileBase64: base64DataUrl,
          }),
        });

        if (!metaResp.ok) {
          const errData = await metaResp.json().catch(() => ({}));
          if (errData.error === 'LIMIT_REACHED') {
            onTriggerUpgrade();
            onClose();
            return;
          }
          throw new Error(errData.message || 'Unable to save this material. Please try again.');
        }

        savedMaterial = await metaResp.json();
      }

      if (!savedMaterial || !savedMaterial.id) {
        throw new Error('Unable to save this material. Please try again.');
      }

      setUploadProgress(100);
      onUploadSuccess(savedMaterial);
      onClose();
    } catch (err: any) {
      console.error('Study material upload failed:', err);
      setErrorMessage(err.message || 'Unable to save this material. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs" id="material-upload-modal">
      <div className="bg-white border border-[#E1E3E1] rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E1E3E1] bg-[#F3EDF7]/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-[#EADDFF] text-[#21005D] rounded-xl">
              <Upload className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-[#1D1B20]">Upload Study Material</h3>
              <p className="text-[10px] text-[#49454F] font-medium">PDF, Word, Images, TXT, CSV up to 30MB</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#49454F] hover:text-[#1D1B20] hover:bg-[#EADDFF]/50 rounded-full transition-colors cursor-pointer"
            id="close-upload-modal-btn"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Limit Warning banner if approaching or reached */}
        {!isPremium && (
          <div className="px-6 py-2.5 bg-amber-50 border-b border-amber-200/60 flex items-center justify-between text-xs text-amber-900">
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span className="text-[11px] font-medium">
                Free Plan: <strong>{currentMaterialsCount}</strong> / {FREE_PLAN_LIMITS.studyMaterials} materials used
              </span>
            </div>
            <button
              onClick={onTriggerUpgrade}
              className="text-[10px] font-bold text-[#6750A4] hover:underline uppercase tracking-wide cursor-pointer"
            >
              Get Unlimited
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4" id="upload-material-form">
          {errorMessage && (
            <div className="p-3.5 text-xs text-[#B3261E] bg-[#FDECEB] border border-[#F9DEDC] rounded-2xl flex items-start gap-2.5" id="upload-error-alert">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#B3261E]" />
              <div className="flex-1 leading-relaxed">
                <span className="font-semibold">{errorMessage}</span>
              </div>
            </div>
          )}

          {/* Dropzone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
              isDragging
                ? 'border-[#6750A4] bg-[#EADDFF]/30 scale-[1.01]'
                : file
                ? 'border-emerald-300 bg-emerald-50/40'
                : 'border-[#E1E3E1] hover:border-[#6750A4]/60 bg-[#F3EDF7]/20 hover:bg-[#F3EDF7]/40'
            }`}
            id="material-dropzone"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.txt,.csv,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png,image/webp,text/plain,text/csv"
              onChange={handleFileInputChange}
              className="hidden"
              id="file-upload-input"
            />

            {file ? (
              <div className="flex items-center gap-3 text-left">
                <div className="p-3 bg-emerald-100 text-emerald-700 rounded-xl">
                  {['jpg', 'jpeg', 'png', 'webp'].includes(file.name.split('.').pop()?.toLowerCase() || '') ? (
                    <ImageIcon className="w-6 h-6" />
                  ) : (
                    <FileText className="w-6 h-6" />
                  )}
                </div>
                <div>
                  <h4 className="text-xs font-bold text-[#1D1B20] max-w-xs truncate">{file.name}</h4>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-[#49454F] font-mono">
                    <span className="uppercase font-bold text-emerald-700">
                      {file.name.split('.').pop()}
                    </span>
                    <span>•</span>
                    <span>{formatFileSize(file.size)}</span>
                  </div>
                  <p className="text-[9px] text-emerald-600 font-semibold mt-1">Click or drop to replace file</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-[#EADDFF] text-[#6750A4] flex items-center justify-center shadow-xs">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs font-bold text-[#1D1B20]">
                    Drag &amp; drop your study document, or <span className="text-[#6750A4] underline">browse</span>
                  </p>
                  <p className="text-[10px] text-[#79747E] mt-1 font-mono">
                    Supports PDF, Word, Images, TXT, CSV • Max 30MB
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Form fields */}
          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-bold text-[#49454F] uppercase tracking-wider block mb-1">
                Document Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Chapter 4 - Derivatives & Integrals"
                className="w-full bg-white border border-[#E1E3E1] text-xs font-medium text-[#1D1B20] rounded-xl px-3.5 py-2.5 focus:ring-2 focus:ring-[#6750A4]/30 focus:border-[#6750A4] outline-none transition-all"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <SubjectSelect
                  courses={courses}
                  value={subjectId}
                  onChange={setSubjectId}
                  onAddCourse={onAddCourse}
                  label="Subject / Class"
                  id="material-subject-select"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-[#49454F] uppercase tracking-wider block mb-1">
                  Topic / Chapter (Optional)
                </label>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. Unit 3, Final Review"
                  className="w-full bg-white border border-[#E1E3E1] text-xs font-medium text-[#1D1B20] rounded-xl px-3.5 py-2.5 focus:ring-2 focus:ring-[#6750A4]/30 focus:border-[#6750A4] outline-none transition-all"
                />
              </div>
            </div>
          </div>

          {/* Upload Progress */}
          {isUploading && (
            <div className="space-y-1.5 pt-2">
              <div className="flex items-center justify-between text-[10px] font-mono text-[#49454F]">
                <span>Uploading &amp; cloud syncing...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full h-1.5 bg-[#E1E3E1] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#6750A4] transition-all duration-300 rounded-full"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#E1E3E1]">
            <button
              type="button"
              onClick={onClose}
              disabled={isUploading}
              className="px-4 py-2.5 bg-[#F3EDF7] hover:bg-[#EADDFF] text-xs font-bold text-[#1D1B20] rounded-xl border border-[#E1E3E1] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isUploading || !file}
              className="px-6 py-2.5 bg-[#6750A4] hover:bg-[#503E84] disabled:opacity-50 text-xs font-bold text-white rounded-xl shadow-sm transition-all flex items-center gap-2 cursor-pointer"
              id="confirm-upload-material-btn"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Uploading Document...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>Save to Materials</span>
                </>
              )}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
