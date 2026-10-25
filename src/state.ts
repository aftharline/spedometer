import type { RideState } from './types';

export const appState = {
  currentVehicleId: null as string | null,
  currentLat: null as number | null,
  currentLng: null as number | null,
};

export const rideState: RideState = {
  speed: 0,
  maxSpeed: 0,
  lean: 0,
  g: 1,
  gx: 0,
  gy: 0,
  heading: 0,
  gpsAcc: null,
  sensor: 'IDLE',
  vib: 0,
  slope: 0,
  corners: 0,
  bankMax: 0,
  batt: null,
  battPer10km: null,
};

export function updateRideState(patch: Partial<RideState>): void {
  Object.assign(rideState, patch);
  window.dispatchEvent(new CustomEvent('ride3d:update', { detail: { ...rideState } }));
}
