import { motion } from 'framer-motion';
import { flagSrc, getCategory, getCountry } from '../../lib/countries';

/**
 * The question. A flag gets the full width of the panel because reading the
 * detail on it — the crest, the script, the shade of red — is the exercise.
 */
export default function Prompt({ category, iso, settled }) {
  const cat = getCategory(category);
  const c = getCountry(iso);
  if (!c) return null;

  return (
    <div>
      <p className="mb-2 text-[13px] text-foam">{cat.prompt}</p>

      {category === 'flags' ? (
        <motion.img
          key={iso}
          src={flagSrc(iso)}
          alt="Flag to identify"
          width={640}
          height={480}
          initial={{ opacity: 0, rotateY: -70, scale: 0.9 }}
          animate={{ opacity: 1, rotateY: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          style={{ transformPerspective: 900 }}
          // Sized by height, not width. Full-width in the portrait panel makes
          // a 4:3 flag taller than the panel itself, pushing everything below
          // it off screen.
          className="w-auto max-h-[15dvh] rounded-md border border-tide/70 bg-shelf object-contain shadow-[0_10px_30px_rgb(0_0_0/.45)] landscape:max-h-[34vh] landscape:w-full"
        />
      ) : (
        <motion.p
          key={iso}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 26 }}
          className="font-display text-[clamp(1.75rem,4.5vw,2.5rem)] leading-[1.1] font-extrabold text-summit"
        >
          {category === 'capitals' ? c.capital : c.name}
        </motion.p>
      )}

      {!settled && (
        <p className="mt-2 text-[13px] text-foam">
          {category === 'capitals'
            ? 'Tap the country it belongs to.'
            : 'Tap it on the map.'}
        </p>
      )}
    </div>
  );
}
