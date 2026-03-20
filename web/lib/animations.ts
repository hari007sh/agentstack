import { Variants } from "framer-motion";

// Page-level fade in with slight upward slide
export const fadeIn: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: "easeOut" },
  },
};

// Stagger children with 50ms delay
export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
    },
  },
};

// Individual stagger item
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: "easeOut" },
  },
};

// Modal scale in with backdrop
export const modalOverlay: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

export const modalContent: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.2, ease: "easeOut" },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: { duration: 0.15, ease: "easeIn" },
  },
};

// Count-up animation helper
export function countUp(
  from: number,
  to: number,
  duration: number,
  onUpdate: (value: number) => void
) {
  const startTime = performance.now();
  const diff = to - from;

  function update(currentTime: number) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / (duration * 1000), 1);
    // Ease out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = from + diff * eased;
    onUpdate(value);

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}

// Button press scale
export const buttonPress = {
  whileTap: { scale: 0.98 },
  transition: { duration: 0.1 },
};

// Sidebar item hover
export const sidebarItemHover = {
  whileHover: { x: 2 },
  transition: { duration: 0.15 },
};

// Chart draw-in animation
export const chartReveal: Variants = {
  hidden: { clipPath: "inset(0 100% 0 0)" },
  visible: {
    clipPath: "inset(0 0% 0 0)",
    transition: { duration: 0.8, ease: "easeOut", delay: 0.2 },
  },
};

// Tab underline animation (use with layoutId)
export const tabUnderline = {
  layoutId: "tab-underline",
  transition: { type: "spring", stiffness: 500, damping: 30 },
};
