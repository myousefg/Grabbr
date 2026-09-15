// Shared Framer Motion presets. Tuned toward macOS's tightly-damped system
// animations (low `bounce`) rather than the more visibly springy defaults
// most web spring demos reach for.

// Small controls: buttons, switches, list-item enter/exit.
export const snappy = { type: 'spring', bounce: 0.12, duration: 0.28 };

// Larger surfaces: route transitions, dialogs.
export const gentle = { type: 'spring', bounce: 0.1, duration: 0.42 };

export const tapScale = { scale: 0.97 };

// Route-level fade + small upward motion.
export const fadeUp = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
};

// List item (Queue, History rows) enter/exit.
export const listItem = {
  initial: { opacity: 0, y: 8, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, scale: 0.98 },
};
