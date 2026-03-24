import type { UserProfile, RouteOption } from "../types";

// --- Ride type detection ---

type RideType = "trail" | "commute" | "fishing" | "training" | "casual";

const RIDE_KEYWORDS: Record<RideType, string[]> = {
  trail: ["trail", "mountain", "mtb", "singletrack", "offroad", "off-road"],
  commute: ["commute", "work", "errand", "city", "urban"],
  fishing: ["fish", "fishing", "angling", "river", "creek", "lake"],
  training: ["train", "training", "interval", "speed", "fitness", "workout"],
  casual: ["casual", "easy", "leisure", "chill", "relax", "family"],
};

function detectRideType(intent: string): RideType {
  const lower = intent.toLowerCase();
  for (const [type, keywords] of Object.entries(RIDE_KEYWORDS) as [RideType, string[]][]) {
    if (keywords.some((kw) => lower.includes(kw))) return type;
  }
  return "trail"; // default
}

// --- Haversine coordinate helpers ---

/** Returns a new [lat, lng] offset from origin by distance (km) at bearing (degrees). */
function destinationPoint(
  origin: [number, number],
  distanceKm: number,
  bearingDeg: number,
): [number, number] {
  const R = 6371; // Earth radius km
  const lat1 = toRad(origin[0]);
  const lng1 = toRad(origin[1]);
  const brng = toRad(bearingDeg);
  const d = distanceKm / R;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng),
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
    );

  return [toDeg(lat2), toDeg(lng2)];
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

// --- Random helpers ---

function randBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function randInt(min: number, max: number): number {
  return Math.floor(randBetween(min, max + 1));
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// --- Coordinate shape generators ---

function generateLoopCoords(
  center: [number, number],
  radiusKm: number,
  pointCount: number,
): [number, number][] {
  const coords: [number, number][] = [];
  const startBearing = randBetween(0, 360);
  for (let i = 0; i < pointCount; i++) {
    const angle = startBearing + (360 / pointCount) * i;
    const jitter = randBetween(0.7, 1.3);
    coords.push(destinationPoint(center, radiusKm * jitter, angle));
  }
  // Close the loop
  coords.push(coords[0]);
  return coords;
}

function generateLinearCoords(
  center: [number, number],
  lengthKm: number,
  pointCount: number,
): [number, number][] {
  const bearing = randBetween(0, 360);
  const step = lengthKm / (pointCount - 1);
  const coords: [number, number][] = [];
  for (let i = 0; i < pointCount; i++) {
    const lateral = randBetween(-0.15, 0.15); // slight lateral drift
    const pt = destinationPoint(center, step * i - lengthKm / 2, bearing);
    coords.push(destinationPoint(pt, lateral, bearing + 90));
  }
  return coords;
}

function generateWaterwayCoords(
  center: [number, number],
  lengthKm: number,
  pointCount: number,
): [number, number][] {
  const bearing = randBetween(0, 360);
  const step = lengthKm / (pointCount - 1);
  const coords: [number, number][] = [];
  for (let i = 0; i < pointCount; i++) {
    // Sinusoidal curve mimicking a river path
    const lateralKm = Math.sin((i / pointCount) * Math.PI * 2.5) * 0.5;
    const pt = destinationPoint(center, step * i - lengthKm / 2, bearing);
    coords.push(destinationPoint(pt, lateralKm, bearing + 90));
  }
  return coords;
}

function generateHillCircuitCoords(
  center: [number, number],
  radiusKm: number,
  pointCount: number,
): [number, number][] {
  // Figure-eight pattern for hill repeats
  const coords: [number, number][] = [];
  const startBearing = randBetween(0, 360);
  for (let i = 0; i < pointCount; i++) {
    const t = (i / pointCount) * Math.PI * 2;
    const r = radiusKm * (0.8 + 0.4 * Math.sin(t * 2)); // varying radius
    const angle = startBearing + (360 / pointCount) * i;
    coords.push(destinationPoint(center, r, angle));
  }
  coords.push(coords[0]);
  return coords;
}

function coordsForType(
  type: RideType,
  center: [number, number],
  distanceMi: number,
): [number, number][] {
  const distanceKm = distanceMi * 1.60934;
  const pointCount = randInt(8, 12);
  // Rough radius from total distance (circumference ~ 2*pi*r for loops)
  const radiusKm = distanceKm / (2 * Math.PI);

  switch (type) {
    case "trail":
      return generateLoopCoords(center, radiusKm, pointCount);
    case "commute":
      return generateLinearCoords(center, distanceKm * 0.45, pointCount);
    case "fishing":
      return generateWaterwayCoords(center, distanceKm * 0.4, pointCount);
    case "training":
      return generateHillCircuitCoords(center, radiusKm, pointCount);
    case "casual":
      return generateLoopCoords(center, radiusKm * 0.8, pointCount);
  }
}

// --- Route naming ---

const ADJECTIVES: Record<RideType, string[]> = {
  trail: ["Ridgeline", "Summit", "Wildwood", "Boulder", "Cedar", "Hawk", "Pine Ridge", "Coyote"],
  commute: ["Downtown", "Midtown", "Parkside", "Mainline", "Crosstown", "Greenway", "Express"],
  fishing: ["Riverside", "Creekside", "Stillwater", "Blue Heron", "Trout Run", "Oxbow", "Millpond"],
  training: ["Iron", "Sprint", "Tempo", "Threshold", "Cadence", "Breakaway", "Peloton"],
  casual: ["Sunset", "Meadow", "Gentle", "Breezy", "Lakeside", "Garden", "Sunday"],
};

const ROUTE_WORDS: Record<RideType, string[]> = {
  trail: ["Loop", "Circuit", "Traverse", "Singletrack", "Trail"],
  commute: ["Route", "Line", "Corridor", "Path", "Way"],
  fishing: ["Run", "Bend", "Crossing", "Access", "Drift"],
  training: ["Circuit", "Sprint", "Climb", "Interval", "Series"],
  casual: ["Loop", "Ride", "Cruise", "Stroll", "Meander"],
};

const LANDMARKS = [
  "Vista", "Falls", "Creek", "Hill", "Bluff", "Ridge", "Hollow",
  "Meadow", "Bridge", "Overlook", "Fork", "Quarry", "Mill",
];

function generateRouteName(type: RideType): string {
  const adj = pick(ADJECTIVES[type]);
  const useMiddle = Math.random() > 0.5;
  const middle = useMiddle ? ` ${pick(LANDMARKS)}` : "";
  const suffix = pick(ROUTE_WORDS[type]);
  return `${adj}${middle} ${suffix}`;
}

// --- Distance / elevation ranges ---

interface RangeSpec {
  distMin: number;
  distMax: number;
  elevMin: number;
  elevMax: number;
}

const RANGES: Record<RideType, RangeSpec> = {
  trail: { distMin: 8, distMax: 20, elevMin: 1000, elevMax: 3000 },
  commute: { distMin: 3, distMax: 10, elevMin: 100, elevMax: 400 },
  fishing: { distMin: 5, distMax: 15, elevMin: 200, elevMax: 800 },
  training: { distMin: 10, distMax: 30, elevMin: 1500, elevMax: 4000 },
  casual: { distMin: 3, distMax: 8, elevMin: 50, elevMax: 300 },
};

// --- Terrain descriptions ---

const TERRAINS: Record<RideType, string[]> = {
  trail: [
    "Mixed singletrack and gravel with rocky sections",
    "Packed dirt trail with root obstacles and switchbacks",
    "Flowy singletrack through mixed forest, some loose gravel descents",
    "Technical rocky trail with loose shale sections",
  ],
  commute: [
    "Paved bike lanes and shared-use paths",
    "Mix of dedicated bike path and residential streets",
    "Protected bike lane with short gravel connector",
  ],
  fishing: [
    "Gravel access road along the river corridor",
    "Packed dirt path following the creek bed, some sandy stretches",
    "Mixed gravel and grass levee trail with waterway crossings",
  ],
  training: [
    "Rolling paved road with sustained climbs",
    "Mixed pavement and hardpack with steep repeats",
    "Paved hill circuit with 6-8% grade sustained sections",
  ],
  casual: [
    "Smooth paved greenway, flat terrain",
    "Packed gravel rail-trail through gentle countryside",
    "Paved multi-use path along the waterfront",
  ],
};

// --- Conditions ---

const SKIES = ["Clear skies", "Partly cloudy", "Mostly sunny", "Bright sunshine", "Scattered clouds"];
const WIND = [
  "calm winds",
  "light breeze from the west",
  "gentle southerly breeze",
  "mild northwesterly wind",
  "light easterly breeze",
  "almost no wind",
];
const EXTRAS = [
  "Low humidity.",
  "Great visibility.",
  "UV index moderate — sunscreen recommended.",
  "Dry conditions, trails in good shape.",
  "Pleasant riding weather.",
  "",
];

function generateConditions(): string {
  const temp = randInt(52, 82);
  const sky = pick(SKIES);
  const wind = pick(WIND);
  const extra = pick(EXTRAS);
  return `${sky}, ${temp}\u00B0F, ${wind}.${extra ? " " + extra : ""}`;
}

// --- Bike setup ---

function computePSI(profile: UserProfile, type: RideType): string {
  // Parse weight, default to 170 if unparseable
  const weight = parseInt(profile.weight, 10) || 170;

  // Base PSI from ride type
  let basePSI: number;
  switch (type) {
    case "trail":
      basePSI = randInt(25, 35);
      break;
    case "commute":
      basePSI = randInt(80, 110);
      break;
    case "fishing":
      basePSI = randInt(30, 45);
      break;
    case "training":
      basePSI = randInt(70, 100);
      break;
    case "casual":
      basePSI = randInt(50, 75);
      break;
  }

  // Adjust for rider weight (heavier riders need more pressure)
  const weightAdjust = Math.round((weight - 170) * 0.1);
  const finalPSI = Math.max(20, basePSI + weightAdjust);

  // Bike type override: mountain bikes stay low regardless
  if (
    profile.bikeType.toLowerCase().includes("mountain") &&
    (type === "commute" || type === "training")
  ) {
    return `${randInt(30, 45)} PSI (front) / ${randInt(33, 48)} PSI (rear)`;
  }

  return `${finalPSI} PSI (front) / ${finalPSI + randInt(2, 5)} PSI (rear)`;
}

function computeSuspension(profile: UserProfile, type: RideType): string {
  const hasSuspension =
    profile.suspension.toLowerCase() !== "none" &&
    profile.suspension.toLowerCase() !== "rigid";

  if (!hasSuspension) {
    if (type === "trail") return "Rigid — consider lower tire pressure for comfort";
    return "Rigid setup";
  }

  switch (type) {
    case "trail":
      return "Open, medium rebound — 25-30% sag recommended";
    case "commute":
      return "Lockout recommended for pavement efficiency";
    case "fishing":
      return "Open, softer compression for gravel comfort";
    case "training":
      return "Firm or lockout for climbing efficiency";
    case "casual":
      return "Open, comfort-oriented settings";
  }
}

// --- Body prep ---

const GENERAL_WARMUP = [
  "5-minute easy spin warmup",
  "Dynamic leg swings (10 each side)",
  "Ankle circles and calf raises",
];

const INJURY_STRETCHES: Record<string, string[]> = {
  back: ["Hip flexor stretch (30s each side)", "Cat-cow stretches (10 reps)", "Gentle seated spinal twist"],
  knee: ["Quad stretch (30s each side)", "Leg swings (forward and lateral, 10 each)", "Wall sit (20s)"],
  shoulder: ["Arm circles (10 each direction)", "Cross-body shoulder stretch", "Doorframe chest opener"],
  neck: ["Gentle neck tilts (hold 10s each side)", "Chin tucks (10 reps)"],
  hip: ["Pigeon stretch (30s each side)", "Hip circles (10 each direction)", "Butterfly stretch"],
  wrist: ["Wrist flexor/extensor stretches", "Prayer stretch (15s)", "Wrist circles"],
  ankle: ["Ankle alphabet (trace letters with toe)", "Calf raises on step edge", "Resistance band inversion/eversion"],
};

function generateBodyPrep(profile: UserProfile, type: RideType): string[] {
  const prep = [...GENERAL_WARMUP];

  // Map injuries to stretches
  for (const injury of profile.injuries) {
    const lower = injury.toLowerCase();
    for (const [key, stretches] of Object.entries(INJURY_STRETCHES)) {
      if (lower.includes(key)) {
        prep.push(...stretches);
      }
    }
  }

  // Type-specific additions
  if (type === "training") {
    prep.push("Progressive cadence build: 60 → 80 → 100 RPM over 5 minutes");
  }
  if (type === "trail") {
    prep.push("Core activation: 30s plank + 10 bicycle crunches");
  }

  // Deduplicate
  return [...new Set(prep)];
}

// --- Gear list ---

const BASE_GEAR = ["Helmet", "Water bottle / hydration pack", "Phone + mount", "Multi-tool"];

const TYPE_GEAR: Record<RideType, string[]> = {
  trail: [
    "Gloves",
    "Mini pump or CO2 inflator",
    "Spare tube",
    "Trail snacks (bars, gels)",
    "First aid kit",
    "Eye protection",
  ],
  commute: [
    "Front and rear lights",
    "U-lock or chain lock",
    "Rain jacket (packable)",
    "Pannier or backpack",
    "Reflective vest or ankle band",
  ],
  fishing: [
    "Rod holder / frame mount",
    "Tackle bag (fits pannier)",
    "Sunscreen SPF 50+",
    "Polarized sunglasses",
    "Insect repellent",
    "Cooler bag for catch",
  ],
  training: [
    "Cycling computer or GPS",
    "Heart rate monitor",
    "Spare tube + CO2",
    "Energy gels (2-3)",
    "Electrolyte mix",
    "Chamois cream",
  ],
  casual: [
    "Sunglasses",
    "Sunscreen",
    "Snacks",
    "Camera or phone for photos",
    "Light lock for stops",
  ],
};

function generateGearList(type: RideType): string[] {
  return [...BASE_GEAR, ...TYPE_GEAR[type]];
}

// --- Difficulty modifier ---

type Difficulty = "easy" | "moderate" | "challenging";

const DIFFICULTY_LABELS: Difficulty[] = ["easy", "moderate", "challenging"];

function applyDifficulty(
  range: RangeSpec,
  difficulty: Difficulty,
): { distance: number; elevation: number } {
  const span = (d: Difficulty) => {
    switch (d) {
      case "easy":
        return 0;
      case "moderate":
        return 0.5;
      case "challenging":
        return 1;
    }
  };
  const t = span(difficulty);
  // Interpolate within the range, with some jitter
  const jitter = randBetween(-0.1, 0.1);
  const clamped = Math.min(1, Math.max(0, t + jitter));
  return {
    distance: Math.round((range.distMin + (range.distMax - range.distMin) * clamped) * 10) / 10,
    elevation: Math.round(range.elevMin + (range.elevMax - range.elevMin) * clamped),
  };
}

// --- Main export ---

export function generateRoutes(
  intent: string,
  location: string,
  centerCoords: [number, number],
  profile: UserProfile,
): RouteOption[] {
  const type = detectRideType(intent);

  // Decide how many routes: 2-3
  const count = Math.random() > 0.4 ? 3 : 2;

  // Pick difficulty levels to ensure variety
  const difficulties: Difficulty[] =
    count === 3
      ? shuffle([...DIFFICULTY_LABELS])
      : shuffle(DIFFICULTY_LABELS).slice(0, 2);

  const usedNames = new Set<string>();

  return difficulties.map((difficulty): RouteOption => {
    // Generate a unique name
    let name: string;
    do {
      name = generateRouteName(type);
    } while (usedNames.has(name));
    usedNames.add(name);

    const range = RANGES[type];
    const { distance, elevation } = applyDifficulty(range, difficulty);
    const coordinates = coordsForType(type, centerCoords, distance);

    return {
      id: crypto.randomUUID(),
      name,
      distance: `${distance} mi`,
      elevation: `${elevation} ft`,
      terrain: pick(TERRAINS[type]),
      conditions: generateConditions(),
      coordinates,
      bikeSetup: {
        psi: computePSI(profile, type),
        suspension: computeSuspension(profile, type),
      },
      bodyPrep: generateBodyPrep(profile, type),
      gearList: generateGearList(type),
    };
  });
}
