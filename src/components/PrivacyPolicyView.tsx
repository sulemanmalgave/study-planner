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

interface PrivacyPolicyViewProps {
  onBackToHome: () => void;
}

export default function PrivacyPolicyView({ onBackToHome }: PrivacyPolicyViewProps) {
  useEffect(() => {
    // Update Document Title and Meta Description for SEO & Google Play Compliance
    document.title = "Privacy Policy | StudyFlow";
    
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.setAttribute('name', 'description');
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute('content', 'Read the Privacy Policy for StudyFlow Digital Study Planner and learn how your data is collected, used, and protected.');

    // Scroll smoothly to top on mount
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 sm:px-6 lg:px-8 text-[#1D1B20]" id="privacy-policy-viewport">
      
      {/* Top Header & Navigation */}
      <div className="flex items-center justify-between gap-4 mb-6 pb-4 border-b border-[#E1E3E1]">
        <button
          onClick={onBackToHome}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-[#F3EDF7] border border-[#E1E3E1] text-[#6750A4] font-bold text-xs rounded-full transition-all shadow-sm cursor-pointer"
          id="btn-back-to-home-top"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </button>

        <div className="flex items-center gap-2 text-xs font-semibold text-[#49454F]" id="privacy-badge">
          <ShieldCheck className="w-4 h-4 text-[#6750A4]" />
          <span>Verified Data Protection</span>
        </div>
      </div>

      {/* Title & Effective Date Hero Card */}
      <div className="bg-gradient-to-br from-[#EADDFF]/40 via-white to-white border border-[#D0BCFF]/60 rounded-3xl p-6 sm:p-8 shadow-sm mb-8" id="privacy-hero-card">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-2xl bg-[#6750A4] flex items-center justify-center text-white shadow">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#6750A4]">Legal & Privacy Standards</span>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[#1D1B20]">Privacy Policy</h1>
          </div>
        </div>
        <p className="text-xs sm:text-sm text-[#49454F] font-medium leading-relaxed max-w-2xl mt-2">
          StudyFlow – Digital Study Planner is committed to maintaining complete transparency, data security, and privacy for students and learners worldwide.
        </p>

        <div className="mt-4 pt-4 border-t border-[#E1E3E1]/60 flex flex-wrap items-center justify-between gap-3 text-[11px] text-[#49454F] font-medium">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span><strong>Effective Date:</strong> July 27, 2026</span>
          </div>
          <div className="text-slate-500">
            <span>Last Reviewed: July 27, 2026</span>
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
            <h4 className="text-xs font-bold text-[#1D1B20]">Zero Data Selling</h4>
            <p className="text-[11px] text-[#49454F] mt-0.5 leading-snug">We never sell, trade, or share your personal study information with third-party advertisers.</p>
          </div>
        </div>

        <div className="p-4 bg-white border border-[#E1E3E1] rounded-2xl shadow-xs flex items-start gap-3">
          <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700 shrink-0">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-[#1D1B20]">Secure Payment Gateways</h4>
            <p className="text-[11px] text-[#49454F] mt-0.5 leading-snug">Razorpay & PayPal handle payments directly. StudyFlow never stores card or bank details.</p>
          </div>
        </div>

        <div className="p-4 bg-white border border-[#E1E3E1] rounded-2xl shadow-xs flex items-start gap-3">
          <div className="p-2 rounded-xl bg-blue-50 text-blue-700 shrink-0">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-[#1D1B20]">Account Deletion Right</h4>
            <p className="text-[11px] text-[#49454F] mt-0.5 leading-snug">You have full control to reset your workspace or request complete account and data deletion.</p>
          </div>
        </div>
      </div>

      {/* Main Privacy Policy Content Body */}
      <div className="bg-white border border-[#E1E3E1] rounded-3xl p-6 sm:p-10 shadow-sm space-y-8" id="privacy-content-body">
        
        {/* Section 1: Introduction */}
        <section className="space-y-3" id="sec-introduction">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[#EADDFF] text-[#21005D] text-xs font-black flex items-center justify-center shrink-0">1</span>
            <h2 className="text-lg font-bold text-[#1D1B20]">Introduction</h2>
          </div>
          <p className="text-xs sm:text-sm text-[#49454F] leading-relaxed pl-8">
            Welcome to <strong>StudyFlow – Digital Study Planner</strong> ("StudyFlow", "we", "our", or "us"). 
            StudyFlow is a digital study management platform designed to help students and learners organize study schedules, tasks, assignments, notes, timetables, and exams effectively.
          </p>
          <p className="text-xs sm:text-sm text-[#49454F] leading-relaxed pl-8">
            This Privacy Policy explains how we collect, use, store, and protect your personal information when you use our application. By using StudyFlow, you agree to the collection and use of information in accordance with this policy. We collect only the minimum necessary information required to provide our service.
          </p>
        </section>

        <hr className="border-[#E1E3E1]" />

        {/* Section 2: Information We Collect */}
        <section className="space-y-3" id="sec-information-we-collect">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[#EADDFF] text-[#21005D] text-xs font-black flex items-center justify-center shrink-0">2</span>
            <h2 className="text-lg font-bold text-[#1D1B20]">Information We Collect</h2>
          </div>
          <p className="text-xs sm:text-sm text-[#49454F] leading-relaxed pl-8">
            We collect only the essential information needed to operate StudyFlow and provide a personalized experience:
          </p>
          <ul className="list-disc pl-14 space-y-2 text-xs sm:text-sm text-[#49454F]">
            <li>
              <strong>Account & Profile Information:</strong> Display name, email address, avatar initials, and country selection (used for billing currency selection).
            </li>
            <li>
              <strong>Study & Academic Data:</strong> Courses, timetable periods, assignment tasks, exam schedules, study timer session logs, and personal notes entered into the app.
            </li>
            <li>
              <strong>Technical & Usage Data:</strong> Basic browser information, device type, approximate locale, and application event logs necessary for system diagnostic and performance monitoring.
            </li>
          </ul>
        </section>

        <hr className="border-[#E1E3E1]" />

        {/* Section 3: How We Use Information */}
        <section className="space-y-3" id="sec-how-we-use-information">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[#EADDFF] text-[#21005D] text-xs font-black flex items-center justify-center shrink-0">3</span>
            <h2 className="text-lg font-bold text-[#1D1B20]">How We Use Information</h2>
          </div>
          <p className="text-xs sm:text-sm text-[#49454F] leading-relaxed pl-8">
            We use the collected information solely for the following legitimate operational purposes:
          </p>
          <ul className="list-disc pl-14 space-y-2 text-xs sm:text-sm text-[#49454F]">
            <li>To display and organize your academic schedules, GPA estimations, and study stats.</li>
            <li>To authenticate your user identity and facilitate cloud database synchronization across your devices.</li>
            <li>To process premium plan upgrades securely via authorized payment gateway partners (Razorpay and PayPal).</li>
            <li>To diagnose application errors, maintain platform security, and improve application functionality.</li>
          </ul>
          <p className="text-xs sm:text-sm text-[#49454F] leading-relaxed pl-8 font-medium text-slate-800">
            <strong>Data Protection Guarantee:</strong> We do <u>not</u> sell, rent, or trade your personal information to third parties, advertising networks, or data brokers.
          </p>
        </section>

        <hr className="border-[#E1E3E1]" />

        {/* Section 4: Local Storage */}
        <section className="space-y-3" id="sec-local-storage">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[#EADDFF] text-[#21005D] text-xs font-black flex items-center justify-center shrink-0">4</span>
            <h2 className="text-lg font-bold text-[#1D1B20]">Local Storage</h2>
          </div>
          <p className="text-xs sm:text-sm text-[#49454F] leading-relaxed pl-8">
            StudyFlow uses standard web browser <code>localStorage</code> to store your local study planner state, theme preferences, and offline cache. This allows the application to function quickly and support offline study planning. You can clear your local storage at any time through your browser settings or by using the Reset Workspace feature in Settings.
          </p>
        </section>

        <hr className="border-[#E1E3E1]" />

        {/* Section 5: Cloud Storage & Sync */}
        <section className="space-y-3" id="sec-cloud-storage">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[#EADDFF] text-[#21005D] text-xs font-black flex items-center justify-center shrink-0">5</span>
            <h2 className="text-lg font-bold text-[#1D1B20]">Cloud Storage & Synchronization</h2>
          </div>
          <p className="text-xs sm:text-sm text-[#49454F] leading-relaxed pl-8">
            When connected, StudyFlow synchronizes your study planner data with Google Firebase Cloud Firestore. This ensures your academic schedules, assignments, and study records are securely backed up and accessible across your authenticated devices.
          </p>
        </section>

        <hr className="border-[#E1E3E1]" />

        {/* Section 6: Account Information & Authentication */}
        <section className="space-y-3" id="sec-account-information">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[#EADDFF] text-[#21005D] text-xs font-black flex items-center justify-center shrink-0">6</span>
            <h2 className="text-lg font-bold text-[#1D1B20]">Account Information & Authentication</h2>
          </div>
          <p className="text-xs sm:text-sm text-[#49454F] leading-relaxed pl-8">
            Account authentication and identity security are managed securely via Firebase Authentication. Your login credentials, user token, and profile preferences are used strictly to maintain your session security and sync state. You can manage or update your profile details anytime within the Settings section.
          </p>
        </section>

        <hr className="border-[#E1E3E1]" />

        {/* Section 7: Payment Information */}
        <section className="space-y-3" id="sec-payment-information">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[#EADDFF] text-[#21005D] text-xs font-black flex items-center justify-center shrink-0">7</span>
            <h2 className="text-lg font-bold text-[#1D1B20]">Payment Information</h2>
          </div>
          <div className="pl-8 space-y-3">
            <p className="text-xs sm:text-sm text-[#49454F] leading-relaxed">
              When subscribing to StudyFlow Premium, payments are processed by PCI-DSS compliant third-party payment gateways:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-2">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-xs font-bold text-slate-800 block">Razorpay (India)</span>
                <span className="text-[11px] text-slate-600 leading-snug">Processes INR transactions via UPI, Debit/Credit Cards, NetBanking, and Wallets.</span>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-xs font-bold text-slate-800 block">PayPal (International)</span>
                <span className="text-[11px] text-slate-600 leading-snug">Processes USD transactions via PayPal Express Checkout and major debit/credit cards.</span>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 p-3 rounded-xl font-medium leading-relaxed">
              <strong>Strict Payment Security Policy:</strong> StudyFlow servers <u>never</u> collect, store, process, or transmit your credit card numbers, debit card details, bank credentials, or PINs. All billing details are handled directly within the official payment provider's secure encrypted interface.
            </p>
          </div>
        </section>

        <hr className="border-[#E1E3E1]" />

        {/* Section 8: Third-Party Services */}
        <section className="space-y-3" id="sec-third-party-services">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[#EADDFF] text-[#21005D] text-xs font-black flex items-center justify-center shrink-0">8</span>
            <h2 className="text-lg font-bold text-[#1D1B20]">Third-Party Services</h2>
          </div>
          <p className="text-xs sm:text-sm text-[#49454F] leading-relaxed pl-8">
            StudyFlow integrates with trusted third-party service providers solely to perform necessary backend operations:
          </p>
          <ul className="list-disc pl-14 space-y-1.5 text-xs sm:text-sm text-[#49454F]">
            <li><strong>Google Firebase:</strong> Cloud authentication and Firestore database infrastructure.</li>
            <li><strong>Razorpay Software Private Limited:</strong> Payment gateway processing for users in India.</li>
            <li><strong>PayPal Holdings, Inc.:</strong> Payment gateway processing for international users.</li>
          </ul>
          <p className="text-xs sm:text-sm text-[#49454F] leading-relaxed pl-8">
            These third parties process data according to their respective privacy policies and are contractually required to maintain data confidentiality.
          </p>
        </section>

        <hr className="border-[#E1E3E1]" />

        {/* Section 9: Cookies & Web Technologies */}
        <section className="space-y-3" id="sec-cookies-web">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[#EADDFF] text-[#21005D] text-xs font-black flex items-center justify-center shrink-0">9</span>
            <h2 className="text-lg font-bold text-[#1D1B20]">Cookies & Web Technologies</h2>
          </div>
          <p className="text-xs sm:text-sm text-[#49454F] leading-relaxed pl-8">
            StudyFlow uses essential session tokens and local browser storage to keep you signed in, preserve your theme settings, and secure API requests against cross-site vulnerabilities. We do not use third-party advertising cookies or cross-site tracking scripts.
          </p>
        </section>

        <hr className="border-[#E1E3E1]" />

        {/* Section 10: Data Security Practices */}
        <section className="space-y-3" id="sec-data-security">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[#EADDFF] text-[#21005D] text-xs font-black flex items-center justify-center shrink-0">10</span>
            <h2 className="text-lg font-bold text-[#1D1B20]">Data Security Practices</h2>
          </div>
          <p className="text-xs sm:text-sm text-[#49454F] leading-relaxed pl-8">
            We protect your data using industry-standard technical and organizational security controls. All communication between your browser and our backend servers is encrypted in transit using <strong>HTTPS/TLS 1.3</strong>. Cloud database records are secured with authenticated access rules and firewall protections. API credentials and secrets are kept strictly isolated on server environment variables.
          </p>
        </section>

        <hr className="border-[#E1E3E1]" />

        {/* Section 11: Data Retention & Account Deletion */}
        <section className="space-y-3" id="sec-data-retention-deletion">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[#EADDFF] text-[#21005D] text-xs font-black flex items-center justify-center shrink-0">11</span>
            <h2 className="text-lg font-bold text-[#1D1B20]">Data Retention & Account Deletion</h2>
          </div>
          <p className="text-xs sm:text-sm text-[#49454F] leading-relaxed pl-8">
            We retain your study planner data only for as long as your account remains active. You have full ownership and control over your personal data:
          </p>
          <ul className="list-disc pl-14 space-y-1.5 text-xs sm:text-sm text-[#49454F]">
            <li><strong>Local Data Reset:</strong> You can clear your local browser database and cache instantly via the Reset Workspace option in Settings.</li>
            <li><strong>Permanent Account Deletion:</strong> You have the right to request permanent deletion of your account and all associated cloud data by emailing our support team.</li>
          </ul>
        </section>

        <hr className="border-[#E1E3E1]" />

        {/* Section 12: Children's Privacy */}
        <section className="space-y-3" id="sec-childrens-privacy">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[#EADDFF] text-[#21005D] text-xs font-black flex items-center justify-center shrink-0">12</span>
            <h2 className="text-lg font-bold text-[#1D1B20]">Children's Privacy</h2>
          </div>
          <p className="text-xs sm:text-sm text-[#49454F] leading-relaxed pl-8">
            StudyFlow is intended for general audiences, students, and adult learners. We do not knowingly collect personal identifiable information from children under the age of 13. If we discover that a child under 13 has provided us with personal information without parental consent, we will delete such information immediately.
          </p>
        </section>

        <hr className="border-[#E1E3E1]" />

        {/* Section 13: Changes to This Privacy Policy */}
        <section className="space-y-3" id="sec-changes-to-policy">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[#EADDFF] text-[#21005D] text-xs font-black flex items-center justify-center shrink-0">13</span>
            <h2 className="text-lg font-bold text-[#1D1B20]">Changes to This Privacy Policy</h2>
          </div>
          <p className="text-xs sm:text-sm text-[#49454F] leading-relaxed pl-8">
            We may update our Privacy Policy periodically to reflect app enhancements, technical improvements, or legal requirements. Updates will be posted directly on this page with a revised "Effective Date" at the top. We encourage you to review this policy from time to time.
          </p>
        </section>

        <hr className="border-[#E1E3E1]" />

        {/* Section 14: Contact Us */}
        <section className="space-y-4" id="sec-contact-us">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[#EADDFF] text-[#21005D] text-xs font-black flex items-center justify-center shrink-0">14</span>
            <h2 className="text-lg font-bold text-[#1D1B20]">Contact Us</h2>
          </div>
          <p className="text-xs sm:text-sm text-[#49454F] leading-relaxed pl-8">
            If you have any questions about this Privacy Policy, your personal data, or would like to request account deletion, please contact us at:
          </p>
          
          <div className="pl-8">
            <div className="p-5 bg-[#F3EDF7]/60 border border-[#D0BCFF]/50 rounded-2xl max-w-md space-y-2">
              <span className="text-xs font-bold text-[#1D1B20] block">Support Email</span>
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
          <span>Back to Home</span>
        </button>
      </div>

    </div>
  );
}

