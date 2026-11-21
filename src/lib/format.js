const nf = new Intl.NumberFormat('en');

export function population(n) {
  if (n == null) return null;
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} bn`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)} m`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return nf.format(n);
}

export function area(km2) {
  if (km2 == null) return null;
  return `${nf.format(Math.round(km2))} km²`;
}

export function duration(ms) {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`;
}

export function percent(n) {
  return `${Math.round(n * 100)}%`;
}

/** Short, human, and never "0 days ago". */
export function timeAgo(ts) {
  const diff = Date.now() - ts;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  return new Date(ts).toLocaleDateString('en', { day: 'numeric', month: 'short' });
}

export function money(usd) {
  if (usd == null) return null;
  if (usd >= 1e12) return `$${(usd / 1e12).toFixed(1)} trillion`;
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(usd >= 1e10 ? 0 : 1)} billion`;
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(0)} million`;
  return `$${nf.format(Math.round(usd))}`;
}

export const perCapita = (usd) => (usd == null ? null : `$${nf.format(Math.round(usd))} each`);

/**
 * What one unit of the local currency is worth, phrased whichever way round
 * gives a number a person can hold in their head. A rate of 96 rupees to the
 * dollar is clearer read as "1 US$ = 96", while 1.08 for the euro is clearer
 * the other way.
 */
export function exchange(code, rate) {
  // Quoting the dollar against itself is not information.
  if (!rate || code === 'USD') return null;
  if (rate >= 20) return `1 US$ ≈ ${nf.format(Math.round(rate))} ${code}`;
  const inv = 1 / rate;
  return `1 ${code} ≈ $${inv >= 10 ? inv.toFixed(0) : inv.toFixed(2)}`;
}

/** The time where they are, right now. Intl ships every zone, so this costs
 *  one string per country and no library at all. */
export function localTime(tz) {
  if (!tz) return null;
  try {
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      timeZone: tz,
    }).format(new Date());
  } catch {
    return null; // a zone this browser's Intl does not know
  }
}

/** Area is meaningless as a bare number, so anchor it to something known. */
export function sizeVersus(km2, benchmarks) {
  if (!km2) return null;
  for (const b of benchmarks) {
    const ratio = km2 / b.km2;
    if (ratio >= 1.15 && ratio <= 60) return `about ${ratio < 10 ? ratio.toFixed(1) : Math.round(ratio)}× the size of ${b.name}`;
    if (ratio <= 0.87 && ratio >= 0.02) return `about ${Math.round((1 / ratio) * 10) / 10}× smaller than ${b.name}`;
  }
  return null;
}

/** Enough pluralisation for the handful of division names in the data:
 *  province/canton/state take -s, municipality and county take -ies. */
export function plural(word, n) {
  if (n === 1) return word;
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/.test(word)) return `${word}es`;
  return `${word}s`;
}
