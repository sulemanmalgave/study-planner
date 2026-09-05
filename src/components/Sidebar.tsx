import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LayoutDashboard, 
  BookOpen,
  Calendar, 
  Clock, 
  FileText, 
  GraduationCap, 
  CalendarDays, 
  CheckSquare, 
  BarChart3,
  Settings, 
  Sparkles,
  Smartphone,
  Mic,
  X
} from 'lucide-react';
import { UserProfile } from '../types';
import { drawerVariants, modalBackdropVariants } from '../lib/animations';
import { AuthUserProfile } from '../lib/firebase';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  profile: UserProfile;
  onUpgradeClick: () => void;
  isOpen?: boolean;
  onClose?: () => void;
  authUser?: AuthUserProfile | null;
  onSignIn?: () => void;
  onSignOut?: () => void;
}

export default function Sidebar({ 
  activeTab, 
  setActiveTab, 
  profile, 
  onUpgradeClick, 
  isOpen, 
  onClose,
  authUser,
  onSignIn,
  onSignOut,
}: SidebarProps) {
  const isPremium = profile.subscription.subscriptionStatus === 'premium' || profile.subscription.plan === 'premium';

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'subjects', label: 'Subjects', icon: BookOpen },
    { id: 'calendar', label: 'Calendar', icon: Calendar },
    { id: 'timetable', label: 'Timetable', icon: CalendarDays },
    { id: 'assignments', label: 'Assignments', icon: CheckSquare },
    { id: 'exams', label: 'Exams', icon: GraduationCap },
    { id: 'study-timer', label: 'Study Sessions', icon: Clock },
    { id: 'audio-lectures', label: 'Audio Lectures', icon: Mic, isPremiumFeature: true },
    { id: 'notes', label: 'Notes', icon: FileText },
    { id: 'progress', label: 'Progress', icon: BarChart3 },
    { id: 'mobile-companion', label: 'Mobile Companion', icon: Smartphone, isPremiumFeature: true },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const handleItemClick = (id: string) => {
    setActiveTab(id);
    if (onClose) {
      onClose();
    }
  };

  const renderContent = (isDrawer: boolean = false) => (
    <>
      <div>
        {/* Brand Header */}
        <div className="flex items-center justify-between px-3 mb-4 mt-1" id={isDrawer ? "drawer-header" : "sidebar-header"}>
          <div className="flex items-center gap-2.5 min-w-0">
            <img 
              src={`${(import.meta.env.BASE_URL || '/').replace(/\/$/, '')}/logo.png`}
              alt="Study Planner Logo" 
              className="w-9 h-9 rounded-xl object-cover shadow-sm border border-slate-200/60 shrink-0 transition-transform duration-200 hover:scale-105" 
              referrerPolicy="no-referrer"
              onError={(e) => {
                const target = e.currentTarget;
                const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
                if (!target.dataset.triedFallback) {
                  target.dataset.triedFallback = '1';
                  target.src = `${base}/logo.jpg`;
                } else if (target.dataset.triedFallback === '1') {
                  target.dataset.triedFallback = '2';
                  target.src = `${base}/icon-512.png`;
                }
              }}
            />
            <div className="min-w-0">
              <h1 className="text-sm font-extrabold tracking-tight text-[#1D1B20] leading-none truncate">Study Planner</h1>
              <span className="text-[8px] font-mono font-bold tracking-wider text-[#6750A4] uppercase mt-0.5 block truncate">Timetable, Timer &amp; Notes</span>
            </div>
          </div>
          {isDrawer && (
            <button
              onClick={onClose}
              className="p-1.5 text-[#49454F] hover:text-[#1D1B20] hover:bg-[#F3EDF7] rounded-full transition-colors cursor-pointer shrink-0 ml-1 btn-press"
              aria-label="Close navigation drawer"
              id="close-drawer-btn"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Navigation Links */}
        <nav className="space-y-0.5 relative" id={isDrawer ? "drawer-nav" : "sidebar-nav"}>
          {menuItems.map((item) => {
            const IconComponent = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleItemClick(item.id)}
                className={`relative w-full flex items-center justify-between px-3.5 py-2 lg:py-1.5 rounded-full text-xs font-semibold tracking-wide transition-colors duration-150 cursor-pointer group btn-press ${
                  isActive
                    ? 'text-[#21005D] font-bold shadow-xs'
                    : 'text-[#49454F] hover:bg-[#F3EDF7]/70 hover:text-[#1D1B20]'
                }`}
                id={`${isDrawer ? 'drawer' : 'nav'}-link-${item.id}`}
              >
                {isActive && (
                  <motion.div
                    layoutId={isDrawer ? "drawerActiveNavPill" : "sidebarActiveNavPill"}
                    className="absolute inset-0 bg-[#EADDFF] rounded-full z-0 overflow-hidden shadow-2xs"
                    transition={{
                      type: 'spring',
                      stiffness: 420,
                      damping: 32,
                      mass: 0.8
                    }}
                  >
                    <div className="absolute left-1.5 top-2 bottom-2 w-1 bg-[#6750A4] rounded-full" />
                  </motion.div>
                )}
                <div className="relative z-10 flex items-center gap-3 min-w-0">
                  <IconComponent className={`w-4 h-4 shrink-0 transition-transform duration-200 group-hover:scale-110 ${isActive ? 'text-[#21005D]' : 'text-[#49454F]'}`} />
                  <span className="truncate">{item.label}</span>
                </div>
                {item.isPremiumFeature && !isPremium && (
                  <span className="relative z-10 px-1.5 py-0.5 text-[8px] font-black bg-[#6750A4] text-white rounded uppercase tracking-wider shrink-0 shadow-2xs">
                    PRO
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom section with Premium Card and Profile */}
      <div className="pt-3 border-t border-[#E1E3E1] flex flex-col gap-3 mt-4" id={isDrawer ? "drawer-bottom-section" : "sidebar-bottom-section"}>
        {/* Premium Upgrade or Premium Active Card */}
        {isPremium ? (
          <div className="p-3 bg-emerald-50 border border-emerald-200/60 rounded-2xl flex items-center justify-center gap-2 text-emerald-800 transition-all card-interactive" id={isDrawer ? "drawer-premium-active-card" : "sidebar-premium-active-card"}>
            <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 animate-pulse" />
            <span className="text-xs font-bold">Premium Active ✓</span>
          </div>
        ) : (
          <div className="p-3 bg-[#EADDFF]/30 border border-[#D0BCFF]/40 rounded-2xl transition-all card-interactive" id={isDrawer ? "drawer-premium-card" : "sidebar-premium-card"}>
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#21005D]">
              <Sparkles className="w-3.5 h-3.5 text-[#6750A4]" />
              <span>Study Planner Premium</span>
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
              onClick={() => {
                onUpgradeClick();
                if (onClose) onClose();
              }}
              className="w-full mt-3 py-1.5 bg-[#6750A4] hover:bg-[#503E84] text-white font-bold text-[10px] rounded-full uppercase tracking-wider transition-colors shadow-sm cursor-pointer btn-press"
              id={isDrawer ? "drawer-upgrade-button" : "sidebar-upgrade-button"}
            >
              Upgrade
            </button>
          </div>
        )}

        {/* Compact Profile Detail Card */}
        <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl transition-colors hover:bg-slate-50" id={isDrawer ? "drawer-profile-card" : "sidebar-profile-card"}>
          {authUser?.photoURL ? (
            <img 
              src={authUser.photoURL} 
              alt={authUser.displayName || 'Google User'} 
              className="w-8 h-8 rounded-full border border-purple-200 shadow-xs shrink-0 object-cover" 
              referrerPolicy="no-referrer" 
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-[#6750A4] flex items-center justify-center text-xs font-bold text-white shadow-xs shrink-0 transition-transform duration-200 hover:scale-105">
              {authUser?.displayName ? authUser.displayName[0].toUpperCase() : profile.initials}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h4 className="text-xs font-bold text-[#1D1B20] truncate leading-tight">
              {authUser?.displayName || profile.name}
            </h4>
            <div className="mt-1 flex items-center justify-between gap-1">
              {isPremium ? (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[8px] font-black bg-[#EADDFF] text-[#21005D] border border-[#D0BCFF] uppercase tracking-wider" id={isDrawer ? "drawer-badge-premium" : "sidebar-badge-premium"}>
                  Premium
                </span>
              ) : (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[8px] font-bold bg-[#79747E]/10 text-[#49454F] border border-[#79747E]/20 uppercase tracking-wider" id={isDrawer ? "drawer-badge-free" : "sidebar-badge-free"}>
                  Free Plan
                </span>
              )}

              {authUser ? (
                <button
                  type="button"
                  onClick={onSignOut}
                  title="Sign out of Google"
                  className="text-[10px] text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                >
                  Sign out
                </button>
              ) : onSignIn ? (
                <button
                  type="button"
                  onClick={onSignIn}
                  title="Sign in with Google"
                  className="text-[10px] text-[#6750A4] hover:underline font-semibold cursor-pointer"
                >
                  Sign in
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* 1. Desktop Sidebar (always visible on lg: screens and above) */}
      <aside className="hidden lg:flex w-64 bg-white border-r border-[#E1E3E1] flex-col justify-between h-screen shrink-0 text-[#49454F] p-4 lg:p-4" id="main-sidebar">
        {renderContent(false)}
      </aside>

      {/* 2. Mobile/Tablet Overlay Drawer (rendered when isOpen is true on screens < 1024px) */}
      <AnimatePresence>
        {isOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex" id="mobile-sidebar-container">
            {/* Backdrop overlay */}
            <motion.div 
              variants={modalBackdropVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="fixed inset-0 bg-black/60 backdrop-blur-xs" 
              onClick={onClose} 
              id="mobile-drawer-backdrop"
            />

            {/* Slide-out drawer panel */}
            <motion.aside 
              variants={drawerVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="relative w-72 max-w-[85vw] bg-white h-full flex flex-col justify-between p-4 overflow-y-auto shadow-2xl z-10 text-[#49454F]" 
              id="mobile-sidebar-drawer"
            >
              {renderContent(true)}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

