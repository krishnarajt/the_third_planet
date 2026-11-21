import { useRegisterSW } from 'virtual:pwa-register/react';
import { AnimatePresence, motion } from 'framer-motion';
import Button from './ui/Button';

/**
 * The service worker is registered with 'prompt', so a new build waits here
 * instead of reloading on its own. Reloading unasked mid-round would throw
 * away a score that only exists in memory until the round ends.
 */
export default function PwaUpdate() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  return (
    <AnimatePresence>
      {needRefresh && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md flex-wrap items-center gap-3 rounded-xl border border-tide bg-deep px-4 py-3 shadow-[0_12px_36px_rgb(0_0_0/.5)]"
        >
          <p className="flex-1 text-[14px] text-chalk">A new version is ready.</p>
          <Button size="sm" variant="quiet" onClick={() => setNeedRefresh(false)}>
            Later
          </Button>
          <Button size="sm" variant="primary" onClick={() => updateServiceWorker(true)}>
            Reload
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
