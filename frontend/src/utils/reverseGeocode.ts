/**
 * Reverse geocode lat/lng to a human-readable location name
 * using the free Nominatim (OpenStreetMap) API.
 *
 * Rate limit: 1 request/second (fine for interactive click use).
 * Required: User-Agent header per Nominatim usage policy.
 */

interface NominatimAddress {
  city?: string;
  town?: string;
  village?: string;
  state?: string;
  country?: string;
}

interface NominatimResponse {
  address: NominatimAddress;
  display_name: string;
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=6&addressdetails=1`,
      {
        headers: {
          'User-Agent': 'QHacks2026-Globe/1.0',
        },
      },
    );

    if (!res.ok) {
      return formatCoords(lat, lng);
    }

    const data: NominatimResponse = await res.json();
    const addr = data.address;

    // Build a human-readable name from available address components
    const place = addr?.city || addr?.town || addr?.village || addr?.state;
    const country = addr?.country;
    const parts = [place, country].filter(Boolean);

    return parts.length > 0 ? parts.join(', ') : formatCoords(lat, lng);
  } catch {
    // Network error or parse failure — fall back to coordinates
    return formatCoords(lat, lng);
  }
}

function formatCoords(lat: number, lng: number): string {
  return `${lat.toFixed(2)}, ${lng.toFixed(2)}`;
}
