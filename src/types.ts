export interface UserProfile {
  height: string;
  weight: string;
  inseam: string;
  injuries: string[];
  bikeType: string;
  wheelSize: string;
  suspension: string;
  homeBase: string;
}

export interface SavedLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  notes: string;
}

export interface RideHistory {
  id: string;
  date: string;
  route: [number, number][];
  distance: number;
  elevation: number;
  feedback?: string;
  rating?: number;
}

export interface RouteOption {
  id: string;
  name: string;
  distance: string;
  elevation: string;
  terrain: string;
  conditions: string;
  coordinates: [number, number][];
  bikeSetup: {
    psi: string;
    suspension: string;
  };
  bodyPrep: string[];
  gearList: string[];
}
