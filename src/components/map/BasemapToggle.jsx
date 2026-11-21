import { useEffect, useState } from 'react';
import { Globe2, Map as MapIcon } from 'lucide-react';

const BASEMAP_KEY = 'ttp_basemap';

const OPTIONS = [
  { id: 'atlas', label: 'Atlas', Icon: Globe2, hint: 'Real cities and roads' },
  { id: 'quiz', label: 'Plain', Icon: MapIcon, hint: 'Shapes only, no names' },
];

/** The chosen basemap, remembered across pages and visits. Shared by the
 *  round screen and the free map so the choice follows the player around. */
export function useBasemap(fallback = 'atlas') {
  const [basemap, setBasemap] = useState(() => localStorage.getItem(BASEMAP_KEY) || fallback);
  useEffect(() => {
    localStorage.setItem(BASEMAP_KEY, basemap);
  }, [basemap]);
  return [basemap, setBasemap];
}

export default function BasemapToggle({ value, onChange }) {
  return (
    <div className="absolute top-3 left-3 flex rounded-xl border border-tide bg-deep/90 p-1 shadow-[0_6px_20px_rgb(0_0_0/.35)] backdrop-blur">
      {OPTIONS.map(({ id, label, Icon, hint }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          title={hint}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold transition-colors ${
            value === id ? 'bg-savanna text-abyss' : 'text-foam hover:text-chalk'
          }`}
        >
          <Icon size={15} />
          {label}
        </button>
      ))}
    </div>
  );
}
