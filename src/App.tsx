import React, { useState, useEffect, useRef } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMapEvents,
  useMap,
  LayersControl
} from 'react-leaflet';
import {
  Bike,
  Map as MapIcon,
  User,
  History,
  Plus,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Wind,
  Mountain,
  Activity,
  ArrowRight,
  Settings,
  Save,
  Star,
  Edit2,
  Trash2,
  Crosshair,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { UserProfile, SavedLocation, RideHistory, RouteOption } from './types';
import { generateRoutes } from './services/routeGenerator';
import { searchLocations, geocodeLocation, reverseGeocode, type GeocodingResult } from './services/geocoding';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Components ---

const Card = ({ children, className, onClick, ...props }: { children: React.ReactNode; className?: string; onClick?: () => void; [key: string]: any }) => (
  <div
    {...props}
    onClick={onClick}
    className={cn("bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden", className)}
  >
    {children}
  </div>
);

const Button = ({
  children,
  onClick,
  variant = 'primary',
  className,
  disabled,
  loading,
  type = 'button'
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  className?: string;
  disabled?: boolean;
  loading?: boolean;
  type?: 'button' | 'submit' | 'reset';
}) => {
  const variants = {
    primary: "bg-trail text-white hover:bg-trail-light disabled:bg-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed",
    secondary: "bg-white text-zinc-900 border border-zinc-200 hover:bg-zinc-50",
    ghost: "bg-transparent text-zinc-600 hover:bg-zinc-100",
    danger: "bg-red-500 text-white hover:bg-red-600"
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        "px-4 py-2 rounded-xl font-medium transition-all flex items-center justify-center gap-2",
        variants[variant],
        className
      )}
    >
      {loading ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : children}
    </button>
  );
};

// Map helper to update center when location changes
function MapCenterUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  const prevCenter = useRef(center);
  useEffect(() => {
    if (center[0] !== prevCenter.current[0] || center[1] !== prevCenter.current[1]) {
      map.setView(center, 13);
      prevCenter.current = center;
    }
  }, [center, map]);
  return null;
}

// --- Main App ---

export default function App() {
  const [activeTab, setActiveTab] = useState<'plan' | 'history' | 'profile'>('plan');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [locations, setLocations] = useState<SavedLocation[]>([]);
  const [rides, setRides] = useState<RideHistory[]>([]);
  const [loading, setLoading] = useState(true);

  // Daily Input State
  const [intent, setIntent] = useState('');
  const [locationInput, setLocationInput] = useState('');
  const [selectedChips, setSelectedChips] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [routeOptions, setRouteOptions] = useState<RouteOption[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<RouteOption | null>(null);
  const [newLocationCoords, setNewLocationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [editingLocation, setEditingLocation] = useState<SavedLocation | null>(null);
  const [locationForm, setLocationForm] = useState({ name: '', notes: '' });

  // Toast state (P0 #1)
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' } | null>(null);

  // Map center state (P1 #7)
  const [mapCenter, setMapCenter] = useState<[number, number]>([45.523062, -122.676482]);

  // Autocomplete state (P1 #5)
  const [locationSuggestions, setLocationSuggestions] = useState<GeocodingResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Post-ride feedback state
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackRating, setFeedbackRating] = useState(0);

  const chips = ["Commute", "Trail Ride", "Fishing Access", "Training", "Casual"];

  // Dynamic page title (P0 #3)
  useEffect(() => {
    const titles: Record<string, string> = {
      plan: 'TrailMind — Plan Your Ride',
      history: 'TrailMind — Ride History',
      profile: 'TrailMind — Profile'
    };
    document.title = titles[activeTab] || 'TrailMind';
  }, [activeTab]);

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Geolocation on initial load (P1 #7)
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
          // Denied or unavailable — keep Portland default
        },
        { timeout: 5000 }
      );
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, []);

  const MapEvents = () => {
    useMapEvents({
      click(e) {
        setNewLocationCoords(e.latlng);
      },
    });
    return null;
  };

  const handleSaveLocation = () => {
    if (!newLocationCoords) return;
    const newLoc: SavedLocation = {
      id: Math.random().toString(36).substr(2, 9),
      name: locationForm.name || 'New Spot',
      lat: newLocationCoords.lat,
      lng: newLocationCoords.lng,
      notes: locationForm.notes
    };

    const updated = [...locations, newLoc];
    setLocations(updated);
    localStorage.setItem('trailmind_locations', JSON.stringify(updated));
    setNewLocationCoords(null);
    setLocationForm({ name: '', notes: '' });
  };

  const handleUpdateLocation = () => {
    if (!editingLocation) return;

    const updated = locations.map(loc =>
      loc.id === editingLocation.id
        ? { ...loc, name: locationForm.name, notes: locationForm.notes }
        : loc
    );
    setLocations(updated);
    localStorage.setItem('trailmind_locations', JSON.stringify(updated));
    setEditingLocation(null);
    setLocationForm({ name: '', notes: '' });
  };

  const handleDeleteLocation = (id: string) => {
    if (!confirm('Are you sure you want to delete this spot?')) return;
    const updated = locations.filter(loc => loc.id !== id);
    setLocations(updated);
    localStorage.setItem('trailmind_locations', JSON.stringify(updated));
  };

  const fetchData = () => {
    try {
      const savedProfile = localStorage.getItem('trailmind_profile');
      const savedLocations = localStorage.getItem('trailmind_locations');
      const savedRides = localStorage.getItem('trailmind_rides');

      if (savedProfile) setProfile(JSON.parse(savedProfile));
      if (savedLocations) setLocations(JSON.parse(savedLocations));
      if (savedRides) setRides(JSON.parse(savedRides));
    } catch (err) {
      console.error("Failed to load data", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = (newProfile: UserProfile) => {
    localStorage.setItem('trailmind_profile', JSON.stringify(newProfile));
    setProfile(newProfile);
    setActiveTab('plan');
  };

  // Rewritten handleGenerate with error handling (P0 #1), loading (P0 #2), form preservation (P1 #4)
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
      setMapCenter([coords[0], coords[1]]);
      const fullIntent = `${selectedChips.join(', ')} ${intent}`.trim();
      const options = generateRoutes(fullIntent, locationInput, [coords[0], coords[1]], profile);
      setRouteOptions(options);
      setSelectedRoute(options[0]);
      setToast({ message: `Generated ${options.length} route options!`, type: 'success' });
    } catch (err) {
      console.error("Generation failed", err);
      setToast({ message: 'Failed to generate ride plan. Please try again.', type: 'error' });
      // Do NOT reset form state — preserve selectedChips, intent, locationInput
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCompleteRide = () => {
    if (!selectedRoute) return;
    const newRide: RideHistory = {
      id: Math.random().toString(36).substr(2, 9),
      date: new Date().toISOString(),
      route: selectedRoute.coordinates,
      distance: parseFloat(selectedRoute.distance),
      elevation: parseFloat(selectedRoute.elevation),
      feedback: feedbackText || undefined,
      rating: feedbackRating || undefined
    };

    const updated = [newRide, ...rides];
    setRides(updated);
    localStorage.setItem('trailmind_rides', JSON.stringify(updated));
    setSelectedRoute(null);
    setRouteOptions([]);
    setFeedbackText('');
    setFeedbackRating(0);
    setActiveTab('history');
  };

  // Location autocomplete handler (P1 #5)
  const handleLocationInputChange = (value: string) => {
    setLocationInput(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (value.length < 3) {
      setLocationSuggestions([]);
      return;
    }
    searchTimeoutRef.current = setTimeout(async () => {
      const results = await searchLocations(value);
      setLocationSuggestions(results);
      setShowSuggestions(true);
    }, 300);
  };

  // Use my location handler (P1 #7, P2 #11)
  const handleUseMyLocation = () => {
    if (!('geolocation' in navigator)) {
      setToast({ message: 'Geolocation not available in this browser.', type: 'error' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setMapCenter([latitude, longitude]);
        const name = await reverseGeocode(latitude, longitude);
        if (name) setLocationInput(name);
      },
      () => setToast({ message: 'Location access denied. Enter a location manually.', type: 'error' })
    );
  };

  // Clear form handler (P3 #15)
  const handleClearForm = () => {
    setSelectedChips([]);
    setIntent('');
    setLocationInput('');
    setRouteOptions([]);
    setSelectedRoute(null);
  };

  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-gradient-to-b from-zinc-50 to-stone-100">
      <div className="flex flex-col items-center gap-4">
        <Bike className="w-12 h-12 text-trail animate-bounce" />
        <p className="text-zinc-500 font-medium">Loading TrailMind...</p>
      </div>
    </div>
  );

  if (!profile && activeTab !== 'profile') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-stone-100 p-6 flex items-center justify-center">
        <Card className="max-w-md w-full p-8 text-center space-y-6">
          <div className="w-16 h-16 bg-trail rounded-full flex items-center justify-center mx-auto">
            <Bike className="w-8 h-8 text-white" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">Welcome to TrailMind</h1>
            <p className="text-zinc-500">Let's set up your profile to get personalized ride plans.</p>
          </div>
          <Button onClick={() => setActiveTab('profile')} className="w-full">
            Start Setup
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-stone-100 pb-24">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-50 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-trail rounded-xl flex items-center justify-center">
              <Bike className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">TrailMind</h1>
          </div>
          {/* Desktop nav only (P2 #8) */}
          <div className="hidden md:flex items-center gap-1 bg-zinc-100 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('plan')}
              className={cn("px-4 py-1.5 rounded-lg text-sm font-medium transition-all", activeTab === 'plan' ? "bg-white shadow-sm text-trail" : "text-zinc-500 hover:text-zinc-900")}
            >
              Plan
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={cn("px-4 py-1.5 rounded-lg text-sm font-medium transition-all", activeTab === 'history' ? "bg-white shadow-sm text-trail" : "text-zinc-500 hover:text-zinc-900")}
            >
              History
            </button>
            <button
              onClick={() => setActiveTab('profile')}
              className={cn("px-4 py-1.5 rounded-lg text-sm font-medium transition-all", activeTab === 'profile' ? "bg-white shadow-sm text-trail" : "text-zinc-500 hover:text-zinc-900")}
            >
              Profile
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-6">
        <AnimatePresence mode="wait">
          {activeTab === 'plan' && (
            <motion.div
              key="plan"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {!selectedRoute ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Input Section */}
                  <div className="lg:col-span-1 space-y-6">
                    <Card className="p-6 space-y-6">
                      <div className="space-y-4">
                        {/* P2 #10: "Intent" → "Ride Type" */}
                        <label className="text-sm font-semibold uppercase tracking-wider text-zinc-400">Ride Type</label>
                        <div className="flex flex-wrap gap-2">
                          {chips.map(chip => (
                            <button
                              key={chip}
                              onClick={() => setSelectedChips(prev => prev.includes(chip) ? prev.filter(c => c !== chip) : [...prev, chip])}
                              className={cn(
                                "px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                                selectedChips.includes(chip)
                                  ? "bg-trail border-trail text-white"
                                  : "bg-white border-zinc-200 text-zinc-600 hover:border-zinc-400"
                              )}
                            >
                              {chip}
                            </button>
                          ))}
                        </div>
                        {/* P3 #13: Character counter on textarea */}
                        <div>
                          <textarea
                            maxLength={280}
                            placeholder="What's the vibe today? (e.g. 'I want to hit some flowy trails and end at the lake')"
                            className="w-full p-4 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-trail focus:border-transparent outline-none min-h-[100px] text-sm"
                            value={intent}
                            onChange={(e) => setIntent(e.target.value)}
                          />
                          <p className="text-right text-xs text-zinc-400 mt-1">{intent.length}/280</p>
                        </div>
                      </div>

                      {/* Location with autocomplete (P1 #5) and geolocation button (P1 #7, P2 #11) */}
                      <div className="space-y-4">
                        <label className="text-sm font-semibold uppercase tracking-wider text-zinc-400">Location</label>
                        <div className="relative">
                          <input
                            type="text"
                            placeholder="Where are we riding?"
                            className="w-full p-4 pr-12 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-trail focus:border-transparent outline-none text-sm"
                            value={locationInput}
                            onChange={(e) => handleLocationInputChange(e.target.value)}
                            onFocus={() => { if (locationSuggestions.length > 0) setShowSuggestions(true); }}
                            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                          />
                          <button
                            onClick={handleUseMyLocation}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-trail transition-colors"
                            title="Use my location"
                          >
                            <Crosshair className="w-4 h-4" />
                          </button>
                          {/* Autocomplete dropdown */}
                          {showSuggestions && locationSuggestions.length > 0 && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-zinc-200 rounded-xl shadow-lg z-50 overflow-hidden">
                              {locationSuggestions.map((s, i) => (
                                <button
                                  key={i}
                                  className="w-full text-left px-4 py-3 text-sm hover:bg-zinc-50 border-b border-zinc-100 last:border-0 text-zinc-700"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    const shortName = s.displayName.split(',').slice(0, 2).join(',').trim();
                                    setLocationInput(shortName);
                                    setMapCenter([s.lat, s.lon]);
                                    setShowSuggestions(false);
                                    setLocationSuggestions([]);
                                  }}
                                >
                                  {s.displayName}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Generate button with improved states (P0 #2, P2 #12) */}
                      <div title={(!locationInput || selectedChips.length === 0) ? "Select a ride type and enter a location to generate" : undefined}>
                        <Button
                          onClick={handleGenerate}
                          className="w-full py-4"
                          loading={isGenerating}
                          disabled={!locationInput || selectedChips.length === 0}
                        >
                          {isGenerating ? 'Generating...' : 'Generate Ride Plan'}
                        </Button>
                      </div>

                      {/* P3 #15: Clear form button */}
                      {(selectedChips.length > 0 || intent || locationInput) && (
                        <button
                          onClick={handleClearForm}
                          className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors w-full text-center"
                        >
                          Clear all
                        </button>
                      )}
                    </Card>

                    {/* Loading skeleton (P0 #2) */}
                    {isGenerating && (
                      <div className="space-y-4">
                        <div className="h-24 bg-zinc-100 rounded-2xl animate-pulse" />
                        <div className="h-24 bg-zinc-100 rounded-2xl animate-pulse" style={{ animationDelay: '75ms' }} />
                      </div>
                    )}

                    {routeOptions.length > 0 && !isGenerating && (
                      <div className="space-y-4">
                        <h3 className="font-bold text-lg">Route Options</h3>
                        {routeOptions.map((option) => (
                          <Card
                            key={option.id}
                            className={cn(
                              "p-4 cursor-pointer hover:border-trail/50 transition-all",
                              selectedRoute?.id === option.id && "border-trail ring-1 ring-trail"
                            )}
                            onClick={() => setSelectedRoute(option)}
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <h4 className="font-bold">{option.name}</h4>
                                <p className="text-xs text-zinc-500 mt-1">{option.terrain}</p>
                              </div>
                              <div className="text-right">
                                <p className="font-bold text-sm">{option.distance}</p>
                                <p className="text-[10px] text-zinc-400 uppercase font-bold">{option.elevation}</p>
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    )}

                    {locations.length > 0 && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="font-bold text-lg">Saved Spots</h3>
                          <p className="text-[10px] font-bold uppercase text-zinc-400">{locations.length}</p>
                        </div>
                        <div className="space-y-2">
                          {locations.map(loc => (
                            <Card
                              key={loc.id}
                              className="p-3 hover:border-zinc-400 transition-all group"
                            >
                              <div className="flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                  <MapIcon className="w-3 h-3 text-zinc-400" />
                                  <span className="text-sm font-medium">{loc.name}</span>
                                </div>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingLocation(loc);
                                      setLocationForm({ name: loc.name, notes: loc.notes });
                                    }}
                                    className="p-1 hover:bg-zinc-100 rounded text-zinc-500"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteLocation(loc.id);
                                    }}
                                    className="p-1 hover:bg-red-50 rounded text-red-500"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Map Preview Section */}
                  <div className="lg:col-span-2 h-[600px] rounded-2xl overflow-hidden border border-zinc-200 shadow-sm relative">
                    <MapContainer
                      center={mapCenter}
                      zoom={13}
                      className="h-full w-full"
                    >
                      {/* P2 #9: Map tile layers */}
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
                      <MapCenterUpdater center={mapCenter} />
                      <MapEvents />
                      {locations.map(loc => (
                        <Marker key={loc.id} position={[loc.lat, loc.lng]}>
                          <Popup>
                            <div className="p-2 min-w-[150px]">
                              <div className="flex justify-between items-start mb-2">
                                <h5 className="font-bold">{loc.name}</h5>
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => {
                                      setEditingLocation(loc);
                                      setLocationForm({ name: loc.name, notes: loc.notes });
                                    }}
                                    className="p-1 hover:bg-zinc-100 rounded text-zinc-500"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteLocation(loc.id)}
                                    className="p-1 hover:bg-red-50 rounded text-red-500"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                              <p className="text-xs text-zinc-600">{loc.notes}</p>
                            </div>
                          </Popup>
                        </Marker>
                      ))}
                      {newLocationCoords && (
                        <Marker position={[newLocationCoords.lat, newLocationCoords.lng]} />
                      )}
                      {/* Show route polyline on map when routes are generated */}
                      {routeOptions.length > 0 && selectedRoute && (
                        <>
                          <Polyline positions={selectedRoute.coordinates} color="#2d5016" weight={4} opacity={0.8} />
                          <Marker position={selectedRoute.coordinates[0]} />
                          <Marker position={selectedRoute.coordinates[selectedRoute.coordinates.length - 1]} />
                        </>
                      )}
                    </MapContainer>

                    <AnimatePresence>
                      {(newLocationCoords || editingLocation) && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.9, y: 20 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.9, y: 20 }}
                          className="absolute bottom-6 left-6 right-6 z-[1000] md:left-auto md:w-80"
                        >
                          <Card className="p-6 shadow-2xl border-zinc-900/10">
                            <div className="flex items-center justify-between mb-4">
                              <h3 className="font-bold">{editingLocation ? 'Edit Spot' : 'Save New Spot'}</h3>
                              <button
                                onClick={() => {
                                  setNewLocationCoords(null);
                                  setEditingLocation(null);
                                  setLocationForm({ name: '', notes: '' });
                                }}
                                className="text-zinc-400 hover:text-zinc-900"
                              >
                                <X className="w-5 h-5" />
                              </button>
                            </div>
                            <div className="space-y-4">
                              <input
                                type="text"
                                placeholder="Spot Name (e.g. Secret Trailhead)"
                                className="w-full p-3 rounded-xl border border-zinc-200 text-sm"
                                value={locationForm.name}
                                onChange={(e) => setLocationForm({ ...locationForm, name: e.target.value })}
                              />
                              <textarea
                                placeholder="Notes about this spot..."
                                className="w-full p-3 rounded-xl border border-zinc-200 text-sm min-h-[80px]"
                                value={locationForm.notes}
                                onChange={(e) => setLocationForm({ ...locationForm, notes: e.target.value })}
                              />
                              <Button onClick={editingLocation ? handleUpdateLocation : handleSaveLocation} className="w-full">
                                {editingLocation ? 'Update Location' : 'Save Location'}
                              </Button>
                            </div>
                          </Card>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* P1 #6: Contextual STATUS box — only when no routes generated */}
                    {routeOptions.length === 0 && !isGenerating && (
                      <div className="absolute top-4 left-4 z-[1000] bg-white/90 backdrop-blur p-3 rounded-xl border border-zinc-200 shadow-lg max-w-[200px]">
                        <p className="text-[10px] font-bold uppercase text-zinc-400 mb-1">Saved Spots</p>
                        <p className="text-xs font-medium text-zinc-600">Click anywhere on the map to save a favorite trailhead or fishing spot</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <Button variant="ghost" onClick={() => setSelectedRoute(null)}>
                      <ArrowRight className="w-4 h-4 rotate-180" /> Back to Options
                    </Button>
                    <h2 className="text-2xl font-bold">{selectedRoute.name}</h2>
                    <Button onClick={() => {}}>Start Ride</Button>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Map Detail */}
                    <div className="lg:col-span-2 h-[400px] rounded-2xl overflow-hidden border border-zinc-200 shadow-sm">
                      <MapContainer
                        center={selectedRoute.coordinates[0]}
                        zoom={14}
                        className="h-full w-full"
                      >
                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                        <Polyline positions={selectedRoute.coordinates} color="#2d5016" weight={4} />
                        <Marker position={selectedRoute.coordinates[0]} />
                        <Marker position={selectedRoute.coordinates[selectedRoute.coordinates.length - 1]} />
                      </MapContainer>
                    </div>

                    {/* Stats & Setup */}
                    <div className="space-y-6">
                      <Card className="p-6 space-y-4">
                        <div className="flex items-center gap-3">
                          <Activity className="w-5 h-5 text-trail" />
                          <div>
                            <p className="text-[10px] font-bold uppercase text-zinc-400">Stats</p>
                            <p className="text-sm font-bold">{selectedRoute.distance} • {selectedRoute.elevation}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Wind className="w-5 h-5 text-water" />
                          <div>
                            <p className="text-[10px] font-bold uppercase text-zinc-400">Conditions</p>
                            <p className="text-sm font-bold">{selectedRoute.conditions}</p>
                          </div>
                        </div>
                      </Card>

                      <Card className="p-6 space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Settings className="w-4 h-4" />
                          <h3 className="font-bold">Bike Setup</h3>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-zinc-50 p-3 rounded-xl">
                            <p className="text-[10px] font-bold uppercase text-zinc-400">Tire PSI</p>
                            <p className="font-bold">{selectedRoute.bikeSetup.psi}</p>
                          </div>
                          <div className="bg-zinc-50 p-3 rounded-xl">
                            <p className="text-[10px] font-bold uppercase text-zinc-400">Suspension</p>
                            <p className="font-bold">{selectedRoute.bikeSetup.suspension}</p>
                          </div>
                        </div>
                      </Card>
                    </div>

                    {/* Body Prep & Gear */}
                    <Card className="p-6 space-y-4">
                      <div className="flex items-center gap-2 mb-2">
                        <User className="w-4 h-4" />
                        <h3 className="font-bold">Body Prep</h3>
                      </div>
                      <ul className="space-y-3">
                        {selectedRoute.bodyPrep.map((prep, i) => (
                          <li key={i} className="flex items-start gap-3 text-sm">
                            <CheckCircle2 className="w-4 h-4 text-trail mt-0.5 shrink-0" />
                            <span>{prep}</span>
                          </li>
                        ))}
                      </ul>
                    </Card>

                    <Card className="p-6 space-y-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Plus className="w-4 h-4" />
                        <h3 className="font-bold">Pack List</h3>
                      </div>
                      <ul className="space-y-3">
                        {selectedRoute.gearList.map((item, i) => (
                          <li key={i} className="flex items-start gap-3 text-sm">
                            <div className="w-1.5 h-1.5 rounded-full bg-trail/40 mt-2 shrink-0" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </Card>

                    <Card className="p-6 space-y-4">
                      <h3 className="font-bold">Post-Ride Feedback</h3>
                      <div className="space-y-4">
                        <div className="flex gap-2">
                          {[1, 2, 3, 4, 5].map(star => (
                            <button
                              key={star}
                              onClick={() => setFeedbackRating(star)}
                              className={cn(
                                "transition-colors",
                                star <= feedbackRating ? "text-yellow-400" : "text-zinc-300 hover:text-yellow-300"
                              )}
                            >
                              <Star className={cn("w-6 h-6", star <= feedbackRating && "fill-yellow-400")} />
                            </button>
                          ))}
                        </div>
                        <textarea
                          placeholder="How was the ride? Any issues with the route or bike setup?"
                          className="w-full p-4 rounded-xl border border-zinc-200 text-sm min-h-[80px]"
                          value={feedbackText}
                          onChange={(e) => setFeedbackText(e.target.value)}
                        />
                        <Button className="w-full" onClick={handleCompleteRide}>
                          Save to History
                        </Button>
                      </div>
                    </Card>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'history' && (
            <motion.div
              key="history"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">Ride History</h2>
                <p className="text-zinc-500 text-sm">{rides.length} rides completed</p>
              </div>

              {/* P3 #14: Empty state for History */}
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {rides.map(ride => (
                    <Card key={ride.id} className="p-6 space-y-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-xs font-bold text-zinc-400 uppercase">{new Date(ride.date).toLocaleDateString()}</p>
                          <h3 className="font-bold text-lg">{ride.distance} miles</h3>
                        </div>
                        <div className="flex gap-1">
                          {Array.from({ length: ride.rating || 0 }).map((_, i) => (
                            <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                          ))}
                        </div>
                      </div>
                      <div className="h-32 bg-zinc-100 rounded-xl overflow-hidden">
                        <MapContainer
                          center={ride.route[0]}
                          zoom={12}
                          zoomControl={false}
                          dragging={false}
                          className="h-full w-full"
                        >
                          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                          <Polyline positions={ride.route} color="#2d5016" weight={3} />
                        </MapContainer>
                      </div>
                      {ride.feedback && (
                        <p className="text-sm text-zinc-600 italic">"{ride.feedback}"</p>
                      )}
                    </Card>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'profile' && (
            <motion.div
              key="profile"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-2xl mx-auto"
            >
              <Card className="p-8 space-y-8">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-trail rounded-2xl flex items-center justify-center">
                    <User className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">User Profile</h2>
                    <p className="text-zinc-500">Manage your body and bike details</p>
                  </div>
                </div>

                <form className="space-y-6" onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  const newProfile: UserProfile = {
                    height: formData.get('height') as string,
                    weight: formData.get('weight') as string,
                    inseam: formData.get('inseam') as string,
                    injuries: (formData.get('injuries') as string).split(',').map(s => s.trim()).filter(Boolean),
                    bikeType: formData.get('bikeType') as string,
                    wheelSize: formData.get('wheelSize') as string,
                    suspension: formData.get('suspension') as string,
                    homeBase: formData.get('homeBase') as string,
                  };
                  handleSaveProfile(newProfile);
                }}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase text-zinc-400">Height</label>
                      <input name="height" defaultValue={profile?.height} placeholder="e.g. 180cm" className="w-full p-3 rounded-xl border border-zinc-200" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase text-zinc-400">Weight</label>
                      <input name="weight" defaultValue={profile?.weight} placeholder="e.g. 75kg" className="w-full p-3 rounded-xl border border-zinc-200" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase text-zinc-400">Inseam</label>
                      <input name="inseam" defaultValue={profile?.inseam} placeholder="e.g. 82cm" className="w-full p-3 rounded-xl border border-zinc-200" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase text-zinc-400">Home Base</label>
                      <input name="homeBase" defaultValue={profile?.homeBase} placeholder="City, State" className="w-full p-3 rounded-xl border border-zinc-200" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-zinc-400">Injuries / Limitations</label>
                    <input name="injuries" defaultValue={profile?.injuries.join(', ')} placeholder="e.g. Lower back pain, Left knee surgery" className="w-full p-3 rounded-xl border border-zinc-200" />
                  </div>

                  <hr className="border-zinc-100" />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase text-zinc-400">Bike Type</label>
                      <select name="bikeType" defaultValue={profile?.bikeType} className="w-full p-3 rounded-xl border border-zinc-200">
                        <option>Mountain Bike</option>
                        <option>Gravel Bike</option>
                        <option>Road Bike</option>
                        <option>E-Bike</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase text-zinc-400">Wheel Size</label>
                      <input name="wheelSize" defaultValue={profile?.wheelSize} placeholder="e.g. 29 inch" className="w-full p-3 rounded-xl border border-zinc-200" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase text-zinc-400">Suspension</label>
                      <input name="suspension" defaultValue={profile?.suspension} placeholder="e.g. Full 140mm" className="w-full p-3 rounded-xl border border-zinc-200" />
                    </div>
                  </div>

                  <Button type="submit" className="w-full py-4">
                    <Save className="w-4 h-4" /> Save Profile
                  </Button>
                </form>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Nav - Mobile only (P2 #8) */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-zinc-200 px-6 py-3 flex justify-around md:hidden z-50">
        <button onClick={() => setActiveTab('plan')} className={cn("flex flex-col items-center gap-1", activeTab === 'plan' ? "text-trail" : "text-zinc-400")}>
          <MapIcon className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase">Plan</span>
        </button>
        <button onClick={() => setActiveTab('history')} className={cn("flex flex-col items-center gap-1", activeTab === 'history' ? "text-trail" : "text-zinc-400")}>
          <History className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase">History</span>
        </button>
        <button onClick={() => setActiveTab('profile')} className={cn("flex flex-col items-center gap-1", activeTab === 'profile' ? "text-trail" : "text-zinc-400")}>
          <User className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase">Profile</span>
        </button>
      </div>

      {/* Toast notification (P0 #1) */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className={cn(
              "fixed bottom-28 left-1/2 -translate-x-1/2 z-[9999] px-6 py-3 rounded-xl shadow-lg text-sm font-medium max-w-sm text-center",
              toast.type === 'error' ? "bg-red-500 text-white" : "bg-trail text-white"
            )}
          >
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
