import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

const TONES = {
  win: 'border-savanna text-summit bg-[color-mix(in_srgb,#e0a93b_18%,#103139)]',
  good: 'border-lowland text-chalk bg-[color-mix(in_srgb,#86a95f_16%,#103139)]',
  info: 'border-tide text-chalk bg-deep',
};

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const seq = useRef(0);

  const push = useCallback((toast) => {
    const id = ++seq.current;
    setItems((prev) => [...prev, { id, tone: 'info', ...toast }]);
    // Long enough to read a sentence, short enough not to sit over the map.
    const ttl = toast.ttl ?? 3600;
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), ttl);
  }, []);

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-3">
        <AnimatePresence initial={false}>
          {items.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: -18, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 520, damping: 34 }}
              className={`pointer-events-auto max-w-[min(92vw,30rem)] rounded-xl border px-4 py-2.5 shadow-[0_10px_30px_rgb(0_0_0/.45)] ${TONES[t.tone]}`}
            >
              <p className="text-sm leading-snug">
                {t.title && <span className="font-bold">{t.title} </span>}
                {t.body}
              </p>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
