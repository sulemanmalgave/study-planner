import React, { useEffect } from 'react';
import { 
  ArrowLeft, 
  ShieldCheck, 
  Lock, 
  CreditCard, 
  Database, 
  UserCheck, 
  EyeOff, 
  FileText, 
  Mail, 
  Sparkles,
  HelpCircle,
  HardDrive
} from 'lucide-react';
import { useTranslation } from '../lib/i18n';

interface PrivacyPolicyViewProps {
  onBackToHome: () => void;
}

export default function PrivacyPolicyView({ onBackToHome }: PrivacyPolicyViewProps) {
  const { language } = useTranslation();
  const isFr = language === 'fr-FR';

  useEffect(() => {
    // Update Document Title and Meta Description for SEO & Google Play Compliance
    document.title = isFr 
      ? "Politique de confidentialité | Study Planner - Emploi du temps, Minuteur d'étude & Notes"
      : "Privacy Policy | Study Planner - Timetable, Study Timer & Notes";
    
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.setAttribute('name', 'description');
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute('content', isFr 
      ? "Consultez la politique de confidentialité de Study Planner et découvrez comment vos données d'étude sont protégées en toute sécurité."
      : 'Read the Privacy Policy for Study Planner - Timetable, Study Timer & Notes and learn how your data is collected, used, and protected.');

    // Scroll smoothly to top on mount
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [isFr]);

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 sm:px-6 lg:px-8 text-[#1D1B20]" id="privacy-policy-viewport">
      
      {/* Top Header & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-[#E1E3E1]">
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
            <h2 className="text-sm font-extrabold text-[#1D1B20] leading-tight">Study Planner</h2>
            <span className="text-[10px] text-[#6750A4] font-medium block">
              {isFr ? "Emploi du temps, Minuteur d'étude & Notes" : "Timetable, Study Timer & Notes"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onBackToHome}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-[#F3EDF7] border border-[#E1E3E1] text-[#6750A4] font-bold text-xs rounded-full transition-all shadow-sm cursor-pointer"
            id="btn-back-to-home-top"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{isFr ? "Retour à l'accueil" : "Back to Home"}</span>
          </button>

          <div className="hidden sm:flex items-center gap-2 text-xs font-semibold text-[#49454F]" id="privacy-badge">
            <ShieldCheck className="w-4 h-4 text-[#6750A4]" />
            <span>{isFr ? "Protection des données vérifiée" : "Verified Data Protection"}</span>
          </div>
        </div>
      </div>

      {/* Title & Effective Date Hero Card */}
      <div className="bg-gradient-to-br from-[#EADDFF]/40 via-white to-white border border-[#D0BCFF]/60 rounded-3xl p-6 sm:p-8 shadow-sm mb-8" id="privacy-hero-card">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-2xl bg-[#6750A4] flex items-center justify-center text-white shadow">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#6750A4]">
              {isFr ? "Normes juridiques & Confidentialité" : "Legal & Privacy Standards"}
            </span>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[#1D1B20]">
              {isFr ? "Politique de confidentialité" : "Privacy Policy"}
            </h1>
          </div>
        </div>
        <p className="text-xs sm:text-sm text-[#49454F] font-medium leading-relaxed max-w-2xl mt-2">
          {isFr ? (
            <>
              <strong>Study Planner - Timetable, Study Timer &amp; Notes</strong> s'engage à garantir une transparence totale, la sécurité des données et le respect rigoureux de la vie privée des étudiants et apprenants.
            </>
          ) : (
            <>
              <strong>Study Planner - Timetable, Study Timer &amp; Notes</strong> is committed to maintaining complete transparency, data security, and privacy for students and learners worldwide.
            </>
          )}
        </p>

        <div className="mt-4 pt-4 border-t border-[#E1E3E1]/60 flex flex-wrap items-center justify-between gap-3 text-[11px] text-[#49454F] font-medium">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>
              <strong>{isFr ? "Date d'entrée en vigueur :" : "Effective Date:"}</strong> {isFr ? "27 juillet 2026" : "July 27, 2026"}
            </span>
          </div>
          <div className="text-slate-500">
            <span>{isFr ? "Dernière révision : 27 juillet 2026" : "Last Reviewed: July 27, 2026"}</span>
          </div>
        </div>
      </div>

      {/* Quick Summary Highlights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8" id="privacy-summary-grid">
        <div className="p-4 bg-white border border-[#E1E3E1] rounded-2xl shadow-xs flex items-start gap-3">
          <div className="p-2 rounded-xl bg-purple-50 text-[#6750A4] shrink-0">
            <EyeOff className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-[#1D1B20]">
              {isFr ? "Aucune revente de données" : "Zero Data Selling"}
            </h4>
            <p className="text-[11px] text-[#49454F] mt-0.5 leading-snug">
              {isFr 
                ? "Nous ne vendons, n'échangeons ni ne partageons vos données d'étude avec des annonceurs tiers." 
                : "We never sell, trade, or share your personal study information with third-party advertisers."}
            </p>
          </div>
        </div>

        <div className="p-4 bg-white border border-[#E1E3E1] rounded-2xl shadow-xs flex items-start gap-3">
          <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700 shrink-0">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-[#1D1B20]">
              {isFr ? "Passerelles de paiement sécurisées" : "Secure Payment Gateways"}
            </h4>
            <p className="text-[11px] text-[#49454F] mt-0.5 leading-snug">
              {isFr 
                ? "Razorpay & PayPal gèrent directement les règlements. Study Planner ne stocke jamais vos coordonnées bancaires." 
                : "Razorpay & PayPal handle payments directly. Study Planner never stores card or bank details."}
            </p>
          </div>
        </div>

        <div className="p-4 bg-white border border-[#E1E3E1] rounded-2xl shadow-xs flex items-start gap-3">
          <div className="p-2 rounded-xl bg-blue-50 text-blue-700 shrink-0">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-[#1D1B20]">
              {isFr ? "Droit de suppression du compte" : "Account Deletion Right"}
            </h4>
            <p className="text-[11px] text-[#49454F] mt-0.5 leading-snug">
              {isFr 
                ? "Vous avez le contrôle total pour réinitialiser votre espace ou demander la suppression définitive de votre compte." 
                : "You have full control to reset your workspace or request complete account and data deletion."}
            </p>
          </div>
        </div>
      </div>

      {/* Main Privacy Policy Content Body */}
      <div className="bg-white border border-[#E1E3E1] rounded-3xl p-6 sm:p-10 shadow-sm space-y-8" id="privacy-content-body">
        
        {/* Section 1: Introduction */}
        <section className="space-y-3" id="sec-introduction">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[#EADDFF] text-[#21005D] text-xs font-black flex items-center justify-center shrink-0">1</span>
            <h2 className="text-lg font-bold text-[#1D1B20]">{isFr ? "Introduction" : "Introduction"}</h2>
          </div>
          <p className="text-xs sm:text-sm text-[#49454F] leading-relaxed pl-8">
            {isFr ? (
              <>
                Bienvenue sur <strong>Study Planner - Timetable, Study Timer &amp; Notes</strong> (« Study Planner », « nous », « notre » ou « nos »). 
                Study Planner est une plateforme numérique de gestion des études conçue pour aider les étudiants et les apprenants à organiser efficacement leurs emplois du temps, devoirs, examens, notes et sessions de révision.
              </>
            ) : (
              <>
                Welcome to <strong>Study Planner - Timetable, Study Timer &amp; Notes</strong> ("Study Planner", "we", "our", or "us"). 
                Study Planner is a digital study management platform designed to help students and learners organize study schedules, tasks, assignments, notes, timetables, and exams effectively.
              </>
            )}
          </p>
          <p className="text-xs sm:text-sm text-[#49454F] leading-relaxed pl-8">
            {isFr ? (
              <>
                Cette politique de confidentialité explique comment nous recueillons, utilisons, stockons et protégeons vos informations personnelles lorsque vous utilisez notre application. En utilisant Study Planner, vous consentez aux pratiques décrites dans le présent document. Nous ne collectons que le strict minimum d'informations nécessaires au bon fonctionnement du service.
              </>
            ) : (
              <>
                This Privacy Policy explains how we collect, use, store, and protect your personal information when you use our application. By using Study Planner, you agree to the collection and use of information in accordance with this policy. We collect only the minimum necessary information required to provide our service.
              </>
            )}
          </p>
        </section>

        <hr className="border-[#E1E3E1]" />

        {/* Section 2: Information We Collect */}
        <section className="space-y-3" id="sec-information-we-collect">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[#EADDFF] text-[#21005D] text-xs font-black flex items-center justify-center shrink-0">2</span>
            <h2 className="text-lg font-bold text-[#1D1B20]">
              {isFr ? "Informations que nous collectons" : "Information We Collect"}
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-[#49454F] leading-relaxed pl-8">
            {isFr 
              ? "Nous collectons uniquement les informations indispensables au fonctionnement de Study Planner et à la personnalisation de votre expérience :"
              : "We collect only the essential information needed to operate Study Planner and provide a personalized experience:"}
          </p>
          <ul className="list-disc pl-14 space-y-2 text-xs sm:text-sm text-[#49454F]">
            <li>
              <strong>{isFr ? "Informations de compte et profil :" : "Account & Profile Information:"}</strong>{" "}
              {isFr 
                ? "Nom d'affichage, adresse e-mail, initiales de l'avatar et pays sélectionné (utilisé pour la devise de facturation)."
                : "Display name, email address, avatar initials, and country selection (used for billing currency selection)."}
            </li>
            <li>
              <strong>{isFr ? "Données d'étude et académiques :" : "Study & Academic Data:"}</strong>{" "}
              {isFr 
                ? "Matières, périodes d'emploi du temps, devoirs et tâches, calendrier des examens, historiques du minuteur d'étude et notes personnelles saisies dans l'application."
                : "Courses, timetable periods, assignment tasks, exam schedules, study timer session logs, and personal notes entered into the app."}
            </li>
            <li>
              <strong>{isFr ? "Données techniques et d'utilisation :" : "Technical & Usage Data:"}</strong>{" "}
              {isFr 
                ? "Informations de base sur le navigateur, type d'appareil, région approximative et journaux d'événements nécessaires au diagnostic technique et à la performance."
                : "Basic browser information, device type, approximate locale, and application event logs necessary for system diagnostic and performance monitoring."}
            </li>
          </ul>
        </section>

        <hr className="border-[#E1E3E1]" />

        {/* Section 3: How We Use Information */}
        <section className="space-y-3" id="sec-how-we-use-information">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[#EADDFF] text-[#21005D] text-xs font-black flex items-center justify-center shrink-0">3</span>
            <h2 className="text-lg font-bold text-[#1D1B20]">
              {isFr ? "Utilisation des informations" : "How We Use Information"}
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-[#49454F] leading-relaxed pl-8">
            {isFr 
              ? "Nous utilisons les données collectées exclusivement pour les finalités légitimes suivantes :"
              : "We use the collected information solely for the following legitimate operational purposes:"}
          </p>
          <ul className="list-disc pl-14 space-y-2 text-xs sm:text-sm text-[#49454F]">
            {isFr ? (
              <>
                <li>Pour afficher et structurer vos plannings scolaires, estimations de moyenne et statistiques de révision.</li>
                <li>Pour authentifier votre identité et synchroniser vos données dans le cloud sur l'ensemble de vos appareils.</li>
                <li>Pour traiter de manière sécurisée les abonnements Premium via nos partenaires agréés (Razorpay et PayPal).</li>
                <li>Pour diagnostiquer d'éventuelles erreurs, assurer la sécurité de la plateforme et améliorer les fonctionnalités.</li>
              </>
            ) : (
              <>
                <li>To display and organize your academic schedules, GPA estimations, and study stats.</li>
                <li>To authenticate your user identity and facilitate cloud database synchronization across your devices.</li>
                <li>To process premium plan upgrades securely via authorized payment gateway partners (Razorpay and PayPal).</li>
                <li>To diagnose application errors, maintain platform security, and improve application functionality.</li>
              </>
            )}
          </ul>
          <p className="text-xs sm:text-sm text-[#49454F] leading-relaxed pl-8 font-medium text-slate-800">
            <strong>{isFr ? "Garantie de protection des données :" : "Data Protection Guarantee:"}</strong>{" "}
            {isFr ? (
              <>Nous ne vendons, ne louons ni ne cédons <u>jamais</u> vos informations personnelles à des tiers, régies publicitaires ou courtiers en données.</>
            ) : (
              <>We do <u>not</u> sell, rent, or trade your personal information to third parties, advertising networks, or data brokers.</>
            )}
          </p>
        </section>

        <hr className="border-[#E1E3E1]" />

        {/* Section 4: Local Storage */}
        <section className="space-y-3" id="sec-local-storage">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[#EADDFF] text-[#21005D] text-xs font-black flex items-center justify-center shrink-0">4</span>
            <h2 className="text-lg font-bold text-[#1D1B20]">{isFr ? "Stockage local (Local Storage)" : "Local Storage"}</h2>
          </div>
          <p className="text-xs sm:text-sm text-[#49454F] leading-relaxed pl-8">
            {isFr ? (
              <>
                Study Planner utilise le stockage local standard de votre navigateur (<code>localStorage</code>) pour conserver l'état de votre espace de travail, vos préférences de thème et le cache hors ligne. Cela permet à l'application de fonctionner rapidement et sans connexion Internet. Vous pouvez vider ce stockage à tout moment dans les paramètres de votre navigateur ou via l'option « Réinitialiser l'espace » dans les Paramètres.
              </>
            ) : (
              <>
                Study Planner uses standard web browser <code>localStorage</code> to store your local study planner state, theme preferences, and offline cache. This allows the application to function quickly and support offline study planning. You can clear your local storage at any time through your browser settings or by using the Reset Workspace feature in Settings.
              </>
            )}
          </p>
        </section>

        <hr className="border-[#E1E3E1]" />

        {/* Section 5: Cloud Storage & Sync */}
        <section className="space-y-3" id="sec-cloud-storage">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[#EADDFF] text-[#21005D] text-xs font-black flex items-center justify-center shrink-0">5</span>
            <h2 className="text-lg font-bold text-[#1D1B20]">
              {isFr ? "Stockage cloud et synchronisation" : "Cloud Storage & Synchronization"}
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-[#49454F] leading-relaxed pl-8">
            {isFr ? (
              <>
                Lorsqu'il est connecté, Study Planner synchronise vos données d'étude avec Google Firebase Cloud Firestore. Cela garantit que vos emplois du temps, devoirs et révisions sont sauvegardés de manière sécurisée et accessibles sur tous vos appareils authentifiés.
              </>
            ) : (
              <>
                When connected, Study Planner synchronizes your study planner data with Google Firebase Cloud Firestore. This ensures your academic schedules, assignments, and study records are securely backed up and accessible across your authenticated devices.
              </>
            )}
          </p>
        </section>

        <hr className="border-[#E1E3E1]" />

        {/* Section 6: Account Information & Authentication */}
        <section className="space-y-3" id="sec-account-information">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[#EADDFF] text-[#21005D] text-xs font-black flex items-center justify-center shrink-0">6</span>
            <h2 className="text-lg font-bold text-[#1D1B20]">
              {isFr ? "Comptes et authentification" : "Account Information & Authentication"}
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-[#49454F] leading-relaxed pl-8">
            {isFr ? (
              <>
                La sécurité de l'authentification et de votre identité est gérée via Firebase Authentication. Vos identifiants de connexion, jetons d'accès et préférences de profil sont strictement réservés au maintien de votre session et à la synchronisation. Vous pouvez gérer ou mettre à jour vos coordonnées à tout moment dans la section Paramètres.
              </>
            ) : (
              <>
                Account authentication and identity security are managed securely via Firebase Authentication. Your login credentials, user token, and profile preferences are used strictly to maintain your session security and sync state. You can manage or update your profile details anytime within the Settings section.
              </>
            )}
          </p>
        </section>

        <hr className="border-[#E1E3E1]" />

        {/* Section 7: Payment Information */}
        <section className="space-y-3" id="sec-payment-information">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[#EADDFF] text-[#21005D] text-xs font-black flex items-center justify-center shrink-0">7</span>
            <h2 className="text-lg font-bold text-[#1D1B20]">
              {isFr ? "Informations de paiement" : "Payment Information"}
            </h2>
          </div>
          <div className="pl-8 space-y-3">
            <p className="text-xs sm:text-sm text-[#49454F] leading-relaxed">
              {isFr 
                ? "Lors de la souscription à Study Planner Premium, les règlements sont traités par des passerelles de paiement tierces conformes à la norme PCI-DSS :"
                : "When subscribing to Study Planner Premium, payments are processed by PCI-DSS compliant third-party payment gateways:"}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-2">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-xs font-bold text-slate-800 block">Razorpay (India)</span>
                <span className="text-[11px] text-slate-600 leading-snug">
                  {isFr 
                    ? "Traite les transactions en INR via UPI, cartes de débit/crédit, NetBanking et portefeuilles électroniques."
                    : "Processes INR transactions via UPI, Debit/Credit Cards, NetBanking, and Wallets."}
                </span>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-xs font-bold text-slate-800 block">PayPal (International)</span>
                <span className="text-[11px] text-slate-600 leading-snug">
                  {isFr 
                    ? "Traite les transactions en USD via PayPal Express Checkout et cartes de crédit/débit internationales."
                    : "Processes USD transactions via PayPal Express Checkout and major debit/credit cards."}
                </span>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 p-3 rounded-xl font-medium leading-relaxed">
              <strong>{isFr ? "Politique stricte de sécurité des paiements :" : "Strict Payment Security Policy:"}</strong>{" "}
              {isFr ? (
                <>Les serveurs de Study Planner ne collectent, ne stockent, ne traitent ni ne transmettent <u>jamais</u> vos numéros de carte bancaire, coordonnées bancaires ou codes secrets. Tous les règlements sont effectués directement au sein de l'interface sécurisée et chiffrée des prestataires de paiement officiels.</>
              ) : (
                <>Study Planner servers <u>never</u> collect, store, process, or transmit your credit card numbers, debit card details, bank credentials, or PINs. All billing details are handled directly within the official payment provider's secure encrypted interface.</>
              )}
            </p>
          </div>
        </section>

        <hr className="border-[#E1E3E1]" />

        {/* Section 8: Third-Party Services */}
        <section className="space-y-3" id="sec-third-party-services">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[#EADDFF] text-[#21005D] text-xs font-black flex items-center justify-center shrink-0">8</span>
            <h2 className="text-lg font-bold text-[#1D1B20]">
              {isFr ? "Services tiers" : "Third-Party Services"}
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-[#49454F] leading-relaxed pl-8">
            {isFr 
              ? "Study Planner s'intègre avec des prestataires de services tiers de confiance uniquement pour accomplir les opérations techniques indispensables :"
              : "Study Planner integrates with trusted third-party service providers solely to perform necessary backend operations:"}
          </p>
          <ul className="list-disc pl-14 space-y-1.5 text-xs sm:text-sm text-[#49454F]">
            <li>
              <strong>Google Firebase:</strong>{" "}
              {isFr ? "Infrastructure d'authentification cloud et base de données Firestore." : "Cloud authentication and Firestore database infrastructure."}
            </li>
            <li>
              <strong>Razorpay Software Private Limited:</strong>{" "}
              {isFr ? "Traitement des paiements pour les utilisateurs en Inde." : "Payment gateway processing for users in India."}
            </li>
            <li>
              <strong>PayPal Holdings, Inc.:</strong>{" "}
              {isFr ? "Traitement des paiements pour les utilisateurs internationaux." : "Payment gateway processing for international users."}
            </li>
          </ul>
          <p className="text-xs sm:text-sm text-[#49454F] leading-relaxed pl-8">
            {isFr 
              ? "Ces tiers traitent les données conformément à leurs politiques de confidentialité respectives et sont tenus contractuellement à une stricte confidentialité."
              : "These third parties process data according to their respective privacy policies and are contractually required to maintain data confidentiality."}
          </p>
        </section>

        <hr className="border-[#E1E3E1]" />

        {/* Section 9: Cookies & Web Technologies */}
        <section className="space-y-3" id="sec-cookies-web">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[#EADDFF] text-[#21005D] text-xs font-black flex items-center justify-center shrink-0">9</span>
            <h2 className="text-lg font-bold text-[#1D1B20]">
              {isFr ? "Cookies et technologies web" : "Cookies & Web Technologies"}
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-[#49454F] leading-relaxed pl-8">
            {isFr ? (
              <>
                Study Planner utilise des jetons de session indispensables et le stockage local pour maintenir votre connexion, préserver vos réglages de thème et sécuriser les requêtes API contre les vulnérabilités de falsification. Nous n'utilisons aucun cookie publicitaire tiers ni script de traçage intersites.
              </>
            ) : (
              <>
                Study Planner uses essential session tokens and local browser storage to keep you signed in, preserve your theme settings, and secure API requests against cross-site vulnerabilities. We do not use third-party advertising cookies or cross-site tracking scripts.
              </>
            )}
          </p>
        </section>

        <hr className="border-[#E1E3E1]" />

        {/* Section 10: Data Security Practices */}
        <section className="space-y-3" id="sec-data-security">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[#EADDFF] text-[#21005D] text-xs font-black flex items-center justify-center shrink-0">10</span>
            <h2 className="text-lg font-bold text-[#1D1B20]">
              {isFr ? "Pratiques de sécurité des données" : "Data Security Practices"}
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-[#49454F] leading-relaxed pl-8">
            {isFr ? (
              <>
                Nous protégeons vos données à l'aide de mesures de sécurité techniques et organisationnelles conformes aux standards de l'industrie. Toutes les communications entre votre navigateur et nos serveurs sont chiffrées en transit au moyen de <strong>HTTPS/TLS 1.3</strong>. Les données de la base cloud sont sécurisées par des règles d'accès authentifiées et des pare-feux. Les clés d'API et secrets sont strictement isolés au niveau des variables d'environnement du serveur.
              </>
            ) : (
              <>
                We protect your data using industry-standard technical and organizational security controls. All communication between your browser and our backend servers is encrypted in transit using <strong>HTTPS/TLS 1.3</strong>. Cloud database records are secured with authenticated access rules and firewall protections. API credentials and secrets are kept strictly isolated on server environment variables.
              </>
            )}
          </p>
        </section>

        <hr className="border-[#E1E3E1]" />

        {/* Section 11: Data Retention & Account Deletion */}
        <section className="space-y-3" id="sec-data-retention-deletion">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[#EADDFF] text-[#21005D] text-xs font-black flex items-center justify-center shrink-0">11</span>
            <h2 className="text-lg font-bold text-[#1D1B20]">
              {isFr ? "Conservation et suppression des données" : "Data Retention & Account Deletion"}
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-[#49454F] leading-relaxed pl-8">
            {isFr 
              ? "Nous conservons vos données d'étude uniquement tant que votre compte reste actif. Vous disposez de la pleine propriété et du contrôle total de vos données personnelles :"
              : "We retain your study planner data only for as long as your account remains active. You have full ownership and control over your personal data:"}
          </p>
          <ul className="list-disc pl-14 space-y-1.5 text-xs sm:text-sm text-[#49454F]">
            <li>
              <strong>{isFr ? "Réinitialisation locale :" : "Local Data Reset:"}</strong>{" "}
              {isFr 
                ? "Vous pouvez vider la base de données et le cache de votre navigateur instantanément via l'option « Réinitialiser l'espace » dans les Paramètres."
                : "You can clear your local browser database and cache instantly via the Reset Workspace option in Settings."}
            </li>
            <li>
              <strong>{isFr ? "Suppression définitive du compte :" : "Permanent Account Deletion:"}</strong>{" "}
              {isFr 
                ? "Vous avez le droit d'exiger la suppression définitive de votre compte et de toutes les données associées dans le cloud en écrivant à notre équipe d'assistance."
                : "You have the right to request permanent deletion of your account and all associated cloud data by emailing our support team."}
            </li>
          </ul>
        </section>

        <hr className="border-[#E1E3E1]" />

        {/* Section 12: Children's Privacy */}
        <section className="space-y-3" id="sec-childrens-privacy">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[#EADDFF] text-[#21005D] text-xs font-black flex items-center justify-center shrink-0">12</span>
            <h2 className="text-lg font-bold text-[#1D1B20]">
              {isFr ? "Protection des mineurs" : "Children's Privacy"}
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-[#49454F] leading-relaxed pl-8">
            {isFr ? (
              <>
                Study Planner s'adresse au grand public, aux étudiants et aux apprenants adultes. Nous ne recueillons pas sciemment d'informations personnelles identifiables auprès d'enfants de moins de 13 ans. Si nous constatons qu'un enfant de moins de 13 ans nous a transmis des informations personnelles sans consentement parental, nous supprimerons immédiatement ces informations.
              </>
            ) : (
              <>
                Study Planner is intended for general audiences, students, and adult learners. We do not knowingly collect personal identifiable information from children under the age of 13. If we discover that a child under 13 has provided us with personal information without parental consent, we will delete such information immediately.
              </>
            )}
          </p>
        </section>

        <hr className="border-[#E1E3E1]" />

        {/* Section 13: Changes to This Privacy Policy */}
        <section className="space-y-3" id="sec-changes-to-policy">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[#EADDFF] text-[#21005D] text-xs font-black flex items-center justify-center shrink-0">13</span>
            <h2 className="text-lg font-bold text-[#1D1B20]">
              {isFr ? "Modifications de la politique de confidentialité" : "Changes to This Privacy Policy"}
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-[#49454F] leading-relaxed pl-8">
            {isFr ? (
              <>
                Nous pouvons mettre à jour notre politique de confidentialité périodiquement pour refléter les évolutions de l'application, les améliorations techniques ou les obligations légales. Les mises à jour seront publiées directement sur cette page avec une date d'entrée en vigueur actualisée en haut. Nous vous encourageons à la consulter régulièrement.
              </>
            ) : (
              <>
                We may update our Privacy Policy periodically to reflect app enhancements, technical improvements, or legal requirements. Updates will be posted directly on this page with a revised "Effective Date" at the top. We encourage you to review this policy from time to time.
              </>
            )}
          </p>
        </section>

        <hr className="border-[#E1E3E1]" />

        {/* Section 14: Contact Us */}
        <section className="space-y-4" id="sec-contact-us">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[#EADDFF] text-[#21005D] text-xs font-black flex items-center justify-center shrink-0">14</span>
            <h2 className="text-lg font-bold text-[#1D1B20]">
              {isFr ? "Nous contacter" : "Contact Us"}
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-[#49454F] leading-relaxed pl-8">
            {isFr ? (
              <>
                Si vous avez la moindre question concernant cette politique de confidentialité, vos données personnelles ou si vous souhaitez demander la suppression de votre compte, veuillez nous contacter à l'adresse suivante :
              </>
            ) : (
              <>
                If you have any questions about this Privacy Policy, your personal data, or would like to request account deletion, please contact us at:
              </>
            )}
          </p>
          
          <div className="pl-8">
            <div className="p-5 bg-[#F3EDF7]/60 border border-[#D0BCFF]/50 rounded-2xl max-w-md space-y-2">
              <span className="text-xs font-bold text-[#1D1B20] block">
                {isFr ? "E-mail d'assistance" : "Support Email"}
              </span>
              <a 
                href="mailto:sulemanmalgave1@gmail.com" 
                className="text-xs sm:text-sm font-bold text-[#6750A4] hover:text-[#503E84] hover:underline inline-flex items-center gap-2"
                id="contact-email-link"
              >
                <span>📧</span>
                <span>sulemanmalgave1@gmail.com</span>
              </a>
            </div>
          </div>
        </section>

      </div>

      {/* Bottom Back To Home Button */}
      <div className="mt-8 flex justify-center pb-8" id="privacy-bottom-navigation">
        <button
          onClick={onBackToHome}
          className="inline-flex items-center gap-2 px-6 py-3 bg-[#6750A4] hover:bg-[#503E84] text-white font-bold text-xs rounded-full shadow-md hover:shadow-lg transition-all cursor-pointer"
          id="btn-back-to-home-bottom"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{isFr ? "Retour à l'accueil" : "Back to Home"}</span>
        </button>
      </div>

    </div>
  );
}

