# Security Specification — Al-Qarabulli Awqaf Mosque Documentation

## 1. Data Invariants
1. **Closed Authentication Boundary**: Unauthenticated requests (`request.auth == null`) are denied all read and write access across all collections.
2. **Staff Provisioning Integrity**: Only an authenticated `admin` (or verified bootstrapped admin) can create or update `/users/{userId}` documents. A `documenter` cannot self-elevate `role` to `admin`, and self-registration is blocked.
3. **Mosque Ownership & RBAC**:
   - Every `/mosques/{mosqueId}` document must bind `createdBy` strictly to `request.auth.uid` on creation (`isValidMosque`).
   - Only the creator (`existing().createdBy == request.auth.uid`) or an `admin` can update or delete a mosque record.
   - `createdBy` and `createdAt` are immutable after creation.
4. **Volumetric & Payload Integrity**:
   - All document IDs match `^[a-zA-Z0-9_\-]+$` and are `<= 128` chars.
   - `officialName` (`1..150`), `commonName` (`0..150`), `locality` (`1..100`), `landmark` (`0..200`), `notes` (`0..500`), `mapsUrl` matches Google Maps URL pattern (`25..150`), optional `osmId` (`0..64`) and `googlePlaceId` (`0..128`) match `^[a-zA-Z0-9_\-]*$`.
   - `photos` array strictly bounded `<= 3`, `photoCount == photos.size()`, each photo `<= 300000` bytes.
   - Timestamps `createdAt` and `updatedAt` must equal `request.time`.
5. **PII Isolation**: `/users/{userId}` contains `email`; `get` is restricted to `isOwner(userId) || isAdmin()`, and `list` is restricted to `isAdmin()`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated Read**: `auth = null` reads `/mosques/m1` -> `PERMISSION_DENIED`.
2. **Unauthenticated Write**: `auth = null` creates `/mosques/m1` -> `PERMISSION_DENIED`.
3. **Self-Registration Escalation**: Random auth user (no `users/{uid}` doc) creates `/users/{uid}` with `role: "admin"` -> `PERMISSION_DENIED`.
4. **Documenter Privilege Escalation**: Documenter updates `/users/{ownUid}` changing `role` to `"admin"` -> `PERMISSION_DENIED`.
5. **Cross-Owner Mosque Update**: Documenter A updates `/mosques/m_owned_by_B` -> `PERMISSION_DENIED`.
6. **Cross-Owner Mosque Delete**: Documenter A deletes `/mosques/m_owned_by_B` -> `PERMISSION_DENIED`.
7. **Identity Spoofing on Create**: Documenter A creates `/mosques/m2` with `createdBy: "documenter_B_uid"` -> `PERMISSION_DENIED`.
8. **Shadow Field Injection**: Documenter A creates `/mosques/m2` with extra field `isApproved: true` -> `PERMISSION_DENIED`.
9. **Immutable Field Tampering**: Documenter A updates own mosque changing `createdBy` or `createdAt` -> `PERMISSION_DENIED`.
10. **Photo Array Overflow / Oversized Payload**: Documenter A creates mosque with 4 photos or 400KB string -> `PERMISSION_DENIED`.
11. **Path ID Poisoning**: User creates `/mosques/../../evil` or 200-char ID -> `PERMISSION_DENIED`.
12. **Client Timestamp Forgery**: User creates mosque with `createdAt: Timestamp(2020-01-01)` instead of `serverTimestamp()` -> `PERMISSION_DENIED`.

## 3. Red Team Audit Notes
- **Email Spoofing Check**: Bootstrapped admin email check strictly requires `request.auth.token.email_verified == true`.
- **PII Check**: `/users/{userId}` `get` restricted to owner or admin; `list` restricted to admin.
- **Query Check**: `allow list` on `/mosques` requires `isSignedIn()` and explicitly validates `resource.data.createdBy is string` and `resource.data.officialName is string` without `get()`/`exists()` inside `allow list`.
- **Action-Based Updates**: `/mosques` update validates `isValidMosque(incoming())` first, checks `createdBy == existing().createdBy` and `createdAt == existing().createdAt`, and restricts `affectedKeys().hasOnly(...)` to the exact mutable fields.
