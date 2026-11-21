import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Trash2 } from 'lucide-react';
import Button from '../components/ui/Button';
import { accuracy, clearAll, getAllHistories } from '../lib/storage';
import { duration, percent, timeAgo } from '../lib/format';
import { getCategory, getScope } from '../lib/countries';

export default function Scores() {
  const [histories, setHistories] = useState(() => getAllHistories());
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="mx-auto min-h-[100dvh] max-w-3xl px-5 py-8">
      <header className="mb-8 flex items-center gap-3">
        <Link
          to="/"
          className="-ml-2 rounded-lg p-2 text-foam transition-colors hover:bg-shelf hover:text-chalk"
          aria-label="Back to the start"
        >
          <ArrowLeft size={20} />
        </Link>
        <h1 className="font-display text-3xl font-extrabold text-chalk">Your scores</h1>
      </header>

      {histories.length === 0 ? (
        <div className="titleblock rounded-2xl px-6 py-10 text-center">
          <p className="text-summit">No rounds finished yet.</p>
          <p className="mt-1 text-[14px] text-foam">
            Every round you complete is kept here — the last five of each kind.
          </p>
          <Button as={Link} to="/" variant="primary" className="mt-5">
            Pick a round
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {histories.map((h, hi) => {
            const best = h.runs.reduce((a, b) => (accuracy(b) > accuracy(a) ? b : a));
            return (
              <motion.section
                key={h.key}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: hi * 0.05, duration: 0.4 }}
                className="titleblock rounded-2xl p-5"
              >
                <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-display text-lg font-bold text-chalk">
                    {h.mode === 'quiz' ? 'Quiz' : 'Training'} — {getCategory(h.category).label.toLowerCase()},{' '}
                    {getScope(h.scope).label.toLowerCase()}
                  </h2>
                  <Link
                    to={`/play/${h.mode}/${h.category}/${h.scope}`}
                    className="text-[13px] font-semibold text-savanna hover:text-summit"
                  >
                    Play it again
                  </Link>
                </div>

                <ol className="space-y-2">
                  {h.runs.map((run, i) => {
                    const p = accuracy(run);
                    const isBest = run.at === best.at;
                    return (
                      <li key={run.at} className="flex items-center gap-3 text-[13px]">
                        <span className="tabular w-16 shrink-0 font-semibold text-chalk">
                          {run.score}/{run.total}
                        </span>
                        <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-shelf">
                          <motion.span
                            className={`block h-full rounded-full ${isBest ? 'bg-savanna' : 'bg-tide'}`}
                            initial={{ width: 0 }}
                            animate={{ width: `${p * 100}%` }}
                            transition={{ delay: 0.1 + i * 0.05, duration: 0.5, ease: 'easeOut' }}
                          />
                        </span>
                        <span className="tabular w-10 shrink-0 text-right text-foam">{percent(p)}</span>
                        <span className="hidden w-16 shrink-0 text-right text-foam sm:block">
                          {duration(run.ms)}
                        </span>
                        <span className="w-20 shrink-0 text-right text-foam">{timeAgo(run.at)}</span>
                      </li>
                    );
                  })}
                </ol>
              </motion.section>
            );
          })}

          <div className="pt-4">
            {confirming ? (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-[14px] text-summit">Delete every score on this device?</p>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    clearAll();
                    setHistories([]);
                    setConfirming(false);
                  }}
                >
                  Delete them
                </Button>
                <Button variant="quiet" size="sm" onClick={() => setConfirming(false)}>
                  Keep them
                </Button>
              </div>
            ) : (
              <Button variant="quiet" size="sm" onClick={() => setConfirming(true)}>
                <Trash2 size={15} /> Clear all scores
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
