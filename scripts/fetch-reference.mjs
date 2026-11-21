/**
 * Refreshes the reference data that no npm package ships, and commits the
 * results to data/. Run it by hand — `npm run reference` — when the numbers
 * start to feel old. Everything it writes is small, static and checked in,
 * so `npm run data` and the app itself stay entirely offline.
 *
 * Sources, all free and key-less:
 *   World Bank  population, GDP, GDP per capita
 *   GeoNames    cities over 15,000 people, and their IANA time zones
 *   dr5hn       first-level administrative divisions
 *   er-api      a single exchange-rate snapshot against the US dollar
 *
 * Writes: data/population.json, data/economy.json, data/cities.json,
 *         data/divisions.json, data/fx.json
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const countries = require('world-countries/countries.json');
const A3_TO_A2 = new Map(countries.map((c) => [c.cca3, c.cca2]));
const ALL_A2 = countries.map((c) => c.cca2);

const write = (rel, data) => {
  writeFileSync(join(root, rel), JSON.stringify(data) + '\n');
  console.log(`  ${rel.padEnd(22)} ${(JSON.stringify(data).length / 1024).toFixed(1)} kB`);
};

async function getJSON(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

/** World Bank returns [meta, rows]; mrnev=1 gives the most recent non-empty
 *  year per country, which differs between countries and indicators. */
async function worldBank(indicator) {
  const [, rows] = await getJSON(
    `https://api.worldbank.org/v2/country/all/indicator/${indicator}?format=json&mrnev=1&per_page=400`
  );
  const out = {};
  const years = {};
  for (const r of rows ?? []) {
    if (r.value == null || !r.countryiso3code) continue;
    const a2 = A3_TO_A2.get(r.countryiso3code);
    if (!a2) continue;
    out[a2] = r.value;
    years[a2] = Number(r.date);
  }
  return { values: out, years };
}

console.log('World Bank…');
const pop = await worldBank('SP.POP.TOTL');
const gdp = await worldBank('NY.GDP.MKTP.CD');
const gdpPc = await worldBank('NY.GDP.PCAP.CD');

// Places the World Bank does not report on, kept by hand next door.
const supplement = { ...require(join(root, 'data/population-supplement.json')) };
delete supplement._comment;
const population = { ...pop.values };
for (const [k, v] of Object.entries(supplement)) if (!(k in population)) population[k] = v;

const sorted = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
const commonYear = (years) => {
  const tally = {};
  for (const y of Object.values(years)) tally[y] = (tally[y] ?? 0) + 1;
  return Number(Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0]);
};

write('data/population.json', {
  _source: 'World Bank SP.POP.TOTL, plus data/population-supplement.json for places it does not cover.',
  year: commonYear(pop.years),
  population: sorted(population),
});

write('data/economy.json', {
  _source: 'World Bank NY.GDP.MKTP.CD and NY.GDP.PCAP.CD, current US dollars.',
  year: commonYear(gdp.years),
  gdp: sorted(gdp.values),
  gdpPerCapita: sorted(gdpPc.values),
});

// ---------------------------------------------------------------------------
console.log('GeoNames…');
const tmp = mkdtempSync(join(tmpdir(), 'ttp-geo-'));
try {
  const zip = join(tmp, 'cities15000.zip');
  const buf = Buffer.from(
    await (await fetch('https://download.geonames.org/export/dump/cities15000.zip')).arrayBuffer()
  );
  writeFileSync(zip, buf);
  execFileSync('unzip', ['-o', '-q', zip, '-d', tmp]);

  const TOP = 6;
  const byCountry = {};
  for (const line of readFileSync(join(tmp, 'cities15000.txt'), 'utf8').split('\n')) {
    if (!line) continue;
    const f = line.split('\t');
    const [name, a2, pop, tz] = [f[1], f[8], Number(f[14]), f[17]];
    if (!a2 || !name || !pop) continue;
    (byCountry[a2] ??= []).push({ name, pop, tz, fcode: f[7] });
  }

  const cities = {};
  for (const [a2, list] of Object.entries(byCountry)) {
    list.sort((x, y) => y.pop - x.pop);
    // PPLC is GeoNames' code for a national capital. Its zone beats the
    // biggest city's, which in a wide country can be hours away.
    const capital = list.find((c) => c.fcode === 'PPLC');
    cities[a2] = {
      tz: (capital ?? list[0]).tz || null,
      top: list.slice(0, TOP).map((c) => ({ name: c.name, pop: c.pop })),
    };
  }
  write('data/cities.json', {
    _source: 'GeoNames cities15000 (CC BY 4.0). Largest settlements over 15,000 people, and the time zone of the capital.',
    cities: sorted(cities),
  });
  console.log(`  no city data for: ${ALL_A2.filter((a) => !cities[a]).join(', ') || 'none'}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
console.log('Administrative divisions…');
const states = await getJSON(
  'https://cdn.jsdelivr.net/gh/dr5hn/countries-states-cities-database@master/json/states.json'
);
const divisions = {};
for (const s of states) {
  const a2 = s.country_code;
  if (!a2) continue;
  (divisions[a2] ??= { count: 0, types: {} }).count++;
  const t = (s.type || 'division').toLowerCase();
  divisions[a2].types[t] = (divisions[a2].types[t] ?? 0) + 1;
}
// Collapse to the commonest label — but only claim it when it actually
// covers the country. The United States lists 60 first-level entries mixing
// states, a district and territories, and calling all 60 "states" is wrong.
for (const [a2, d] of Object.entries(divisions)) {
  const [type, n] = Object.entries(d.types).sort((a, b) => b[1] - a[1])[0];
  divisions[a2] = { count: d.count, type: n / d.count >= 0.8 ? type : null };
}
write('data/divisions.json', {
  _source: 'dr5hn/countries-states-cities-database (ODbL). First-level administrative divisions.',
  divisions: sorted(divisions),
});

// ---------------------------------------------------------------------------
console.log('Exchange rates…');
const fx = await getJSON('https://open.er-api.com/v6/latest/USD');
if (fx.result !== 'success') throw new Error('exchange rate fetch failed');
write('data/fx.json', {
  _source: 'open.er-api.com, mid-market rates against the US dollar. A snapshot, not live — the app states the date.',
  date: fx.time_last_update_utc.slice(5, 16),
  base: 'USD',
  rates: sorted(fx.rates),
});

console.log('\nDone. Run `npm run data` to fold these into src/data/countries.json.');
