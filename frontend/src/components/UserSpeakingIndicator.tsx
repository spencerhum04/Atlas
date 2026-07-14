import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store';

const BAR_COUNT = 5;
const BAR_MULTIPLIERS = [0.6, 0.85, 1.0, 0.75, 0.5];
const FIXED_HEIGHT = 28; // Fixed container height so pillbox doesn't resize
const MAX_BAR_HEIGHT = 22;
const MIN_BAR_HEIGHT = 4;
const LINGER_MS = 500; // Keep visible for 500ms after voice stops

export default function UserSpeakingIndicator() {
  const isUserSpeaking = useAppStore((s) => s.isUserSpeaking);
  const micLevel = useAppStore((s) => s.micLevel);
  const subtitle = useAppStore((s) => s.guideSubtitle);
  const [visible, setVisible] = useState(false);
  const lingerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Kill immediately if subtitles appear — never conflict with AI text
    if (subtitle) {
      if (lingerTimer.current) clearTimeout(lingerTimer.current);
      lingerTimer.current = null;
      setVisible(false);
      return;
    }

    if (isUserSpeaking) {
      // Show immediately when user starts speaking
      if (lingerTimer.current) clearTimeout(lingerTimer.current);
      lingerTimer.current = null;
      setVisible(true);
    } else if (visible) {
      // User stopped — linger for 500ms before hiding
      if (!lingerTimer.current) {
        lingerTimer.current = setTimeout(() => {
          lingerTimer.current = null;
          setVisible(false);
        }, LINGER_MS);
      }
    }
  }, [isUserSpeaking, subtitle, visible]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (lingerTimer.current) clearTimeout(lingerTimer.current);
    };
  }, []);

  if (!visible) return null;

  // Normalize RMS (typically 0-0.3) to 0-1 range for bar heights
  const normalized = Math.min(1, micLevel / 0.15);

  return (
    <div
      className="fixed z-20"
      style={{
        bottom: '150px',
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '10px 20px',
        height: `${FIXED_HEIGHT + 20}px`,
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        background: 'rgba(0, 0, 0, 0.55)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '16px',
        boxShadow: '0 2px 12px rgba(0, 0, 0, 0.4)',
        display: 'flex',
        alignItems: 'center',
        gap: '3px',
      }}
    >
      {Array.from({ length: BAR_COUNT }, (_, i) => {
        const multiplier = BAR_MULTIPLIERS[i]!;
        const height = MIN_BAR_HEIGHT + normalized * multiplier * (MAX_BAR_HEIGHT - MIN_BAR_HEIGHT);
        return (
          <div
            key={i}
            style={{
              width: '3px',
              height: `${height}px`,
              borderRadius: '1.5px',
              background: 'rgba(255, 255, 255, 0.7)',
              transition: 'height 0.08s ease-out',
            }}
          />
        );
      })}
    </div>
  );
}
