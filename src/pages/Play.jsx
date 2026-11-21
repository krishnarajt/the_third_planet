import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, ChevronLeft, ChevronRight, Eye, SkipForward, X } from 'lucide-react';
import WorldMap from '../components/map/WorldMap';
import BasemapToggle, { useBasemap } from '../components/map/BasemapToggle';
import CountryCard from '../components/panel/CountryCard';
import Prompt from '../components/panel/Prompt';
import ScoreBadge from '../components/game/ScoreBadge';
import RoundComplete from '../components/game/RoundComplete';
import Button from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { buildRound } from '../lib/rounds';
import { ensureDetail, getCategory, getCountry, getScope, scopeBounds } from '../lib/countries';
import { getHistory, roundKey, saveRun } from '../lib/storage';

/** What the panel says about a question you have already left behind. */
const REVIEW_NOTE = {
  right: 'You got this one first time.',
  retried: 'You got there in the end.',
  revealed: 'You asked for the answer.',
  skipped: 'You skipped this one.',
};

export default function Play() {
  const { mode = 'train', category = 'flags', scope = 'world' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const mapRef = useRef(null);

  const isQuiz = mode === 'quiz';
  const key = roundKey(mode, category, scope);

  const [order, setOrder] = useState(() => buildRound({ category, scope }));
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [misses, setMisses] = useState([]); // wrong picks on the current question
  const [revealed, setRevealed] = useState(false);
  const [settled, setSettled] = useState(false);
  const [stamp, setStamp] = useState(null);
  const [result, setResult] = useState(null);
  const [expanded, setExpanded] = useState(false);
  // What happened on every question already left behind, by index. Training
  // lets you walk back through these; they are read-only, so nothing here can
  // change the score.
  const [log, setLog] = useState([]);
  // null means "on the live question". A number is a past question being
  // looked at, which cannot be answered again.
  const [view, setView] = useState(null);
  // Bumped once the lazy-loaded facts/tells arrive, purely to force the
  // country card to re-render with them if it already mounted without.
  const [detailTick, setDetailTick] = useState(0);
  const startedAt = useRef(Date.now());

  // Kicked off as soon as a round starts rather than waited on: the map
  // itself takes a couple of seconds to come up, which is normally enough
  // time for this to resolve well before the first answer is shown.
  useEffect(() => {
    ensureDetail().then(() => setDetailTick((t) => t + 1));
  }, []);
  const stampSeq = useRef(0);

  const [basemap, setBasemap] = useBasemap(isQuiz ? 'quiz' : 'atlas');

  // `answer` is always the live question; `shown` is whichever one the panel
  // is currently displaying, which differs only while reviewing.
  const answer = order[index] ?? null;
  const reviewing = view !== null;
  const shownIndex = reviewing ? view : index;
  const shown = order[shownIndex] ?? null;
  const shownLog = reviewing ? log[view] : null;
  const total = order.length;
  const cat = getCategory(category);
  const scopeMeta = getScope(scope);
  const bounds = useMemo(() => scopeBounds(scope, category), [scope, category]);

  const frame = useCallback(() => {
    mapRef.current?.home(bounds, { duration: 0 });
  }, [bounds]);

  const onFallback = useCallback(() => {
    setBasemap('quiz');
    toast({
      tone: 'info',
      title: 'Offline.',
      body: 'Showing the plain map — everything still works.',
    });
  }, [toast]);

  const restart = useCallback(() => {
    mapRef.current?.clearMarks();
    mapRef.current?.home(bounds);
    setOrder(buildRound({ category, scope }));
    setIndex(0);
    setScore(0);
    setStreak(0);
    setMisses([]);
    setRevealed(false);
    setSettled(false);
    setStamp(null);
    setResult(null);
    setLog([]);
    setView(null);
    startedAt.current = Date.now();
  }, [mode, category, scope, bounds]);

  // A different round type is a different game; start it clean.
  useEffect(() => {
    restart();
  }, [restart]);

  const finish = useCallback(
    (finalScore) => {
      const run = { score: finalScore, total, ms: Date.now() - startedAt.current };
      const saved = saveRun(key, run);
      setResult(saved);
      if (saved.isBest && !saved.isFirst) {
        toast({ tone: 'win', title: 'New best score!', body: `${run.score}/${run.total} — better than anything you have run before.` });
      } else if (saved.matchedBest) {
        toast({ tone: 'good', title: 'Matched your best.', body: `${run.score}/${run.total} again.` });
      }
    },
    [key, total, toast]
  );

  const advance = useCallback(() => {
    // Back to the round's overview. Without this the next question starts
    // zoomed into wherever the last answer was, with the target off screen.
    mapRef.current?.clearMarks();
    mapRef.current?.home(bounds);
    const outcome = !settled
      ? 'skipped'
      : revealed
        ? 'revealed'
        : misses.length
          ? 'retried'
          : 'right';
    setLog((l) => {
      const next = [...l];
      next[index] = { misses, outcome };
      return next;
    });
    setStamp(null);
    setMisses([]);
    setRevealed(false);
    setSettled(false);
    if (index + 1 >= total) finish(score);
    else setIndex((i) => i + 1);
  }, [index, total, finish, score, bounds, settled, revealed, misses]);

  // Jump to question `target` (0-based). Anything at or past the live
  // question means "back to the live question". The map is repainted by hand
  // for the same reason the game drives it imperatively everywhere else.
  const goTo = useCallback(
    (target) => {
      if (isQuiz || result) return;
      const map = mapRef.current;
      map?.clearMarks();
      setStamp(null);

      if (target >= index) {
        setView(null);
        misses.forEach((m) => map?.mark(m, 'wrong'));
        if (settled) {
          map?.mark(answer, revealed ? 'answer' : 'correct');
          map?.flyTo(answer);
        } else {
          map?.home(bounds);
        }
        return;
      }

      const t = Math.max(0, target);
      const rec = log[t];
      const iso = order[t];
      setView(t);
      rec?.misses.forEach((m) => map?.mark(m, 'wrong'));
      map?.mark(iso, rec?.outcome === 'right' || rec?.outcome === 'retried' ? 'correct' : 'answer');
      map?.flyTo(iso);
    },
    [isQuiz, result, index, misses, settled, answer, revealed, bounds, log, order]
  );

  const showStamp = (iso, tone) => setStamp({ iso, tone, nonce: ++stampSeq.current });

  const handlePick = useCallback(
    (iso) => {
      if (!answer || settled || result || reviewing) return;
      const map = mapRef.current;

      if (iso === answer) {
        // A point is only for getting there unaided and first time, which is
        // what keeps a training score comparable to a quiz score.
        const clean = misses.length === 0 && !revealed;
        map?.mark(iso, 'correct');
        showStamp(iso, 'correct');
        map?.flyTo(iso);
        if (clean) {
          setScore((s) => s + 1);
          setStreak((s) => s + 1);
        } else {
          setStreak(0);
        }
        setSettled(true);
        return;
      }

      map?.mark(iso, 'wrong');
      map?.shake();
      setMisses((m) => (m.includes(iso) ? m : [...m, iso]));
      setStreak(0);

      if (isQuiz) {
        // One guess only. Show where it actually was, so the miss teaches.
        map?.mark(answer, 'answer');
        map?.flyTo(answer);
        showStamp(answer, 'answer');
        setSettled(true);
      } else {
        showStamp(iso, 'wrong');
      }
    },
    [answer, settled, result, reviewing, misses.length, revealed, isQuiz]
  );

  const reveal = useCallback(() => {
    if (!answer || settled || reviewing) return;
    mapRef.current?.mark(answer, 'answer');
    mapRef.current?.flyTo(answer);
    showStamp(answer, 'answer');
    setRevealed(true);
    setSettled(true);
    setStreak(0);
  }, [answer, settled, reviewing]);

  // Space and Enter move the round along without reaching for the mouse.
  useEffect(() => {
    const onKey = (e) => {
      // A focused button already handles Enter and Space itself; handling
      // them again here would skip two questions per keypress.
      const t = e.target;
      if (t instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'BUTTON', 'A'].includes(t.tagName)) return;
      if (e.key === 'Enter' || e.key === ' ') {
        if (reviewing) {
          e.preventDefault();
          goTo(view + 1);
        } else if (settled && !result) {
          e.preventDefault();
          advance();
        }
      } else if (e.key === 'ArrowLeft' && !isQuiz && !result) {
        e.preventDefault();
        goTo(shownIndex - 1);
      } else if (e.key === 'ArrowRight' && reviewing) {
        e.preventDefault();
        goTo(view + 1);
      } else if (e.key.toLowerCase() === 'a' && !isQuiz && !settled && !reviewing) {
        e.preventDefault();
        reveal();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settled, result, advance, reveal, isQuiz, reviewing, view, shownIndex, goTo]);

  const lastMiss = misses.length ? getCountry(misses[misses.length - 1]) : null;
  const history = useMemo(() => (result ? getHistory(key) : []), [result, key]);

  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden landscape:flex-row">
      {/* ---- panel ---------------------------------------------------- */}
      <aside
        className="order-2 flex h-[var(--panel-h)] shrink-0 flex-col border-tide/60 bg-deep transition-[height] duration-300 ease-out portrait:border-t landscape:order-1 landscape:h-full landscape:w-[min(42vw,400px)] landscape:border-r"
        style={{ '--panel-h': expanded ? '68dvh' : '34dvh' }}
      >
        {/* Portrait gets a grab handle: the hook is worth reading and 34% of
            a phone screen is not enough room to do it in. */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? 'Shrink the panel' : 'Expand the panel'}
          className="group grid shrink-0 place-items-center py-1.5 landscape:hidden"
        >
          <span className="h-1 w-10 rounded-full bg-tide transition-colors group-hover:bg-foam" />
        </button>

        <header className="flex shrink-0 items-center gap-2 px-4 pt-1 pb-2 landscape:pt-4">
          <Link
            to="/"
            className="-ml-1 rounded-lg p-1.5 text-foam transition-colors hover:bg-shelf hover:text-chalk"
            aria-label="Leave the round"
          >
            <X size={18} />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] text-foam">
              {isQuiz ? 'Quiz' : 'Training'} — {cat.label.toLowerCase()}, {scopeMeta.label.toLowerCase()}
            </p>
          </div>
        </header>

        <div className="shrink-0 px-4 pb-2">
          <ScoreBadge
            score={score}
            position={result ? total : shownIndex + 1}
            total={total}
            streak={streak}
          />
          {isQuiz || result ? (
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-shelf">
              <motion.div
                className="h-full rounded-full bg-savanna"
                animate={{ width: `${((result ? total : index) / total) * 100}%` }}
                transition={{ type: 'spring', stiffness: 200, damping: 30 }}
              />
            </div>
          ) : (
            // The progress bar doubles as a scrubber in training: drag back to
            // any question already seen. Dragging past the live one just lands
            // on it, so there is no skipping ahead this way.
            <input
              type="range"
              min={1}
              max={total}
              value={shownIndex + 1}
              onChange={(e) => goTo(Number(e.target.value) - 1)}
              aria-label="Jump to a question you have already seen"
              className="mt-2 block h-1 w-full cursor-pointer accent-savanna"
            />
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-2 pb-4">
          {result ? (
            <RoundComplete
              result={result}
              history={history}
              onAgain={restart}
              onChange={() => navigate('/')}
            />
          ) : (
            <div className="space-y-4">
              <Prompt category={category} iso={shown} settled={reviewing || settled} />

              {reviewing && shownLog && (
                <p className="rounded-lg border border-tide/70 bg-shelf/40 px-3 py-2 text-[13px] text-chalk">
                  {REVIEW_NOTE[shownLog.outcome]}
                  {shownLog.misses.length > 0 && ' Wrong taps: '}
                  {shownLog.misses.length > 0 &&
                    shownLog.misses.map((m) => getCountry(m)?.name).join(', ') + '.'}
                </p>
              )}

              <AnimatePresence mode="wait">
                {!settled && !reviewing && lastMiss && (
                  <motion.p
                    key={lastMiss.id}
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="rounded-lg border border-sienna/40 bg-sienna/10 px-3 py-2 text-[13px] text-chalk"
                  >
                    That one is <span className="font-semibold">{lastMiss.name}</span>. Try again.
                  </motion.p>
                )}
              </AnimatePresence>

              {(settled || reviewing) && <CountryCard key={detailTick} iso={shown} />}
            </div>
          )}
        </div>

        {!result && (
          <div className="flex shrink-0 gap-2 border-t border-tide/50 px-4 py-3">
            {!isQuiz && shownIndex > 0 && (
              <Button
                variant="quiet"
                onClick={() => goTo(shownIndex - 1)}
                aria-label="Previous question"
                title="Previous question (left arrow)"
              >
                <ChevronLeft size={18} />
              </Button>
            )}
            {reviewing ? (
              <Button variant="primary" size="lg" className="flex-1" onClick={() => goTo(view + 1)}>
                {view + 1 >= index ? 'Back to where you were' : 'Next'}
                <ChevronRight size={18} />
              </Button>
            ) : settled ? (
              <Button variant="primary" size="lg" className="flex-1" onClick={advance}>
                {index + 1 >= total ? 'Finish round' : 'Next'}
              </Button>
            ) : isQuiz ? (
              <p className="py-2 text-[13px] text-foam">
                One guess. Choose carefully.
              </p>
            ) : (
              <>
                <Button className="flex-1" onClick={reveal}>
                  <Eye size={16} /> Show answer
                </Button>
                <Button
                  variant="quiet"
                  onClick={() => {
                    setStreak(0);
                    advance();
                  }}
                  aria-label="Skip this one"
                >
                  <SkipForward size={16} />
                </Button>
              </>
            )}
          </div>
        )}
      </aside>

      {/* ---- map ------------------------------------------------------- */}
      <main className="relative order-1 min-h-0 flex-1 landscape:order-2">
        <WorldMap
          ref={mapRef}
          basemap={basemap}
          onPick={handlePick}
          onBasemapFallback={onFallback}
          onReady={frame}
          interactive={!settled && !result && !reviewing}
          stamp={stamp}
        />

        <BasemapToggle value={basemap} onChange={setBasemap} />

        {expanded && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="absolute right-3 bottom-3 rounded-full border border-tide bg-deep/90 p-2 text-foam backdrop-blur landscape:hidden"
            aria-label="Shrink the panel"
          >
            <ChevronDown size={18} />
          </button>
        )}
      </main>
    </div>
  );
}
