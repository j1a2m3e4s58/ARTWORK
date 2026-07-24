import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function LoadingScreen({ onComplete }) {
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(timer);
          setTimeout(() => {
            setDone(true);
            setTimeout(onComplete, 700);
          }, 400);
          return 100;
        }
        return prev + Math.random() * 15 + 5;
      });
    }, 120);
    return () => clearInterval(timer);
  }, [onComplete]);

  return (
    <AnimatePresence>
      {!done && (
        <motion.div
          className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-obsidian"
          exit={{ opacity: 0, scale: 1.05 }}
          transition={{ duration: 0.7, ease: [0.76, 0, 0.24, 1] }}
        >
          {/* Noise overlay */}
          <div className="noise-overlay absolute inset-0 opacity-30" />

          {/* Radial glow */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-[600px] h-[600px] rounded-full opacity-10"
              style={{ background: 'radial-gradient(circle, #C9A96E 0%, transparent 70%)' }} />
          </div>

          {/* SVG Signature Animation */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.8 }}
            className="mb-12"
          >
            <svg width="300" height="120" viewBox="0 0 300 120" fill="none" xmlns="http://www.w3.org/2000/svg">
              <motion.path
                d="M20,80 C30,20 60,10 80,40 C90,55 85,70 75,75 C65,80 50,70 55,55 C60,40 80,45 90,60 L120,80"
                stroke="#C9A96E"
                strokeWidth="2"
                strokeLinecap="round"
                fill="none"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 1.5, ease: "easeInOut", delay: 0.3 }}
              />
              <motion.path
                d="M115,75 C125,65 140,60 155,70 C165,77 165,90 155,92 C145,94 135,85 140,75 L165,75 L195,75"
                stroke="#C9A96E"
                strokeWidth="2"
                strokeLinecap="round"
                fill="none"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 1.2, ease: "easeInOut", delay: 1 }}
              />
              <motion.path
                d="M190,60 L205,90 M205,60 L220,90 M215,75 L200,75"
                stroke="#C9A96E"
                strokeWidth="2"
                strokeLinecap="round"
                fill="none"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.8, ease: "easeInOut", delay: 1.8 }}
              />
              <motion.path
                d="M225,55 L235,90 M235,70 C242,63 255,60 262,68 C268,75 265,88 256,90 C247,92 240,82 247,75"
                stroke="#C9A96E"
                strokeWidth="2"
                strokeLinecap="round"
                fill="none"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 1, ease: "easeInOut", delay: 2.2 }}
              />
            </svg>
          </motion.div>

          <motion.p
            className="font-tight uppercase tracking-[0.4em] text-xs text-brass/60 mb-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1, duration: 1 }}
          >
            Atelier
          </motion.p>

          {/* Progress bar */}
          <div className="w-48 h-px bg-white/10 relative overflow-hidden">
            <motion.div
              className="h-full bg-brass absolute left-0 top-0"
              style={{ width: `${Math.min(progress, 100)}%` }}
              transition={{ duration: 0.1 }}
            />
          </div>
          <motion.p
            className="font-tight text-xs text-brass/40 mt-3 tracking-widest"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            {Math.min(Math.round(progress), 100)}%
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}