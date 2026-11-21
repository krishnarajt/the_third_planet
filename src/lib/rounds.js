import { poolFor, getCountry } from './countries';

/** Fisher-Yates on a copy. Every round is a fresh shuffle of the whole pool,
 *  because a round is defined as going through all of them exactly once. */
export function shuffle(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function buildRound({ category, scope }) {
  return shuffle(poolFor(scope, category).map((c) => c.id));
}

/** What the panel shows as the question, per category. */
export function promptFor(category, iso) {
  const c = getCountry(iso);
  if (!c) return null;
  if (category === 'flags') return { kind: 'flag', iso };
  if (category === 'capitals') return { kind: 'text', text: c.capital, label: 'Capital city' };
  return { kind: 'text', text: c.name, label: 'Country' };
}

export const INITIAL = {
  index: 0,
  score: 0,
  wrongPicks: [],
  revealed: false,
  /** Set once the current question is finished with, right or wrong. In quiz
   *  mode that happens on the first click; in training only on a correct
   *  answer or "show answer". */
  settled: false,
  startedAt: 0,
};
