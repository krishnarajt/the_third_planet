/** Kept in sync by hand with the @theme block in src/index.css. MapLibre
 *  cannot read CSS custom properties, so the two tones the map draws with
 *  have to exist in both places. */
export const C = {
  abyss: '#0b2429',
  land: '#e8dcc0',
  landHover: '#fffaf0',
  coast: '#b9a87e',
  lowland: '#86a95f',
  savanna: '#e0a93b',
  sienna: '#c0562f',
  chalk: '#f4efe3',
};

export const ATLAS_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

/**
 * Below this zoom the atlas draws only its shaded-relief raster, and the
 * vector tiles are left alone.
 *
 * OpenFreeMap serves unclipped planet tiles: 1.5 MB at z2, 780 kB at z4. At
 * world view that is seconds of protobuf decoding per tile to render city
 * labels far too small to read. Raising the minzoom of every layer that uses
 * the vector source stops MapLibre asking for those tiles at all, because it
 * only fetches a source that some visible layer needs. The relief raster
 * underneath is a handful of small PNGs and carries the world view on its
 * own; the detail arrives as you zoom in to where it is actually legible.
 */
export const ATLAS_DETAIL_ZOOM = 3;

/** Applies that floor, and is also where any other trimming of a
 *  third-party style belongs. */
export function lightenAtlas(style) {
  for (const layer of style.layers ?? []) {
    if (layer.source && layer.source !== 'ne2_shaded') {
      layer.minzoom = Math.max(layer.minzoom ?? 0, ATLAS_DETAIL_ZOOM);
    }
  }
  return style;
}

/** The offline basemap: an empty ocean. Everything else is drawn from the
 *  precached borders file by addGameLayers, so this style needs no network,
 *  no glyphs and no sprite. */
export const quizStyle = () => ({
  version: 8,
  sources: {},
  layers: [{ id: 'ocean', type: 'background', paint: { 'background-color': C.abyss } }],
});

const state = (name) => ['boolean', ['feature-state', name], false];
const anyResult = ['any', state('correct'), state('wrong'), state('answer')];

/**
 * On the quiz basemap the country polygons *are* the map, so they are opaque.
 * On the atlas basemap there is a real map underneath worth seeing, so they
 * stay invisible until they have something to say.
 */
export const fillPaint = (basemap) => ({
  'fill-color': [
    'case',
    state('correct'), C.lowland,
    state('wrong'), C.sienna,
    state('answer'), C.savanna,
    state('hover'), basemap === 'atlas' ? C.savanna : C.landHover,
    C.land,
  ],
  'fill-opacity':
    basemap === 'atlas'
      ? ['case', anyResult, 0.6, state('hover'), 0.35, 0]
      : ['case', state('hover'), 1, 1],
  'fill-opacity-transition': { duration: 180 },
  'fill-color-transition': { duration: 180 },
});

export const linePaint = (basemap) => ({
  'line-color': [
    'case',
    state('correct'), C.lowland,
    state('wrong'), C.sienna,
    state('answer'), C.savanna,
    basemap === 'atlas' ? 'rgba(11,36,41,0.35)' : C.coast,
  ],
  // `zoom` is only legal at the top of a step or interpolate, so the zoom
  // ramp has to wrap the feature-state test rather than sit inside it.
  // Nested the other way round MapLibre rejects the whole layer.
  'line-width': [
    'interpolate', ['linear'], ['zoom'],
    0, ['case', anyResult, 1.6, 0.4],
    6, ['case', anyResult, 3, 1.1],
  ],
  'line-opacity': basemap === 'atlas' ? ['case', anyResult, 1, 0.5] : 1,
});

/** Markers stand in for countries too small to tap. They are drawn for every
 *  country and filtered by zoom, so the same layer serves Tuvalu at every
 *  zoom and Belgium only when the map is pulled right out. */
export const pointPaint = () => ({
  'circle-radius': [
    'interpolate', ['linear'], ['zoom'],
    0, ['case', anyResult, 7.5, state('hover'), 6.5, 4.5],
    6, ['case', anyResult, 11, state('hover'), 10, 7],
  ],
  'circle-color': [
    'case',
    state('correct'), C.lowland,
    state('wrong'), C.sienna,
    state('answer'), C.savanna,
    state('hover'), C.landHover,
    C.land,
  ],
  'circle-stroke-width': 1.5,
  'circle-stroke-color': C.abyss,
  'circle-opacity': 0.95,
  'circle-radius-transition': { duration: 160 },
});
