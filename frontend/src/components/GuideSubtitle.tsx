import { useEffect } from 'react';
import { useAppStore } from '../store';

/**
 * Floating glassmorphic subtitle overlay that reveals the AI guide's
 * speech text word-by-word, synced to TTS audio via Gradium word timestamps.
 *
 * How it works:
 *   1. Backend forwards TTS word timestamps (text + start_s) to frontend
 *   2. markSubtitleAudioStart() records performance.now() when first audio chunk plays
 *   3. A 50ms polling interval checks elapsed time against word start times
 *   4. Words whose start_s <= elapsed are revealed in order
 */
export default function GuideSubtitle() {
  const subtitle = useAppStore((s) => s.guideSubtitle);

  // Timestamp-synced word reveal — polls at 50ms for smooth updates
  useEffect(() => {
    const id = setInterval(() => {
      const state = useAppStore.getState();
      if (!state._subtitleAudioStart || state._wordTimestamps.length === 0) return;

      const elapsed = (performance.now() - state._subtitleAudioStart) / 1000;

      // Count how many words should be visible based on elapsed time
      let visibleCount = 0;
      for (const w of state._wordTimestamps) {
        if (w.startS <= elapsed) {
          visibleCount++;
        } else {
          break; // timestamps arrive in order
        }
      }

      // Build visible text and update store only if changed
      if (visibleCount > 0) {
        const newSubtitle = state._wordTimestamps
          .slice(0, visibleCount)
          .map((w) => w.text)
          .join(' ');
        if (newSubtitle !== state.guideSubtitle) {
          useAppStore.setState({ guideSubtitle: newSubtitle });
        }
      }
    }, 50);
    return () => clearInterval(id);
  }, []);

  if (!subtitle) return null;

  return (
    <div
      className="fixed z-20 max-w-[600px] text-center"
      style={{
        bottom: '200px',
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '12px 24px',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        background: 'rgba(0, 0, 0, 0.55)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '16px',
        boxShadow: '0 2px 12px rgba(0, 0, 0, 0.4)',
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        color: 'rgba(255, 255, 255, 0.85)',
        fontSize: '14px',
        lineHeight: '1.5',
        fontWeight: 500,
        transition: 'opacity 0.3s ease',
      }}
    >
      {subtitle}
    </div>
  );
}
