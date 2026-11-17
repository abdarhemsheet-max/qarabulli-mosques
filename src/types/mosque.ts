export type UserRole = 'admin' | 'documenter';

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt?: Date | null;
  createdBy: string;
}

/**
 * none      – not on OpenStreetMap
 * linked    – exists on OpenStreetMap (found there) but not updated by the office yet
 * published – the office published/updated it on OpenStreetMap
 */
export type MapStatus = 'none' | 'linked' | 'published';

export interface MosqueRecord {
  id: string;
  officialName: string;
  commonName: string;
  locality: string;
  landmark: string;
  notes: string;
  mapsUrl: string;
  lat: number;
  lng: number;
  accuracy: number;
  photos: string[];
  photoCount: number;
  osmId?: string;
  googlePlaceId?: string;
  createdBy: string;
  createdByName: string;
  createdAt: Date | null;
  updatedAt: Date | null;
  updatedBy: string;
  mapStatus: MapStatus;
  osmPublishedAt: Date | null;
  osmPublishedByName: string;
  hasPendingWrites?: boolean;
}

export interface OsmMosqueCandidate {
  osmId: string;
  osmType: 'node' | 'way' | 'relation';
  osmNumericId: number;
  name: string;
  nameAr: string;
  nameRaw: string;
  tags: Record<string, string>;
  lat: number;
  lng: number;
}

export interface MosqueFormValues {
  officialName: string;
  commonName: string;
  locality: string;
  landmark: string;
  notes: string;
  lat: number;
  lng: number;
  accuracy: number;
  photos: string[];
  osmId?: string;
  googlePlaceId?: string;
}

export interface OsmSettings {
  osmPublishEnabled: boolean;
  osmUseProduction: boolean;
}

export type ActiveTab = 'map' | 'list' | 'admin';

export interface LatLng {
  lat: number;
  lng: number;
}
