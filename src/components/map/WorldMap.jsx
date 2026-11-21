import { useEffect, useImperativeHandle, useRef, useState, forwardRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
// v6 dropped the default export; only named classes are published.
import { Map as MapLibreMap, NavigationControl, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { FEATURE_INDEX, POINT_INDEX, getCountry } from '../../lib/countries';
import {
  ATLAS_STYLE_URL,
  C,
  fillPaint,
  lightenAtlas,
  linePaint,
  pointPaint,
  quizStyle,
} from './mapStyle';

const FILL = 'ttp-fill';
const LINE = 'ttp-line';
const POINTS = 'ttp-points';
const SRC_AREAS = 'ttp-areas';
const SRC_POINTS = 'ttp-marks';

/** How far from a tap a marker still counts as hit. Fingers are wider than
 *  the 6 px dot, and these are the countries hardest to hit to begin with. */
const TAP_SLOP = 14;

const HOME = { center: [12, 22], zoom: 1.4 };

// Points MapLibre at the worker vendored into public/ by the build. See the
// comment on vendorMapLibreWorker in vite.config.js for why this is needed.
setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');

/**
 * The borders, fetched here rather than handed to MapLibre as a URL. A
 * GeoJSON source is loaded inside a blob worker, where a root-relative path
 * has no origin to resolve against and the request is simply never made —
 * the layers exist, the source stays empty, and the map shows bare ocean.
 * Fetching on the main thread also means one download shared by every
 * basemap switch, and a real error to react to when it fails.
 */
let GEO = null;
let geoPromise = null;

function loadGeo() {
  if (!geoPromise) {
    geoPromise = Promise.all([
      fetch('/geo/countries.geojson').then((r) => {
        if (!r.ok) throw new Error(`countries.geojson ${r.status}`);
        return r.json();
      }),
      fetch('/geo/points.geojson').then((r) => {
        if (!r.ok) throw new Error(`points.geojson ${r.status}`);
        return r.json();
      }),
    ]).then(([areas, points]) => {
      GEO = { areas, points };
      return GEO;
    });
  }
  return geoPromise;
}

function addGameLayers(map, basemap) {
  if (!GEO) return false;
  if (!map.getSource(SRC_AREAS)) {
    map.addSource(SRC_AREAS, { type: 'geojson', data: GEO.areas });
  }
  if (!map.getSource(SRC_POINTS)) {
    map.addSource(SRC_POINTS, { type: 'geojson', data: GEO.points });
  }
  if (!map.getLayer(FILL)) {
    map.addLayer({ id: FILL, type: 'fill', source: SRC_AREAS, paint: fillPaint(basemap) });
  }
  if (!map.getLayer(LINE)) {
    map.addLayer({ id: LINE, type: 'line', source: SRC_AREAS, paint: linePaint(basemap) });
  }
  if (!map.getLayer(POINTS)) {
    map.addLayer({
      id: POINTS,
      type: 'circle',
      source: SRC_POINTS,
      filter: ['>', ['get', 'mz'], map.getZoom()],
      paint: pointPaint(),
    });
  }
  return true;
}

function applyPaint(map, basemap) {
  if (map.getLayer(FILL)) {
    const f = fillPaint(basemap);
    map.setPaintProperty(FILL, 'fill-color', f['fill-color']);
    map.setPaintProperty(FILL, 'fill-opacity', f['fill-opacity']);
  }
  if (map.getLayer(LINE)) {
    const l = linePaint(basemap);
    map.setPaintProperty(LINE, 'line-color', l['line-color']);
    map.setPaintProperty(LINE, 'line-width', l['line-width']);
    map.setPaintProperty(LINE, 'line-opacity', l['line-opacity']);
  }
}

/** `diff: false` is essential. By default setStyle diffs the old style
 *  against the new one and patches it in place, which silently drops the
 *  layers this app added and never fires 'style.load' — so nothing puts them
 *  back and the map loses every country. Forcing a full reload guarantees
 *  the event that rebuilds them. */
const SET_STYLE = { diff: false };

async function loadAtlasStyle() {
  const res = await fetch(ATLAS_STYLE_URL, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`atlas style ${res.status}`);
  return lightenAtlas(await res.json());
}

const STAMP_TONE = {
  correct: { ring: C.lowland, text: 'Found it' },
  wrong: { ring: C.sienna, text: 'Missed' },
  answer: { ring: C.savanna, text: 'Here' },
};

/**
 * The world, and everything the game does to it. The game drives this
 * imperatively — mark that one wrong, reveal this one, fly there — because
 * the sequence is the point; expressing it as declarative state would mean
 * rebuilding the whole sequence on every render.
 */
const WorldMap = forwardRef(function WorldMap(
  { basemap = 'atlas', onPick, onBasemapFallback, onReady, interactive = true, stamp = null },
  ref
) {
  const holder = useRef(null);
  const map = useRef(null);
  const marked = useRef(new Map());
  const hovered = useRef(null);
  const basemapRef = useRef(basemap);
  const onPickRef = useRef(onPick);
  const onFallbackRef = useRef(onBasemapFallback);
  const onReadyRef = useRef(onReady);
  const stampRef = useRef(stamp);
  onPickRef.current = onPick;
  onFallbackRef.current = onBasemapFallback;
  onReadyRef.current = onReady;
  stampRef.current = stamp;

  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [stampAt, setStampAt] = useState(null);

  const setState = useCallback((iso, key, on) => {
    const m = map.current;
    if (!m) return;
    const fid = FEATURE_INDEX[iso];
    if (fid !== undefined && m.getSource(SRC_AREAS)) {
      m.setFeatureState({ source: SRC_AREAS, id: fid }, { [key]: on });
    }
    const pid = POINT_INDEX[iso];
    if (pid !== undefined && m.getSource(SRC_POINTS)) {
      m.setFeatureState({ source: SRC_POINTS, id: pid }, { [key]: on });
    }
  }, []);

  // ---- create the map once -------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Atlas tiles are a nicety, not a dependency. Resolving the style up
      // front means a dead network degrades to the offline basemap instead
      // of leaving MapLibre on a blank canvas waiting forever.
      let style = quizStyle();
      let fellBack = false;
      const borders = loadGeo();
      if (basemapRef.current === 'atlas') {
        try {
          style = await loadAtlasStyle();
        } catch {
          fellBack = true;
          basemapRef.current = 'quiz';
        }
      }
      // The borders are the game; without them there is nothing to click, so
      // this is the one fetch worth blocking the map on.
      try {
        await borders;
      } catch {
        if (!cancelled) setFailed(true);
        return;
      }
      if (cancelled || !holder.current) return;

      const m = new MapLibreMap({
        container: holder.current,
        style,
        ...HOME,
        minZoom: 0.8,
        maxZoom: 9,
        // A map you are learning from should never end up tilted or spun.
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        attributionControl: { compact: true },
        // No cross-fade between zoom levels: on a map you are poking at
        // repeatedly, the 300 ms default reads as lag rather than polish.
        fadeDuration: 0,
        // Generous, because the same few views get revisited constantly as
        // rounds fly between countries and back out again.
        maxTileCacheSize: 300,
        refreshExpiredTiles: false,
      });
      m.touchZoomRotate.disableRotation();
      m.addControl(new NavigationControl({ showCompass: false }), 'top-right');
      map.current = m;

      // 'style.load', not 'load'. 'load' waits for every source and sprite
      // the basemap declares to finish, and a vector style with one slow or
      // dead source never fires it at all — which left the app permanently
      // stuck on its loading message. 'style.load' fires as soon as the style
      // is parsed and ready to take layers, which is all this needs, and it
      // fires again after every setStyle.
      m.on('style.load', () => {
        if (cancelled) return;
        addGameLayers(m, basemapRef.current);
        applyPaint(m, basemapRef.current);
        // setStyle discards the layers the app added along with their
        // highlights, so the marks go back on with them.
        for (const [iso, states] of marked.current) {
          for (const [k, v] of Object.entries(states)) setState(iso, k, v);
        }
        setReady(true);
        // The round starts before the map exists, so whoever is driving it
        // only gets to frame the view once there is something to frame.
        onReadyRef.current?.();
        if (fellBack) onFallbackRef.current?.();
      });

      m.on('zoom', () => {
        if (m.getLayer(POINTS)) m.setFilter(POINTS, ['>', ['get', 'mz'], m.getZoom()]);
      });

      // Only re-render React while a stamp is on screen; otherwise this would
      // fire a render for every frame of every pan.
      m.on('move', () => {
        if (!stampRef.current) return;
        const c = getCountry(stampRef.current.iso);
        if (c) setStampAt(m.project(c.centre));
      });
    })();

    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
    // Once. Basemap changes are handled below; rebuilding the map on a toggle
    // would throw away wherever the player had scrolled to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- basemap switching ---------------------------------------------------
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || basemapRef.current === basemap) return;
    let cancelled = false;

    (async () => {
      if (basemap === 'quiz') {
        basemapRef.current = 'quiz';
        m.setStyle(quizStyle(), SET_STYLE);
        return;
      }
      try {
        const style = await loadAtlasStyle();
        if (cancelled) return;
        basemapRef.current = 'atlas';
        m.setStyle(style, SET_STYLE);
      } catch {
        if (!cancelled) onFallbackRef.current?.();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [basemap, ready]);

  // ---- picking -------------------------------------------------------------
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;

    const pickAt = (point) => {
      // Markers win over polygons: a marker exists precisely because the
      // shape under it is tiny or missing, so a tap on one must not resolve
      // to whichever large country happens to sit behind it.
      if (m.getLayer(POINTS)) {
        const box = [
          [point.x - TAP_SLOP, point.y - TAP_SLOP],
          [point.x + TAP_SLOP, point.y + TAP_SLOP],
        ];
        const hits = m.queryRenderedFeatures(box, { layers: [POINTS] });
        if (hits.length) {
          const dist = (f) => {
            const p = m.project(f.geometry.coordinates);
            return (p.x - point.x) ** 2 + (p.y - point.y) ** 2;
          };
          // Nearest to the finger, so clustered island nations stay fair.
          return hits.reduce((a, b) => (dist(b) < dist(a) ? b : a)).properties.iso;
        }
      }
      if (m.getLayer(FILL)) {
        const hits = m.queryRenderedFeatures(point, { layers: [FILL] });
        if (hits.length) return hits[0].properties.iso;
      }
      return null;
    };

    const onClick = (e) => {
      if (!interactive) return;
      const iso = pickAt(e.point);
      if (iso) onPickRef.current?.(iso);
    };

    const onMove = (e) => {
      const iso = interactive ? pickAt(e.point) : null;
      m.getCanvas().style.cursor = iso ? 'pointer' : '';
      if (hovered.current === iso) return;
      if (hovered.current) setState(hovered.current, 'hover', false);
      hovered.current = iso;
      if (iso) setState(iso, 'hover', true);
    };

    const onLeave = () => {
      if (hovered.current) setState(hovered.current, 'hover', false);
      hovered.current = null;
    };

    m.on('click', onClick);
    m.on('mousemove', onMove);
    m.on('mouseout', onLeave);
    return () => {
      m.off('click', onClick);
      m.off('mousemove', onMove);
      m.off('mouseout', onLeave);
    };
  }, [ready, interactive, setState]);

  // Position the stamp the moment it is handed to us, not on the next pan.
  useEffect(() => {
    const m = map.current;
    if (!m || !stamp) {
      setStampAt(null);
      return;
    }
    const c = getCountry(stamp.iso);
    if (c) setStampAt(m.project(c.centre));
  }, [stamp]);

  useImperativeHandle(
    ref,
    () => ({
      mark(iso, key) {
        marked.current.set(iso, { ...(marked.current.get(iso) ?? {}), [key]: true });
        setState(iso, key, true);
      },
      clearMarks() {
        for (const [iso, states] of marked.current) {
          for (const k of Object.keys(states)) setState(iso, k, false);
        }
        marked.current.clear();
      },
      flyTo(iso, opts = {}) {
        const m = map.current;
        const c = getCountry(iso);
        if (!m || !c) return;
        const box = c.fitBbox ?? c.bbox;
        if (!box) {
          m.flyTo({ center: c.centre, zoom: 5, duration: 900, ...opts });
          return;
        }
        m.fitBounds(
          [
            [box[0], box[1]],
            [box[2], box[3]],
          ],
          { padding: 90, maxZoom: 5.5, duration: 900, ...opts }
        );
      },
      /** Back to the view a question should start from: the round's own
       *  corner of the world, or the whole planet when it covers everything. */
      home(bounds, opts = {}) {
        const m = map.current;
        if (!m) return;
        if (!bounds) {
          m.easeTo({ ...HOME, duration: 700, ...opts });
          return;
        }
        m.fitBounds(
          [
            [bounds[0], bounds[1]],
            [bounds[2], bounds[3]],
          ],
          { padding: 40, duration: 700, ...opts }
        );
      },
      shake() {
        holder.current?.animate(
          [
            { transform: 'translateX(0)' },
            { transform: 'translateX(-7px)' },
            { transform: 'translateX(6px)' },
            { transform: 'translateX(-3px)' },
            { transform: 'translateX(0)' },
          ],
          { duration: 320, easing: 'ease-out' }
        );
      },
    }),
    [setState]
  );

  const tone = stamp ? STAMP_TONE[stamp.tone] : null;

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div ref={holder} className="h-full w-full" style={{ background: C.abyss }} />

      {failed ? (
        <div className="absolute inset-0 grid place-items-center px-6 text-center">
          <p className="max-w-xs text-sm text-foam">
            The map data would not load. Reload the page to try again.
          </p>
        </div>
      ) : (
        !ready && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <motion.span
              className="text-sm text-foam"
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1.6, repeat: Infinity }}
            >
              Unrolling the map…
            </motion.span>
          </div>
        )
      )}

      {/* The reward: an inked passport stamp thumping down on the country. */}
      <AnimatePresence>
        {stamp && stampAt && tone && (
          <motion.div
            key={`${stamp.iso}-${stamp.tone}-${stamp.nonce ?? 0}`}
            className="pointer-events-none absolute z-10"
            style={{ left: stampAt.x, top: stampAt.y }}
            initial={{ opacity: 0, scale: 2.1, rotate: -26, x: '-50%', y: '-50%' }}
            animate={{ opacity: 1, scale: 1, rotate: -11, x: '-50%', y: '-50%' }}
            exit={{ opacity: 0, scale: 1.15, rotate: -11, x: '-50%', y: '-50%' }}
            transition={{ type: 'spring', stiffness: 700, damping: 26, mass: 0.7 }}
          >
            <div
              className="rounded-full border-[3px] px-4 py-1.5 text-sm font-bold tracking-wide uppercase"
              style={{
                borderColor: tone.ring,
                color: tone.ring,
                background: 'color-mix(in srgb, #0b2429 55%, transparent)',
                boxShadow: `0 0 0 1px ${tone.ring}33, 0 8px 24px rgb(0 0 0 / .4)`,
              }}
            >
              {tone.text}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

export default WorldMap;
