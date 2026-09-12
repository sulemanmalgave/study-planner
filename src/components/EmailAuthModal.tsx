import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Sparkles } from 'lucide-react';
import { modalBackdropVariants, modalPanelVariants } from '../lib/animations';
import { AuthUserProfile } from '../lib/emailAuth';
import EmailAuthCard from './EmailAuthCard';
import { useTranslation } from '../lib/i18n';

interface EmailAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  authUser?: AuthUserProfile | null;
  onAuthSuccess: (user: AuthUserProfile, hasActiveSubscription?: boolean, subscription?: any) => void;
  onSignOut?: () => void;
}

export default function EmailAuthModal({
  isOpen,
  onClose,
  authUser,
  onAuthSuccess,
  onSignOut,
}: EmailAuthModalProps) {
  const { language } = useTranslation();

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto" id="email-auth-modal">
          <motion.div
            variants={modalBackdropVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="fixed inset-0 bg-slate-900/80 backdrop-blur-md"
            onClick={onClose}
          />

          <motion.div
            variants={modalPanelVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="relative w-full max-w-md bg-white rounded-3xl p-6 border border-slate-100 shadow-2xl z-10 space-y-4 text-slate-800"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <img 
                  src={`${(import.meta.env.BASE_URL || '/').replace(/\/$/, '')}/logo.png`}
                  alt="Study Planner Logo" 
                  className="w-8 h-8 rounded-xl object-cover shadow-xs border border-slate-200/80 shrink-0" 
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    const target = e.currentTarget;
                    const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
                    if (!target.dataset.triedFallback) {
                      target.dataset.triedFallback = '1';
                      target.src = `${base}/logo.jpg`;
                    }
                  }}
                />
                <div>
                  <h3 className="text-sm font-extrabold text-[#1D1B20] tracking-tight flex items-center gap-1.5">
                    <span>{language === 'fr-FR' ? 'Compte Study Planner' : 'Study Planner Account'}</span>
                    <Sparkles className="w-3.5 h-3.5 text-[#6750A4]" />
                  </h3>
                  <p className="text-[11px] text-[#49454F]">
                    {language === 'fr-FR' ? 'Accès sécurisé à votre espace d\'études' : 'Secure access to your study workspace'}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-white border border-slate-200/70 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
                id="close-email-auth-modal-btn"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <EmailAuthCard
              authUser={authUser}
              onAuthSuccess={(user, hasActiveSubscription, sub) => {
                onAuthSuccess(user, hasActiveSubscription, sub);
                setTimeout(() => {
                  onClose();
                }, 900);
              }}
              onSignOut={() => {
                if (onSignOut) onSignOut();
                onClose();
              }}
            />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
