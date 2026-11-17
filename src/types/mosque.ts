export type UserRole = 'admin' | 'documenter';

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt?: Date | null;
  createdBy: string;
}

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
  googleMapsStatus: GoogleMapsStatus;
  googleMapsSubmittedAt: Date | null;
  googleMapsSubmittedByName: string;
  hasPendingWrites?: boolean;
}

export type GoogleMapsStatus = 'not_submitted' | 'submitted' | 'live';

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

export interface GoogleMosqueCandidate {
  placeId: string;
  displayName: string;
  formattedAddress: string;
  googleMapsUri: string;
  businessStatus: string;
  lat: number;
  lng: number;
}

export interface GooglePlacePhotoItem {
  thumbUrl: string;
  fullUrl: string;
  attributions: { displayName: string; uri: string }[];
}

export interface GooglePlaceReviewItem {
  rating: number | null;
  text: string;
  relativeTime: string;
  authorName: string;
  authorUri: string;
}

export interface GooglePlaceRichDetails extends GoogleMosqueCandidate {
  categoryLabel: string;
  plusCode: string;
  phoneNumber: string;
  websiteUri: string;
  rating: number | null;
  userRatingCount: number;
  weekdayDescriptions: string[];
  editorialSummary: string;
  photos: GooglePlacePhotoItem[];
  reviews: GooglePlaceReviewItem[];
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

export interface GoogleSheetsConfig {
  spreadsheetId: string;
  spreadsheetTitle: string;
  spreadsheetUrl: string;
  sheetName: string;
  lastSyncedCount: number;
  lastSyncedAt: Date | null;
  lastSyncedBy: string;
}

export type ActiveTab = 'add' | 'list' | 'users';
