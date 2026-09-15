import { motion } from 'motion/react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import { gentle, fadeUp } from '@/lib/motion';

export default function Layout({ children }) {
  const location = useLocation();
  return (
    <div className="flex h-screen overflow-hidden bg-background" data-testid="app-layout">
      <Sidebar />
      <main className="flex-1 overflow-y-auto relative">
        {/* No AnimatePresence/exit stage here on purpose: a route swap that
            fully fades the old page out before fading the new one in reads
            as two disjointed steps (fade out, blank beat, fade in) rather
            than one motion. The old page just disappears instantly and the
            new one eases in on mount, which is the pattern native apps use. */}
        <motion.div
          key={location.pathname}
          initial={fadeUp.initial}
          animate={fadeUp.animate}
          transition={gentle}
          className="p-8 lg:p-10 max-w-5xl"
        >
          {children}
        </motion.div>
      </main>
    </div>
  );
}
