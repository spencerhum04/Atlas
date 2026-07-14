/**
 * Forward geocode a place name to lat/lng coordinates
 * using the free Nominatim (OpenStreetMap) search API.
 *
 * Rate limit: 1 request/second per Nominatim usage policy.
 * Returns null if no results found or on error.
 */

interface NominatimSearchResult {
  lat: string;
  lon: string;
  display_name: string;
}

export interface GeocodeResult {
  lat: number;
  lng: number;
  name: string;
}

export async function geocode(query: string): Promise<GeocodeResult | null> {
  try {
    const encoded = encodeURIComponent(query.trim());
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encoded}&limit=1`,
      {
        headers: {
          'User-Agent': 'QHacks2026-Globe/1.0',
        },
      },
    );

    if (!res.ok) return null;

    const data: NominatimSearchResult[] = await res.json();
    if (!data.length) return null;

    const top = data[0];
    return {
      lat: parseFloat(top.lat),
      lng: parseFloat(top.lon),
      name: top.display_name,
    };
  } catch {
    return null;
  }
}
