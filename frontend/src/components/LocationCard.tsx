import { useAppStore } from '../store';

/**
 * Dark glassmorphic overlay card at the bottom of the screen
 * showing the selected location name + coordinates.
 * Styled to match the time-wheel pills (dark bg, blur, blue accent).
 */
export default function LocationCard() {
  const location = useAppStore((s) => s.location);

  if (!location) return null;

  return (
    <div
      className="
        fixed bottom-8 z-10
        rounded-full
        animate-slideUp
        text-center
        whitespace-nowrap
      "
      style={{
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '14px 36px',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        background: 'rgba(0, 0, 0, 0.45)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        boxShadow: '0 2px 12px rgba(0, 0, 0, 0.4)',
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}
    >
      <h2
        className="text-base font-bold tracking-wide truncate"
        style={{
          color: '#ffffff',
          textShadow: '0 1px 4px rgba(0, 0, 0, 0.6)',
        }}
      >
        {location.name}
      </h2>
      <p
        className="text-sm font-bold mt-1"
        style={{
          color: '#7db8ff',
          letterSpacing: '0.01em',
          textShadow: '0 1px 6px rgba(0, 0, 0, 0.7), 0 0 12px rgba(100, 160, 255, 0.25)',
          fontFamily: "'Plus Jakarta Sans', sans-serif",
        }}
      >
        {location.lat.toFixed(4)}°, {location.lng.toFixed(4)}°
      </p>
    </div>
  );
}
