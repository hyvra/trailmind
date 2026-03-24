# TrailMind UX Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all 16 UX audit findings (P0-P3), replacing the broken Gemini API backend with a free algorithmic route generator.

**Architecture:** Replace the serverless Gemini API with a client-side route generation engine that builds realistic ride plans algorithmically based on ride type, location coordinates, user profile, and terrain templates. All other changes are frontend UX fixes in the monolithic App.tsx plus new service modules.

**Tech Stack:** React 19, Vite 6, Tailwind CSS 4, Leaflet, Nominatim (free OSM geocoding), TypeScript

---

## File Structure

**Create:**
- `src/services/routeGenerator.ts` — Algorithmic route generation engine (replaces Gemini API)
- `src/services/geocoding.ts` — Nominatim geocoding, reverse geocoding, autocomplete search

**Modify:**
- `src/App.tsx` — All 16 UX fixes: error handling, loading states, form preservation, autocomplete, geolocation, responsive nav, STATUS box, branding, empty states, etc.
- `src/index.css` — Outdoor color palette, branding tokens
- `index.html` — Meta description (title already correct)
- `package.json` — Remove `@google/genai` dependency

**Delete:**
- `api/generate.ts` — Gemini serverless function (no longer needed)
- `src/services/gemini.ts` — Gemini API client (replaced by routeGenerator.ts)

---

## Task 1: Algorithmic Route Generator

**Files:**
- Create: `src/services/routeGenerator.ts`
- Delete: `api/generate.ts`
- Delete: `src/services/gemini.ts`
- Modify: `src/App.tsx:34` (import change)
- Modify: `src/App.tsx:187-200` (handleGenerate rewrite)
- Modify: `package.json` (remove @google/genai)

- [ ] **Step 1: Create route generator service**

Create `src/services/routeGenerator.ts` with:
- `generateRoutes(intent: string, location: string, centerCoords: [number, number], profile: UserProfile): RouteOption[]`
- Route templates per ride type: Trail Ride (looping mountain paths), Commute (A-to-B urban), Fishing Access (waterway routes), Training (intervals/hills), Casual (flat scenic)
- Coordinate generation: Create 8-12 realistic waypoints around `centerCoords` using bearing + distance math. Trail rides = loops, commutes = linear, fishing = follow water features pattern
- Bike setup recommendations based on terrain type + profile (weight-based PSI calculation, suspension settings per terrain)
- Body prep based on `profile.injuries` array — map common injuries to relevant stretches
- Gear lists based on ride type (e.g., Trail: helmet, gloves, pump, water, trail snacks; Fishing: rod holder, tackle, waders, sunscreen)
- Generate 2-3 options with varying distance/difficulty
- Each route gets a unique `id` via `crypto.randomUUID()`
- Distance range: 5-25 miles based on ride type. Elevation: 200-3000ft based on terrain
- Route names should be evocative: "[Terrain Adjective] [Landmark Type] [Route Word]" e.g., "Ridgeline Vista Loop", "Riverside Gravel Sprint"

- [ ] **Step 2: Delete old API files**

Remove `api/generate.ts` and `src/services/gemini.ts`.

- [ ] **Step 3: Remove @google/genai from package.json**

Run: `cd /Users/annahervey/Projects/trailmind && npm uninstall @google/genai`

- [ ] **Step 4: Update App.tsx imports and handleGenerate**

In `src/App.tsx`:
- Change line 34 import from `'./services/gemini'` to `'./services/routeGenerator'`
- Rewrite `handleGenerate` (lines 187-200): call the new synchronous `generateRoutes()` instead of async API call. Still needs try/catch for geocoding step. Pass center coordinates from current map view or geocoded location.

- [ ] **Step 5: Verify build succeeds**

Run: `cd /Users/annahervey/Projects/trailmind && npm run build`
Expected: Clean build with no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: replace Gemini API with algorithmic route generator

Removes dependency on external API. Routes are generated client-side
based on ride type, location, and user profile. Zero cost, instant,
always works."
```

---

## Task 2: Error Handling, Loading States, Toast (P0 #1, #2)

**Files:**
- Modify: `src/App.tsx:187-200` (handleGenerate error handling)
- Modify: `src/App.tsx:336-343` (Generate button UX)
- Modify: `src/App.tsx` (add toast state + component)

- [ ] **Step 1: Add toast notification state and component**

In `src/App.tsx`, add state:
```typescript
const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' } | null>(null);
```

Add inline Toast component rendered at bottom of the main layout (before closing `</div>`):
```tsx
<AnimatePresence>
  {toast && (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 50 }}
      className={cn(
        "fixed bottom-28 left-1/2 -translate-x-1/2 z-[9999] px-6 py-3 rounded-xl shadow-lg text-sm font-medium",
        toast.type === 'error' ? "bg-red-500 text-white" : "bg-emerald-500 text-white"
      )}
    >
      {toast.message}
    </motion.div>
  )}
</AnimatePresence>
```

Auto-dismiss after 4 seconds with useEffect watching `toast`.

- [ ] **Step 2: Rewrite handleGenerate with proper error handling**

```typescript
const handleGenerate = async () => {
  if (!profile) return;
  setIsGenerating(true);
  setToast(null);
  try {
    // Geocode location to get center coordinates
    const coords = await geocodeLocation(locationInput);
    if (!coords) {
      setToast({ message: 'Could not find this location. Try a city name or address.', type: 'error' });
      return;
    }
    const fullIntent = `${selectedChips.join(', ')} ${intent}`.trim();
    const options = generateRoutes(fullIntent, locationInput, coords, profile);
    setRouteOptions(options);
    setSelectedRoute(options[0]);
  } catch (err) {
    console.error("Generation failed", err);
    setToast({ message: 'Failed to generate ride plan. Please try again.', type: 'error' });
    // Do NOT reset form state — preserve selectedChips, intent, locationInput
  } finally {
    setIsGenerating(false);
  }
};
```

Key: No form state reset on error. Only reset on success if design calls for it.

- [ ] **Step 3: Improve Generate button loading state**

Change the Button at line 336-343:
```tsx
<Button
  onClick={handleGenerate}
  className="w-full py-4"
  loading={isGenerating}
  disabled={!locationInput || selectedChips.length === 0}
>
  {isGenerating ? 'Generating...' : 'Generate Ride Plan'}
</Button>
```

The existing Button component already has a spinner when `loading=true`. Change disabled condition to require both location AND at least one ride type chip.

- [ ] **Step 4: Add generating skeleton state below button**

When `isGenerating` is true, show a shimmer placeholder where route options will appear:
```tsx
{isGenerating && (
  <div className="space-y-4">
    <div className="h-24 bg-zinc-100 rounded-2xl animate-pulse" />
    <div className="h-24 bg-zinc-100 rounded-2xl animate-pulse delay-75" />
  </div>
)}
```

- [ ] **Step 5: Verify error handling works**

Run dev server, test with empty location, test with valid location. Verify toast appears on error, form state preserved.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat: add error handling, loading states, and toast notifications (P0 #1, #2)"
```

---

## Task 3: Fix Page Title + Tab Titles (P0 #3)

**Files:**
- Modify: `src/App.tsx` (add useEffect for document.title per tab)

Note: `index.html` already has `<title>TrailMind</title>`. The "Authentication Required" title comes from Vercel deployment protection (preview URLs). This is fixed by using a production domain or disabling Vercel auth. But we should also add dynamic titles per tab.

- [ ] **Step 1: Add dynamic document.title**

In App.tsx, add useEffect after the activeTab state:
```typescript
useEffect(() => {
  const titles: Record<string, string> = {
    plan: 'TrailMind — Plan Your Ride',
    history: 'TrailMind — Ride History',
    profile: 'TrailMind — Profile'
  };
  document.title = titles[activeTab] || 'TrailMind';
}, [activeTab]);
```

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: add dynamic page titles per tab (P0 #3)"
```

---

## Task 4: Geocoding Autocomplete + Validation (P1 #5)

**Files:**
- Create: `src/services/geocoding.ts`
- Modify: `src/App.tsx:325-334` (location input section)

- [ ] **Step 1: Create geocoding service**

Create `src/services/geocoding.ts`:
```typescript
interface GeocodingResult {
  displayName: string;
  lat: number;
  lon: number;
}

export async function searchLocations(query: string): Promise<GeocodingResult[]> {
  if (query.length < 3) return [];
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'TrailMind/1.0' }
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.map((item: any) => ({
    displayName: item.display_name,
    lat: parseFloat(item.lat),
    lon: parseFloat(item.lon)
  }));
}

export async function geocodeLocation(query: string): Promise<[number, number] | null> {
  const results = await searchLocations(query);
  if (results.length === 0) return null;
  return [results[0].lat, results[0].lon];
}

export async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'TrailMind/1.0' }
  });
  if (!res.ok) return null;
  const data = await res.json();
  const addr = data.address;
  return addr?.city || addr?.town || addr?.village
    ? `${addr.city || addr.town || addr.village}, ${addr.state || addr.country}`
    : data.display_name?.split(',').slice(0, 2).join(',') || null;
}
```

- [ ] **Step 2: Add autocomplete state and dropdown to App.tsx**

Add state:
```typescript
const [locationSuggestions, setLocationSuggestions] = useState<GeocodingResult[]>([]);
const [showSuggestions, setShowSuggestions] = useState(false);
const [mapCenter, setMapCenter] = useState<[number, number]>([45.523062, -122.676482]);
```

Add debounced search in location input onChange. Replace the plain input (lines 327-333) with:
```tsx
<div className="relative">
  <input
    type="text"
    placeholder="Where are we riding?"
    className="w-full p-4 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-zinc-900 focus:border-transparent outline-none text-sm"
    value={locationInput}
    onChange={(e) => {
      setLocationInput(e.target.value);
      // Debounced Nominatim search
    }}
    onFocus={() => setShowSuggestions(true)}
  />
  {showSuggestions && locationSuggestions.length > 0 && (
    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-zinc-200 rounded-xl shadow-lg z-50 overflow-hidden">
      {locationSuggestions.map((s, i) => (
        <button
          key={i}
          className="w-full text-left px-4 py-3 text-sm hover:bg-zinc-50 border-b border-zinc-100 last:border-0"
          onClick={() => {
            setLocationInput(s.displayName.split(',').slice(0, 2).join(','));
            setMapCenter([s.lat, s.lon]);
            setShowSuggestions(false);
          }}
        >
          {s.displayName}
        </button>
      ))}
    </div>
  )}
</div>
```

Implement 300ms debounce using useRef + setTimeout pattern.

- [ ] **Step 3: Add MapCenterUpdater component**

Inside the MapContainer, add a component that responds to `mapCenter` state changes:
```tsx
function MapCenterUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, 13);
  }, [center, map]);
  return null;
}
```

- [ ] **Step 4: Verify autocomplete works**

Run dev server, type "Portland" in location field, verify dropdown appears with Nominatim results, selecting one recenters map.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add location autocomplete with Nominatim geocoding (P1 #5)"
```

---

## Task 5: Geolocation + "Use My Location" Button (P1 #7, P2 #11)

**Files:**
- Modify: `src/App.tsx` (location input section, map initialization)

- [ ] **Step 1: Add geolocation on initial load**

In App.tsx, add useEffect after component mount:
```typescript
useEffect(() => {
  if ('geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setMapCenter([latitude, longitude]);
        const name = await reverseGeocode(latitude, longitude);
        if (name) setLocationInput(name);
      },
      () => {
        // Denied or unavailable — keep Portland default, no error
      },
      { timeout: 5000 }
    );
  }
}, []);
```

- [ ] **Step 2: Add "Use my location" button**

Add a Crosshair/LocateFixed icon button next to (or inside) the location input:
```tsx
<button
  onClick={() => {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setMapCenter([latitude, longitude]);
        const name = await reverseGeocode(latitude, longitude);
        if (name) setLocationInput(name);
      },
      () => setToast({ message: 'Location access denied. Enter a location manually.', type: 'error' })
    );
  }}
  className="absolute right-3 top-1/2 -translate-y-1/2 p-2 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-zinc-900 transition-colors"
  title="Use my location"
>
  <Crosshair className="w-4 h-4" />
</button>
```

Import `Crosshair` from lucide-react (or `LocateFixed`).

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: add geolocation and 'use my location' button (P1 #7, P2 #11)"
```

---

## Task 6: Fix Form State Preservation + STATUS Box + Labels (P1 #4, #6, P2 #10)

**Files:**
- Modify: `src/App.tsx:187-200` (already partially done in Task 2)
- Modify: `src/App.tsx:300` ("Intent" label → "Ride Type")
- Modify: `src/App.tsx:507-510` (STATUS box)

- [ ] **Step 1: Verify form state preservation**

Confirm that `handleGenerate` from Task 2 does NOT reset `selectedChips`, `intent`, or `locationInput` on error. The current code in Task 2 already handles this. Only reset these on successful generation if desired (currently we don't reset on success either, which is fine).

- [ ] **Step 2: Change "Intent" label to "Ride Type"**

Line 300: Change `"Intent"` to `"Ride Type"`:
```tsx
<label className="text-sm font-semibold uppercase tracking-wider text-zinc-400">Ride Type</label>
```

- [ ] **Step 3: Fix STATUS box**

Replace the permanent STATUS box (lines 507-510) with a contextual help that only shows when no routes have been generated:
```tsx
{routeOptions.length === 0 && !isGenerating && (
  <div className="absolute top-4 right-4 z-[1000] bg-white/90 backdrop-blur p-3 rounded-xl border border-zinc-200 shadow-lg max-w-[200px]">
    <p className="text-[10px] font-bold uppercase text-zinc-400 mb-1">Saved Spots</p>
    <p className="text-xs font-medium text-zinc-600">Click anywhere on the map to save a favorite trailhead or fishing spot</p>
  </div>
)}
```

- [ ] **Step 4: Commit**

```bash
git commit -m "fix: form state preservation, rename Intent to Ride Type, improve STATUS box (P1 #4, #6, P2 #10)"
```

---

## Task 7: Responsive Nav + Button States (P2 #8, #12)

**Files:**
- Modify: `src/App.tsx:253-281` (header nav)
- Modify: `src/App.tsx:769-783` (bottom nav — already has `md:hidden`)
- Modify: `src/App.tsx:70` (disabled button style)

- [ ] **Step 1: Hide header tab nav on mobile**

The bottom nav already has `md:hidden`. Add `hidden md:flex` to the header tab group (line 261):
```tsx
<div className="hidden md:flex items-center gap-1 bg-zinc-100 p-1 rounded-xl">
```

- [ ] **Step 2: Improve disabled button state**

In the Button component (line 70), change disabled style:
```typescript
primary: "bg-zinc-900 text-white hover:bg-zinc-800 disabled:bg-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed",
```

- [ ] **Step 3: Add tooltip on disabled Generate button**

Wrap the Generate button with a title attribute when disabled:
```tsx
<div title={(!locationInput || selectedChips.length === 0) ? "Select a ride type and enter a location to generate" : undefined}>
  <Button ...>Generate Ride Plan</Button>
</div>
```

- [ ] **Step 4: Commit**

```bash
git commit -m "fix: responsive nav, improve disabled button states (P2 #8, #12)"
```

---

## Task 8: Map Tile Layers (P2 #9)

**Files:**
- Modify: `src/App.tsx:421-460` (main MapContainer)

- [ ] **Step 1: Add cycling/outdoor tile layer option**

Import `LayersControl` from react-leaflet. Replace the single TileLayer with a layers control:
```tsx
import { ..., LayersControl } from 'react-leaflet';

// Inside MapContainer:
<LayersControl position="topright">
  <LayersControl.BaseLayer checked name="Standard">
    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
  </LayersControl.BaseLayer>
  <LayersControl.BaseLayer name="Cycling">
    <TileLayer url="https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png" />
  </LayersControl.BaseLayer>
  <LayersControl.BaseLayer name="Terrain">
    <TileLayer url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png" />
  </LayersControl.BaseLayer>
</LayersControl>
```

CyclOSM is free and shows bike infrastructure. OpenTopoMap shows terrain/elevation.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: add cycling and terrain map tile layers (P2 #9)"
```

---

## Task 9: Polish — Character Counter, Empty States, Clear Button (P3 #13, #14, #15)

**Files:**
- Modify: `src/App.tsx:317-322` (vibe textarea)
- Modify: `src/App.tsx:631-676` (history tab)
- Modify: `src/App.tsx:336-343` (below generate button)

- [ ] **Step 1: Add character counter to vibe textarea**

Add maxLength=280 and a counter:
```tsx
<div className="relative">
  <textarea
    maxLength={280}
    placeholder="What's the vibe today? (e.g. 'I want to hit some flowy trails and end at the lake')"
    className="w-full p-4 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-zinc-900 focus:border-transparent outline-none min-h-[100px] text-sm"
    value={intent}
    onChange={(e) => setIntent(e.target.value)}
  />
  <p className="text-right text-xs text-zinc-400 mt-1">{intent.length}/280</p>
</div>
```

- [ ] **Step 2: Add empty state for History tab**

When `rides.length === 0`, show:
```tsx
{rides.length === 0 ? (
  <Card className="p-12 text-center space-y-4">
    <History className="w-12 h-12 text-zinc-300 mx-auto" />
    <div className="space-y-2">
      <h3 className="font-bold text-lg">No rides yet</h3>
      <p className="text-zinc-500 text-sm">Generate your first ride plan to see it here.</p>
    </div>
    <Button variant="secondary" onClick={() => setActiveTab('plan')}>Plan a Ride</Button>
  </Card>
) : (
  <div className="grid ...">...</div>
)}
```

- [ ] **Step 3: Add Clear/Reset button**

Below the Generate button:
```tsx
{(selectedChips.length > 0 || intent || locationInput) && (
  <button
    onClick={() => {
      setSelectedChips([]);
      setIntent('');
      setLocationInput('');
      setRouteOptions([]);
      setSelectedRoute(null);
    }}
    className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
  >
    Clear all
  </button>
)}
```

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: character counter, empty states, clear button (P3 #13, #14, #15)"
```

---

## Task 10: Visual Branding — Outdoor Color Palette (P3 #16)

**Files:**
- Modify: `src/index.css` (color tokens)
- Modify: `src/App.tsx` (accent colors throughout)

- [ ] **Step 1: Define outdoor color palette in index.css**

Add CSS custom properties and Tailwind theme extension:
```css
@theme {
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --color-trail: #2d5016;
  --color-trail-light: #4a7c28;
  --color-earth: #8B6914;
  --color-water: #1a6b8a;
  --color-ridge: #5c4033;
}
```

- [ ] **Step 2: Apply branding to key UI elements**

In App.tsx:
- Header logo background: `bg-zinc-900` → `bg-trail` (deep green)
- Selected ride type chips: `bg-zinc-900 border-zinc-900` → `bg-trail border-trail`
- Generate button: `bg-zinc-900 hover:bg-zinc-800` → `bg-trail hover:bg-trail-light`
- Page background: `bg-zinc-50` → subtle gradient: `bg-gradient-to-b from-zinc-50 to-stone-100`
- Active tab indicator colors use trail green
- Route polyline color: `#18181b` → `#2d5016` (trail green)

- [ ] **Step 3: Verify branding looks cohesive**

Run dev server, check all views (Plan, History, Profile) on desktop and mobile.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: outdoor color palette and visual branding (P3 #16)"
```

---

## Task 11: Final Build + Deploy Verification

**Files:** None new — verification only.

- [ ] **Step 1: Run full build**

```bash
cd /Users/annahervey/Projects/trailmind && npm run build
```
Expected: Clean build, no errors.

- [ ] **Step 2: Run type check**

```bash
npm run lint
```
Expected: No TypeScript errors.

- [ ] **Step 3: Test full user flow locally**

Run `npm run dev` and walk through: Welcome → Profile setup → Plan tab → Select ride type → Enter location → Generate → View route → Rate → History.

- [ ] **Step 4: Deploy to Vercel**

```bash
cd /Users/annahervey/Projects/trailmind && git push
```

Vercel auto-deploys from push. Verify the deployed URL works.

- [ ] **Step 5: Commit any final fixes**

If any issues found during testing, fix and commit.
