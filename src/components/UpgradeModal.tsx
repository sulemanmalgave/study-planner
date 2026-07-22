import React from 'react';
import { X, Check, Sparkles, Clock, AlertCircle } from 'lucide-react';
import { Subscription } from '../types';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (updatedSubscription: Subscription) => void;
  currentCountry?: string;
}

export default function UpgradeModal({ isOpen, onClose }: UpgradeModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in" id="upgrade-modal-backdrop">
      <div className="relative w-full max-w-lg overflow-hidden bg-[#131d31] border border-slate-700/60 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]" id="upgrade-modal-card">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-[#0e1627]">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <h3 className="text-lg font-semibold text-white tracking-tight">StudyFlow Premium</h3>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-left">
          
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-amber-500/20 text-amber-400 rounded-full mb-2">
              <Sparkles className="w-6 h-6" />
            </div>
            <h4 className="text-base font-semibold text-slate-100">Master Syllabus Features</h4>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Get unlimited Courses, Timetables, Tasks, Exams, and Notes with Lifetime Progress History.
            </p>
          </div>

          {/* Coming Soon Alert Banner */}
          <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-3" id="payment-disabled-notice">
            <Clock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h5 className="text-xs font-bold text-amber-300">Online Payments Coming Soon</h5>
              <p className="text-[11px] text-amber-200/80 leading-relaxed font-medium">
                Payment gateway checkout functionality is currently disabled for upcoming platform maintenance. All payment requirements have been safely bypassed.
              </p>
            </div>
          </div>

          {/* Plan Options Overview */}
          <div className="space-y-2.5">
            <label className="text-xs font-semibold text-slate-300">Upcoming Premium Plans</label>
            <div className="grid grid-cols-2 gap-2">
              {/* Monthly */}
              <div className="p-4 rounded-xl border bg-[#1a263d] border-slate-800 text-slate-300 space-y-1 opacity-75">
                <div className="text-xs font-bold text-white">Monthly Plan</div>
                <div className="text-sm font-black text-amber-400">$2.99 / mo</div>
                <div className="text-[10px] text-slate-400">Cancel anytime</div>
              </div>

              {/* Quarterly */}
              <div className="p-4 rounded-xl border bg-[#1a263d] border-slate-800 text-slate-300 space-y-1 opacity-75 relative">
                <span className="absolute top-2 right-2 px-1.5 py-0.5 text-[8px] font-extrabold bg-amber-500 text-slate-950 rounded uppercase">
                  Best Value
                </span>
                <div className="text-xs font-bold text-white">Quarterly Plan</div>
                <div className="text-sm font-black text-amber-400">$7.99 / 3 mos</div>
                <div className="text-[10px] text-slate-400">Save 15%</div>
              </div>
            </div>
          </div>

          {/* Features List */}
          <div className="p-4 bg-[#0e1627] rounded-xl space-y-2 border border-slate-800">
            <div className="text-[11px] font-bold text-slate-400 tracking-wider uppercase">Included in Premium:</div>
            <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
              <div className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Unlimited Courses</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Unlimited Assignments</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Unlimited Timetables</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Unlimited Notes</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Full History Analytics</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>JSON Data Exports</span>
              </div>
            </div>
          </div>

          {/* Disabled Action Button */}
          <button
            disabled
            className="w-full py-3 text-xs font-bold text-slate-400 bg-slate-800 border border-slate-700/60 rounded-xl cursor-not-allowed flex items-center justify-center gap-2 opacity-80"
            id="payment-disabled-button"
          >
            <Clock className="w-4 h-4 text-amber-400" />
            <span>Payments Coming Soon</span>
          </button>

        </div>
      </div>
    </div>
  );
}
