import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, History } from 'lucide-react';
import Button from '../components/ui/Button';
import {
  CATEGORIES,
  COUNTRIES,
  SCOPES,
  canAddTerritories,
  flagSrc,
  poolFor,
  withTerritories,
} from '../lib/countries';
import { accuracy, getAllHistories, roundKey } from '../lib/storage';
import { percent, timeAgo } from '../lib/format';

const MODES = [
  { id: 'train', label: 'Training', blurb: 'Guess as many times as you like, or ask for the answer.' },
  { id: 'quiz', label: 'Quiz', blurb: 'One guess each. The answer shows either way.' },
  { id: 'free', label: 'Free', blurb: 'No questions, no score. Click any country and read about it.' },
];

/** Two rows of real flags, drifting in opposite directions. The content of
 *  the game is the most characteristic thing it has, so it is the hero. */
function FlagRibbon({ from, reverse }) {
  const flags = useMemo(() => {
    // Sampled right across the alphabetical list rather than off the front,
    // so the two ribbons are not both a run of countries beginning with A.
    const all = COUNTRIES.filter((c) => c.core);
    const step = all.length / 22;
    const picked = Array.from({ length: 22 }, (_, i) => all[Math.floor(i * step + from) % all.length]);
    return [...picked, ...picked]; // doubled so the loop has no seam
  }, [from]);

  return (
    <div className="relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]">
      <div
        className="flex w-max gap-2.5 py-1"
        style={{
          animation: `ttp-drift ${reverse ? 64 : 52}s linear infinite`,
          animationDirection: reverse ? 'reverse' : 'normal',
        }}
      >
        {flags.map((c, i) => (
          <img
            key={`${c.id}-${i}`}
            src={flagSrc(c.id)}
            alt=""
            aria-hidden
            width={60}
            height={45}
            loading="lazy"
            className="h-[34px] w-[45px] shrink-0 rounded-[2px] border border-tide/60 object-cover opacity-85 sm:h-[42px] sm:w-[56px]"
          />
        ))}
      </div>
    </div>
  );
}

function Segmented({ options, value, onChange, label }) {
  return (
    <fieldset>
      <legend className="mb-2 text-[13px] text-foam">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = value === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onChange(o.id)}
              aria-pressed={on}
              className={`relative rounded-lg px-3 py-2 text-[14px] font-semibold transition-colors ${
                on ? 'text-abyss' : 'border border-tide bg-shelf/50 text-foam hover:text-chalk'
              }`}
            >
              {on && (
                <motion.span
                  layoutId={`seg-${label}`}
                  className="absolute inset-0 rounded-lg bg-savanna"
                  transition={{ type: 'spring', stiffness: 520, damping: 38 }}
                />
              )}
              <span className="relative">{o.label}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('train');
  const [category, setCategory] = useState('flags');
  const [region, setRegion] = useState('world');
  const [addTerritories, setAddTerritories] = useState(false);

  // The toggle is meaningless on the territories-only scope, and folding it
  // into the id here keeps every score history separate by what was played.
  const isFree = mode === 'free';
  const canAdd = !isFree && canAddTerritories(region);
  const scope = withTerritories(region, canAdd && addTerritories);

  const count = poolFor(scope, category).length;
  const sovereignCount = poolFor(region, category).length;
  const key = roundKey(mode, category, scope);
  const histories = useMemo(() => getAllHistories(), []);
  const mine = isFree ? null : histories.find((h) => h.key === key);
  const best = mine ? mine.runs.reduce((a, b) => (accuracy(b) > accuracy(a) ? b : a)) : null;

  const modeMeta = MODES.find((m) => m.id === mode);
  const catMeta = CATEGORIES.find((c) => c.id === category);

  // One orchestrated entrance on load, then the page stays still.
  const rise = (i) => ({
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    transition: { delay: 0.06 * i, duration: 0.5, ease: [0.2, 0.8, 0.2, 1] },
  });

  return (
    <div className="min-h-[100dvh] overflow-x-hidden">
      <style>{`@keyframes ttp-drift { to { transform: translateX(-50%); } }`}</style>

      <header className="pt-8 pb-6 sm:pt-14">
        <motion.div {...rise(0)}>
          <FlagRibbon from={0} />
        </motion.div>

        <motion.div {...rise(1)} className="mx-auto max-w-3xl px-5 py-6 text-center">
          <h1 className="font-display text-[clamp(2.5rem,9vw,4.5rem)] leading-[0.95] font-extrabold tracking-[-0.03em] text-chalk">
            The Third Planet
          </h1>
          <p className="mt-3 text-[clamp(1rem,2.4vw,1.2rem)] text-summit">
            Point at the world until you know it.
          </p>
        </motion.div>

        <motion.div {...rise(2)}>
          <FlagRibbon from={4} reverse />
        </motion.div>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-16">
        <motion.div {...rise(3)} className="titleblock rounded-2xl p-5 sm:p-7">
          <div className="space-y-6">
            <Segmented label="How do you want to play?" options={MODES} value={mode} onChange={setMode} />
            <p className="-mt-3 text-[13px] leading-snug text-foam">{modeMeta.blurb}</p>

            {!isFree && (
              <>
                <Segmented label="Learning what?" options={CATEGORIES} value={category} onChange={setCategory} />
                <p className="-mt-3 text-[13px] leading-snug text-foam">{catMeta.blurb}</p>
              </>
            )}

            <div>
              <Segmented
                label={isFree ? 'Where should the map open?' : 'Which part of the world?'}
                options={SCOPES}
                value={region}
                onChange={setRegion}
              />

              {canAdd && (
                <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-[14px] text-chalk select-none">
                  <input
                    type="checkbox"
                    checked={addTerritories}
                    onChange={(e) => setAddTerritories(e.target.checked)}
                    className="mt-0.5 size-4 shrink-0 accent-savanna"
                  />
                  <span>
                    Add dependent territories
                    <span className="block text-[13px] text-foam">
                      {count > sovereignCount
                        ? `${count - sovereignCount} more places, scored separately`
                        : 'Greenland, Puerto Rico, Hong Kong and the rest'}
                    </span>
                  </span>
                </label>
              )}
            </div>
          </div>

          <div className="mt-7 flex flex-wrap items-center gap-4 border-t border-tide/50 pt-5">
            <Button
              variant="primary"
              size="lg"
              onClick={() =>
                navigate(isFree ? `/explore/${region}` : `/play/${mode}/${category}/${scope}`)
              }
            >
              {isFree ? 'Open the map' : `Start — ${count} to go`} <ArrowRight size={18} />
            </Button>
            {best && (
              <p className="text-[13px] text-foam">
                Your best here:{' '}
                <span className="font-semibold text-chalk">
                  {best.score}/{best.total}
                </span>{' '}
                ({percent(accuracy(best))})
              </p>
            )}
          </div>
        </motion.div>

        {histories.length > 0 && (
          <motion.section {...rise(4)} className="mt-8">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="font-display text-lg font-bold text-chalk">Where you left off</h2>
              <Link
                to="/scores"
                className="inline-flex items-center gap-1.5 text-[13px] text-foam transition-colors hover:text-chalk"
              >
                <History size={14} /> All scores
              </Link>
            </div>
            <ul className="space-y-1.5">
              {histories.slice(0, 3).map((h) => {
                const last = h.runs[0];
                return (
                  <li key={h.key}>
                    <Link
                      to={`/play/${h.mode}/${h.category}/${h.scope}`}
                      className="flex items-center gap-3 rounded-xl border border-tide/60 bg-deep/70 px-4 py-3 transition-colors hover:border-savanna/60 hover:bg-shelf/60"
                    >
                      <span className="min-w-0 flex-1 truncate text-[14px] text-chalk">
                        {h.mode === 'quiz' ? 'Quiz' : 'Training'} — {h.category}, {h.scope}
                      </span>
                      <span className="tabular shrink-0 text-[14px] font-semibold text-summit">
                        {last.score}/{last.total}
                      </span>
                      <span className="hidden shrink-0 text-[12px] text-foam sm:block">
                        {timeAgo(last.at)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </motion.section>
        )}

        <motion.p {...rise(5)} className="mt-10 text-[13px] leading-relaxed text-foam">
          Everything runs on your device. Scores stay in this browser, and once the app has loaded
          once it works with no connection at all.
        </motion.p>
      </main>
    </div>
  );
}
