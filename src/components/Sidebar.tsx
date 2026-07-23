import React from 'react';
import { 
  LayoutDashboard, 
  Calendar, 
  Clock, 
  FileText, 
  GraduationCap, 
  CalendarDays, 
  CheckSquare, 
  BookOpen, 
  Settings, 
  Sparkles 
} from 'lucide-react';
import { UserProfile } from '../types';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  profile: UserProfile;
  onUpgradeClick: () => void;
}

export default function Sidebar({ activeTab, setActiveTab, profile, onUpgradeClick }: SidebarProps) {
  const isPremium = profile.subscription.subscriptionStatus === 'premium' || profile.subscription.plan === 'premium';

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'calendar', label: 'Calendar', icon: Calendar },
    { id: 'timetable', label: 'Timetable', icon: CalendarDays },
    { id: 'assignments', label: 'Assignments', icon: CheckSquare },
    { id: 'exams', label: 'Exams', icon: GraduationCap },
    { id: 'study-timer', label: 'Study Sessions', icon: Clock },
    { id: 'notes', label: 'Notes', icon: FileText },
    { id: 'progress', label: 'Progress', icon: BookOpen },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside className="w-64 bg-white border-r border-[#E1E3E1] flex flex-col justify-between h-screen shrink-0 text-[#49454F] p-4 md:p-3 lg:p-4" id="main-sidebar">
      <div>
        {/* Brand Header */}
        <div className="flex items-center gap-2.5 px-3 mb-4 mt-1" id="sidebar-header">
          <div className="w-8 h-8 bg-[#6750A4] rounded-lg flex items-center justify-center text-white font-bold text-base shadow-sm">
            S
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-[#1D1B20] leading-none">StudyFlow</h1>
            <span className="text-[8px] font-mono font-bold tracking-wider text-[#6750A4] uppercase mt-0.5 block">Digital Planner</span>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="space-y-0.5" id="sidebar-nav">
          {menuItems.map((item) => {
            const IconComponent = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#EADDFF] text-[#21005D] font-bold shadow-sm'
                    : 'text-[#49454F] hover:bg-[#F3EDF7] hover:text-[#1D1B20]'
                }`}
                id={`nav-link-${item.id}`}
              >
                <IconComponent className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#21005D]' : 'text-[#49454F]'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom section with Premium Card and Profile */}
      <div className="pt-3 border-t border-[#E1E3E1] flex flex-col gap-3" id="sidebar-bottom-section">
        {/* Premium Upgrade or Premium Active Card */}
        {isPremium ? (
          <div className="p-3 bg-emerald-50 border border-emerald-200/60 rounded-2xl flex items-center justify-center gap-2 text-emerald-800" id="sidebar-premium-active-card">
            <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="text-xs font-bold">Premium Active ✓</span>
          </div>
        ) : (
          <div className="p-3 bg-[#EADDFF]/30 border border-[#D0BCFF]/40 rounded-2xl" id="sidebar-premium-card">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#21005D]">
              <Sparkles className="w-3.5 h-3.5 text-[#6750A4]" />
              <span>StudyFlow Premium</span>
            </div>
            <p className="text-[10px] text-[#49454F] font-medium mt-1 leading-snug">
              Unlock advanced productivity tools
            </p>
            <ul className="mt-2 space-y-1 text-[9px] text-[#49454F] font-medium">
              <li className="flex items-center gap-1.5">
                <span className="text-[#6750A4] font-bold">✓</span> Unlimited Notes
              </li>
              <li className="flex items-center gap-1.5">
                <span className="text-[#6750A4] font-bold">✓</span> Advanced Study Analytics
              </li>
              <li className="flex items-center gap-1.5">
                <span className="text-[#6750A4] font-bold">✓</span> Smart Exam Planner
              </li>
            </ul>
            <button
              onClick={onUpgradeClick}
              className="w-full mt-3 py-1.5 bg-[#6750A4] hover:bg-[#503E84] text-white font-bold text-[10px] rounded-full uppercase tracking-wider transition-colors shadow-sm cursor-pointer"
              id="sidebar-upgrade-button"
            >
              Upgrade
            </button>
          </div>
        )}

        {/* Compact Profile Detail Card */}
        <div className="flex items-center gap-2.5 px-2 py-1" id="sidebar-profile-card">
          <div className="w-8 h-8 rounded-full bg-[#6750A4] flex items-center justify-center text-xs font-bold text-white shadow-sm shrink-0">
            {profile.initials}
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-xs font-bold text-[#1D1B20] truncate leading-tight">{profile.name}</h4>
            <div className="mt-1">
              {isPremium ? (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[8px] font-black bg-[#EADDFF] text-[#21005D] border border-[#D0BCFF] uppercase tracking-wider" id="sidebar-badge-premium">
                  Premium
                </span>
              ) : (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[8px] font-bold bg-[#79747E]/10 text-[#49454F] border border-[#79747E]/20 uppercase tracking-wider" id="sidebar-badge-free">
                  Free Plan
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
