export interface FishingConditions {
  waterTemp: string | null;
  flowRate: string | null;
  gaugeHeight: string | null;
  biteRating: "excellent" | "good" | "fair" | "poor";
  moonPhase: string;
  solunarPeriods: string[];
  bestBait: string[];
  species: string[];
}

// --- USGS Water Services ---

const USGS_BASE = "https://waterservices.usgs.gov/nwis/iv/";

/** Bounding box offset in degrees (~55 km at mid-latitudes). */
const BBOX_OFFSET = 0.5;

/** USGS parameter codes. */
const PARAM_WATER_TEMP = "00010";
const PARAM_DISCHARGE = "00060";
const PARAM_GAUGE_HEIGHT = "00065";

interface USGSTimeSeries {
  variable: { variableCode: { value: string }[] };
  values: { value: { value: string; dateTime: string }[] }[];
}

interface USGSResponse {
  value: {
    timeSeries: USGSTimeSeries[];
  };
}

function extractLatestValue(
  timeSeries: USGSTimeSeries[],
  parameterCode: string,
): string | null {
  const series = timeSeries.find((ts) =>
    ts.variable.variableCode.some((vc) => vc.value === parameterCode),
  );
  if (!series) return null;

  const values = series.values[0]?.value;
  if (!values || values.length === 0) return null;

  const latest = values[values.length - 1];
  const num = parseFloat(latest.value);
  if (isNaN(num)) return null;

  return num.toString();
}

export async function getWaterConditions(
  lat: number,
  lon: number,
): Promise<{
  waterTemp: string | null;
  flowRate: string | null;
  gaugeHeight: string | null;
}> {
  const nullResult = { waterTemp: null, flowRate: null, gaugeHeight: null };

  try {
    const west = (lon - BBOX_OFFSET).toFixed(4);
    const south = (lat - BBOX_OFFSET).toFixed(4);
    const east = (lon + BBOX_OFFSET).toFixed(4);
    const north = (lat + BBOX_OFFSET).toFixed(4);

    const params = new URLSearchParams({
      format: "json",
      bBox: `${west},${south},${east},${north}`,
      parameterCd: `${PARAM_WATER_TEMP},${PARAM_DISCHARGE},${PARAM_GAUGE_HEIGHT}`,
      siteType: "ST",
    });

    const response = await fetch(`${USGS_BASE}?${params}`, {
      headers: { "User-Agent": "TrailMind/1.0" },
    });

    if (!response.ok) return nullResult;

    const data: USGSResponse = await response.json();
    const timeSeries = data?.value?.timeSeries;
    if (!timeSeries || timeSeries.length === 0) return nullResult;

    const rawTemp = extractLatestValue(timeSeries, PARAM_WATER_TEMP);
    const rawFlow = extractLatestValue(timeSeries, PARAM_DISCHARGE);
    const rawGauge = extractLatestValue(timeSeries, PARAM_GAUGE_HEIGHT);

    // USGS reports water temp in Celsius — convert to Fahrenheit for display
    let waterTemp: string | null = null;
    if (rawTemp !== null) {
      const celsius = parseFloat(rawTemp);
      const fahrenheit = Math.round(celsius * 9 / 5 + 32);
      waterTemp = `${fahrenheit}\u00B0F`;
    }

    return {
      waterTemp,
      flowRate: rawFlow !== null ? `${Math.round(parseFloat(rawFlow))} cfs` : null,
      gaugeHeight: rawGauge !== null ? `${parseFloat(rawGauge).toFixed(1)} ft` : null,
    };
  } catch {
    return nullResult;
  }
}

// --- Solunar / Moon Phase ---

/** Known new moon reference: January 6, 2000 at 18:14 UTC. */
const KNOWN_NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14, 0);
const SYNODIC_PERIOD_DAYS = 29.53058867;
const SYNODIC_PERIOD_MS = SYNODIC_PERIOD_DAYS * 24 * 60 * 60 * 1000;

const MOON_PHASES = [
  "New Moon",
  "Waxing Crescent",
  "First Quarter",
  "Waxing Gibbous",
  "Full Moon",
  "Waning Gibbous",
  "Last Quarter",
  "Waning Crescent",
] as const;

function getMoonAge(date: Date): number {
  const elapsed = date.getTime() - KNOWN_NEW_MOON_MS;
  const daysInCycle = ((elapsed / SYNODIC_PERIOD_MS) % 1 + 1) % 1;
  return daysInCycle * SYNODIC_PERIOD_DAYS;
}

function getMoonPhase(date: Date): string {
  const age = getMoonAge(date);
  const phaseIndex = Math.floor((age / SYNODIC_PERIOD_DAYS) * 8) % 8;
  return MOON_PHASES[phaseIndex];
}

function getBiteRating(phase: string): "excellent" | "good" | "fair" | "poor" {
  if (phase === "New Moon" || phase === "Full Moon") return "excellent";
  if (phase === "First Quarter" || phase === "Last Quarter") return "good";
  return "fair";
}

function formatTime(hours: number): string {
  const h = Math.floor(((hours % 24) + 24) % 24);
  const m = Math.floor((hours % 1) * 60);
  const ampm = h < 12 ? "AM" : "PM";
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${displayH}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function computeSolunarPeriods(date: Date): string[] {
  // Approximate moon transit using moon age fraction of day
  const age = getMoonAge(date);
  const transitFraction = (age / SYNODIC_PERIOD_DAYS) % 1;

  // Major period centers on moon overhead (~transit) and underfoot (~transit + 12h)
  const transitHour = transitFraction * 24;
  const majorStart1 = transitHour - 1;
  const majorEnd1 = transitHour + 1;
  const majorStart2 = transitHour + 11;
  const majorEnd2 = transitHour + 13;

  // Minor periods are ~6 hours offset from majors (moonrise/moonset)
  const minorStart1 = transitHour + 5.5;
  const minorEnd1 = transitHour + 6.5;
  const minorStart2 = transitHour + 17.5;
  const minorEnd2 = transitHour + 18.5;

  return [
    `Major: ${formatTime(majorStart1)} - ${formatTime(majorEnd1)}`,
    `Major: ${formatTime(majorStart2)} - ${formatTime(majorEnd2)}`,
    `Minor: ${formatTime(minorStart1)} - ${formatTime(minorEnd1)}`,
    `Minor: ${formatTime(minorStart2)} - ${formatTime(minorEnd2)}`,
  ];
}

export function getSolunarData(): {
  moonPhase: string;
  biteRating: "excellent" | "good" | "fair" | "poor";
  solunarPeriods: string[];
} {
  const now = new Date();
  const moonPhase = getMoonPhase(now);
  return {
    moonPhase,
    biteRating: getBiteRating(moonPhase),
    solunarPeriods: computeSolunarPeriods(now),
  };
}

// --- Regional Species & Bait ---

interface RegionalInfo {
  species: string[];
  bestBait: string[];
}

const SPECIES_BAIT_MAP: Record<string, string[]> = {
  "Rainbow Trout": ["PowerBait", "worms", "spinners"],
  "Steelhead": ["roe bags", "jigs", "spoons"],
  "Chinook Salmon": ["herring", "spinners", "plugs"],
  "Smallmouth Bass": ["soft plastics", "crankbaits", "tube jigs"],
  "Brown Trout": ["nymphs", "streamers", "worms"],
  "Cutthroat": ["dry flies", "spinners", "worms"],
  "Kokanee": ["wedding ring spinners", "corn", "hoochies"],
  "Largemouth Bass": ["soft plastics", "crankbaits", "jigs"],
  "Catfish": ["chicken liver", "cut bait", "stink bait"],
  "Bluegill": ["worms", "crickets", "small jigs"],
  "Crappie": ["minnows", "small jigs", "tube baits"],
  "Striped Bass": ["live eels", "swimbaits", "topwater plugs"],
  "Trout": ["PowerBait", "worms", "spinners"],
  "Walleye": ["minnows", "leeches", "jig-and-minnow"],
  "Perch": ["minnows", "worms", "small spoons"],
  "Northern Pike": ["spinnerbaits", "spoons", "large swimbaits"],
  "Musky": ["bucktails", "jerkbaits", "large swimbaits"],
  "Panfish": ["worms", "crickets", "small jigs"],
  "Bass": ["soft plastics", "crankbaits", "jigs"],
};

function collectBait(species: string[]): string[] {
  const baitSet = new Set<string>();
  for (const sp of species) {
    const baits = SPECIES_BAIT_MAP[sp];
    if (baits) {
      for (const b of baits) baitSet.add(b);
    }
  }
  return [...baitSet];
}

export function getRegionalFishingInfo(
  lat: number,
  lon: number,
): RegionalInfo {
  let species: string[];

  if (lat > 42 && lon < -115) {
    // Pacific NW
    species = ["Rainbow Trout", "Steelhead", "Chinook Salmon", "Smallmouth Bass"];
  } else if (lat > 35 && lon < -100) {
    // Mountain West
    species = ["Brown Trout", "Cutthroat", "Kokanee"];
  } else if (lat < 35 && lon > -100) {
    // Southeast
    species = ["Largemouth Bass", "Catfish", "Bluegill", "Crappie"];
  } else if (lat > 38 && lon > -80) {
    // Northeast
    species = ["Striped Bass", "Trout", "Walleye", "Perch"];
  } else if (lat > 38 && lat < 48 && lon > -100 && lon < -80) {
    // Midwest
    species = ["Walleye", "Northern Pike", "Musky", "Panfish"];
  } else {
    // Default fallback
    species = ["Bass", "Trout", "Catfish", "Panfish"];
  }

  return { species, bestBait: collectBait(species) };
}

// --- Combined fishing conditions ---

export async function getFishingConditions(
  lat: number,
  lon: number,
): Promise<FishingConditions> {
  const [water, solunar, regional] = await Promise.all([
    getWaterConditions(lat, lon),
    Promise.resolve(getSolunarData()),
    Promise.resolve(getRegionalFishingInfo(lat, lon)),
  ]);

  return {
    waterTemp: water.waterTemp,
    flowRate: water.flowRate,
    gaugeHeight: water.gaugeHeight,
    biteRating: solunar.biteRating,
    moonPhase: solunar.moonPhase,
    solunarPeriods: solunar.solunarPeriods,
    bestBait: regional.bestBait,
    species: regional.species,
  };
}
