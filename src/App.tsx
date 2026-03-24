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
  CheckCircle2,
  Wind,
  Activity,
  ArrowRight,
  Settings,
  Save,
  Star,
  Edit2,
  Trash2,
  Crosshair,
  X,
  Bookmark,
  BookmarkPlus,
  Briefcase,
  Mountain,
  Fish,
  Timer,
  Sun,
  ChevronDown,
  ChevronUp,
  MapPin,
  Layers,
  Navigation
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

// --- Ride type config with icons ---
const RIDE_TYPES = [
  { label: "Commute", icon: Briefcase },
  { label: "Trail Ride", icon: Mountain },
  { label: "Fishing Access", icon: Fish },
  { label: "Training", icon: Timer },
  { label: "Casual", icon: Sun },
] as const;

// --- Components ---

const Card = ({ children, className, onClick, ...props }: { children: React.ReactNode; className?: string; onClick?: () => void; [key: string]: any }) => (
  <div
    {...props}
    onClick={onClick}
    className={cn("bg-surface rounded-2xl border border-[var(--color-border-strong)] shadow-[0_1px_3px_rgba(0,0,0,0.08)] overflow-hidden", className)}
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
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
  className?: string;
  disabled?: boolean;
  loading?: boolean;
  type?: 'button' | 'submit' | 'reset';
}) => {
  const variants = {
    primary: "bg-primary text-white hover:bg-primary-light disabled:bg-[#CCCCCC] disabled:opacity-40 disabled:cursor-not-allowed",
    accent: "bg-accent text-white hover:bg-accent-light disabled:bg-[#CCCCCC] disabled:opacity-40 disabled:cursor-not-allowed",
    secondary: "bg-surface text-text border border-[var(--color-border-strong)] hover:bg-bg",
    ghost: "bg-transparent text-text-secondary hover:bg-bg",
    danger: "bg-danger text-white hover:opacity-90"
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

// Map helper to update center
function MapCenterUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  const prevCenter = useRef(center);
  useEffect(() => {
    if (center[0] !== prevCenter.current[0] || center[1] !== prevCenter.current[1]) {
      map.flyTo(center, 13, { duration: 1.2 });
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
  const [generatingTime, setGeneratingTime] = useState(0);
  const [routeOptions, setRouteOptions] = useState<RouteOption[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<RouteOption | null>(null);
  const [newLocationCoords, setNewLocationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [editingLocation, setEditingLocation] = useState<SavedLocation | null>(null);
  const [locationForm, setLocationForm] = useState({ name: '', notes: '' });

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' } | null>(null);

  // Map state
  const [mapCenter, setMapCenter] = useState<[number, number]>([45.523062, -122.676482]);
  const [saveSpotMode, setSaveSpotMode] = useState(false);

  // Autocomplete state
  const [locationSuggestions, setLocationSuggestions] = useState<GeocodingResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Saved spots panel
  const [spotsExpanded, setSpotsExpanded] = useState(false);

  // Post-ride feedback state
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackRating, setFeedbackRating] = useState(0);

  // Mobile panel state
  const [mobilePanelOpen, setMobilePanelOpen] = useState(true);

  // Dynamic page title
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

  // Generation timer
  useEffect(() => {
    if (!isGenerating) { setGeneratingTime(0); return; }
    const timer = setInterval(() => setGeneratingTime(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, [isGenerating]);

  // Geolocation on initial load
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords;
          setMapCenter([latitude, longitude]);
          const name = await reverseGeocode(latitude, longitude);
          if (name) setLocationInput(name);
        },
        () => {},
        { timeout: 5000 }
      );
    }
  }, []);

  useEffect(() => { fetchData(); }, []);

  const MapEvents = () => {
    useMapEvents({
      click(e) {
        if (saveSpotMode) {
          setNewLocationCoords(e.latlng);
          setSaveSpotMode(false);
        }
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
    setToast({ message: 'Spot saved!', type: 'success' });
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
    if (!confirm('Delete this spot?')) return;
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

  const handleGenerate = async () => {
    if (!profile) return;
    setIsGenerating(true);
    setToast(null);
    try {
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
      setToast({ message: `${options.length} routes generated!`, type: 'success' });
    } catch (err) {
      console.error("Generation failed", err);
      setToast({ message: 'Failed to generate ride plan. Please try again.', type: 'error' });
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

  const handleLocationInputChange = (value: string) => {
    setLocationInput(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (value.length < 3) { setLocationSuggestions([]); return; }
    searchTimeoutRef.current = setTimeout(async () => {
      const results = await searchLocations(value);
      setLocationSuggestions(results);
      setShowSuggestions(true);
    }, 300);
  };

  const handleUseMyLocation = () => {
    if (!('geolocation' in navigator)) {
      setToast({ message: 'Geolocation not available.', type: 'error' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setMapCenter([latitude, longitude]);
        const name = await reverseGeocode(latitude, longitude);
        if (name) setLocationInput(name);
      },
      () => setToast({ message: 'Location access denied.', type: 'error' })
    );
  };

  const handleClearForm = () => {
    setSelectedChips([]);
    setIntent('');
    setLocationInput('');
    setRouteOptions([]);
    setSelectedRoute(null);
  };

  const useSpotAsLocation = (loc: SavedLocation) => {
    setLocationInput(loc.name);
    setMapCenter([loc.lat, loc.lng]);
  };

  // --- Loading screen ---
  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-bg">
      <div className="flex flex-col items-center gap-4">
        <Bike className="w-12 h-12 text-primary animate-bounce" />
        <p className="text-text-secondary font-medium">Loading TrailMind...</p>
      </div>
    </div>
  );

  // --- Welcome / onboarding ---
  if (!profile && activeTab !== 'profile') {
    return (
      <div className="min-h-screen bg-bg p-6 flex items-center justify-center">
        <Card className="max-w-md w-full p-8 text-center space-y-6">
          <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto">
            <Bike className="w-8 h-8 text-white" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-text">Welcome to TrailMind</h1>
            <p className="text-text-secondary">Set up your profile to get personalized ride plans.</p>
          </div>
          <Button onClick={() => setActiveTab('profile')} className="w-full">
            Start Setup
          </Button>
        </Card>
      </div>
    );
  }

  // --- Plan view: Map-dominant layout ---
  const renderPlanView = () => {
    if (selectedRoute) return renderRouteDetail();

    return (
      <div className="flex flex-col lg:flex-row h-[calc(100vh-72px)]">
        {/* Left sidebar — Komoot-style compact panel */}
        <div className={cn(
          "plan-sidebar bg-surface border-r border-[var(--color-border)] z-20",
          // Desktop: fixed width sidebar
          "hidden lg:block lg:w-[340px] lg:flex-shrink-0",
        )}>
          <div className="p-5 space-y-5">
            {/* Route card header — like Komoot's "Your Route" */}
            <div className="flex items-center justify-between">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">Your Ride</h2>
              {(selectedChips.length > 0 || intent || locationInput) && (
                <button onClick={handleClearForm} className="text-[11px] text-text-secondary hover:text-accent underline-offset-2 hover:underline transition-colors">
                  Clear
                </button>
              )}
            </div>

            {/* Ride type selector — pills with icons */}
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary mb-3 block">Ride Type</label>
              <div className="flex flex-wrap gap-2">
                {RIDE_TYPES.map(({ label, icon: Icon }) => (
                  <button
                    key={label}
                    onClick={() => setSelectedChips(prev => prev.includes(label) ? prev.filter(c => c !== label) : [...prev, label])}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                      selectedChips.includes(label)
                        ? "bg-accent border-accent text-white shadow-sm scale-[1.02]"
                        : "bg-surface border-[var(--color-border-strong)] text-text-secondary hover:border-accent/50 hover:bg-bg"
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Vibe textarea */}
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary mb-2 block">Describe Your Ride</label>
              <textarea
                maxLength={280}
                placeholder="Describe your ideal ride..."
                className="w-full p-3 rounded-xl border border-[var(--color-border-strong)] focus:ring-2 focus:ring-primary focus:border-transparent outline-none min-h-[80px] text-sm text-text bg-surface resize-none"
                value={intent}
                onChange={(e) => setIntent(e.target.value)}
              />
              <p className="text-right text-[10px] text-text-secondary mt-1">{intent.length}/280</p>
            </div>

            {/* Location input with autocomplete */}
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary mb-2 block">Location</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search place..."
                  className="w-full p-3 pr-10 rounded-xl border border-[var(--color-border-strong)] focus:ring-2 focus:ring-primary focus:border-transparent outline-none text-sm text-text bg-surface"
                  value={locationInput}
                  onChange={(e) => handleLocationInputChange(e.target.value)}
                  onFocus={() => { if (locationSuggestions.length > 0) setShowSuggestions(true); }}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                />
                <button
                  onClick={handleUseMyLocation}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 hover:bg-bg rounded-lg text-text-secondary hover:text-primary transition-colors"
                  title="Use my location"
                >
                  <Navigation className="w-4 h-4" />
                </button>
                {showSuggestions && locationSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-[var(--color-border-strong)] rounded-xl shadow-lg z-50 overflow-hidden">
                    {locationSuggestions.map((s, i) => (
                      <button
                        key={i}
                        className="w-full text-left px-3 py-2.5 text-sm hover:bg-bg border-b border-[var(--color-border)] last:border-0 text-text"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          const shortName = s.displayName.split(',').slice(0, 2).join(',').trim();
                          setLocationInput(shortName);
                          setMapCenter([s.lat, s.lon]);
                          setShowSuggestions(false);
                          setLocationSuggestions([]);
                        }}
                      >
                        <span className="text-text-secondary mr-1.5"><MapPin className="w-3 h-3 inline" /></span>
                        {s.displayName.split(',').slice(0, 3).join(',')}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Quick suggestions — Komoot style */}
              <div className="mt-2 space-y-1">
                <button
                  onClick={handleUseMyLocation}
                  className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-xs text-text-secondary hover:bg-bg transition-colors"
                >
                  <Navigation className="w-3.5 h-3.5 text-accent" />
                  Current location
                </button>
                {locations.length > 0 && (
                  <button
                    onClick={() => setSpotsExpanded(!spotsExpanded)}
                    className="flex items-center justify-between w-full px-2 py-1.5 rounded-lg text-xs text-text-secondary hover:bg-bg transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <Bookmark className="w-3.5 h-3.5 text-accent" />
                      Saved places
                      <span className="text-[10px] opacity-60">{locations.length}</span>
                    </span>
                    {spotsExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                )}
              </div>

              {/* Expandable saved spots */}
              <AnimatePresence>
                {spotsExpanded && locations.length > 0 && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-1 space-y-0.5 pl-2">
                      {locations.map(loc => (
                        <div key={loc.id} className="flex items-center justify-between group">
                          <button
                            onClick={() => useSpotAsLocation(loc)}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-text hover:bg-bg transition-colors flex-1 text-left"
                          >
                            <MapPin className="w-3 h-3 text-accent shrink-0" />
                            <span className="truncate">{loc.name}</span>
                          </button>
                          <button
                            onClick={() => handleDeleteLocation(loc.id)}
                            className="p-1 opacity-0 group-hover:opacity-100 hover:bg-danger/10 rounded text-danger transition-all"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Generate button */}
            <div title={(!locationInput || selectedChips.length === 0) ? "Select a ride type and enter a location" : undefined}>
              <Button
                onClick={handleGenerate}
                className="w-full py-3"
                variant="accent"
                loading={isGenerating}
                disabled={!locationInput || selectedChips.length === 0}
              >
                {isGenerating
                  ? (generatingTime > 10 ? 'Still working...' : 'Generating your ride...')
                  : 'Generate Ride Plan'}
              </Button>
            </div>

            {/* Loading skeleton */}
            {isGenerating && (
              <div className="space-y-3">
                <div className="h-20 bg-bg rounded-xl animate-pulse" />
                <div className="h-20 bg-bg rounded-xl animate-pulse" style={{ animationDelay: '75ms' }} />
              </div>
            )}

            {/* Route options */}
            {routeOptions.length > 0 && !isGenerating && (
              <div className="space-y-3">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">Route Options</h3>
                {routeOptions.map((option) => (
                  <button
                    key={option.id}
                    className={cn(
                      "w-full text-left p-3 rounded-xl border transition-all",
                      selectedRoute?.id === option.id
                        ? "border-accent ring-1 ring-accent bg-accent/5"
                        : "border-[var(--color-border-strong)] hover:border-accent/50 bg-surface"
                    )}
                    onClick={() => setSelectedRoute(option)}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-bold text-sm text-text">{option.name}</h4>
                        <p className="text-[10px] text-text-secondary mt-0.5">{option.terrain}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-xs text-accent">{option.distance}</p>
                        <p className="text-[10px] text-text-secondary">{option.elevation}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Mobile bottom sheet */}
        <div className="lg:hidden fixed bottom-16 left-0 right-0 z-30">
          <AnimatePresence>
            {mobilePanelOpen && (
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="bg-surface border-t border-[var(--color-border)] rounded-t-2xl shadow-2xl max-h-[60vh] overflow-y-auto"
              >
                <div className="p-4 space-y-4">
                  {/* Drag handle */}
                  <div className="w-10 h-1 bg-text-secondary/20 rounded-full mx-auto" />

                  {/* Compact mobile form */}
                  <div className="flex flex-wrap gap-1.5">
                    {RIDE_TYPES.map(({ label, icon: Icon }) => (
                      <button
                        key={label}
                        onClick={() => setSelectedChips(prev => prev.includes(label) ? prev.filter(c => c !== label) : [...prev, label])}
                        className={cn(
                          "flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium border transition-all",
                          selectedChips.includes(label)
                            ? "bg-accent border-accent text-white"
                            : "bg-surface border-[var(--color-border-strong)] text-text-secondary"
                        )}
                      >
                        <Icon className="w-3 h-3" />
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search place..."
                      className="w-full p-2.5 pr-10 rounded-xl border border-[var(--color-border-strong)] text-sm text-text bg-surface"
                      value={locationInput}
                      onChange={(e) => handleLocationInputChange(e.target.value)}
                    />
                    <button onClick={handleUseMyLocation} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-secondary">
                      <Navigation className="w-4 h-4" />
                    </button>
                  </div>

                  <Button
                    onClick={handleGenerate}
                    className="w-full py-2.5"
                    variant="accent"
                    loading={isGenerating}
                    disabled={!locationInput || selectedChips.length === 0}
                  >
                    {isGenerating ? 'Generating...' : 'Generate Ride Plan'}
                  </Button>

                  {/* Mobile route options */}
                  {routeOptions.length > 0 && !isGenerating && (
                    <div className="space-y-2">
                      {routeOptions.map((option) => (
                        <button
                          key={option.id}
                          className={cn(
                            "w-full text-left p-2.5 rounded-xl border transition-all",
                            selectedRoute?.id === option.id
                              ? "border-accent bg-accent/5"
                              : "border-[var(--color-border-strong)]"
                          )}
                          onClick={() => setSelectedRoute(option)}
                        >
                          <div className="flex justify-between">
                            <span className="font-bold text-xs text-text">{option.name}</span>
                            <span className="text-xs text-accent font-bold">{option.distance}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Mobile panel toggle */}
          <button
            onClick={() => setMobilePanelOpen(!mobilePanelOpen)}
            className="lg:hidden absolute -top-10 left-1/2 -translate-x-1/2 bg-surface border border-[var(--color-border)] rounded-full px-4 py-1.5 shadow-lg text-xs font-medium text-text-secondary"
          >
            {mobilePanelOpen ? 'Hide' : 'Plan a ride'}
          </button>
        </div>

        {/* Map — takes remaining space (dominant) */}
        <div className="flex-1 h-full relative">
          <MapContainer
            center={mapCenter}
            zoom={13}
            className="h-full w-full"
            zoomControl={false}
          >
            <LayersControl position="topright">
              <LayersControl.BaseLayer name="Cycling" checked>
                <TileLayer
                  url="https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png"
                  attribution='<a href="https://www.cyclosm.org">CyclOSM</a>'
                />
              </LayersControl.BaseLayer>
              <LayersControl.BaseLayer name="Standard">
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              </LayersControl.BaseLayer>
              <LayersControl.BaseLayer name="Terrain">
                <TileLayer url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png" />
              </LayersControl.BaseLayer>
              <LayersControl.BaseLayer name="Satellite">
                <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
              </LayersControl.BaseLayer>
            </LayersControl>
            <MapCenterUpdater center={mapCenter} />
            <MapEvents />

            {/* Saved spot markers — accent colored */}
            {locations.map(loc => (
              <Marker key={loc.id} position={[loc.lat, loc.lng]}>
                <Popup>
                  <div className="p-1.5 min-w-[140px]">
                    <div className="flex justify-between items-start mb-1">
                      <h5 className="font-bold text-sm">{loc.name}</h5>
                      <div className="flex gap-1">
                        <button
                          onClick={() => { setEditingLocation(loc); setLocationForm({ name: loc.name, notes: loc.notes }); }}
                          className="p-0.5 hover:bg-zinc-100 rounded text-zinc-500"
                        ><Edit2 className="w-3 h-3" /></button>
                        <button
                          onClick={() => handleDeleteLocation(loc.id)}
                          className="p-0.5 hover:bg-red-50 rounded text-red-500"
                        ><Trash2 className="w-3 h-3" /></button>
                      </div>
                    </div>
                    <p className="text-xs text-zinc-600">{loc.notes}</p>
                    <button
                      onClick={() => useSpotAsLocation(loc)}
                      className="mt-1.5 text-xs text-accent font-medium hover:underline"
                    >Use as ride location</button>
                  </div>
                </Popup>
              </Marker>
            ))}

            {newLocationCoords && (
              <Marker position={[newLocationCoords.lat, newLocationCoords.lng]} />
            )}

            {/* Route polyline + markers */}
            {selectedRoute && (
              <>
                <Polyline positions={selectedRoute.coordinates} color="#D4841A" weight={4} opacity={0.9} />
                <Marker position={selectedRoute.coordinates[0]} />
                <Marker position={selectedRoute.coordinates[selectedRoute.coordinates.length - 1]} />
              </>
            )}
          </MapContainer>

          {/* Map floating controls — onX style right-side buttons */}
          <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2">
            {/* Bookmark/save spot FAB */}
            <button
              onClick={() => {
                setSaveSpotMode(!saveSpotMode);
                if (!saveSpotMode) setToast({ message: 'Click anywhere on the map to save a spot', type: 'success' });
              }}
              className={cn(
                "w-10 h-10 rounded-xl shadow-lg flex items-center justify-center transition-all",
                saveSpotMode
                  ? "bg-accent text-white"
                  : "bg-surface text-text-secondary hover:text-accent border border-[var(--color-border)]"
              )}
              title="Save a spot"
            >
              <BookmarkPlus className="w-5 h-5" />
            </button>

            {/* Locate me */}
            <button
              onClick={handleUseMyLocation}
              className="w-10 h-10 rounded-xl bg-surface border border-[var(--color-border)] shadow-lg flex items-center justify-center text-text-secondary hover:text-primary transition-colors"
              title="My location"
            >
              <Navigation className="w-5 h-5" />
            </button>
          </div>

          {/* Save spot mode indicator */}
          <AnimatePresence>
            {saveSpotMode && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-accent text-white px-4 py-2 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2"
              >
                <MapPin className="w-4 h-4" />
                Click map to save a spot
                <button onClick={() => setSaveSpotMode(false)} className="ml-1 hover:opacity-70"><X className="w-4 h-4" /></button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Save spot form overlay */}
          <AnimatePresence>
            {(newLocationCoords || editingLocation) && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="absolute bottom-6 left-6 z-[1000] w-72"
              >
                <Card className="p-5 shadow-2xl">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-sm text-text">{editingLocation ? 'Edit Spot' : 'Save New Spot'}</h3>
                    <button
                      onClick={() => { setNewLocationCoords(null); setEditingLocation(null); setLocationForm({ name: '', notes: '' }); }}
                      className="text-text-secondary hover:text-text"
                    ><X className="w-4 h-4" /></button>
                  </div>
                  <div className="space-y-3">
                    <input
                      type="text"
                      placeholder="Spot Name"
                      className="w-full p-2.5 rounded-xl border border-[var(--color-border-strong)] text-sm"
                      value={locationForm.name}
                      onChange={(e) => setLocationForm({ ...locationForm, name: e.target.value })}
                    />
                    <textarea
                      placeholder="Notes..."
                      className="w-full p-2.5 rounded-xl border border-[var(--color-border-strong)] text-sm min-h-[60px] resize-none"
                      value={locationForm.notes}
                      onChange={(e) => setLocationForm({ ...locationForm, notes: e.target.value })}
                    />
                    <Button onClick={editingLocation ? handleUpdateLocation : handleSaveLocation} className="w-full" variant="accent">
                      {editingLocation ? 'Update' : 'Save Spot'}
                    </Button>
                  </div>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  };

  // --- Route detail view ---
  const renderRouteDetail = () => {
    if (!selectedRoute) return null;
    return (
      <div className="space-y-6 p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => setSelectedRoute(null)}>
            <ArrowRight className="w-4 h-4 rotate-180" /> Back to Options
          </Button>
          <h2 className="text-xl font-bold text-text">{selectedRoute.name}</h2>
          <Button variant="accent" onClick={() => {}}>Start Ride</Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-[400px] rounded-2xl overflow-hidden border border-[var(--color-border-strong)] shadow-sm">
            <MapContainer center={selectedRoute.coordinates[0]} zoom={14} className="h-full w-full">
              <TileLayer url="https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png" />
              <Polyline positions={selectedRoute.coordinates} color="#D4841A" weight={4} />
              <Marker position={selectedRoute.coordinates[0]} />
              <Marker position={selectedRoute.coordinates[selectedRoute.coordinates.length - 1]} />
            </MapContainer>
          </div>

          <div className="space-y-4">
            <Card className="p-5 space-y-3">
              <div className="flex items-center gap-3">
                <Activity className="w-5 h-5 text-accent" />
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">Stats</p>
                  <p className="text-sm font-bold text-text">{selectedRoute.distance} • {selectedRoute.elevation}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Wind className="w-5 h-5 text-water" />
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">Conditions</p>
                  <p className="text-sm font-bold text-text">{selectedRoute.conditions}</p>
                </div>
              </div>
            </Card>

            <Card className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-text-secondary" />
                <h3 className="font-bold text-sm text-text">Bike Setup</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-bg p-3 rounded-xl">
                  <p className="text-[10px] font-semibold uppercase text-text-secondary">Tire PSI</p>
                  <p className="font-bold text-sm text-text">{selectedRoute.bikeSetup.psi}</p>
                </div>
                <div className="bg-bg p-3 rounded-xl">
                  <p className="text-[10px] font-semibold uppercase text-text-secondary">Suspension</p>
                  <p className="font-bold text-sm text-text">{selectedRoute.bikeSetup.suspension}</p>
                </div>
              </div>
            </Card>
          </div>

          <Card className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-text-secondary" />
              <h3 className="font-bold text-sm text-text">Body Prep</h3>
            </div>
            <ul className="space-y-2">
              {selectedRoute.bodyPrep.map((prep, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-text">
                  <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <span>{prep}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Plus className="w-4 h-4 text-text-secondary" />
              <h3 className="font-bold text-sm text-text">Pack List</h3>
            </div>
            <ul className="space-y-2">
              {selectedRoute.gearList.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-text">
                  <div className="w-1.5 h-1.5 rounded-full bg-accent/40 mt-2 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-5 space-y-3">
            <h3 className="font-bold text-sm text-text">Post-Ride Feedback</h3>
            <div className="space-y-3">
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map(star => (
                  <button
                    key={star}
                    onClick={() => setFeedbackRating(star)}
                    className={cn("transition-colors", star <= feedbackRating ? "text-yellow-400" : "text-zinc-300 hover:text-yellow-300")}
                  >
                    <Star className={cn("w-5 h-5", star <= feedbackRating && "fill-yellow-400")} />
                  </button>
                ))}
              </div>
              <textarea
                placeholder="How was the ride?"
                className="w-full p-3 rounded-xl border border-[var(--color-border-strong)] text-sm min-h-[60px] resize-none text-text"
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
              />
              <Button className="w-full" variant="accent" onClick={handleCompleteRide}>
                Save to History
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-bg">
      {/* Header — compact */}
      <header className="bg-surface border-b border-[var(--color-border)] sticky top-0 z-40 px-4 h-[72px] flex items-center">
        <div className="w-full flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center">
              <Bike className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-lg font-bold tracking-tight text-text">TrailMind</h1>
          </div>
          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1 bg-bg p-1 rounded-xl">
            {(['plan', 'history', 'profile'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-sm font-medium transition-all capitalize",
                  activeTab === tab ? "bg-surface shadow-sm text-primary" : "text-text-secondary hover:text-text"
                )}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Main content */}
      <AnimatePresence mode="wait">
        {activeTab === 'plan' && (
          <motion.div key="plan" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {renderPlanView()}
          </motion.div>
        )}

        {activeTab === 'history' && (
          <motion.div
            key="history"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-6 max-w-5xl mx-auto space-y-6"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-text">Ride History</h2>
              <p className="text-text-secondary text-sm">{rides.length} rides</p>
            </div>

            {rides.length === 0 ? (
              <Card className="p-12 text-center space-y-4">
                <History className="w-12 h-12 text-text-secondary/30 mx-auto" />
                <div className="space-y-2">
                  <h3 className="font-bold text-lg text-text">No rides yet</h3>
                  <p className="text-text-secondary text-sm">Your ride history will appear here after your first plan.</p>
                </div>
                <Button variant="secondary" onClick={() => setActiveTab('plan')}>Plan a Ride</Button>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {rides.map(ride => (
                  <Card key={ride.id} className="p-5 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-[10px] font-semibold text-text-secondary uppercase">{new Date(ride.date).toLocaleDateString()}</p>
                        <h3 className="font-bold text-lg text-text">{ride.distance} miles</h3>
                      </div>
                      <div className="flex gap-0.5">
                        {Array.from({ length: ride.rating || 0 }).map((_, i) => (
                          <Star key={i} className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                        ))}
                      </div>
                    </div>
                    <div className="h-28 bg-bg rounded-xl overflow-hidden">
                      <MapContainer center={ride.route[0]} zoom={12} zoomControl={false} dragging={false} className="h-full w-full">
                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                        <Polyline positions={ride.route} color="#D4841A" weight={3} />
                      </MapContainer>
                    </div>
                    {ride.feedback && (
                      <p className="text-sm text-text-secondary italic">"{ride.feedback}"</p>
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
            className="max-w-2xl mx-auto p-6"
          >
            <Card className="p-8 space-y-8">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-primary rounded-2xl flex items-center justify-center">
                  <User className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-text">User Profile</h2>
                  <p className="text-text-secondary text-sm">Body and bike details</p>
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {[
                    { name: 'height', label: 'Height', placeholder: 'e.g. 180cm' },
                    { name: 'weight', label: 'Weight', placeholder: 'e.g. 75kg' },
                    { name: 'inseam', label: 'Inseam', placeholder: 'e.g. 82cm' },
                    { name: 'homeBase', label: 'Home Base', placeholder: 'City, State' },
                  ].map(field => (
                    <div key={field.name} className="space-y-1.5">
                      <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">{field.label}</label>
                      <input name={field.name} defaultValue={(profile as any)?.[field.name]} placeholder={field.placeholder} className="w-full p-3 rounded-xl border border-[var(--color-border-strong)] text-sm text-text" />
                    </div>
                  ))}
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">Injuries / Limitations</label>
                  <input name="injuries" defaultValue={profile?.injuries.join(', ')} placeholder="e.g. Lower back pain, Left knee surgery" className="w-full p-3 rounded-xl border border-[var(--color-border-strong)] text-sm text-text" />
                </div>

                <hr className="border-[var(--color-border)]" />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">Bike Type</label>
                    <select name="bikeType" defaultValue={profile?.bikeType} className="w-full p-3 rounded-xl border border-[var(--color-border-strong)] text-sm text-text">
                      <option>Mountain Bike</option>
                      <option>Gravel Bike</option>
                      <option>Road Bike</option>
                      <option>E-Bike</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">Wheel Size</label>
                    <input name="wheelSize" defaultValue={profile?.wheelSize} placeholder="e.g. 29 inch" className="w-full p-3 rounded-xl border border-[var(--color-border-strong)] text-sm text-text" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">Suspension</label>
                    <input name="suspension" defaultValue={profile?.suspension} placeholder="e.g. Full 140mm" className="w-full p-3 rounded-xl border border-[var(--color-border-strong)] text-sm text-text" />
                  </div>
                </div>

                <Button type="submit" className="w-full py-3.5" variant="primary">
                  <Save className="w-4 h-4" /> Save Profile
                </Button>
              </form>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Nav — Mobile only */}
      <div className="fixed bottom-0 left-0 right-0 bg-surface border-t border-[var(--color-border)] px-6 py-2.5 flex justify-around md:hidden z-50">
        {([
          { tab: 'plan' as const, icon: MapIcon, label: 'Plan' },
          { tab: 'history' as const, icon: History, label: 'History' },
          { tab: 'profile' as const, icon: User, label: 'Profile' },
        ]).map(({ tab, icon: Icon, label }) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn("flex flex-col items-center gap-0.5", activeTab === tab ? "text-accent" : "text-text-secondary")}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[9px] font-semibold uppercase tracking-wider">{label}</span>
          </button>
        ))}
      </div>

      {/* Toast notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className={cn(
              "fixed bottom-20 left-1/2 -translate-x-1/2 z-[9999] px-5 py-2.5 rounded-xl shadow-lg text-sm font-medium max-w-sm text-center",
              toast.type === 'error' ? "bg-danger text-white" : "bg-primary text-white"
            )}
          >
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
