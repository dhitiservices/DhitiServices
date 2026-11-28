// Motion presets. Only transform/opacity are animated (compositor-only, 60fps); MotionConfig reducedMotion="user"
// turns transforms off for people who ask for reduced motion.
export const spring = { type: "spring", stiffness: 520, damping: 42, mass: 0.9 };
export const softSpring = { type: "spring", stiffness: 300, damping: 34, mass: 1 };
export const snappy = { type: "spring", stiffness: 700, damping: 48 };
export const ease = [0.32, 0.72, 0, 1];

export const page = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.32, ease } },
  exit: { opacity: 0, y: -4, transition: { duration: 0.14, ease: "easeIn" } },
};

export const list = {
  animate: { transition: { staggerChildren: 0.028, delayChildren: 0.04 } },
};
export const listItem = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.34, ease } },
};
