export interface GeocodingResult {
  displayName: string;
  lat: number;
  lon: number;
}

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const HEADERS = { "User-Agent": "TrailMind/1.0" };

export async function searchLocations(
  query: string
): Promise<GeocodingResult[]> {
  if (!query.trim()) return [];

  try {
    const params = new URLSearchParams({
      format: "json",
      q: query,
      limit: "5",
    });
    const response = await fetch(`${NOMINATIM_BASE}/search?${params}`, {
      headers: HEADERS,
    });

    if (!response.ok) return [];

    const data = await response.json();
    return data.map(
      (item: { display_name: string; lat: string; lon: string }) => ({
        displayName: item.display_name,
        lat: parseFloat(item.lat),
        lon: parseFloat(item.lon),
      })
    );
  } catch {
    return [];
  }
}

export async function geocodeLocation(
  query: string
): Promise<[number, number] | null> {
  const results = await searchLocations(query);
  if (results.length === 0) return null;
  return [results[0].lat, results[0].lon];
}

export async function reverseGeocode(
  lat: number,
  lon: number
): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      format: "json",
      lat: lat.toString(),
      lon: lon.toString(),
    });
    const response = await fetch(`${NOMINATIM_BASE}/reverse?${params}`, {
      headers: HEADERS,
    });

    if (!response.ok) return null;

    const data = await response.json();
    const addr = data.address;
    if (addr) {
      const city = addr.city || addr.town || addr.village || addr.county;
      const state = addr.state || addr.country;
      if (city && state) return `${city}, ${state}`;
    }
    return data.display_name?.split(",").slice(0, 2).join(",").trim() ?? null;
  } catch {
    return null;
  }
}
