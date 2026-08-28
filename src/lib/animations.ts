import { Variants, Transition } from 'motion/react';

// Standard SaaS Animation Tokens (150ms - 250ms fast, purposeful, smooth)
export const TRANSITIONS = {
  instant: { duration: 0.1, ease: [0.2, 0, 0, 1] } as Transition,
  fast: { duration: 0.18, ease: [0.16, 1, 0.3, 1] } as Transition,
  standard: { duration: 0.24, ease: [0.16, 1, 0.3, 1] } as Transition,
  gentle: { duration: 0.32, ease: [0.16, 1, 0.3, 1] } as Transition,
  springMicro: { type: 'spring', stiffness: 450, damping: 32 } as Transition,
  springSnappy: { type: 'spring', stiffness: 380, damping: 28 } as Transition,
};

// 1. Page Transition Variants (Between Workspace Tabs)
export const pageVariants: Variants = {
  initial: {
    opacity: 0,
    y: 6,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.22,
      ease: [0.16, 1, 0.3, 1],
    },
  },
  exit: {
    opacity: 0,
    y: -4,
    transition: {
      duration: 0.15,
      ease: [0.2, 0, 0, 1],
    },
  },
};

// 2. Dashboard & Bento Grid Stagger Container
export const staggerContainer: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.02,
    },
  },
};

// 3. Staggered Item / Card Entrance
export const cardEntranceVariants: Variants = {
  initial: {
    opacity: 0,
    y: 8,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.24,
      ease: [0.16, 1, 0.3, 1],
    },
  },
  exit: {
    opacity: 0,
    scale: 0.97,
    transition: {
      duration: 0.15,
      ease: [0.2, 0, 0, 1],
    },
  },
};

// 4. Modal Backdrop & Panel Animation Variants
export const modalBackdropVariants: Variants = {
  initial: { opacity: 0 },
  animate: { 
    opacity: 1,
    transition: { duration: 0.18, ease: 'easeOut' }
  },
  exit: { 
    opacity: 0,
    transition: { duration: 0.14, ease: 'easeIn' }
  },
};

export const modalPanelVariants: Variants = {
  initial: { 
    opacity: 0, 
    scale: 0.96, 
    y: 8 
  },
  animate: { 
    opacity: 1, 
    scale: 1, 
    y: 0,
    transition: { 
      duration: 0.22, 
      ease: [0.16, 1, 0.3, 1] 
    } 
  },
  exit: { 
    opacity: 0, 
    scale: 0.97, 
    y: 4,
    transition: { 
      duration: 0.14, 
      ease: [0.2, 0, 0, 1] 
    } 
  },
};

// 5. Drawer Variants (Sidebar Mobile / Slide-in Menus)
export const drawerVariants: Variants = {
  initial: { x: '-100%', opacity: 0.8 },
  animate: { 
    x: 0, 
    opacity: 1,
    transition: { 
      duration: 0.25, 
      ease: [0.16, 1, 0.3, 1] 
    } 
  },
  exit: { 
    x: '-100%', 
    opacity: 0.8,
    transition: { 
      duration: 0.18, 
      ease: [0.2, 0, 0, 1] 
    } 
  },
};

// 6. List Item Dynamic Insert / Remove Variants
export const listItemVariants: Variants = {
  initial: { opacity: 0, y: 6, scale: 0.98 },
  animate: { 
    opacity: 1, 
    y: 0, 
    scale: 1,
    transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] } 
  },
  exit: { 
    opacity: 0, 
    scale: 0.96,
    height: 0,
    marginTop: 0,
    marginBottom: 0,
    paddingTop: 0,
    paddingBottom: 0,
    transition: { duration: 0.16, ease: [0.2, 0, 0, 1] } 
  },
};

// 7. Dropdown & Tooltip Menu Variants
export const dropdownVariants: Variants = {
  initial: { opacity: 0, y: -4, scale: 0.97 },
  animate: { 
    opacity: 1, 
    y: 0, 
    scale: 1,
    transition: { duration: 0.16, ease: [0.16, 1, 0.3, 1] } 
  },
  exit: { 
    opacity: 0, 
    y: -3, 
    scale: 0.97,
    transition: { duration: 0.12, ease: [0.2, 0, 0, 1] } 
  },
};

// 8. Notification / Toast Pop-up Variants
export const toastVariants: Variants = {
  initial: { opacity: 0, y: 12, scale: 0.95 },
  animate: { 
    opacity: 1, 
    y: 0, 
    scale: 1,
    transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] } 
  },
  exit: { 
    opacity: 0, 
    y: 8, 
    scale: 0.96,
    transition: { duration: 0.16, ease: [0.2, 0, 0, 1] } 
  },
};

// Aliases for modals
export const backdropVariants = modalBackdropVariants;
export const modalVariants = modalPanelVariants;

