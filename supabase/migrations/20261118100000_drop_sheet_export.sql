-- Google Sheets sync was dropped; data stays in Supabase and is exported to Excel from the app.
drop function if exists public.sheet_export(text);
drop table if exists public.integration_secrets;
