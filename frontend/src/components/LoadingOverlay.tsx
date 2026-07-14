import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../store';
import { useSelectionStore } from '../selectionStore';
import './LoadingOverlay.css';

const ROTATE_MS = 4000;

function formatYear(year: number): string {
  if (year < 0) return `${Math.abs(year)} BCE`;
  if (year > 1300) return String(year);
  return `${year} CE`;
}

export default function LoadingOverlay() {
  const location = useAppStore((s) => s.location);
  const year = useSelectionStore((s) => s.selectedYear);
  const loadingMessages = useAppStore((s) => s.loadingMessages);

  const locationLabel = location?.name ?? 'Unknown location';
  const yearLabel = useMemo(() => formatYear(year), [year]);
  const subtitle = `Preparing ${yearLabel} ${locationLabel} for exploration`;

  // Show AI-generated messages, or a simple placeholder until they arrive
  const phrases = loadingMessages.length > 0
    ? loadingMessages
    : ['Preparing your journey'];

  const [index, setIndex] = useState(0);

  // Reset index when AI-generated messages arrive
  useEffect(() => {
    setIndex(0);
  }, [loadingMessages.length]);

  useEffect(() => {
    if (phrases.length <= 1) return;
    const timer = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % phrases.length);
    }, ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [phrases]);

  const phrase = phrases[index] ?? 'Preparing...';

  return (
    <div className="loading-overlay">
      <div className="loading-overlay__inner">
        <div
          key={`${index}-${phrase}`}
          className="loading-overlay__title"
          style={{ animationDuration: `${ROTATE_MS}ms` }}
        >
          {phrase}
        </div>
        <div className="loading-overlay__subtitle">{subtitle}</div>
      </div>
    </div>
  );
}
