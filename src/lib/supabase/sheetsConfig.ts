import type { GoogleSheetsConfig, UserProfile } from '../../types/mosque';

// Google Sheets sync is disabled in the Supabase (email/password) setup.
// Kept as no-op stubs so the existing Sheets UI module still compiles.

export function subscribeGoogleSheetsConfig(
  onData: (config: GoogleSheetsConfig | null) => void,
  _onError?: (err: Error) => void
): () => void {
  onData(null);
  return () => {};
}

export async function saveGoogleSheetsConfig(
  _params: {
    spreadsheetId: string;
    spreadsheetTitle: string;
    spreadsheetUrl: string;
    sheetName: string;
    lastSyncedCount: number;
  },
  _user: UserProfile
): Promise<void> {
  /* no-op */
}
