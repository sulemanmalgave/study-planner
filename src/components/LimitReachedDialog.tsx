import React from 'react';
import { Sparkles, AlertCircle, X } from 'lucide-react';

interface LimitReachedDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onUpgradeClick: () => void;
  limitType: 'assignments' | 'exams' | 'notes' | 'courses' | 'timetables';
}

export default function LimitReachedDialog({
  isOpen,
  onClose,
  onUpgradeClick,
  limitType
}: LimitReachedDialogProps) {
  if (!isOpen) return null;

  const getLimitDetails = () => {
    switch (limitType) {
      case 'assignments':
        return { name: 'Tasks & Assignments', limit: '10 assignments / 20 active tasks' };
      case 'exams':
        return { name: 'Exams', limit: '5' };
      case 'notes':
        return { name: 'Notes', limit: '10' };
      case 'courses':
        return { name: 'Courses', limit: '5' };
      case 'timetables':
        return { name: 'Timetable Classes', limit: '10' };
      default:
        return { name: 'Items', limit: 'quota' };
    }
  };

  const { name, limit } = getLimitDetails();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in" id="limit-dialog-backdrop">
      <div 
        className="relative w-full max-w-sm bg-white border border-[#E1E3E1] rounded-[28px] p-6 shadow-2xl flex flex-col gap-4 text-left animate-scale-up"
        id="limit-dialog-card"
      >
        {/* Header Icon */}
        <div className="flex items-center gap-3">
          <img 
            src="/logo.png" 
            alt="StudyFlow Logo" 
            className="w-10 h-10 rounded-2xl object-cover shadow-sm border border-slate-200/80" 
            referrerPolicy="no-referrer"
          />
          <div>
            <h3 className="text-base font-bold text-[#1D1B20] tracking-tight flex items-center gap-1.5" id="limit-dialog-title">
              <span>Free Plan Limit Reached</span>
            </h3>
            <span className="text-[10px] text-[#6750A4] font-semibold">StudyFlow Quota</span>
          </div>
        </div>

        {/* Message Content */}
        <p className="text-xs text-[#49454F] leading-relaxed font-medium" id="limit-dialog-message">
          You've reached the free plan limit for {name} ({limit}). Upgrade to StudyFlow Premium to unlock unlimited Tasks, Exams, Notes, and the full Timetable.
        </p>

        {/* Perks list */}
        <div className="bg-[#F3EDF7]/40 border border-[#E1E3E1]/50 rounded-2xl p-3 space-y-1.5">
          <div className="text-[10px] font-bold text-[#6750A4] uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            Premium Perks:
          </div>
          <ul className="text-[10px] text-[#49454F] space-y-1 pl-1 list-disc list-inside font-medium">
            <li>Unlimited Tasks, Assignments & Exams</li>
            <li>Unlimited Revision Study Notebook Pages</li>
            <li>Full 7-day Weekly Lecture Timetable slots</li>
            <li>Access all progress history analytics data</li>
          </ul>
        </div>

        {/* Buttons / Actions conforming to M3 Specs */}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-[#6750A4] hover:bg-[#6750A4]/10 rounded-full transition-colors cursor-pointer"
            id="limit-dialog-cancel"
          >
            Maybe Later
          </button>
          <button
            onClick={() => {
              onClose();
              onUpgradeClick();
            }}
            className="px-5 py-2.5 bg-[#6750A4] hover:bg-[#503E84] text-xs font-bold text-white rounded-full shadow-sm hover:shadow transition-all flex items-center gap-1.5 cursor-pointer"
            id="limit-dialog-upgrade"
          >
            <Sparkles className="w-3.5 h-3.5 text-yellow-300 fill-yellow-300" />
            <span>Upgrade to Premium</span>
          </button>
        </div>
      </div>
    </div>
  );
}
