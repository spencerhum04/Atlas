import { useCallback } from 'react';
import { useAppStore } from '../store';
import './EnterLocation.css';

interface EnterLocationProps {
  onEnterPress?: () => void;
}

export default function EnterLocation({ onEnterPress }: EnterLocationProps) {
  const location = useAppStore((s) => s.location);
  const requestConfirm = useAppStore((s) => s.requestConfirmExploration);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      requestConfirm();       // Tell voice backend user wants to explore
      onEnterPress?.();       // Trigger hyperspace warp animation
    },
    [requestConfirm, onEnterPress],
  );

  if (!location) return null;

  return (
    <div className="enter-pill-wrapper">
      <button className="enter-pill" type="button" onPointerDown={handlePointerDown}>
        <span className="enter-pill__sparkle" />
        <span className="enter-pill__label">Enter</span>
      </button>
    </div>
  );
}
