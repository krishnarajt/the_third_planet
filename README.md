# The Third Planet

Point at the world until you know it.

A geography trainer for countries, flags and capitals. A flag appears, you tap
the country on a zoomable world map, and the app tells you what it was and
gives you a reason to remember it next time. There is no backend, no account
and no network call to anything we run: every country, border, flag and word
of copy is served as a static file, and your scores live in your browser.

It installs as a PWA and works with no connection at all once loaded.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # -> dist/
npm run preview
```

`npm run data` regenerates the geography from the installed packages. You only
need it after bumping `world-countries`, `world-atlas` or `flag-icons`.

## How a round works

A round is one pass through every country in the chosen scope, shuffled.

|            | Training                                    | Quiz                          |
| ---------- | ------------------------------------------- | ----------------------------- |
| Guesses    | Unlimited, and a wrong tap names what you hit | One                           |
| Show answer | Yes                                          | No — revealed after your guess |
| Scoring    | A point for a first-try, unaided hit         | A point for a correct guess    |

Training also lets you walk back through the round: the left arrow (or the
slider under the score) revisits any question you have already seen, showing
the answer card and what you tapped. Past questions are read-only, so going
back can never change the score, and you return to the live question exactly
as you left it. Quiz has no going back.

**Free** is a third way to play with no questions and no score. Pick where
the map opens, then click any country to read its card.

Both modes score the same way on purpose, so a training score and a quiz score
over the same scope are comparable. Categories are flags, countries and
capitals; scopes are the whole world, one region, or the territories pack —
and any scope except territories-only can be played with its dependent
territories folded in, which counts as a different round type.

Scores are kept per round type — `mode:category:scope` — with the last five
runs of each, in `localStorage` under `ttp_scores_v1`. Finishing a round that
beats your previous best raises a toast.

## The map

MapLibre GL, with two basemaps:

- **Atlas** — live vector tiles from [OpenFreeMap](https://openfreemap.org),
  which need no API key. Real cities, roads and labels in local scripts.
- **Plain** — country shapes only, no place names, drawn entirely from a
  GeoJSON file in `public/geo/`. This is also what loads when you are offline,
  so the game never depends on the tile service being up.

Country polygons sit above whichever basemap is active and are driven by
MapLibre feature state for hover, correct, wrong and revealed.

Tuvalu is 26 km², and Natural Earth at 1:50m does not draw it at all. So every
country also gets a point marker, shown only while the country is too small to
tap at the current zoom, and markers take priority over polygons when
resolving a tap. That is the only reason the micro-states are playable.

## Data

Five files under `src/data/`, plus the geometry in `public/geo/`.

| File                 | Written by                  | Contents                                            |
| -------------------- | --------------------------- | --------------------------------------------------- |
| `countries.json`     | `npm run data` — do not edit | Names, capitals, regions, ISO codes, bboxes, centroids, population, GDP, cities, time zone, divisions |
| `hooks.json`         | By hand                     | Flag explanation and a memory hook per country       |
| `facts.json`         | By hand                     | Six more standalone facts per country, four per territory |
| `geoguessr.json`     | By hand                     | Street-level tells: plates, roads, poles, buildings, landscape |
| `scripts.json`       | By hand                     | Alphabet samples and how to recognise each script    |

Under `data/` there is a second tier: reference figures that no npm package
ships, fetched by `npm run reference` and committed so the build stays
offline. Population and GDP come from the World Bank, cities and IANA time
zones from GeoNames, administrative divisions from dr5hn, and a dated
exchange-rate snapshot from er-api. Re-run it when the numbers feel stale,
then `npm run data`.

The exchange rate is deliberately a snapshot, not a live call, and the card
prints the date beside it. Local time, by contrast, is live and free: one
IANA zone string per country plus `Intl.DateTimeFormat` costs nothing and
needs no time zone library.

The generated file and the hand-written ones are kept apart deliberately:
regenerating the geography must never overwrite the prose. They are merged in
`src/lib/countries.js`, which renames the hand-written fields on the way in.

All of them cover the same 250 places — 195 sovereign states plus 55 territories.
Every one has a flag, a capital where it has one, a flag explanation and a
memory hook. The GeoGuessr fields are optional and are `null` wherever there
was no confident answer, which is most of the uninhabited territories.

To add or reword content, edit the hand-written files directly. Nothing needs
rebuilding; they are imported straight into the bundle.

### Sources

- [world-countries](https://github.com/mledoze/countries) — names, capitals, ISO codes, languages, currencies, calling codes
- [world-atlas](https://github.com/topojson/world-atlas) — Natural Earth 1:50m borders
- [flag-icons](https://github.com/lipis/flag-icons) — 4:3 SVG flags, optimised at build time
- [World Bank](https://data.worldbank.org) — population and GDP, refreshed by `npm run reference`. `world-countries` v5 dropped both fields; places the Bank does not report on are filled from `data/population-supplement.json`.
- [GeoNames](https://www.geonames.org) (CC BY 4.0) — largest cities and IANA time zones
- [countries-states-cities-database](https://github.com/dr5hn/countries-states-cities-database) (ODbL) — administrative divisions
- [open.er-api.com](https://open.er-api.com) — exchange rate snapshot

## Things that will bite you

Five problems cost real time here. All are commented at the site of the fix.

**MapLibre's worker is not bundled.** v6 computes its worker URL at runtime
with `new URL('./maplibre-gl-worker.mjs', import.meta.url)`. Vite cannot see
that, never emits the file, and the request falls through the SPA rewrite to
`index.html`. The worker then dies executing HTML — and because GeoJSON is
tiled in the worker, the map renders an empty ocean with no error anywhere.
`vite.config.js` copies the official worker into `public/maplibre/` and
`WorldMap.jsx` points `setWorkerUrl` at it.

**`load` is the wrong event.** `map.on('load')` waits for every source and
sprite the basemap declares. A vector style with one slow source never fires
it, which left the app stuck on its loading message forever. Use `style.load`,
which fires as soon as the style can take layers — and fires again after every
`setStyle`.

**`setStyle` diffs by default.** Switching basemaps patched the style in place,
silently dropping the app's own layers without firing `style.load` to put them
back. Pass `{ diff: false }`.

**Atlas tiles are enormous.** OpenFreeMap serves unclipped planet tiles:
1.5 MB at z2, 780 kB at z4. At world view that is seconds of protobuf
decoding to draw city labels too small to read. `lightenAtlas` raises the
minzoom of every vector layer to 3, so MapLibre asks for no vector tiles at
all until you zoom in — the shaded-relief raster carries the world view.
Zero bytes at world zoom, detail on demand.

**The antimeridian.** Natural Earth splits countries that cross it by inserting
vertices at exactly ±180, leaving consecutive points 360° apart — which
MapLibre draws as a band straight across the world. `scripts/build-data.mjs`
walks each ring carrying an offset so the outline stays continuous; Russia ends
up spanning 19°E to 190°E, which MapLibre wraps correctly. The same problem
affects bounding boxes, so each is measured in both frames and the narrower one
wins, or `fitBounds` on Fiji zooms out to the whole planet.

## Deploying

Vercel, via `.gitea/workflows/deploy.yml` on push to `main`. The repository
needs `VERCEL_TOKEN`, `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` as secrets.
There is nothing else to configure — no backend, no runtime environment
variables. Vercel runs `npm run build` and serves `dist/`.

The service worker precaches about 5.5 MB: the app, all 250 flags and the
borders file. That is the price of the whole thing working on a plane, which
is the reason to install it in the first place. Atlas tiles are cached at
runtime as you visit them.
