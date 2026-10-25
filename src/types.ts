export type VehicleType = 'motor' | 'mobil';

export interface Vehicle {
  id: string;
  type: VehicleType;
  name: string;
  brand: string;
}

export interface LogEntry {
  id?: number;
  vehicleId: string;
  logType: 'service' | 'fuel';
  date: string;
  odo: number;
  parts?: string;
  liter?: number;
  cost: number;
  eff?: string | null;
}

export interface ChecklistItem {
  id?: number;
  text: string;
  done: boolean;
}

export interface RideState {
  speed: number;
  maxSpeed: number;
  lean: number;
  g: number;
  gx: number;
  gy: number;
  heading: number;
  gpsAcc: number | null;
  sensor: string;
  vib: number;
  slope: number;
  corners: number;
  bankMax: number;
  batt: number | null;
  battPer10km: number | null;
}

export interface GpsPoint {
  lat: number;
  lng: number;
  t: number;
  acc: number;
}

export interface RidePoint {
  lat: number;
  lng: number;
  t: number;
  alt: number | null;
  spd: number;
}

export interface Ride {
  id?: number;
  vehicleId: string;
  name: string;
  start: number;
  end: number;
  distKm: number;
  movingSec: number;
  avgKmh: number;
  maxKmh: number;
  gainM: number;
  vibMax?: number;
  corners?: number;
  bankMax?: number;
  points: RidePoint[];
}
