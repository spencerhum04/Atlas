import { useState, useRef, useCallback } from 'react';
import { MapPin } from 'lucide-react';
import { useAppStore } from '../store';
import { geocode } from '../utils/geocode';

const pillStyle: React.CSSProperties = {
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  background: 'rgba(0, 0, 0, 0.45)',
  border: '1px solid rgba(255, 255, 255, 0.12)',
  boxShadow: '0 2px 12px rgba(0, 0, 0, 0.4)',
  fontFamily: "'Plus Jakarta Sans', sans-serif",
};

export default function TravelTo() {
  const setLocation = useAppStore((s) => s.setLocation);
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleOpen = useCallback(() => {
    setEditing(true);
    setQuery('');
    /* Focus the input after React renders it */
    setTimeout(() => inputRef.current?.focus(), 30);
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) {
      setEditing(false);
      return;
    }

    setLoading(true);
    const result = await geocode(trimmed);
    setLoading(false);

    if (result) {
      /* Shorten the display name: take first two comma-separated parts */
      const parts = result.name.split(',').map((s) => s.trim());
      const shortName = parts.slice(0, 2).join(', ');
      setLocation({ lat: result.lat, lng: result.lng, name: shortName });
    }

    setQuery('');
    setEditing(false);
  }, [query, setLocation]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      } else if (e.key === 'Escape') {
        setQuery('');
        setEditing(false);
      }
    },
    [handleSubmit],
  );

  return (
    <div
      className="fixed z-10 rounded-full cursor-pointer select-none"
      style={{
        ...pillStyle,
        bottom: '108px',
        left: '50%',
        transform: 'translateX(-50%)',
        padding: editing ? '10px 20px' : '10px 24px',
        minWidth: editing ? '220px' : undefined,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={!editing ? handleOpen : undefined}
    >
      {editing ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
          <MapPin size={14} style={{ color: '#7db8ff', flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              if (!query.trim()) {
                setTimeout(() => setEditing(false), 150);
              }
            }}
            placeholder="Type a location..."
            disabled={loading}
            style={{
              background: 'transparent',
              outline: 'none',
              border: 'none',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 600,
              letterSpacing: '0.02em',
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              caretColor: '#7db8ff',
              width: '100%',
              lineHeight: '1',
            }}
          />
          {loading && (
            <span style={{ color: '#7db8ff', fontSize: '12px', fontWeight: 500, flexShrink: 0 }}>
              ...
            </span>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <MapPin size={14} style={{ color: '#7db8ff', display: 'block' }} />
          <span
            style={{
              color: 'rgba(255, 255, 255, 0.55)',
              fontSize: '13px',
              fontWeight: 600,
              letterSpacing: '0.02em',
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              lineHeight: '1',
            }}
          >
            Travel to...
          </span>
        </div>
      )}
    </div>
  );
}
