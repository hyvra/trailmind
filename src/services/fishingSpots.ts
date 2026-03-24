export interface FishingSpot {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type: "boat_ramp" | "fishing_access" | "water_feature";
  description: string;
}

// --- USFWS Visitor Services (ArcGIS) ---

const USFWS_ENDPOINT =
  "https://services.arcgis.com/QVENGdaPbd4LUkLV/ArcGIS/rest/services/FWSVisitorServices/FeatureServer/0/query";

interface ArcGISFeature {
  attributes: {
    Name?: string;
    Description?: string;
    Type?: string;
  };
  geometry: {
    x: number;
    y: number;
  };
}

interface ArcGISResponse {
  features?: ArcGISFeature[];
}

function mapUSFWSType(
  serviceType: string | undefined,
): FishingSpot["type"] {
  if (!serviceType) return "fishing_access";
  const lower = serviceType.toLowerCase();
  if (lower.includes("boat") || lower.includes("ramp") || lower.includes("launch")) {
    return "boat_ramp";
  }
  if (lower.includes("water") || lower.includes("lake") || lower.includes("river")) {
    return "water_feature";
  }
  return "fishing_access";
}

async function fetchUSFWSSpots(lat: number, lon: number): Promise<FishingSpot[]> {
  try {
    const bbox = `${lon - 0.5},${lat - 0.5},${lon + 0.5},${lat + 0.5}`;
    const params = new URLSearchParams({
      where: "1=1",
      geometry: bbox,
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      outSR: "4326",
      outFields: "Name,Description,Type",
      f: "json",
      resultRecordCount: "20",
    });

    const response = await fetch(`${USFWS_ENDPOINT}?${params}`, {
      headers: { "User-Agent": "TrailMind/1.0" },
    });
    if (!response.ok) return [];

    const data: ArcGISResponse = await response.json();
    if (!data.features) return [];

    return data.features
      .filter((f) => f.geometry)
      .map((f) => ({
        id: crypto.randomUUID(),
        name: f.attributes.Name || "USFWS Visitor Service",
        lat: f.geometry.y,
        lng: f.geometry.x,
        type: mapUSFWSType(f.attributes.Type),
        description: f.attributes.Description || "US Fish & Wildlife Service site",
      }));
  } catch {
    return [];
  }
}

// --- Overpass API (OpenStreetMap) ---

interface OverpassElement {
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements?: OverpassElement[];
}

function mapOverpassType(tags: Record<string, string>): FishingSpot["type"] {
  if (tags.leisure === "slipway") return "boat_ramp";
  if (tags.leisure === "fishing") return "fishing_access";
  if (tags.amenity === "boat_rental") return "boat_ramp";
  return "water_feature";
}

function overpassDescription(tags: Record<string, string>): string {
  if (tags.leisure === "slipway") return "Boat ramp / slipway";
  if (tags.leisure === "fishing") return "Fishing spot";
  if (tags.amenity === "boat_rental") return "Boat rental";
  if (tags.water === "lake") return "Lake";
  if (tags.natural === "water") return "Water body";
  return "Water feature";
}

function overpassFallbackName(tags: Record<string, string>): string {
  if (tags.name) return tags.name;
  if (tags.leisure === "slipway") return "Boat Ramp";
  if (tags.leisure === "fishing") return "Fishing Access";
  if (tags.amenity === "boat_rental") return "Boat Rental";
  if (tags.water === "lake") return "Lake";
  if (tags.natural === "water") return "Water Body";
  return "Water Feature";
}

async function fetchOverpassSpots(lat: number, lon: number): Promise<FishingSpot[]> {
  try {
    const south = (lat - 0.3).toFixed(4);
    const north = (lat + 0.3).toFixed(4);
    const west = (lon - 0.3).toFixed(4);
    const east = (lon + 0.3).toFixed(4);
    const bbox = `${south},${west},${north},${east}`;

    const query = [
      "[out:json];",
      "(",
      `node["leisure"="fishing"](${bbox});`,
      `node["water"="lake"](${bbox});`,
      `node["natural"="water"](${bbox});`,
      `node["amenity"="boat_rental"](${bbox});`,
      `node["leisure"="slipway"](${bbox});`,
      ");",
      "out body 25;",
    ].join("");

    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
    });
    if (!response.ok) return [];

    const data: OverpassResponse = await response.json();
    if (!data.elements) return [];

    return data.elements.map((el) => {
      const tags = el.tags || {};
      return {
        id: crypto.randomUUID(),
        name: overpassFallbackName(tags),
        lat: el.lat,
        lng: el.lon,
        type: mapOverpassType(tags),
        description: overpassDescription(tags),
      };
    });
  } catch {
    return [];
  }
}

// --- USGS Water Services Stations ---

interface USGSSite {
  sourceInfo: {
    siteName: string;
    geoLocation: {
      geogLocation: {
        latitude: number;
        longitude: number;
      };
    };
  };
}

interface USGSStationsResponse {
  value: {
    timeSeries: USGSSite[];
  };
}

async function fetchUSGSStations(lat: number, lon: number): Promise<FishingSpot[]> {
  try {
    const west = (lon - 0.3).toFixed(4);
    const south = (lat - 0.3).toFixed(4);
    const east = (lon + 0.3).toFixed(4);
    const north = (lat + 0.3).toFixed(4);

    const params = new URLSearchParams({
      format: "json",
      bBox: `${west},${south},${east},${north}`,
      parameterCd: "00060",
      siteType: "ST",
    });

    const response = await fetch(
      `https://waterservices.usgs.gov/nwis/iv/?${params}`,
      { headers: { "User-Agent": "TrailMind/1.0" } },
    );
    if (!response.ok) return [];

    const data: USGSStationsResponse = await response.json();
    const timeSeries = data?.value?.timeSeries;
    if (!timeSeries) return [];

    // Deduplicate by site name since multiple parameters share the same station
    const seen = new Set<string>();
    const spots: FishingSpot[] = [];

    for (const ts of timeSeries) {
      const info = ts.sourceInfo;
      if (!info) continue;
      const name = info.siteName;
      if (seen.has(name)) continue;
      seen.add(name);

      const geo = info.geoLocation?.geogLocation;
      if (!geo) continue;

      spots.push({
        id: crypto.randomUUID(),
        name,
        lat: geo.latitude,
        lng: geo.longitude,
        type: "water_feature",
        description: "USGS stream gauge station",
      });
    }

    return spots;
  } catch {
    return [];
  }
}

// --- Deduplication ---

/** Approximate distance in meters between two lat/lng points. */
function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Score a name — longer, non-generic names win. */
function nameQuality(name: string): number {
  const generic = [
    "Water Body",
    "Water Feature",
    "Lake",
    "Boat Ramp",
    "Fishing Access",
    "Boat Rental",
    "USFWS Visitor Service",
    "USGS stream gauge station",
  ];
  if (generic.includes(name)) return 0;
  return name.length;
}

/** Remove spots within ~100m of each other, keeping the better-named one. */
function deduplicateSpots(spots: FishingSpot[]): FishingSpot[] {
  const kept: FishingSpot[] = [];

  for (const spot of spots) {
    const duplicate = kept.findIndex(
      (k) => distanceMeters(k.lat, k.lng, spot.lat, spot.lng) < 100,
    );

    if (duplicate === -1) {
      kept.push(spot);
    } else if (nameQuality(spot.name) > nameQuality(kept[duplicate].name)) {
      kept[duplicate] = spot;
    }
  }

  return kept;
}

// --- Public API ---

const MAX_RESULTS = 30;

/**
 * Fetch nearby fishing access points from USFWS, OpenStreetMap, and USGS.
 * Returns spots within ~50km of the given coordinates.
 * Never throws — returns an empty array on complete failure.
 */
export async function getNearbyFishingSpots(
  lat: number,
  lon: number,
): Promise<FishingSpot[]> {
  try {
    const results = await Promise.allSettled([
      fetchUSFWSSpots(lat, lon),
      fetchOverpassSpots(lat, lon),
      fetchUSGSStations(lat, lon),
    ]);

    const allSpots: FishingSpot[] = [];
    for (const result of results) {
      if (result.status === "fulfilled") {
        allSpots.push(...result.value);
      }
    }

    const unique = deduplicateSpots(allSpots);
    return unique.slice(0, MAX_RESULTS);
  } catch {
    return [];
  }
}
