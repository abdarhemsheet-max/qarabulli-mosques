import type {
  GoogleMosqueCandidate,
  GooglePlacePhotoItem,
  GooglePlaceReviewItem,
  GooglePlaceRichDetails,
} from '../../types/mosque';
import { generateGoogleMapsUrl, QARABULLI_CENTER } from '../utils/geo';

export const GMP_ATTRIBUTION_ID = 'gmp_mcp_codeassist_v1_aistudio';

const PLACE_SEARCH_FIELDS = [
  'displayName',
  'location',
  'formattedAddress',
  'googleMapsURI',
  'businessStatus',
  'primaryType',
  'types',
];

const PLACE_RICH_DETAIL_FIELDS = [
  ...PLACE_SEARCH_FIELDS,
  'primaryTypeDisplayName',
  'plusCode',
  'nationalPhoneNumber',
  'internationalPhoneNumber',
  'websiteURI',
  'rating',
  'userRatingCount',
  'regularOpeningHours',
  'editorialSummary',
  'photos',
  'reviews',
];

const richDetailsSessionCache: Record<string, GooglePlaceRichDetails> = {};

const EXCLUDED_NON_MOSQUE_TYPES = new Set([
  'church',
  'synagogue',
  'hindu_temple',
  'buddhist_temple',
  'cemetery',
  'funeral_home',
  'school',
  'university',
  'restaurant',
  'cafe',
  'bakery',
  'store',
  'supermarket',
  'shopping_mall',
  'hospital',
  'pharmacy',
  'doctor',
  'dentist',
  'gas_station',
  'bank',
  'atm',
  'lodging',
  'hotel',
  'park',
  'car_repair',
  'car_dealer',
]);

const QARABULLI_SCAN_SECTORS: Array<{ center: { lat: number; lng: number }; radius: number }> = [
  { center: QARABULLI_CENTER, radius: 6000 },
  { center: { lat: 32.775, lng: 14.21 }, radius: 6500 },
  { center: { lat: 32.765, lng: 14.37 }, radius: 6500 },
  { center: { lat: 32.695, lng: 14.29 }, radius: 6500 },
];

export function isGoogleMosquePlace(place: google.maps.places.Place): boolean {
  const primary = (place.primaryType ?? '').toLowerCase();
  const types = Array.isArray(place.types)
    ? place.types.map((t) => String(t).toLowerCase())
    : [];
  const name = (place.displayName ?? '').trim();

  if (primary === 'mosque' || types.includes('mosque')) {
    return true;
  }

  if (
    (primary === 'place_of_worship' || types.includes('place_of_worship')) &&
    !types.some((t) => EXCLUDED_NON_MOSQUE_TYPES.has(t)) &&
    /مسجد|جامع|مصلى|زاوية|mosque|masjid|jami/i.test(name)
  ) {
    return true;
  }

  return false;
}

function checkAndEmitPlacesQuotaError(err: unknown): boolean {
  const raw =
    err instanceof Error
      ? `${err.name} ${err.message}`
      : typeof err === 'object' && err !== null
        ? JSON.stringify(err)
        : String(err);

  if (
    raw.includes('RESOURCE_EXHAUSTED') ||
    raw.includes('OVER_QUERY_LIMIT') ||
    raw.includes('QuotaExceeded') ||
    /\b429\b/.test(raw)
  ) {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
    return true;
  }
  return false;
}

export function mapPlaceToCandidate(
  place: google.maps.places.Place
): GoogleMosqueCandidate | null {
  if (!place.location || !place.id) return null;
  const lat =
    typeof place.location.lat === 'function'
      ? place.location.lat()
      : Number((place.location as unknown as { lat: number }).lat);
  const lng =
    typeof place.location.lng === 'function'
      ? place.location.lng()
      : Number((place.location as unknown as { lng: number }).lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return {
    placeId: place.id,
    displayName: (place.displayName ?? '').trim(),
    formattedAddress: (place.formattedAddress ?? '').trim(),
    googleMapsUri:
      (place.googleMapsURI ?? '').trim() ||
      generateGooglePlaceUrl(lat, lng, place.id),
    businessStatus: String(place.businessStatus ?? ''),
    lat,
    lng,
  };
}

export function generateGooglePlaceUrl(
  lat: number,
  lng: number,
  placeId?: string
): string {
  if (placeId) {
    return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}&query_place_id=${encodeURIComponent(placeId)}`;
  }
  return generateGoogleMapsUrl(lat, lng);
}

export async function searchNearbyGoogleMosques(
  placesLib: google.maps.PlacesLibrary,
  center: { lat: number; lng: number } = QARABULLI_CENTER,
  radiusMeters = 12000
): Promise<GoogleMosqueCandidate[]> {
  try {
    const safeRadius = Math.min(Math.max(radiusMeters, 500), 50000);
    const { places } = await placesLib.Place.searchNearby({
      fields: PLACE_SEARCH_FIELDS,
      locationRestriction: {
        center,
        radius: safeRadius,
      },
      includedPrimaryTypes: ['mosque'],
      maxResultCount: 20,
      language: 'ar',
      region: 'LY',
      internalUsageAttributionIds: [GMP_ATTRIBUTION_ID],
    });

    if (!Array.isArray(places)) return [];
    return places
      .filter(isGoogleMosquePlace)
      .map(mapPlaceToCandidate)
      .filter((c): c is GoogleMosqueCandidate => c !== null);
  } catch (err) {
    checkAndEmitPlacesQuotaError(err);
    throw err;
  }
}

export async function searchQarabulliGoogleMosques(
  placesLib: google.maps.PlacesLibrary
): Promise<GoogleMosqueCandidate[]> {
  const settled = await Promise.allSettled(
    QARABULLI_SCAN_SECTORS.map((sector) =>
      searchNearbyGoogleMosques(placesLib, sector.center, sector.radius)
    )
  );

  const byId: Record<string, GoogleMosqueCandidate> = {};
  let anySucceeded = false;
  let firstError: unknown = null;

  for (const res of settled) {
    if (res.status === 'fulfilled') {
      anySucceeded = true;
      for (const item of res.value) {
        if (!byId[item.placeId]) {
          byId[item.placeId] = item;
        }
      }
    } else if (!firstError) {
      firstError = res.reason;
    }
  }

  if (!anySucceeded && firstError) {
    throw firstError;
  }

  return Object.values(byId);
}

export async function searchGoogleMosquesByText(
  placesLib: google.maps.PlacesLibrary,
  textQuery: string,
  center: { lat: number; lng: number } = QARABULLI_CENTER
): Promise<GoogleMosqueCandidate[]> {
  const trimmed = textQuery.trim();
  if (!trimmed) return [];

  try {
    const { places } = await placesLib.Place.searchByText({
      textQuery: trimmed,
      fields: PLACE_SEARCH_FIELDS,
      includedType: 'mosque',
      locationBias: {
        center,
        radius: 20000,
      },
      maxResultCount: 20,
      language: 'ar',
      region: 'LY',
      internalUsageAttributionIds: [GMP_ATTRIBUTION_ID],
    });

    if (!Array.isArray(places)) return [];
    return places
      .filter(isGoogleMosquePlace)
      .map(mapPlaceToCandidate)
      .filter((c): c is GoogleMosqueCandidate => c !== null);
  } catch (err) {
    checkAndEmitPlacesQuotaError(err);
    throw err;
  }
}

export async function fetchGooglePlaceDetails(
  placesLib: google.maps.PlacesLibrary,
  placeId: string
): Promise<{ candidate: GoogleMosqueCandidate; isMosqueType: boolean } | null> {
  try {
    const place = new placesLib.Place({
      id: placeId,
      requestedLanguage: 'ar',
    });
    await place.fetchFields({
      fields: PLACE_SEARCH_FIELDS,
    });
    const candidate = mapPlaceToCandidate(place);
    if (!candidate) return null;
    const isMosqueType = isGoogleMosquePlace(place);
    return { candidate, isMosqueType };
  } catch (err) {
    checkAndEmitPlacesQuotaError(err);
    return null;
  }
}

export async function fetchGooglePlaceRichDetails(
  placesLib: google.maps.PlacesLibrary,
  placeId: string
): Promise<GooglePlaceRichDetails | null> {
  if (!placeId) return null;
  if (richDetailsSessionCache[placeId]) {
    return richDetailsSessionCache[placeId];
  }

  try {
    const place = new placesLib.Place({
      id: placeId,
      requestedLanguage: 'ar',
    });
    await place.fetchFields({
      fields: PLACE_RICH_DETAIL_FIELDS,
    });

    const base = mapPlaceToCandidate(place);
    if (!base) return null;

    const photos: GooglePlacePhotoItem[] = Array.isArray(place.photos)
      ? place.photos.slice(0, 10).map((photo) => {
          const attributions = Array.isArray(photo.authorAttributions)
            ? photo.authorAttributions
                .map((attr) => ({
                  displayName: (attr.displayName ?? '').trim(),
                  uri: (attr.uri ?? '').trim(),
                }))
                .filter((a) => Boolean(a.displayName))
            : [];
          return {
            thumbUrl: photo.getURI({ maxWidth: 480 }),
            fullUrl: photo.getURI({ maxWidth: 1000 }),
            attributions,
          };
        })
      : [];

    const reviews: GooglePlaceReviewItem[] = Array.isArray(place.reviews)
      ? place.reviews
          .slice(0, 5)
          .map((rev) => ({
            rating: typeof rev.rating === 'number' ? rev.rating : null,
            text: (rev.text ?? '').trim(),
            relativeTime: (rev.relativePublishTimeDescription ?? '').trim(),
            authorName: (rev.authorAttribution?.displayName ?? '').trim(),
            authorUri: (rev.authorAttribution?.uri ?? '').trim(),
          }))
          .filter((r) => Boolean(r.text || r.rating !== null))
      : [];

    const rich: GooglePlaceRichDetails = {
      ...base,
      categoryLabel: (place.primaryTypeDisplayName ?? '').trim() || 'مسجد',
      plusCode:
        (place.plusCode?.compoundCode ?? place.plusCode?.globalCode ?? '').trim(),
      phoneNumber:
        (place.nationalPhoneNumber ?? place.internationalPhoneNumber ?? '').trim(),
      websiteUri: (place.websiteURI ?? '').trim(),
      rating: typeof place.rating === 'number' ? place.rating : null,
      userRatingCount:
        typeof place.userRatingCount === 'number' ? place.userRatingCount : 0,
      weekdayDescriptions: Array.isArray(
        place.regularOpeningHours?.weekdayDescriptions
      )
        ? [...place.regularOpeningHours.weekdayDescriptions]
        : [],
      editorialSummary: (place.editorialSummary ?? '').trim(),
      photos,
      reviews,
    };

    richDetailsSessionCache[placeId] = rich;
    return rich;
  } catch (err) {
    checkAndEmitPlacesQuotaError(err);
    return null;
  }
}
