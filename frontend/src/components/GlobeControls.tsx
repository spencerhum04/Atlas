import { Moon, Sun, Tags, Type } from 'lucide-react';
import { useAppStore } from '../store';

const btnStyle: React.CSSProperties = {
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  background: 'rgba(0, 0, 0, 0.45)',
  border: '1px solid rgba(255, 255, 255, 0.12)',
  boxShadow: '0 2px 12px rgba(0, 0, 0, 0.4)',
  fontFamily: "'Plus Jakarta Sans', sans-serif",
};

export default function GlobeControls() {
  const tileMode = useAppStore((s) => s.tileMode);
  const setTileMode = useAppStore((s) => s.setTileMode);
  const showLabels = useAppStore((s) => s.showLabels);
  const setShowLabels = useAppStore((s) => s.setShowLabels);
  const isDark = tileMode === 'dark';

  return (
    <div className="fixed top-5 right-5 z-30 flex flex-col gap-2.5">
      <button
        onClick={() => setTileMode(isDark ? 'voyager' : 'dark')}
        title={isDark ? 'Switch to color mode' : 'Switch to dark mode'}
        className="group flex items-center gap-2.5 pl-3 pr-4 py-2 rounded-xl hover:brightness-125 active:scale-[0.97] transition-all duration-200 ease-out cursor-pointer select-none"
        style={btnStyle}
      >
        <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-white/[0.08]">
          {isDark ? <Moon size={14} className="text-blue-300" /> : <Sun size={14} className="text-amber-300" />}
        </span>
        <span className="text-[13px] font-semibold tracking-wide text-white/70">
          {isDark ? 'Dark' : 'Color'}
        </span>
      </button>

      <button
        onClick={() => setShowLabels(!showLabels)}
        title={showLabels ? 'Hide labels' : 'Show labels'}
        className="group flex items-center gap-2.5 pl-3 pr-4 py-2 rounded-xl hover:brightness-125 active:scale-[0.97] transition-all duration-200 ease-out cursor-pointer select-none"
        style={btnStyle}
      >
        <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-white/[0.08]">
          {showLabels ? <Tags size={14} className="text-emerald-300" /> : <Type size={14} className="text-white/40" />}
        </span>
        <span className="text-[13px] font-semibold tracking-wide text-white/70">
          {showLabels ? 'Labels' : 'No Labels'}
        </span>
      </button>
    </div>
  );
}
