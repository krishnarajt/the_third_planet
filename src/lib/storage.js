/**
 * Score history, kept entirely in localStorage — there is no account and no
 * server to sync to. Anything in here survives a reload and nothing else does.
 */

const KEY = 'ttp_scores_v1';
const KEEP = 5; // the app promises "your last five", so store exactly five

/** A round type is the combination the player chose, so quiz flags in Europe
 *  keeps a separate history from training capitals worldwide. */
export const roundKey = (mode, category, scope) => `${mode}:${category}:${scope}`;

export function parseRoundKey(key) {
  const [mode, category, scope] = key.split(':');
  return { mode, category, scope };
}

function readAll() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    // Private mode, disabled storage, or something else wrote nonsense here.
    // Losing history is survivable; crashing the app over it is not.
    return {};
  }
}

function writeAll(all) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* quota or private mode — the round still finished, it just is not saved */
  }
}

export function getHistory(key) {
  const entry = readAll()[key];
  return Array.isArray(entry?.runs) ? entry.runs : [];
}

export function getBest(key) {
  const runs = getHistory(key);
  if (!runs.length) return null;
  return runs.reduce((a, b) => (accuracy(b) > accuracy(a) ? b : a));
}

export const accuracy = (run) => (run.total ? run.score / run.total : 0);

/** Everything the scores screen needs, without it having to know the shape. */
export function getAllHistories() {
  const all = readAll();
  return Object.entries(all)
    .map(([key, entry]) => ({
      key,
      ...parseRoundKey(key),
      runs: Array.isArray(entry?.runs) ? entry.runs : [],
    }))
    .filter((h) => h.runs.length)
    .sort((a, b) => (b.runs[0]?.at ?? 0) - (a.runs[0]?.at ?? 0));
}

/**
 * Files a finished round and reports how it compares to what came before, so
 * the caller can celebrate without having to re-read storage to find out.
 */
export function saveRun(key, run) {
  const all = readAll();
  const prev = Array.isArray(all[key]?.runs) ? all[key].runs : [];
  const prevBest = prev.length ? prev.reduce((a, b) => (accuracy(b) > accuracy(a) ? b : a)) : null;

  const entry = { ...run, at: Date.now() };
  // Newest first, so "your last five" reads top-down in the order played.
  all[key] = { runs: [entry, ...prev].slice(0, KEEP) };
  writeAll(all);

  const isFirst = !prevBest;
  const beat = prevBest ? accuracy(entry) > accuracy(prevBest) : false;
  const matched = prevBest ? accuracy(entry) === accuracy(prevBest) && !beat : false;

  return { entry, prevBest, isFirst, isBest: isFirst || beat, matchedBest: matched };
}

export function clearAll() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to do: if it cannot be written it cannot be cleared either */
  }
}
