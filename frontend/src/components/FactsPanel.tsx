import { useEffect, useRef } from 'react';
import { useAppStore } from '../store';

const CATEGORY_COLORS: Record<string, string> = {
  culture: '#e8a0ff',
  technology: '#80d4ff',
  politics: '#ffb380',
  daily_life: '#a0ffa0',
  art: '#ffdf80',
};

const CATEGORY_LABELS: Record<string, string> = {
  culture: 'Culture',
  technology: 'Technology',
  politics: 'Politics',
  daily_life: 'Daily Life',
  art: 'Art',
};

const MAX_VISIBLE = 4;
const AUTO_DISMISS_MS = 15_000;

export default function FactsPanel() {
  const facts = useAppStore((s) => s.facts);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  // Auto-dismiss facts after timeout
  useEffect(() => {
    const timers = timersRef.current;
    facts.forEach((fact, idx) => {
      if (fact.visible && !timers.has(idx)) {
        timers.set(
          idx,
          setTimeout(() => {
            useAppStore.setState((s) => {
              const updated = [...s.facts];
              if (updated[idx]) updated[idx] = { ...updated[idx], visible: false };
              return { facts: updated };
            });
            timers.delete(idx);
          }, AUTO_DISMISS_MS),
        );
      }
    });
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, [facts]);

  const visible = facts
    .map((f, i) => ({ ...f, idx: i }))
    .filter((f) => f.visible)
    .slice(-MAX_VISIBLE);

  if (visible.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: '24px',
        top: '50%',
        transform: 'translateY(-50%)',
        zIndex: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        maxWidth: '320px',
        pointerEvents: 'none',
      }}
    >
      {visible.map((fact) => {
        const color = CATEGORY_COLORS[fact.category] ?? '#ffffff';
        const label = CATEGORY_LABELS[fact.category] ?? fact.category;
        return (
          <div
            key={fact.idx}
            style={{
              padding: '14px 18px',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              background: 'rgba(0, 0, 0, 0.55)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '16px',
              boxShadow: '0 2px 12px rgba(0, 0, 0, 0.4)',
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              animation: 'factSlideIn 0.4s ease-out',
            }}
          >
            <div
              style={{
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color,
                marginBottom: '6px',
              }}
            >
              {label}
            </div>
            <div
              style={{
                color: 'rgba(255, 255, 255, 0.85)',
                fontSize: '13px',
                lineHeight: '1.5',
                fontWeight: 500,
              }}
            >
              {fact.text}
            </div>
          </div>
        );
      })}

      <style>{`
        @keyframes factSlideIn {
          from {
            opacity: 0;
            transform: translateX(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}
