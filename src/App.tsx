import React, { useState, useEffect, useRef } from 'react';
import { 
  MapContainer, 
  TileLayer, 
  Marker, 
  Popup, 
  Polyline, 
  useMapEvents,
  useMap
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
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { UserProfile, SavedLocation, RideHistory, RouteOption } from './types';
import { generateRidePlan } from './services/gemini';

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
    primary: "bg-zinc-900 text-white hover:bg-zinc-800 disabled:bg-zinc-300",
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

  const chips = ["Commute", "Trail Ride", "Fishing Access", "Training", "Casual"];

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

  const handleGenerate = async () => {
    if (!profile) return;
    setIsGenerating(true);
    try {
      const fullIntent = `${selectedChips.join(', ')} ${intent}`.trim();
      const options = await generateRidePlan(fullIntent, locationInput, profile, locations, rides);
      setRouteOptions(options);
      setSelectedRoute(options[0]);
    } catch (err) {
      console.error("Generation failed", err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCompleteRide = (feedback: string, rating: number) => {
    if (!selectedRoute) return;
    const newRide: RideHistory = {
      id: Math.random().toString(36).substr(2, 9),
      date: new Date().toISOString(),
      route: selectedRoute.coordinates,
      distance: parseFloat(selectedRoute.distance),
      elevation: parseFloat(selectedRoute.elevation),
      feedback,
      rating
    };

    const updated = [newRide, ...rides];
    setRides(updated);
    localStorage.setItem('trailmind_rides', JSON.stringify(updated));
    setSelectedRoute(null);
    setRouteOptions([]);
    setActiveTab('history');
  };

  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-zinc-50">
      <div className="flex flex-col items-center gap-4">
        <Bike className="w-12 h-12 text-zinc-900 animate-bounce" />
        <p className="text-zinc-500 font-medium">Loading TrailMind...</p>
      </div>
    </div>
  );

  if (!profile && activeTab !== 'profile') {
    return (
      <div className="min-h-screen bg-zinc-50 p-6 flex items-center justify-center">
        <Card className="max-w-md w-full p-8 text-center space-y-6">
          <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mx-auto">
            <User className="w-8 h-8 text-zinc-900" />
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
    <div className="min-h-screen bg-zinc-50 pb-24">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-50 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-zinc-900 rounded-xl flex items-center justify-center">
              <Bike className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">TrailMind</h1>
          </div>
          <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-xl">
            <button 
              onClick={() => setActiveTab('plan')}
              className={cn("px-4 py-1.5 rounded-lg text-sm font-medium transition-all", activeTab === 'plan' ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500 hover:text-zinc-900")}
            >
              Plan
            </button>
            <button 
              onClick={() => setActiveTab('history')}
              className={cn("px-4 py-1.5 rounded-lg text-sm font-medium transition-all", activeTab === 'history' ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500 hover:text-zinc-900")}
            >
              History
            </button>
            <button 
              onClick={() => setActiveTab('profile')}
              className={cn("px-4 py-1.5 rounded-lg text-sm font-medium transition-all", activeTab === 'profile' ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500 hover:text-zinc-900")}
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
                        <label className="text-sm font-semibold uppercase tracking-wider text-zinc-400">Intent</label>
                        <div className="flex flex-wrap gap-2">
                          {chips.map(chip => (
                            <button
                              key={chip}
                              onClick={() => setSelectedChips(prev => prev.includes(chip) ? prev.filter(c => c !== chip) : [...prev, chip])}
                              className={cn(
                                "px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                                selectedChips.includes(chip) 
                                  ? "bg-zinc-900 border-zinc-900 text-white" 
                                  : "bg-white border-zinc-200 text-zinc-600 hover:border-zinc-400"
                              )}
                            >
                              {chip}
                            </button>
                          ))}
                        </div>
                        <textarea 
                          placeholder="What's the vibe today? (e.g. 'I want to hit some flowy trails and end at the lake')"
                          className="w-full p-4 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-zinc-900 focus:border-transparent outline-none min-h-[100px] text-sm"
                          value={intent}
                          onChange={(e) => setIntent(e.target.value)}
                        />
                      </div>

                      <div className="space-y-4">
                        <label className="text-sm font-semibold uppercase tracking-wider text-zinc-400">Location</label>
                        <input 
                          type="text"
                          placeholder="Where are we riding?"
                          className="w-full p-4 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-zinc-900 focus:border-transparent outline-none text-sm"
                          value={locationInput}
                          onChange={(e) => setLocationInput(e.target.value)}
                        />
                      </div>

                      <Button 
                        onClick={handleGenerate} 
                        className="w-full py-4"
                        loading={isGenerating}
                        disabled={!locationInput && !intent}
                      >
                        Generate Ride Plan
                      </Button>
                    </Card>

                    {routeOptions.length > 0 && (
                      <div className="space-y-4">
                        <h3 className="font-bold text-lg">Route Options</h3>
                        {routeOptions.map((option, idx) => (
                          <Card 
                            key={option.id} 
                            className={cn(
                              "p-4 cursor-pointer hover:border-zinc-400 transition-all",
                              selectedRoute?.id === option.id && "border-zinc-900 ring-1 ring-zinc-900"
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
                      center={[45.523062, -122.676482]} 
                      zoom={13} 
                      className="h-full w-full"
                    >
                      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
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
                                <Plus className="w-5 h-5 rotate-45" />
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

                    <div className="absolute top-4 right-4 z-[1000] bg-white/90 backdrop-blur p-3 rounded-xl border border-zinc-200 shadow-lg max-w-[200px]">
                      <p className="text-[10px] font-bold uppercase text-zinc-400 mb-1">Status</p>
                      <p className="text-xs font-medium">Click map to save a new spot</p>
                    </div>
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
                        <Polyline positions={selectedRoute.coordinates} color="#18181b" weight={4} />
                        <Marker position={selectedRoute.coordinates[0]} />
                        <Marker position={selectedRoute.coordinates[selectedRoute.coordinates.length - 1]} />
                      </MapContainer>
                    </div>

                    {/* Stats & Setup */}
                    <div className="space-y-6">
                      <Card className="p-6 space-y-4">
                        <div className="flex items-center gap-3">
                          <Activity className="w-5 h-5 text-zinc-400" />
                          <div>
                            <p className="text-[10px] font-bold uppercase text-zinc-400">Stats</p>
                            <p className="text-sm font-bold">{selectedRoute.distance} • {selectedRoute.elevation}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Wind className="w-5 h-5 text-zinc-400" />
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
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
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
                            <div className="w-1.5 h-1.5 rounded-full bg-zinc-300 mt-2 shrink-0" />
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
                            <button key={star} className="text-zinc-300 hover:text-yellow-400">
                              <Star className="w-6 h-6" />
                            </button>
                          ))}
                        </div>
                        <textarea 
                          placeholder="How was the ride? Any issues with the route or bike setup?"
                          className="w-full p-4 rounded-xl border border-zinc-200 text-sm min-h-[80px]"
                        />
                        <Button className="w-full" onClick={() => handleCompleteRide("Great ride!", 5)}>
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
                        <Polyline positions={ride.route} color="#18181b" weight={3} />
                      </MapContainer>
                    </div>
                    {ride.feedback && (
                      <p className="text-sm text-zinc-600 italic">"{ride.feedback}"</p>
                    )}
                  </Card>
                ))}
              </div>
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
                  <div className="w-16 h-16 bg-zinc-900 rounded-2xl flex items-center justify-center">
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

      {/* Bottom Nav (Mobile) */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-zinc-200 px-6 py-3 flex justify-around md:hidden z-50">
        <button onClick={() => setActiveTab('plan')} className={cn("flex flex-col items-center gap-1", activeTab === 'plan' ? "text-zinc-900" : "text-zinc-400")}>
          <MapIcon className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase">Plan</span>
        </button>
        <button onClick={() => setActiveTab('history')} className={cn("flex flex-col items-center gap-1", activeTab === 'history' ? "text-zinc-900" : "text-zinc-400")}>
          <History className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase">History</span>
        </button>
        <button onClick={() => setActiveTab('profile')} className={cn("flex flex-col items-center gap-1", activeTab === 'profile' ? "text-zinc-900" : "text-zinc-400")}>
          <User className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase">Profile</span>
        </button>
      </div>
    </div>
  );
}
