import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** true quando as credenciais do Supabase estão configuradas (.env.local). */
export const isSupabaseConfigured = Boolean(url && anonKey);

/**
 * Cliente Supabase. É `null` quando não configurado — o app continua
 * funcionando 100% offline (local-first) e o sync fica desativado.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;
