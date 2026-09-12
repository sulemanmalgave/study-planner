import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, AlertCircle, X } from 'lucide-react';
import { modalBackdropVariants, modalPanelVariants } from '../lib/animations';
import { useTranslation } from '../lib/i18n';

interface LimitReachedDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onUpgradeClick: () => void;
  limitType: 'assignments' | 'exams' | 'notes' | 'courses' | 'timetables' | 'audioLectures' | 'studyMaterials';
}

export default function LimitReachedDialog({
  isOpen,
  onClose,
  onUpgradeClick,
  limitType
}: LimitReachedDialogProps) {
  const { t, language } = useTranslation();

  const getLimitDetails = () => {
    if (language === 'fr-FR') {
      switch (limitType) {
        case 'audioLectures':
          return { 
            name: 'Cours audio', 
            limit: '2 cours audio',
            message: "Vous avez atteint la limite de 2 cours audio du forfait gratuit. Passez à Pro pour ajouter plus d'enregistrements et débloquer les transcriptions, fiches et résumés par IA." 
          };
        case 'studyMaterials':
          return {
            name: 'Supports de cours',
            limit: '5 supports',
            message: "Vous avez atteint la limite du forfait gratuit pour les supports de cours (5 éléments). Passez à Study Planner Pro pour téléverser des documents en illimité."
          };
        case 'assignments':
          return { 
            name: 'Tâches & Devoirs', 
            limit: '10 devoirs / 20 tâches actives',
            message: "Vous avez atteint la limite du forfait gratuit pour les tâches et devoirs (10 devoirs / 20 tâches actives). Passez à Study Planner Pro pour débloquer l'accès illimité."
          };
        case 'exams':
          return { 
            name: 'Examens', 
            limit: '5',
            message: "Vous avez atteint la limite du forfait gratuit pour les examens (5). Passez à Study Planner Pro pour débloquer les examens illimités."
          };
        case 'notes':
          return { 
            name: 'Notes', 
            limit: '10',
            message: "Vous avez atteint la limite du forfait gratuit pour les notes (10). Passez à Study Planner Pro pour créer des notes en illimité."
          };
        case 'courses':
          return { 
            name: 'Matières', 
            limit: '5',
            message: "Vous avez atteint la limite du forfait gratuit pour les matières (5). Passez à Study Planner Pro pour ajouter des matières en illimité."
          };
        case 'timetables':
          return { 
            name: 'Cours de l\'emploi du temps', 
            limit: '10',
            message: "Vous avez atteint la limite du forfait gratuit pour l'emploi du temps (10 cours). Passez à Study Planner Pro pour un emploi du temps complet illimité."
          };
        default:
          return { 
            name: 'Éléments', 
            limit: 'quota',
            message: "Vous avez atteint la limite du forfait gratuit. Passez à Study Planner Pro pour débloquer un accès illimité."
          };
      }
    }

    switch (limitType) {
      case 'audioLectures':
        return { 
          name: 'Audio Lectures', 
          limit: '2 Audio Lectures',
          message: "You've reached the Free plan limit of 2 Audio Lectures. Upgrade to Pro to add more recordings and unlock AI transcripts, notes, and summaries." 
        };
      case 'studyMaterials':
        return {
          name: 'Study Materials',
          limit: '5 Materials',
          message: "You've reached the free plan limit for Study Materials (5 items). Upgrade to Study Planner Pro to upload unlimited study materials."
        };
      case 'assignments':
        return { 
          name: 'Tasks & Assignments', 
          limit: '10 assignments / 20 active tasks',
          message: "You've reached the free plan limit for Tasks & Assignments (10 assignments / 20 active tasks). Upgrade to Study Planner Pro to unlock unlimited Tasks, Exams, Notes, and the full Timetable."
        };
      case 'exams':
        return { 
          name: 'Exams', 
          limit: '5',
          message: "You've reached the free plan limit for Exams (5). Upgrade to Study Planner Pro to unlock unlimited Tasks, Exams, Notes, and the full Timetable."
        };
      case 'notes':
        return { 
          name: 'Notes', 
          limit: '10',
          message: "You've reached the free plan limit for Notes (10). Upgrade to Study Planner Pro to unlock unlimited Tasks, Exams, Notes, and the full Timetable."
        };
      case 'courses':
        return { 
          name: 'Courses', 
          limit: '5',
          message: "You've reached the free plan limit for Courses (5). Upgrade to Study Planner Pro to unlock unlimited Tasks, Exams, Notes, and the full Timetable."
        };
      case 'timetables':
        return { 
          name: 'Timetable Classes', 
          limit: '10',
          message: "You've reached the free plan limit for Timetable Classes (10). Upgrade to Study Planner Pro to unlock unlimited Tasks, Exams, Notes, and the full Timetable."
        };
      default:
        return { 
          name: 'Items', 
          limit: 'quota',
          message: "You've reached the free plan limit. Upgrade to Study Planner Pro to unlock unlimited access."
        };
    }
  };

  const { name, limit, message } = getLimitDetails();

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" id="limit-dialog-backdrop">
          <motion.div
            variants={modalBackdropVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div 
            variants={modalPanelVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="relative w-full max-w-sm bg-white border border-[#E1E3E1] rounded-[28px] p-6 shadow-2xl flex flex-col gap-4 text-left z-10"
            id="limit-dialog-card"
          >
            {/* Header Icon */}
            <div className="flex items-center gap-3">
              <img 
                src={`${(import.meta.env.BASE_URL || '/').replace(/\/$/, '')}/logo.png`}
                alt="Study Planner Logo" 
                className="w-10 h-10 rounded-2xl object-cover shadow-sm border border-slate-200/80 shrink-0" 
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
              <div>
                <h3 className="text-base font-bold text-[#1D1B20] tracking-tight flex items-center gap-1.5" id="limit-dialog-title">
                  <span>{language === 'fr-FR' ? 'Limite de l\'offre gratuite atteinte' : 'Free Plan Limit Reached'}</span>
                </h3>
                <span className="text-[10px] text-[#6750A4] font-semibold">{language === 'fr-FR' ? 'Quota Study Planner' : 'Study Planner Quota'}</span>
              </div>
            </div>

            {/* Message Content */}
            <p className="text-xs text-[#49454F] leading-relaxed font-medium" id="limit-dialog-message">
              {message}
            </p>

            {/* Perks list */}
            <div className="bg-[#F3EDF7]/40 border border-[#E1E3E1]/50 rounded-2xl p-3 space-y-1.5">
              <div className="text-[10px] font-bold text-[#6750A4] uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                {language === 'fr-FR' ? 'Avantages de l\'offre Pro :' : 'Pro Plan Perks:'}
              </div>
              <ul className="text-[10px] text-[#49454F] space-y-1 pl-1 list-disc list-inside font-medium">
                {limitType === 'audioLectures' ? (
                  language === 'fr-FR' ? (
                    <>
                      <li>Enregistrements et téléversements de cours audio illimités</li>
                      <li>Transcriptions Gemini IA et fiches de révision structurées</li>
                      <li>Résumés IA et synthèse des points clés</li>
                      <li>Tâches, devoirs, examens et emplois du temps illimités</li>
                    </>
                  ) : (
                    <>
                      <li>Unlimited Audio Lecture recordings & uploads</li>
                      <li>Gemini AI Transcripts & structured Study Notes</li>
                      <li>AI Executive Summaries & Key Points extraction</li>
                      <li>Unlimited Tasks, Assignments, Exams & Timetables</li>
                    </>
                  )
                ) : (
                  language === 'fr-FR' ? (
                    <>
                      <li>Tâches, devoirs et examens illimités</li>
                      <li>Fiches de révision et notes illimitées</li>
                      <li>Emploi du temps complet 7j/7 sans restriction</li>
                      <li>Accès complet à l'historique et aux statistiques</li>
                    </>
                  ) : (
                    <>
                      <li>Unlimited Tasks, Assignments & Exams</li>
                      <li>Unlimited Revision Study Notebook Pages</li>
                      <li>Full 7-day Weekly Lecture Timetable slots</li>
                      <li>Access all progress history analytics data</li>
                    </>
                  )
                )}
              </ul>
            </div>

            {/* Buttons / Actions */}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={onClose}
                className="px-4 py-2 text-xs font-bold text-[#49454F] hover:text-[#1D1B20] hover:bg-[#F3EDF7] rounded-full transition-colors cursor-pointer btn-press"
                id="limit-dialog-cancel"
              >
                {language === 'fr-FR' ? 'Plus tard' : 'Maybe Later'}
              </button>
              <button
                onClick={() => {
                  onClose();
                  onUpgradeClick();
                }}
                className="px-5 py-2.5 bg-[#6750A4] hover:bg-[#503E84] text-xs font-bold text-white rounded-full shadow-sm hover:shadow transition-all flex items-center gap-1.5 cursor-pointer btn-press"
                id="limit-dialog-upgrade"
              >
                <Sparkles className="w-3.5 h-3.5 text-yellow-300 fill-yellow-300" />
                <span>{language === 'fr-FR' ? 'Passer à Premium' : 'Upgrade to Premium'}</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

