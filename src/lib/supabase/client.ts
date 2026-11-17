import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import supabaseConfig from '../../../supabase-config.json';

// The anon (publishable) key is safe to ship to browsers: every table is
// protected by Row Level Security policies in supabase/schema.sql.
const SUPABASE_URL = (
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
  supabaseConfig.url ||
  ''
).trim();

const SUPABASE_ANON_KEY = (
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
  supabaseConfig.anonKey ||
  ''
).trim();

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase: SupabaseClient = createClient(
  SUPABASE_URL || 'https://not-configured.supabase.co',
  SUPABASE_ANON_KEY || 'not-configured',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  }
);

/**
 * Isolated client that never stores a session, so an admin can create a
 * documenter account without being signed out of their own session.
 */
export function createProvisioningClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: 'sb-staff-provisioning',
    },
  });
}
