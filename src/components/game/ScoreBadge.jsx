import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { useEffect } from 'react';

/** The score counts up rather than snapping, so a point landing is visible
 *  out of the corner of your eye while you are still looking at the map. */
function Rolling({ value }) {
  const mv = useMotionValue(value);
  const spring = useSpring(mv, { stiffness: 240, damping: 26 });
  const text = useTransform(spring, (v) => Math.round(v).toString());
  useEffect(() => {
    mv.set(value);
  }, [mv, value]);
  return <motion.span>{text}</motion.span>;
}

/**
 * Two separate facts, kept apart on purpose: how many you have got right,
 * and how far through the round you are. Showing them as one fraction reads
 * as "0/0" on the first question, which tells you nothing.
 */
export default function ScoreBadge({ score, position, total, streak = 0 }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="font-display text-2xl leading-none font-extrabold text-chalk">
        <span className="tabular">
          <Rolling value={score} />
        </span>
        <span className="ml-1.5 text-[13px] font-medium text-foam">right</span>
      </span>

      {streak >= 3 && (
        <motion.span
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 18 }}
          className="rounded-full bg-savanna/20 px-2 py-0.5 text-[12px] font-bold text-savanna"
        >
          {streak} in a row
        </motion.span>
      )}

      <span className="tabular ml-auto text-[13px] text-foam">
        {position} of {total}
      </span>
    </div>
  );
}
