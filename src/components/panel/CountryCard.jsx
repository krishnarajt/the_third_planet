import { motion } from 'framer-motion';
import { FX, getCountry, flagSrc, getScript, BY_ID } from '../../lib/countries';
import {
  area,
  exchange,
  localTime,
  money,
  perCapita,
  plural,
  population,
  sizeVersus,
} from '../../lib/format';

/** Yardsticks for the size comparison, largest first so the first match is
 *  the closest in scale rather than an absurd multiple of Luxembourg. */
const YARDSTICKS = [
  { name: 'Russia', km2: 17098242 },
  { name: 'Brazil', km2: 8515767 },
  { name: 'India', km2: 3287590 },
  { name: 'Egypt', km2: 1002450 },
  { name: 'France', km2: 551695 },
  { name: 'the United Kingdom', km2: 242900 },
  { name: 'Portugal', km2: 92090 },
  { name: 'Belgium', km2: 30528 },
  { name: 'Luxembourg', km2: 2586 },
];

function Row({ label, children }) {
  if (!children) return null;
  return (
    <div className="flex gap-3 py-1.5 text-[13px] leading-snug">
      <dt className="w-24 shrink-0 text-foam">{label}</dt>
      <dd className="min-w-0 text-chalk">{children}</dd>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section>
      <h3 className="mb-1.5 text-[13px] font-semibold text-savanna">{title}</h3>
      {children}
    </section>
  );
}

/** One writing system: the letters themselves, plus a description of their
 *  shape — which is what still works when the device has no font for them. */
function ScriptBlock({ id }) {
  const s = getScript(id);
  if (!s) return null;
  return (
    <div className="rounded-lg border border-tide/60 bg-shelf/30 px-3 py-2.5">
      <p className="text-[13px] font-semibold text-chalk">{s.name}</p>
      <p className="glyphs mt-1.5 text-summit">{s.sample}</p>
      <p className="mt-1.5 text-[12.5px] leading-snug text-foam">{s.look}</p>
    </div>
  );
}

/**
 * Everything worth knowing about one country, shown once the answer is out.
 * Ordered by what actually teaches: the flag's story and the memory hook
 * first, then how you would recognise the place from a photo, then the
 * reference numbers that are only useful once you already care.
 */
export default function CountryCard({ iso, large = false }) {
  const c = getCountry(iso);
  if (!c) return null;

  const neighbours = c.borders
    .map((a3) => [...BY_ID.values()].find((x) => x.a3 === a3))
    .filter(Boolean);

  const now = localTime(c.tz);
  const rate = c.currencies[0] ? exchange(c.currencies[0].code, FX.rates[c.currencies[0].code]) : null;
  const versus = sizeVersus(c.area, YARDSTICKS);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className="space-y-4"
    >
      {large ? (
        <div className="space-y-3">
          {/* Free mode: the flag is the thing you came to look at, so it gets
              the width of the panel, capped by height so a tall flag cannot
              push the rest of the card off a phone screen. */}
          <img
            src={flagSrc(c.id)}
            alt={`Flag of ${c.name}`}
            width={640}
            height={480}
            className="max-h-[24dvh] w-auto max-w-full rounded-md border border-tide/70 bg-shelf object-contain shadow-[0_10px_30px_rgb(0_0_0/.45)] landscape:max-h-[30vh] landscape:w-full"
          />
          <div>
            <h2 className="font-display text-[26px] leading-[1.1] font-extrabold text-chalk">{c.name}</h2>
            {c.official !== c.name && (
              <p className="mt-0.5 text-[12px] leading-snug text-foam">{c.official}</p>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3">
          <img
            src={flagSrc(c.id)}
            alt=""
            width={72}
            height={54}
            className="w-[72px] shrink-0 rounded-[3px] border border-tide/70 bg-shelf shadow-[0_3px_10px_rgb(0_0_0/.4)]"
          />
          <div className="min-w-0">
            <h2 className="font-display text-[22px] leading-[1.15] font-bold text-chalk">{c.name}</h2>
            {c.official !== c.name && (
              <p className="mt-0.5 text-[12px] leading-snug text-foam">{c.official}</p>
            )}
          </div>
        </div>
      )}

      {c.capital && (
        <div className="titleblock rounded-lg px-3 py-2.5">
          <p className="text-[13px] text-foam">Capital</p>
          <p className="font-display text-lg font-semibold text-summit">{c.capitals.join(' · ')}</p>
          {c.capitalNote && (
            <p className="mt-1 text-[12.5px] leading-snug text-foam">{c.capitalNote}</p>
          )}
        </div>
      )}

      {c.flagStory && (
        <Section title="Reading the flag">
          <p className="text-[14px] leading-relaxed text-chalk/90">{c.flagStory}</p>
        </Section>
      )}

      {c.hook && (
        <Section title="Remember it by">
          {/* Set in the italic serif atlases reserve for water features —
              the one place in the app that gets a different voice. */}
          <p className="hook">{c.hook}</p>
        </Section>
      )}

      {c.facts.length > 0 && (
        <Section title="Also true">
          <ul className="space-y-1.5">
            {c.facts.map((f) => (
              <li key={f} className="flex gap-2 text-[13.5px] leading-relaxed text-chalk/90">
                <span aria-hidden className="mt-[7px] size-1.5 shrink-0 rounded-full bg-tide" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {c.scripts.length > 0 && (
        <Section title={c.scripts.length > 1 ? 'Scripts you will see' : 'Script you will see'}>
          <div className="space-y-2">
            {c.scripts.map((id) => (
              <ScriptBlock key={id} id={id} />
            ))}
          </div>
        </Section>
      )}

      {c.tells.length > 0 && (
        <Section title="Spotting it from the ground">
          <dl className="space-y-2">
            {c.tells.map(([label, text]) => (
              <div key={label}>
                <dt className="text-[12.5px] font-semibold text-foam">{label}</dt>
                <dd className="text-[13.5px] leading-relaxed text-chalk/90">{text}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}

      {c.cities.length > 0 && (
        <Section title="Biggest cities">
          <ol className="space-y-1">
            {c.cities.map((city, i) => (
              <li key={city.name} className="flex items-baseline gap-2 text-[13.5px]">
                <span className="w-4 shrink-0 text-right text-foam tabular">{i + 1}</span>
                <span className="text-chalk">{city.name}</span>
                <span className="ml-auto text-[12.5px] text-foam tabular">{population(city.pop)}</span>
              </li>
            ))}
          </ol>
        </Section>
      )}

      <dl className="border-t border-tide/50 pt-2">
        <Row label="Region">{c.subregion ?? c.region}</Row>
        <Row label="Population">{population(c.population)}</Row>
        <Row label="Area">
          {area(c.area)}
          {versus && <span className="block text-foam">{versus}</span>}
        </Row>
        <Row label="Economy">
          {money(c.gdp)}
          {c.gdpPerCapita && <span className="block text-foam">{perCapita(c.gdpPerCapita)}</span>}
        </Row>
        <Row label="Divisions">
          {c.divisions
            ? `${c.divisions.count} ${
                c.divisions.type
                  ? plural(c.divisions.type, c.divisions.count)
                  : 'first-level divisions'
              }`
            : null}
        </Row>
        <Row label="Time there">
          {now}
          {now && <span className="block text-foam">{c.tz.replace(/_/g, ' ')}</span>}
        </Row>
        <Row label="Languages">{c.languages.join(', ') || null}</Row>
        <Row label="Money">
          {c.currencies.map((m) => `${m.name}${m.symbol ? ` (${m.symbol})` : ''}`).join(', ') || null}
          {rate && (
            <span className="block text-foam">
              {rate} <span className="opacity-70">· {FX.date}</span>
            </span>
          )}
        </Row>
        <Row label="Dialling">{c.phone}</Row>
        <Row label="Domain">{c.tlds.join(' · ') || null}</Row>
        <Row label="Neighbours">
          {neighbours.length
            ? neighbours.map((n) => n.name).join(', ')
            : c.landlocked
              ? null
              : 'None — an island'}
        </Row>
        <Row label="Landlocked">{c.landlocked ? 'Yes, no coast at all' : null}</Row>
      </dl>
    </motion.div>
  );
}
