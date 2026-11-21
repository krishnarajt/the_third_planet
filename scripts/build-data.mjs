/**
 * Bakes every byte of game data into the repo so the app never talks to a
 * backend at runtime. Run with `npm run data` after bumping a source package.
 *
 * Three sources, joined on ISO codes:
 *   world-countries  -> names, capitals, regions, currencies, ISO cross-walk
 *   world-atlas      -> Natural Earth 1:50m borders, keyed by numeric ISO
 *   flag-icons       -> 4:3 SVG flags, keyed by lowercase alpha-2
 *   data/*.json      -> committed reference data that no package ships:
 *                       population, GDP, cities, time zones, admin divisions.
 *                       Refresh with `npm run reference`.
 *
 * Outputs (all committed, all served as static files):
 *   src/data/countries.json     metadata the panel renders
 *   public/geo/countries.geojson  polygons, keyed by alpha-2
 *   public/geo/points.geojson     one centroid per country, the click target
 *                                 for anything too small to hit as a polygon
 *   public/flags/<a2>.svg       optimised flags
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { feature } from 'topojson-client';
import { optimize } from 'svgo';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const req = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

const countries = req('node_modules/world-countries/countries.json');
const topo = req('node_modules/world-atlas/countries-50m.json');
const flagDir = join(root, 'node_modules/flag-icons/flags/4x3');
const { year: popYear, population: POP } = req('data/population.json');
const { year: gdpYear, gdp: GDP, gdpPerCapita: GDP_PC } = req('data/economy.json');
const { cities: CITIES } = req('data/cities.json');
const { divisions: DIVISIONS } = req('data/divisions.json');

/** Vatican and Palestine are UN observers, not members, but every geography
 *  quiz counts them. That is the whole difference between 193 and 195. */
const OBSERVERS = new Set(['VA', 'PS']);
const isCore = (c) => c.unMember || OBSERVERS.has(c.cca2);

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

const byNumeric = new Map(countries.map((c) => [String(Number(c.ccn3)), c]));
const fc = feature(topo, topo.objects.countries);

/** 3 decimal places is ~110 m at the equator: far finer than 1:50m source data
 *  actually resolves, and it cuts the served GeoJSON by more than half. */
const round = (n) => Math.round(n * 1e3) / 1e3;

function roundRing(ring) {
  const out = [];
  for (const [x, y] of ring) {
    const p = [round(x), round(y)];
    // Rounding collapses neighbouring vertices; dropping the duplicates keeps
    // the ring valid instead of leaving zero-length segments behind.
    const prev = out[out.length - 1];
    if (!prev || prev[0] !== p[0] || prev[1] !== p[1]) out.push(p);
  }
  // A ring needs 4 positions with the first repeated at the end to stay closed.
  if (out.length >= 3) {
    const [f, l] = [out[0], out[out.length - 1]];
    if (f[0] !== l[0] || f[1] !== l[1]) out.push([f[0], f[1]]);
  }
  return out.length >= 4 ? out : null;
}

/**
 * Natural Earth splits a country that crosses the antimeridian by inserting
 * vertices at exactly -180 and +180, which leaves two consecutive points 360
 * degrees apart. MapLibre draws that as a band straight across the world —
 * it is what put a stripe through the North Pacific and a wedge in the North
 * Atlantic. Carrying an offset along the ring restores one continuous
 * outline: Russia comes out spanning 19 to 190, which MapLibre wraps
 * correctly, and Fiji likewise.
 */
function unwrapRing(ring) {
  const out = [[ring[0][0], ring[0][1]]];
  let offset = 0;
  for (let i = 1; i < ring.length; i++) {
    const d = ring[i][0] - ring[i - 1][0];
    if (d > 180) offset -= 360;
    else if (d < -180) offset += 360;
    out.push([round(ring[i][0] + offset), ring[i][1]]);
  }
  return out;
}

/** A ring whose ends sit a full turn apart does not close: it wraps the
 *  globe, which is how Natural Earth draws Antarctica's edge along the pole.
 *  There is no sane way to fill that, so the ring goes. */
const encirclesPole = (ring) => Math.abs(ring[ring.length - 1][0] - ring[0][0]) > 180;

function cleanPoly(poly) {
  const rings = [];
  for (const raw of poly) {
    const rounded = roundRing(raw);
    if (!rounded) continue;
    const ring = unwrapRing(rounded);
    if (encirclesPole(ring)) {
      // Losing the exterior ring loses the polygon; losing a hole is fine.
      if (rings.length === 0) return null;
      continue;
    }
    rings.push(ring);
  }
  return rings.length ? rings : null;
}

function roundGeometry(geom) {
  if (geom.type === 'Polygon') {
    const rings = cleanPoly(geom.coordinates);
    return rings ? { type: 'Polygon', coordinates: rings } : null;
  }
  const polys = geom.coordinates.map(cleanPoly).filter(Boolean);
  return polys.length ? { type: 'MultiPolygon', coordinates: polys } : null;
}

/**
 * Russia, Fiji and the US all straddle the antimeridian, where a naive bbox
 * spans the entire globe and `fitBounds` zooms out to nothing. Measuring the
 * same country again on a 0..360 axis and keeping whichever span is narrower
 * fixes them; MapLibre accepts the resulting east edge past 180.
 *
 * The 1 degree margin matters: for a country that does *not* cross the line
 * both frames are the same width apart from floating-point noise in `x + 360`,
 * and without it that noise flips Brazil into the 0..360 frame at random.
 */
function bboxOfPolys(polys) {
  let w = 180, s = 90, e = -180, n = -90;
  let w2 = 360, e2 = 0;
  for (const poly of polys) {
    for (const ring of poly) {
      for (const [x, y] of ring) {
        if (x < w) w = x;
        if (x > e) e = x;
        if (y < s) s = y;
        if (y > n) n = y;
        const x2 = x < 0 ? x + 360 : x;
        if (x2 < w2) w2 = x2;
        if (x2 > e2) e2 = x2;
      }
    }
  }
  return e - w - (e2 - w2) > 1
    ? [round(w2), round(s), round(e2), round(n)]
    : [round(w), round(s), round(e), round(n)];
}

/** Relative size only, used to rank a country's islands against each other.
 *  Shoelace in square degrees, flattened by latitude so Greenland-scale
 *  distortion does not outrank a genuinely bigger tropical landmass. */
function polyArea(poly) {
  const ring = poly[0];
  let a = 0;
  let latSum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
    latSum += ring[i][1];
  }
  return Math.abs(a / 2) * Math.cos(((latSum / ring.length) * Math.PI) / 180);
}

/**
 * The bbox worth flying to. The full bbox of Portugal reaches the Azores and
 * of the US the Aleutians, so "show answer" would frame mostly ocean. Taking
 * the largest landmasses that together make up 90% of the country drops the
 * far-flung specks while keeping anything a learner would call part of it.
 */
function fitBboxOfPolys(polys) {
  if (polys.length === 1) return bboxOfPolys(polys);
  const ranked = polys.map((p) => ({ p, a: polyArea(p) })).sort((x, y) => y.a - x.a);
  const total = ranked.reduce((sum, r) => sum + r.a, 0);
  const keep = [];
  let acc = 0;
  for (const r of ranked) {
    keep.push(r.p);
    acc += r.a;
    if (acc >= total * 0.8) break;
  }
  return bboxOfPolys(keep);
}

const polysByA2 = new Map();
for (const f of fc.features) {
  const meta = byNumeric.get(String(Number(f.id)));
  // Natural Earth carries disputed areas (Kosovo, Somaliland, N. Cyprus) under
  // id -99. They have no ISO number, so the join drops them on purpose.
  if (!meta || !f.geometry) continue;
  const geom = roundGeometry(f.geometry);
  if (!geom) continue;
  const list = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  // A few countries arrive as more than one feature — Australia ships its
  // Ashmore and Cartier islets separately. Merging rather than assigning is
  // what stops a 2 km speck from replacing the mainland.
  const prev = polysByA2.get(meta.cca2);
  if (prev) prev.push(...list);
  else polysByA2.set(meta.cca2, list);
}

// ---------------------------------------------------------------------------
// Metadata + point layer
// ---------------------------------------------------------------------------

/**
 * Zoom at which this country finally covers enough pixels to tap. Below it the
 * app draws a marker instead, which is the only way Tuvalu, Malta or Singapore
 * are ever hittable. ~24 px of the ~512 px Web Mercator world tile is the bar.
 */
function markerZoom(bbox, hasPolygon) {
  if (!hasPolygon) return 22; // no shape at all: the marker is the country
  const [w, s, e, n] = bbox;
  const midLat = ((s + n) / 2) * (Math.PI / 180);
  const span = Math.max((e - w) * Math.cos(midLat), n - s);
  if (span <= 0) return 22;
  return Math.max(0, Math.round(Math.log2((24 * 360) / (512 * span)) * 100) / 100);
}

const meta = [];
const points = [];
const polygons = [];

for (const c of countries.sort((a, b) => a.name.common.localeCompare(b.name.common))) {
  const a2 = c.cca2;
  const polys = polysByA2.get(a2) ?? null;
  const geom = polys
    ? polys.length === 1
      ? { type: 'Polygon', coordinates: polys[0] }
      : { type: 'MultiPolygon', coordinates: polys }
    : null;
  const bbox = polys ? bboxOfPolys(polys) : null;
  const fitBbox = polys ? fitBboxOfPolys(polys) : null;

  // The marker goes on the country's nominal centroid rather than the middle
  // of its bbox: for the US, Portugal or Ecuador the bbox centre is open
  // ocean, because outlying islands drag it off the landmass.
  const [lat, lng] = c.latlng ?? c.capitalInfo?.latlng ?? [0, 0];
  // A dateline country's bbox is measured on the 0..360 axis, so the centroid
  // has to be offered in both frames or the US fails a test it should pass.
  const inBbox =
    bbox &&
    lat >= bbox[1] &&
    lat <= bbox[3] &&
    ((lng >= bbox[0] && lng <= bbox[2]) || (lng + 360 >= bbox[0] && lng + 360 <= bbox[2]));
  const centre = inBbox || !fitBbox
    ? [round(lng), round(lat)]
    : [round((fitBbox[0] + fitBbox[2]) / 2), round((fitBbox[1] + fitBbox[3]) / 2)];

  const record = {
    id: a2,
    a3: c.cca3,
    name: c.name.common,
    official: c.name.official,
    capital: c.capital?.[0] ?? null,
    capitals: c.capital ?? [],
    region: c.region || 'Other',
    subregion: c.subregion || null,
    core: isCore(c),
    population: POP[a2] ?? null,
    gdp: GDP[a2] ?? null,
    gdpPerCapita: GDP_PC[a2] ?? null,
    // Largest settlements, and the capital's zone so the app can show what
    // time it is there right now without shipping a time zone database.
    cities: CITIES[a2]?.top ?? [],
    tz: CITIES[a2]?.tz ?? null,
    divisions: DIVISIONS[a2] ?? null,
    area: c.area ?? null,
    languages: Object.values(c.languages ?? {}),
    currencies: Object.entries(c.currencies ?? {}).map(([code, v]) => ({
      code,
      name: v.name,
      symbol: v.symbol ?? null,
    })),
    borders: c.borders ?? [],
    landlocked: !!c.landlocked,
    tld: c.tld?.[0] ?? null,
    tlds: c.tld ?? [],
    // Canada and the US share +1 across dozens of area codes, so a single
    // suffix is worth appending and a list of them is not.
    phone:
      c.idd?.root && c.idd.suffixes?.length === 1
        ? `${c.idd.root}${c.idd.suffixes[0]}`
        : (c.idd?.root || null),
    centre,
    bbox,
    fitBbox,
    hasShape: !!geom,
  };
  meta.push(record);

  // Sized off the main landmass, not the full bbox: otherwise a country with
  // one remote island reads as huge and never gets the marker it needs.
  const mz = markerZoom(fitBbox ?? [centre[0], centre[1], centre[0], centre[1]], !!geom);
  points.push({
    type: 'Feature',
    id: a2,
    // MapLibre feature ids must be numeric or numeric strings for feature-state
    // to work, so the ISO code travels in properties and the index is the id.
    properties: { iso: a2, name: record.name, core: record.core ? 1 : 0, mz },
    geometry: { type: 'Point', coordinates: centre },
  });

  if (geom) {
    polygons.push({
      type: 'Feature',
      properties: { iso: a2, name: record.name, core: record.core ? 1 : 0 },
      geometry: geom,
    });
  }
}

// feature-state needs integer ids, so hand each feature its array index and
// keep an iso -> index map on the side for lookups from game code.
const featureIndex = {};
polygons.forEach((f, i) => {
  f.id = i;
  featureIndex[f.properties.iso] = i;
});
points.forEach((f, i) => {
  f.id = i;
});
const pointIndex = {};
points.forEach((f, i) => {
  pointIndex[f.properties.iso] = i;
});

// ---------------------------------------------------------------------------
// Flags
// ---------------------------------------------------------------------------

const outFlags = join(root, 'public/flags');
rmSync(outFlags, { recursive: true, force: true });
mkdirSync(outFlags, { recursive: true });

const available = new Set(readdirSync(flagDir).map((f) => f.replace('.svg', '')));
let before = 0;
let after = 0;
let missing = [];

for (const c of meta) {
  const key = c.id.toLowerCase();
  if (!available.has(key)) {
    missing.push(c.id);
    continue;
  }
  const raw = readFileSync(join(flagDir, `${key}.svg`), 'utf8');
  const res = optimize(raw, {
    multipass: true,
    plugins: [
      {
        name: 'preset-default',
        params: {
          overrides: {
            // The flags are drawn to the viewBox and displayed at many sizes;
            // dropping it would pin them to their authored pixel dimensions.
            removeViewBox: false,
            // Several flags (Mexico, Serbia) rely on overlapping fills whose
            // precision matters at the 320 px the panel renders them at.
            convertPathData: { floatPrecision: 2 },
            cleanupNumericValues: { floatPrecision: 2 },
          },
        },
      },
      'removeDimensions',
    ],
  });
  before += Buffer.byteLength(raw);
  after += Buffer.byteLength(res.data);
  writeFileSync(join(outFlags, `${key}.svg`), res.data);
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

const write = (p, data) => {
  const full = join(root, p);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, JSON.stringify(data));
  return Buffer.byteLength(JSON.stringify(data));
};

const sizes = {
  'src/data/countries.json': write('src/data/countries.json', {
    generated: new Date().toISOString().slice(0, 10),
    populationYear: popYear,
    gdpYear,
    featureIndex,
    pointIndex,
    countries: meta,
  }),
  'public/geo/countries.geojson': write('public/geo/countries.geojson', {
    type: 'FeatureCollection',
    features: polygons,
  }),
  'public/geo/points.geojson': write('public/geo/points.geojson', {
    type: 'FeatureCollection',
    features: points,
  }),
};

const kb = (n) => `${(n / 1024).toFixed(0)} kB`;
console.log(`countries      ${meta.length} (${meta.filter((c) => c.core).length} core, ${meta.filter((c) => !c.core).length} territories)`);
console.log(`polygons       ${polygons.length}`);
console.log(`no shape       ${meta.filter((c) => !c.hasShape).map((c) => c.id).join(', ') || 'none'}`);
console.log(`flags          ${meta.length - missing.length} written, ${kb(before)} -> ${kb(after)}`);
if (missing.length) console.log(`flags missing  ${missing.join(', ')}`);
for (const [k, v] of Object.entries(sizes)) console.log(`${k.padEnd(30)} ${kb(v)}`);
