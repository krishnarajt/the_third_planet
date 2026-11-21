import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import Button from '../ui/Button';
import { accuracy } from '../../lib/storage';
import { duration, percent, timeAgo } from '../../lib/format';

function verdict(pct) {
  if (pct === 1) return 'Every single one.';
  if (pct >= 0.9) return 'You know this map.';
  if (pct >= 0.7) return 'Solid. The gaps are getting small.';
  if (pct >= 0.4) return 'Coming together.';
  if (pct > 0) return 'Early days — go again.';
  return 'Everyone starts here.';
}

export default function RoundComplete({ result, history, onAgain, onChange }) {
  const pct = accuracy(result.entry);

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 28 }}
      className="space-y-5"
    >
      <div>
        {result.isBest && !result.isFirst && (
          <motion.p
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.15, type: 'spring', stiffness: 500, damping: 18 }}
            className="mb-1 font-display text-sm font-extrabold text-savanna"
          >
            New best score
          </motion.p>
        )}
        <p className="tabular font-display text-5xl leading-none font-extrabold text-chalk">
          {result.entry.score}
          <span className="text-foam">/{result.entry.total}</span>
        </p>
        <p className="mt-2 text-[15px] text-summit">{verdict(pct)}</p>
        <p className="mt-1 text-[13px] text-foam">
          {percent(pct)} first try, in {duration(result.entry.ms)}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={onAgain}>
          Play again
        </Button>
        <Button onClick={onChange}>Change round</Button>
        <Button as={Link} to="/scores" variant="quiet">
          All scores
        </Button>
      </div>

      {history.length > 1 && (
        <section>
          <h3 className="mb-2 text-[13px] font-semibold text-savanna">Your last {history.length}</h3>
          <ol className="space-y-1">
            {history.map((run, i) => {
              const p = accuracy(run);
              return (
                <li key={run.at} className="flex items-center gap-3 text-[13px]">
                  <span className="tabular w-14 shrink-0 font-semibold text-chalk">
                    {run.score}/{run.total}
                  </span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-shelf">
                    <motion.span
                      className="block h-full rounded-full bg-savanna"
                      initial={{ width: 0 }}
                      animate={{ width: `${p * 100}%` }}
                      transition={{ delay: 0.1 + i * 0.06, duration: 0.5, ease: 'easeOut' }}
                    />
                  </span>
                  <span className="w-20 shrink-0 text-right text-foam">{timeAgo(run.at)}</span>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </motion.div>
  );
}
