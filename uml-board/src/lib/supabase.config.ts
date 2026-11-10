import { createClient } from '@supabase/supabase-js';
import type { Database } from './types/database.types';

interface SupabaseError {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
}

// Configuración de Supabase (proyecto propio). La clave anon es pública por diseño.
// Se pueden sobrescribir con VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en uml-board/.env.local
export const SUPABASE_URL: string =
  import.meta.env.VITE_SUPABASE_URL || 'https://TU-PROYECTO.supabase.co';
export const SUPABASE_ANON_KEY: string =
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'TU_CLAVE_ANON';

// Edge Function que reenvía las peticiones a OpenAI (el token vive en Supabase, no aquí)
export const OPENAI_PROXY_URL = `${SUPABASE_URL}/functions/v1/openai-proxy`;

const supabaseUrl = SUPABASE_URL;
const supabaseKey = SUPABASE_ANON_KEY;

// Crear cliente de Supabase con tipos
export const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

// Tipos de utilidad para el cliente
export type SupabaseClient = typeof supabase;

// Configuración de tiempo real
export const realtimeConfig = {
  heartbeatIntervalMs: 30000,
  timeoutMs: 10000,
};

// Utilidades de error
export const handleSupabaseError = (error: SupabaseError | Error | unknown, context: string) => {
  console.error(`❌ Error en ${context}:`, error);
  const message =
    error instanceof Error
      ? error.message
      : (error as SupabaseError)?.message || 'Error desconocido';
  throw new Error(`Error en ${context}: ${message}`);
};

export default supabase;
