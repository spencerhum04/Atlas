import { useAppStore } from '../store';

/**
 * Minimal toggle button in the top-right corner to switch between
 * Dark Matter (grayscale) and Voyager (colored) tile modes.
 */
export default function TileModeToggle() {
  const tileMode = useAppStore((s) => s.tileMode);
  const setTileMode = useAppStore((s) => s.setTileMode);

  const isDark = tileMode === 'dark';

  return (
    <button
      onClick={() => setTileMode(isDark ? 'voyager' : 'dark')}
      className="
        fixed top-6 right-6 z-20
        flex items-center gap-2.5
        px-4 py-2 rounded-full
        backdrop-blur-xl bg-white/5 border border-white/10
        shadow-[0_4px_16px_rgba(0,0,0,0.3)]
        hover:bg-white/10 hover:border-white/20
        active:scale-95
        transition-all duration-200 ease-out
        cursor-pointer select-none
        text-sm font-medium tracking-wide
      "
      title={isDark ? 'Switch to color mode' : 'Switch to dark mode'}
    >
      {/* Indicator dot */}
      <span
        className={`
          w-2 h-2 rounded-full transition-colors duration-300
          ${isDark ? 'bg-gray-400' : 'bg-cyan-400'}
        `}
      />

      {/* Label */}
      <span className="text-white/70">
        {isDark ? 'Dark' : 'Color'}
      </span>
    </button>
  );
}
