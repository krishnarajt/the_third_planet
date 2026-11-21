import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronDown, Locate, MousePointerClick, X } from 'lucide-react';
import WorldMap from '../components/map/WorldMap';
import BasemapToggle, { useBasemap } from '../components/map/BasemapToggle';
import CountryCard from '../components/panel/CountryCard';
import Button from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { ensureDetail, getScope, scopeBounds } from '../lib/countries';

/**
 * Free mode: no questions, no score. Tap any country and read everything
 * the app knows about it. The scope only decides where the map opens.
 */
export default function Explore() {
  const { scope = 'world' } = useParams();
  const toast = useToast();
  const mapRef = useRef(null);

  const [selected, setSelected] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [basemap, setBasemap] = useBasemap('atlas');
  // Bumped once the lazy-loaded facts/tells arrive, to re-render the card.
  const [detailTick, setDetailTick] = useState(0);

  useEffect(() => {
    ensureDetail().then(() => setDetailTick((t) => t + 1));
  }, []);

  const scopeMeta = getScope(scope);
  const bounds = useMemo(() => scopeBounds(scope, 'flags'), [scope]);

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
  }, [toast, setBasemap]);

  const select = useCallback((iso) => {
    const map = mapRef.current;
    map?.clearMarks();
    map?.mark(iso, 'answer');
    map?.flyTo(iso);
    setSelected(iso);
    // On a phone the card is the point; make room for it.
    setExpanded(true);
  }, []);

  const zoomOut = useCallback(() => {
    mapRef.current?.home(bounds);
  }, [bounds]);

  const clear = useCallback(() => {
    mapRef.current?.clearMarks();
    mapRef.current?.home(bounds);
    setSelected(null);
  }, [bounds]);

  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden landscape:flex-row">
      <aside
        className="order-2 flex h-[var(--panel-h)] shrink-0 flex-col border-tide/60 bg-deep transition-[height] duration-300 ease-out portrait:border-t landscape:order-1 landscape:h-full landscape:w-[min(42vw,400px)] landscape:border-r"
        style={{ '--panel-h': expanded ? '68dvh' : '34dvh' }}
      >
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
            aria-label="Leave the map"
          >
            <X size={18} />
          </Link>
          <p className="min-w-0 flex-1 truncate text-[12px] text-foam">
            Free exploring — {scopeMeta.label.toLowerCase()}
          </p>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-2 pb-4">
          {selected ? (
            <CountryCard key={`${selected}-${detailTick}`} iso={selected} large />
          ) : (
            <div className="flex h-full flex-col items-start justify-center gap-3 py-4">
              <MousePointerClick size={28} className="text-savanna" />
              <p className="font-display text-2xl leading-tight font-extrabold text-summit">
                Tap any country.
              </p>
              <p className="text-[13.5px] leading-relaxed text-foam">
                Its flag, capital, cities, facts and how to spot it from the ground will show up
                here. Tiny islands have a dot on the map once you zoom out far enough.
              </p>
            </div>
          )}
        </div>

        {selected && (
          <div className="flex shrink-0 gap-2 border-t border-tide/50 px-4 py-3">
            <Button className="flex-1" onClick={zoomOut}>
              <Locate size={16} /> Zoom out
            </Button>
            <Button variant="quiet" onClick={clear}>
              Clear
            </Button>
          </div>
        )}
      </aside>

      <main className="relative order-1 min-h-0 flex-1 landscape:order-2">
        <WorldMap
          ref={mapRef}
          basemap={basemap}
          onPick={select}
          onBasemapFallback={onFallback}
          onReady={frame}
          interactive
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
